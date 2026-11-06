import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, isoWeekOf, mondayOfThisWeek, shiftWeeks, type ApiBudget, type ApiMeta, type ApiWeek } from "../api";
import { todayStr } from "../ddl";
import { Card } from "../components/Card";

type Review = { keep: string; improve: string; stop: string; start: string };
const EMPTY: Review = { keep: "", improve: "", stop: "", start: "" };

const QUADRANTS: { key: keyof Review; label: string; hint: string; color: string }[] = [
  { key: "keep", label: "review.keep", hint: "review.keepHint", color: "#A8B5A2" },
  { key: "improve", label: "review.improve", hint: "review.improveHint", color: "#CBBB9A" },
  { key: "stop", label: "review.stop", hint: "review.stopHint", color: "#C9A9A6" },
  { key: "start", label: "review.start", hint: "review.startHint", color: "#9BA7B0" },
];

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
      <p className="text-[10px] text-ink-3">{label}</p>
      <p className="mt-1 text-[17px] font-semibold leading-none tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[9.5px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** 时间分配饼图：按类别时长占比 */
function TimePie({
  slices,
  total,
}: {
  slices: { name: string; color: string; minutes: number }[];
  total: number;
}) {
  const { t } = useTranslation();

  if (!slices.length || total === 0) {
    return <p className="py-8 text-center text-[10.5px] text-[#c8c4bc]">{t("review.noTime")}</p>;
  }

  const W = 320;
  const H = 250;
  const cx = W / 2;
  const cy = 118;
  const R_OUT = 76;
  const R_IN = 48;

  const polar = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };

  const arcPath = (start: number, end: number) => {
    const [x1, y1] = polar(R_OUT, start);
    const [x2, y2] = polar(R_OUT, end);
    const [x3, y3] = polar(R_IN, end);
    const [x4, y4] = polar(R_IN, start);
    const large = end - start > 180 ? 1 : 0;
    return `M${x1},${y1} A${R_OUT},${R_OUT} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${R_IN},${R_IN} 0 ${large} 0 ${x4},${y4} Z`;
  };

  let cursor = 0;
  const parts = slices.map((s) => {
    const sweep = (s.minutes / total) * 360;
    const start = cursor;
    cursor += sweep;
    const pct = (s.minutes / total) * 100;
    const mid = start + sweep / 2;
    const [lx1, ly1] = polar(R_OUT + 6, mid);
    const [lx2, ly2] = polar(R_OUT + 26, mid);
    const [tx, ty] = polar(R_OUT + 32, mid);
    const right = Math.cos(((mid - 90) * Math.PI) / 180) >= 0;
    return { ...s, start, end: cursor, pct, mid, lx1, ly1, lx2, ly2, tx, ty, right };
  });

  const hoursOf = (m: number) =>
    m >= 60
      ? `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)}${t("week.hour")}`
      : `${m}${t("week.min")}`;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[330px]">
        {parts.length === 1 ? (
          <circle
            cx={cx}
            cy={cy}
            r={(R_OUT + R_IN) / 2}
            fill="none"
            stroke={parts[0]!.color}
            strokeWidth={R_OUT - R_IN}
          />
        ) : (
          parts.map((p) => <path key={p.name} d={arcPath(p.start, p.end)} fill={p.color} />)
        )}

        {/* 圆心的总量，避免中间空一块 */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-ink text-[18px] font-semibold tabular-nums"
        >
          {hoursOf(total)}
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-ink-3 text-[11px]"
        >
          {parts.length === 1 ? "100%" : t("review.timeTotal")}
        </text>

        {/* 多段才在圆外标百分比；单段直接放圆心，避免一条孤零零的引线 */}
        {parts.length > 1
          ? parts.map((p) => {
              if (p.pct < 5) return null;
              const [bx, by] = polar(R_OUT + 14, p.mid);
              const ex = bx + (p.right ? 16 : -16);
              return (
                <g key={`l-${p.name}`}>
                  <polyline
                    points={`${p.lx1},${p.ly1} ${bx},${by} ${ex},${by}`}
                    fill="none"
                    stroke={p.color}
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <text
                    x={ex + (p.right ? 5 : -5)}
                    y={by}
                    textAnchor={p.right ? "start" : "end"}
                    dominantBaseline="middle"
                    className="fill-ink-2 text-[12px] font-medium tabular-nums"
                  >
                    {Math.round(p.pct)}%
                  </text>
                </g>
              );
            })
          : null}
      </svg>

      <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <li key={`g-${p.name}`} className="flex items-center gap-1.5 text-[10.5px] text-ink-2">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="truncate">{p.name}</span>
            <span className="tabular-nums text-ink-3">{hoursOf(p.minutes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewView() {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [weekData, setWeekData] = useState<ApiWeek | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [budget, setBudget] = useState<ApiBudget | null>(null);
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
    let alive = true;
    void Promise.all([api.meta(), api.budget()])
      .then(([m, b]) => {
        if (!alive) return;
        setMeta(m);
        setBudget(b);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

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
    const today = todayStr();

    const minutes = blocks.reduce((s, b) => s + (b.end_min - b.start_min), 0);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    const done = tasks.filter((x) => x.status === "done").length;
    const overdue = tasks.filter(
      (x) => x.status !== "done" && x.scheduled_date !== null && x.scheduled_date < today,
    ).length;

    // 按类别汇总时长（用于饼图）；上课时间单独算一类
    const byCat = new Map<string, { name: string; color: string; minutes: number }>();
    for (const b of blocks) {
      const key = b.category_id ?? "none";
      const cat = meta?.categories.find((c) => c.id === key);
      const bucket = byCat.get(key) ?? {
        name: cat?.name ?? t("review.uncategorized"),
        color: b.category_color ?? "#d8d4cc",
        minutes: 0,
      };
      bucket.minutes += b.end_min - b.start_min;
      byCat.set(key, bucket);
    }

    const courseMinutes = weekData?.summary?.courseMinutes ?? 0;
    if (courseMinutes > 0) {
      byCat.set("__course", {
        name: t("review.courses"),
        // 课程色不能和「学习提升」的 #9BA7B0 撞，这里用深一档的石板灰
        color: "#6F7C86",
        minutes: courseMinutes,
      });
    }

    // 扇区颜色互不相同：类别色可能重复，重复时逐级调深
    const darken = (hex: string, step: number) => {
      const n = parseInt(hex.slice(1), 16);
      const f = Math.max(0.35, 1 - step * 0.16);
      const r = Math.round(((n >> 16) & 255) * f);
      const g = Math.round(((n >> 8) & 255) * f);
      const b = Math.round((n & 255) * f);
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    };

    const used = new Set<string>();
    const slices = [...byCat.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .map((s) => {
        let color = s.color.toLowerCase();
        let step = 0;
        while (used.has(color) && step < 6) {
          step += 1;
          color = darken(s.color, step).toLowerCase();
        }
        used.add(color);
        return { ...s, color };
      });

    return {
      blocks: blocks.length,
      minutes,
      courseMinutes,
      duration:
        h > 0 ? `${h}${t("week.hour")}${m > 0 ? ` ${m}${t("week.min")}` : ""}` : `${m}${t("week.min")}`,
      done,
      total: tasks.length,
      overdue,
      slices,
    };
  }, [weekData, meta, t]);

  const budgetPct = useMemo(() => {
    const expense = weekData?.summary?.expense ?? 0;
    const total = budget?.total ?? 0;
    return total > 0 ? Math.round((expense / total) * 100) : null;
  }, [weekData, budget]);

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

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat
          label={t("review.tasks")}
          value={`${stats.done}/${stats.total}`}
          hint={stats.overdue > 0 ? t("review.overdueN", { n: stats.overdue }) : null}
        />
        <Stat
          label={t("review.habits")}
          value={`${weekData?.summary?.habitDone ?? 0}/${weekData?.summary?.habitTotal ?? 0}`}
          hint={
            (weekData?.summary?.habitTotal ?? 0) > 0
              ? `${Math.round(
                  ((weekData?.summary?.habitDone ?? 0) / (weekData?.summary?.habitTotal ?? 1)) * 100,
                )}%`
              : null
          }
        />
        <Stat
          label={t("review.invest")}
          value={stats.duration}
          hint={t("review.segments", { n: stats.blocks })}
        />
        <Stat
          label={t("review.spending")}
          value={`¥${Math.round(weekData?.summary?.expense ?? 0)}`}
          hint={budgetPct !== null ? t("review.budgetPct", { n: budgetPct }) : null}
        />
      </div>

      <Card title={t("review.timeSplit")}>
        <TimePie
          slices={stats.slices}
          total={stats.minutes + stats.courseMinutes}
        />
      </Card>

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
