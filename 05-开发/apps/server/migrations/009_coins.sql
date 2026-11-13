-- P3 奖惩经济：币的流水、奖赏商店、六条领域进度条

-- 一切加减都进流水，余额 = SUM(amount)，不做可变的 balance 字段
CREATE TABLE IF NOT EXISTS coin_entry (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  kind       TEXT NOT NULL,          -- task / habit / streak / focus / review / redeem / bonus
  ref_id     TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coin_date ON coin_entry (date);

CREATE TABLE IF NOT EXISTS reward_item (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  price             INTEGER NOT NULL,
  money             INTEGER NOT NULL DEFAULT 0,   -- 兑换时顺带记一笔真实支出（0 表示不记）
  money_category_id TEXT,
  archived          INTEGER NOT NULL DEFAULT 0,
  sort              INTEGER NOT NULL DEFAULT 0
);

-- 领域进度条：0..1，按天惰性衰减，下限 40%
CREATE TABLE IF NOT EXISTS area_progress (
  area_id    TEXT PRIMARY KEY,
  value      REAL NOT NULL DEFAULT 0.5,
  updated_on TEXT
);
