-- Challenge ghosts (r7 ghost): one compact track per (seed, score). Apply before deploying a Worker with
-- /ghost (without it, POST /ghost answers 503 and GET /ghost 404; nothing else changes).
CREATE TABLE IF NOT EXISTS ghosts (
  seed INTEGER NOT NULL,
  score INTEGER NOT NULL,
  track TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (seed, score)
);
CREATE INDEX IF NOT EXISTS ghosts_created ON ghosts (created_at);
