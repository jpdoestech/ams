-- Configurable, server-enforced audit scopes. Existing history remains immutable.
create table if not exists audit_settings (
 id integer primary key check (id=1),
 enabled boolean not null default true,
 scopes text[] not null default array['employees','attendance','schedules','standards','pay','users','comments','cutoffs'],
 check (scopes <@ array['employees','attendance','schedules','standards','pay','users','comments','cutoffs']::text[])
);
insert into audit_settings(id) values(1) on conflict(id) do nothing;
alter table audit_settings enable row level security;
revoke all on audit_settings from anon,authenticated;
grant select,update on audit_settings to authenticated;
drop policy if exists audit_settings_read on audit_settings;
create policy audit_settings_read on audit_settings for select to authenticated using(my_role()='superadmin');
drop policy if exists audit_settings_write on audit_settings;
create policy audit_settings_write on audit_settings for update to authenticated using(my_role()='superadmin') with check(my_role()='superadmin');

create or replace function audit_mutation() returns trigger language plpgsql security definer set search_path=public as $$
declare category text;
begin
 category:=case
  when TG_TABLE_NAME in ('employees','emp_supervisors') then 'employees'
  when TG_TABLE_NAME in ('attendance','attendance_pay') then 'attendance'
  when TG_TABLE_NAME='duty_blocks' then 'schedules'
  when TG_TABLE_NAME in ('employee_pay','wage_history','duty_pay_rules') then 'pay'
  when TG_TABLE_NAME='profiles' then 'users'
  when TG_TABLE_NAME='attendance_comments' then 'comments'
  when TG_TABLE_NAME='cutoff_locks' then 'cutoffs'
  else 'standards' end;
 -- Settings changes always leave a trace, including disabling audit capture.
 if TG_TABLE_NAME='audit_settings' or exists(select 1 from audit_settings where id=1 and enabled and category=any(scopes)) then
  insert into audit_log(user_email,action,detail) values(coalesce((select email from profiles where id=auth.uid()),'database-owner'),
   TG_TABLE_NAME||'.'||lower(TG_OP),jsonb_build_object('actor_id',auth.uid(),'category',case when TG_TABLE_NAME='audit_settings' then 'settings' else category end,
   'old',case when TG_OP<>'INSERT' then to_jsonb(old) end,'new',case when TG_OP<>'DELETE' then to_jsonb(new) end));
 end if;
 return coalesce(new,old);
end $$;
revoke all on function audit_mutation() from public,anon,authenticated;
drop trigger if exists ams_audit on audit_settings;
create trigger ams_audit after update on audit_settings for each row execute function audit_mutation();
