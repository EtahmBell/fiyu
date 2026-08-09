create table if not exists public.fiyu_user_discovery_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  location_mode text check (location_mode in ('current', 'preview', 'manual')),
  discovery_latitude double precision check (discovery_latitude between -90 and 90),
  discovery_longitude double precision check (discovery_longitude between -180 and 180),
  discovery_label text check (char_length(discovery_label) between 1 and 120),
  arrival_date date,
  last_location_check_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fiyu_discovery_coordinate_pair check (
    (discovery_latitude is null and discovery_longitude is null) or
    (discovery_latitude is not null and discovery_longitude is not null)
  ),
  constraint fiyu_configured_location_complete check (
    location_mode is null or
    (discovery_latitude is not null and discovery_longitude is not null and discovery_label is not null)
  )
);

alter table public.fiyu_user_discovery_locations enable row level security;

drop policy if exists "Users manage their own discovery location"
  on public.fiyu_user_discovery_locations;
create policy "Users manage their own discovery location"
  on public.fiyu_user_discovery_locations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
