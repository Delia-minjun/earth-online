import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, COURSE_COLOR, hhmm, isoWeekOf, mondayOfThisWeek, shiftWeeks, type ApiWeek } from "../api";
import { BlockEditor } from "../components/BlockEditor";
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

/** 月历：点某天跳到那一周 */
function MonthGrid({ onPick }: { onPick: (date: string) => void }) {
  const { t, i18n } = useTranslation();
  const today = ymd(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [byDate, setByDate] = useState<Record<string, { blocks: number; tasks: number; done: number; expense: number }>>({});

  useEffect(() => {
    let alive = true;
    api
      .calendar(month)
      .then((r) => alive && setByDate(r.byDate))
      .catch(() => alive && setByDate({}));
    return () => {
      alive = false;
    };
  }, [month]);

  const [yearStr, monStr] = month.split("-");
  const year = Number(yearStr);
  const mon = Number(monStr);
  const first = new Date(year, mon - 1, 1);
  const lead = (first.getDay() || 7) - 1; // 周一开头
  const daysInMonth = new Date(year, mon, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, mon - 1, i + 1);
      return ymd(d);
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, mon - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const wd = i18n.language === "zh-CN" ? WD_ZH : WD_EN;

  return (
    <section className="rounded-2xl border border-line bg-surface p-3">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="grid h-6 w-6 place-items-center rounded-full border border-line text-[11px] text-ink-2 hover:border-accent"
        >
          ‹
        </button>
        <span className="text-[12px] font-semibold tabular-nums text-ink">
          {t("calendar.monthLabel", { year, month: mon })}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="grid h-6 w-6 place-items-center rounded-full border border-line text-[11px] text-ink-2 hover:border-accent"
        >
          ›
        </button>
        {month !== today.slice(0, 7) ? (
          <button
            type="button"
            onClick={() => setMonth(today.slice(0, 7))}
            className="ml-auto text-[10px] text-ink-3 underline decoration-dotted hover:text-accent"
          >
            {t("calendar.thisMonth")}
          </button>
        ) : null}
      </header>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {wd.map((w) => (
          <span key={w} className="text-[9px] text-ink-3">
            {w.replace("周", "")}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`e-${i}`} />;
          const info = byDate[date];
          const isToday = date === today;
          const day = Number(date.slice(8));
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPick(date)}
              className={`flex h-9 flex-col items-center justify-center rounded-lg text-[10.5px] transition-colors ${
                isToday
                  ? "bg-accent-soft font-semibold text-ink"
                  : "text-ink-2 hover:bg-surface-2"
              }`}
            >
              <span className="tabular-nums">{day}</span>
              <span className="mt-0.5 flex h-1 items-center gap-[2px]">
                {info?.blocks ? <span className="h-1 w-1 rounded-full bg-[#9BA7B0]" /> : null}
                {info?.done ? <span className="h-1 w-1 rounded-full bg-accent" /> : null}
                {info?.expense ? <span className="h-1 w-1 rounded-full bg-[#CBBB9A]" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function WeekView({
  calOpen,
  onCalOpenChange,
}: {
  calOpen: boolean;
  onCalOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ApiWeek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const target = useMemo(() => shiftWeeks(mondayOfThisWeek(), offset), [offset]);
  const { isoYear, isoWeek } = useMemo(() => isoWeekOf(target), [target]);

  /** 跳到某一天所在的那一周 */
  const jumpToDate = (date: string) => {    const d = new Date(`${date}T00:00:00`);
    const day = d.getDay() || 7; // 1..7
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day - 1));
    const base = mondayOfThisWeek();
    const diff = Math.round(
      (monday.getTime() - new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) /
        (7 * 86_400_000),
    );
    setOffset(diff);
  };

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

  const removeBlock = async (id: string) => {
    await api.deleteBlock(id);
    await load();
  };

  const [blockDate, setBlockDate] = useState<string | null>(null);

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

        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="ml-auto rounded-full border border-line bg-surface px-3 py-1.5 text-[10.5px] text-ink-2 transition-colors hover:border-accent hover:text-ink"
        >
          {t("course.editMode")}
        </button>
      </div>

      {calOpen ? <MonthGrid onPick={(date) => jumpToDate(date)} /> : null}

      <BlockEditor
        open={blockDate !== null}
        date={blockDate ?? ""}
        blocks={data?.blocks ?? []}
        courses={data?.courses ?? []}
        onClose={() => setBlockDate(null)}
        onSaved={() => void load()}
      />

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
              color: COURSE_COLOR,
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
              className={`group flex gap-3 px-3 py-2.5 ${
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
                      className="group flex items-center gap-1.5 rounded-lg border border-line-2 bg-surface px-2 py-1"
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
                      {it.kind === "block" ? (
                        <button
                          type="button"
                          onClick={() => void removeBlock(it.id)}
                          className="shrink-0 text-[11px] leading-none text-[#a9a49b] opacity-100 transition-colors hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                          aria-label="delete"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}

                  {empty ? (
                    <span className="py-1 text-[10px] text-[#c8c4bc]">{t("week.empty")}</span>
                  ) : null}
                </div>

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
              </div>

              <button
                type="button"
                onClick={() => setBlockDate(d.date)}
                title={t("block.add")}
                className="shrink-0 self-center rounded-full border border-line px-1.5 text-[11px] leading-tight text-[#c2beb6] opacity-0 transition-colors hover:border-accent hover:text-accent group-hover:opacity-100"
              >
                ＋
              </button>
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
