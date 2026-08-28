alter table public.fiyu_daily_pick_rounds
  add column if not exists revealed_at timestamptz;

create or replace function public.reveal_fiyu_daily_picks(
  p_user_id uuid,
  p_round_id uuid,
  p_revealed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  persisted_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_round_id::text, 0));

  update public.fiyu_daily_pick_rounds
  set revealed_at = coalesce(revealed_at, p_revealed_at)
  where id = p_round_id
    and user_id = p_user_id
    and expires_at > now()
  returning revealed_at into persisted_at;

  if persisted_at is null then
    return null;
  end if;

  return jsonb_build_object(
    'round_id', p_round_id,
    'revealed_at', persisted_at
  );
end;
$$;

revoke all on function public.reveal_fiyu_daily_picks(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.reveal_fiyu_daily_picks(
  uuid, uuid, timestamptz
) to service_role;
