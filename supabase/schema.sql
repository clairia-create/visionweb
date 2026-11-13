-- VisionWeb: public website collection + private administrator access
-- Run this entire file in the SQL Editor of a NEW Supabase project created for VisionWeb.
-- Do not reuse a project that contains another application's data unless you intend to share it.

create table if not exists public.visionweb_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.visionweb_admins enable row level security;
revoke all on table public.visionweb_admins from anon, authenticated;
grant select on table public.visionweb_admins to authenticated;
drop policy if exists "VisionWeb admins can read their own allowlist row" on public.visionweb_admins;
create policy "VisionWeb admins can read their own allowlist row"
  on public.visionweb_admins
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- SECURITY DEFINER prevents recursive RLS when the project policies check admin membership.
create or replace function public.is_visionweb_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.visionweb_admins
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_visionweb_admin() from public, anon;
grant execute on function public.is_visionweb_admin() to authenticated;

create table if not exists public.visionweb_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('restaurant', 'hotel', 'beauty', 'retail', 'other')),
  project_type text not null default 'Website project',
  location text not null default '',
  description text not null,
  price numeric(10,2) not null check (price > 0),
  price_includes text not null,
  features text[] not null default '{}',
  image_url text not null,
  image_alt text not null default '',
  website_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visionweb_projects_public_sort_idx
  on public.visionweb_projects (is_published, created_at desc);

alter table public.visionweb_projects enable row level security;
revoke all on table public.visionweb_projects from anon, authenticated;
grant select on table public.visionweb_projects to anon, authenticated;
grant insert, update, delete on table public.visionweb_projects to authenticated;

drop policy if exists "Anyone can read published VisionWeb projects" on public.visionweb_projects;
create policy "Anyone can read published VisionWeb projects"
  on public.visionweb_projects
  for select
  to anon
  using (is_published = true);

drop policy if exists "Signed in visitors and admins can read allowed VisionWeb projects" on public.visionweb_projects;
create policy "Signed in visitors and admins can read allowed VisionWeb projects"
  on public.visionweb_projects
  for select
  to authenticated
  using (is_published = true or (select public.is_visionweb_admin()));

drop policy if exists "Only VisionWeb admins can insert projects" on public.visionweb_projects;
create policy "Only VisionWeb admins can insert projects"
  on public.visionweb_projects
  for insert
  to authenticated
  with check ((select public.is_visionweb_admin()));

drop policy if exists "Only VisionWeb admins can update projects" on public.visionweb_projects;
create policy "Only VisionWeb admins can update projects"
  on public.visionweb_projects
  for update
  to authenticated
  using ((select public.is_visionweb_admin()))
  with check ((select public.is_visionweb_admin()));

drop policy if exists "Only VisionWeb admins can delete projects" on public.visionweb_projects;
create policy "Only VisionWeb admins can delete projects"
  on public.visionweb_projects
  for delete
  to authenticated
  using ((select public.is_visionweb_admin()));

-- Public bucket for portfolio preview images. Only an approved admin may upload, replace or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visionweb-project-images',
  'visionweb-project-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

drop policy if exists "Public can view VisionWeb project images" on storage.objects;
create policy "Public can view VisionWeb project images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'visionweb-project-images');

drop policy if exists "Only VisionWeb admins can upload project images" on storage.objects;
create policy "Only VisionWeb admins can upload project images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'visionweb-project-images' and (select public.is_visionweb_admin()));

drop policy if exists "Only VisionWeb admins can update project images" on storage.objects;
create policy "Only VisionWeb admins can update project images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'visionweb-project-images' and (select public.is_visionweb_admin()))
  with check (bucket_id = 'visionweb-project-images' and (select public.is_visionweb_admin()));

drop policy if exists "Only VisionWeb admins can delete project images" on storage.objects;
create policy "Only VisionWeb admins can delete project images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'visionweb-project-images' and (select public.is_visionweb_admin()));

-- The allowlist has no public insert policy. Add the administrator manually after
-- creating the Auth user in Supabase Dashboard > Authentication > Users.
-- Replace the placeholder with that user's UUID and run this statement in SQL Editor:
-- insert into public.visionweb_admins (user_id) values ('PASTE_AUTH_USER_UUID_HERE');
