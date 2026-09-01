create or replace function public.reset_fiyu_visit_taste_test_data(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_visits integer;
  deleted_taste_snapshots integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':visit-taste', 0));

  delete from public.fiyu_restaurant_visits where user_id = p_user_id;
  get diagnostics deleted_visits = row_count;

  -- Acknowledgement lives on the snapshot row, so deleting the account's
  -- derived snapshots also resets unseen/update state without touching inputs.
  delete from public.fiyu_user_taste_snapshots where user_id = p_user_id;
  get diagnostics deleted_taste_snapshots = row_count;

  return jsonb_build_object(
    'deleted_visits', deleted_visits,
    'deleted_taste_snapshots', deleted_taste_snapshots
  );
end;
$$;

revoke all on function public.reset_fiyu_visit_taste_test_data(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_fiyu_visit_taste_test_data(uuid)
  to service_role;
