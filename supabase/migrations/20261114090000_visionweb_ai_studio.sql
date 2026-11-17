-- VisionWeb AI Studio: private drafts, conversation history and private reference images.
-- Run this migration once in the VisionWeb Supabase SQL Editor.

create table if not exists public.visionweb_ai_sites (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  business_type text not null default 'other',
  initial_brief text not null default '',
  design_direction text not null default '',
  generated_html text not null default '',
  ai_summary text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'private_review', 'client_approved', 'paid', 'published_client', 'published_visionweb')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visionweb_ai_sites_owner_updated_idx
  on public.visionweb_ai_sites (admin_user_id, updated_at desc);

alter table public.visionweb_ai_sites enable row level security;
revoke all on table public.visionweb_ai_sites from anon, authenticated;
grant select, insert, update, delete on table public.visionweb_ai_sites to authenticated;

drop policy if exists "VisionWeb admins manage their AI sites" on public.visionweb_ai_sites;
create policy "VisionWeb admins manage their AI sites"
  on public.visionweb_ai_sites
  for all
  to authenticated
  using (admin_user_id = (select auth.uid()) and (select public.is_visionweb_admin()))
  with check (admin_user_id = (select auth.uid()) and (select public.is_visionweb_admin()));

create table if not exists public.visionweb_ai_site_messages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.visionweb_ai_sites(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists visionweb_ai_site_messages_history_idx
  on public.visionweb_ai_site_messages (site_id, created_at asc);

alter table public.visionweb_ai_site_messages enable row level security;
revoke all on table public.visionweb_ai_site_messages from anon, authenticated;
grant select, insert, delete on table public.visionweb_ai_site_messages to authenticated;

drop policy if exists "VisionWeb admins manage their AI site messages" on public.visionweb_ai_site_messages;
create policy "VisionWeb admins manage their AI site messages"
  on public.visionweb_ai_site_messages
  for all
  to authenticated
  using (
    admin_user_id = (select auth.uid())
    and (select public.is_visionweb_admin())
    and exists (
      select 1 from public.visionweb_ai_sites s
      where s.id = site_id and s.admin_user_id = (select auth.uid())
    )
  )
  with check (
    admin_user_id = (select auth.uid())
    and (select public.is_visionweb_admin())
    and exists (
      select 1 from public.visionweb_ai_sites s
      where s.id = site_id and s.admin_user_id = (select auth.uid())
    )
  );

create table if not exists public.visionweb_ai_site_assets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.visionweb_ai_sites(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  file_name text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists visionweb_ai_site_assets_site_idx
  on public.visionweb_ai_site_assets (site_id, created_at asc);

alter table public.visionweb_ai_site_assets enable row level security;
revoke all on table public.visionweb_ai_site_assets from anon, authenticated;
grant select, insert, delete on table public.visionweb_ai_site_assets to authenticated;

drop policy if exists "VisionWeb admins manage their AI site assets" on public.visionweb_ai_site_assets;
create policy "VisionWeb admins manage their AI site assets"
  on public.visionweb_ai_site_assets
  for all
  to authenticated
  using (
    admin_user_id = (select auth.uid())
    and (select public.is_visionweb_admin())
    and exists (
      select 1 from public.visionweb_ai_sites s
      where s.id = site_id and s.admin_user_id = (select auth.uid())
    )
  )
  with check (
    admin_user_id = (select auth.uid())
    and (select public.is_visionweb_admin())
    and exists (
      select 1 from public.visionweb_ai_sites s
      where s.id = site_id and s.admin_user_id = (select auth.uid())
    )
  );

-- Private bucket: original client photos are not public just because they are uploaded.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visionweb-ai-assets',
  'visionweb-ai-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

drop policy if exists "VisionWeb admins can read their private AI assets" on storage.objects;
create policy "VisionWeb admins can read their private AI assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'visionweb-ai-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_visionweb_admin())
  );

drop policy if exists "VisionWeb admins can upload their private AI assets" on storage.objects;
create policy "VisionWeb admins can upload their private AI assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'visionweb-ai-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_visionweb_admin())
  );

drop policy if exists "VisionWeb admins can update their private AI assets" on storage.objects;
create policy "VisionWeb admins can update their private AI assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'visionweb-ai-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_visionweb_admin())
  )
  with check (
    bucket_id = 'visionweb-ai-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_visionweb_admin())
  );

drop policy if exists "VisionWeb admins can delete their private AI assets" on storage.objects;
create policy "VisionWeb admins can delete their private AI assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'visionweb-ai-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_visionweb_admin())
  );
