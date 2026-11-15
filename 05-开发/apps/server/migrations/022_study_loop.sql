-- 学习闭环 v1：科目目标、作答记录、反馈与补救
ALTER TABLE subject ADD COLUMN goal TEXT;

-- 作答与辅助程度：independent（独立）/ hinted（提示后）/ revealed（看了答案）/ failed（不会）
ALTER TABLE card_review ADD COLUMN stage TEXT;
ALTER TABLE card_review ADD COLUMN answer TEXT;
