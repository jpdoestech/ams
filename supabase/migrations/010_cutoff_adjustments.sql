-- Additive corrections: never unlock, replace or recalculate the original period.
begin;
create table if not exists cutoff_adjustments(
 id uuid primary key default gen_random_uuid(),emp_id uuid not null references employees(id),
 lock_id uuid not null references cutoff_locks(id),date date not null,
 minutes_delta integer not null default 0 check(abs(minutes_delta)<=1440),
 amount_delta numeric(14,2) not null default 0 check(amount_delta::text not in ('NaN','Infinity','-Infinity')),
 reason text not null check(length(btrim(reason))>=3),reference text not null default '',
 original jsonb not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),
 submitted_by uuid not null,submitted_at timestamptz not null default now(),
 decided_by uuid,decided_at timestamptz,decision_note text,check(minutes_delta<>0 or amount_delta<>0)
);
create index if not exists cutoff_adjustments_dates on cutoff_adjustments(date,emp_id);
create table if not exists cutoff_adjustment_events(
 id uuid primary key default gen_random_uuid(),adjustment_id uuid not null references cutoff_adjustments(id),
 action text not null,actor_id uuid not null,at timestamptz not null default now(),note text not null
);
alter table cutoff_adjustments enable row level security;alter table cutoff_adjustment_events enable row level security;
revoke all on cutoff_adjustments,cutoff_adjustment_events from anon,authenticated;
grant select on cutoff_adjustments,cutoff_adjustment_events to authenticated;
drop policy if exists adjustment_read on cutoff_adjustments;
create policy adjustment_read on cutoff_adjustments for select to authenticated using(my_role() in ('staff','superadmin'));
drop policy if exists adjustment_event_read on cutoff_adjustment_events;
create policy adjustment_event_read on cutoff_adjustment_events for select to authenticated using(my_role() in ('staff','superadmin'));
create or replace function create_cutoff_adjustment(p_id uuid,p_emp uuid,p_date date,p_minutes integer,p_amount numeric,p_reason text,p_reference text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare lid uuid;snapshot jsonb;
begin
 if my_role() is null or my_role() not in ('staff','superadmin') then raise exception 'Staff access required';end if;
 if p_id is null or p_date is null or p_minutes is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>round(p_amount,2) or abs(p_minutes)>1440 or (p_minutes=0 and p_amount=0) or coalesce(length(btrim(p_reason)),0)<3 then raise exception 'Enter a nonzero correction and a reason; amounts use at most two decimals';end if;
 perform pg_advisory_xact_lock(841562);
 -- Client-generated identity makes a retry idempotent; a different payload is rejected.
 if exists(select 1 from cutoff_adjustments where id=p_id) then
  if exists(select 1 from cutoff_adjustments where id=p_id and submitted_by=auth.uid() and emp_id=p_emp and date=p_date and minutes_delta=p_minutes and amount_delta=p_amount and reason=btrim(p_reason) and reference=coalesce(p_reference,'')) then return p_id;end if;
  raise exception 'Adjustment identity already used';
 end if;
 select id into lid from cutoff_locks where p_date between start_date and end_date;
 if lid is null then raise exception 'Adjustments require a finalized date';end if;
 if not exists(select 1 from employees where id=p_emp and (date_hired is null or date_hired<=p_date) and (date_end is null or date_end>=p_date)) then raise exception 'Date outside employment';end if;
 snapshot=jsonb_build_object('attendance',(select to_jsonb(a) from attendance a where emp_id=p_emp and date=p_date),
  'pay',(select to_jsonb(p) from attendance_pay p where emp_id=p_emp and date=p_date),
  'entitlement',(select to_jsonb(s) from cutoff_snapshots s where emp_id=p_emp and date=p_date and lock_id=lid));
 insert into cutoff_adjustments(id,emp_id,lock_id,date,minutes_delta,amount_delta,reason,reference,original,submitted_by)
 values(p_id,p_emp,lid,p_date,p_minutes,p_amount,btrim(p_reason),coalesce(p_reference,''),snapshot,auth.uid());
 insert into cutoff_adjustment_events(adjustment_id,action,actor_id,note) values(p_id,'submitted',auth.uid(),btrim(p_reason));
 return p_id;
end $$;
create or replace function decide_cutoff_adjustment(p_id uuid,p_action text,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare r cutoff_adjustments;
begin
 if my_role() is distinct from 'superadmin' then raise exception 'Superadmin approval required';end if;
 if p_action is null or p_action not in ('approve','reject') or coalesce(length(btrim(p_note)),0)<3 then raise exception 'Decision and reason required';end if;
 perform pg_advisory_xact_lock(841562);
 select * into strict r from cutoff_adjustments where id=p_id for update;
 if r.status<>'pending' then raise exception 'Adjustment already decided; reload';end if;
 if r.submitted_by=auth.uid() then raise exception 'A different superadmin must decide this adjustment';end if;
 update cutoff_adjustments set status=case p_action when 'approve' then 'approved' else 'rejected' end,
  decided_by=auth.uid(),decided_at=now(),decision_note=btrim(p_note) where id=p_id;
 insert into cutoff_adjustment_events(adjustment_id,action,actor_id,note) values(p_id,p_action,auth.uid(),btrim(p_note));
end $$;
revoke all on function create_cutoff_adjustment(uuid,uuid,date,integer,numeric,text,text),decide_cutoff_adjustment(uuid,text,text) from public,anon;
grant execute on function create_cutoff_adjustment(uuid,uuid,date,integer,numeric,text,text),decide_cutoff_adjustment(uuid,text,text) to authenticated;
-- Decision trails are always retained, even when optional audit capture is disabled.
commit;
