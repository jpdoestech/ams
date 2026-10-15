-- v4: DOLE duty types & pay rules, actual duty on attendance, N/A, codes, regions, cut-off locks, audit (safe to re-run)
alter table employees add column if not exists date_end date;
alter table stores add column if not exists code text;
alter table supervisors add column if not exists code text;
create unique index if not exists stores_code_uq on stores(lower(code)) where code is not null;
create unique index if not exists supervisors_code_uq on supervisors(lower(code)) where code is not null;
alter table lookups add column if not exists parent text;
alter table lookups drop constraint if exists lookups_kind_check;
alter table lookups add constraint lookups_kind_check check (kind in ('department','position','assignment_location','status','region','city'));
alter table holidays drop constraint if exists holidays_kind_check;
alter table holidays add constraint holidays_kind_check check (kind in ('LEGAL','SPECIAL','SPECIAL_WORKING'));  -- LEGAL=regular holiday, SPECIAL=special non-working, SPECIAL_WORKING; location 'ALL' = national
alter table attendance drop constraint if exists attendance_type_check;
alter table attendance add constraint attendance_type_check check (type in ('PRESENT','ABSENT','LEAVE','LEAVE-U','DAY-OFF','AWOL/P','LATE/UT','N/A'));
alter table attendance add column if not exists time_in text, add column if not exists time_out text, add column if not exists break_min int,
 add column if not exists duty_code text, add column if not exists override_code text, add column if not exists override_reason text,
 add column if not exists reg_min int default 0, add column if not exists ot_min int default 0, add column if not exists nsd_min int default 0,
 add column if not exists segments jsonb, add column if not exists source text default 'manual',
 add column if not exists verified boolean default false, add column if not exists reviewed boolean default false;   -- legacy rows stay verified=false: nothing is fabricated
create table if not exists duty_pay_rules(id uuid primary key default gen_random_uuid(), code text not null, label text, htype text,
 mult_reg numeric not null, mult_ot numeric not null, nsd_pct numeric not null default 10, unworked_pct numeric not null default 0, priority int default 0,
 effective_from date not null default '2000-01-01', scope text not null default 'company', source text, notes text, active boolean default true,
 created_by text, created_at timestamptz default now(), unique(code,effective_from,scope));
insert into duty_pay_rules(code,label,htype,mult_reg,mult_ot,unworked_pct,priority,source) values
 ('OD','Ordinary day','ordinary',1,1.25,0,0,'DOLE Handbook on Workers'' Statutory Monetary Benefits (2024); Labor Code Book III'),
 ('RD','Scheduled rest day worked','rest',1.3,1.69,0,1,'DOLE Handbook (2024)'),
 ('SNWD','Special non-working day worked','special_nw',1.3,1.69,0,2,'DOLE Handbook (2024)'),
 ('SNWD-RD','Special non-working day on rest day worked','special_nw_rd',1.5,1.95,0,3,'DOLE Handbook (2024)'),
 ('DSNWD','Two coinciding special non-working days worked','double_special_nw',1.5,1.95,0,4,'DOLE Handbook (2024)'),
 ('DSNWD-RD','Double special non-working day on rest day worked','double_special_nw_rd',1.95,2.535,0,5,'DOLE Handbook (2024)'),
 ('RH','Regular holiday worked','regular',2,2.6,100,6,'DOLE Handbook (2024)'),
 ('RH-RD','Regular holiday on rest day worked','regular_rd',2.6,3.38,100,7,'DOLE Handbook (2024)'),
 ('DRH','Two coinciding regular holidays worked','double_regular',3,3.9,200,8,'DOLE Handbook (2024)'),
 ('DRH-RD','Double regular holiday on rest day worked','double_regular_rd',3.9,5.07,200,9,'DOLE Handbook (2024)'),
 ('SWD','Special working day (ordinary workday)','special_working',1,1.25,0,10,'DOLE Handbook (2024)')
 on conflict do nothing;
create table if not exists employee_pay(emp_id uuid primary key references employees(id) on delete cascade, daily_rate numeric, hrs_per_day numeric default 8, holiday_covered boolean default true);
create table if not exists attendance_pay(emp_id uuid references employees(id) on delete cascade, date date not null, gross numeric, comps jsonb, calculated_at timestamptz default now(), primary key(emp_id,date));
create table if not exists cutoff_locks(id uuid primary key default gen_random_uuid(), start_date date not null, end_date date not null, note text, locked_by text, locked_at timestamptz default now());
create table if not exists audit_log(id uuid primary key default gen_random_uuid(), at timestamptz default now(), user_email text, action text, detail jsonb);
-- server-side cut-off lock: no insert/update/delete on attendance or attendance_pay inside a locked range
create or replace function chk_lock() returns trigger language plpgsql security definer set search_path=public as $$
declare d date := coalesce(new.date, old.date);
begin if exists(select 1 from cutoff_locks where d between start_date and end_date) then raise exception 'Cut-off containing % is locked', d; end if;
 return coalesce(new, old); end $$;
drop trigger if exists attendance_lock on attendance; create trigger attendance_lock before insert or update or delete on attendance for each row execute function chk_lock();
drop trigger if exists attendance_pay_lock on attendance_pay; create trigger attendance_pay_lock before insert or update or delete on attendance_pay for each row execute function chk_lock();
do $$ declare t text; begin
 foreach t in array array['duty_pay_rules','employee_pay','attendance_pay','cutoff_locks','audit_log'] loop
  execute format('alter table %I enable row level security',t);
  execute format('drop policy if exists rd on %I',t); execute format('drop policy if exists wr on %I',t);
 end loop; end $$;
create policy rd on duty_pay_rules for select using (my_role() is not null);
create policy wr on duty_pay_rules for all using (my_role()='superadmin') with check (my_role()='superadmin');
create policy rd on employee_pay for select using (my_role() in ('superadmin','staff'));            -- wages hidden from viewers server-side
create policy wr on employee_pay for all using (my_role() in ('superadmin','staff')) with check (my_role() in ('superadmin','staff'));
create policy rd on attendance_pay for select using (my_role() in ('superadmin','staff'));          -- amounts hidden from viewers server-side
create policy wr on attendance_pay for all using (my_role() in ('superadmin','staff')) with check (my_role() in ('superadmin','staff'));
create policy rd on cutoff_locks for select using (my_role() is not null);
create policy wr on cutoff_locks for all using (my_role()='superadmin') with check (my_role()='superadmin');
create policy rd on audit_log for select using (my_role()='superadmin');
create policy wr on audit_log for insert with check (my_role() in ('superadmin','staff'));
