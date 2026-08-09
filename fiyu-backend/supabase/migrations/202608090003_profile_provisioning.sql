alter table public.fiyu_user_profiles
  alter column username drop not null,
  alter column auth_email drop not null;

create or replace function public.ensure_fiyu_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_username text;
begin
  candidate_username := lower(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''));
  if candidate_username is not null
     and candidate_username !~ '^[a-z0-9_]{3,30}$' then
    candidate_username := null;
  end if;
  if candidate_username is not null
     and exists (
       select 1 from public.fiyu_user_profiles
       where username = candidate_username and user_id <> new.id
     ) then
    candidate_username := null;
  end if;

  insert into public.fiyu_user_profiles (user_id, username, auth_email)
  values (new.id, candidate_username, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_fiyu_profile_after_auth_signup on auth.users;
create trigger ensure_fiyu_profile_after_auth_signup
after insert on auth.users
for each row execute function public.ensure_fiyu_profile_for_auth_user();

with candidates as (
  select
    users.id,
    users.email,
    case
      when lower(nullif(btrim(users.raw_user_meta_data ->> 'username'), ''))
           ~ '^[a-z0-9_]{3,30}$'
      then lower(nullif(btrim(users.raw_user_meta_data ->> 'username'), ''))
      else null
    end as candidate_username
  from auth.users as users
), ranked as (
  select
    candidates.*,
    count(*) over (partition by candidate_username) as username_count
  from candidates
)
insert into public.fiyu_user_profiles (user_id, username, auth_email)
select
  ranked.id,
  case
    when ranked.candidate_username is not null
      and ranked.username_count = 1
      and not exists (
        select 1 from public.fiyu_user_profiles as existing
        where existing.username = ranked.candidate_username
      )
    then ranked.candidate_username
    else null
  end,
  ranked.email
from ranked
on conflict (user_id) do nothing;
