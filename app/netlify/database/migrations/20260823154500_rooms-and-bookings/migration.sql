-- Room availability: two bookable spaces (חדר פעילות, לובי), weekly classes and
-- one-off events, with hard no-double-booking enforcement.
--
-- Design notes:
--  * booking_series is the class/activity identity ("the common thread"). Renaming
--    it renames every occurrence, past and future, because occurrences don't copy
--    the title.
--  * bookings holds one real dated row per occurrence. Real rows (rather than a
--    recurrence rule evaluated on read) are what make overlap detection reliable:
--    an open-ended weekly rule has no end date to expand to.
--  * series_date records which generated slot a row belongs to and never changes,
--    even when the occurrence is moved to another date. That's how the horizon
--    top-up knows not to regenerate a slot that was already moved or cancelled.
--  * is_modified marks a hand-edited occurrence so regenerating the series leaves
--    it alone. Without it, editing the series time would silently wipe every
--    individual exception.
--  * Times are `time` (wall clock), not timestamptz, so a weekly 19:00 stays 19:00
--    across a DST change.

create extension if not exists btree_gist;

-- Postgres ships no range type over `time`, and we need one for the overlap
-- exclusion constraint below.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timerange') then
    create type timerange as range (subtype = time without time zone);
  end if;
end $$;

create table rooms (
  id         text primary key default new_id(),
  name       text not null unique,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger rooms_set_updated_at
  before update on rooms
  for each row execute function set_updated_at();

insert into rooms (name, sort_order) values ('חדר פעילות', 1), ('לובי', 2);

create table booking_series (
  id             text primary key default new_id(),
  room_id        text not null references rooms(id) on delete cascade,
  title          text not null,
  in_charge_name text not null,
  notes          text,
  weekday        smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time     time not null,
  end_time       time not null,
  starts_on      date not null,
  ends_on        date,
  is_active      boolean not null default true,
  created_by     text references employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint booking_series_time_order check (end_time > start_time)
);

create trigger booking_series_set_updated_at
  before update on booking_series
  for each row execute function set_updated_at();

create index booking_series_room_idx on booking_series (room_id) where is_active;

create table bookings (
  id             text primary key default new_id(),
  series_id      text references booking_series(id) on delete cascade,
  series_date    date,
  room_id        text not null references rooms(id) on delete cascade,
  event_date     date not null,
  start_time     time not null,
  end_time       time not null,
  title          text,           -- null for series occurrences: inherited from the series
  in_charge_name text,           -- null for series occurrences: inherited from the series
  notes          text,
  is_modified    boolean not null default false,
  is_cancelled   boolean not null default false,
  created_by     text references employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bookings_time_order check (end_time > start_time),
  -- A one-off must carry its own title; a series occurrence inherits one.
  constraint bookings_title_present check (series_id is not null or title is not null),
  constraint bookings_series_date_present check ((series_id is null) = (series_date is null))
);

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- One row per generated slot. Moving an occurrence changes event_date but never
-- series_date, so the slot stays claimed and won't be regenerated.
create unique index bookings_series_slot_idx on bookings (series_id, series_date)
  where series_id is not null;

create index bookings_lookup_idx on bookings (room_id, event_date) where not is_cancelled;
create index bookings_date_idx on bookings (event_date) where not is_cancelled;

-- The actual no-double-booking guarantee. Application code checks first so it can
-- name the clashing booking; this stops two simultaneous saves slipping through.
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    room_id with =,
    event_date with =,
    timerange(start_time, end_time, '[)') with &&
  ) where (not is_cancelled);
