CREATE TABLE IF NOT EXISTS ai_sdr_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_sdr_nonces_expires_at
  ON ai_sdr_nonces (expires_at);
