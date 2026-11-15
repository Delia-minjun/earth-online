-- 小目标也要能设时长、也能算「第几天」
-- 注意：SQLite 的 ADD COLUMN 不接受非常量默认值，先给空串再回填
ALTER TABLE milestone_step ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
UPDATE milestone_step SET created_at = datetime('now') WHERE created_at = '';
ALTER TABLE milestone_step ADD COLUMN months INTEGER;
