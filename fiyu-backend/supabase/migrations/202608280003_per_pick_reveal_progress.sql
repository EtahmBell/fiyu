create or replace function public.reveal_fiyu_daily_pick(
  p_user_id uuid,
  p_round_id uuid,
  p_place_id text,
  p_revealed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_round public.fiyu_daily_pick_rounds%rowtype;
  item_ids text[];
  revealed_ids text[];
  fully_revealed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_round_id::text, 0));

  select * into active_round
  from public.fiyu_daily_pick_rounds
  where id = p_round_id and user_id = p_user_id and expires_at > now()
  for update;

  if active_round.id is null then
    return null;
  end if;

  select coalesce(array_agg(place_id order by position), array[]::text[])
  into item_ids
  from public.fiyu_daily_pick_round_items
  where round_id = p_round_id and user_id = p_user_id;

  if not (p_place_id = any(item_ids)) then
    return null;
  end if;

  select coalesce(array_agg(value), array[]::text[])
  into revealed_ids
  from jsonb_array_elements_text(
    coalesce(active_round.selection_metadata->'revealed_place_ids', '[]'::jsonb)
  ) as stored(value)
  where value = any(item_ids);

  -- Before per-Pick persistence, a round timestamp represented all cards.
  if active_round.revealed_at is not null and cardinality(revealed_ids) = 0 then
    revealed_ids := item_ids;
  elsif not (p_place_id = any(revealed_ids)) then
    revealed_ids := array_append(revealed_ids, p_place_id);
  end if;

  if cardinality(item_ids) > 0 and cardinality(revealed_ids) = cardinality(item_ids) then
    fully_revealed_at := coalesce(active_round.revealed_at, p_revealed_at);
  else
    fully_revealed_at := null;
  end if;

  update public.fiyu_daily_pick_rounds
  set selection_metadata = jsonb_set(
        coalesce(selection_metadata, '{}'::jsonb),
        '{revealed_place_ids}',
        to_jsonb(revealed_ids),
        true
      ),
      revealed_at = fully_revealed_at
  where id = p_round_id and user_id = p_user_id;

  return jsonb_build_object(
    'round_id', p_round_id,
    'place_id', p_place_id,
    'pick_revealed_at', p_revealed_at,
    'revealed_place_ids', revealed_ids,
    'revealed_at', fully_revealed_at
  );
end;
$$;

revoke all on function public.reveal_fiyu_daily_pick(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reveal_fiyu_daily_pick(
  uuid, uuid, text, timestamptz
) to service_role;

-- Keep only reveal progress belonging to restaurants that survive snapshot repair.
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
  preserved_revealed_ids text[];
  repaired_metadata jsonb;
  repaired_revealed_at timestamptz;
begin
  if cardinality(p_place_ids) > 3
     or (select count(distinct value) from unnest(p_place_ids) as candidate(value))
        <> cardinality(p_place_ids) then
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
      'round_id', active_round.id, 'assigned_at', active_round.assigned_at,
      'expires_at', active_round.expires_at, 'revealed_at', active_round.revealed_at,
      'selection_metadata', active_round.selection_metadata, 'place_ids', current_ids
    );
  end if;

  select coalesce(array_agg(value), array[]::text[])
  into preserved_revealed_ids
  from jsonb_array_elements_text(
    case
      when active_round.revealed_at is not null
           and not (active_round.selection_metadata ? 'revealed_place_ids')
        then to_jsonb(current_ids)
      else coalesce(active_round.selection_metadata->'revealed_place_ids', '[]'::jsonb)
    end
  ) as revealed(value)
  where value = any(p_place_ids);

  select coalesce(array_agg(value), array[]::text[])
  into added_ids
  from unnest(p_place_ids) as proposed(value)
  where not (value = any(current_ids));

  repaired_metadata := jsonb_set(
    coalesce(p_selection_metadata, '{}'::jsonb),
    '{revealed_place_ids}', to_jsonb(preserved_revealed_ids), true
  );
  repaired_revealed_at := case
    when cardinality(p_place_ids) > 0
         and cardinality(preserved_revealed_ids) = cardinality(p_place_ids)
      then active_round.revealed_at
    else null
  end;

  delete from public.fiyu_daily_pick_round_items
  where round_id = p_round_id and user_id = p_user_id;
  insert into public.fiyu_daily_pick_round_items(round_id, user_id, position, place_id)
  select p_round_id, p_user_id, ordinality - 1, place_id
  from unnest(p_place_ids) with ordinality as proposed(place_id, ordinality);

  update public.fiyu_daily_pick_rounds
  set selection_metadata = repaired_metadata, revealed_at = repaired_revealed_at
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
    'round_id', active_round.id, 'assigned_at', active_round.assigned_at,
    'expires_at', active_round.expires_at, 'revealed_at', repaired_revealed_at,
    'selection_metadata', repaired_metadata, 'place_ids', p_place_ids
  );
end;
$$;

revoke all on function public.repair_active_fiyu_picks(
  uuid, uuid, text[], text[], jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.repair_active_fiyu_picks(
  uuid, uuid, text[], text[], jsonb, timestamptz
) to service_role;
