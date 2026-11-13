-- P5a 学习 Agent：科目 / 资料 / 卡片 / 复习记录
-- 独立数据域，只通过「复习任务」「学习时长」「考试倒计时」三条线与主系统相连

CREATE TABLE IF NOT EXISTS subject (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  color    TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0
);

-- 资料：一段文字、一张图（OCR 后）、或一个链接
CREATE TABLE IF NOT EXISTS material (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subject(id),
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL,                  -- text | image | link
  source      TEXT,                           -- 链接地址或原始文件名
  content     TEXT NOT NULL DEFAULT '',       -- 正文（OCR/粘贴）
  status      TEXT NOT NULL DEFAULT 'raw',    -- raw（待校对）| verified（可出题）
  page_from   INTEGER,
  page_to     INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_material_subject ON material (subject_id, created_at);

-- 背记卡片：正面问题 / 背面答案，box 决定下次复习间隔
CREATE TABLE IF NOT EXISTS card (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subject(id),
  material_id TEXT REFERENCES material(id),
  front       TEXT NOT NULL,
  back        TEXT NOT NULL,
  ref         TEXT,                           -- 出处提示，如「课件 P12」
  box         INTEGER NOT NULL DEFAULT 1,     -- 1..5，对应 1/3/7/21/60 天
  due_date    TEXT NOT NULL,
  reviewed_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_card_due ON card (due_date);
CREATE INDEX IF NOT EXISTS idx_card_subject ON card (subject_id);

-- 复习流水：谁在什么时候怎么评的
CREATE TABLE IF NOT EXISTS card_review (
  id         TEXT PRIMARY KEY,
  card_id    TEXT NOT NULL REFERENCES card(id),
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  rating     TEXT NOT NULL,                   -- again | good | easy
  prev_box   INTEGER NOT NULL,
  next_box   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_review_at ON card_review (at);

-- 考试：给主系统提供倒计时
CREATE TABLE IF NOT EXISTS exam (
  id         TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subject(id),
  title      TEXT NOT NULL,
  date       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
