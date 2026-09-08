-- AES-256-GCM (enc:v1:) card is 67 chars and an IR sheba 79 chars, wider than the old 64 / 32 columns.
ALTER TABLE members
  MODIFY card_number VARCHAR(128) NULL,
  MODIFY sheba VARCHAR(128) NULL;
