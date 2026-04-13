alter table feature_ideas add column tags text[] not null default '{}';
create index on feature_ideas using gin (tags);
