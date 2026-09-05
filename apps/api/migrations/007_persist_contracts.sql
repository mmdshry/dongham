ALTER TABLE sessions MODIFY token TEXT NOT NULL;
ALTER TABLE impersonation_tickets MODIFY token TEXT NULL;
ALTER TABLE members MODIFY card_number VARCHAR(64) NULL;
