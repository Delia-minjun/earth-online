import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, hhmm, toMin, type ApiBlock, type ApiDay, type ApiMeta } from "../api";
import { Card } from "../components/Card";

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
    <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-[0_6px_20px_-14px_rgba(88,82,72,0.5)]">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[12px] font-semibold text-ink">{title}</h2>
        {action ? <span className="text-[10px] text-ink-3">{action}</span> : null}
      </header>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function QuickActions() {
  const { t } = useTranslation();
  return (
    <section className="grid gap-2.5 sm:grid-cols-2">
      <button
        type="button"
        disabled
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left opacity-90"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] text-accent">
          ◷
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold text-ink">{t("today.pomodoro")}</span>
            <span className="text-[15px] font-semibold tabular-nums text-ink">25:00</span>
          </span>
          <span className="mt-0.5 block text-[10px] text-ink-3">{t("today.pomodoroHint")}</span>
        </span>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[9px] text-ink-3">P3</span>
      </button>

      <button
        type="button"
        disabled
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left opacity-90"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef0f4] text-[13px] text-[#9BA7B0]">
          ▤
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold text-ink">{t("today.reviewCards")}</span>
            <span className="text-[15px] font-semibold tabular-nums text-ink">0</span>
          </span>
          <span className="mt-0.5 block text-[10px] text-ink-3">{t("today.reviewHint")}</span>
        </span>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[9px] text-ink-3">P5</span>
      </button>
    </section>
  );
}

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

  /* ---- 今日重点 ---- */
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
  const [blockForm, setBlockForm] = useState({ start: "08:00", end: "09:00", title: "", categoryId: "cat-study" });

  const submitBlock = async () => {
    const title = blockForm.title.trim();
    if (!title) return;
    try {
      await api.addBlock({
        startMin: toMin(blockForm.start),
        endMin: toMin(blockForm.end),
        title,
        categoryId: blockForm.categoryId,
      });
      setBlockForm((f) => ({ ...f, title: "" }));
      setBlockOpen(false);
      await reload();
    } catch (e) {
      setError((e as Error).message);
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

  /* ---- 随手记（自动保存） ---- */
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const noteInit = useRef(false);

  useEffect(() => {
    if (day && !noteInit.current) {
      setNote(day.journal?.body ?? "");
      noteInit.current = true;
    }
  }, [day]);

  useEffect(() => {
    if (!noteInit.current || !day) return;
    if (note === (day.journal?.body ?? "")) return;
    setNoteState("saving");
    const timer = setTimeout(() => {
      void api
        .saveJournal(day.date, note)
        .then(() => {
          setNoteState("saved");
          setDay((d) => (d ? { ...d, journal: { date: d.date, mood: null, body: note } } : d));
        })
        .catch(() => setNoteState("idle"));
    }, 700);
    return () => clearTimeout(timer);
  }, [note, day]);

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

      <QuickActions />

      <div className="space-y-3.5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-3.5 lg:space-y-0">
        {/* 左：重点 + 时间轴 */}
        <div className="space-y-3.5 lg:col-span-3">
          <Card title={t("today.focus")} action={`${doneCount}/${focus.length}`}>
            <ul className="divide-y divide-line-2">
              {focus.map((f) => (
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
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeTask(f.id)}
                    className="shrink-0 text-[11px] text-[#d6d2ca] transition-colors hover:text-warn"
                    aria-label="delete"
                  >
                    ×
                  </button>
                </li>
              ))}
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
            </div>
          </Card>

          <Card
            title={t("today.timeline")}
            action={
              <button
                type="button"
                onClick={() => setBlockOpen((v) => !v)}
                className="text-[10px] text-ink-3 transition-colors hover:text-ink"
              >
                {t("action.add")}
              </button>
            }
          >
            <ul>
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
                    className="shrink-0 text-[11px] text-[#d6d2ca] transition-colors hover:text-warn"
                    aria-label="delete"
                  >
                    ×
                  </button>
                </li>
              ))}
              {day.blocks.length === 0 ? (
                <li className="py-2 text-[11.5px] text-ink-3">{t("today.timelineEmpty")}</li>
              ) : null}
            </ul>

            {blockOpen ? (
              <div className="mt-2 space-y-2 rounded-xl border border-line-2 bg-surface-2 p-2.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={blockForm.start}
                    onChange={(e) => setBlockForm((f) => ({ ...f, start: e.target.value }))}
                    className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] text-ink outline-none"
                  />
                  <span className="text-[10px] text-ink-3">–</span>
                  <input
                    type="time"
                    value={blockForm.end}
                    onChange={(e) => setBlockForm((f) => ({ ...f, end: e.target.value }))}
                    className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] text-ink outline-none"
                  />
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

        {/* 右：习惯 / 记账 / 身体 / 饮食 / 随手记 */}
        <div className="space-y-3.5 lg:col-span-2">
          <Mini
            title={t("today.habits")}
            action={`${day.habits.filter((h) => h.done).length}/${day.habits.length}`}
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

          <Mini title={t("today.money")} action={<span className="text-[9.5px] text-[#c8c4bc]">P2</span>}>
            <p className="text-[11px] text-ink-3">{t("today.moneyPending")}</p>
          </Mini>

          <Mini title={t("today.body")} action={<span className="text-[9.5px] text-[#c8c4bc]">P2</span>}>
            <p className="text-[11px] text-ink-3">{t("today.bodyPending")}</p>
          </Mini>

          <Mini title={t("today.meals")} action={<span className="text-[9.5px] text-[#c8c4bc]">P2</span>}>
            <p className="text-[11px] text-ink-3">{t("today.mealsPending")}</p>
          </Mini>

          <Mini title={t("today.notes")} action={noteState === "saving" ? t("common.saving") : noteState === "saved" ? t("common.saved") : null}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder={t("today.notePlaceholder")}
              className="w-full resize-none bg-transparent text-[11.5px] leading-relaxed text-ink-2 outline-none placeholder:text-[#c8c4bc]"
            />
          </Mini>
        </div>
      </div>
    </div>
  );
}
