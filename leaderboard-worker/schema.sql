-- D1 schema for the Factory Run leaderboard, player profiles and private visit counts.
-- Apply with: wrangler d1 execute auamai-leaderboard --remote --file=./schema.sql

-- Claimed player profiles. Only a SHA-256 hash of the save code is stored.
CREATE TABLE IF NOT EXISTS profiles (
  username     TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash    TEXT NOT NULL,
  best         INTEGER NOT NULL DEFAULT 0,
  games        INTEGER NOT NULL DEFAULT 0,
  gears        INTEGER NOT NULL DEFAULT 0,
  last_played  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Every accepted run. The board shows each name's best.
CREATE TABLE IF NOT EXISTS scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL COLLATE NOCASE,
  score        INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_user ON scores (username);

-- Rate limiting. key = SHA-256(bucket + IP + minute window); rows older than the
-- previous one-minute window are deleted on every request, so no IP outlives it.
CREATE TABLE IF NOT EXISTS rate_limits (
  key     TEXT NOT NULL,
  win  INTEGER NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, win)
);
CREATE INDEX IF NOT EXISTS idx_rate_window ON rate_limits (win);

-- Unique visitors. One random salt per UTC day, replaced daily.
CREATE TABLE IF NOT EXISTS visit_salt (
  day   TEXT PRIMARY KEY,
  salt  TEXT NOT NULL
);

-- SHA-256(salt + IP + User-Agent) per day. Deleted after 30 days.
CREATE TABLE IF NOT EXISTS visits (
  day   TEXT NOT NULL,
  hash  TEXT NOT NULL,
  PRIMARY KEY (day, hash)
);

-- Daily unique counts (kept; contain no personal data).
CREATE TABLE IF NOT EXISTS daily_uniques (
  day      TEXT PRIMARY KEY,
  uniques  INTEGER NOT NULL DEFAULT 0
);

-- Passkeys (round 5). Only the public key and signature counter of each credential.
-- Session tokens from a passkey sign-in: only SHA-256 is stored, 400-day expiry.
-- One-use WebAuthn challenges, 5-minute expiry.
CREATE TABLE IF NOT EXISTS passkeys (
  cred_id     TEXT PRIMARY KEY,
  username    TEXT NOT NULL COLLATE NOCASE,
  public_key  TEXT NOT NULL,
  counter     INTEGER NOT NULL DEFAULT 0,
  transports  TEXT,
  created_at  INTEGER NOT NULL,
  last_used   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passkeys_by_user ON passkeys (username);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  username    TEXT NOT NULL COLLATE NOCASE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (username);
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id          TEXT PRIMARY KEY,
  challenge   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  username    TEXT,
  expires_at  INTEGER NOT NULL
);
