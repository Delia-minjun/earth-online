-- P0 · 初始表结构
-- 只建最小的三张表，用来验证「迁移 → 读写 → 接口」这条链路。

CREATE TABLE IF NOT EXISTS setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS week (
  id         TEXT PRIMARY KEY,              -- 形如 2026-W45
  iso_year   INTEGER NOT NULL,
  iso_week   INTEGER NOT NULL,
  start_date TEXT NOT NULL,                 -- 周一，yyyy-mm-dd
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (iso_year, iso_week)
);

CREATE TABLE IF NOT EXISTS task (
  id             TEXT PRIMARY KEY,
  week_id        TEXT REFERENCES week(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'todo',   -- todo | doing | done | dropped
  priority       INTEGER NOT NULL DEFAULT 0,
  estimate_min   INTEGER,
  scheduled_date TEXT,
  done_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_week ON task (week_id);
CREATE INDEX IF NOT EXISTS idx_task_sched ON task (scheduled_date);
