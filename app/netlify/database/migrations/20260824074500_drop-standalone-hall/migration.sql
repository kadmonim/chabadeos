-- "חלל" was read as a fifth space when the real list was set up, but it's the
-- heading the inner spaces sit under, not a bookable space of its own. Nothing
-- was ever booked in it. Deactivated rather than deleted so the row survives in
-- case a booking is ever traced back to it.
update rooms set is_active = false where name = 'חלל';
