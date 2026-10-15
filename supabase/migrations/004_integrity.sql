-- v5: atomic attendance, authoritative numeric calculations, concurrency and audit.
-- Apply after v4. Single organization per database (no tenant hierarchy exists).
begin;
alter table attendance add column if not exists revision bigint not null default 0,
 add column if not exists schedule_snapshot jsonb;
create sequence if not exists attendance_revision_seq;
select setval('attendance_revision_seq',greatest(1,(select coalesce(max(revision),0)+1 from attendance)),false);
alter table holidays add column if not exists source text,add column if not exists overlap_group text;
create table if not exists wage_history (
 id uuid primary key default gen_random_uuid(),emp_id uuid not null references employees(id) on delete cascade,
 effective_from date not null,daily_rate numeric check(daily_rate>=0),hrs_per_day numeric not null default 8 check(hrs_per_day>0 and hrs_per_day<=24),
 holiday_covered boolean not null default true,unique(emp_id,effective_from)
);
insert into wage_history(emp_id,effective_from,daily_rate,hrs_per_day,holiday_covered)
 select emp_id,'2000-01-01',daily_rate,hrs_per_day,holiday_covered from employee_pay on conflict do nothing;
alter table wage_history enable row level security;
drop policy if exists rd on wage_history;drop policy if exists wr on wage_history;
create policy rd on wage_history for select to authenticated using(my_role() in ('staff','superadmin'));
create policy wr on wage_history for insert to authenticated with check(my_role() in ('staff','superadmin'));
-- upsert clients require UPDATE privilege even for the insert path; no UPDATE
-- policy exists, and the immutable trigger rejects any owner-side replacement.
grant select,insert,update on wage_history to authenticated;
alter table wage_history drop constraint if exists wage_finite;
alter table wage_history add constraint wage_finite check(daily_rate is null or daily_rate::text not in ('NaN','Infinity','-Infinity'));
-- Preserve used rule and wage versions. Corrections require a new effective date.
create or replace function immutable_version() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Versions are immutable; insert a new effective date'; end $$;
drop trigger if exists immutable on wage_history;
create trigger immutable before update or delete on wage_history for each row execute function immutable_version();
drop trigger if exists immutable on duty_pay_rules;
create trigger immutable before update or delete on duty_pay_rules for each row execute function immutable_version();
create or replace function validate_rule() returns trigger language plpgsql set search_path=public as $$
declare mr numeric; mo numeric;
begin
 select a,b into mr,mo from (values ('OD',1::numeric,1.25::numeric),('RD',1.3,1.69),('SNWD',1.3,1.69),('SNWD-RD',1.5,1.95),
 ('DSNWD',1.5,1.95),('DSNWD-RD',1.95,2.535),('RH',2,2.6),('RH-RD',2.6,3.38),('DRH',3,3.9),('DRH-RD',3.9,5.07),('SWD',1,1.25)) as q(c,a,b) where c=new.code;
 if mr is null or new.scope<>'company' or not new.active or new.mult_reg<mr or new.mult_ot<mo or new.nsd_pct<10 or new.unworked_pct<0
 or new.mult_reg::text in ('NaN','Infinity') or new.mult_ot::text in ('NaN','Infinity') or new.nsd_pct::text in ('NaN','Infinity') or new.unworked_pct::text in ('NaN','Infinity') then
 raise exception 'Invalid pay rule, unsupported scope or below minimum'; end if;
 return new;
