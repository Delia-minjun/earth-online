-- 里程碑按“打算花多久”设置（月），到期日由开始日 + 月数推导
ALTER TABLE milestone ADD COLUMN months INTEGER;
