-- Accountability Chart (EOS-style org chart).
-- Self-referential tree of seats. Each seat has a title (role), optional employee,
-- a free-form person_name fallback, and a jsonb list of responsibilities.

create table org_seats (
  id               text primary key default gen_random_uuid()::text,
  parent_id        text references org_seats(id) on delete cascade,
  title            text not null,
  person_name      text,
  employee_id      text references employees(id) on delete set null,
  responsibilities jsonb not null default '[]'::jsonb,
  display_order    int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index on org_seats (parent_id);

create trigger org_seats_set_updated_at
  before update on org_seats
  for each row execute function set_updated_at();

alter table org_seats enable row level security;
