-- Rename testimonials → posts; flatten type → kind; add summary + slug.

alter table testimonials rename to posts;
alter trigger testimonials_set_updated_at on posts rename to posts_set_updated_at;

alter table posts rename column type to kind;
update posts set kind = lower(coalesce(kind, 'update'));
update posts set kind = 'post' where kind = 'update';
-- kind is now 'post' or 'testimonial'.

alter table posts add column summary text;
alter table posts add column slug text;

update posts set slug = trim(both '-' from
  regexp_replace(
    lower(coalesce(nullif(headline, ''), 'post')),
    '[^a-z0-9]+', '-', 'g'
  )
) || '-' || substr(id, 1, 6);

alter table posts alter column slug set not null;
create unique index posts_slug_idx on posts (slug);
create index posts_kind_date_idx on posts (kind, date desc nulls last);
