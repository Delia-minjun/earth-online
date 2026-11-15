-- 学习资料分两类：知识内容（课件/笔记）与题目资料（quiz/作业）
-- knowledge：生成「知识点总结 + 详解」卡片
-- questions：作为参考（题型/难度）出题
ALTER TABLE material ADD COLUMN role TEXT NOT NULL DEFAULT 'knowledge';
