-- CRM foundation: people, households, sharing, links, timeline, tasks, tags,
-- saved lists, gifts, campaigns, important dates. All tables are prefixed
-- crm_ (see CLAUDE.md "Table naming"). Access is a standalone permission
-- system (crm_users), not EOS teams.
--
-- Conventions: text ids via new_id(), created_at/updated_at with the shared
-- set_updated_at() trigger, explicit on-delete behaviour on every FK.

create extension if not exists pg_trgm;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Who may use the CRM. Admins see every contact and manage users, tags and
-- campaigns; members see public contacts plus what they own or are shared.
-- ---------------------------------------------------------------------------
create table crm_users (
  employee_id text primary key references system_employees(id) on delete cascade,
  role        text not null default 'member' check (role in ('admin', 'member')),
  created_at  timestamptz not null default now()
);

-- Bootstrap: the system admin is the first CRM admin.
insert into crm_users (employee_id, role)
select id, 'admin' from system_employees where email ilike 'mendye@gmail.com'
on conflict (employee_id) do nothing;

-- ---------------------------------------------------------------------------
-- Households group people who live together. A household has no visibility
-- of its own: it is visible when at least one member is, and member lists are
-- filtered per viewer.
-- ---------------------------------------------------------------------------
create table crm_households (
  id                text primary key default new_id(),
  name              text not null,
  street            text,
  city              text,
  postal_code       text,
  notes             text,
  owner_employee_id text references system_employees(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger crm_households_set_updated_at before update on crm_households
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- People. visibility = 'public' (every CRM user) or 'restricted' (owner +
-- crm_contact_shares + admins). phone is E.164 (+9725...), phone_display is
-- what the user typed, normalised for reading (050-123-4567).
-- ---------------------------------------------------------------------------
create table crm_contacts (
  id                text primary key default new_id(),
  first_name        text not null,
  last_name         text not null default '',
  hebrew_name       text,
  gender            text check (gender in ('male', 'female')),
  birthdate         date,
  email             citext,
  phone             text,
  phone_display     text,
  household_id      text references crm_households(id) on delete set null,
  household_role    text check (household_role in ('head', 'spouse', 'child', 'other')),
  stage             text not null default 'new'
                    check (stage in ('new', 'acquaintance', 'regular', 'member', 'donor', 'inactive')),
  owner_employee_id text references system_employees(id) on delete set null,
  visibility        text not null default 'public' check (visibility in ('public', 'restricted')),
  source            text,
  notes             text,
  is_archived       boolean not null default false,
  last_activity_at  timestamptz,
  created_by        text references system_employees(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger crm_contacts_set_updated_at before update on crm_contacts
  for each row execute function set_updated_at();

-- Search: trigram indexes for fuzzy name/phone/email matching, plus the
-- filters the index page uses.
create index crm_contacts_name_trgm   on crm_contacts using gin ((first_name || ' ' || last_name) gin_trgm_ops);
create index crm_contacts_hebrew_trgm on crm_contacts using gin (coalesce(hebrew_name, '') gin_trgm_ops);
create index crm_contacts_phone_trgm  on crm_contacts using gin (coalesce(phone, '') gin_trgm_ops);
create index crm_contacts_email_trgm  on crm_contacts using gin (coalesce(email::text, '') gin_trgm_ops);
create index crm_contacts_household   on crm_contacts (household_id);
create index crm_contacts_owner       on crm_contacts (owner_employee_id);
create index crm_contacts_stage       on crm_contacts (stage) where not is_archived;
create index crm_contacts_updated     on crm_contacts (updated_at desc);
create index crm_contacts_phone_eq    on crm_contacts (phone) where phone is not null;
create index crm_contacts_email_eq    on crm_contacts (email) where email is not null;

-- Share list for restricted contacts.
create table crm_contact_shares (
  contact_id  text not null references crm_contacts(id) on delete cascade,
  employee_id text not null references system_employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (contact_id, employee_id)
);
create index crm_contact_shares_employee on crm_contact_shares (employee_id);

-- ---------------------------------------------------------------------------
-- Typed links between people. One row per link; the inverse label is computed
-- in code (parent -> child, spouse <-> spouse, ...). See lib/crm/types.ts.
-- ---------------------------------------------------------------------------
create table crm_links (
  id              text primary key default new_id(),
  from_contact_id text not null references crm_contacts(id) on delete cascade,
  to_contact_id   text not null references crm_contacts(id) on delete cascade,
  type            text not null check (type in (
                    'spouse', 'parent', 'child', 'sibling', 'employer', 'employee',
                    'referred_by', 'referred', 'friend', 'other')),
  note            text,
  created_by      text references system_employees(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint crm_links_distinct check (from_contact_id <> to_contact_id),
  unique (from_contact_id, to_contact_id, type)
);
create index crm_links_to on crm_links (to_contact_id);

-- ---------------------------------------------------------------------------
-- Timeline. kind 'system' rows are written by the app (stage changed, gift
-- added, link created) with details in meta.
-- ---------------------------------------------------------------------------
create table crm_activities (
  id          text primary key default new_id(),
  contact_id  text not null references crm_contacts(id) on delete cascade,
  kind        text not null check (kind in ('note', 'call', 'visit', 'message', 'meeting', 'system')),
  body        text,
  occurred_at timestamptz not null default now(),
  created_by  text references system_employees(id) on delete set null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger crm_activities_set_updated_at before update on crm_activities
  for each row execute function set_updated_at();
create index crm_activities_contact_time on crm_activities (contact_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Follow-up tasks. CRM-native so contact visibility applies.
-- ---------------------------------------------------------------------------
create table crm_tasks (
  id                   text primary key default new_id(),
  contact_id           text not null references crm_contacts(id) on delete cascade,
  title                text not null,
  due_date             date,
  done_at              timestamptz,
  assignee_employee_id text references system_employees(id) on delete set null,
  created_by           text references system_employees(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger crm_tasks_set_updated_at before update on crm_tasks
  for each row execute function set_updated_at();
create index crm_tasks_assignee_open on crm_tasks (assignee_employee_id, due_date) where done_at is null;
create index crm_tasks_contact       on crm_tasks (contact_id);

-- ---------------------------------------------------------------------------
-- Tags (static lists) and saved lists (live filters).
-- ---------------------------------------------------------------------------
create table crm_tags (
  id         text primary key default new_id(),
  name       text not null unique,
  color      text not null default 'stone',
  created_at timestamptz not null default now()
);
create table crm_contact_tags (
  contact_id text not null references crm_contacts(id) on delete cascade,
  tag_id     text not null references crm_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index crm_contact_tags_tag on crm_contact_tags (tag_id);

create table crm_saved_lists (
  id                text primary key default new_id(),
  name              text not null,
  owner_employee_id text references system_employees(id) on delete set null,
  is_shared         boolean not null default true,
  filter            jsonb not null default '{}'::jsonb,
  sort              text,
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger crm_saved_lists_set_updated_at before update on crm_saved_lists
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Gifts and campaigns. external_ref is the idempotency key for provider
-- webhooks later (Nedarim Plus, Cardcom, ...).
-- ---------------------------------------------------------------------------
create table crm_campaigns (
  id         text primary key default new_id(),
  name       text not null,
  year       integer,
  goal       numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger crm_campaigns_set_updated_at before update on crm_campaigns
  for each row execute function set_updated_at();

create table crm_gifts (
  id             text primary key default new_id(),
  contact_id     text not null references crm_contacts(id) on delete cascade,
  amount         numeric(12,2) not null check (amount > 0),
  currency       text not null default 'ILS',
  received_at    date not null default current_date,
  method         text not null default 'other'
                 check (method in ('cash', 'check', 'card', 'transfer', 'standing_order', 'other')),
  campaign_id    text references crm_campaigns(id) on delete set null,
  receipt_number text,
  external_ref   text,
  notes          text,
  created_by     text references system_employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger crm_gifts_set_updated_at before update on crm_gifts
  for each row execute function set_updated_at();
create unique index crm_gifts_external_ref on crm_gifts (external_ref) where external_ref is not null;
create index crm_gifts_contact_date on crm_gifts (contact_id, received_at desc);
create index crm_gifts_campaign     on crm_gifts (campaign_id);

-- ---------------------------------------------------------------------------
-- Important dates beyond the birthday column: anniversaries, yahrzeits, ...
-- ---------------------------------------------------------------------------
create table crm_contact_dates (
  id         text primary key default new_id(),
  contact_id text not null references crm_contacts(id) on delete cascade,
  kind       text not null check (kind in ('birthday', 'anniversary', 'yahrzeit', 'bar_mitzvah', 'other')),
  date       date not null,
  label      text,
  created_at timestamptz not null default now()
);
create index crm_contact_dates_contact on crm_contact_dates (contact_id);
