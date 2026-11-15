-- 领域精简为四个：身体健康 / 技能爱好 / 财务管理 / 学业事业
-- 关系与娱乐归档（不再计分），并把成长改造成「技能爱好」

UPDATE area SET name = '身体健康', name_en = 'Body', sort = 1 WHERE id = 'area-health';
UPDATE area SET name = '学业事业', name_en = 'Study & work', sort = 2 WHERE id = 'area-study';
UPDATE area SET name = '技能爱好', name_en = 'Skills & hobbies', sort = 3 WHERE id = 'area-growth';
UPDATE area SET name = '财务管理', name_en = 'Money', sort = 4 WHERE id = 'area-finance';

UPDATE area SET archived = 1 WHERE id IN ('area-relation', 'area-fun');

DELETE FROM area_xp WHERE area_id IN ('area-relation', 'area-fun');
DELETE FROM area_xp_log WHERE area_id IN ('area-relation', 'area-fun');
DELETE FROM area_progress WHERE area_id IN ('area-relation', 'area-fun');
