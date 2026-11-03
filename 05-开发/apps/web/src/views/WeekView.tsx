import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, courseColor, hhmm, isoWeekOf, mondayOfThisWeek, shiftWeeks, type ApiWeek } from "../api";
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
  color: string;
  location?: string | null;
};

export function WeekView() {
  const { t, i18n } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ApiWeek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

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

        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="ml-auto rounded-full border border-line bg-surface px-3 py-1.5 text-[10.5px] text-ink-2 transition-colors hover:border-accent hover:text-ink"
        >
          {t("course.editMode")}
        </button>
      </div>

      {error ? <p className="text-[10.5px] text-warn">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {days.map((d, idx) => {
          const courses: Item[] = (data?.courses ?? [])
            .filter((c) => c.weekday === d.weekdayIndex)
            .map((c) => ({
              kind: "course",
              id: c.id,
              title: c.name,
              start: c.start_min,
              end: c.end_min,
              color: courseColor(c),
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
              color: b.category_color ?? "#d8d4cc",
            }));
          const items = [...courses, ...blocks].sort((a, b) => a.start - b.start);
          const tasks = (data?.tasks ?? []).filter((x) => x.scheduled_date === d.date);
          const empty = items.length === 0 && tasks.length === 0;

          return (
            <div
              key={d.date}
              className={`flex gap-3 px-3 py-2.5 ${
                idx > 0 ? "border-t border-line-2" : ""
              } ${d.isToday ? "bg-accent-soft/30" : ""}`}
            >
              <div className="w-14 shrink-0 pt-0.5">
                <p
                  className={`text-[11px] ${
                    d.isToday ? "font-semibold text-ink" : "text-ink-2"
                  }`}
                >
                  {d.weekday}
                </p>
                <p className="text-[9.5px] tabular-nums text-ink-3">{d.label}</p>
              </div>

              <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-start gap-1.5">
                  {items.map((it) => (
                    <div
                      key={`${it.kind}-${it.id}`}
                      className="flex items-center gap-1.5 rounded-lg border border-line-2 bg-surface px-2 py-1"
                    >
                      <span
                        className="h-4 w-[2px] shrink-0 rounded-full"
                        style={{ background: it.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[10.5px] text-ink">{it.title}</p>
                        <p className="text-[9px] tabular-nums text-ink-3">
                          {hhmm(it.start)}–{hhmm(it.end)}
                          {it.location ? ` · ${it.location}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}

                  {empty ? (
                    <span className="py-1 text-[10px] text-[#c8c4bc]">{t("week.empty")}</span>
                  ) : null}
                </div>

                {tasks.length ? (
                  <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {tasks.map((x) => (
                      <span
                        key={x.id}
                        className="inline-flex items-center gap-1 rounded-full bg-[#f1eee8] px-2 py-[3px] text-[9.5px] text-ink-2"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            x.status === "done" ? "bg-accent" : "bg-[#d8d4cc]"
                          }`}
                        />
                        <span className={x.status === "done" ? "line-through text-ink-3" : ""}>
                          {x.title}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {editorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 p-4 pt-10"
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-line bg-bg p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-ink">{t("course.editMode")}</h2>
                <p className="mt-0.5 text-[10px] text-ink-3">
                  {data?.teachingWeek
                    ? t("week.teaching", { n: data.teachingWeek })
                    : t("course.setSemesterHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="text-[14px] leading-none text-ink-3 transition-colors hover:text-ink"
                aria-label="close"
              >
                ✕
              </button>
            </header>
            <CourseEditor onChanged={() => void load()} baseWeek={data?.teachingWeek ?? null} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
