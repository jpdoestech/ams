-- Append-only dated assignments and schedules; existing duty/pay snapshots stay intact.
begin;
create table if not exists employee_assignment_versions(
 id uuid primary key default gen_random_uuid(),version_no bigint generated always as identity,
 emp_id uuid not null references employees(id) on delete cascade,effective_from date not null,
 snapshot jsonb not null,reason text not null,created_by uuid,created_at timestamptz not null default now()
);
create index if not exists assignment_effective on employee_assignment_versions(emp_id,effective_from desc,version_no desc);
alter table employee_assignment_versions enable row level security;
revoke all on employee_assignment_versions from anon,authenticated;
grant select on employee_assignment_versions to authenticated;
drop policy if exists assignment_read on employee_assignment_versions;
create policy assignment_read on employee_assignment_versions for select to authenticated using(my_role() is not null);
create or replace function assignment_fields(e employees) returns jsonb language sql immutable set search_path=public as $$
 select jsonb_build_object('department',e.department,'position',e.position,'site',e.site,'location',e.location,'time_in',e.time_in,'time_out',e.time_out,'rest_day',e.rest_day)
$$;
revoke all on function assignment_fields(employees) from public,anon,authenticated;
insert into employee_assignment_versions(emp_id,effective_from,snapshot,reason)
 select e.id,'0001-01-01',jsonb_build_object('employee',assignment_fields(e),'blocks',(select coalesce(jsonb_agg(to_jsonb(b) order by b.sort),'[]') from duty_blocks b where b.emp_id=e.id)),
 'Migration baseline; earlier assignment history was not recorded' from employees e
 where not exists(select 1 from employee_assignment_versions v where v.emp_id=e.id);
create or replace function employee_at(p_emp uuid,p_date date) returns employees language plpgsql stable security definer set search_path=public as $$
declare e employees;s jsonb;
begin
 select * into strict e from employees where id=p_emp;
 select snapshot->'employee' into s from employee_assignment_versions where emp_id=p_emp and effective_from<=p_date order by effective_from desc,version_no desc limit 1;
 return jsonb_populate_record(e,coalesce(s,'{}'));
end $$;
create or replace function employee_blocks(p_emp uuid,p_date date) returns setof duty_blocks language plpgsql stable security definer set search_path=public as $$
declare blocks jsonb;
begin
 select snapshot->'blocks' into blocks from employee_assignment_versions where emp_id=p_emp and effective_from<=p_date order by effective_from desc,version_no desc limit 1;
 if blocks is null then return query select * from duty_blocks where emp_id=p_emp;else return query select * from jsonb_populate_recordset(null::duty_blocks,blocks);end if;
end $$;
revoke all on function employee_at(uuid,date),employee_blocks(uuid,date) from public,anon,authenticated;

create or replace function save_assignment_version(p_emp uuid,p_from date,p_assignment jsonb,p_blocks jsonb,p_reason text,p_expected bigint)
returns uuid language plpgsql security definer set search_path=public as $$
declare e employees;b duty_blocks;v_id uuid=gen_random_uuid();latest bigint;allowed jsonb;
begin
 if my_role() is null or my_role() not in ('staff','superadmin') then raise exception 'Staff access required';end if;
 perform pg_advisory_xact_lock(841562);
 select * into strict e from employees where id=p_emp;
 select max(version_no) into latest from employee_assignment_versions where emp_id=p_emp;
 if latest is distinct from p_expected then raise exception 'Schedule changed; reload before saving';end if;
 if p_from is null or p_from<coalesce(e.date_hired,'1900-01-01') or coalesce(length(btrim(p_reason)),0)<3 then raise exception 'Effective date and reason required';end if;
 if exists(select 1 from cutoff_locks where end_date>=p_from) then raise exception 'Effective date affects finalized attendance; choose a later date';end if;
 if exists(select 1 from attendance where emp_id=p_emp and date>=p_from and review_status in ('submitted','approved')) then raise exception 'Return affected attendance before changing its schedule';end if;
 if jsonb_typeof(p_assignment) is distinct from 'object' or jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_array_length(p_blocks)>48 then raise exception 'Invalid assignment or schedule';end if;
 e=jsonb_populate_record(e,p_assignment - array['id','emp_no','date_hired','date_end','status']);allowed=assignment_fields(e);
 if e.rest_day is null or e.rest_day not in ('Sun','Mon','Tue','Wed','Thu','Fri','Sat','None') or e.time_in is null or e.time_out is null
  or e.time_in !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or e.time_out !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or e.time_in=e.time_out then raise exception 'Invalid default schedule';end if;
 if nullif(e.position,'') is not null and not exists(select 1 from department_positions m join lookups d on d.id=m.department_id join lookups p on p.id=m.position_id where d.value=e.department and p.value=e.position) then raise exception 'Position must belong to the selected department';end if;
 for b in select * from jsonb_populate_recordset(null::duty_blocks,p_blocks) loop
  if b.kind is null or b.kind not in ('duty','break') or b.t_start is null or b.t_end is null or b.t_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or b.t_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or b.t_start=b.t_end then raise exception 'Invalid schedule block';end if;
  if b.kind='duty' and not exists(select 1 from stores where id=b.store_id) then raise exception 'Choose a store for each duty block';end if;
 end loop;
 insert into employee_assignment_versions(id,emp_id,effective_from,snapshot,reason,created_by)
 values(v_id,p_emp,p_from,jsonb_build_object('employee',allowed,'blocks',p_blocks),btrim(p_reason),auth.uid());
 return v_id;
