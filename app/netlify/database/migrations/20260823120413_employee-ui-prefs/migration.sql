-- Per-user UI preferences (e.g. hiding the V/TO or Scorecard nav items).
alter table employees add column if not exists ui_prefs jsonb not null default '{}'::jsonb;
