-- The two seeded rooms were placeholders. These are the real bookable spaces at
-- בית חב"ד. The two originals are renamed rather than replaced so existing
-- bookings keep their room_id and stay intact.
update rooms set name = 'חלל פנימי גדול', sort_order = 5 where name = 'חדר פעילות';
update rooms set name = 'שולחן עגול - לובי', sort_order = 3 where name = 'לובי';

insert into rooms (name, sort_order) values
  ('חלל', 1),
  ('הכוורת - משרד', 2),
  ('חלל פנימי קטן', 4)
on conflict (name) do nothing;
