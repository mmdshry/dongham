ALTER TABLE members DROP FOREIGN KEY fk_members_period;
ALTER TABLE attachments DROP FOREIGN KEY fk_att_period;
ALTER TABLE expenses DROP FOREIGN KEY fk_exp_period;
ALTER TABLE payments DROP FOREIGN KEY fk_pay_period;
ALTER TABLE invites DROP FOREIGN KEY fk_invites_period;
ALTER TABLE chat DROP FOREIGN KEY fk_chat_period;
ALTER TABLE recurring DROP FOREIGN KEY fk_rec_period;
ALTER TABLE activity DROP FOREIGN KEY fk_act_period;
ALTER TABLE telegram_links DROP FOREIGN KEY fk_tg_period;

ALTER TABLE members
  DROP INDEX uq_member_one_pot,
  DROP COLUMN pot_period;

ALTER TABLE periods MODIFY id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE members MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE attachments MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE expenses MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE payments MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE invites MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE chat MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE recurring MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE activity MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE telegram_links MODIFY period_id VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;

ALTER TABLE members
  ADD COLUMN pot_period VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  ADD UNIQUE KEY uq_member_one_pot (pot_period);
UPDATE members SET pot_period = period_id WHERE is_pot = 1;

ALTER TABLE members ADD CONSTRAINT fk_members_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE attachments ADD CONSTRAINT fk_att_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD CONSTRAINT fk_exp_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE payments ADD CONSTRAINT fk_pay_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE invites ADD CONSTRAINT fk_invites_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE chat ADD CONSTRAINT fk_chat_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE recurring ADD CONSTRAINT fk_rec_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE activity ADD CONSTRAINT fk_act_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
ALTER TABLE telegram_links ADD CONSTRAINT fk_tg_period FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE CASCADE;
