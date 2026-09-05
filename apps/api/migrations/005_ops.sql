CREATE TABLE otps (
  phone      VARCHAR(15) NOT NULL,
  code       VARCHAR(8)  NOT NULL,
  expires_at BIGINT      NOT NULL,
  PRIMARY KEY (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE zarinpal_pending (
  authority  VARCHAR(64) NOT NULL,
  user_id    VARCHAR(32) NOT NULL,
  sku        VARCHAR(64) NOT NULL,
  amount     BIGINT      NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (authority),
  KEY ix_zp_user (user_id),
  CONSTRAINT fk_zp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_events (
  id         VARCHAR(32) NOT NULL,
  user_id    VARCHAR(32) NOT NULL,
  source     ENUM('bazaar','myket','zarinpal','admin') NOT NULL,
  sku        VARCHAR(64) NULL,
  amount     BIGINT      NULL,
  until_at   DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_bill_user (user_id, created_at),
  CONSTRAINT fk_bill_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE telegram_links (
  chat_id         VARCHAR(32) NOT NULL,
  period_id       CHAR(7)     NOT NULL,
  payer_member_id VARCHAR(32) NULL,
  PRIMARY KEY (chat_id),
  KEY ix_tg_period (period_id),
  CONSTRAINT fk_tg_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sheba_lookup_days (
  identity     VARCHAR(80) NOT NULL,
  day          CHAR(10)    NOT NULL,
  lookup_count INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (identity, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sheba_lookup_cache (
  identity       VARCHAR(80) NOT NULL,
  day            CHAR(10)    NOT NULL,
  card_hash      CHAR(64)    NOT NULL,
  iban           VARCHAR(34) NOT NULL,
  deposit_number VARCHAR(32) NULL,
  bank           VARCHAR(32) NULL,
  bank_name      VARCHAR(80) NULL,
  bank_code      VARCHAR(16) NULL,
  holder_name    VARCHAR(80) NULL,
  PRIMARY KEY (identity, day, card_hash),
  CONSTRAINT fk_sheba_day FOREIGN KEY (identity, day)
    REFERENCES sheba_lookup_days(identity, day) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_audit (
  id            VARCHAR(32) NOT NULL,
  actor_user_id VARCHAR(32) NOT NULL,
  actor_phone   VARCHAR(15) NULL,
  action        VARCHAR(64) NOT NULL,
  target_type   VARCHAR(32) NOT NULL,
  target_id     VARCHAR(64) NOT NULL,
  summary       TEXT        NOT NULL,
  created_at    DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE impersonation_tickets (
  code          VARCHAR(24)  NOT NULL,
  user_id       VARCHAR(32)  NOT NULL,
  actor_user_id VARCHAR(32)  NOT NULL,
  expires_at    BIGINT       NOT NULL,
  token         VARCHAR(512) NULL,
  consumed_at   BIGINT       NULL,
  PRIMARY KEY (code),
  KEY ix_imp_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_settings (
  id TINYINT NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (id) VALUES (1);

CREATE TABLE platform_admin_phones (
  phone VARCHAR(15) NOT NULL,
  PRIMARY KEY (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fx_cache (
  id         TINYINT     NOT NULL,
  fetched_at DATETIME(3) NOT NULL,
  source     VARCHAR(64) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fx_rates (
  code VARCHAR(16)   NOT NULL,
  rate DECIMAL(18,8) NOT NULL,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
