import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiTask } from "../api";
import { Card } from "../components/Card";

/** 首页的任务清单：勾完得币，币数来自当前规则 */
export function TodayTasksCard({
  coinPerTask,
  onChanged,
}: {
  coinPerTask: number;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const day = await api.day();
      setTasks(day.tasks);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (task: ApiTask) => {
    const next = task.status === "done" ? "todo" : "done";
    // 乐观更新，点击立刻有反馈
    setTasks((list) => list.map((x) => (x.id === task.id ? { ...x, status: next } : x)));
    try {
      await api.setTaskStatus(task.id, next);
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
      await load();
    }
  };

  const open = tasks.filter((x) => x.status !== "done" && x.status !== "dropped");
  const done = tasks.filter((x) => x.status === "done");

  return (
    <Card title={t("growth.tasks")}>
      {error ? <p className="mb-2 text-[10px] text-warn">{error}</p> : null}
      <ul className="divide-y divide-line-2">
        {[...open, ...done].map((task) => {
          const isDone = task.status === "done";
          return (
            <li key={task.id} className="flex items-center gap-2 py-1.5 first:pt-0">
              <button
                type="button"
                onClick={() => void toggle(task)}
                aria-label={isDone ? t("growth.markUndone") : t("growth.markDone")}
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] leading-none transition-colors ${
                  isDone
                    ? "border-accent bg-accent text-white"
                    : "border-[#cfc9be] text-transparent hover:border-accent"
                }`}
              >
                ✓
              </button>
              <span
                className={`min-w-0 flex-1 truncate text-[11.5px] ${
                  isDone ? "text-ink-3 line-through" : "text-ink"
                }`}
              >
                {task.title}
              </span>
              {task.overdue ? (
                <span className="shrink-0 rounded-full bg-warn-soft px-1.5 py-[1px] text-[9px] text-warn">
                  {t("growth.overdueTag")}
                </span>
              ) : null}
              {!isDone ? (
                <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-[1px] text-[9px] tabular-nums text-accent">
                  +{coinPerTask}
                </span>
              ) : null}
            </li>
          );
        })}
        {tasks.length === 0 ? (
          <li className="py-1.5 text-[10px] text-[#c8c4bc]">{t("growth.noTask")}</li>
        ) : null}
      </ul>
    </Card>
  );
}
