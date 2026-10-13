create table if not exists public.fiyu_my_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  external_place_id text not null check (
    length(btrim(external_place_id)) between 1 and 512
  ),
  display_name_hint text check (display_name_hint is null or length(display_name_hint) <= 200),
  canonical_work_id uuid not null,
  canonical_place_id text,
  status text not null check (status in (
    'pending', 'resolving_identity', 'outside_coverage', 'researching',
    'needs_location', 'ready', 'needs_review', 'failed_retryable', 'failed_terminal'
  )),
  failure_code text,
  score_version text,
  is_public boolean not null default false,
  recommendation_review_status text not null default 'not_eligible'
    check (recommendation_review_status in (
      'not_eligible', 'pending', 'approved', 'declined', 'withdrawn'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, provider, external_place_id)
);

create index if not exists fiyu_my_picks_user_recent
  on public.fiyu_my_picks(user_id, created_at desc, id desc);
create index if not exists fiyu_my_picks_canonical_work
  on public.fiyu_my_picks(canonical_work_id);

alter table public.fiyu_my_picks enable row level security;

drop policy if exists "Users can read their own My Picks" on public.fiyu_my_picks;
create policy "Users can read their own My Picks"
  on public.fiyu_my_picks for select
  using (auth.uid() = user_id);

create or replace function public.create_or_get_fiyu_my_pick(
  p_user_id uuid,
  p_provider text,
  p_external_place_id text,
  p_display_name_hint text,
  p_canonical_work_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_provider text := lower(btrim(p_provider));
  normalized_external_id text := btrim(p_external_place_id);
  existing_pick public.fiyu_my_picks%rowtype;
  new_pick public.fiyu_my_picks%rowtype;
begin
  if normalized_provider !~ '^[a-z][a-z0-9_.-]{0,63}$'
     or length(normalized_external_id) not between 1 and 512
     or length(coalesce(p_display_name_hint, '')) > 200 then
    raise exception using errcode = '22023', message = 'invalid_my_pick_identity';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('my-pick-user:' || p_user_id::text, 0)
  );

  select * into existing_pick
  from public.fiyu_my_picks
  where user_id = p_user_id
    and provider = normalized_provider
    and external_place_id = normalized_external_id;

  if existing_pick.id is not null then
    return to_jsonb(existing_pick) || jsonb_build_object('reused', true);
  end if;

  if (
    select count(*)
    from public.fiyu_my_picks
    where user_id = p_user_id and created_at >= now() - interval '1 hour'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'my_pick_rate_limit';
  end if;

  insert into public.fiyu_my_picks(
    user_id, provider, external_place_id, display_name_hint,
    canonical_work_id, status
  ) values (
    p_user_id, normalized_provider, normalized_external_id,
    nullif(btrim(p_display_name_hint), ''), p_canonical_work_id, 'pending'
  ) returning * into new_pick;

  return to_jsonb(new_pick) || jsonb_build_object('reused', false);
end;
$$;

revoke all on function public.create_or_get_fiyu_my_pick(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_or_get_fiyu_my_pick(
  uuid, text, text, text, uuid
) to service_role;
