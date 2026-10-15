-- v2 -> v3: existing employee/schedule relationships; additive and rerunnable.
alter table employees add column if not exists time_in text default '08:00',add column if not exists time_out text default '17:00',
 add column if not exists rest_day text default 'Sun',add column if not exists hire_type text default 'new',
 add column if not exists replaces_emp_id uuid references employees(id) on delete set null;
create table if not exists lookups(id uuid primary key default gen_random_uuid(),kind text not null,value text not null,sort int default 0,unique(kind,value));
create table if not exists stores(id uuid primary key default gen_random_uuid(),name text not null,city text,region text,address text,active boolean default true);
create table if not exists supervisors(id uuid primary key default gen_random_uuid(),name text not null,contact text,active boolean default true);
create table if not exists supervisor_stores(sup_id uuid references supervisors(id) on delete cascade,store_id uuid references stores(id) on delete cascade,primary key(sup_id,store_id));
create table if not exists emp_supervisors(emp_id uuid references employees(id) on delete cascade,sup_id uuid references supervisors(id) on delete cascade,primary key(emp_id,sup_id));
create table if not exists duty_blocks(id uuid primary key default gen_random_uuid(),emp_id uuid references employees(id) on delete cascade,
 kind text not null check(kind in ('duty','break')),store_id uuid references stores(id) on delete set null,t_start text not null,t_end text not null,sort int default 0);
do $$ declare t text; begin
 foreach t in array array['lookups','stores','supervisors','supervisor_stores','emp_supervisors','duty_blocks'] loop
 execute format('alter table %I enable row level security',t);
 execute format('drop policy if exists rd on %I',t);execute format('drop policy if exists wr on %I',t);
 execute format('create policy rd on %I for select to authenticated using(my_role() is not null)',t);
 execute format('create policy wr on %I for all to authenticated using(my_role() in (''staff'',''superadmin'')) with check(my_role() in (''staff'',''superadmin''))',t);
 execute format('grant select,insert,update,delete on %I to authenticated',t);
 end loop;
end $$;
