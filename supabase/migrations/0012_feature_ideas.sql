create table feature_ideas (
  id                 text primary key default new_id(),
  title              text not null,
  description        text,
  owner_employee_id  text references employees(id) on delete set null,
  type               issue_type,
  term_type          issue_term not null default 'short_term',
  priority           int,
  priority_order     int not null default 0,
  status             issue_status not null default 'open',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger feature_ideas_set_updated_at
  before update on feature_ideas
  for each row execute function set_updated_at();

alter table feature_ideas enable row level security;

create index on feature_ideas (status);
create index on feature_ideas (owner_employee_id);
