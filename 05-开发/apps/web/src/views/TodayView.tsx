import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  COURSE_COLOR,
  hhmm,
  type ApiDay,
  type ApiDayReview,
  type ApiHabitGrid,
  type ApiMeta,
  type ApiTask,
} from "../api";
import { Card } from "../components/Card";
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

/** 10 分钟刻度：00:00 – 23:50 */
const SLOTS = Array.from({ length: 144 }, (_, i) => i * 10);
/** 结束时间可选 00:10 – 24:00 */
const END_SLOTS = Array.from({ length: 144 }, (_, i) => (i + 1) * 10);

const DONE = "done";

export function TodayView() {
  const { t } = useTranslation();
  const [day, setDay] = useState<ApiDay | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
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
    void api.meta().then(setMeta).catch(() => undefined);
  }, [reload]);

  /* ---- 今日任务 ---- */
  const [draft, setDraft] = useState("");
  const addFocus = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    await api.addTask(title);
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

  /* ---- 时间块 ---- */
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({
    startMin: 480,
    endMin: 540,
    title: "",
    categoryId: "cat-study",
  });

  const submitBlock = async () => {
    const title = blockForm.title.trim();
    if (!title) return;
    try {
      await api.addBlock({
        startMin: blockForm.startMin,
        endMin: blockForm.endMin,
        title,
        categoryId: blockForm.categoryId,
      });
      setBlockForm((f) => ({ ...f, title: "" }));
      setBlockOpen(false);
      await reload();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("overlap") ? t("today.overlap") : msg);
    }
  };

  const removeBlock = async (id: string) => {
    await api.deleteBlock(id);
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

  /* ---- 日复盘 ---- */
  const [dayReview, setDayReview] = useState<ApiDayReview | null>(null);
  const [reviewState, setReviewState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const reviewSavedRef = useRef("");
  const reviewDate = day?.date;

  useEffect(() => {
    if (!reviewDate) return;
    let alive = true;
    api
      .dayReview(reviewDate)
      .then((r) => {
        if (!alive) return;
        setDayReview(r);
        reviewSavedRef.current = JSON.stringify(r);
        setReviewState("idle");
      })
      .catch(() => alive && setDayReview(null));
    return () => {
      alive = false;
    };
  }, [reviewDate]);

  useEffect(() => {
    if (!dayReview || !reviewDate) return;
    const snap = JSON.stringify(dayReview);
    if (snap === reviewSavedRef.current) return;
    setReviewState("saving");
    const timer = window.setTimeout(() => {
      api
        .saveDayReview(reviewDate, {
          good: dayReview.good,
          bad: dayReview.bad,
          next: dayReview.next,
        })
        .then(() => {
          reviewSavedRef.current = snap;
          setReviewState("saved");
        })
        .catch(() => setReviewState("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dayReview, reviewDate]);

  /* ---- 任务编辑 ---- */  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", priority: 0, date: "" });

  const startEditTask = (task: ApiTask) => {
    setEditTaskId(task.id);
    setTaskForm({
      title: task.title,
      priority: task.priority ?? 0,
      date: task.scheduled_date ?? day?.date ?? "",
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

  /** 与已有时间块或课程是否重叠 */
  const hits = (start: number, end: number) =>
    day.blocks.some((b) => start < b.end_min && end > b.start_min) ||
    day.courses.some((c) => start < c.end_min && end > c.start_min);

  /** 从某个开始时间往后找第一个不冲突的结束时间 */
  const firstFreeEnd = (start: number) => {
    for (let end = start + 10; end <= 1440; end += 10) {
      if (!hits(start, end)) return end;
    }
    return Math.min(start + 10, 1440);
  };

  return (
    <div className="space-y-3.5">
      {error ? <p className="text-[10px] text-warn">{error}</p> : null}

      <div className="space-y-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3.5 lg:space-y-0">
        {/* 左：今天的计划 */}
        <div className="space-y-3.5">
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
                  <li key={f.id} className="group flex items-start gap-3 py-2.5 first:pt-0">
                    <button
                      type="button"
                      onClick={() => void toggleTask(f.id, f.status)}
                      className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[9px] transition-colors ${
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
                    <button
                      type="button"
                      onClick={() => startEditTask(f)}
                      className="shrink-0 text-[11px] text-[#a9a49b] opacity-100 transition-opacity hover:text-accent md:opacity-0 md:group-hover:opacity-100"
                      aria-label="edit"
                    >
                      改
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeTask(f.id)}
                      className="shrink-0 text-[12px] text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
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
            <div className="mt-2 flex items-center gap-2 border-t border-line-2 pt-2.5">
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
          </Card>

          <Card
            title={t("today.timeline")}
            action={
              <button
                type="button"
                onClick={() => setBlockOpen((v) => !v)}
                className={`rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
                  blockOpen
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-surface text-ink-3 hover:border-accent hover:text-ink"
                }`}
              >
                {t("action.add")}
              </button>
            }
          >
            <ul>
              {day.courses.map((c) => (
                <li key={`course-${c.id}`} className="flex gap-3 py-2 first:pt-0">
                  <span className="w-10 shrink-0 pt-0.5 text-[10px] tabular-nums text-ink-3">
                    {hhmm(c.start_min)}
                  </span>
                  <span
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ background: COURSE_COLOR }}
                  />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="truncate text-[12px] text-ink-2">{c.name}</p>
                    <p className="mt-0.5 text-[10px] text-ink-3">
                      {hhmm(c.start_min)}–{hhmm(c.end_min)}
                      {c.location ? ` · ${c.location}` : ""} · {t("today.course")}
                    </p>
                  </div>
                </li>
              ))}
              {day.blocks.map((b) => (
                <li key={b.id} className="group flex gap-3 py-2 first:pt-0">
                  <span className="w-10 shrink-0 pt-0.5 text-[10px] tabular-nums text-ink-3">
                    {hhmm(b.start_min)}
                  </span>
                  <span
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ background: b.category_color ?? "#d8d4cc" }}
                  />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="truncate text-[12px] text-ink">{b.title}</p>
                    <p className="mt-0.5 text-[10px] text-ink-3">
                      {hhmm(b.start_min)}–{hhmm(b.end_min)} · {b.end_min - b.start_min} {t("today.min")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeBlock(b.id)}
                    className="shrink-0 text-[12px] text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                    aria-label="delete"
                  >
                    ×
                  </button>
                </li>
              ))}
              {day.blocks.length === 0 && day.courses.length === 0 ? (
                <li className="py-2 text-[11.5px] text-ink-3">{t("today.timelineEmpty")}</li>
              ) : null}
            </ul>

            {blockOpen ? (
              <div className="mt-2 space-y-2 rounded-xl border border-line-2 bg-surface-2 p-2.5">
                <div className="flex items-center gap-1.5">
                  <select
                    value={blockForm.startMin}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setBlockForm((f) => ({ ...f, startMin: v, endMin: firstFreeEnd(v) }));
                    }}
                    className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] tabular-nums text-ink outline-none"
                  >
                    {SLOTS.map((m) => (
                      <option key={m} value={m} disabled={hits(m, m + 10)}>
                        {hhmm(m)}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-ink-3">–</span>
                  <select
                    value={blockForm.endMin}
                    onChange={(e) => setBlockForm((f) => ({ ...f, endMin: Number(e.target.value) }))}
                    className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] tabular-nums text-ink outline-none"
                  >
                    {END_SLOTS.map((m) => (
                      <option
                        key={m}
                        value={m}
                        disabled={m <= blockForm.startMin || hits(blockForm.startMin, m)}
                      >
                        {hhmm(m)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={blockForm.categoryId}
                    onChange={(e) => setBlockForm((f) => ({ ...f, categoryId: e.target.value }))}
                    className="ml-auto rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-2 outline-none"
                  >
                    {(meta?.categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={blockForm.title}
                    onChange={(e) => setBlockForm((f) => ({ ...f, title: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitBlock();
                    }}
                    placeholder={t("today.blockTitle")}
                    className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
                  />
                  <button
                    type="button"
                    onClick={() => void submitBlock()}
                    className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-[10.5px] font-semibold text-white"
                  >
                    {t("common.save")}
                  </button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        {/* 右：今天的记录 */}
        <div className="space-y-3.5">
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
      </div>

      <div className="space-y-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3.5 lg:space-y-0">
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

        <Mini
          title={t("today.dayReview")}
          action={
            reviewState === "saving"
              ? t("common.saving")
              : reviewState === "saved"
                ? t("common.saved")
                : reviewState === "error"
                  ? t("common.saveFailed")
                  : null
          }
        >
          {(["good", "bad", "next"] as const).map((k) => (
            <label key={k} className="mt-1.5 block first:mt-0">
              <span className="text-[9.5px] text-ink-3">{t(`dayReview.${k}`)}</span>
              <textarea
                rows={1}
                value={dayReview?.[k] ?? ""}
                onChange={(e) =>
                  setDayReview((prev) => (prev ? { ...prev, [k]: e.target.value } : prev))
                }
                placeholder={t(`dayReview.${k}Hint`)}
                className="mt-0.5 w-full resize-none rounded-lg bg-surface-2 px-2 py-1.5 text-[11.5px] leading-relaxed text-ink-2 outline-none placeholder:text-[#c8c4bc]"
              />
            </label>
          ))}
        </Mini>
      </div>

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
                    className="group rounded-lg px-1 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-[12px] text-ink">{h.name}</span>
                      {(grid?.streak[h.id] ?? 0) > 1 ? (
                        <span className="text-[9.5px] tabular-nums text-ink-3">
                          {t("habit.streak", { n: grid?.streak[h.id] })}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void removeHabit(h.id)}
                        className="text-[12px] text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                        aria-label="delete"
                      >
                        ×
                      </button>
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
