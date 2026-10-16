-- Validate new/changed contacts without erasing legacy free-text values.
begin;
create or replace function normalize_contact_number() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='UPDATE' and new.contact is not distinct from old.contact then return new;end if;
 if nullif(btrim(new.contact),'') is null then new.contact=null;return new;end if;
 if new.contact !~ '^09[0-9]{9}$' and new.contact !~ '^09[0-9]{2}-[0-9]{3}-[0-9]{4}$' then raise exception 'Contact number must contain 11 digits and start with 09';end if;
 new.contact=replace(new.contact,'-','');new.contact=substr(new.contact,1,4)||'-'||substr(new.contact,5,3)||'-'||substr(new.contact,8,4);
 return new;
end $$;
revoke all on function normalize_contact_number() from public,anon,authenticated;
drop trigger if exists normalize_contact on employees;
create trigger normalize_contact before insert or update on employees for each row execute function normalize_contact_number();
drop trigger if exists normalize_contact on supervisors;
create trigger normalize_contact before insert or update on supervisors for each row execute function normalize_contact_number();
commit;
