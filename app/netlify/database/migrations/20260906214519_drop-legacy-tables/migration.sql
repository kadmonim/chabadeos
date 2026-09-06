-- Drop tables left behind by features removed from the app.
--
--  * expenses / expense_*: credit-card charge review, built for GYE EOS
--    (the project this codebase started as) and never used for the Chabad House.
--  * contacts, feature_ideas, milestones, testimonials, trips, current_focuses:
--    features whose UI and API were removed in Aug–Sep 2026.
--
-- issues.milestone_id pointed at milestones; the column goes with the table.

alter table issues drop column if exists milestone_id;

drop table if exists expense_notes;
drop table if exists expenses_vendors;
drop table if exists expense_vendors;
drop table if exists expense_methods;
drop table if exists expenses;

drop table if exists contacts;
drop table if exists feature_ideas;
drop table if exists milestones;
drop table if exists testimonials;
drop table if exists trips;
drop table if exists current_focuses;

drop type if exists milestone_status;
