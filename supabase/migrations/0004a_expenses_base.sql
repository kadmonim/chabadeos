-- Base expenses table. The source project bootstrapped this from a CSV
-- import outside the migration history, so a fresh DB had nothing for the
-- later expense migrations (0005, 0007, 0008, 0015) to alter. Recreated
-- here to mirror the source schema before those alters land.

create table expenses (
  expense_id serial primary key,
  month      text not null,
  date       date not null,
  method     text not null,
  vendor     text not null,
  amount     numeric not null
);

create index idx_expenses_month on expenses (month);
create index idx_expenses_method on expenses (method);
