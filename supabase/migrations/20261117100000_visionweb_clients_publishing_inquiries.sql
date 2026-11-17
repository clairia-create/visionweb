-- VisionWeb client accounts, private reviews, independent publishing, enquiries and notifications.
-- Run after schema.sql and the AI Studio migration in the VisionWeb Supabase project.

create table if not exists public.visionweb_clients (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  company_name text not null,
  email text not null,
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visionweb_clients_email_nonempty check (length(trim(email)) > 3)
);
alter table public.visionweb_clients
  add column if not exists is_active boolean not null default true;
create index if not exists visionweb_clients_active_idx
  on public.visionweb_clients(admin_user_id,is_active,company_name);

create unique index if not exists visionweb_clients_auth_user_idx
  on public.visionweb_clients(auth_user_id) where auth_user_id is not null;
create index if not exists visionweb_clients_admin_idx
  on public.visionweb_clients(admin_user_id, created_at desc);

alter table public.visionweb_clients enable row level security;
revoke all on public.visionweb_clients from anon, authenticated;
grant select, insert, update, delete on public.visionweb_clients to authenticated;
drop policy if exists "VisionWeb admins manage their client records" on public.visionweb_clients;
create policy "VisionWeb admins manage their client records"
  on public.visionweb_clients for all to authenticated
  using (admin_user_id = (select auth.uid()) and (select public.is_visionweb_admin()))
  with check (admin_user_id = (select auth.uid()) and (select public.is_visionweb_admin()));
drop policy if exists "Clients can read their own profile" on public.visionweb_clients;
create policy "Clients can read their own profile"
  on public.visionweb_clients for select to authenticated
  using (auth_user_id = (select auth.uid()));

alter table public.visionweb_ai_sites
  add column if not exists client_id uuid references public.visionweb_clients(id) on delete set null,
  add column if not exists published_url text,
  add column if not exists custom_domain text,
  add column if not exists published_at timestamptz,
  add column if not exists view_count bigint not null default 0,
  add column if not exists last_viewed_at timestamptz;

alter table public.visionweb_ai_sites
  drop constraint if exists visionweb_ai_sites_status_check;
alter table public.visionweb_ai_sites
  add constraint visionweb_ai_sites_status_check
  check (status in ('draft','private_review','changes_requested','client_approved','paid','published_client','published_visionweb'));
create index if not exists visionweb_ai_sites_client_updated_idx
  on public.visionweb_ai_sites(client_id, updated_at desc);

drop policy if exists "Clients can read assigned website projects" on public.visionweb_ai_sites;
create policy "Clients can read assigned website projects"
  on public.visionweb_ai_sites for select to authenticated
  using (
    exists (
      select 1 from public.visionweb_clients c
      where c.id = client_id and c.auth_user_id = (select auth.uid()) and c.is_active = true
    )
  );

