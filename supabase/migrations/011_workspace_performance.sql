-- Free-plan reads: one conditional request, unchanged catalogs omitted, per-employee period deltas.
begin;
create table if not exists workspace_catalog_revision(id integer primary key check(id=1),revision bigint not null default 1);
insert into workspace_catalog_revision(id) values(1) on conflict do nothing;
alter table workspace_catalog_revision enable row level security;
revoke all on workspace_catalog_revision from anon,authenticated;
grant select on workspace_catalog_revision to authenticated;
drop policy if exists catalog_revision_read on workspace_catalog_revision;
create policy catalog_revision_read on workspace_catalog_revision for select to authenticated using((select my_role()) is not null);
create or replace function bump_workspace_catalog() returns trigger language plpgsql security definer set search_path=public as $$
begin update workspace_catalog_revision set revision=revision+1 where id=1;return null;end $$;
revoke all on function bump_workspace_catalog() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['employees','employee_assignment_versions','holidays','field_defs','lookups','department_positions','stores','supervisors','supervisor_stores','emp_supervisors','duty_blocks','duty_pay_rules','cutoff_locks','wage_history','employee_pay','profiles'] loop
  execute format('drop trigger if exists workspace_catalog_changed on %I',t);
  execute format('create trigger workspace_catalog_changed after insert or update or delete on %I for each statement execute function bump_workspace_catalog()',t);
 end loop;
end $$;

-- Cache row-independent identity checks once per SQL statement, retaining every policy's conditions.
do $$ declare p record; q text; c text;begin
 for p in select * from pg_policies where schemaname='public' and tablename=any(array[
  'employees','profiles','attendance','holidays','field_defs','attendance_comments','stores','supervisors','supervisor_stores','emp_supervisors','duty_blocks',
  'duty_pay_rules','employee_pay','attendance_pay','cutoff_locks','audit_log','wage_history','cutoff_snapshots','audit_settings','department_positions',
  'attendance_review_events','employee_assignment_versions','cutoff_adjustments','cutoff_adjustment_events','workspace_catalog_revision']) loop
  q=p.qual;c=p.with_check;
  if q is not null and position('SELECT my_role()' in q)=0 and position('SELECT public.my_role()' in q)=0 then
   q=regexp_replace(q,'(^|[^[:alnum:]_])(public\.)?my_role\(\)','\1(select public.my_role())','g');end if;
  if c is not null and position('SELECT my_role()' in c)=0 and position('SELECT public.my_role()' in c)=0 then
   c=regexp_replace(c,'(^|[^[:alnum:]_])(public\.)?my_role\(\)','\1(select public.my_role())','g');end if;
  if q is not null and position('SELECT auth.uid()' in q)=0 then q=replace(q,'auth.uid()','(select auth.uid())');end if;
  if c is not null and position('SELECT auth.uid()' in c)=0 then c=replace(c,'auth.uid()','(select auth.uid())');end if;
  execute format('alter policy %I on public.%I%s%s',p.policyname,p.tablename,
   case when q is null then '' else ' using ('||q||')' end,case when c is null then '' else ' with check ('||c||')' end);
 end loop;
end $$;
create index if not exists cutoff_snapshots_date_emp_idx on cutoff_snapshots(date,emp_id);
create index if not exists audit_log_recent_idx on audit_log(at desc);
create or replace view cutoff_snapshot_view with (security_barrier=true) as
 select id,lock_id,emp_id,date,code,holiday_eligible,
 case when (select my_role()) in ('staff','superadmin') then holiday_amount end as holiday_amount
 from cutoff_snapshots where (select my_role()) is not null and exists(select 1 from cutoff_locks l where l.id=lock_id);

