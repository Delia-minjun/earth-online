import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, COURSE_COLOR, hhmm, type ApiBlock, type ApiDay, type ApiWeekBlock } from "../api";
import { BlockEditor } from "./BlockEditor";

const WD_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WD_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 某一天的内容：时间轴 + 任务，用于「本月」模式下点选日期后查看 */
export function DayPanel({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const [day, setDay] = useState<ApiDay | null>(null);
  const [blockDate, setBlockDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDay(await api.day(date));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const wd = i18n.language === "zh-CN" ? WD_ZH : WD_EN;
  const dow = new Date(`${date}T00:00:00`).getDay() || 7;

  // 当天的日程 = 课表里的课 + 自己排的时间块，按开始时间合并排序
  const items = useMemo(() => {
    if (!day) return [] as { key: string; title: string; start: number; end: number; color: string; note: string; isCourse: boolean }[];
    const courses = day.courses.map((c) => ({
      key: `c-${c.id}`,
      title: c.name,
      start: c.start_min,
      end: c.end_min,
      color: COURSE_COLOR,
      note: [c.location, t("today.course")].filter(Boolean).join(" · "),
      isCourse: true,
    }));
    const blocks = day.blocks.map((b) => ({
      key: `b-${b.id}`,
      title: b.title,
      start: b.start_min,
      end: b.end_min,
      color: b.category_color ?? "#d8d4cc",
      note: `${b.end_min - b.start_min} ${t("today.min")}`,
      isCourse: false,
    }));
    return [...courses, ...blocks].sort((a, b) => a.start - b.start);
  }, [day, t]);

  // BlockEditor 需要带 date 的块；这里把当天已有的块转换一下
  const weekBlocks: ApiWeekBlock[] = useMemo(
    () =>
      (day?.blocks ?? []).map((b: ApiBlock) => ({
        id: b.id,
        date,
        start_min: b.start_min,
        end_min: b.end_min,
        title: b.title,
        category_id: b.category_id,
        category_color: b.category_color,
      })),
    [day, date],
  );

  return (
    <section className="rounded-2xl border border-line bg-surface p-3">
      <header className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold tabular-nums text-ink">
          {date.slice(5).replace("-", "/")} {wd[(dow ?? 1) - 1]}
        </h2>
        {day?.teachingWeek ? (
          <span className="text-[10px] text-ink-3">{t("week.teaching", { n: day.teachingWeek })}</span>
        ) : null}
        <button
          type="button"
          onClick={() => setBlockDate(date)}
          className="ml-auto shrink-0 self-center rounded-full border border-line px-2 py-[1px] text-[10px] text-[#a9a49b] transition-colors hover:border-accent hover:text-accent"
        >
          ＋ {t("block.title")}
        </button>
      </header>

      {error ? <p className="mt-2 text-[10px] text-warn">{error}</p> : null}

      <ul className="mt-2">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-2 py-1.5">
            <span className="w-9 shrink-0 text-[10px] tabular-nums text-ink-3">{hhmm(it.start)}</span>
            <span className="h-4 w-[2px] shrink-0 rounded-full" style={{ background: it.color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] text-ink">{it.title}</p>
              <p className="text-[9px] tabular-nums text-ink-3">
                {hhmm(it.start)}–{hhmm(it.end)}
                {it.note ? ` · ${it.note}` : ""}
              </p>
            </div>
            {it.isCourse ? (
              <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-[1px] text-[9px] text-ink-3">
                {t("today.course")}
              </span>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? (
          <li className="py-1.5 text-[10.5px] text-[#c8c4bc]">{t("week.empty")}</li>
        ) : null}
      </ul>

      {day?.tasks.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line-2 pt-2">
          {day.tasks.map((task) => (
            <span
              key={task.id}
              className="inline-flex items-center gap-1 rounded-full bg-[#f1eee8] px-2 py-[3px] text-[9.5px] text-ink-2"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  task.status === "done" ? "bg-accent" : "bg-[#d8d4cc]"
                }`}
              />
              <span className={task.status === "done" ? "line-through text-ink-3" : ""}>
                {task.title}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      <BlockEditor
        open={blockDate !== null}
        date={date}
        blocks={weekBlocks}
        courses={day?.courses ?? []}
        onClose={() => setBlockDate(null)}
        onSaved={() => void load()}
      />
    </section>
  );
}
