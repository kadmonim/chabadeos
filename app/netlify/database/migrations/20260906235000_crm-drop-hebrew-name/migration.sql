-- In Hebrew the first name already is the Jewish name; a separate field was
-- redundant. Drop the column and its search index.
drop index if exists crm_contacts_hebrew_trgm;
alter table crm_contacts drop column if exists hebrew_name;
