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

/** 这门课在第 N 教学周是否上 */
const activeInWeek = (c: ApiCourse, week: number) => {
  if (c.week_type === "odd") return week % 2 === 1;
  if (c.week_type === "even") return week % 2 === 0;
  if (c.week_type === "range") {
    if (c.week_start != null && week < c.week_start) return false;
    if (c.week_end != null && week > c.week_end) return false;
  }
  return true;
};

const minOf = (v: string): number | null => {
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h as number) * 60 + (m as number);
};

export function CourseEditor({
  onChanged,
  baseWeek,
}: {
  onChanged?: () => void;
  baseWeek?: number | null;
}) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language === "zh-CN";
  const WD = zh
    ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const [courses, setCourses] = useState<ApiCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    weekday: 1,
    startMin: 480,
    endMin: 570,
    location: "",
    weekType: "all",
    weekStart: 1,
    weekEnd: 16,
  });

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

  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    weekday: number;
    startMin: number;
    endMin: number;
    location: string;
    weekType: string;
    weekStart: number;
    weekEnd: number;
  } | null>(null);

  const [week, setWeek] = useState<number>(baseWeek ?? 1);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (baseWeek != null) setWeek(baseWeek);
  }, [baseWeek]);

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
        weekType: form.weekType,
        weekStart: form.weekType === "range" ? form.weekStart : null,
        weekEnd: form.weekType === "range" ? form.weekEnd : null,
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

  const startEdit = (c: ApiCourse) => {
    setError(null);
    setEditing({
      id: c.id,
      name: c.name,
      weekday: c.weekday,
      startMin: c.start_min,
      endMin: c.end_min,
      location: c.location ?? "",
      weekType: c.week_type ?? "all",
      weekStart: c.week_start ?? 1,
      weekEnd: c.week_end ?? 16,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.updateCourse(editing.id, {
        name: editing.name.trim(),
        weekday: editing.weekday,
        startMin: editing.startMin,
        endMin: editing.endMin,
        location: editing.location.trim() || null,
        weekType: editing.weekType,
        weekStart: editing.weekType === "range" ? editing.weekStart : null,
        weekEnd: editing.weekType === "range" ? editing.weekEnd : null,
      });
      setEditing(null);
      await load();
      onChanged?.();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("overlap") ? t("today.overlap") : msg);
    }
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
        weekType: c.weekType,
        weekStart: c.weekType === "range" ? c.weekStart : null,
        weekEnd: c.weekType === "range" ? c.weekEnd : null,
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

  const visible = showAll ? courses : courses.filter((c) => activeInWeek(c, week));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2">
        <button
          type="button"
          onClick={() => setWeek((w) => Math.max(1, w - 1))}
          className="grid h-6 w-6 place-items-center rounded-full border border-line text-[11px] text-ink-2 hover:border-accent"
        >
          ‹
        </button>
        <span className="text-[11.5px] font-semibold tabular-nums text-ink">
          {t("week.teaching", { n: week })}
        </span>
        <button
          type="button"
          onClick={() => setWeek((w) => Math.min(30, w + 1))}
          className="grid h-6 w-6 place-items-center rounded-full border border-line text-[11px] text-ink-2 hover:border-accent"
        >
          ›
        </button>
        <span className="text-[10px] text-ink-3">
          {t("course.count", { n: visible.length })}
        </span>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className={`ml-auto rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
            showAll
              ? "border-accent bg-accent text-white"
              : "border-line bg-surface text-ink-3 hover:border-accent"
          }`}
        >
          {t("course.showAll")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] text-ink-3">{t("course.count", { n: visible.length })}</span>

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
                  <select
                    value={c.weekType}
                    onChange={(e) => updateCandidate(c.key, { weekType: e.target.value })}
                    className="w-[64px] rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] text-ink outline-none"
                  >
                    <option value="all">{t("course.weekAll")}</option>
                    <option value="odd">{t("course.weekOdd")}</option>
                    <option value="even">{t("course.weekEven")}</option>
                    <option value="range">{t("course.weekRange")}</option>
                  </select>
                  {c.weekType === "range" ? (
                    <>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={c.weekStart ?? 1}
                        onChange={(e) => updateCandidate(c.key, { weekStart: Number(e.target.value) })}
                        className="w-11 rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] tabular-nums text-ink outline-none"
                      />
                      <span className="text-[10px] text-ink-3">–</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={c.weekEnd ?? 16}
                        onChange={(e) => updateCandidate(c.key, { weekEnd: Number(e.target.value) })}
                        className="w-11 rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] tabular-nums text-ink outline-none"
                      />
                    </>
                  ) : null}
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
            <select
              value={form.weekType}
              onChange={(e) => setForm((f) => ({ ...f, weekType: e.target.value }))}
              className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[11px] text-ink-2 outline-none"
            >
              <option value="all">{t("course.weekAll")}</option>
              <option value="odd">{t("course.weekOdd")}</option>
              <option value="even">{t("course.weekEven")}</option>
              <option value="range">{t("course.weekRange")}</option>
            </select>
            {form.weekType === "range" ? (
              <>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form.weekStart}
                  onChange={(e) => setForm((f) => ({ ...f, weekStart: Number(e.target.value) }))}
                  className="w-12 rounded-lg border border-line bg-surface px-1 py-1 text-[11px] tabular-nums text-ink outline-none"
                />
                <span className="text-[10px] text-ink-3">–</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form.weekEnd}
                  onChange={(e) => setForm((f) => ({ ...f, weekEnd: Number(e.target.value) }))}
                  className="w-12 rounded-lg border border-line bg-surface px-1 py-1 text-[11px] tabular-nums text-ink outline-none"
                />
              </>
            ) : null}
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

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface-2 px-4 py-8 text-center">
          <p className="text-[11.5px] text-ink-3">{t("course.empty")}</p>
          <p className="mt-1.5 text-[10px] text-[#c8c4bc]">{t("course.emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {WD.map((w, i) => {
            const list = visible.filter((c) => c.weekday === i + 1);
            if (list.length === 0) return null;
            return (
              <section key={w} className="rounded-2xl border border-line bg-surface p-3">
                <header className="flex items-baseline justify-between">
                  <h3 className="text-[11.5px] font-semibold text-ink">{w}</h3>
                  <span className="text-[9.5px] text-ink-3">{list.length}</span>
                </header>
                <ul className="mt-1.5 space-y-1.5">
                  {list.map((c) =>
                    editing?.id === c.id ? (
                      <li key={c.id} className="space-y-1.5 rounded-lg bg-surface-2 p-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={editing.weekday}
                            onChange={(e) =>
                              setEditing({ ...editing, weekday: Number(e.target.value) })
                            }
                            className="w-[62px] rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] text-ink outline-none"
                          >
                            {WD.map((w, i) => (
                              <option key={w} value={i + 1}>
                                {w}
                              </option>
                            ))}
                          </select>
                          <input
                            type="time"
                            step={600}
                            value={hhmm(editing.startMin)}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                startMin: minOf(e.target.value) ?? editing.startMin,
                              })
                            }
                            className="w-[84px] rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] tabular-nums text-ink outline-none"
                          />
                          <span className="text-[10px] text-ink-3">–</span>
                          <input
                            type="time"
                            step={600}
                            value={hhmm(editing.endMin)}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                endMin: minOf(e.target.value) ?? editing.endMin,
                              })
                            }
                            className="w-[84px] rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] tabular-nums text-ink outline-none"
                          />
                          <input
                            value={editing.name}
                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            className="min-w-[110px] flex-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink outline-none"
                          />
                          <input
                            value={editing.location}
                            onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                            placeholder={t("course.location")}
                            className="w-[84px] rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={editing.weekType}
                            onChange={(e) => setEditing({ ...editing, weekType: e.target.value })}
                            className="w-[64px] rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] text-ink outline-none"
                          >
                            <option value="all">{t("course.weekAll")}</option>
                            <option value="odd">{t("course.weekOdd")}</option>
                            <option value="even">{t("course.weekEven")}</option>
                            <option value="range">{t("course.weekRange")}</option>
                          </select>
                          {editing.weekType === "range" ? (
                            <>
                              <input
                                type="number"
                                min={1}
                                max={30}
                                value={editing.weekStart}
                                onChange={(e) =>
                                  setEditing({ ...editing, weekStart: Number(e.target.value) })
                                }
                                className="w-11 rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] tabular-nums text-ink outline-none"
                              />
                              <span className="text-[10px] text-ink-3">–</span>
                              <input
                                type="number"
                                min={1}
                                max={30}
                                value={editing.weekEnd}
                                onChange={(e) =>
                                  setEditing({ ...editing, weekEnd: Number(e.target.value) })
                                }
                                className="w-11 rounded-md border border-line bg-surface px-1 py-0.5 text-[10.5px] tabular-nums text-ink outline-none"
                              />
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void saveEdit()}
                            className="ml-auto rounded-md bg-accent px-2.5 py-1 text-[10px] font-semibold text-white"
                          >
                            {t("common.save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded-md border border-line px-2.5 py-1 text-[10px] text-ink-3"
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      </li>
                    ) : (
                      <li
                        key={c.id}
                        onClick={() => startEdit(c)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-surface-2"
                        title={t("course.clickToEdit")}
                      >
                        <span className="w-[80px] shrink-0 text-[10px] tabular-nums text-ink-3">
                          {hhmm(c.start_min)}–{hhmm(c.end_min)}
                        </span>
                        <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-[#9BA7B0]" />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{c.name}</span>
                        {c.location ? (
                          <span className="shrink-0 text-[9.5px] text-ink-3">{c.location}</span>
                        ) : null}
                        {c.week_type !== "all" ? (
                          <span className="shrink-0 rounded-full bg-[#eef0f4] px-1.5 py-0.5 text-[9px] text-[#7c8792]">
                            {c.week_type === "odd"
                              ? t("course.weekOdd")
                              : c.week_type === "even"
                                ? t("course.weekEven")
                                : `${c.week_start ?? 1}-${c.week_end ?? "?"}${t("course.weekSuffix")}`}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(c.id);
                          }}
                          className="shrink-0 text-[11px] text-[#a9a49b] transition-colors hover:text-warn"
                          aria-label="delete"
                        >
                          ×
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
