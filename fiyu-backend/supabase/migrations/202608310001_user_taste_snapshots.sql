create table if not exists public.fiyu_user_taste_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone integer not null check (milestone >= 10 and milestone % 5 = 0),
  snapshot jsonb not null,
  generated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (user_id, milestone)
);

create index if not exists fiyu_taste_snapshots_user_milestone
  on public.fiyu_user_taste_snapshots(user_id, milestone desc);

alter table public.fiyu_user_taste_snapshots enable row level security;

create policy "taste snapshots own rows"
  on public.fiyu_user_taste_snapshots
  for select to authenticated
  using (user_id = auth.uid());

-- Snapshot generation and acknowledgement are mediated by the authenticated API.
-- The service role bypasses RLS; browser clients cannot write derived analytics.
