ALTER TABLE scores ADD COLUMN mode TEXT NOT NULL DEFAULT 'free';
ALTER TABLE scores ADD COLUMN day TEXT;
ALTER TABLE scores ADD COLUMN week TEXT;
CREATE INDEX IF NOT EXISTS idx_scores_daily ON scores (mode, day, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_week ON scores (week, score DESC);
ALTER TABLE profiles ADD COLUMN cosmetics TEXT;
