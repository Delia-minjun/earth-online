-- 课表支持单双周与周次范围
ALTER TABLE course ADD COLUMN week_type TEXT NOT NULL DEFAULT 'all'; -- all | odd | even | range
ALTER TABLE course ADD COLUMN week_start INTEGER;
ALTER TABLE course ADD COLUMN week_end INTEGER;