end $$;
revoke all on function save_assignment_version(uuid,date,jsonb,jsonb,text,bigint) from public,anon;
grant execute on function save_assignment_version(uuid,date,jsonb,jsonb,text,bigint) to authenticated;
create or replace function capture_assignment() returns trigger language plpgsql security definer set search_path=public as $$
declare today date=(now() at time zone 'Asia/Manila')::date;blocks jsonb;
begin
 perform pg_advisory_xact_lock(841562);
 if TG_OP='INSERT' then
  insert into employee_assignment_versions(emp_id,effective_from,snapshot,reason,created_by)
  values(new.id,'0001-01-01',jsonb_build_object('employee',assignment_fields(new),'blocks','[]'::jsonb),'Initial employee assignment',auth.uid());
 elsif assignment_fields(new) is distinct from assignment_fields(old) then
  if exists(select 1 from cutoff_locks where end_date>=today) or exists(select 1 from attendance where emp_id=new.id and date>=today and review_status in ('submitted','approved')) then raise exception 'Assignment affects protected attendance; use a later effective schedule date';end if;
  select coalesce(jsonb_agg(to_jsonb(b)),'[]') into blocks from employee_blocks(new.id,today) b;
  insert into employee_assignment_versions(emp_id,effective_from,snapshot,reason,created_by)
  values(new.id,today,jsonb_build_object('employee',assignment_fields(new),'blocks',blocks),'Employee form update effective today',auth.uid());
 end if;
 return new;
end $$;
revoke all on function capture_assignment() from public,anon,authenticated;
drop trigger if exists capture_assignment on employees;
create trigger capture_assignment after insert or update on employees for each row execute function capture_assignment();
create or replace function preserve_assignment_version() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='DELETE' and pg_trigger_depth()>1 then return old;end if;
 raise exception 'Assignment versions are immutable; insert a new version';
end $$;
revoke all on function preserve_assignment_version() from public,anon,authenticated;
drop trigger if exists immutable on employee_assignment_versions;
create trigger immutable before update or delete on employee_assignment_versions for each row execute function preserve_assignment_version();
drop trigger if exists ams_audit on employee_assignment_versions;
create trigger ams_audit after insert on employee_assignment_versions for each row execute function audit_mutation();

-- Adapt the existing tested calculators to resolve the context on the work date.
do $$ declare signature text;definition text;begin
 foreach signature in array array['day_code(uuid,date)','calculate_duty(uuid,date,text,text,integer,text)','holiday_entitlement(uuid,date)','save_attendance_core(jsonb,boolean)','finalize_cutoff_core(date,date)'] loop
  definition=pg_get_functiondef(signature::regprocedure);
  definition=replace(definition,'select * into strict e from employees where id=p_emp;','select * into strict e from employee_at(p_emp,p_date);');
  definition=replace(definition,'select * into strict e from employees where id=emp;','select * into strict e from employee_at(emp,dt);');
  definition=replace(definition,$s$from duty_blocks where emp_id=p_emp and kind='break'$s$,$s$from employee_blocks(p_emp,p_date) where kind='break'$s$);
  definition=replace(definition,'from duty_blocks b where emp_id=emp','from employee_blocks(emp,dt) b');
  definition=replace(definition,$s$jsonb_build_object('employee',to_jsonb(e),'entitlement',ent)$s$,$s$jsonb_build_object('employee',to_jsonb(employee_at(e.id,dt)),'entitlement',ent)$s$);
  if position($s$'department',e.department,'position',e.position$s$ in definition)=0 then
   definition=replace(definition,$s$'rest_day',e.rest_day,'site',e.site,'location',e.location$s$,$s$'rest_day',e.rest_day,'site',e.site,'location',e.location,'department',e.department,'position',e.position$s$);
  end if;
  execute definition;
 end loop;
end $$;
do $$ begin
 execute replace(pg_get_functiondef('audit_mutation()'::regprocedure),$s$when TG_TABLE_NAME='duty_blocks'$s$,$s$when TG_TABLE_NAME in ('duty_blocks','employee_assignment_versions')$s$);
end $$;
-- Finalization's classification already calls dated day_code; source snapshots remain immutable.
commit;
