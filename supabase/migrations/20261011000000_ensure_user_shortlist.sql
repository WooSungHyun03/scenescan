-- Repair deployments that missed the original account-shortlist migration.
-- Additive and repeatable: never delete saved rows or weaken owner-only RLS.
create table if not exists public.user_shortlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);
create index if not exists user_shortlist_user_created_idx
  on public.user_shortlist (user_id, created_at, location_id);
alter table public.user_shortlist enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_shortlist' and policyname = 'users can read their own shortlist') then
    create policy "users can read their own shortlist" on public.user_shortlist
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_shortlist' and policyname = 'users can add to their own shortlist') then
    create policy "users can add to their own shortlist" on public.user_shortlist
      for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_shortlist' and policyname = 'users can remove from their own shortlist') then
    create policy "users can remove from their own shortlist" on public.user_shortlist
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
revoke all on table public.user_shortlist from anon;
grant select, insert, delete on table public.user_shortlist to authenticated;
notify pgrst, 'reload schema';