end $$;
drop trigger if exists valid_rule on duty_pay_rules;
create trigger valid_rule before insert on duty_pay_rules for each row execute function validate_rule();
create or replace function day_code(p_emp uuid,p_date date) returns text language plpgsql stable security definer set search_path=public as $$
declare e employees; rd boolean; rg int; sp int; sw boolean; dr boolean; ds boolean;
begin
 select * into strict e from employees where id=p_emp;
 rd=coalesce(e.rest_day= (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from p_date)::int+1],false);
 select count(*) filter(where kind='LEGAL'),count(*) filter(where kind='SPECIAL'),coalesce(bool_or(kind='SPECIAL_WORKING'),false) into rg,sp,sw
 from (select distinct kind,lower(coalesce(name,'')) from holidays where date=p_date and location in ('ALL',e.location)) q;
 select exists(select 1 from holidays where date=p_date and location in ('ALL',e.location) and kind='LEGAL' and overlap_group is not null and source is not null group by overlap_group having count(distinct lower(name))>=2),
 exists(select 1 from holidays where date=p_date and location in ('ALL',e.location) and kind='SPECIAL' and overlap_group is not null and source is not null group by overlap_group having count(distinct lower(name))>=2) into dr,ds;
 return case when rg>0 then (case when dr then 'DRH' else 'RH' end)||case when rd then '-RD' else '' end
 when sp>0 then (case when ds then 'DSNWD' else 'SNWD' end)||case when rd then '-RD' else '' end
 when rd then 'RD' when sw then 'SWD' else 'OD' end;
