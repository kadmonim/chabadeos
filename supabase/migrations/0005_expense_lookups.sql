-- Expense method + vendor lookup tables.
-- Both use `name` as a unique text column that matches the free-form value stored
-- in expenses.method / expenses.vendor. No FK constraint on expenses on purpose —
-- a new method or vendor can be typed directly and enriched later from here.

create table expense_methods (
  id          text primary key default gen_random_uuid()::text,
  name        text unique not null,
  label       text,
  employee_id text references employees(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger expense_methods_set_updated_at
  before update on expense_methods
  for each row execute function set_updated_at();

alter table expense_methods enable row level security;

create table expense_vendors (
  id         text primary key default gen_random_uuid()::text,
  name       text unique not null,
  category   text,
  url        text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger expense_vendors_set_updated_at
  before update on expense_vendors
  for each row execute function set_updated_at();

alter table expense_vendors enable row level security;

-- Seed from distinct values already in the expenses table.
insert into expense_methods (name)
  select distinct method from expenses where method is not null
  on conflict (name) do nothing;

insert into expense_vendors (name)
  select distinct vendor from expenses where vendor is not null
  on conflict (name) do nothing;
