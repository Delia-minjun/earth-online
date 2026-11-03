-- P1 · 课表：每周固定重复的课程
CREATE TABLE IF NOT EXISTS course (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_min  INTEGER NOT NULL,
  end_min    INTEGER NOT NULL,
  location   TEXT,
  color      TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_course_weekday ON course (weekday, start_min);
