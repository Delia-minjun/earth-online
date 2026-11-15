-- 生活成长：领域 XP（长期累计，不衰减）+ 行动日志 + 奖赏心愿标记
CREATE TABLE IF NOT EXISTS area_xp (
  area_id    TEXT PRIMARY KEY,
  xp         INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 每条 XP 来源都留一条日志：用于「近 14 天 N 次」和日后的成长证据
CREATE TABLE IF NOT EXISTS area_xp_log (
  id         TEXT PRIMARY KEY,
  area_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  ref_id     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_area_xp_log_date ON area_xp_log (date, area_id);

-- 奖赏：心愿（星标）；已兑换次数由 coin_entry 统计
ALTER TABLE reward_item ADD COLUMN wish INTEGER NOT NULL DEFAULT 0;
