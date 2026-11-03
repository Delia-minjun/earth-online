-- 日复盘：一天三问
CREATE TABLE IF NOT EXISTS day_review (
  date       TEXT PRIMARY KEY,
  good       TEXT NOT NULL DEFAULT '',
  bad        TEXT NOT NULL DEFAULT '',
  next       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
