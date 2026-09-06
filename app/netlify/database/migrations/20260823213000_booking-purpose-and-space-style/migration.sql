-- Two additions to the rooms feature:
--
-- 1. purpose — what the space is being used for (שיעור / פגישה / חברותא / …).
--    Kept as a free text key rather than an enum so adding a purpose is a code
--    change, not a migration. Lives on both tables and is read with
--    coalesce(b.purpose, s.purpose), the same way the title is, so a single week
--    of a series can differ from the series.
--
-- 2. icon + accent on rooms — each space gets its own icon and colour so it's
--    recognisable at a glance across the cards, the filter chips and the form.
--    Defaults mean a space added later still renders.

alter table booking_series add column purpose text;
alter table bookings      add column purpose text;

alter table rooms add column icon   text not null default 'LayoutGrid';
alter table rooms add column accent text not null default 'teal';

update rooms set icon = 'LayoutGrid',   accent = 'teal'    where name = 'חלל';
update rooms set icon = 'Building2',    accent = 'rose'    where name = 'הכוורת - משרד';
update rooms set icon = 'Armchair',     accent = 'amber'   where name = 'שולחן עגול - לובי';
update rooms set icon = 'DoorClosed',   accent = 'emerald' where name = 'חלל פנימי קטן';
update rooms set icon = 'Presentation', accent = 'sky'     where name = 'חלל פנימי גדול';

-- Existing bookings are all classes.
update booking_series set purpose = 'class' where purpose is null;
