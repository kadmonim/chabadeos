-- Chabad Central schema v1
-- Base44 IDs (24-char hex) preserved as text PKs; new rows default to gen_random_uuid()::text.
-- Auth is handled by the Astro app (Google OAuth + signed cookies). All DB access goes
-- through server endpoints using the service role key, which bypasses RLS. RLS is left
-- on with deny-all as a safety net.

set client_min_messages = warning;


-- ============================================================
-- Enums
-- ============================================================
create type rock_status      as enum ('on_track', 'off_track', 'done');
create type milestone_status as enum ('on_track', 'off_track', 'done');
create type issue_status     as enum ('open', 'solved', 'archived');
create type issue_term       as enum ('short_term', 'long_term');
create type issue_type       as enum ('problem', 'idea', 'question', 'brainstorm', 'update');
create type todo_status      as enum ('open', 'done', 'archived');
create type team_role        as enum ('admin', 'member');
create type measurable_freq  as enum ('weekly', 'monthly');
create type measurable_vtype as enum ('number', 'currency');
create type measurable_thresh as enum ('minimum', 'maximum');

-- ============================================================
-- Helpers
-- ============================================================
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function new_id() returns text language sql as $$
  select gen_random_uuid()::text
$$;

-- ============================================================
-- Employees & teams
-- ============================================================
-- employees = staff with app access. Login is gated by email match against this table.
create table employees (
  id         text primary key default new_id(),
  full_name  text not null,
  email      text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id          text primary key default new_id(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table team_memberships (
  id               text primary key default new_id(),
  team_id          text not null references teams(id) on delete cascade,
  employee_id      text not null references employees(id) on delete cascade,
  role             team_role not null default 'member',
  role_description text,
  display_order    int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (team_id, employee_id)
);

-- contacts = anyone in the directory. May or may not be an employee.
create table contacts (
  id                  text primary key default new_id(),
  employee_id         text references employees(id) on delete set null,
  name                text not null,
  category            text,
  real_first_name     text,
  nicknames           text,
  private_cell_number text,
  anonymous_number    text,
  whatsapp_number     text,
  private_email       text,
  anonymous_email     text,
  location            text,
  about               text,
  is_private          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- EOS core
-- ============================================================
create table rocks (
  id                 text primary key default new_id(),
  title              text not null,
  description        text,
  owner_employee_id  text references employees(id) on delete set null,
  due_date           date,
  status             rock_status not null default 'on_track',
  priority_order     int not null default 0,
  is_archived        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table milestones (
  id                 text primary key default new_id(),
  rock_id            text references rocks(id) on delete cascade,
  title              text not null,
  description        text,
  owner_employee_id  text references employees(id) on delete set null,
  team_id            text references teams(id) on delete set null,
  due_date           date,
  status             milestone_status not null default 'on_track',
  priority_order     int not null default 0,
  is_archived        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table issues (
  id                 text primary key default new_id(),
  title              text not null,
  description        text,
  team_id            text references teams(id) on delete set null,
  rock_id            text references rocks(id) on delete set null,
  milestone_id       text references milestones(id) on delete set null,
  owner_employee_id  text references employees(id) on delete set null,
  relevant_people    text[] not null default '{}',
  type               issue_type,
  term_type          issue_term not null default 'short_term',
  priority           int,
  priority_order     int not null default 0,
  status             issue_status not null default 'open',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table todos (
  id                   text primary key default new_id(),
  title                text not null,
  description          text,
  team_id              text references teams(id) on delete set null,
  assignee_employee_id text references employees(id) on delete set null,
  due_date             date,
  is_urgent            boolean not null default false,
  status               todo_status not null default 'open',
  display_order        int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ============================================================
-- Scorecard
-- ============================================================
create table measurables (
  id                 text primary key default new_id(),
  name               text not null,
  description        text,
  team_id            text references teams(id) on delete set null,
  owner_employee_id  text references employees(id) on delete set null,
  frequency          measurable_freq not null default 'weekly',
  goal               numeric,
  value_type         measurable_vtype not null default 'number',
  threshold_type     measurable_thresh not null default 'minimum',
  "group"            text,
  subgroup           text,
  display_order      int not null default 0,
  show_average       boolean not null default false,
  is_archived        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table weekly_values (
  id              text primary key default new_id(),
  measurable_id   text not null references measurables(id) on delete cascade,
  week_start_date date not null,
  value           numeric,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (measurable_id, week_start_date)
);

create table monthly_values (
  id               text primary key default new_id(),
  measurable_id    text not null references measurables(id) on delete cascade,
  month_start_date date not null,
  value            numeric,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (measurable_id, month_start_date)
);

create table scorecard_group_orders (
  id            text primary key default new_id(),
  team_id       text references teams(id) on delete cascade,
  group_name    text not null,
  subgroup_name text,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- Misc
-- ============================================================
create table current_focuses (
  id          text primary key default new_id(),
  employee_id text references employees(id) on delete cascade,
  team_id     text references teams(id) on delete set null,
  focus_text  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table processes (
  id          text primary key default new_id(),
  name        text not null,
  details     text,
  team_id     text references teams(id) on delete set null,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table links (
  id          text primary key default new_id(),
  title       text not null,
  url         text not null,
  description text,
  category    text,
  is_private  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table testimonials (
  id                     text primary key default new_id(),
  headline               text,
  notes                  text,
  rich_text              text,
  category               text,
  type                   text,
  source                 text,
  source_link            text,
  from_username          text,
  image_url              text,
  video_url              text,
  screenshot_url         text,
  date                   date,
  featured_in_newsletter boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table trips (
  id         text primary key default new_id(),
  city       text not null,
  people     text[] not null default '{}',
  start_date date,
  end_date   date,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table personal_shortcuts (
  id                text primary key default new_id(),
  owner_employee_id text not null references employees(id) on delete cascade,
  name              text not null,
  url               text not null,
  display_order     int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- updated_at triggers
-- ============================================================
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'employees','teams','team_memberships','contacts',
      'rocks','milestones','issues','todos',
      'measurables','weekly_values','monthly_values','scorecard_group_orders',
      'current_focuses','processes','links','testimonials','trips','personal_shortcuts'
    ])
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ============================================================
-- Indexes
-- ============================================================
create index on team_memberships (team_id);
create index on team_memberships (employee_id);
create index on rocks (owner_employee_id);
create index on milestones (rock_id);
create index on issues (team_id);
create index on issues (rock_id);
create index on issues (status);
create index on todos (team_id);
create index on todos (assignee_employee_id);
create index on todos (status);
create index on measurables (team_id);
create index on weekly_values (measurable_id, week_start_date desc);
create index on monthly_values (measurable_id, month_start_date desc);

-- Vision/Traction Organizer (V/TO) — one row per team, flexible JSONB payloads.

create table vtos (
  id         text primary key default gen_random_uuid()::text,
  team_id    text not null references teams(id) on delete cascade unique,
  vision     jsonb not null default '{}'::jsonb,
  traction   jsonb not null default '{}'::jsonb,
  swot       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vtos_set_updated_at
  before update on vtos
  for each row execute function set_updated_at();

-- V/TO is global (singleton), not team-scoped.

alter table vtos drop column team_id;

-- Enforce singleton: only one row in the table ever.
alter table vtos add column singleton boolean not null default true;
create unique index vtos_singleton_unique on vtos (singleton);
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


-- Seed from distinct values already in the expenses table.
insert into expense_methods (name)
  select distinct method from expenses where method is not null
  on conflict (name) do nothing;

insert into expense_vendors (name)
  select distinct vendor from expenses where vendor is not null
  on conflict (name) do nothing;
-- Drop the minimal expense_vendors stub from 0005 in favor of the richer
-- expenses_vendors table (created outside migrations) which carries
-- aliases, report_matches, description, person, status, group_name, etc.

drop table if exists expense_vendors;
-- Approval status for each expense row.
-- 'none' = not yet reviewed (default)
-- 'good' = approved
-- 'to_review' = needs more investigation
-- 'cancelled' = dispute / chargeback / stop

alter table expenses
  add column status text not null default 'none'
  check (status in ('none', 'good', 'to_review', 'cancelled'));

create index on expenses (status);
-- Add 'to_move' as a 5th approval status — meaning "go change the card
-- this vendor charges in the future". Also add an optional target pointing
-- at the intended future method.

alter table expenses drop constraint expenses_status_check;
alter table expenses
  add constraint expenses_status_check
  check (status in ('none', 'good', 'to_review', 'cancelled', 'to_move'));

alter table expenses add column move_to_method text;
-- Base expenses_vendors table — also bootstrapped outside the migration
-- history in the source project (see 0006's comment). Recreated here with
-- the pre-0009 shape so 0009 can alter it cleanly.

create table expenses_vendors (
  vendor_id      serial primary key,
  name           text unique not null,
  description    text,
  frequency      text,
  status         text,
  group_name     text,
  latest_update  text,
  to_do          text,
  review_again   date,
  tags           text[] not null default '{}',
  report_matches text[] not null default '{}',
  aliases        text[] not null default '{}',
  person         text
);
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
-- Rename testimonials → posts; flatten type → kind; add summary + slug.

alter table testimonials rename to posts;
alter trigger testimonials_set_updated_at on posts rename to posts_set_updated_at;

alter table posts rename column type to kind;
update posts set kind = lower(coalesce(kind, 'update'));
update posts set kind = 'post' where kind = 'update';
-- kind is now 'post' or 'testimonial'.

alter table posts add column summary text;
alter table posts add column slug text;

update posts set slug = trim(both '-' from
  regexp_replace(
    lower(coalesce(nullif(headline, ''), 'post')),
    '[^a-z0-9]+', '-', 'g'
  )
) || '-' || substr(id, 1, 6);

alter table posts alter column slug set not null;
create unique index posts_slug_idx on posts (slug);
create index posts_kind_date_idx on posts (kind, date desc nulls last);
alter type issue_term add value 'idea_backlog';
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


create index on feature_ideas (status);
create index on feature_ideas (owner_employee_id);
alter table feature_ideas add column tags text[] not null default '{}';
create index on feature_ideas using gin (tags);
create table issue_shares (
  id         text primary key default new_id(),
  issue_id   text not null references issues(id) on delete cascade,
  team_id    text not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issue_id, team_id)
);

create index on issue_shares (issue_id);
create index on issue_shares (team_id);
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

alter table contacts drop column if exists gye_username;
