ALTER TABLE members DROP INDEX ix_members_period;
ALTER TABLE user_payout_methods DROP INDEX ix_payout_user;

ALTER TABLE members DROP FOREIGN KEY fk_members_period;
ALTER TABLE attachments DROP FOREIGN KEY fk_att_period;
ALTER TABLE expenses DROP FOREIGN KEY fk_exp_period;
ALTER TABLE payments DROP FOREIGN KEY fk_pay_period;
ALTER TABLE invites DROP FOREIGN KEY fk_invites_period;
ALTER TABLE chat DROP FOREIGN KEY fk_chat_period;
ALTER TABLE recurring DROP FOREIGN KEY fk_rec_period;
ALTER TABLE activity DROP FOREIGN KEY fk_act_period;
ALTER TABLE telegram_links DROP FOREIGN KEY fk_tg_period;

ALTER TABLE periods MODIFY id VARCHAR(7) NOT NULL;

ALTER TABLE members
  DROP INDEX uq_member_one_pot,
  DROP COLUMN pot_period,
  MODIFY period_id VARCHAR(7) NOT NULL;

ALTER TABLE members
  ADD COLUMN pot_period VARCHAR(7) NULL,
  ADD UNIQUE KEY uq_member_one_pot (pot_period);
UPDATE members SET pot_period = period_id WHERE is_pot = 1;

ALTER TABLE attachments MODIFY period_id VARCHAR(7) NOT NULL;
ALTER TABLE expenses MODIFY period_id VARCHAR(7) NOT NULL;
ALTER TABLE payments MODIFY period_id VARCHAR(7) NOT NULL;
ALTER TABLE invites MODIFY period_id VARCHAR(7) NOT NULL;
ALTER TABLE chat MODIFY period_id VARCHAR(7) NOT NULL;
ALTER TABLE recurring MODIFY period_id VARCHAR(7) NOT NULL;
ALTER TABLE activity MODIFY period_id VARCHAR(7) NOT NULL;
ALTER TABLE telegram_links MODIFY period_id VARCHAR(7) NOT NULL;

ALTER TABLE members ADD CONSTRAINT fk_members_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE attachments ADD CONSTRAINT fk_att_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD CONSTRAINT fk_exp_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE payments ADD CONSTRAINT fk_pay_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE invites ADD CONSTRAINT fk_invites_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE chat ADD CONSTRAINT fk_chat_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE recurring ADD CONSTRAINT fk_rec_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE activity ADD CONSTRAINT fk_act_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE telegram_links ADD CONSTRAINT fk_tg_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;

ALTER TABLE user_payout_methods MODIFY card_number VARCHAR(16) NOT NULL;
ALTER TABLE sessions MODIFY token VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;
ALTER TABLE impersonation_tickets MODIFY token VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_bin NULL;

CREATE INDEX ix_exp_period_deleted ON expenses (period_id, deleted_at);
CREATE INDEX ix_pay_period_deleted_status ON payments (period_id, deleted_at, status);
CREATE INDEX ix_rec_period_active ON recurring (period_id, active);
CREATE INDEX ix_exp_shares_member ON expense_shares (member_id);
CREATE INDEX ix_sheba_cache_hash ON sheba_lookup_cache (card_hash);
CREATE INDEX ix_otps_expires ON otps (expires_at);

ALTER TABLE impersonation_tickets
  ADD CONSTRAINT fk_imp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_imp_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE admin_audit
  ADD CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE periods ADD CONSTRAINT chk_periods_round_to CHECK (round_to IN (0, 1000, 10000));
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount CHECK (amount >= 0);
ALTER TABLE payments ADD CONSTRAINT chk_payments_amount CHECK (amount >= 0);
ALTER TABLE recurring ADD CONSTRAINT chk_recurring_amount CHECK (amount >= 0);
ALTER TABLE payments ADD CONSTRAINT chk_payments_from_to CHECK (from_member_id <> to_member_id);
ALTER TABLE members ADD CONSTRAINT chk_members_weight CHECK (weight_default > 0);
