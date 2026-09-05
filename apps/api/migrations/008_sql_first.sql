ALTER TABLE sessions DROP INDEX uq_sessions_token;
ALTER TABLE sessions ADD UNIQUE KEY uq_sessions_token (token(191));
