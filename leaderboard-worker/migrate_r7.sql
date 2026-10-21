-- Garage (r7): robot name + design code + Spare Servo flag on each run. Apply before deploying the r7 Worker
-- (the Worker falls back to the old columns if this hasn't run, so order isn't fatal).
ALTER TABLE scores ADD COLUMN robot TEXT;
ALTER TABLE scores ADD COLUMN design TEXT;
ALTER TABLE scores ADD COLUMN revive INTEGER NOT NULL DEFAULT 0;
