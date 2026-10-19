create or replace function public.get_fiyu_my_pick_quota(
  p_user_id uuid
) returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with recent as (
    select created_at
    from public.fiyu_my_picks
    where user_id = p_user_id
      and created_at >= now() - interval '24 hours'
  ), usage as (
    select count(*)::integer as used, min(created_at) as oldest
    from recent
  )
  select jsonb_build_object(
    'limit', 3,
    'used', used,
    'remaining', greatest(3 - used, 0),
    'window_hours', 24,
    'next_available_at',
      case when used >= 3 then oldest + interval '24 hours' else null end
  )
  from usage;
$$;

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
    where user_id = p_user_id
      and created_at >= now() - interval '24 hours'
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'my_pick_quota_exhausted';
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

revoke all on function public.get_fiyu_my_pick_quota(uuid)
  from public, anon, authenticated;
grant execute on function public.get_fiyu_my_pick_quota(uuid)
  to service_role;

revoke all on function public.create_or_get_fiyu_my_pick(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_or_get_fiyu_my_pick(
  uuid, text, text, text, uuid
) to service_role;
