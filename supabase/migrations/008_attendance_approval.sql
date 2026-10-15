-- Explicit attendance review, independent approval, and an immutable decision trail.
begin;
alter table attendance add column if not exists review_status text not null default 'draft'
 check(review_status in ('draft','submitted','approved','returned')),
 add column if not exists edited_by uuid,add column if not exists submitted_by uuid,
 add column if not exists submitted_at timestamptz,add column if not exists decided_by uuid,
 add column if not exists decided_at timestamptz,add column if not exists review_note text;
create table if not exists attendance_review_events(
 id uuid primary key default gen_random_uuid(),emp_id uuid not null references employees(id),date date not null,
 action text not null,actor_id uuid,actor_email text,at timestamptz not null default now(),
 revision bigint not null,note text not null default '',snapshot jsonb not null default '{}'
);
create index if not exists review_events_date on attendance_review_events(date,emp_id);
alter table attendance_review_events enable row level security;
revoke all on attendance_review_events from anon,authenticated;
grant select on attendance_review_events to authenticated;
drop policy if exists read_review on attendance_review_events;
create policy read_review on attendance_review_events for select to authenticated using(my_role() in ('staff','superadmin'));

-- Retain the existing calculation/transaction implementation as a private helper.
do $$ begin
 if to_regprocedure('public.save_attendance_core(jsonb,boolean)') is null then
  execute replace(pg_get_functiondef('save_attendance_batch(jsonb,boolean)'::regprocedure),'FUNCTION public.save_attendance_batch(', 'FUNCTION public.save_attendance_core(');
 end if;
 if to_regprocedure('public.finalize_cutoff_core(date,date)') is null then
  execute replace(pg_get_functiondef('finalize_cutoff(date,date)'::regprocedure),'FUNCTION public.finalize_cutoff(', 'FUNCTION public.finalize_cutoff_core(');
 end if;
end $$;
revoke all on function save_attendance_core(jsonb,boolean),finalize_cutoff_core(date,date) from public,anon,authenticated;

create or replace function reset_attendance_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
 -- Core saves always issue a new revision. Approval RPCs also advance it, but
 -- change status explicitly; detect content edits independently of that metadata.
 if TG_OP='INSERT' or (to_jsonb(new)-array['revision','reviewed','review_status','edited_by','submitted_by','submitted_at','decided_by','decided_at','review_note'])
   is distinct from (to_jsonb(old)-array['revision','reviewed','review_status','edited_by','submitted_by','submitted_at','decided_by','decided_at','review_note'])
   or (new.revision is distinct from old.revision and new.review_status is not distinct from old.review_status) then
  new.review_status='draft';new.reviewed=false;new.edited_by=auth.uid();
  new.submitted_by=null;new.submitted_at=null;new.decided_by=null;new.decided_at=null;new.review_note=null;
 end if;
 return new;
end $$;
revoke all on function reset_attendance_review() from public,anon,authenticated;
drop trigger if exists reset_review on attendance;
create trigger reset_review before insert or update on attendance for each row execute function reset_attendance_review();

create or replace function save_attendance_batch(p_changes jsonb,p_overwrite_reviewed boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if my_role() is null or my_role() not in ('staff','superadmin') then raise exception 'Staff access required';end if;
 perform pg_advisory_xact_lock(841562);
 if exists(select 1 from jsonb_array_elements(p_changes) c join attendance a on a.emp_id=(c->>'emp_id')::uuid and a.date=(c->>'date')::date where a.review_status='submitted') then
  raise exception 'Submitted attendance must be returned before editing';end if;
 return save_attendance_core(p_changes,p_overwrite_reviewed);
end $$;
revoke all on function save_attendance_batch(jsonb,boolean) from public,anon;
grant execute on function save_attendance_batch(jsonb,boolean) to authenticated;

create or replace function review_attendance(p_rows jsonb,p_action text,p_note text default '')
returns int language plpgsql security definer set search_path=public as $$
declare c jsonb;r attendance;n int=0;
begin
 if my_role() is null or my_role() not in ('staff','superadmin') then raise exception 'Staff access required';end if;
 if p_action is null or p_action not in ('submit','approve','return') then raise exception 'Invalid review action';end if;
 if p_action<>'submit' and my_role()<>'superadmin' then raise exception 'Superadmin approval required';end if;
 if p_action='return' and coalesce(length(btrim(p_note)),0)<3 then raise exception 'Return reason required';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'Select 1 to 1000 entries';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) item group by item->>'emp_id',item->>'date' having count(*)>1) then raise exception 'Duplicate review entry';end if;
 perform pg_advisory_xact_lock(841562);
 for c in select value from jsonb_array_elements(p_rows) loop
  select * into strict r from attendance where emp_id=(c->>'emp_id')::uuid and date=(c->>'date')::date for update;
  if r.revision is distinct from (c->>'revision')::bigint then raise exception 'Attendance changed; reload before review';end if;
  if p_action='submit' then
   if r.review_status not in ('draft','returned') then raise exception 'Only draft or returned entries can be submitted';end if;
   if r.type in ('PRESENT','LATE/UT') and not r.verified then raise exception 'Record actual duty before submitting';end if;
  else
   if r.review_status<>'submitted' then raise exception 'Only submitted entries can be decided';end if;
   if p_action='approve' and (r.submitted_by=auth.uid() or r.edited_by=auth.uid()) then raise exception 'A different superadmin must approve this attendance';end if;
  end if;
  update attendance set review_status=case p_action when 'submit' then 'submitted' when 'approve' then 'approved' else 'returned' end,
   reviewed=p_action='approve',submitted_by=case when p_action='submit' then auth.uid() else submitted_by end,
   submitted_at=case when p_action='submit' then now() else submitted_at end,
   decided_by=case when p_action<>'submit' then auth.uid() end,decided_at=case when p_action<>'submit' then now() end,
   review_note=nullif(btrim(p_note),''),revision=nextval('attendance_revision_seq') where emp_id=r.emp_id and date=r.date;
  insert into attendance_review_events(emp_id,date,action,actor_id,actor_email,revision,note,snapshot)
   select r.emp_id,r.date,p_action,auth.uid(),email,r.revision,coalesce(btrim(p_note),''),to_jsonb(r) from profiles where id=auth.uid();
  n=n+1;
 end loop;
 return n;
end $$;
revoke all on function review_attendance(jsonb,text,text) from public,anon;
grant execute on function review_attendance(jsonb,text,text) to authenticated;

create or replace function finalize_cutoff(p_start date,p_end date) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if my_role() is distinct from 'superadmin' then raise exception 'Superadmin access required';end if;
 perform pg_advisory_xact_lock(841562);
 if exists(select 1 from attendance a where (a.date between p_start and p_end or exists(select 1 from jsonb_array_elements(coalesce(a.segments,'[]')) s where (s->>'date')::date between p_start and p_end)) and a.review_status<>'approved') then
  raise exception 'Unapproved attendance remains; submit and approve entries before finalization';end if;
 return finalize_cutoff_core(p_start,p_end);
end $$;
revoke all on function finalize_cutoff(date,date) from public,anon;
grant execute on function finalize_cutoff(date,date) to authenticated;
commit;
