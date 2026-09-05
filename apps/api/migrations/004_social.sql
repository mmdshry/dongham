CREATE TABLE invites (
  token      VARCHAR(16) NOT NULL,
  period_id  CHAR(7)     NOT NULL,
  created_by VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NULL,
  PRIMARY KEY (token),
  KEY ix_invites_period (period_id),
  CONSTRAINT fk_invites_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chat (
  id               VARCHAR(32) NOT NULL,
  period_id        CHAR(7)     NOT NULL,
  sender_member_id VARCHAR(32) NOT NULL,
  body             TEXT        NOT NULL,
  expense_id       VARCHAR(32) NULL,
  created_at       DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_chat_period_created (period_id, created_at),
  CONSTRAINT fk_chat_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE friends (
  id             VARCHAR(32)  NOT NULL,
  user_id        VARCHAR(32)  NOT NULL,
  friend_user_id VARCHAR(32)  NULL,
  display_name   VARCHAR(80)  NOT NULL,
  phone          VARCHAR(15)  NULL,
  email          VARCHAR(191) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_friend_phone (user_id, phone),
  UNIQUE KEY uq_friend_email (user_id, email),
  KEY ix_friends_user (user_id),
  CONSTRAINT fk_friends_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friends_target FOREIGN KEY (friend_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id         VARCHAR(32)  NOT NULL,
  user_id    VARCHAR(32)  NOT NULL,
  title      VARCHAR(160) NOT NULL,
  body       TEXT         NOT NULL,
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_notif_user_created (user_id, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recurring (
  id            VARCHAR(32)  NOT NULL,
  period_id     CHAR(7)      NOT NULL,
  title         VARCHAR(200) NOT NULL,
  amount        BIGINT       NOT NULL,
  currency      VARCHAR(8)   NOT NULL,
  payer_id      VARCHAR(32)  NOT NULL,
  split_mode    ENUM('equal','weight','exact','percent') NOT NULL,
  interval_days INT          NOT NULL,
  cadence       ENUM('days','jalaliMonthly','jalaliBimonthly') NULL,
  next_at       DATETIME(3)  NOT NULL,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY ix_rec_period (period_id),
  CONSTRAINT fk_rec_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recurring_shares (
  recurring_id VARCHAR(32)   NOT NULL,
  member_id    VARCHAR(32)   NOT NULL,
  value        DECIMAL(18,6) NOT NULL,
  excluded     TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (recurring_id, member_id),
  CONSTRAINT fk_rec_shares_rec FOREIGN KEY (recurring_id) REFERENCES recurring(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity (
  id         VARCHAR(32) NOT NULL,
  period_id  CHAR(7)     NOT NULL,
  actor_name VARCHAR(80) NOT NULL,
  action     VARCHAR(64) NOT NULL,
  summary    TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL,
  entity_id  VARCHAR(32) NULL,
  PRIMARY KEY (id),
  KEY ix_act_period_created (period_id, created_at),
  CONSTRAINT fk_act_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
