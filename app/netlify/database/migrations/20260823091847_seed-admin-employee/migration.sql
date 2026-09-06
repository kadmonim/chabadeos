-- Bootstrap the login allow-list: the system admin must exist in employees
-- before anyone can log in (auth/callback checks this table). Idempotent.
insert into employees (full_name, email)
values ('Mendy', 'mendye@gmail.com')
on conflict (email) do nothing;
