ALTER TABLE users
  ADD COLUMN avatar_preset VARCHAR(32) NULL;

ALTER TABLE periods
  DROP COLUMN avatar_preset,
  DROP COLUMN avatar_data_url;
