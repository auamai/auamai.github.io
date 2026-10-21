-- Challenge ghosts (r7 ghost): one compact track per (seed, score, course version). Apply before deploying a Worker with
-- /ghost (without it, POST /ghost answers 200 {ok: false} and GET /ghost 200 {b: null}; nothing else changes).
CREATE TABLE IF NOT EXISTS ghosts (
  seed INTEGER NOT NULL,
  score INTEGER NOT NULL,
  course_v INTEGER NOT NULL DEFAULT 1, -- 1 classic straight hall, 2 Factory Zones + turns (r8)
  track TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (seed, score, course_v)
);
CREATE INDEX IF NOT EXISTS ghosts_created ON ghosts (created_at);
