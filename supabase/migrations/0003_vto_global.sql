-- V/TO is global (singleton), not team-scoped.

alter table vtos drop column team_id;

-- Enforce singleton: only one row in the table ever.
alter table vtos add column singleton boolean not null default true;
create unique index vtos_singleton_unique on vtos (singleton);
