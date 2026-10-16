-- Employee forms/imports use one transaction and reject stale drafts.
begin;
alter table employees add column if not exists revision bigint not null default 0;
create sequence if not exists employee_revision_seq;
select setval('employee_revision_seq',greatest(1,(select coalesce(max(revision),0)+1 from employees)),false);
create or replace function advance_employee_revision() returns trigger language plpgsql set search_path=public as $$
begin new.revision=nextval('employee_revision_seq');return new;end $$;
revoke all on function advance_employee_revision() from public,anon,authenticated;
drop trigger if exists employee_revision on employees;
create trigger employee_revision before insert or update on employees for each row execute function advance_employee_revision();

-- A separately saved schedule also invalidates employee forms showing its old fields.
create or replace function invalidate_employee_draft() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if pg_trigger_depth()=1 then update employees set revision=revision where id=new.emp_id;end if;
 return new;
end $$;
revoke all on function invalidate_employee_draft() from public,anon,authenticated;
drop trigger if exists invalidate_employee_draft on employee_assignment_versions;
create trigger invalidate_employee_draft after insert on employee_assignment_versions for each row execute function invalidate_employee_draft();

create or replace function save_employees(p_changes jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare c jsonb;e employees;previous employees;source employees;w wage_history;latest bigint;blocks jsonb;n integer=0;today date=(now() at time zone 'Asia/Manila')::date;
begin
 if my_role() is null or my_role() not in ('staff','superadmin') then raise exception 'Staff access required';end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 10000 then raise exception 'Select 1 to 10000 employees';end if;
 -- Assignment capture already uses this gate; acquire it before locking employee rows.
 perform pg_advisory_xact_lock(841562);
 if exists(select 1 from jsonb_array_elements(p_changes) x group by x->'employee'->>'id' having count(*)>1) then raise exception 'Duplicate employee in batch';end if;
 for c in select value from jsonb_array_elements(p_changes) loop
  if jsonb_typeof(c->'employee') is distinct from 'object' or not c ? 'expected_revision' or nullif(c->'employee'->>'id','') is null then raise exception 'Employee and expected revision required';end if;
  select * into previous from employees where id=(c->'employee'->>'id')::uuid for update;
  if previous.revision is distinct from (c->>'expected_revision')::bigint then raise exception 'Employee changed; reload before saving';end if;
  e=jsonb_populate_record(previous,(c->'employee') - 'revision');
  e.status=coalesce(e.status,'Active');e.custom=coalesce(e.custom,'{}');e.rate_override=coalesce(e.rate_override,true);
  if previous.id is null then e.time_in=coalesce(e.time_in,'08:00');e.time_out=coalesce(e.time_out,'17:00');e.rest_day=coalesce(e.rest_day,'Sun');e.hire_type=coalesce(e.hire_type,'new');end if;
  if nullif(btrim(e.emp_no),'') is null or nullif(btrim(e.last_name),'') is null then raise exception 'Employee No and Last Name are required';end if;
  if c ? 'supervisor_ids' and jsonb_typeof(c->'supervisor_ids') is distinct from 'array' then raise exception 'Invalid supervisors';end if;
  if previous.id is null then
   insert into employees select e.* returning * into e;
  else
   update employees set emp_no=e.emp_no,last_name=e.last_name,first_name=e.first_name,middle_name=e.middle_name,birth_date=e.birth_date,sex=e.sex,
    contact=e.contact,address=e.address,department=e.department,position=e.position,site=e.site,location=e.location,region=e.region,
    date_hired=e.date_hired,date_end=e.date_end,status=e.status,custom=e.custom,time_in=e.time_in,time_out=e.time_out,rest_day=e.rest_day,
    hire_type=e.hire_type,replaces_emp_id=e.replaces_emp_id,rate_override=e.rate_override where id=e.id returning * into e;
  end if;
  if c->'pay' is not null and c->'pay'<>'null'::jsonb then
   w=jsonb_populate_record(null::wage_history,c->'pay');
   if w.effective_from is null or w.hrs_per_day is null or w.hrs_per_day::text in ('NaN','Infinity','-Infinity') or w.holiday_covered is null then raise exception 'Invalid pay profile';end if;
   if exists(select 1 from wage_history where emp_id=e.id and effective_from=w.effective_from) then raise exception 'That wage date already exists; choose a new effective date';end if;
   insert into wage_history(id,emp_id,effective_from,daily_rate,hrs_per_day,holiday_covered) values(gen_random_uuid(),e.id,w.effective_from,w.daily_rate,w.hrs_per_day,w.holiday_covered);
  end if;
  if c ? 'supervisor_ids' then
   delete from emp_supervisors where emp_id=e.id;
   insert into emp_supervisors(emp_id,sup_id) select e.id,value::uuid from jsonb_array_elements_text(c->'supervisor_ids');
  end if;
  if c ? 'source_revision' then
   if previous.id is not null or e.hire_type is distinct from 'replacement' or e.replaces_emp_id is null or e.replaces_emp_id=e.id then raise exception 'Invalid replacement employee';end if;
   select * into strict source from employees where id=e.replaces_emp_id for update;
   if source.revision is distinct from (c->>'source_revision')::bigint then raise exception 'Replaced employee changed; reload before saving';end if;
   select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('id',gen_random_uuid(),'emp_id',e.id)),'[]') into blocks from employee_blocks(source.id,today) b;
   if jsonb_array_length(blocks)>0 then
    select max(version_no) into latest from employee_assignment_versions where emp_id=e.id;
    perform save_assignment_version(e.id,coalesce(e.date_hired,today),assignment_fields(e),blocks,'Copied replacement schedule',latest);
   end if;
   if nullif(c->>'replacement_status','') is not null then update employees set status=c->>'replacement_status' where id=source.id;end if;
  end if;
  n=n+1;
 end loop;
 return n;
end $$;
revoke all on function save_employees(jsonb) from public,anon;
grant execute on function save_employees(jsonb) to authenticated;
-- Older clients must refresh instead of silently bypassing the revision check.
revoke insert,update on employees from authenticated,anon;
commit;
