-- 领域奖励独立于发币：即使发币关闭或达到上限，同一任务也只能推进一次。
ALTER TABLE task ADD COLUMN progress_awarded INTEGER NOT NULL DEFAULT 0;

-- 历史完成过的任务不能在升级后重新领取进度。
UPDATE task SET progress_awarded = 1
 WHERE status = 'done'
    OR EXISTS (SELECT 1 FROM coin_entry WHERE kind = 'task' AND ref_id = task.id);
