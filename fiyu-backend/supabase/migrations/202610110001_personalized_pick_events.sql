create table if not exists public.fiyu_personalized_pick_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city_id text not null,
  status text not null default 'available' check (status in ('available', 'selected')),
  source text not null default 'personalized_pick_event'
    check (source = 'personalized_pick_event'),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  dismissed_until timestamptz,
  dismissal_count integer not null default 0 check (dismissal_count >= 0),
  last_dismissed_at timestamptz,
  selected_position smallint check (selected_position between 0 and 2),
  selected_place_id text,
  selected_at timestamptz,
  active_until timestamptz,
  selection_metadata jsonb not null default '{}'::jsonb,
  check (
    (status = 'available' and selected_position is null and selected_place_id is null
      and selected_at is null and active_until is null)
    or
    (status = 'selected' and selected_position is not null and selected_place_id is not null
      and selected_at is not null and active_until is not null)
  )
);
create index if not exists fiyu_personalized_pick_events_user
  on public.fiyu_personalized_pick_events(user_id, created_at desc);

create table if not exists public.fiyu_personalized_pick_event_items (
  event_id uuid not null references public.fiyu_personalized_pick_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  place_id text not null,
  primary key (event_id, position),
  unique (event_id, place_id)
);

alter table public.fiyu_personalized_pick_events enable row level security;
alter table public.fiyu_personalized_pick_event_items enable row level security;

create or replace function public.create_initial_fiyu_personalized_pick_event(
  p_user_id uuid,
  p_city_id text,
  p_place_ids text[],
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_selection_metadata jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_event public.fiyu_personalized_pick_events%rowtype;
  new_event public.fiyu_personalized_pick_events%rowtype;
  result_ids text[];
begin
  if coalesce(array_length(p_place_ids, 1), 0) <> 3
     or (
       select count(distinct value)
       from unnest(p_place_ids) as candidate(value)
     ) <> 3 then
    raise exception 'Personalized Picks requires exactly three unique restaurants';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('personalized-pick:' || p_user_id::text, 0));
  select * into existing_event
  from public.fiyu_personalized_pick_events
  where user_id = p_user_id
  order by created_at desc, id desc
  limit 1;

  if existing_event.id is not null then
    select array_agg(place_id order by position) into result_ids
    from public.fiyu_personalized_pick_event_items
    where event_id = existing_event.id;
    return to_jsonb(existing_event) || jsonb_build_object('place_ids', result_ids);
  end if;

  insert into public.fiyu_personalized_pick_events(
    user_id, city_id, created_at, expires_at, selection_metadata
  ) values (
    p_user_id, p_city_id, p_created_at, p_expires_at,
    coalesce(p_selection_metadata, '{}'::jsonb)
  ) returning * into new_event;

  insert into public.fiyu_personalized_pick_event_items(event_id, user_id, position, place_id)
  select new_event.id, p_user_id, ordinality - 1, place_id
  from unnest(p_place_ids) with ordinality as proposed(place_id, ordinality);

  return to_jsonb(new_event) || jsonb_build_object('place_ids', p_place_ids);
end;
$$;

create or replace function public.dismiss_fiyu_personalized_pick_event(
  p_user_id uuid,
  p_event_id uuid,
  p_dismissed_at timestamptz,
  p_dismissed_until timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.fiyu_personalized_pick_events%rowtype;
  result_ids text[];
begin
  update public.fiyu_personalized_pick_events
  set dismissal_count = dismissal_count + 1,
      last_dismissed_at = p_dismissed_at,
      dismissed_until = p_dismissed_until
  where id = p_event_id and user_id = p_user_id and status = 'available'
    and expires_at > p_dismissed_at
  returning * into target;
  if target.id is null then return null; end if;
  select array_agg(place_id order by position) into result_ids
  from public.fiyu_personalized_pick_event_items where event_id = target.id;
  return to_jsonb(target) || jsonb_build_object('place_ids', result_ids);
end;
$$;

create or replace function public.select_fiyu_personalized_pick_event(
  p_user_id uuid,
  p_event_id uuid,
  p_position smallint,
  p_selected_at timestamptz,
  p_active_until timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.fiyu_personalized_pick_events%rowtype;
  selected_id text;
  result_ids text[];
begin
  select * into target from public.fiyu_personalized_pick_events
  where id = p_event_id and user_id = p_user_id for update;
  if target.id is null or target.expires_at <= p_selected_at then return null; end if;

  if target.status = 'selected' then
    if target.selected_position <> p_position then return null; end if;
  else
    select place_id into selected_id
    from public.fiyu_personalized_pick_event_items
    where event_id = target.id and user_id = p_user_id and position = p_position;
    if selected_id is null then return null; end if;
    update public.fiyu_personalized_pick_events
    set status = 'selected', selected_position = p_position,
        selected_place_id = selected_id, selected_at = p_selected_at,
        active_until = p_active_until, dismissed_until = null
    where id = target.id returning * into target;
    insert into public.fiyu_restaurant_seen(
      user_id, place_id, first_seen_at, last_seen_at, seen_count
    ) values (p_user_id, selected_id, p_selected_at, p_selected_at, 1)
    on conflict (user_id, place_id) do update set
      last_seen_at = greatest(fiyu_restaurant_seen.last_seen_at, excluded.last_seen_at),
      seen_count = fiyu_restaurant_seen.seen_count + 1;
  end if;

  select array_agg(place_id order by position) into result_ids
  from public.fiyu_personalized_pick_event_items where event_id = target.id;
  return to_jsonb(target) || jsonb_build_object('place_ids', result_ids);
end;
$$;

revoke all on function public.create_initial_fiyu_personalized_pick_event(
  uuid, text, text[], timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.dismiss_fiyu_personalized_pick_event(
  uuid, uuid, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.select_fiyu_personalized_pick_event(
  uuid, uuid, smallint, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_initial_fiyu_personalized_pick_event(
  uuid, text, text[], timestamptz, timestamptz, jsonb
) to service_role;
grant execute on function public.dismiss_fiyu_personalized_pick_event(
  uuid, uuid, timestamptz, timestamptz
) to service_role;
grant execute on function public.select_fiyu_personalized_pick_event(
  uuid, uuid, smallint, timestamptz, timestamptz
) to service_role;