create table if not exists public.visionweb_site_review_links (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.visionweb_ai_sites(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  preview_html text not null default '',
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists visionweb_site_review_links_site_idx
  on public.visionweb_site_review_links(site_id, created_at desc);
alter table public.visionweb_site_review_links enable row level security;
revoke all on public.visionweb_site_review_links from anon, authenticated;
grant select, insert, update, delete on public.visionweb_site_review_links to authenticated;
drop policy if exists "Admins manage their private review links" on public.visionweb_site_review_links;
create policy "Admins manage their private review links"
  on public.visionweb_site_review_links for all to authenticated
  using (
    admin_user_id = (select auth.uid())
    and (select public.is_visionweb_admin())
    and exists(select 1 from public.visionweb_ai_sites s where s.id = site_id and s.admin_user_id = (select auth.uid()))
  )
  with check (
    admin_user_id = (select auth.uid())
    and (select public.is_visionweb_admin())
    and exists(select 1 from public.visionweb_ai_sites s where s.id = site_id and s.admin_user_id = (select auth.uid()))
  );

create table if not exists public.visionweb_site_feedback (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.visionweb_ai_sites(id) on delete cascade,
  review_link_id uuid references public.visionweb_site_review_links(id) on delete set null,
  reviewer_name text not null default 'Website client',
  message text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint visionweb_site_feedback_message_length check (length(trim(message)) between 1 and 5000)
);
create index if not exists visionweb_site_feedback_site_idx
  on public.visionweb_site_feedback(site_id, created_at desc);
alter table public.visionweb_site_feedback enable row level security;
revoke all on public.visionweb_site_feedback from anon, authenticated;
grant select on public.visionweb_site_feedback to authenticated;
drop policy if exists "Admins can read feedback on their sites" on public.visionweb_site_feedback;
create policy "Admins can read feedback on their sites"
  on public.visionweb_site_feedback for select to authenticated
  using (exists(select 1 from public.visionweb_ai_sites s where s.id = site_id and s.admin_user_id = (select auth.uid()) and (select public.is_visionweb_admin())));

create table if not exists public.visionweb_inquiries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.visionweb_ai_sites(id) on delete cascade,
  client_id uuid not null references public.visionweb_clients(id) on delete restrict,
  inquiry_type text not null check (inquiry_type in ('message','booking','order')),
  customer_name text not null,
  customer_email text not null default '',
  customer_phone text not null default '',
  requested_date date,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','reviewing','confirmed','declined','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visionweb_inquiries_name_nonempty check (length(trim(customer_name)) between 1 and 160)
);
create index if not exists visionweb_inquiries_site_created_idx
  on public.visionweb_inquiries(site_id, created_at desc);
create index if not exists visionweb_inquiries_client_created_idx
  on public.visionweb_inquiries(client_id, created_at desc);
alter table public.visionweb_inquiries enable row level security;
revoke all on public.visionweb_inquiries from anon, authenticated;
grant select, update on public.visionweb_inquiries to authenticated;
drop policy if exists "Admins can manage enquiries for their sites" on public.visionweb_inquiries;
create policy "Admins can manage enquiries for their sites"
  on public.visionweb_inquiries for all to authenticated
  using (exists(select 1 from public.visionweb_ai_sites s where s.id = site_id and s.admin_user_id = (select auth.uid()) and (select public.is_visionweb_admin())))
  with check (exists(select 1 from public.visionweb_ai_sites s where s.id = site_id and s.admin_user_id = (select auth.uid()) and (select public.is_visionweb_admin())));
drop policy if exists "Clients can read enquiries for their sites" on public.visionweb_inquiries;
create policy "Clients can read enquiries for their sites"
  on public.visionweb_inquiries for select to authenticated
  using (exists(select 1 from public.visionweb_clients c where c.id = client_id and c.auth_user_id = (select auth.uid()) and c.is_active = true));

create table if not exists public.visionweb_site_visits (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.visionweb_ai_sites(id) on delete cascade,
  client_id uuid references public.visionweb_clients(id) on delete set null,
  page_path text not null default '/',
  referrer_host text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists visionweb_site_visits_site_created_idx
  on public.visionweb_site_visits(site_id,created_at desc);
create index if not exists visionweb_site_visits_client_created_idx
  on public.visionweb_site_visits(client_id,created_at desc);
alter table public.visionweb_site_visits enable row level security;
revoke all on public.visionweb_site_visits from anon, authenticated;
grant select on public.visionweb_site_visits to authenticated;
drop policy if exists "Admins can read visits for their websites" on public.visionweb_site_visits;
create policy "Admins can read visits for their websites"
  on public.visionweb_site_visits for select to authenticated
  using (exists(select 1 from public.visionweb_ai_sites s where s.id=site_id and s.admin_user_id=(select auth.uid()) and (select public.is_visionweb_admin())));
drop policy if exists "Clients can read visits for their websites" on public.visionweb_site_visits;
create policy "Clients can read visits for their websites"
  on public.visionweb_site_visits for select to authenticated
  using (exists(select 1 from public.visionweb_clients c where c.id=client_id and c.auth_user_id=(select auth.uid()) and c.is_active = true));

create table if not exists public.visionweb_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid references public.visionweb_ai_sites(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists visionweb_notifications_user_idx
  on public.visionweb_notifications(user_id, created_at desc);
alter table public.visionweb_notifications enable row level security;
revoke all on public.visionweb_notifications from anon, authenticated;
grant select on public.visionweb_notifications to authenticated;
grant update (read_at) on public.visionweb_notifications to authenticated;
drop policy if exists "Users can read their own VisionWeb notifications" on public.visionweb_notifications;
create policy "Users can read their own VisionWeb notifications"
  on public.visionweb_notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    and (
      (select public.is_visionweb_admin())
      or exists(select 1 from public.visionweb_clients c where c.auth_user_id=(select auth.uid()) and c.is_active=true)
    )
  );
drop policy if exists "Users can mark their own notifications as read" on public.visionweb_notifications;
create policy "Users can mark their own notifications as read"
  on public.visionweb_notifications for update to authenticated
  using (
    user_id = (select auth.uid())
    and (
      (select public.is_visionweb_admin())
      or exists(select 1 from public.visionweb_clients c where c.auth_user_id=(select auth.uid()) and c.is_active=true)
    )
  )
  with check (user_id = (select auth.uid()));

drop function if exists public.create_private_review_link(uuid);
create or replace function public.create_private_review_link(p_site_id uuid, p_preview_html text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_visionweb_admin() then
    raise exception 'Administrator access required';
  end if;
  if not exists(select 1 from public.visionweb_ai_sites s where s.id = p_site_id and s.admin_user_id = v_admin) then
    raise exception 'Website project not found';
  end if;
  if length(coalesce(p_preview_html,'')) < 100 or length(p_preview_html) > 30000000 then
    raise exception 'The review preview is empty or too large';
  end if;
  delete from public.visionweb_site_review_links where site_id = p_site_id;
  insert into public.visionweb_site_review_links(site_id, admin_user_id, preview_html)
    values(p_site_id, v_admin, p_preview_html) returning token into v_token;
  update public.visionweb_ai_sites
    set status = 'private_review', updated_at = now()
    where id = p_site_id;
  return v_token;
end;
$$;
revoke all on function public.create_private_review_link(uuid,text) from public, anon;
grant execute on function public.create_private_review_link(uuid,text) to authenticated;

create or replace function public.get_private_review(p_token uuid)
returns table (
  site_id uuid,
  business_name text,
  business_type text,
  design_direction text,
  generated_html text,
  review_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.business_name, s.business_type, s.design_direction, coalesce(nullif(r.preview_html,''),s.generated_html), r.expires_at
  from public.visionweb_site_review_links r
  join public.visionweb_ai_sites s on s.id = r.site_id
  where r.token = p_token and r.revoked_at is null and r.expires_at > now()
    and length(s.generated_html) > 0;
$$;
revoke all on function public.get_private_review(uuid) from public;
grant execute on function public.get_private_review(uuid) to anon, authenticated;

create or replace function public.submit_private_review_feedback(
  p_token uuid,
  p_reviewer_name text,
  p_message text,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site_id uuid;
  v_link_id uuid;
  v_owner uuid;
begin
  if length(trim(coalesce(p_message,''))) < 1 or length(p_message) > 5000 then
    raise exception 'Please enter feedback of up to 5000 characters';
  end if;
  select r.site_id, r.id, s.admin_user_id into v_site_id, v_link_id, v_owner
  from public.visionweb_site_review_links r
  join public.visionweb_ai_sites s on s.id = r.site_id
  where r.token = p_token and r.revoked_at is null and r.expires_at > now();
  if v_site_id is null then raise exception 'This review link has expired or is no longer available'; end if;

  insert into public.visionweb_site_feedback(site_id, review_link_id, reviewer_name, message, approved)
  values(v_site_id, v_link_id, left(coalesce(nullif(trim(p_reviewer_name),''),'Website client'),160), trim(p_message), coalesce(p_approved,false));

  update public.visionweb_ai_sites
    set status = case when coalesce(p_approved,false) then 'client_approved' else 'changes_requested' end,
        updated_at = now()
    where id = v_site_id;
  -- Revoke the review token after any response so an old preview cannot be approved later.
  update public.visionweb_site_review_links set revoked_at=now() where id=v_link_id;

  insert into public.visionweb_notifications(user_id, site_id, event_type, title, message)
  values(v_owner, v_site_id, 'client_feedback',
    case when coalesce(p_approved,false) then 'Website approved' else 'Changes requested' end,
    left(trim(p_message),500));
end;
$$;
revoke all on function public.submit_private_review_feedback(uuid,text,text,boolean) from public;
grant execute on function public.submit_private_review_feedback(uuid,text,text,boolean) to anon, authenticated;

create or replace function public.notify_visionweb_client_site_published(p_site_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid; v_client_user uuid; v_business text;
begin
  if auth.uid() is null or not public.is_visionweb_admin() then
    raise exception 'Administrator access required';
  end if;
  select s.admin_user_id, s.business_name, c.auth_user_id
    into v_owner, v_business, v_client_user
  from public.visionweb_ai_sites s
  left join public.visionweb_clients c on c.id=s.client_id
  where s.id=p_site_id;
  if v_owner is distinct from auth.uid() then raise exception 'Website project not found'; end if;
  if v_client_user is not null then
    insert into public.visionweb_notifications(user_id,site_id,event_type,title,message)
    values(v_client_user,p_site_id,'website_published','Website published','Your website for '||v_business||' is now live.');
  end if;
end;
$$;
revoke all on function public.notify_visionweb_client_site_published(uuid) from public, anon;
grant execute on function public.notify_visionweb_client_site_published(uuid) to authenticated;

create or replace function public.submit_website_inquiry(
  p_site_id uuid,
  p_inquiry_type text,
  p_customer_name text,
  p_customer_email text default '',
  p_customer_phone text default '',
  p_requested_date date default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_id uuid;
  v_type text := lower(trim(coalesce(p_inquiry_type,'')));
begin
  if v_type not in ('message','booking','order') then raise exception 'Unsupported enquiry type'; end if;
  if length(trim(coalesce(p_customer_name,''))) < 1 then raise exception 'Name is required'; end if;
  if length(coalesce(p_customer_name,'')) > 160 or length(coalesce(p_customer_email,'')) > 320 or length(coalesce(p_customer_phone,'')) > 80 then
    raise exception 'One or more fields are too long';
  end if;
  if octet_length(coalesce(p_details,'{}'::jsonb)::text) > 16000 then
    raise exception 'The enquiry details are too large';
  end if;
  select s.client_id into v_client_id
  from public.visionweb_ai_sites s
  where s.id = p_site_id and s.published_url is not null and s.client_id is not null;
  if v_client_id is null then raise exception 'This website is not accepting enquiries'; end if;

  insert into public.visionweb_inquiries(site_id,client_id,inquiry_type,customer_name,customer_email,customer_phone,requested_date,details)
  values(p_site_id,v_client_id,v_type,trim(p_customer_name),trim(coalesce(p_customer_email,'')),trim(coalesce(p_customer_phone,'')),p_requested_date,coalesce(p_details,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_website_inquiry(uuid,text,text,text,text,date,jsonb) from public;
grant execute on function public.submit_website_inquiry(uuid,text,text,text,text,date,jsonb) to anon, authenticated;

create or replace function public.client_update_inquiry_status(p_inquiry_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_site uuid;
  v_client uuid;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_status not in ('reviewing','confirmed','declined','completed') then raise exception 'Invalid status'; end if;
  select i.site_id, i.client_id into v_site, v_client
  from public.visionweb_inquiries i
  join public.visionweb_clients c on c.id = i.client_id
  where i.id = p_inquiry_id and c.auth_user_id = v_user;
  if v_site is null then raise exception 'Enquiry not found'; end if;
  update public.visionweb_inquiries set status=p_status, updated_at=now() where id=p_inquiry_id;
  insert into public.visionweb_notifications(user_id,site_id,event_type,title,message)
  select s.admin_user_id,v_site,'client_handled_enquiry','Client updated an enquiry',
         'An enquiry was marked '||p_status||'.'
  from public.visionweb_ai_sites s where s.id=v_site;
end;
$$;
revoke all on function public.client_update_inquiry_status(uuid,text) from public, anon;
grant execute on function public.client_update_inquiry_status(uuid,text) to authenticated;

drop function if exists public.record_client_site_visit(uuid);
create or replace function public.record_client_site_visit(
  p_site_id uuid,
  p_page_path text default '/',
  p_referrer_host text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_client_id uuid;
begin
  if length(coalesce(p_page_path,'')) > 300 or length(coalesce(p_referrer_host,'')) > 253 then
    raise exception 'Analytics fields are too long';
  end if;
  select s.client_id into v_client_id
  from public.visionweb_ai_sites s
  where s.id=p_site_id and s.published_url is not null;
  if not found then return; end if;

  insert into public.visionweb_site_visits(site_id,client_id,page_path,referrer_host)
  values(p_site_id,v_client_id,coalesce(nullif(p_page_path,''),'/'),coalesce(p_referrer_host,''));

  update public.visionweb_ai_sites
  set view_count = coalesce(view_count,0) + 1,
      last_viewed_at = now()
  where id = p_site_id and published_url is not null;
end;
$$;
revoke all on function public.record_client_site_visit(uuid,text,text) from public;
grant execute on function public.record_client_site_visit(uuid,text,text) to anon, authenticated;

create or replace function public.notify_visionweb_new_inquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid; v_client_user uuid; v_name text;
begin
  select s.admin_user_id, s.business_name, c.auth_user_id
    into v_owner, v_name, v_client_user
  from public.visionweb_ai_sites s
  left join public.visionweb_clients c on c.id=s.client_id
  where s.id = new.site_id;
  insert into public.visionweb_notifications(user_id,site_id,event_type,title,message)
  values(v_owner,new.site_id,'new_enquiry','New website enquiry',new.inquiry_type||' from '||new.customer_name||' · '||v_name);
  if v_client_user is not null then
    insert into public.visionweb_notifications(user_id,site_id,event_type,title,message)
    values(v_client_user,new.site_id,'new_enquiry','New customer enquiry',new.inquiry_type||' from '||new.customer_name);
  end if;
  return new;
end;
$$;
drop trigger if exists visionweb_new_inquiry_notification on public.visionweb_inquiries;
create trigger visionweb_new_inquiry_notification
  after insert on public.visionweb_inquiries
  for each row execute function public.notify_visionweb_new_inquiry();


create or replace function public.notify_visionweb_client_inquiry_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_client_user uuid; v_site_owner uuid; v_business text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select c.auth_user_id, s.admin_user_id, s.business_name
    into v_client_user, v_site_owner, v_business
  from public.visionweb_clients c
  join public.visionweb_ai_sites s on s.client_id=c.id
  where s.id=new.site_id and c.id=new.client_id;
  if v_client_user is not null and auth.uid() is distinct from v_client_user then
    insert into public.visionweb_notifications(user_id,site_id,event_type,title,message)
    values(v_client_user,new.site_id,'enquiry_status','Enquiry status updated',
      'The status of an enquiry for '||v_business||' is now '||new.status||'.');
  end if;
  return new;
end;
$$;
drop trigger if exists visionweb_client_inquiry_status_notification on public.visionweb_inquiries;
create trigger visionweb_client_inquiry_status_notification
  after update of status on public.visionweb_inquiries
  for each row execute function public.notify_visionweb_client_inquiry_status();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('visionweb-client-sites','visionweb-client-sites',true,33554432,array['text/html','text/css','application/javascript','image/jpeg','image/png','image/webp','image/avif','image/svg+xml','font/woff2'])
on conflict (id) do update set public=true, file_size_limit=33554432,
  allowed_mime_types=array['text/html','text/css','application/javascript','image/jpeg','image/png','image/webp','image/avif','image/svg+xml','font/woff2'];

drop policy if exists "Public can view published client website files" on storage.objects;
create policy "Public can view published client website files"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'visionweb-client-sites');
drop policy if exists "VisionWeb admins publish client website files" on storage.objects;
create policy "VisionWeb admins publish client website files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'visionweb-client-sites' and (select public.is_visionweb_admin()));
drop policy if exists "VisionWeb admins update client website files" on storage.objects;
create policy "VisionWeb admins update client website files"
  on storage.objects for update to authenticated
  using (bucket_id = 'visionweb-client-sites' and (select public.is_visionweb_admin()))
  with check (bucket_id = 'visionweb-client-sites' and (select public.is_visionweb_admin()));
drop policy if exists "VisionWeb admins delete client website files" on storage.objects;
create policy "VisionWeb admins delete client website files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'visionweb-client-sites' and (select public.is_visionweb_admin()));

-- Email, WhatsApp and push delivery require a provider and verified sending configuration.
-- The in-app notifications above are stored in Supabase and are available immediately.