end $$;
-- These helpers are private: they access wages and return privileged components.
create or replace function calculate_duty(p_emp uuid,p_date date,p_in text,p_out text,p_break int,p_override text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e employees; w wage_history; ru duty_pay_rules; start_m int; end_m int; span int; normal_m int; hourly numeric;
 k int; worked int=0; absolute_m int; clock_m int; dt date; cd text; night boolean; ot boolean; seg jsonb; segs jsonb='{}'; result jsonb='[]';
 breaks jsonb='[]'; b duty_blocks; offset_m int; break_total int=0; nreg int=0; notm int=0; nnight int=0; vbase numeric; vprem numeric; vot numeric; vnsd numeric; total numeric=0;
begin
 if p_in !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_out !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid punches'; end if;
 select * into strict e from employees where id=p_emp;
 select * into w from wage_history where emp_id=p_emp and effective_from<=p_date order by effective_from desc limit 1;
 normal_m=round(coalesce(w.hrs_per_day,8)*60);hourly=coalesce(w.daily_rate,0)/coalesce(w.hrs_per_day,8);
 start_m=split_part(p_in,':',1)::int*60+split_part(p_in,':',2)::int;end_m=split_part(p_out,':',1)::int*60+split_part(p_out,':',2)::int;
 span=(end_m-start_m+1440)%1440;
 if span=0 or p_break<0 or p_break>=span or p_break is null then raise exception 'Invalid shift or break duration'; end if;
 for b in select * from duty_blocks where emp_id=p_emp and kind='break' loop
  offset_m=(extract(hour from b.t_start::time)::int*60+extract(minute from b.t_start::time)::int-start_m+1440)%1440;
  break_total=break_total+(extract(epoch from (b.t_end::time-b.t_start::time))::int/60+1440)%1440;
  breaks=breaks||jsonb_build_array(jsonb_build_array(offset_m,offset_m+(extract(epoch from (b.t_end::time-b.t_start::time))::int/60+1440)%1440));
 end loop;
 if break_total<>p_break or jsonb_array_length(breaks)=0
 or exists(select 1 from jsonb_array_elements(breaks) q where (q->>0)::int<0 or (q->>1)::int>span)
 or exists(select 1 from jsonb_array_elements(breaks) with ordinality lhs(v,i),jsonb_array_elements(breaks) with ordinality rhs(v,i) where lhs.i<rhs.i and (lhs.v->>0)::int<(rhs.v->>1)::int and (rhs.v->>0)::int<(lhs.v->>1)::int) then
  offset_m=greatest(0,(span-p_break)/2);breaks=jsonb_build_array(jsonb_build_array(offset_m,offset_m+p_break));
 end if;
 for k in 0..span-1 loop
  if exists(select 1 from jsonb_array_elements(breaks) q where k>=(q->>0)::int and k<(q->>1)::int) then continue; end if;
  absolute_m=start_m+k;dt=p_date+absolute_m/1440;clock_m=absolute_m%1440;night=clock_m>=1320 or clock_m<360;ot=worked>=normal_m;worked=worked+1;
  seg=segs->dt::text;
  if seg is null then
   cd=coalesce(p_override,day_code(p_emp,dt));
   seg=jsonb_build_object('date',dt,'code',cd,'reg',0,'ot',0,'nsd',0,'nsdOt',0);
  end if;
  if ot then seg=jsonb_set(seg,'{ot}',to_jsonb((seg->>'ot')::int+1));else seg=jsonb_set(seg,'{reg}',to_jsonb((seg->>'reg')::int+1));end if;
  if night then
   if ot then seg=jsonb_set(seg,'{nsdOt}',to_jsonb((seg->>'nsdOt')::int+1));else seg=jsonb_set(seg,'{nsd}',to_jsonb((seg->>'nsd')::int+1));end if;
  end if;
  segs=jsonb_set(segs,array[dt::text],seg,true);
 end loop;
 for seg in select value from jsonb_each(segs) order by key loop
  select * into ru from duty_pay_rules where code=seg->>'code' and scope='company' and active and effective_from<=(seg->>'date')::date order by effective_from desc limit 1;
  if ru.id is null then raise exception 'No effective pay rule for %',seg->>'code';end if;
  vbase=round(hourly*(seg->>'reg')::numeric/60,2);vprem=round(hourly*(seg->>'reg')::numeric/60*(ru.mult_reg-1),2);
  vot=round(hourly*(seg->>'ot')::numeric/60*ru.mult_ot,2);vnsd=round(hourly/60*((seg->>'nsd')::numeric*ru.mult_reg+(seg->>'nsdOt')::numeric*ru.mult_ot)*ru.nsd_pct/100,2);
  seg=seg||jsonb_build_object('mr',ru.mult_reg,'mo',ru.mult_ot,'rule_id',ru.id,'rule_from',ru.effective_from,'nsd_pct',ru.nsd_pct,
   'base',vbase,'prem',vprem,'otAmt',vot,'nsdAmt',vnsd,'gross',vbase+vprem+vot+vnsd);
  result=result||jsonb_build_array(seg);total=total+vbase+vprem+vot+vnsd;nreg=nreg+(seg->>'reg')::int;notm=notm+(seg->>'ot')::int;nnight=nnight+(seg->>'nsd')::int+(seg->>'nsdOt')::int;
 end loop;
 return jsonb_build_object('segs',result,'gross',total,'regMin',nreg,'otMin',notm,'nsdMin',nnight,'workedMin',worked,'hourly',hourly,
 'daily',w.daily_rate,'hpd',coalesce(w.hrs_per_day,8),'wage_id',w.id,'wage_from',w.effective_from);
end $$;
revoke all on function calculate_duty(uuid,date,text,text,int,text) from public,anon,authenticated;
revoke all on function day_code(uuid,date) from public,anon,authenticated;
-- Every successful mutation generates an attributed audit row in the same transaction.
create or replace function audit_mutation() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into audit_log(user_email,action,detail) values(coalesce((select email from profiles where id=auth.uid()),'database-owner'),
 TG_TABLE_NAME||'.'||lower(TG_OP),jsonb_build_object('actor_id',auth.uid(),'old',case when TG_OP<>'INSERT' then to_jsonb(old) end,'new',case when TG_OP<>'DELETE' then to_jsonb(new) end));
 return coalesce(new,old);
end $$;
do $$ declare t text; begin
 foreach t in array array['employees','profiles','attendance','attendance_pay','employee_pay','wage_history','duty_pay_rules','holidays','cutoff_locks','field_defs','lookups','stores','supervisors','supervisor_stores','emp_supervisors','duty_blocks','attendance_comments'] loop
 execute format('drop trigger if exists ams_audit on %I',t);
 execute format('create trigger ams_audit after insert or update or delete on %I for each row execute function audit_mutation()',t);
 end loop;
end $$;
-- Serialize locking and attendance writes; check both source and calendar segment dates.
create or replace function chk_lock() returns trigger language plpgsql security definer set search_path=public as $$
declare d date; j jsonb;
begin
 perform pg_advisory_xact_lock(841562);
 if TG_OP<>'INSERT' then
  d=old.date;j=to_jsonb(old);
  if exists(select 1 from cutoff_locks where d between start_date and end_date or exists(select 1 from jsonb_array_elements(coalesce(nullif(j->'segments','null'),nullif(j->'comps'->'segs','null'),'[]')) s where (s->>'date')::date between start_date and end_date)) then raise exception 'Cut-off is locked'; end if;
 end if;
 if TG_OP<>'DELETE' then
  d=new.date;j=to_jsonb(new);
  if exists(select 1 from cutoff_locks where d between start_date and end_date or exists(select 1 from jsonb_array_elements(coalesce(nullif(j->'segments','null'),nullif(j->'comps'->'segs','null'),'[]')) s where (s->>'date')::date between start_date and end_date)) then raise exception 'Cut-off is locked'; end if;
 end if;
 return coalesce(new,old);
end $$;
create or replace function serialize_lock() returns trigger language plpgsql set search_path=public as $$
begin perform pg_advisory_xact_lock(841562);if TG_OP<>'DELETE' and new.start_date>new.end_date then raise exception 'Invalid lock range';end if;return coalesce(new,old);end $$;
drop trigger if exists serialize on cutoff_locks;
create trigger serialize before insert or update or delete on cutoff_locks for each row execute function serialize_lock();
-- Restrict attendance/pay writes to this RPC. Never trust client-computed amounts.
do $$ declare p record;begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('attendance','attendance_pay') and cmd<>'SELECT' loop
 execute format('drop policy %I on %I',p.policyname,p.tablename);end loop;
end $$;
revoke insert,update,delete on attendance,attendance_pay from authenticated,anon;
grant select on attendance,attendance_pay,duty_pay_rules,employee_pay,cutoff_locks,audit_log to authenticated;
grant insert,update,delete on duty_pay_rules,employee_pay,cutoff_locks to authenticated;
drop policy if exists wr on audit_log;
revoke insert,update,delete on audit_log from authenticated,anon;
create or replace function save_attendance_batch(p_changes jsonb,p_overwrite_reviewed boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c jsonb; r jsonb; oldrow attendance; e employees; emp uuid; dt date; expected bigint; rr jsonb; segs jsonb; fullsegs jsonb; topcode text; late_m int; ut_m int; vtype text;
begin
 if my_role() is null or my_role() not in ('staff','superadmin') then raise exception 'Staff access required';end if;
 if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>10000 or jsonb_array_length(p_changes)=0 then raise exception 'Invalid batch size';end if;
 perform pg_advisory_xact_lock(841562);
 if exists(select 1 from jsonb_array_elements(p_changes) q group by q->>'emp_id',q->>'date' having count(*)>1) then raise exception 'Duplicate employee/date in batch';end if;
 for c in select value from jsonb_array_elements(p_changes) loop
  emp=(c->>'emp_id')::uuid;dt=(c->>'date')::date;expected=(c->>'expected_revision')::bigint;
  if not c ? 'expected_revision' then raise exception 'Expected revision is required';end if;
  select * into strict e from employees where id=emp;
  select * into oldrow from attendance where emp_id=emp and date=dt;
  if exists(select 1 from cutoff_locks where dt between start_date and end_date) then raise exception 'Cut-off is locked';end if;
  if oldrow.revision is distinct from expected then raise exception 'Attendance changed; reload before saving';end if;
  if oldrow.reviewed and not p_overwrite_reviewed then raise exception 'Reviewed entry requires explicit overwrite';end if;
  if e.date_hired>dt or e.date_end<dt then raise exception 'Date outside employment';end if;
  r=c->'row';
  if r is null or r='null'::jsonb then delete from attendance_pay where emp_id=emp and date=dt;delete from attendance where emp_id=emp and date=dt;continue;end if;
  vtype=r->>'type';
  if vtype is null or vtype not in ('PRESENT','ABSENT','LEAVE','LEAVE-U','DAY-OFF','AWOL/P','LATE/UT','N/A') then raise exception 'Invalid status';end if;
  if coalesce(r->>'override_code','')<>'' and coalesce(btrim(r->>'override_reason'),'')='' then raise exception 'Override reason required';end if;
  rr=null;segs=null;late_m=coalesce((r->>'late')::int,0);ut_m=coalesce((r->>'ut')::int,0);
  if coalesce(r->>'time_in','')<>'' or coalesce(r->>'time_out','')<>'' then
   if coalesce(r->>'time_in','')='' or coalesce(r->>'time_out','')='' then raise exception 'Both punches required';end if;
   rr=calculate_duty(emp,dt,r->>'time_in',r->>'time_out',(r->>'break_min')::int,nullif(r->>'override_code',''));
   fullsegs=rr->'segs';
   select jsonb_agg(s - array['base','prem','otAmt','nsdAmt','gross','mr','mo','nsd_pct']) into segs from jsonb_array_elements(fullsegs) s;
   select s->>'code' into topcode from jsonb_array_elements(fullsegs) s order by (s->>'reg')::int+(s->>'ot')::int desc limit 1;
   late_m=greatest(0,((extract(epoch from ((r->>'time_in')::time-coalesce(e.time_in,'08:00')::time))::int/60+2160)%1440)-720);
   ut_m=greatest(0,((extract(epoch from (coalesce(e.time_out,'17:00')::time-(r->>'time_out')::time))::int/60+2160)%1440)-720);
   vtype=case when late_m+ut_m>0 then 'LATE/UT' else 'PRESENT' end;
  else topcode=null;end if;
  if late_m<0 or ut_m<0 then raise exception 'Negative late/undertime';end if;
  delete from attendance_pay where emp_id=emp and date=dt;
  insert into attendance(emp_id,date,type,late,ut,time_in,time_out,break_min,duty_code,override_code,override_reason,reg_min,ot_min,nsd_min,segments,source,verified,reviewed,revision,schedule_snapshot)
  values(emp,dt,vtype,late_m,ut_m,nullif(r->>'time_in',''),nullif(r->>'time_out',''),(r->>'break_min')::int,topcode,nullif(r->>'override_code',''),nullif(r->>'override_reason',''),
   coalesce((rr->>'regMin')::int,0),coalesce((rr->>'otMin')::int,0),coalesce((rr->>'nsdMin')::int,0),segs,case when r->>'source'='import' then 'import' else 'manual' end,rr is not null,
   nullif(r->>'override_code','') is not null,nextval('attendance_revision_seq'),jsonb_build_object('time_in',e.time_in,'time_out',e.time_out,'rest_day',e.rest_day,'site',e.site,'location',e.location,'blocks',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from duty_blocks b where emp_id=emp)))
  on conflict(emp_id,date) do update set type=excluded.type,late=excluded.late,ut=excluded.ut,time_in=excluded.time_in,time_out=excluded.time_out,break_min=excluded.break_min,
   duty_code=excluded.duty_code,override_code=excluded.override_code,override_reason=excluded.override_reason,reg_min=excluded.reg_min,ot_min=excluded.ot_min,nsd_min=excluded.nsd_min,
   segments=excluded.segments,source=excluded.source,verified=excluded.verified,reviewed=excluded.reviewed,revision=excluded.revision,schedule_snapshot=excluded.schedule_snapshot;
  if rr is not null and rr->>'daily' is not null then
   insert into attendance_pay(emp_id,date,gross,comps) values(emp,dt,(rr->>'gross')::numeric,rr);
  end if;
 end loop;
 return jsonb_build_object('saved',jsonb_array_length(p_changes));
end $$;
revoke all on function save_attendance_batch(jsonb,boolean) from public;
grant execute on function save_attendance_batch(jsonb,boolean) to authenticated;
-- Prevent deleting employees with payroll history; use separation date/status.
create or replace function preserve_employee_history() returns trigger language plpgsql set search_path=public as $$
begin if exists(select 1 from attendance where emp_id=old.id) then raise exception 'Employee has attendance history; use separation date and status';end if;return old;end $$;
drop trigger if exists preserve_history on employees;
create trigger preserve_history before delete on employees for each row execute function preserve_employee_history();
create index if not exists attendance_date_emp_idx on attendance(date,emp_id);
create index if not exists attendance_pay_date_emp_idx on attendance_pay(date,emp_id);
create index if not exists comments_date_idx on attendance_comments(date);
create index if not exists holiday_date_location_idx on holidays(date,location);
commit;
