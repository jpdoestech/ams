-- Finalized cut-offs preserve holiday entitlement and wage/calendar context.
begin;
create table if not exists cutoff_snapshots (
 id uuid primary key default gen_random_uuid(),lock_id uuid not null references cutoff_locks(id),emp_id uuid not null references employees(id),
 date date not null,code text not null,holiday_eligible boolean not null default false,holiday_amount numeric not null default 0,
 context jsonb not null default '{}',unique(lock_id,emp_id,date)
);
alter table cutoff_snapshots enable row level security;
revoke all on cutoff_snapshots from anon,authenticated;
create or replace view cutoff_snapshot_view with (security_barrier=true) as
 select id,lock_id,emp_id,date,code,holiday_eligible,
 case when my_role() in ('staff','superadmin') then holiday_amount end as holiday_amount
 from cutoff_snapshots where my_role() is not null and exists(select 1 from cutoff_locks l where l.id=lock_id);
grant select on cutoff_snapshot_view to authenticated;
create or replace function holiday_entitlement(p_emp uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare entitlement_code text; e employees; w wage_history; ru duty_pay_rules; prev date=p_date; v attendance; i int; eligible boolean=false;
begin
 select * into strict e from employees where id=p_emp;entitlement_code=day_code(p_emp,p_date);
 select * into w from wage_history where emp_id=p_emp and effective_from<=p_date order by effective_from desc limit 1;
 select * into ru from duty_pay_rules where duty_pay_rules.code=entitlement_code and active and effective_from<=p_date and scope='company' order by effective_from desc limit 1;
 if entitlement_code not in ('RH','RH-RD','DRH','DRH-RD') or not coalesce(w.holiday_covered,true) or coalesce(ru.unworked_pct,0)=0 then return jsonb_build_object('eligible',false,'amount',0,'known',true);end if;
 for i in 1..366 loop
  prev=prev-1;
  if day_code(p_emp,prev) not in ('RD','RH','RH-RD','DRH','DRH-RD','SNWD','SNWD-RD','DSNWD','DSNWD-RD') then exit;end if;
 end loop;
 if e.date_hired>prev or e.date_end<prev then return jsonb_build_object('eligible',false,'amount',0,'known',true);end if;
 select * into v from attendance where emp_id=p_emp and date=prev;
 eligible=v.type='LEAVE' or (v.verified and v.type in ('PRESENT','LATE/UT'));
 return jsonb_build_object('eligible',coalesce(eligible,false),'amount',case when eligible then round(coalesce(w.daily_rate,0)*ru.unworked_pct/100,2) else 0 end,
  'known',v.emp_id is not null,'previous_date',prev,'rule_id',ru.id,'wage_id',w.id,'daily_rate',w.daily_rate);
end $$;
revoke all on function holiday_entitlement(uuid,date) from public,anon,authenticated;
create or replace function finalize_cutoff(p_start date,p_end date) returns uuid language plpgsql security definer set search_path=public as $$
declare e employees; dt date; v attendance; code text; worked boolean; ent jsonb; lid uuid=gen_random_uuid(); missing int=0; w wage_history;
begin
 if my_role() is distinct from 'superadmin' then raise exception 'Superadmin access required';end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>31 then raise exception 'Invalid cut-off range';end if;
 perform pg_advisory_xact_lock(841562);
 if exists(select 1 from cutoff_locks where start_date<=p_end and end_date>=p_start) then raise exception 'An overlapping cut-off is already locked';end if;
 insert into cutoff_locks(id,start_date,end_date,locked_by) values(lid,p_start,p_end,(select email from profiles where id=auth.uid()));
 for e in select * from employees x where (x.status='Active' or x.date_end>=p_start or exists(select 1 from attendance a where a.emp_id=x.id and a.date between p_start-1 and p_end)) and (x.date_hired is null or x.date_hired<=p_end) loop
  for dt in select generate_series(p_start::timestamp,p_end::timestamp,'1 day')::date loop
   if e.date_hired>dt or e.date_end<dt then continue;end if;
   code=day_code(e.id,dt);select * into v from attendance where emp_id=e.id and date=dt;
   select exists(select 1 from attendance a cross join lateral jsonb_array_elements(coalesce(a.segments,'[]')) s where a.emp_id=e.id and a.date between dt-1 and dt and a.verified and (s->>'date')::date=dt) into worked;
   ent=jsonb_build_object('eligible',false,'amount',0,'known',true);
   if worked then
    if exists(select 1 from attendance a where a.emp_id=e.id and a.date between dt-1 and dt and a.verified and exists(select 1 from jsonb_array_elements(coalesce(a.segments,'[]')) s where (s->>'date')::date=dt) and not exists(select 1 from attendance_pay p where p.emp_id=a.emp_id and p.date=a.date)) then missing=missing+1;end if;
   elsif v.type is distinct from 'N/A' then
    if code in ('RH','RH-RD','DRH','DRH-RD') then
     ent=holiday_entitlement(e.id,dt);
     if not (ent->>'known')::boolean then missing=missing+1;end if;
     select * into w from wage_history where emp_id=e.id and effective_from<=dt order by effective_from desc limit 1;
     if (ent->>'eligible')::boolean and w.daily_rate is null then missing=missing+1;end if;
    elsif code in ('OD','SWD') and (v.emp_id is null or v.type in ('PRESENT','LATE/UT')) then missing=missing+1;
    end if;
   end if;
   insert into cutoff_snapshots(lock_id,emp_id,date,code,holiday_eligible,holiday_amount,context)
   values(lid,e.id,dt,code,(ent->>'eligible')::boolean,(ent->>'amount')::numeric,jsonb_build_object('employee',to_jsonb(e),'entitlement',ent));
  end loop;
 end loop;
 if missing>0 then raise exception '% incomplete duty, wage or holiday eligibility record(s); review before locking',missing;end if;
 return lid;
end $$;
revoke all on function finalize_cutoff(date,date) from public;
grant execute on function finalize_cutoff(date,date) to authenticated;
-- Historical snapshots and locks cannot be destructively reopened by client roles.
drop policy if exists wr on cutoff_locks;
revoke insert,update,delete on cutoff_locks from authenticated,anon;
create or replace function preserve_closed_employee() returns trigger language plpgsql set search_path=public as $$
begin
 if (new.date_hired is distinct from old.date_hired and exists(select 1 from cutoff_snapshots where emp_id=old.id))
 or (new.date_end is distinct from old.date_end and exists(select 1 from cutoff_snapshots where emp_id=old.id and date>new.date_end)) then
  raise exception 'Employment dates belong to finalized payroll; use an audited database adjustment';
 end if;return new;
end $$;
drop trigger if exists closed_employee on employees;
create trigger closed_employee before update on employees for each row execute function preserve_closed_employee();
commit;
