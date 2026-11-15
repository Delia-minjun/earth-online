-- 本章讲解：知识点逐条讲解 + 易错点归纳（可读文本，不是问答卡）
CREATE TABLE IF NOT EXISTS study_note (
  id         TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subject(id),
  chapter    TEXT,
  content    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_note_key
  ON study_note (subject_id, IFNULL(chapter, ''));
