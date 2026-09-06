-- Vision/Traction Organizer (V/TO) — one row per team, flexible JSONB payloads.

create table vtos (
  id         text primary key default gen_random_uuid()::text,
  team_id    text not null references teams(id) on delete cascade unique,
  vision     jsonb not null default '{}'::jsonb,
  traction   jsonb not null default '{}'::jsonb,
  swot       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vtos_set_updated_at
  before update on vtos
  for each row execute function set_updated_at();

alter table vtos enable row level security;
