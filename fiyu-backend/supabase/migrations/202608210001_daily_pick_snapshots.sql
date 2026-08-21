create table if not exists public.fiyu_daily_pick_rounds (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  city_id text not null,
  assigned_at timestamptz not null,
  expires_at timestamptz not null,
  selection_metadata jsonb not null default '{}'::jsonb
);
create index if not exists fiyu_daily_pick_rounds_active
  on public.fiyu_daily_pick_rounds(user_id, city_id, expires_at desc);

create table if not exists public.fiyu_daily_pick_round_items (
  round_id uuid not null references public.fiyu_daily_pick_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  place_id text not null,
  primary key(round_id, position),
  unique(round_id, place_id)
);
create index if not exists fiyu_daily_pick_items_user
  on public.fiyu_daily_pick_round_items(user_id, round_id, position);

alter table public.fiyu_daily_pick_rounds enable row level security;
alter table public.fiyu_daily_pick_round_items enable row level security;
create policy "daily pick rounds own rows" on public.fiyu_daily_pick_rounds
  for select to authenticated using (user_id = auth.uid());
create policy "daily pick items own rows" on public.fiyu_daily_pick_round_items
  for select to authenticated using (user_id = auth.uid());

create or replace function public.assign_or_get_active_fiyu_picks(
  p_user_id uuid,
  p_city_id text,
  p_place_ids text[],
  p_assigned_at timestamptz,
  p_expires_at timestamptz,
  p_selection_metadata jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_round public.fiyu_daily_pick_rounds%rowtype;
  new_round_id uuid;
  result_ids text[];
begin
  if coalesce(array_length(p_place_ids, 1), 0) <> 3
     or (
       select count(distinct value)
       from unnest(p_place_ids) as candidate(value)
     ) <> 3 then
    raise exception 'Daily Picks requires exactly three unique restaurants';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_city_id, 0));
  select * into active_round
  from public.fiyu_daily_pick_rounds
  where user_id = p_user_id and city_id = p_city_id and expires_at > now()
  order by assigned_at desc, id desc
  limit 1;

  if active_round.id is not null then
    select array_agg(place_id order by position) into result_ids
    from public.fiyu_daily_pick_round_items
    where round_id = active_round.id and user_id = p_user_id;
    return jsonb_build_object(
      'round_id', active_round.id,
      'assigned_at', active_round.assigned_at,
      'expires_at', active_round.expires_at,
      'selection_metadata', active_round.selection_metadata,
      'place_ids', result_ids
    );
  end if;

  new_round_id := gen_random_uuid();
  insert into public.fiyu_daily_pick_rounds(
    id, user_id, city_id, assigned_at, expires_at, selection_metadata
  ) values (
    new_round_id, p_user_id, p_city_id, p_assigned_at, p_expires_at,
    coalesce(p_selection_metadata, '{}'::jsonb)
  );
  insert into public.fiyu_daily_pick_round_items(round_id, user_id, position, place_id)
  select new_round_id, p_user_id, ordinality - 1, place_id
  from unnest(p_place_ids) with ordinality as proposed(place_id, ordinality);

  insert into public.fiyu_restaurant_seen(
    user_id, place_id, first_seen_at, last_seen_at, seen_count
  )
  select p_user_id, place_id, p_assigned_at, p_assigned_at, 1
  from unnest(p_place_ids) as place_id
  on conflict (user_id, place_id) do update set
    last_seen_at = greatest(fiyu_restaurant_seen.last_seen_at, excluded.last_seen_at),
    seen_count = fiyu_restaurant_seen.seen_count + 1;

  return jsonb_build_object(
    'round_id', new_round_id,
    'assigned_at', p_assigned_at,
    'expires_at', p_expires_at,
    'selection_metadata', coalesce(p_selection_metadata, '{}'::jsonb),
    'place_ids', p_place_ids
  );
end;
$$;

revoke all on function public.assign_or_get_active_fiyu_picks(
  uuid, text, text[], timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.assign_or_get_active_fiyu_picks(
  uuid, text, text[], timestamptz, timestamptz, jsonb
) to service_role;
revoke all on function public.assign_or_get_active_fiyu_picks(
  uuid, text, text[], timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.assign_or_get_active_fiyu_picks(
  uuid, text, text[], timestamptz, timestamptz, jsonb
) to service_role;
