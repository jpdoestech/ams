-- Preserve existing employee wages as explicit overrides; regional defaults are opt-in.
begin;
alter table employees add column if not exists region text;
alter table employees add column if not exists rate_override boolean not null default true;
alter table lookups add column if not exists daily_rate numeric;
alter table lookups drop constraint if exists lookup_daily_rate_valid;
alter table lookups add constraint lookup_daily_rate_valid check (
 daily_rate is null or (kind='region' and daily_rate>=0 and daily_rate::text not in ('NaN','Infinity','-Infinity'))
);
commit;
