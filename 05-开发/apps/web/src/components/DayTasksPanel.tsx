import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiDay, type ApiTask } from "../api";
import { DDL_TONE_CLASS, ddlTone } from "../ddl";

const WD_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WD_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 某一天的任务列表：点周视图里的某天后在下方展开 */
export function DayTasksPanel({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const [day, setDay] = useState<ApiDay | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDay(await api.day(date));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (task: ApiTask) => {
    await api.setTaskStatus(task.id, task.status === "done" ? "todo" : "done");
    await load();
  };

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    await api.addTask(title, date);
    await load();
  };

  const wd = i18n.language === "zh-CN" ? WD_ZH : WD_EN;
  const dow = new Date(`${date}T00:00:00`).getDay() || 7;
  const tasks = day?.tasks ?? [];
  const done = tasks.filter((x) => x.status === "done").length;

  return (
    <section className="rounded-2xl border border-line bg-surface p-3">
      <header className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold tabular-nums text-ink">
          {date.slice(5).replace("-", "/")} {wd[dow - 1]}
        </h2>
        <span className="text-[10px] text-ink-3">
          {t("today.focus")} {done}/{tasks.length}
        </span>
      </header>

      {error ? <p className="mt-2 text-[10px] text-warn">{error}</p> : null}

      <ul className="mt-1.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 py-1.5">
            <button
              type="button"
              onClick={() => void toggle(task)}
              className={`grid h-[16px] w-[16px] shrink-0 place-items-center rounded-full border text-[8px] transition-colors ${
                task.status === "done"
                  ? "border-accent bg-accent text-white"
                  : "border-line text-transparent hover:border-accent"
              }`}
              aria-label={task.title}
            >
              ✓
            </button>
            <span
              className={`min-w-0 flex-1 truncate text-[11.5px] ${
                task.status === "done" ? "text-ink-3 line-through" : "text-ink-2"
              }`}
            >
              {task.title}
            </span>
            {task.due_date ? (
              <span
                className={`shrink-0 rounded-full px-1.5 py-[1px] text-[9px] tabular-nums ${DDL_TONE_CLASS[ddlTone(task.due_date, task.status === "done")]}`}
              >
                DDL {task.due_date.slice(5)}
              </span>
            ) : null}
            {task.overdue ? (
              <span className="shrink-0 rounded-full bg-warn-soft px-1.5 py-[1px] text-[9px] tabular-nums text-warn">
                {t("task.overdue")} {task.scheduled_date?.slice(5)}
              </span>
            ) : null}
          </li>
        ))}
        {tasks.length === 0 ? (
          <li className="py-1.5 text-[10.5px] text-[#c8c4bc]">{t("today.focusEmpty")}</li>
        ) : null}
      </ul>

      <div className="mt-1.5 flex items-center gap-2 border-t border-line-2 pt-2">
        <span className="text-[10px] text-[#c8c4bc]">＋</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder={t("today.focusAdd")}
          className="w-full bg-transparent text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={!draft.trim()}
          className="shrink-0 rounded-full border border-line px-2 py-[1px] text-[10px] text-[#a9a49b] transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {t("action.add")}
        </button>
      </div>
    </section>
  );
}
