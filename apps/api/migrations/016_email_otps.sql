CREATE TABLE email_otps (
  email      VARCHAR(191) NOT NULL,
  purpose    ENUM('login','link') NOT NULL,
  code       VARCHAR(8)  NOT NULL,
  user_id    VARCHAR(32) NULL,
  expires_at BIGINT      NOT NULL,
  PRIMARY KEY (email, purpose),
  KEY ix_email_otp_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
