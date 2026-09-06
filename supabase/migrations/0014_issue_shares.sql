create table issue_shares (
  id         text primary key default new_id(),
  issue_id   text not null references issues(id) on delete cascade,
  team_id    text not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issue_id, team_id)
);

create index on issue_shares (issue_id);
create index on issue_shares (team_id);
