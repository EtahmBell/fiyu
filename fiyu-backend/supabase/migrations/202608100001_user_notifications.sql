create table if not exists public.fiyu_user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (
    type in ('picks_ready', 'smart_list_ready', 'new_drop', 'early_access_unlocked', 'trip_reminder')
  ),
  title text not null check (btrim(title) <> '' and char_length(title) <= 120),
  body text not null check (btrim(body) <> '' and char_length(body) <= 500),
  target_url text check (
    target_url is null or
    (left(target_url, 1) = '/' and left(target_url, 2) <> '//' and position(chr(92) in target_url) = 0)
  ),
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create index if not exists fiyu_notifications_user_created
  on public.fiyu_user_notifications(user_id, created_at desc);
create index if not exists fiyu_notifications_user_read
  on public.fiyu_user_notifications(user_id, read_at, created_at desc);

alter table public.fiyu_user_notifications enable row level security;

revoke all on public.fiyu_user_notifications from anon, authenticated;
grant select on public.fiyu_user_notifications to authenticated;
grant update (read_at) on public.fiyu_user_notifications to authenticated;

drop policy if exists "Users read their own notifications"
  on public.fiyu_user_notifications;
create policy "Users read their own notifications"
  on public.fiyu_user_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users update their own notifications"
  on public.fiyu_user_notifications;
create policy "Users update their own notifications"
  on public.fiyu_user_notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
