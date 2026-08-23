-- Base expenses_vendors table — also bootstrapped outside the migration
-- history in the source project (see 0006's comment). Recreated here with
-- the pre-0009 shape so 0009 can alter it cleanly.

create table expenses_vendors (
  vendor_id      serial primary key,
  name           text unique not null,
  description    text,
  frequency      text,
  status         text,
  group_name     text,
  latest_update  text,
  to_do          text,
  review_again   date,
  tags           text[] not null default '{}',
  report_matches text[] not null default '{}',
  aliases        text[] not null default '{}',
  person         text
);
