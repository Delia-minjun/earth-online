import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isoWeekOf, mondayOfThisWeek, shiftWeeks, type ApiWeek } from "../api";

type Review = { keep: string; improve: string; stop: string; start: string };
const EMPTY: Review = { keep: "", improve: "", stop: "", start: "" };

const QUADRANTS: { key: keyof Review; label: string; hint: string; color: string }[] = [
  { key: "keep", label: "review.keep", hint: "review.keepHint", color: "#A8B5A2" },
  { key: "improve", label: "review.improve", hint: "review.improveHint", color: "#CBBB9A" },
  { key: "stop", label: "review.stop", hint: "review.stopHint", color: "#C9A9A6" },
  { key: "start", label: "review.start", hint: "review.startHint", color: "#9BA7B0" },
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
      <p className="text-[10px] text-ink-3">{label}</p>
      <p className="mt-1 text-[17px] font-semibold leading-none tabular-nums text-ink">{value}</p>
    </div>
  );
}

export function ReviewView() {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [weekData, setWeekData] = useState<ApiWeek | null>(null);
  const [form, setForm] = useState<Review>(EMPTY);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const target = useMemo(() => shiftWeeks(mondayOfThisWeek(), offset), [offset]);
  const { isoYear, isoWeek } = useMemo(() => isoWeekOf(target), [target]);
  const weekId = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
  const sunday = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 6);
  const rangeLabel = `${target.getMonth() + 1}/${target.getDate()} — ${sunday.getMonth() + 1}/${sunday.getDate()}`;

  const savedRef = useRef(JSON.stringify(EMPTY));
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .week(isoYear, isoWeek)
      .then((d) => alive && setWeekData(d))
      .catch(() => alive && setWeekData(null));
    return () => {
      alive = false;
    };
  }, [isoYear, isoWeek]);

  useEffect(() => {
    if (loadedRef.current === weekId) return;
    loadedRef.current = weekId;
    api
      .review(weekId)
      .then((r) => {
        const next: Review = {
          keep: r.keep ?? "",
          improve: r.improve ?? "",
          stop: r.stop ?? "",
          start: r.start ?? "",
        };
        savedRef.current = JSON.stringify(next);
        setForm(next);
        setState("idle");
      })
      .catch(() => setState("error"));
  }, [weekId]);

  useEffect(() => {
    if (loadedRef.current !== weekId) return;
    const snapshot = JSON.stringify(form);
    if (snapshot === savedRef.current) return;

    setState("saving");
    const timer = window.setTimeout(() => {
      api
        .saveReview(weekId, form)
        .then(() => {
          savedRef.current = snapshot;
          setState("saved");
        })
        .catch(() => setState("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [form, weekId]);

  const stats = useMemo(() => {
    const blocks = weekData?.blocks ?? [];
    const tasks = weekData?.tasks ?? [];
    const minutes = blocks.reduce((s, b) => s + (b.end_min - b.start_min), 0);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return {
      blocks: blocks.length,
      duration:
        h > 0 ? `${h}${t("week.hour")}${m > 0 ? ` ${m}${t("week.min")}` : ""}` : `${m}${t("week.min")}`,
      done: tasks.filter((x) => x.status === "done").length,
      tasks: tasks.length,
    };
  }, [weekData, t]);

  const stateText =
    state === "saving"
      ? t("common.saving")
      : state === "saved"
        ? t("common.saved")
        : state === "error"
          ? t("common.saveFailed")
          : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOffset((v) => v - 1)}
          className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-[12px] text-ink-2 hover:border-accent"
        >
          ‹
        </button>
        <p className="text-[13px] font-semibold tabular-nums text-ink">
          {weekData?.teachingWeek ? `${t("week.teaching", { n: weekData.teachingWeek })} · ` : ""}
          {rangeLabel}
        </p>
        <button
          type="button"
          onClick={() => setOffset((v) => v + 1)}
          className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-[12px] text-ink-2 hover:border-accent"
        >
          ›
        </button>
        {stateText ? <span className="ml-auto text-[10px] text-ink-3">{stateText}</span> : null}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label={t("review.blocks")} value={stats.blocks} />
        <Stat label={t("review.duration")} value={stats.duration} />
        <Stat label={t("review.focus")} value={`${stats.done}/${stats.tasks}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {QUADRANTS.map((q) => (
          <section
            key={q.key}
            className="rounded-2xl border border-line bg-surface p-3.5 shadow-[0_6px_20px_-14px_rgba(88,82,72,0.5)]"
          >
            <header className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: q.color }} />
              <h3 className="text-[12px] font-semibold text-ink">{t(q.label)}</h3>
            </header>
            <textarea
              value={form[q.key]}
              onChange={(e) => setForm((f) => ({ ...f, [q.key]: e.target.value }))}
              rows={4}
              placeholder={t(q.hint)}
              className="mt-2 min-h-[88px] w-full resize-y bg-transparent text-[12px] leading-relaxed text-ink-2 outline-none placeholder:text-[#c8c4bc]"
            />
          </section>
        ))}
      </div>
    </div>
  );
}
