-- Approval status for each expense row.
-- 'none' = not yet reviewed (default)
-- 'good' = approved
-- 'to_review' = needs more investigation
-- 'cancelled' = dispute / chargeback / stop

alter table expenses
  add column status text not null default 'none'
  check (status in ('none', 'good', 'to_review', 'cancelled'));

create index on expenses (status);
