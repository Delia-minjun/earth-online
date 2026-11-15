-- 章节练习题：把整章的题目类资料汇总成一套题，每题带答案与详解
CREATE TABLE IF NOT EXISTS chapter_practice (
  id         TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subject(id),
  chapter    TEXT,
  items      TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chapter_practice_key
  ON chapter_practice (subject_id, IFNULL(chapter, ''));
