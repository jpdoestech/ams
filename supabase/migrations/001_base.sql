-- Restored base schema / v1 -> v2. Run as database owner in Supabase SQL Editor.
create table if not exists employees (
 id uuid primary key default gen_random_uuid(), emp_no text not null unique,
 last_name text not null, first_name text, middle_name text, birth_date date, sex text,
 contact text, address text, position text, department text, site text, location text,
 date_hired date, status text default 'Active', custom jsonb not null default '{}'
);
alter table employees add column if not exists custom jsonb not null default '{}';
create table if not exists profiles (
 id uuid primary key references auth.users(id) on delete cascade, email text,
 full_name text, role text not null default 'viewer' check(role in ('superadmin','staff','viewer')),
 active boolean not null default false
);
create table if not exists attendance (
 emp_id uuid references employees(id) on delete cascade, date date not null,
 type text not null, late int not null default 0 check(late>=0), ut int not null default 0 check(ut>=0),
 primary key(emp_id,date)
);
create table if not exists holidays(id uuid primary key default gen_random_uuid(),location text not null,date date not null,kind text not null,name text);
create table if not exists field_defs(id uuid primary key default gen_random_uuid(), fkey text not null unique,label text not null,type text not null,
 options jsonb default '[]',required boolean default false,grp text,sort int default 0,active boolean default true,width int);
create table if not exists attendance_comments(id uuid primary key default gen_random_uuid(),emp_id uuid references employees(id) on delete cascade,
 date date not null,body text not null,author_email text,created_at timestamptz default now());
create or replace function my_role() returns text language sql stable security definer set search_path=public as $$
 select role from profiles where id=auth.uid() and active=true
$$;
revoke all on function my_role() from public;
grant execute on function my_role() to authenticated;
-- Provision users only through auth; metadata must never choose role/activation.
create or replace function provision_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into profiles(id,email,full_name,role,active) values(new.id,new.email,'','viewer',false) on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists ams_profile on auth.users;
create trigger ams_profile after insert on auth.users for each row execute function provision_profile();
insert into profiles(id,email) select id,email from auth.users on conflict(id) do nothing;
create or replace function protect_own_profile() returns trigger language plpgsql set search_path=public as $$
begin
 if auth.uid()=old.id and (new.role is distinct from old.role or new.active is distinct from old.active or new.id is distinct from old.id) then
  raise exception 'You cannot change your own access';
 end if;
 return new;
end $$;
drop trigger if exists own_profile on profiles;
create trigger own_profile before update on profiles for each row execute function protect_own_profile();
alter table profiles enable row level security;
drop policy if exists profile_read on profiles;
create policy profile_read on profiles for select to authenticated using(id=auth.uid() or my_role()='superadmin');
drop policy if exists profile_write on profiles;
create policy profile_write on profiles for update to authenticated using(my_role()='superadmin') with check(my_role()='superadmin');
do $$ declare t text; begin
 foreach t in array array['employees','attendance','holidays','field_defs','attendance_comments'] loop
 execute format('alter table %I enable row level security',t);
 execute format('drop policy if exists rd on %I',t);
 execute format('drop policy if exists wr on %I',t);
 execute format('create policy rd on %I for select to authenticated using (my_role() is not null)',t);
 if t='field_defs' then
 execute format('create policy wr on %I for all to authenticated using (my_role()=''superadmin'') with check (my_role()=''superadmin'')',t);
 elsif t='attendance_comments' then
 execute 'create policy wr on attendance_comments for insert to authenticated with check(my_role() is not null and author_email=(select email from profiles where id=auth.uid()))';
 else
 execute format('create policy wr on %I for all to authenticated using (my_role() in (''staff'',''superadmin'')) with check (my_role() in (''staff'',''superadmin''))',t);
 end if;
 execute format('grant select,insert,update,delete on %I to authenticated',t);
 end loop;
end $$;
grant select,update on profiles to authenticated;
