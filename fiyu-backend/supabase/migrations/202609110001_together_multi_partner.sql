alter table public.fiyu_together_sessions
  add column if not exists pair_user_low uuid references auth.users(id) on delete cascade,
  add column if not exists pair_user_high uuid references auth.users(id) on delete cascade;

update public.fiyu_together_sessions
set pair_user_low = least(initiator_user_id, invitee_user_id),
    pair_user_high = greatest(initiator_user_id, invitee_user_id)
where status = 'generated' and invitee_user_id is not null
  and (pair_user_low is null or pair_user_high is null);

alter table public.fiyu_together_sessions
  drop constraint if exists fiyu_together_pair_ordered,
  add constraint fiyu_together_pair_ordered check (
    (pair_user_low is null and pair_user_high is null)
    or (pair_user_low is not null and pair_user_high is not null and pair_user_low < pair_user_high)
  );

-- Same-cycle duplicates are impossible even if two accept requests race. The
-- advisory pair lock below additionally protects reverse-direction invitations
-- whose rolling Daily Picks cycle identifiers are not identical.
create unique index if not exists fiyu_together_one_pair_per_cycle
  on public.fiyu_together_sessions(cycle_id, pair_user_low, pair_user_high)
  where status = 'generated';

create index if not exists fiyu_together_active_pair
  on public.fiyu_together_sessions(pair_user_low, pair_user_high, cycle_expires_at desc)
  where status = 'generated';

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
  perform pg_advisory_xact_lock(hashtextextended('together:user:' || p_user_id::text, 0));
  update public.fiyu_together_sessions set
    status = case when expires_at <= p_created_at then 'expired' else 'cancelled' end,
    cancelled_at = case when expires_at > p_created_at then p_created_at else cancelled_at end
  where initiator_user_id = p_user_id and status = 'pending';

  if (select count(*) from public.fiyu_together_sessions
      where status = 'generated' and cycle_expires_at > p_created_at
        and (initiator_user_id = p_user_id or invitee_user_id = p_user_id)) >= 3
  then raise exception 'together_cycle_limit_reached'; end if;

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
declare pair_low uuid;
declare pair_high uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('together:invite:' || p_token_hash, 0));
  select * into target from public.fiyu_together_sessions where invite_token_hash = p_token_hash for update;
  if target.id is null then raise exception 'together_invite_invalid'; end if;
  if target.status <> 'pending' then raise exception 'together_invite_not_pending'; end if;
  if target.expires_at <= p_generated_at then
    update public.fiyu_together_sessions set status = 'expired' where id = target.id;
    raise exception 'together_invite_expired';
  end if;
  if target.cycle_expires_at <= p_generated_at then raise exception 'together_invite_expired'; end if;
  if target.initiator_user_id = p_invitee_user_id then raise exception 'together_self_invite'; end if;
  if cardinality(p_place_ids) < 1 or cardinality(p_place_ids) > 3 or
     (select count(distinct value) from unnest(p_place_ids) candidate(value)) <> cardinality(p_place_ids)
  then raise exception 'together_invalid_selection'; end if;
  if (select count(*) from public.fiyu_restaurant_visits
      where user_id = target.initiator_user_id and rating between 1 and 5) < 5
  then raise exception 'together_ratings_required'; end if;

  pair_low := least(target.initiator_user_id, p_invitee_user_id);
  pair_high := greatest(target.initiator_user_id, p_invitee_user_id);
  perform pg_advisory_xact_lock(hashtextextended('together:user:' || pair_low::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('together:user:' || pair_high::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('together:pair:' || pair_low::text || ':' || pair_high::text, 0));

  if exists (
    select 1 from public.fiyu_together_sessions
    where status = 'generated' and cycle_expires_at > p_generated_at
      and pair_user_low = pair_low and pair_user_high = pair_high
  ) then raise exception 'together_pair_already_used'; end if;
  if (select count(*) from public.fiyu_together_sessions
      where status = 'generated' and cycle_expires_at > p_generated_at
        and (initiator_user_id = target.initiator_user_id or invitee_user_id = target.initiator_user_id)) >= 3
     or (select count(*) from public.fiyu_together_sessions
      where status = 'generated' and cycle_expires_at > p_generated_at
        and (initiator_user_id = p_invitee_user_id or invitee_user_id = p_invitee_user_id)) >= 3
  then raise exception 'together_cycle_limit_reached'; end if;

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
       or exists (
         select 1 from public.fiyu_together_pick_items ti
         join public.fiyu_together_sessions ts on ts.id = ti.session_id
         where ts.status = 'generated' and ts.cycle_expires_at > p_generated_at
           and (ts.initiator_user_id in (target.initiator_user_id, p_invitee_user_id)
             or ts.invitee_user_id in (target.initiator_user_id, p_invitee_user_id))
           and ti.place_id = proposed.place_id
       )
  ) then raise exception 'together_selection_became_ineligible'; end if;

  insert into public.fiyu_together_pick_items(session_id, position, place_id)
    select target.id, ordinality - 1, place_id
    from unnest(p_place_ids) with ordinality proposed(place_id, ordinality);
  update public.fiyu_together_sessions set
    invitee_user_id = p_invitee_user_id, pair_user_low = pair_low, pair_user_high = pair_high,
    status = 'generated', accepted_at = p_generated_at, generated_at = p_generated_at,
    selection_metadata = coalesce(p_selection_metadata, '{}'::jsonb), consumed_trial = use_trial
  where id = target.id;
  if use_trial then
    insert into public.fiyu_together_trials(user_id, consumed_at, consumed_session_id)
      values(target.initiator_user_id, p_generated_at, target.id)
      on conflict(user_id) do update set consumed_at = excluded.consumed_at,
        consumed_session_id = excluded.consumed_session_id
      where fiyu_together_trials.consumed_at is null;
  end if;
  return jsonb_build_object('session_id', target.id, 'place_ids', p_place_ids, 'consumed_trial', use_trial);
end $$;

revoke all on function public.create_fiyu_together_invite(uuid,text,timestamptz,timestamptz,text,timestamptz,text,text,double precision,double precision)
  from public, anon, authenticated;
revoke all on function public.accept_fiyu_together_invite(text,uuid,text[],timestamptz,jsonb,boolean)
  from public, anon, authenticated;
grant execute on function public.create_fiyu_together_invite(uuid,text,timestamptz,timestamptz,text,timestamptz,text,text,double precision,double precision)
  to service_role;
grant execute on function public.accept_fiyu_together_invite(text,uuid,text[],timestamptz,jsonb,boolean)
  to service_role;
