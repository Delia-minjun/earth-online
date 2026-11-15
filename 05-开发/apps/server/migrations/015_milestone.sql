-- 里程碑：阶段目标（主线）+ 少量可验证的小步
CREATE TABLE IF NOT EXISTS milestone (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  area_id    TEXT,
  due_date   TEXT,
  note       TEXT,
  done_at    TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS milestone_step (
  id           TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestone(id),
  title        TEXT NOT NULL,
  done_at      TEXT,
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_milestone_step ON milestone_step (milestone_id);
