-- Chabad Central schema v1
-- Base44 IDs (24-char hex) preserved as text PKs; new rows default to gen_random_uuid()::text.
-- Auth is handled by the Astro app (Google OAuth + signed cookies). All DB access goes
-- through server endpoints using the service role key, which bypasses RLS. RLS is left
-- on with deny-all as a safety net.

set client_min_messages = warning;

create extension if not exists pgcrypto;

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

-- ============================================================
-- RLS — deny-all safety net.
-- The app uses the service role key from Astro server endpoints (bypasses RLS).
-- The anon key, if ever leaked, can read nothing.
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
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
