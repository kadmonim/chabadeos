-- Drop the minimal expense_vendors stub from 0005 in favor of the richer
-- expenses_vendors table (created outside migrations) which carries
-- aliases, report_matches, description, person, status, group_name, etc.

drop table if exists expense_vendors;
