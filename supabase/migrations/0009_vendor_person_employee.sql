-- Link expenses_vendors.person to employees via a real FK.
-- 1. Add nullable FK column
-- 2. Backfill from the existing free-form text by matching full_name
-- 3. Drop the legacy text column

alter table expenses_vendors
  add column person_employee_id text references employees(id) on delete set null;

update expenses_vendors v
  set person_employee_id = e.id
  from employees e
  where v.person is not null
    and lower(e.full_name) = lower(trim(v.person));

alter table expenses_vendors drop column person;
