create table public.user_shortlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create index user_shortlist_user_created_idx
  on public.user_shortlist (user_id, created_at, location_id);

alter table public.user_shortlist enable row level security;

create policy "users can read their own shortlist"
  on public.user_shortlist
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can add to their own shortlist"
  on public.user_shortlist
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users can remove from their own shortlist"
  on public.user_shortlist
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on table public.user_shortlist to authenticated;
