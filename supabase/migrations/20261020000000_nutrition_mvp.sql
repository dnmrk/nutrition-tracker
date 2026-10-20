-- Validates one meal's items array; items are the source of truth for meal totals.
-- CASE forces evaluation order so casts never see non-numbers (string -> 23514, not 22P02).
create function public.meal_items_valid(items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(items) is distinct from 'array' then false
    when jsonb_array_length(items) not between 1 and 30 then false
    else not exists (
      select 1
      from jsonb_array_elements(items) as i(item)
      where case
        when jsonb_typeof(item) <> 'object' then true
        when jsonb_typeof(item -> 'name') is distinct from 'string' then true
        when char_length(btrim(item ->> 'name')) not between 1 and 80 then true
        else exists (
          select 1
          from (values ('grams', 5000), ('calories', 10000), ('protein_g', 1000), ('carbs_g', 1000), ('fat_g', 1000)) as f(k, max_v)
          where case
            when jsonb_typeof(item -> f.k) is distinct from 'number' then true
            else (item ->> f.k)::numeric not between 0 and f.max_v
          end
        )
      end
    )
  end
$$;

create table public.daily_targets (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  calorie_target integer not null check (calorie_target between 1 and 10000),
  protein_target_g integer not null check (protein_target_g between 0 and 1000),
  carbs_target_g integer not null check (carbs_target_g between 0 and 1000),
  fat_target_g integer not null check (fat_target_g between 0 and 1000)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_on date not null,
  logged_at timestamptz not null default now(),
  items jsonb not null check (public.meal_items_valid(items))
);

create index meals_user_id_eaten_on_idx on public.meals (user_id, eaten_on desc, logged_at desc);

alter table public.daily_targets enable row level security;
alter table public.meals enable row level security;

-- Supabase no longer auto-grants new public tables (changelog 45329); grant least privilege explicitly.
revoke all on public.daily_targets, public.meals from anon, authenticated;
grant select, insert, update on public.daily_targets to authenticated;
grant select, insert on public.meals to authenticated;

create policy daily_targets_select_own on public.daily_targets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy daily_targets_insert_own on public.daily_targets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy daily_targets_update_own on public.daily_targets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meals_select_own on public.meals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy meals_insert_own on public.meals
  for insert to authenticated with check ((select auth.uid()) = user_id);
