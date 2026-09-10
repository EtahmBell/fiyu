alter table public.fiyu_together_sessions
  add column if not exists initiator_revealed_at timestamptz,
  add column if not exists invitee_revealed_at timestamptz;

-- Sessions generated before this state existed were already shown on Picks,
-- so preserve that truth rather than replaying a reveal after deployment.
update public.fiyu_together_sessions
set initiator_revealed_at = coalesce(initiator_revealed_at, generated_at),
    invitee_revealed_at = coalesce(invitee_revealed_at, generated_at)
where status = 'generated' and generated_at is not null;

-- Generation chooses and persists the shared set, but does not expose it. Seen
-- history begins independently when each participant actually reveals it.
create or replace function public.reveal_fiyu_together_session(
  p_session_id uuid,
  p_user_id uuid,
  p_revealed_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare target public.fiyu_together_sessions%rowtype;
declare effective_revealed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('together:reveal:' || p_session_id::text || ':' || p_user_id::text, 0));
  select * into target from public.fiyu_together_sessions where id = p_session_id for update;
  if target.id is null then raise exception 'together_session_not_found'; end if;
  if target.status <> 'generated' then raise exception 'together_session_not_generated'; end if;
  if p_user_id = target.initiator_user_id then
    effective_revealed_at := coalesce(target.initiator_revealed_at, p_revealed_at);
    update public.fiyu_together_sessions
      set initiator_revealed_at = effective_revealed_at where id = target.id;
  elsif p_user_id = target.invitee_user_id then
    effective_revealed_at := coalesce(target.invitee_revealed_at, p_revealed_at);
    update public.fiyu_together_sessions
      set invitee_revealed_at = effective_revealed_at where id = target.id;
  else
    raise exception 'together_session_forbidden';
  end if;

  insert into public.fiyu_restaurant_seen(user_id, place_id, first_seen_at, last_seen_at, seen_count)
    select p_user_id, item.place_id, effective_revealed_at, effective_revealed_at, 1
    from public.fiyu_together_pick_items item where item.session_id = target.id
    on conflict(user_id, place_id) do update set
      last_seen_at = greatest(fiyu_restaurant_seen.last_seen_at, excluded.last_seen_at),
      seen_count = case
        when fiyu_restaurant_seen.last_seen_at < excluded.last_seen_at
          then fiyu_restaurant_seen.seen_count + 1
        else fiyu_restaurant_seen.seen_count
      end;
  return jsonb_build_object('session_id', target.id, 'revealed_at', effective_revealed_at);
end $$;

revoke all on function public.reveal_fiyu_together_session(uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.reveal_fiyu_together_session(uuid,uuid,timestamptz)
  to service_role;

-- Replace the v1 accept function only to defer seen-history mutation until the
-- participant reveal RPC above. Selection, locks, quota and trial rules remain
-- identical to the original migration.
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
  return jsonb_build_object('session_id', target.id, 'place_ids', p_place_ids, 'consumed_trial', use_trial);
end $$;

revoke all on function public.accept_fiyu_together_invite(text,uuid,text[],timestamptz,jsonb,boolean)
  from public, anon, authenticated;
grant execute on function public.accept_fiyu_together_invite(text,uuid,text[],timestamptz,jsonb,boolean)
  to service_role;
