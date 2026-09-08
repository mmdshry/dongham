ALTER TABLE users
  ADD COLUMN username VARCHAR(20) NULL,
  ADD COLUMN profile_cover_preset VARCHAR(32) NULL,
  ADD COLUMN profile_cover_data_url MEDIUMTEXT NULL,
  ADD UNIQUE KEY uq_users_username (username);
