-- Repeating monthly boundaries, effective-dated and independent of attendance dates.
begin;
create table if not exists cutoff_schedules(
 id uuid primary key default gen_random_uuid(),version_no bigint generated always as identity,
 effective_month date not null check(extract(day from effective_month)=1),
 first_end integer not null check(first_end between 1 and 27),second_end integer,
 check(second_end is null or second_end>first_end and second_end<=31)
);
create index if not exists cutoff_schedule_effective on cutoff_schedules(effective_month desc,version_no desc);
alter table cutoff_schedules enable row level security;
revoke all on cutoff_schedules from anon,authenticated;
grant select on cutoff_schedules to authenticated;
drop policy if exists cutoff_schedule_read on cutoff_schedules;
create policy cutoff_schedule_read on cutoff_schedules for select to authenticated using((select my_role()) is not null);
drop trigger if exists immutable on cutoff_schedules;
create trigger immutable before update or delete on cutoff_schedules for each row execute function immutable_version();
drop trigger if exists ams_audit on cutoff_schedules;
create trigger ams_audit after insert on cutoff_schedules for each row execute function audit_mutation();
drop trigger if exists workspace_catalog_changed on cutoff_schedules;
create trigger workspace_catalog_changed after insert on cutoff_schedules for each statement execute function bump_workspace_catalog();

create or replace function cutoff_ranges(p_month date,p_extra jsonb default null) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare first_day integer;boundary integer;next_boundary integer;first_start date;first_finish date;second_finish date;last_previous date;last_current date;
begin
 p_month=date_trunc('month',p_month)::date;
 if p_month is null then raise exception 'Pick a valid payroll month';end if;
 with versions as (select effective_month,first_end,second_end,version_no from cutoff_schedules union all
  select (p_extra->>'effective_month')::date,(p_extra->>'first_end')::integer,(p_extra->>'second_end')::integer,(p_extra->>'version_no')::bigint where p_extra is not null)
 select first_end,second_end into first_day,boundary from versions where effective_month<=p_month order by effective_month desc,version_no desc limit 1;
 first_day=coalesce(first_day,15);
 with versions as (select effective_month,first_end,second_end,version_no from cutoff_schedules union all
  select (p_extra->>'effective_month')::date,(p_extra->>'first_end')::integer,(p_extra->>'second_end')::integer,(p_extra->>'version_no')::bigint where p_extra is not null)
 select second_end into next_boundary from versions where effective_month<=(p_month+interval '1 month')::date order by effective_month desc,version_no desc limit 1;
 last_previous=p_month-1;last_current=(p_month+interval '1 month - 1 day')::date;
 first_start=case when boundary is null then p_month else (p_month-interval '1 month')::date+least(boundary,extract(day from last_previous)::integer) end;
 first_finish=p_month+first_day-1;
 second_finish=case when next_boundary is null then last_current else p_month+least(next_boundary,extract(day from last_current)::integer)-1 end;
 if second_finish<=first_finish then raise exception 'Schedule leaves no second cut-off in %',to_char(p_month,'YYYY-MM');end if;
 return jsonb_build_array(jsonb_build_array(first_start,first_finish),jsonb_build_array(first_finish+1,second_finish));
end $$;
revoke all on function cutoff_ranges(date,jsonb) from public,anon;
grant execute on function cutoff_ranges(date,jsonb) to authenticated;

create or replace function save_cutoff_schedule(p_month date,p_first integer,p_second integer default null,p_expected bigint default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare latest bigint;extra jsonb;affected_from date;affected_month date;result uuid;
begin
 if my_role() is distinct from 'superadmin' then raise exception 'Superadmin access required';end if;
 if p_month is null or extract(day from p_month)<>1 or p_first is null or p_first not between 1 and 27 or p_second is not null and (p_second<=p_first or p_second>31) then raise exception 'First cut-off end must be 1–27; second end must be later or month end';end if;
 perform pg_advisory_xact_lock(841562);
 select max(version_no) into latest from cutoff_schedules;
 if latest is distinct from p_expected then raise exception 'Cut-off schedule changed; reload before saving';end if;
 extra=jsonb_build_object('effective_month',p_month,'first_end',p_first,'second_end',p_second,'version_no',coalesce(latest,0)+1);
 affected_from=(cutoff_ranges((p_month-interval '1 month')::date)->1->>0)::date;
 if exists(select 1 from cutoff_locks where end_date>=affected_from) then raise exception 'Schedule affects finalized dates; choose a later effective month';end if;
 perform cutoff_ranges((p_month-interval '1 month')::date,extra);perform cutoff_ranges(p_month,extra);
 for affected_month in select distinct effective_month from cutoff_schedules where effective_month>=p_month loop
  perform cutoff_ranges((affected_month-interval '1 month')::date,extra);perform cutoff_ranges(affected_month,extra);
 end loop;
 insert into cutoff_schedules(effective_month,first_end,second_end) values(p_month,p_first,p_second) returning id into result;
 return result;
end $$;
revoke all on function save_cutoff_schedule(date,integer,integer,bigint) from public,anon;
grant execute on function save_cutoff_schedule(date,integer,integer,bigint) to authenticated;

-- Publish schedules with the existing conditional catalog; no extra request on unchanged loads.
do $$ declare definition text;begin
 definition=pg_get_functiondef('workspace_snapshot(date,date,text,jsonb,boolean)'::regprocedure);
 if position($s$'cutoff_schedules',$s$ in definition)=0 then
  definition=replace(definition,$s$'lookups',(select$s$,$s$'cutoff_schedules',(select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(t))),'[]') from cutoff_schedules t), 'lookups',(select$s$);
  execute definition;
 end if;
end $$;
commit;
