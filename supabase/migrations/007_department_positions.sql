-- Preserve existing assignments and make department/position choices explicit.
insert into lookups(kind,value)
 select distinct 'department',department from employees where nullif(btrim(department),'') is not null on conflict(kind,value) do nothing;
insert into lookups(kind,value)
 select distinct 'position',position from employees where nullif(btrim(position),'') is not null on conflict(kind,value) do nothing;
create table if not exists department_positions(
 department_id uuid not null references lookups(id) on delete cascade,
 position_id uuid not null references lookups(id) on delete cascade,
 primary key(department_id,position_id)
);
insert into department_positions(department_id,position_id)
 select distinct d.id,p.id from employees e join lookups d on d.kind='department' and d.value=e.department
 join lookups p on p.kind='position' and p.value=e.position on conflict do nothing;
alter table department_positions enable row level security;
revoke all on department_positions from anon,authenticated;
grant select,insert,delete on department_positions to authenticated;
drop policy if exists department_positions_read on department_positions;
create policy department_positions_read on department_positions for select to authenticated using(my_role() is not null);
drop policy if exists department_positions_write on department_positions;
create policy department_positions_write on department_positions for all to authenticated using(my_role() in ('staff','superadmin')) with check(my_role() in ('staff','superadmin'));
-- Upsert's conflict-update path needs UPDATE; the same RLS policy applies.
grant update on department_positions to authenticated;
create or replace function check_department_position() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME='department_positions' then
  if not exists(select 1 from lookups where id=new.department_id and kind='department') or
     not exists(select 1 from lookups where id=new.position_id and kind='position') then raise exception 'Choose a department and a position'; end if;
 else
  if TG_OP='UPDATE' and new.department is not distinct from old.department and new.position is not distinct from old.position then return new; end if;
  if nullif(new.position,'') is not null and not exists(
   select 1 from department_positions m join lookups d on d.id=m.department_id join lookups p on p.id=m.position_id
   where d.value=new.department and p.value=new.position
  ) then raise exception 'Position must belong to the selected department'; end if;
 end if;
 return new;
end $$;
revoke all on function check_department_position() from public,anon,authenticated;
drop trigger if exists check_department_position on department_positions;
create trigger check_department_position before insert or update on department_positions for each row execute function check_department_position();
drop trigger if exists check_employee_department_position on employees;
create trigger check_employee_department_position before insert or update on employees for each row execute function check_department_position();
drop trigger if exists ams_audit on department_positions;
create trigger ams_audit after insert or update or delete on department_positions for each row execute function audit_mutation();
