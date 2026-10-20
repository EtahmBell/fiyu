create or replace function public.hard_reset_fiyu_my_pick_projection(
  p_user_id uuid,
  p_my_pick_id uuid,
  p_canonical_work_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pick public.fiyu_my_picks%rowtype;
  other_reference_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('my-pick-work:' || p_canonical_work_id::text, 0)
  );

  select * into target_pick
  from public.fiyu_my_picks
  where id = p_my_pick_id
    and user_id = p_user_id
    and canonical_work_id = p_canonical_work_id
  for update;

  if target_pick.id is null then
    return jsonb_build_object('deleted', false, 'not_found', true, 'shared', false);
  end if;

  select count(*)::integer into other_reference_count
  from public.fiyu_my_picks
  where canonical_work_id = p_canonical_work_id
    and user_id <> p_user_id;

  if other_reference_count > 0 then
    return jsonb_build_object(
      'deleted', false,
      'not_found', false,
      'shared', true,
      'other_reference_count', other_reference_count
    );
  end if;

  delete from public.fiyu_my_picks
  where id = p_my_pick_id
    and user_id = p_user_id
    and canonical_work_id = p_canonical_work_id;

  return jsonb_build_object(
    'deleted', true,
    'not_found', false,
    'shared', false,
    'other_reference_count', 0
  );
end;
$$;

revoke all on function public.hard_reset_fiyu_my_pick_projection(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.hard_reset_fiyu_my_pick_projection(uuid, uuid, uuid)
  to service_role;
