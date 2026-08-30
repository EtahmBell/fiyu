alter table public.fiyu_restaurant_visits
  add column if not exists rating integer;

alter table public.fiyu_restaurant_visits
  drop constraint if exists fiyu_restaurant_visits_rating_check;

alter table public.fiyu_restaurant_visits
  add constraint fiyu_restaurant_visits_rating_check
  check (rating is null or rating between 1 and 5);

comment on column public.fiyu_restaurant_visits.rating is
  'The owner-selected integer rating from 1 to 5. Null preserves legacy reaction-only visits.';
