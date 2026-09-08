-- Persist the discovery time of each revealed Pick so its 72-hour retention is
-- independent of later rounds and of the round assignment timestamp.
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
  reveal_times jsonb;
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

  reveal_times := case
    when jsonb_typeof(active_round.selection_metadata->'revealed_at_by_place_id') = 'object'
      then active_round.selection_metadata->'revealed_at_by_place_id'
    else '{}'::jsonb
  end;

  -- Before per-Pick persistence, a round timestamp represented all cards.
  if active_round.revealed_at is not null and cardinality(revealed_ids) = 0 then
    revealed_ids := item_ids;
  elsif not (p_place_id = any(revealed_ids)) then
    revealed_ids := array_append(revealed_ids, p_place_id);
    reveal_times := jsonb_set(
      reveal_times,
      array[p_place_id],
      to_jsonb(p_revealed_at),
      true
    );
  end if;

  if cardinality(item_ids) > 0 and cardinality(revealed_ids) = cardinality(item_ids) then
    fully_revealed_at := coalesce(active_round.revealed_at, p_revealed_at);
  else
    fully_revealed_at := null;
  end if;

  update public.fiyu_daily_pick_rounds
  set selection_metadata = jsonb_set(
        jsonb_set(
          coalesce(selection_metadata, '{}'::jsonb),
          '{revealed_place_ids}',
          to_jsonb(revealed_ids),
          true
        ),
        '{revealed_at_by_place_id}',
        reveal_times,
        true
      ),
      revealed_at = fully_revealed_at
  where id = p_round_id and user_id = p_user_id;

  return jsonb_build_object(
    'round_id', p_round_id,
    'place_id', p_place_id,
    'pick_revealed_at', coalesce(reveal_times->>p_place_id, p_revealed_at::text),
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
