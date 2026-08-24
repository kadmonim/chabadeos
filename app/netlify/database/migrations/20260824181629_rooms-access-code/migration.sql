-- Shared access code for the /rooms booking screen. Instead of a Google login,
-- anyone who knows the code can get in and manage bookings. Stored in the
-- database (not an env var) so it can be rotated with a single update:
--   update app_settings set value = '123456' where key = 'rooms_access_code';

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('rooms_access_code', '770770')
on conflict (key) do nothing;
