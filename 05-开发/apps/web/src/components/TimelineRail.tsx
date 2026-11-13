import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, COURSE_COLOR, hhmm, type ApiDay, type ApiFocusSession, type ApiMeta } from "../api";
import { FocusModal } from "./FocusModal";

const SLOTS = Array.from({ length: 144 }, (_, i) => i * 10);
const END_SLOTS = Array.from({ length: 144 }, (_, i) => (i + 1) * 10);

/**
 * 右侧时间轴栏：显示今天的时间块与课程，可新增/删除。
 * 三个段落（今日/本周/本月）共用同一条固定栏，所以自己取数。
 */
export function TimelineRail() {
  const { t } = useTranslation();
  const [day, setDay] = useState<ApiDay | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focus, setFocus] = useState<ApiFocusSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ startMin: 480, endMin: 540, title: "", categoryId: "" });

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([api.day(), api.meta()]);
      setDay(d);
      setMeta(m);
      setForm((f) => ({ ...f, categoryId: f.categoryId || (m.categories[0]?.id ?? "") }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.focusActive().then(setFocus).catch(() => undefined);
  }, [focusOpen]);

  const hits = (start: number, end: number) => {
    if (!day) return false;
    return (
      day.blocks.some((b) => start < b.end_min && end > b.start_min) ||
      day.courses.some((c) => start < c.end_min && end > c.start_min)
    );
  };

  const firstFreeEnd = (start: number) => {
    for (let end = start + 10; end <= 1440; end += 10) {
      if (!hits(start, end)) return end;
    }
    return Math.min(start + 10, 1440);
  };

  const submit = async () => {
    const title = form.title.trim();
    if (!title) return;
    try {
      await api.addBlock({
        startMin: form.startMin,
        endMin: form.endMin,
        title,
        categoryId: form.categoryId || undefined,
      });
      setForm((f) => ({ ...f, title: "" }));
      setBlockOpen(false);
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("overlap") ? t("today.overlap") : msg);
    }
  };

  const remove = async (id: string) => {
    await api.deleteBlock(id);
    await load();
  };

  return (
    <aside data-tour="rail" className="min-[1150px]:col-start-3 min-[1150px]:row-span-3 min-[1150px]:row-start-1 min-[1150px]:sticky min-[1150px]:top-0 min-[1150px]:h-[calc(100vh-6rem)] min-[1150px]:self-start min-[1150px]:overflow-y-auto min-[1150px]:border-l min-[1150px]:border-line min-[1150px]:pl-5">
      <header className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold text-ink">
          {t("today.timeline")}
          {focus ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent" /> : null}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFocusOpen(true)}
            title={t("focus.title")}
            className={`text-[12px] leading-none transition-colors ${
              focus ? "text-accent" : "text-[#c2beb6] hover:text-accent"
            }`}
            aria-label={t("focus.title")}
          >
            ◷
          </button>
          <button
            type="button"
            onClick={() => setBlockOpen((v) => !v)}
            className="text-[14px] leading-none text-[#c2beb6] transition-colors hover:text-accent"
            aria-label={t("action.add")}
          >
            {blockOpen ? "−" : "＋"}
          </button>
        </div>
      </header>

      <FocusModal
        open={focusOpen}
        onClose={() => {
          setFocusOpen(false);
          void load();
        }}
      />

      {error ? <p className="mt-2 text-[10px] text-warn">{error}</p> : null}

      <ul className="mt-3">
        {(day?.courses ?? []).map((c) => (
          <li key={`course-${c.id}`} className="flex gap-3 py-2 first:pt-0">
            <span className="w-10 shrink-0 pt-0.5 text-[10px] tabular-nums text-ink-3">
              {hhmm(c.start_min)}
            </span>
            <span className="w-[3px] shrink-0 rounded-full" style={{ background: COURSE_COLOR }} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-[12px] text-ink-2">{c.name}</p>
              <p className="mt-0.5 text-[10px] text-ink-3">
                {hhmm(c.start_min)}–{hhmm(c.end_min)}
                {c.location ? ` · ${c.location}` : ""} · {t("today.course")}
              </p>
            </div>
          </li>
        ))}

        {(day?.blocks ?? []).map((b) => (
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
              onClick={() => void remove(b.id)}
              className="shrink-0 self-center text-[12px] leading-none text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
              aria-label="delete"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {blockOpen ? (
        <div className="mt-2 space-y-2 rounded-xl border border-line-2 bg-surface-2 p-2.5">
          <div className="flex items-center gap-1.5">
            <select
              value={form.startMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                setForm((f) => ({ ...f, startMin: v, endMin: firstFreeEnd(v) }));
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
              value={form.endMin}
              onChange={(e) => setForm((f) => ({ ...f, endMin: Number(e.target.value) }))}
              className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] tabular-nums text-ink outline-none"
            >
              {END_SLOTS.map((m) => (
                <option key={m} value={m} disabled={m <= form.startMin || hits(form.startMin, m)}>
                  {hhmm(m)}
                </option>
              ))}
            </select>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
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
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder={t("today.blockTitle")}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
            />
            <button
              type="button"
              onClick={() => void submit()}
              className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-[10.5px] font-semibold text-white"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
