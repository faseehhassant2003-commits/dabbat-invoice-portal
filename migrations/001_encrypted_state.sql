CREATE TABLE IF NOT EXISTS dabbat_encrypted_state (
  key text PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 100),
  payload text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dabbat_encrypted_state IS
  'Application-encrypted portal state. Payloads require TOKEN_ENCRYPTION_KEY to decrypt.';
