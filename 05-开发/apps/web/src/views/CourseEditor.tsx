import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, hhmm, type ApiCourse, type CourseCandidate, type PeriodsConfig, type SemesterConfig } from "../api";

const SLOTS = Array.from({ length: 144 }, (_, i) => i * 10);
const END_SLOTS = Array.from({ length: 144 }, (_, i) => (i + 1) * 10);

/** 一条候选是否可以被导入 */
const isOk = (c: CourseCandidate) =>
  Boolean(c.name.trim()) &&
  c.weekday != null &&
  c.startMin != null &&
  c.endMin != null &&
  c.endMin > c.startMin;

const minOf = (v: string): number | null => {
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h as number) * 60 + (m as number);
};

export function CourseEditor({ onChanged }: { onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language === "zh-CN";
  const WD = zh
    ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", weekday: 1, startMin: 480, endMin: 570, location: "" });

  const [periods, setPeriods] = useState<PeriodsConfig>({
    firstStart: "08:00",
    lessonMin: 45,
    breakMin: 5,
    count: 12,
  });
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [semester, setSemester] = useState<SemesterConfig>({ startDate: null });
  const [semesterOpen, setSemesterOpen] = useState(false);

  const [importing, setImporting] = useState(false);
  const [candidates, setCandidates] = useState<CourseCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [cs, ps, sem] = await Promise.all([api.courses(), api.periods(), api.semester()]);
      setCourses(cs);
      setPeriods(ps);
      setSemester(sem);
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
      setAddOpen(false);
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

  const savePeriods = async () => {
    try {
      setPeriods(await api.savePeriods(periods));
      setNotice(t("periods.saved"));
      window.setTimeout(() => setNotice(null), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveSemester = async () => {
    try {
      setSemester(await api.saveSemester(semester));
      setNotice(t("semester.saved"));
      onChanged?.();
      window.setTimeout(() => setNotice(null), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onFile = (file: File) => {
    setError(null);
    setNotice(null);
    if (file.size > 4 * 1024 * 1024) {
      setError(t("course.tooLarge"));
      return;
    }
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result ?? "");
        const comma = dataUrl.indexOf(",");
        const meta = dataUrl.slice(0, comma);
        const b64 = dataUrl.slice(comma + 1);
        const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
        const res = await api.parseTimetable(b64, mime);
        setCandidates(res.candidates);
        setSelected(new Set(res.candidates.filter((c) => c.ok).map((c) => c.key)));
        setPeriods(res.periods);
      } catch (e) {
        const msg = (e as Error).message;
        setError(
          msg.includes("nokey")
            ? t("course.nokey")
            : msg.includes("no_vision")
              ? t("course.noVision")
              : msg.includes("TIMEOUT")
                ? t("course.timeout")
                : msg,
        );
      } finally {
        setImporting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const confirmImport = async () => {
    if (!candidates) return;
    const list = candidates
      .filter((c) => selected.has(c.key) && isOk(c))
      .map((c) => ({
        name: c.name.trim(),
        weekday: c.weekday as number,
        startMin: c.startMin as number,
        endMin: c.endMin as number,
        location: c.location.trim() || undefined,
      }));
    if (list.length === 0) return;
    try {
      const res = await api.bulkCourses(list);
      setCandidates(null);
      setNotice(t("course.imported", { n: res.inserted, m: res.skipped.length }));
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateCandidate = (key: string, patch: Partial<CourseCandidate>) => {
    const cur = candidates?.find((c) => c.key === key);
    setCandidates((prev) => (prev ? prev.map((c) => (c.key === key ? { ...c, ...patch } : c)) : prev));
    // 改到有效了，就顺手勾上
    if (cur) {
      const merged = { ...cur, ...patch };
      if (isOk(merged)) setSelected((s) => (s.has(key) ? s : new Set(s).add(key)));
    }
  };

  const removeCandidate = (key: string) => {
    setCandidates((prev) => (prev ? prev.filter((c) => c.key !== key) : prev));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] text-ink-3">{t("course.count", { n: courses.length })}</span>

        <button
          type="button"
          onClick={() => setPeriodsOpen((v) => !v)}
          className={`rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
            periodsOpen ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink-3 hover:border-accent"
          }`}
        >
          {t("periods.title")}
        </button>

        <button
          type="button"
          onClick={() => setSemesterOpen((v) => !v)}
          className={`rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
            semesterOpen ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink-3 hover:border-accent"
          }`}
        >
          {t("semester.title")}
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="rounded-full border border-line bg-surface px-2.5 py-1 text-[10.5px] text-ink-3 transition-colors hover:border-accent hover:text-ink disabled:opacity-60"
        >
          {importing ? t("course.importing") : t("course.import")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className={`ml-auto rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
            addOpen ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink-3 hover:border-accent"
          }`}
        >
          {t("action.add")}
        </button>
      </div>

      {error ? <p className="text-[10.5px] text-warn">{error}</p> : null}
      {notice ? <p className="text-[10.5px] text-accent">{notice}</p> : null}

      {periodsOpen ? (
        <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
          <p className="text-[10.5px] text-ink-3">{t("periods.hint")}</p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-2">
            <label className="flex items-center gap-1">
              {t("periods.first")}
              <input
                type="time"
                step={600}
                value={periods.firstStart}
                onChange={(e) => setPeriods((p) => ({ ...p, firstStart: e.target.value }))}
                className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 tabular-nums outline-none"
              />
            </label>
            <label className="flex items-center gap-1">
              {t("periods.lesson")}
              <input
                type="number"
                min={20}
                max={120}
                value={periods.lessonMin}
                onChange={(e) => setPeriods((p) => ({ ...p, lessonMin: Number(e.target.value) }))}
                className="w-14 rounded-lg border border-line bg-surface-2 px-1.5 py-1 tabular-nums outline-none"
              />
            </label>
            <label className="flex items-center gap-1">
              {t("periods.break")}
              <input
                type="number"
                min={0}
                max={60}
                value={periods.breakMin}
                onChange={(e) => setPeriods((p) => ({ ...p, breakMin: Number(e.target.value) }))}
                className="w-14 rounded-lg border border-line bg-surface-2 px-1.5 py-1 tabular-nums outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void savePeriods()}
              className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      ) : null}

      {semesterOpen ? (
        <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
          <p className="text-[10.5px] text-ink-3">{t("semester.hint")}</p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-2">
            <label className="flex items-center gap-1">
              {t("semester.first")}
              <input
                type="date"
                value={semester.startDate ?? ""}
                onChange={(e) => setSemester({ startDate: e.target.value || null })}
                className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 tabular-nums outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveSemester()}
              className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white"
            >
              {t("common.save")}
            </button>
            {semester.startDate ? (
              <button
                type="button"
                onClick={() => {
                  setSemester({ startDate: null });
                  void api.saveSemester({ startDate: null }).then(() => onChanged?.());
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3"
              >
                {t("semester.clear")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {candidates ? (
        <div className="space-y-2 rounded-2xl border border-accent-soft bg-surface p-3">
          <p className="text-[11px] text-ink-2">{t("course.importHint")}</p>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {candidates.map((c) => {
              const ok = isOk(c);
              return (
                <li
                  key={c.key}
                  className="flex flex-wrap items-center gap-1.5 rounded-lg px-1 py-1 odd:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.key)}
                    disabled={!ok}
                    onChange={() => toggle(c.key)}
                    className="accent-[#8FA38E]"
                  />
                  <select
                    value={c.weekday ?? ""}
                    onChange={(e) =>
                      updateCandidate(c.key, {
                        weekday: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-[62px] rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] text-ink outline-none"
                  >
                    <option value="">—</option>
                    {WD.map((w, i) => (
                      <option key={w} value={i + 1}>
                        {w}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    step={600}
                    value={c.startMin !== null ? hhmm(c.startMin) : ""}
                    onChange={(e) => updateCandidate(c.key, { startMin: minOf(e.target.value) })}
                    className="w-[84px] rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] tabular-nums text-ink outline-none"
                  />
                  <span className="text-[10px] text-ink-3">–</span>
                  <input
                    type="time"
                    step={600}
                    value={c.endMin !== null ? hhmm(c.endMin) : ""}
                    onChange={(e) => updateCandidate(c.key, { endMin: minOf(e.target.value) })}
                    className="w-[84px] rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] tabular-nums text-ink outline-none"
                  />
                  <input
                    value={c.name}
                    onChange={(e) => updateCandidate(c.key, { name: e.target.value })}
                    placeholder={t("course.nameShort")}
                    className="min-w-[120px] flex-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink outline-none placeholder:text-[#c8c4bc]"
                  />
                  <input
                    value={c.location}
                    onChange={(e) => updateCandidate(c.key, { location: e.target.value })}
                    placeholder={t("course.location")}
                    className="w-[96px] rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
                  />
                  <button
                    type="button"
                    onClick={() => removeCandidate(c.key)}
                    className="shrink-0 text-[12px] text-[#a9a49b] transition-colors hover:text-warn"
                    aria-label="remove"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ink-3">{t("course.selected", { n: selected.size })}</span>
            <button
              type="button"
              onClick={() => void confirmImport()}
              className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white"
            >
              {t("course.importConfirm")}
            </button>
            <button
              type="button"
              onClick={() => setCandidates(null)}
              className="rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {addOpen ? (
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
