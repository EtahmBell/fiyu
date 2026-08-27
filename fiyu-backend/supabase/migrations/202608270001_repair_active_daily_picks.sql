create or replace function public.repair_active_fiyu_picks(
  p_user_id uuid,
  p_round_id uuid,
  p_expected_place_ids text[],
  p_place_ids text[],
  p_selection_metadata jsonb,
  p_repaired_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_round public.fiyu_daily_pick_rounds%rowtype;
  current_ids text[];
  added_ids text[];
begin
  if cardinality(p_place_ids) > 3
     or (
       select count(distinct value)
       from unnest(p_place_ids) as candidate(value)
     ) <> cardinality(p_place_ids) then
    raise exception 'A repaired Daily Picks snapshot requires zero to three unique restaurants';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_round_id::text, 0));
  select * into active_round
  from public.fiyu_daily_pick_rounds
  where id = p_round_id and user_id = p_user_id and expires_at > now()
  for update;

  if active_round.id is null then
    raise exception 'Active Daily Picks snapshot was not found';
  end if;

  select coalesce(array_agg(place_id order by position), array[]::text[])
  into current_ids
  from public.fiyu_daily_pick_round_items
  where round_id = p_round_id and user_id = p_user_id;

  if current_ids is distinct from coalesce(p_expected_place_ids, array[]::text[]) then
    return jsonb_build_object(
      'round_id', active_round.id,
      'assigned_at', active_round.assigned_at,
      'expires_at', active_round.expires_at,
      'selection_metadata', active_round.selection_metadata,
      'place_ids', current_ids
    );
  end if;

  select coalesce(array_agg(value), array[]::text[])
  into added_ids
  from unnest(p_place_ids) as proposed(value)
  where not (value = any(current_ids));

  delete from public.fiyu_daily_pick_round_items
  where round_id = p_round_id and user_id = p_user_id;

  insert into public.fiyu_daily_pick_round_items(round_id, user_id, position, place_id)
  select p_round_id, p_user_id, ordinality - 1, place_id
  from unnest(p_place_ids) with ordinality as proposed(place_id, ordinality);

  update public.fiyu_daily_pick_rounds
  set selection_metadata = coalesce(p_selection_metadata, '{}'::jsonb)
  where id = p_round_id and user_id = p_user_id;

  insert into public.fiyu_restaurant_seen(
    user_id, place_id, first_seen_at, last_seen_at, seen_count
  )
  select p_user_id, place_id, p_repaired_at, p_repaired_at, 1
  from unnest(added_ids) as place_id
  on conflict (user_id, place_id) do update set
    last_seen_at = greatest(fiyu_restaurant_seen.last_seen_at, excluded.last_seen_at),
    seen_count = fiyu_restaurant_seen.seen_count + 1;

  return jsonb_build_object(
    'round_id', active_round.id,
    'assigned_at', active_round.assigned_at,
    'expires_at', active_round.expires_at,
    'selection_metadata', coalesce(p_selection_metadata, '{}'::jsonb),
    'place_ids', p_place_ids
  );
end;
$$;

revoke all on function public.repair_active_fiyu_picks(
  uuid, uuid, text[], text[], jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.repair_active_fiyu_picks(
  uuid, uuid, text[], text[], jsonb, timestamptz
) to service_role;
