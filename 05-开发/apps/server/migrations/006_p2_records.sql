-- P2 · 记录类：记账、身体、饮食
-- 原则：都以日期为主键挂载（需求 §2.4）

CREATE TABLE IF NOT EXISTS money_category (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  name_en  TEXT,
  kind     TEXT NOT NULL DEFAULT 'expense', -- expense | income
  color    TEXT,
  sort     INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO money_category (id, name, name_en, kind, color, sort) VALUES
  ('mc-food',      '食品', 'Food',      'expense', '#C9A9A6', 1),
  ('mc-transport', '出行', 'Transport', 'expense', '#9BA7B0', 2),
  ('mc-life',      '生活', 'Living',    'expense', '#CBBB9A', 3),
  ('mc-fun',       '娱乐', 'Fun',       'expense', '#B0A6BC', 4),
  ('mc-study',     '学习', 'Study',     'expense', '#A8B5A2', 5),
  ('mc-salary',    '工资', 'Salary',    'income',  '#8FA8A0', 6),
  ('mc-other-in',  '其他收入', 'Other', 'income',  '#B5A88F', 7);

CREATE TABLE IF NOT EXISTS money_entry (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'expense',
  amount      REAL NOT NULL,
  category_id TEXT REFERENCES money_category(id),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_money_date ON money_entry (date);

CREATE TABLE IF NOT EXISTS body_log (
  date       TEXT PRIMARY KEY,
  weight     REAL,
  workout    TEXT,            -- 逗号分隔的训练类型，如「有氧,臀腿」
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meal_day (
  date      TEXT PRIMARY KEY,
  breakfast TEXT NOT NULL DEFAULT '',
  lunch     TEXT NOT NULL DEFAULT '',
  dinner    TEXT NOT NULL DEFAULT '',
  snack     TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