create or replace function workspace_snapshot(p_start date,p_end date,p_catalog_token text default null,p_period_tokens jsonb default null,p_force boolean default false)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare caller_role text=my_role();catalog_version text;catalog jsonb=null;tokens jsonb;changed text[];changed_ids uuid[];period jsonb=null;replace_period boolean;
begin
 if caller_role is null then raise exception 'Active workspace access required' using errcode='42501';end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>31 then raise exception 'Choose a period of at most 32 days';end if;
 if p_period_tokens is not null and jsonb_typeof(p_period_tokens)<>'object' then raise exception 'Invalid period tokens';end if;
 select caller_role||':'||revision::text into catalog_version from workspace_catalog_revision where id=1;
 if p_force or catalog_version is distinct from p_catalog_token then
  catalog=jsonb_build_object(
   'employee_assignment_versions',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from employee_assignment_versions t),
   'employees',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from employees t),
   'holidays',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from holidays t),
   'field_defs',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from field_defs t),
   'lookups',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from lookups t),
   'department_positions',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from department_positions t),
   'stores',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from stores t),
   'supervisors',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from supervisors t),
   'supervisor_stores',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from supervisor_stores t),
   'emp_supervisors',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from emp_supervisors t),
   'duty_blocks',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from duty_blocks t),
   'duty_pay_rules',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from duty_pay_rules t),
   'cutoff_locks',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from cutoff_locks t),
   'wage_history',case when caller_role in ('staff','superadmin') then (select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from wage_history t) else '[]'::jsonb end,
   'employee_pay',case when caller_role in ('staff','superadmin') then (select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from employee_pay t) else '[]'::jsonb end
  );
 end if;
 -- A row's revision advances on every client edit/decision. Counts also detect deletions.
 -- Unlike a max-revision watermark, per-employee sums cannot miss a slower concurrent commit.
 with a as (select emp_id,count(*) n,sum(revision::numeric) rev from attendance where date between p_start and p_end group by emp_id),
 c as (select emp_id,count(*) n from attendance_comments where date between p_start and p_end group by emp_id),
 s as (select emp_id,count(*) n from cutoff_snapshot_view where date between p_start and p_end group by emp_id),
 ids as (select emp_id from a union select emp_id from c union select emp_id from s)
 select coalesce(jsonb_object_agg(ids.emp_id::text,md5(concat_ws(':',caller_role,coalesce(a.n,0),coalesce(a.rev,0),coalesce(c.n,0),coalesce(s.n,0)))),'{}')
 into tokens from ids left join a using(emp_id) left join c using(emp_id) left join s using(emp_id);
 replace_period=p_force or p_period_tokens is null;
 select coalesce(array_agg(k),'{}') into changed from (
  select k from jsonb_object_keys(tokens) k where replace_period or tokens->>k is distinct from p_period_tokens->>k
  union select k from jsonb_object_keys(coalesce(p_period_tokens,'{}')) k where not tokens ? k
 ) differences;
 changed_ids=changed::uuid[];
 if replace_period or cardinality(changed)>0 then
  period=jsonb_build_object('replace',replace_period,'employees',to_jsonb(changed),
   'attendance',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from attendance t where date between p_start and p_end and emp_id=any(changed_ids)),
   'attendance_comments',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from attendance_comments t where date between p_start and p_end and emp_id=any(changed_ids)),
   'attendance_pay',case when caller_role in ('staff','superadmin') then (select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from attendance_pay t where date between p_start and p_end and emp_id=any(changed_ids)) else '[]'::jsonb end,
   'cutoff_snapshot_view',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from cutoff_snapshot_view t where date between p_start and p_end and emp_id=any(changed_ids))
  );
 end if;
 return jsonb_build_object('role',caller_role,'catalog_token',catalog_version,'catalog',catalog,
  'period_tokens',case when period is null then null when replace_period then tokens else
   (select coalesce(jsonb_object_agg(k,tokens->k),'{}') from unnest(changed) k where tokens ? k) end,'period',period);
end $$;
revoke all on function workspace_snapshot(date,date,text,jsonb,boolean) from public,anon;
grant execute on function workspace_snapshot(date,date,text,jsonb,boolean) to authenticated;
commit;
