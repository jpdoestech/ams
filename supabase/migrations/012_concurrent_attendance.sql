-- Normal attendance writes share the finalization gate and serialize only matching employee/date keys.
begin;
create or replace function lock_attendance_entries(p_rows jsonb) returns void language plpgsql security definer set search_path=public as $$
declare item record;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'Invalid attendance batch';end if;
 perform pg_advisory_xact_lock_shared(841562);
 -- Every batch takes keys in the same order, including a key for a not-yet-inserted row.
 for item in select distinct (r->>'emp_id')::uuid emp,(r->>'date')::date dt from jsonb_array_elements(p_rows) r order by 1,2 loop
  if item.emp is null or item.dt is null then raise exception 'Employee and date required';end if;
  perform pg_advisory_xact_lock(128731,hashtext(item.emp::text||'|'||item.dt::text));
 end loop;
end $$;
revoke all on function lock_attendance_entries(jsonb) from public,anon,authenticated;
do $$ declare signature text;definition text;begin
 foreach signature in array array['save_attendance_batch(jsonb,boolean)','save_attendance_core(jsonb,boolean)','chk_lock()','review_attendance(jsonb,text,text)'] loop
  definition=pg_get_functiondef(signature::regprocedure);
  if signature='save_attendance_batch(jsonb,boolean)' then
   definition=replace(definition,'perform pg_advisory_xact_lock(841562);','perform lock_attendance_entries(p_changes);');
  elsif signature='review_attendance(jsonb,text,text)' then
   definition=replace(definition,'perform pg_advisory_xact_lock(841562);','perform lock_attendance_entries(p_rows);');
  else
   definition=replace(definition,'perform pg_advisory_xact_lock(841562);','perform pg_advisory_xact_lock_shared(841562);');
  end if;
  execute definition;
 end loop;
end $$;
-- Finalization, lock changes and dated schedule changes retain their exclusive gate.
commit;
