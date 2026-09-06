-- Free-form notes on individual expense charges. Finance team leaves context
-- for each other about vendors (future plans, questions, things to investigate)
-- on specific charges. Shown in the per-month charges list with a count icon.

create table expense_notes (
  id                 text primary key default new_id(),
  expense_id         integer not null references expenses(expense_id) on delete cascade,
  author_employee_id text references employees(id) on delete set null,
  body               text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on expense_notes (expense_id);

create trigger expense_notes_set_updated_at
  before update on expense_notes
  for each row execute function set_updated_at();

alter table expense_notes enable row level security;
