-- P1 · 核心闭环：领域、类别、项目、时间块、习惯、随手记、周复盘
-- 001 已经建了 week / task / setting，这里补列并加新表。

CREATE TABLE IF NOT EXISTS area (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  name_en  TEXT,
  color    TEXT,
  sort     INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO area (id, name, name_en, color, sort) VALUES
  ('area-health',   '健康',     'Health',  '#A8B5A2', 1),
  ('area-study',    '学业事业', 'Study',   '#9BA7B0', 2),
  ('area-relation', '关系',     'Bonds',   '#C9A9A6', 3),
  ('area-finance',  '财务',     'Money',   '#CBBB9A', 4),
  ('area-growth',   '成长',     'Growth',  '#B0A6BC', 5),
  ('area-fun',      '娱乐',     'Leisure', '#CDBDB0', 6);

CREATE TABLE IF NOT EXISTS category (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  name_en TEXT,
  color   TEXT NOT NULL,
  sort    INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO category (id, name, name_en, color, sort) VALUES
  ('cat-study',   '学习提升', 'Study',   '#9BA7B0', 1),
  ('cat-life',    '生活琐事', 'Life',    '#CBBB9A', 2),
  ('cat-habit',   '习惯养成', 'Habits',  '#A8B5A2', 3),
  ('cat-leisure', '休闲玩耍', 'Leisure', '#B0A6BC', 4),
  ('cat-body',    '文娱锻炼', 'Body',    '#C9A9A6', 5);

CREATE TABLE IF NOT EXISTS project (
  id         TEXT PRIMARY KEY,
  area_id    TEXT REFERENCES area(id),
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  due_date   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- task 补列（SQLite 的 ADD COLUMN 不支持 IF NOT EXISTS，靠迁移记录保证只跑一次）
ALTER TABLE task ADD COLUMN project_id TEXT REFERENCES project(id);
ALTER TABLE task ADD COLUMN area_id TEXT REFERENCES area(id);
ALTER TABLE task ADD COLUMN is_focus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task ADD COLUMN due_date TEXT;

CREATE TABLE IF NOT EXISTS time_block (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  start_min   INTEGER NOT NULL,
  end_min     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  category_id TEXT REFERENCES category(id),
  task_id     TEXT REFERENCES task(id),
  source      TEXT NOT NULL DEFAULT 'plan',
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_block_date ON time_block (date);

CREATE TABLE IF NOT EXISTS habit (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  area_id        TEXT REFERENCES area(id),
  target_per_week INTEGER,
  sort           INTEGER NOT NULL DEFAULT 0,
  archived       INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO habit (id, name, sort) VALUES
  ('habit-sleep', '早睡', 1),
  ('habit-water', '喝水', 2),
  ('habit-move',  '运动', 3);

CREATE TABLE IF NOT EXISTS habit_log (
  habit_id TEXT NOT NULL REFERENCES habit(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  done     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (habit_id, date)
);

CREATE TABLE IF NOT EXISTS journal_entry (
  date       TEXT PRIMARY KEY,
  mood       INTEGER,
  body       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weekly_review (
  week_id    TEXT PRIMARY KEY REFERENCES week(id) ON DELETE CASCADE,
  keep       TEXT NOT NULL DEFAULT '',
  improve    TEXT NOT NULL DEFAULT '',
  stop       TEXT NOT NULL DEFAULT '',
  start      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
