-- 锻炼记录：一天可以有多条，各自带项目、类型与时长
CREATE TABLE IF NOT EXISTS workout_log (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,
  tag        TEXT,
  minutes    INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workout_date ON workout_log (date);
