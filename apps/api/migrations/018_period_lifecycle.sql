ALTER TABLE periods
  ADD COLUMN deleted_at DATETIME(3) NULL,
  ADD COLUMN deleted_by VARCHAR(32) NULL,
  ADD COLUMN completed_at DATETIME(3) NULL,
  ADD COLUMN completed_by VARCHAR(32) NULL,
  ADD KEY ix_periods_deleted (deleted_at),
  ADD KEY ix_periods_completed (completed_at);

CREATE TABLE period_archives (
  user_id     VARCHAR(32)  NOT NULL,
  period_id   VARCHAR(7)   CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  archived_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (user_id, period_id),
  KEY ix_period_archives_period (period_id),
  CONSTRAINT fk_period_archives_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_period_archives_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
