import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, hhmm, isoWeekOf, mondayOfThisWeek, shiftWeeks, type ApiWeek } from "../api";
import { CourseEditor } from "./CourseEditor";

const WD_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WD_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Item = {
  kind: "course" | "block";
  id: string;
  title: string;
  start: number;
  end: number;
  color?: string | null;
  location?: string | null;
};

export function WeekView() {
  const { t, i18n } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<"plan" | "course">("plan");
  const [data, setData] = useState<ApiWeek | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(() => shiftWeeks(mondayOfThisWeek(), offset), [offset]);
  const { isoYear, isoWeek } = useMemo(() => isoWeekOf(target), [target]);

  const load = useCallback(async () => {
    try {
      setData(await api.week(isoYear, isoWeek));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [isoYear, isoWeek]);

  useEffect(() => {
    void load();
  }, [load]);

  const wd = i18n.language === "zh-CN" ? WD_ZH : WD_EN;
  const today = ymd(new Date());

  const days = useMemo(() => {
    const base = shiftWeeks(mondayOfThisWeek(), offset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const date = ymd(d);
      return {
        date,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        weekday: wd[i] ?? "",
        weekdayIndex: i + 1,
        isToday: date === today,
      };
    });
  }, [offset, wd, today]);

  const totals = useMemo(() => {
    const blocks = data?.blocks ?? [];
    const tasks = data?.tasks ?? [];
    const minutes = blocks.reduce((s, b) => s + (b.end_min - b.start_min), 0);
    return {
      courses: data?.courses.length ?? 0,
      blocks: blocks.length,
      minutes,
      done: tasks.filter((x) => x.status === "done").length,
      tasks: tasks.length,
    };
  }, [data]);

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
          {data?.teachingWeek ? `${t("week.teaching", { n: data.teachingWeek })} · ` : ""}
          {days[0]?.label} — {days[6]?.label}
        </p>
        <button
          type="button"
          onClick={() => setOffset((v) => v + 1)}
          className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-[12px] text-ink-2 hover:border-accent"
        >
          ›
        </button>
        {offset !== 0 ? (
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="rounded-full border border-line bg-surface px-2.5 py-1 text-[10.5px] text-ink-3 hover:border-accent hover:text-ink"
          >
            {t("week.backToday")}
          </button>
        ) : null}

        <div className="ml-auto flex rounded-full border border-line bg-surface p-0.5">
          {(["plan", "course"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-2.5 py-1 text-[10.5px] transition-colors ${
                mode === m ? "bg-accent-soft font-semibold text-ink" : "text-ink-3"
              }`}
            >
              {t(`week.mode.${m}`)}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-[10.5px] text-warn">{error}</p> : null}

      {mode === "course" ? (
        <CourseEditor onChanged={() => void load()} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[10.5px] text-ink-3">
            <span className="rounded-full bg-surface px-2.5 py-1">
              {totals.courses} {t("week.courses")}
            </span>
            <span className="rounded-full bg-surface px-2.5 py-1">
              {totals.blocks} {t("week.blocks")}
            </span>
            <span className="rounded-full bg-surface px-2.5 py-1">{dur(totals.minutes)}</span>
            <span className="rounded-full bg-surface px-2.5 py-1">
              {t("week.focus")} {totals.done}/{totals.tasks}
            </span>
          </div>

          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="grid min-w-[680px] grid-cols-7 gap-2 px-1">
              {days.map((d) => {
                const courses: Item[] = (data?.courses ?? [])
                  .filter((c) => c.weekday === d.weekdayIndex)
                  .map((c) => ({
                    kind: "course",
                    id: c.id,
                    title: c.name,
                    start: c.start_min,
                    end: c.end_min,
                    color: c.color,
                    location: c.location,
                  }));
                const blocks: Item[] = (data?.blocks ?? [])
                  .filter((b) => b.date === d.date)
                  .map((b) => ({
                    kind: "block",
                    id: b.id,
                    title: b.title,
                    start: b.start_min,
                    end: b.end_min,
                    color: b.category_color,
                  }));
                const items = [...courses, ...blocks].sort((a, b) => a.start - b.start);
                const tasks = (data?.tasks ?? []).filter((x) => x.scheduled_date === d.date);

                return (
                  <section
                    key={d.date}
                    className={`min-h-[220px] rounded-2xl border bg-surface p-2.5 ${
                      d.isToday ? "border-accent" : "border-line"
                    }`}
                  >
                    <header className="flex items-baseline justify-between">
                      <span className={`text-[11px] ${d.isToday ? "font-semibold text-ink" : "text-ink-2"}`}>
                        {d.weekday}
                      </span>
                      <span className="text-[9.5px] text-ink-3">{d.label}</span>
                    </header>

                    <div className="mt-2 space-y-1">
                      {items.map((it) => (
                        <div key={`${it.kind}-${it.id}`} className="flex gap-1.5">
                          <span
                            className="mt-1 h-3 w-[2px] shrink-0 rounded-full"
                            style={{ background: it.kind === "course" ? "#9BA7B0" : (it.color ?? "#d8d4cc") }}
                          />
                          <div className="min-w-0">
                            <p
                              className={`truncate text-[10px] ${
                                it.kind === "course" ? "text-ink-2" : "text-ink"
                              }`}
                            >
                              {it.title}
                            </p>
                            <p className="text-[9px] tabular-nums text-ink-3">
                              {hhmm(it.start)}–{hhmm(it.end)}
                              {it.location ? ` · ${it.location}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {tasks.length ? (
                      <ul className="mt-2 space-y-1 border-t border-line-2 pt-1.5">
                        {tasks.map((x) => (
                          <li key={x.id} className="flex items-start gap-1">
                            <span
                              className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${
                                x.status === "done" ? "bg-accent" : "bg-[#d8d4cc]"
                              }`}
                            />
                            <span
                              className={`truncate text-[9.5px] ${
                                x.status === "done" ? "text-ink-3 line-through" : "text-ink-2"
                              }`}
                            >
                              {x.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {items.length === 0 && tasks.length === 0 ? (
                      <p className="mt-3 text-[9.5px] text-[#c8c4bc]">{t("week.empty")}</p>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
