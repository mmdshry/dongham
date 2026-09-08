CREATE TABLE push_subscriptions (
  endpoint   VARCHAR(768) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id    VARCHAR(32)  NOT NULL,
  p256dh     VARCHAR(255) NOT NULL,
  auth       VARCHAR(128) NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (endpoint),
  KEY ix_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
