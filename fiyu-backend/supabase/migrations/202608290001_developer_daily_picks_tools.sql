create table if not exists public.fiyu_developer_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  location_mode text not null default 'real'
    check (location_mode in ('real', 'area', 'outside_tokyo')),
  area_name text,
  updated_at timestamptz not null default now(),
  check (
    (location_mode = 'area' and area_name is not null and btrim(area_name) <> '')
    or (location_mode <> 'area' and area_name is null)
  )
);

alter table public.fiyu_developer_settings enable row level security;
revoke all on public.fiyu_developer_settings from public, anon, authenticated;

create or replace function public.reset_fiyu_daily_pick_test_state(
  p_user_id uuid,
  p_city_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_rounds integer;
  deleted_seen integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_city_id, 0));

  delete from public.fiyu_daily_pick_rounds
  where user_id = p_user_id and city_id = p_city_id;
  get diagnostics deleted_rounds = row_count;

  delete from public.fiyu_restaurant_seen where user_id = p_user_id;
  get diagnostics deleted_seen = row_count;

  return jsonb_build_object(
    'deleted_rounds', deleted_rounds,
    'deleted_seen', deleted_seen
  );
end;
$$;

revoke all on function public.reset_fiyu_daily_pick_test_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reset_fiyu_daily_pick_test_state(uuid, text)
  to service_role;
