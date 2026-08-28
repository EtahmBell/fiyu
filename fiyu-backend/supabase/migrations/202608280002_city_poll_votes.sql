create table if not exists public.fiyu_city_poll_votes (
  id uuid primary key default gen_random_uuid(),
  voter_id text not null unique,
  choice text not null check (
    choice in ('rome', 'hong_kong', 'paris', 'sydney', 'los_angeles', 'other')
  ),
  other_city text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (length(voter_id) between 16 and 128),
  check (other_city is null or length(other_city) between 1 and 80),
  check (choice = 'other' or other_city is null),
  check (choice <> 'other' or other_city is not null)
);

alter table public.fiyu_city_poll_votes enable row level security;

-- No browser-facing policy is intentional. Votes are accepted by the public
-- Fiyu API and written with the server-only service role after validation.
revoke all on table public.fiyu_city_poll_votes from anon, authenticated;
