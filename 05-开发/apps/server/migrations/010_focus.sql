-- P3 番茄钟：一次专注/休息的会话，按时间戳记，不依赖前端定时器
CREATE TABLE IF NOT EXISTS focus_session (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  kind        TEXT NOT NULL,                  -- focus | break
  task_id     TEXT,
  started_at  TEXT NOT NULL,                  -- ISO 8601，带时区
  planned_min INTEGER NOT NULL DEFAULT 25,    -- 正计时为 0
  ended_at    TEXT,
  actual_sec  INTEGER,
  status      TEXT NOT NULL DEFAULT 'running',-- running | done | void
  block_id    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_focus_date ON focus_session (date);
CREATE INDEX IF NOT EXISTS idx_focus_status ON focus_session (status);
