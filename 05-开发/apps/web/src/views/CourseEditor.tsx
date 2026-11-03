import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, hhmm, type ApiCourse } from "../api";

const SLOTS = Array.from({ length: 144 }, (_, i) => i * 10);
const END_SLOTS = Array.from({ length: 144 }, (_, i) => (i + 1) * 10);

export function CourseEditor({ onChanged }: { onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language === "zh-CN";
  const WD = zh
    ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", weekday: 1, startMin: 480, endMin: 570, location: "" });

  const load = useCallback(async () => {
    try {
      setCourses(await api.courses());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sameDay = useMemo(() => courses.filter((c) => c.weekday === form.weekday), [courses, form.weekday]);
  const hits = (start: number, end: number) => sameDay.some((c) => start < c.end_min && end > c.start_min);
  const firstFreeEnd = (start: number) => {
    for (let end = start + 10; end <= 1440; end += 10) if (!hits(start, end)) return end;
    return Math.min(start + 10, 1440);
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) return;
    try {
      await api.addCourse({
        name,
        weekday: form.weekday,
        startMin: form.startMin,
        endMin: form.endMin,
        location: form.location.trim() || undefined,
      });
      setForm((f) => ({ ...f, name: "", location: "" }));
      setOpen(false);
      await load();
      onChanged?.();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("overlap") ? t("today.overlap") : msg);
    }
  };

  const remove = async (id: string) => {
    await api.deleteCourse(id);
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] text-ink-3">{t("course.count", { n: courses.length })}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`ml-auto rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
            open
              ? "border-accent bg-accent text-white"
              : "border-line bg-surface text-ink-3 hover:border-accent hover:text-ink"
          }`}
        >
          {t("action.add")}
        </button>
      </div>

      {error ? <p className="text-[10.5px] text-warn">{error}</p> : null}

      {open ? (
        <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={t("course.name")}
            className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none placeholder:text-[#c8c4bc]"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={form.weekday}
              onChange={(e) => setForm((f) => ({ ...f, weekday: Number(e.target.value) }))}
              className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] text-ink outline-none"
            >
              {WD.map((w, i) => (
                <option key={w} value={i + 1}>
                  {w}
                </option>
              ))}
            </select>
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
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder={t("course.location")}
              className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink outline-none placeholder:text-[#c8c4bc]"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!form.name.trim()}
              className={`ml-auto rounded-lg px-3 py-1.5 text-[10.5px] font-semibold ${
                form.name.trim() ? "bg-accent text-white" : "border border-line text-[#c8c4bc]"
              }`}
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      ) : null}

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface-2 px-4 py-8 text-center">
          <p className="text-[11.5px] text-ink-3">{t("course.empty")}</p>
          <p className="mt-1.5 text-[10px] text-[#c8c4bc]">{t("course.emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {WD.map((w, i) => {
            const list = courses.filter((c) => c.weekday === i + 1);
            if (list.length === 0) return null;
            return (
              <section key={w} className="rounded-2xl border border-line bg-surface p-3">
                <header className="flex items-baseline justify-between">
                  <h3 className="text-[11.5px] font-semibold text-ink">{w}</h3>
                  <span className="text-[9.5px] text-ink-3">{list.length}</span>
                </header>
                <ul className="mt-1.5 space-y-1.5">
                  {list.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <span className="w-[80px] shrink-0 text-[10px] tabular-nums text-ink-3">
                        {hhmm(c.start_min)}–{hhmm(c.end_min)}
                      </span>
                      <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-[#9BA7B0]" />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{c.name}</span>
                      {c.location ? (
                        <span className="shrink-0 text-[9.5px] text-ink-3">{c.location}</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void remove(c.id)}
                        className="shrink-0 text-[11px] text-[#a9a49b] transition-colors hover:text-warn"
                        aria-label="delete"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
