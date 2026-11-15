-- 错题本：自己挑选要收录的题目
CREATE TABLE IF NOT EXISTS wrong_item (
  id         TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subject(id),
  chapter    TEXT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  ref        TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wrong_subject ON wrong_item (subject_id, created_at);
