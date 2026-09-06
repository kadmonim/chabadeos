-- Add 'to_move' as a 5th approval status — meaning "go change the card
-- this vendor charges in the future". Also add an optional target pointing
-- at the intended future method.

alter table expenses drop constraint expenses_status_check;
alter table expenses
  add constraint expenses_status_check
  check (status in ('none', 'good', 'to_review', 'cancelled', 'to_move'));

alter table expenses add column move_to_method text;
