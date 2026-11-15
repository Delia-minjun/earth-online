-- 学习资料按章节组织：资料与卡片都带章节标签
-- chapter 用自由文本，排序时取前导数字（"3"、"3-4"、"L5" 都能排）
ALTER TABLE material ADD COLUMN chapter TEXT;
ALTER TABLE card ADD COLUMN chapter TEXT;
