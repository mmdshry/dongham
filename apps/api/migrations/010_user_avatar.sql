ALTER TABLE users
  ADD COLUMN avatar_data_url MEDIUMTEXT NULL,
  ADD COLUMN avatar_updated_at DATETIME(3) NULL;
