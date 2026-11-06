import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  hhmm,
  type ApiDay,
  type ApiHabitGrid,
  type ApiTask,
} from "../api";
import { Card } from "../components/Card";
import { DdlButton } from "../components/DdlButton";
import { DDL_TONE_CLASS, ddlTone } from "../ddl";
import { BodyCard, MealsCard, MoneyCard } from "../components/Records";

function Mini({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card title={title} action={action}>
      {children}
    </Card>
  );
}

const DONE = "done";

export function TodayView() {
  const { t } = useTranslation();
  const [day, setDay] = useState<ApiDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await api.day();
      setDay(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* ---- 今日任务 ---- */
  const [draft, setDraft] = useState("");
  const [ddlDraft, setDdlDraft] = useState("");
  const addFocus = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const dueDate = ddlDraft || undefined;
    setDdlDraft("");
    await api.addTask(title, undefined, undefined, dueDate);
    await reload();
  };

  const toggleTask = async (id: string, status: string) => {
    await api.setTaskStatus(id, status === DONE ? "todo" : "done");
    await reload();
  };

  const removeTask = async (id: string) => {
    await api.deleteTask(id);
    await reload();
  };

  /* ---- 习惯 ---- */
  const toggleHabit = async (id: string) => {
    await api.toggleHabit(id);
    await reload();
  };

  const [habitOpen, setHabitOpen] = useState(false);
  const [newHabit, setNewHabit] = useState("");

  const addHabit = async () => {
    const name = newHabit.trim();
    if (!name) return;
    setNewHabit("");
    await api.addHabit(name);
    await reload();
  };

  const removeHabit = async (id: string) => {
    await api.deleteHabit(id);
    await reload();
  };

  /* ---- 习惯网格 ---- */
  const [grid, setGrid] = useState<ApiHabitGrid | null>(null);
  useEffect(() => {
    if (!habitOpen) return;
    let alive = true;
    api
      .habitGrid(14)
      .then((g) => alive && setGrid(g))
      .catch(() => alive && setGrid(null));
    return () => {
      alive = false;
    };
  }, [habitOpen, day?.habits.length]);

  /* ---- 最近 14 天日期 ---- */
  const last14 = useMemo(() => {
    const end = grid?.end ?? day?.date;
    if (!end) return [] as string[];
    const base = new Date(`${end}T00:00:00`);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - (13 - i));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    });
  }, [grid?.end, day?.date]);

  /* ---- 任务编辑 ---- */
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", priority: 0, date: "", dueDate: "" });

  const startEditTask = (task: ApiTask) => {
    setEditTaskId(task.id);
    setTaskForm({
      title: task.title,
      priority: task.priority ?? 0,
      date: task.scheduled_date ?? day?.date ?? "",
      dueDate: task.due_date ?? "",
    });
  };

  const saveTask = async () => {
    if (!editTaskId) return;
    const title = taskForm.title.trim();
    if (!title) return;
    await api.patchTask(editTaskId, {
      title,
      priority: taskForm.priority,
      date: taskForm.date || undefined,
      dueDate: taskForm.dueDate || null,
    });
    setEditTaskId(null);
    await reload();
  };

  /* ---- 随手记（自动保存） ---- */
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dateRef = useRef<string | null>(null);
  const savedRef = useRef("");

  // 只在「日期变化」时同步一次输入框，避免被后台刷新覆盖
  useEffect(() => {
    if (!day) return;
    if (dateRef.current === day.date) return;
    dateRef.current = day.date;
    const body = day.journal?.body ?? "";
    savedRef.current = body;
    setNote(body);
    setNoteState(body ? "saved" : "idle");
  }, [day]);

  // 只依赖输入内容：不因 day 的刷新而打断定时器
  useEffect(() => {
    const date = dateRef.current;
    if (!date) return;
    if (note === savedRef.current) return;

    setNoteState("saving");
    const timer = window.setTimeout(() => {
      const value = note;
      api
        .saveJournal(date, value)
        .then(() => {
          savedRef.current = value;
          setNoteState("saved");
        })
        .catch(() => setNoteState("error"));
    }, 600);

    return () => window.clearTimeout(timer);
  }, [note]);

  if (!day) {
    return (
      <Card title={t("today.focus")}>
        <p className="py-4 text-center text-[11.5px] text-ink-3">{error ?? t("common.loading")}</p>
      </Card>
    );
  }

  const focus = day.tasks;
  const doneCount = focus.filter((x) => x.status === DONE).length;

  return (
    <div className="space-y-3.5">
      {error ? <p className="text-[10px] text-warn">{error}</p> : null}

      <div className="space-y-3.5 lg:grid lg:grid-cols-2 lg:gap-3.5 lg:space-y-0">
        {/* 今日任务：横跨正文两列 */}
        <div className="space-y-3.5 lg:col-span-2">
          <Card title={t("today.focus")} action={`${doneCount}/${focus.length}`}>
            <ul className="divide-y divide-line-2">
              {focus.map((f) =>
                editTaskId === f.id ? (
                  <li key={f.id} className="space-y-1.5 rounded-lg bg-surface-2 p-2">
                    <input
                      value={taskForm.title}
                      onChange={(e) => setTaskForm((v) => ({ ...v, title: e.target.value }))}
                      className="w-full rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={taskForm.priority}
                        onChange={(e) =>
                          setTaskForm((v) => ({ ...v, priority: Number(e.target.value) }))
                        }
                        className="rounded-md border border-line bg-surface px-1.5 py-1 text-[10.5px] text-ink-2 outline-none"
                      >
                        <option value={0}>{t("task.priority0")}</option>
                        <option value={1}>{t("task.priority1")}</option>
                        <option value={2}>{t("task.priority2")}</option>
                      </select>
                      <input
                        type="date"
                        value={taskForm.date}
                        onChange={(e) => setTaskForm((v) => ({ ...v, date: e.target.value }))}
                        className="rounded-md border border-line bg-surface px-1.5 py-1 text-[10.5px] tabular-nums text-ink-2 outline-none"
                      />
                      <DdlButton
                        size="md"
                        value={taskForm.dueDate}
                        onChange={(v) => setTaskForm((f) => ({ ...f, dueDate: v ?? "" }))}
                      />
                      <button
                        type="button"
                        onClick={() => void saveTask()}
                        className="ml-auto rounded-md bg-accent px-2.5 py-1 text-[10px] font-semibold text-white"
                      >
                        {t("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTaskId(null)}
                        className="rounded-md border border-line px-2.5 py-1 text-[10px] text-ink-3"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={f.id} className="group flex items-center gap-3 py-2.5 first:pt-0">
                    <button
                      type="button"
                      onClick={() => void toggleTask(f.id, f.status)}
                      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[9px] transition-colors ${
                        f.status === DONE
                          ? "border-accent bg-accent text-white"
                          : "border-line text-transparent hover:border-accent"
                      }`}
                      aria-label={f.title}
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[12.5px] ${
                          f.status === DONE ? "text-ink-3 line-through" : "text-ink"
                        }`}
                      >
                        {f.title}
                      </p>
                      {f.priority > 0 ? (
                        <span className="mt-0.5 inline-block text-[9px] text-[#b08b6a]">
                          {f.priority >= 2 ? t("task.priority2") : t("task.priority1")}
                        </span>
                      ) : null}
                    </div>
                    {f.due_date ? (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-[2px] text-[9px] tabular-nums ${DDL_TONE_CLASS[ddlTone(f.due_date, f.status === DONE)]}`}
                        title={t("task.ddl")}
                      >
                        DDL {f.due_date.slice(5)}
                      </span>
                    ) : null}
                    {f.overdue && !f.due_date ? (
                      <span className="shrink-0 rounded-full bg-warn-soft px-1.5 py-[2px] text-[9px] tabular-nums text-warn">
                        {t("task.overdue")} {f.scheduled_date?.slice(5)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => startEditTask(f)}
                      className="shrink-0 rounded-full border border-line px-1.5 py-[1px] text-[9px] text-[#a9a49b] opacity-100 transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent md:opacity-0 md:group-hover:opacity-100"
                      aria-label="edit"
                    >
                      {t("course.editRow")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeTask(f.id)}
                      className="shrink-0 text-[12px] leading-none text-[#a9a49b] opacity-100 transition-colors hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                      aria-label="delete"
                    >
                      ×
                    </button>
                  </li>
                ),
              )}
              {focus.length === 0 ? (
                <li className="py-2 text-[11.5px] text-ink-3">{t("today.focusEmpty")}</li>
              ) : null}
            </ul>
            <div className="mt-2 border-t border-line-2 pt-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#c8c4bc]">＋</span>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addFocus();
                  }}
                  placeholder={t("today.focusAdd")}
                  className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-[#c8c4bc]"
                />
                <DdlButton value={ddlDraft} onChange={(v) => setDdlDraft(v ?? "")} />
                <button
                  type="button"
                  onClick={() => void addFocus()}
                  disabled={!draft.trim()}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] transition-colors ${
                    draft.trim()
                      ? "bg-accent text-white hover:opacity-90"
                      : "border border-line text-[#d6d2ca]"
                  }`}
                  aria-label={t("today.focusConfirm")}
                >
                  ✓
                </button>
              </div>
            </div>
          </Card>
        </div>

        <Mini
          title={t("today.habits")}
            action={
              <span className="flex items-center gap-2">
                <span>{day.habits.filter((h) => h.done).length}/{day.habits.length}</span>
                <button
                  type="button"
                  onClick={() => setHabitOpen(true)}
                  className="rounded-full border border-line px-1.5 py-0.5 text-[9px] text-ink-3 transition-colors hover:border-accent hover:text-ink"
                >
                  {t("today.manage")}
                </button>
              </span>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {day.habits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => void toggleHabit(h.id)}
                  className={`rounded-full px-2.5 py-1 text-[10.5px] transition-colors ${
                    h.done
                      ? "bg-accent text-white"
                      : "border border-line bg-surface text-ink-3 hover:border-accent"
                  }`}
                >
                  {h.done ? "✓ " : ""}
                  {h.name}
                </button>
              ))}
            </div>
          </Mini>

        <MoneyCard date={day.date} />

        <BodyCard date={day.date} />

        <MealsCard date={day.date} />
      </div>

      <Mini
        title={t("today.notes")}
        action={
          noteState === "saving"
            ? t("common.saving")
            : noteState === "saved"
              ? t("common.saved")
              : noteState === "error"
                ? t("common.saveFailed")
                : null
        }
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder={t("today.notePlaceholder")}
          className="w-full resize-none bg-transparent text-[11.5px] leading-relaxed text-ink-2 outline-none placeholder:text-[#c8c4bc]"
        />
      </Mini>

      {habitOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-4 pt-24"
          onClick={() => setHabitOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">{t("today.manageHabits")}</h2>
              <button
                type="button"
                onClick={() => setHabitOpen(false)}
                className="text-[14px] leading-none text-ink-3 transition-colors hover:text-ink"
                aria-label="close"
              >
                ✕
              </button>
            </header>

            <ul className="mt-2">
              {day.habits.map((h) => {
                const marks = new Set(grid?.byHabit[h.id] ?? []);
                return (
                  <li
                    key={h.id}
                    className="group flex items-center gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[12px] text-ink">{h.name}</span>
                        {(grid?.streak[h.id] ?? 0) > 1 ? (
                          <span className="shrink-0 text-[9.5px] tabular-nums text-ink-3">
                            {t("habit.streak", { n: grid?.streak[h.id] })}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex gap-[3px]">
                        {last14.map((d) => (
                          <span
                            key={d}
                            title={d}
                            className={`h-2 w-[13px] rounded-[2px] ${
                              marks.has(d) ? "bg-accent" : "bg-[#e8e4dc]"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeHabit(h.id)}
                      className="shrink-0 self-center text-[12px] leading-none text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                      aria-label="delete"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
              {day.habits.length === 0 ? (
                <li className="px-1 py-2 text-[11px] text-ink-3">{t("today.noHabits")}</li>
              ) : null}
            </ul>

            <div className="mt-2 flex items-center gap-2 border-t border-line-2 pt-3">
              <input
                value={newHabit}
                onChange={(e) => setNewHabit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addHabit();
                }}
                placeholder={t("today.addHabitPlaceholder")}
                className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
              />
              <button
                type="button"
                onClick={() => void addHabit()}
                disabled={!newHabit.trim()}
                className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-[10.5px] font-semibold text-white disabled:opacity-50"
              >
                {t("action.add")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
