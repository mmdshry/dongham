CREATE TABLE users (
  id                 VARCHAR(32)  NOT NULL,
  phone              VARCHAR(15)  NULL,
  email              VARCHAR(191) NULL,
  password_hash      VARCHAR(100) NULL,
  google_id          VARCHAR(64)  NULL,
  display_name       VARCHAR(80)  NOT NULL,
  created_at         DATETIME(3)  NOT NULL,
  deleted_at         DATETIME(3)  NULL,
  banned_at          DATETIME(3)  NULL,
  plan               ENUM('free','premium') NOT NULL DEFAULT 'free',
  premium_until      DATETIME(3)  NULL,
  use_persian_digits TINYINT(1)   NULL,
  debt_reminders     TINYINT(1)   NULL,
  calendar_mode      ENUM('jalali','gregorian') NULL,
  prefs_updated_at   DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google (google_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_payout_methods (
  id               VARCHAR(32)  NOT NULL,
  user_id          VARCHAR(32)  NOT NULL,
  label            VARCHAR(80)  NULL,
  card_number      CHAR(16)     NOT NULL,
  sheba            VARCHAR(32)  NULL,
  card_holder_name VARCHAR(80)  NULL,
  bank_name        VARCHAR(80)  NULL,
  account_number   VARCHAR(32)  NULL,
  is_default       TINYINT(1)   NOT NULL DEFAULT 0,
  default_owner    VARCHAR(32) AS (IF(is_default = 1, user_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payout_card (user_id, card_number),
  UNIQUE KEY uq_payout_default (default_owner),
  KEY ix_payout_user (user_id),
  CONSTRAINT fk_payout_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_fx_watchlist (
  user_id VARCHAR(32) NOT NULL,
  code    VARCHAR(16) NOT NULL,
  PRIMARY KEY (user_id, code),
  CONSTRAINT fk_fxw_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id         VARCHAR(32)  NOT NULL,
  user_id    VARCHAR(32)  NOT NULL,
  device_id  VARCHAR(64)  NOT NULL,
  token      VARCHAR(512) NOT NULL,
  created_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token),
  KEY ix_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
