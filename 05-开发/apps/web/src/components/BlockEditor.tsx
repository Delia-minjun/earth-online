import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, hhmm, type ApiCourse, type ApiMeta, type ApiWeekBlock } from "../api";

/** 10 分钟刻度 */
const SLOTS = Array.from({ length: 144 }, (_, i) => i * 10);
const END_SLOTS = Array.from({ length: 144 }, (_, i) => (i + 1) * 10);

const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay() || 7;

/**
 * 给某一天新建日程（时间块）。从周视图某天的 ＋ 打开。
 * 已被占用（已有时间块或课程）的时段在选项里置灰。
 */
export function BlockEditor({
  open,
  date,
  blocks,
  courses,
  onClose,
  onSaved,
}: {
  open: boolean;
  date: string;
  blocks: ApiWeekBlock[];
  courses: ApiCourse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [title, setTitle] = useState("");
  const [startMin, setStartMin] = useState(480);
  const [endMin, setEndMin] = useState(540);
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setError(null);
    setBusy(false);
    api
      .meta()
      .then((m) => {
        setMeta(m);
        setCategoryId((prev) => prev || (m.categories[0]?.id ?? ""));
      })
      .catch(() => undefined);
  }, [open]);

  const dayBlocks = useMemo(() => blocks.filter((b) => b.date === date), [blocks, date]);
  const dayCourses = useMemo(
    () => courses.filter((c) => c.weekday === weekdayOf(date)),
    [courses, date],
  );

  const hits = (start: number, end: number) =>
    dayBlocks.some((b) => start < b.end_min && end > b.start_min) ||
    dayCourses.some((c) => start < c.end_min && end > c.start_min);

  const firstFreeEnd = (start: number) => {
    for (let end = start + 10; end <= 1440; end += 10) {
      if (!hits(start, end)) return end;
    }
    return Math.min(start + 10, 1440);
  };

  if (!open) return null;

  const submit = async () => {
    const name = title.trim();
    if (!name) return;
    if (endMin <= startMin) {
      setError(t("today.overlap"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addBlock({
        date,
        startMin,
        endMin,
        title: name,
        categoryId: categoryId || undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("overlap") ? t("today.overlap") : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-ink">{t("block.title")}</h2>
            <p className="mt-0.5 text-[10px] tabular-nums text-ink-3">{date}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] leading-none text-ink-3 transition-colors hover:text-ink"
            aria-label="close"
          >
            ✕
          </button>
        </header>

        <div className="mt-3 flex items-center gap-1.5">
          <select
            value={startMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              setStartMin(v);
              setEndMin(firstFreeEnd(v));
            }}
            className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[11px] tabular-nums text-ink outline-none"
          >
            {SLOTS.map((m) => (
              <option key={m} value={m} disabled={hits(m, m + 10)}>
                {hhmm(m)}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-ink-3">–</span>
          <select
            value={endMin}
            onChange={(e) => setEndMin(Number(e.target.value))}
            className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[11px] tabular-nums text-ink outline-none"
          >
            {END_SLOTS.map((m) => (
              <option key={m} value={m} disabled={m <= startMin || hits(startMin, m)}>
                {hhmm(m)}
              </option>
            ))}
          </select>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[11px] text-ink-2 outline-none"
          >
            {(meta?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={t("today.blockTitle")}
          className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-[#c8c4bc]"
        />

        {error ? <p className="mt-1.5 text-[10px] text-warn">{error}</p> : null}

        <div className="mt-3 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!title.trim() || busy}
            className="rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
