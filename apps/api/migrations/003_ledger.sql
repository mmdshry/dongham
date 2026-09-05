CREATE TABLE attachments (
  id          VARCHAR(32) NOT NULL,
  period_id   CHAR(7)     NOT NULL,
  mime        VARCHAR(80) NOT NULL,
  data_base64 LONGTEXT    NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_att_period (period_id),
  CONSTRAINT fk_att_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id                  VARCHAR(32)   NOT NULL,
  period_id           CHAR(7)       NOT NULL,
  title               VARCHAR(200)  NOT NULL,
  amount              BIGINT        NOT NULL,
  currency            VARCHAR(8)    NOT NULL,
  payer_id            VARCHAR(32)   NOT NULL,
  split_mode          ENUM('equal','weight','exact','percent') NOT NULL,
  tax_type            ENUM('none','percent','amount') NOT NULL DEFAULT 'none',
  tax_value           DECIMAL(18,6) NOT NULL DEFAULT 0,
  service_type        ENUM('none','percent','amount') NULL,
  service_value       DECIMAL(18,6) NULL,
  tip_type            ENUM('none','percent','amount') NULL,
  tip_value           DECIMAL(18,6) NULL,
  note                TEXT          NULL,
  attachment_id       VARCHAR(32)   NULL,
  attachment_data_url LONGTEXT      NULL,
  fx_rate             DECIMAL(18,8) NOT NULL DEFAULT 1,
  created_at          DATETIME(3)   NOT NULL,
  occurred_at         DATETIME(3)   NULL,
  updated_at          DATETIME(3)   NOT NULL,
  deleted_at          DATETIME(3)   NULL,
  client_id           VARCHAR(64)   NULL,
  version             INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_exp_period (period_id),
  KEY ix_exp_payer (payer_id),
  KEY ix_exp_updated (period_id, updated_at),
  CONSTRAINT fk_exp_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_exp_att FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expense_payers (
  expense_id VARCHAR(32) NOT NULL,
  member_id  VARCHAR(32) NOT NULL,
  amount     BIGINT      NOT NULL,
  PRIMARY KEY (expense_id, member_id),
  KEY ix_exp_payers_member (member_id),
  CONSTRAINT fk_exp_payers_exp FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expense_shares (
  expense_id VARCHAR(32)   NOT NULL,
  member_id  VARCHAR(32)   NOT NULL,
  value      DECIMAL(18,6) NOT NULL,
  excluded   TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (expense_id, member_id),
  CONSTRAINT fk_exp_shares_exp FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expense_tags (
  expense_id VARCHAR(32) NOT NULL,
  tag        VARCHAR(64) NOT NULL,
  PRIMARY KEY (expense_id, tag),
  CONSTRAINT fk_exp_tags_exp FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id                   VARCHAR(32)   NOT NULL,
  period_id            CHAR(7)       NOT NULL,
  from_member_id       VARCHAR(32)   NOT NULL,
  to_member_id         VARCHAR(32)   NOT NULL,
  amount               BIGINT        NOT NULL,
  currency             VARCHAR(8)    NOT NULL,
  kind                 ENUM('settlement','loan') NOT NULL,
  note                 TEXT          NULL,
  fx_rate              DECIMAL(18,8) NOT NULL DEFAULT 1,
  created_at           DATETIME(3)   NOT NULL,
  updated_at           DATETIME(3)   NOT NULL,
  deleted_at           DATETIME(3)   NULL,
  version              INT           NOT NULL DEFAULT 0,
  status               ENUM('sent','pending_confirm','settled') NOT NULL DEFAULT 'settled',
  receipt_data_url     LONGTEXT      NULL,
  index_asset          ENUM('none','gold','usd') NOT NULL DEFAULT 'none',
  index_rate_at_create DECIMAL(18,8) NULL,
  pending_edge VARCHAR(120) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_pending_edge (pending_edge),
  KEY ix_pay_period (period_id),
  KEY ix_pay_from (from_member_id),
  KEY ix_pay_to (to_member_id),
  CONSTRAINT fk_pay_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
