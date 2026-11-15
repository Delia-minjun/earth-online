-- 里程碑完成时给的币（默认 30）
ALTER TABLE milestone ADD COLUMN coins INTEGER NOT NULL DEFAULT 30;
