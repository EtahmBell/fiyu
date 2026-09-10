create table if not exists public.fiyu_together_sessions (
  id uuid primary key default gen_random_uuid(),
  initiator_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid references auth.users(id) on delete cascade,
  invite_token_hash text not null unique check (char_length(invite_token_hash) = 64),
  status text not null check (status in ('pending', 'generated', 'expired', 'cancelled')),
  city_id text not null default 'tokyo',
  cycle_id text not null,
  cycle_expires_at timestamptz not null,
  location_mode text not null check (location_mode in ('current', 'preview', 'manual')),
  location_label text,
  location_latitude double precision not null check (location_latitude between -90 and 90),
  location_longitude double precision not null check (location_longitude between -180 and 180),
  selection_metadata jsonb not null default '{}'::jsonb,
  consumed_trial boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  generated_at timestamptz,
  cancelled_at timestamptz,
  unique(id, initiator_user_id),
  check (invitee_user_id is null or invitee_user_id <> initiator_user_id)
);

create table if not exists public.fiyu_together_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consumed_at timestamptz,
  consumed_session_id uuid references public.fiyu_together_sessions(id) on delete set null
);

create unique index if not exists fiyu_together_one_pending_invite
  on public.fiyu_together_sessions(initiator_user_id)
  where status = 'pending';
create index if not exists fiyu_together_participant_cycle_initiator
  on public.fiyu_together_sessions(initiator_user_id, cycle_expires_at desc)
  where status = 'generated';
create index if not exists fiyu_together_participant_cycle_invitee
  on public.fiyu_together_sessions(invitee_user_id, cycle_expires_at desc)
  where status = 'generated';
create index if not exists fiyu_together_pending_expiry
  on public.fiyu_together_sessions(expires_at) where status = 'pending';

