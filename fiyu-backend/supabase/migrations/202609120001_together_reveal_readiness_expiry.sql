-- A generated Together remains revealable for 72 hours per participant. The
-- deadline is derived from generated_at; no ticking or mutable expiry state is
-- stored, and an already-revealed participant remains idempotent.
create or replace function public.reveal_fiyu_together_session(
  p_session_id uuid,
  p_user_id uuid,
  p_revealed_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare target public.fiyu_together_sessions%rowtype;
declare effective_revealed_at timestamptz;
declare prior_revealed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('together:reveal:' || p_session_id::text || ':' || p_user_id::text, 0));
  select * into target from public.fiyu_together_sessions where id = p_session_id for update;
  if target.id is null then raise exception 'together_session_not_found'; end if;
  if target.status <> 'generated' then raise exception 'together_session_not_generated'; end if;

  if p_user_id = target.initiator_user_id then
    prior_revealed_at := target.initiator_revealed_at;
  elsif p_user_id = target.invitee_user_id then
    prior_revealed_at := target.invitee_revealed_at;
  else
    raise exception 'together_session_forbidden';
  end if;

  if prior_revealed_at is null
     and (target.generated_at is null or target.generated_at + interval '72 hours' <= p_revealed_at)
  then
    raise exception 'together_reveal_expired';
  end if;

  effective_revealed_at := coalesce(prior_revealed_at, p_revealed_at);
  if p_user_id = target.initiator_user_id then
    update public.fiyu_together_sessions set initiator_revealed_at = effective_revealed_at where id = target.id;
  else
    update public.fiyu_together_sessions set invitee_revealed_at = effective_revealed_at where id = target.id;
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
