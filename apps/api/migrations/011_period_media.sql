ALTER TABLE periods
  ADD COLUMN cover_preset VARCHAR(32) NULL,
  ADD COLUMN cover_data_url MEDIUMTEXT NULL,
  ADD COLUMN avatar_preset VARCHAR(32) NULL,
  ADD COLUMN avatar_data_url MEDIUMTEXT NULL;