create table if not exists public.fiyu_together_pick_items (
  session_id uuid not null references public.fiyu_together_sessions(id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  place_id text not null,
  primary key(session_id, position),
  unique(session_id, place_id)
);

alter table public.fiyu_together_trials enable row level security;
alter table public.fiyu_together_sessions enable row level security;
alter table public.fiyu_together_pick_items enable row level security;

create policy "together trial own row" on public.fiyu_together_trials
  for select to authenticated using (user_id = auth.uid());
create policy "together participants read sessions" on public.fiyu_together_sessions
  for select to authenticated using (
    initiator_user_id = auth.uid() or invitee_user_id = auth.uid()
  );
create policy "together participants read picks" on public.fiyu_together_pick_items
  for select to authenticated using (
    exists (
      select 1 from public.fiyu_together_sessions session
      where session.id = session_id
        and (session.initiator_user_id = auth.uid() or session.invitee_user_id = auth.uid())
    )
  );

create or replace function public.create_fiyu_together_invite(
  p_user_id uuid,
  p_token_hash text,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_cycle_id text,
  p_cycle_expires_at timestamptz,
  p_location_mode text,
  p_location_label text,
  p_location_latitude double precision,
  p_location_longitude double precision
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare new_session public.fiyu_together_sessions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('together:create:' || p_user_id::text, 0));
  update public.fiyu_together_sessions set
    status = case when expires_at <= p_created_at then 'expired' else 'cancelled' end,
    cancelled_at = case when expires_at > p_created_at then p_created_at else cancelled_at end
  where initiator_user_id = p_user_id and status = 'pending';

  if exists (
    select 1 from public.fiyu_together_sessions
    where status = 'generated' and cycle_expires_at > p_created_at
      and (initiator_user_id = p_user_id or invitee_user_id = p_user_id)
  ) then raise exception 'together_cycle_quota_used'; end if;

  insert into public.fiyu_together_sessions(
    initiator_user_id, invite_token_hash, status, city_id, cycle_id,
    cycle_expires_at, location_mode, location_label, location_latitude,
    location_longitude, created_at, expires_at
  ) values (
    p_user_id, p_token_hash, 'pending', 'tokyo', p_cycle_id,
    p_cycle_expires_at, p_location_mode, p_location_label, p_location_latitude,
    p_location_longitude, p_created_at, p_expires_at
  ) returning * into new_session;
  return to_jsonb(new_session);
end $$;

create or replace function public.accept_fiyu_together_invite(
  p_token_hash text,
  p_invitee_user_id uuid,
  p_place_ids text[],
  p_generated_at timestamptz,
  p_selection_metadata jsonb,
  p_initiator_is_premium boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare target public.fiyu_together_sessions%rowtype;
declare use_trial boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('together:invite:' || p_token_hash, 0));
  select * into target from public.fiyu_together_sessions
    where invite_token_hash = p_token_hash for update;
  if target.id is null then raise exception 'together_invite_invalid'; end if;
  if target.status <> 'pending' then raise exception 'together_invite_not_pending'; end if;
  if target.expires_at <= p_generated_at then
    update public.fiyu_together_sessions set status = 'expired' where id = target.id;
    raise exception 'together_invite_expired';
  end if;
  if target.cycle_expires_at <= p_generated_at then
    raise exception 'together_invite_expired';
  end if;
  if target.initiator_user_id = p_invitee_user_id then raise exception 'together_self_invite'; end if;
  if cardinality(p_place_ids) < 1 or cardinality(p_place_ids) > 3 or
     (select count(distinct value) from unnest(p_place_ids) candidate(value)) <> cardinality(p_place_ids)
  then raise exception 'together_invalid_selection'; end if;
  if (select count(*) from public.fiyu_restaurant_visits
      where user_id = target.initiator_user_id and rating between 1 and 5) < 5
  then raise exception 'together_ratings_required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('together:user:' || least(target.initiator_user_id, p_invitee_user_id)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('together:user:' || greatest(target.initiator_user_id, p_invitee_user_id)::text, 0));
  if exists (
    select 1 from public.fiyu_together_sessions
    where status = 'generated' and cycle_expires_at > p_generated_at
      and (initiator_user_id in (target.initiator_user_id, p_invitee_user_id)
        or invitee_user_id in (target.initiator_user_id, p_invitee_user_id))
  ) then raise exception 'together_cycle_quota_used'; end if;

  use_trial := not p_initiator_is_premium;
  if use_trial and exists (
    select 1 from public.fiyu_together_trials
    where user_id = target.initiator_user_id and consumed_at is not null
  ) then raise exception 'together_trial_consumed'; end if;

  if exists (
    select 1 from unnest(p_place_ids) proposed(place_id)
    where exists (select 1 from public.fiyu_restaurant_visits v where v.user_id in (target.initiator_user_id, p_invitee_user_id) and v.place_id = proposed.place_id)
       or exists (select 1 from public.fiyu_restaurant_list_items li where li.user_id in (target.initiator_user_id, p_invitee_user_id) and li.place_id = proposed.place_id)
       or exists (
         select 1 from public.fiyu_daily_pick_round_items di
         join public.fiyu_daily_pick_rounds dr on dr.id = di.round_id
         where dr.user_id in (target.initiator_user_id, p_invitee_user_id)
           and dr.expires_at > p_generated_at and di.place_id = proposed.place_id
       )
  ) then raise exception 'together_selection_became_ineligible'; end if;

  insert into public.fiyu_together_pick_items(session_id, position, place_id)
    select target.id, ordinality - 1, place_id
    from unnest(p_place_ids) with ordinality proposed(place_id, ordinality);
  update public.fiyu_together_sessions set
    invitee_user_id = p_invitee_user_id, status = 'generated', accepted_at = p_generated_at,
    generated_at = p_generated_at, selection_metadata = coalesce(p_selection_metadata, '{}'::jsonb),
    consumed_trial = use_trial
  where id = target.id;
  if use_trial then
    insert into public.fiyu_together_trials(user_id, consumed_at, consumed_session_id)
      values(target.initiator_user_id, p_generated_at, target.id)
      on conflict(user_id) do update set consumed_at = excluded.consumed_at,
        consumed_session_id = excluded.consumed_session_id
      where fiyu_together_trials.consumed_at is null;
  end if;
  insert into public.fiyu_restaurant_seen(user_id, place_id, first_seen_at, last_seen_at, seen_count)
    select participant.user_id, proposed.place_id, p_generated_at, p_generated_at, 1
    from (values(target.initiator_user_id), (p_invitee_user_id)) participant(user_id)
    cross join unnest(p_place_ids) proposed(place_id)
    on conflict(user_id, place_id) do update set
      last_seen_at = greatest(fiyu_restaurant_seen.last_seen_at, excluded.last_seen_at),
      seen_count = fiyu_restaurant_seen.seen_count + 1;
  return jsonb_build_object('session_id', target.id, 'place_ids', p_place_ids, 'consumed_trial', use_trial);
end $$;

revoke all on function public.create_fiyu_together_invite(uuid,text,timestamptz,timestamptz,text,timestamptz,text,text,double precision,double precision) from public, anon, authenticated;
revoke all on function public.accept_fiyu_together_invite(text,uuid,text[],timestamptz,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.create_fiyu_together_invite(uuid,text,timestamptz,timestamptz,text,timestamptz,text,text,double precision,double precision) to service_role;
grant execute on function public.accept_fiyu_together_invite(text,uuid,text[],timestamptz,jsonb,boolean) to service_role;
