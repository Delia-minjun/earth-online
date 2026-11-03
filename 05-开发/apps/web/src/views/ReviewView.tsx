import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isoWeekOf, mondayOfThisWeek, shiftWeeks, type ApiWeek } from "../api";
import { Card } from "../components/Card";

type Review = { keep: string; improve: string; stop: string; start: string };
const EMPTY: Review = { keep: "", improve: "", stop: "", start: "" };

const QUADRANTS: { key: keyof Review; label: string; hint: string }[] = [
  { key: "keep", label: "review.keep", hint: "review.keepHint" },
  { key: "improve", label: "review.improve", hint: "review.improveHint" },
  { key: "stop", label: "review.stop", hint: "review.stopHint" },
  { key: "start", label: "review.start", hint: "review.startHint" },
];

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

  const totals = useMemo(() => {
    const blocks = weekData?.blocks ?? [];
    const tasks = weekData?.tasks ?? [];
    const minutes = blocks.reduce((s, b) => s + (b.end_min - b.start_min), 0);
    const byCat = new Map<string, number>();
    for (const b of blocks) {
      const key = b.category_id ?? "none";
      byCat.set(key, (byCat.get(key) ?? 0) + (b.end_min - b.start_min));
    }
    return {
      blocks: blocks.length,
      minutes,
      done: tasks.filter((x) => x.status === "done").length,
      tasks: tasks.length,
      byCat,
    };
  }, [weekData]);

  const dur = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}${t("week.hour")}${m > 0 ? ` ${m}${t("week.min")}` : ""}` : `${m}${t("week.min")}`;
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2">
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
        <span className="ml-auto text-[10px] text-ink-3">
          {state === "saving"
            ? t("common.saving")
            : state === "saved"
              ? t("common.saved")
              : state === "error"
                ? t("common.saveFailed")
                : null}
        </span>
      </div>

      <div className="space-y-3.5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-3.5 lg:space-y-0">
        <div className="space-y-3.5 lg:col-span-2">
          <Card title={t("review.summary")}>
            <dl className="space-y-2 text-[11.5px]">
              <div className="flex justify-between">
                <dt className="text-ink-3">{t("review.blocks")}</dt>
                <dd className="text-ink">{totals.blocks}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">{t("review.duration")}</dt>
                <dd className="text-ink">{dur(totals.minutes)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">{t("review.focus")}</dt>
                <dd className="text-ink">
                  {totals.done} / {totals.tasks}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:col-span-3">
          {QUADRANTS.map((q) => (
            <section
              key={q.key}
              className="rounded-2xl border border-line bg-surface p-3.5 shadow-[0_6px_20px_-14px_rgba(88,82,72,0.5)]"
            >
              <h3 className="text-[12px] font-semibold text-ink">{t(q.label)}</h3>
              <textarea
                value={form[q.key]}
                onChange={(e) => setForm((f) => ({ ...f, [q.key]: e.target.value }))}
                rows={5}
                placeholder={t(q.hint)}
                className="mt-2 w-full resize-none bg-transparent text-[11.5px] leading-relaxed text-ink-2 outline-none placeholder:text-[#c8c4bc]"
              />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
