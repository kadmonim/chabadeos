-- Prefix every table with the feature it belongs to, so a module's tables can
-- be listed (and one day extracted) at a glance:
--
--   system_*  shared infrastructure used by every feature
--   eos_*     the EOS/Traction tooling (rocks, issues, todos, scorecard, V/TO,
--             accountability chart, documented processes)
--   rooms_*   room booking
--
-- Indexes, constraints, triggers and sequences keep their old names; Postgres
-- rebinds them automatically.

-- Shared
alter table if exists employees        rename to system_employees;
alter table if exists teams            rename to system_teams;
alter table if exists team_memberships rename to system_team_memberships;
alter table if exists app_settings     rename to system_settings;
alter table if exists links            rename to system_links;

-- EOS
alter table if exists rocks          rename to eos_rocks;
alter table if exists issues         rename to eos_issues;
alter table if exists issue_shares   rename to eos_issue_shares;
alter table if exists todos          rename to eos_todos;
alter table if exists measurables    rename to eos_measurables;
alter table if exists weekly_values  rename to eos_weekly_values;
alter table if exists monthly_values rename to eos_monthly_values;
alter table if exists vtos           rename to eos_vtos;
alter table if exists org_seats      rename to eos_org_seats;
alter table if exists processes      rename to eos_processes;

-- Room booking
alter table if exists rooms          rename to rooms_spaces;
alter table if exists bookings       rename to rooms_bookings;
alter table if exists booking_series rename to rooms_booking_series;

-- Leftover from the removed testimonials/posts feature. The baseline renamed
-- testimonials -> posts, so the earlier "drop table testimonials" was a no-op.
drop table if exists posts;
