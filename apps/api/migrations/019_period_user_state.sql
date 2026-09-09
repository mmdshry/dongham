CREATE TABLE period_user_state (
  user_id           VARCHAR(32)  NOT NULL,
  period_id         VARCHAR(7)   CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  chat_muted_at     DATETIME(3)  NULL,
  chat_last_read_at DATETIME(3)  NULL,
  last_seen_at      DATETIME(3)  NULL,
  PRIMARY KEY (user_id, period_id),
  KEY ix_period_user_state_period (period_id),
  CONSTRAINT fk_period_user_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_period_user_state_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
