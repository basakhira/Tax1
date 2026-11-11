CREATE TABLE IF NOT EXISTS auth_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
