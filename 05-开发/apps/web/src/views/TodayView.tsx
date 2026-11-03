import { useTranslation } from "react-i18next";
import type { WeekInfo } from "@life/shared";
import { Card } from "../components/Card";
import {
  CAT_COLOR,
  DEMO_BLOCKS,
  DEMO_BODY,
  DEMO_FOCUS,
  DEMO_HABITS,
  DEMO_MEALS,
  DEMO_MONEY,
  DEMO_NOTE,
} from "../demo";

function Mini({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-[0_6px_20px_-14px_rgba(88,82,72,0.5)]">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[12px] font-semibold text-ink">{title}</h2>
        {action ? <span className="text-[10px] text-ink-3">{action}</span> : null}
      </header>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** 预留位置：番茄钟（P3）与今日复习（P5），现在只占结构不接功能 */
function QuickActions() {
  const { t } = useTranslation();
  return (
    <section className="grid gap-2.5 sm:grid-cols-2">
      <button
        type="button"
        disabled
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left opacity-90"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] text-accent">
          ◷
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold text-ink">{t("today.pomodoro")}</span>
            <span className="text-[15px] font-semibold tabular-nums text-ink">25:00</span>
          </span>
          <span className="mt-0.5 block text-[10px] text-ink-3">{t("today.pomodoroHint")}</span>
        </span>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[9px] text-ink-3">
          P3
        </span>
      </button>

      <button
        type="button"
        disabled
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left opacity-90"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef0f4] text-[13px] text-[#9BA7B0]">
          ▤
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold text-ink">{t("today.reviewCards")}</span>
            <span className="text-[15px] font-semibold tabular-nums text-ink">0</span>
          </span>
          <span className="mt-0.5 block text-[10px] text-ink-3">{t("today.reviewHint")}</span>
        </span>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[9px] text-ink-3">
          P5
        </span>
      </button>
    </section>
  );
}

const minutes = (a: string, b: string) => {
  const [h1, m1] = a.split(":").map(Number);
  const [h2, m2] = b.split(":").map(Number);
  return (h2 ?? 0) * 60 + (m2 ?? 0) - ((h1 ?? 0) * 60 + (m1 ?? 0));
};

export function TodayView({ week }: { week: WeekInfo | null }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3.5">
      <p className="text-[10px] text-[#bcb8b0]">{t("demo.tag")}</p>

      <QuickActions />

      <div className="space-y-3.5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-3.5 lg:space-y-0">
        {/* 左：重点 + 时间轴 */}
        <div className="space-y-3.5 lg:col-span-3">
          <Card title={t("today.focus")} action={t("action.add")}>
            <ul className="divide-y divide-line-2">
              {DEMO_FOCUS.map((f) => (
                <li key={f.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[9px] ${
                      f.done
                        ? "border-accent bg-accent text-white"
                        : "border-line text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[12.5px] ${
                        f.done ? "text-ink-3 line-through" : "text-ink"
                      }`}
                    >
                      {f.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-3">{f.time}</p>
                  </div>
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: CAT_COLOR[f.cat] }}
                  />
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={t("today.timeline")}
            action={week ? t("week.label", { week: week.isoWeek }) : "—"}
          >
            <ul>
              {DEMO_BLOCKS.map((b) => (
                <li key={b.id} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="w-10 shrink-0 pt-0.5 text-[10px] tabular-nums text-ink-3">
                    {b.start}
                  </span>
                  <span
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ background: CAT_COLOR[b.cat] }}
                  />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="truncate text-[12px] text-ink">{b.title}</p>
                    <p className="mt-0.5 text-[10px] text-ink-3">
                      {b.start}–{b.end} · {minutes(b.start, b.end)} {t("today.min")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* 右：习惯 / 记账 / 身体 / 饮食 / 随手记 */}
        <div className="space-y-3.5 lg:col-span-2">
          <Mini
            title={t("today.habits")}
            action={`${DEMO_HABITS.filter((h) => h.done).length}/${DEMO_HABITS.length}`}
          >
            <div className="flex flex-wrap gap-1.5">
              {DEMO_HABITS.map((h) => (
                <span
                  key={h.id}
                  className={`rounded-full px-2.5 py-1 text-[10.5px] ${
                    h.done
                      ? "bg-accent text-white"
                      : "border border-line bg-surface text-ink-3"
                  }`}
                >
                  {h.done ? "✓ " : ""}
                  {h.name}
                </span>
              ))}
            </div>
          </Mini>

          <Mini title={t("today.money")} action={t("today.addRecord")}>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[19px] font-semibold leading-none text-ink">
                  −{DEMO_MONEY.spentToday}
                </p>
                <p className="mt-1.5 text-[10px] text-ink-3">
                  {t("today.left")} {DEMO_MONEY.budgetLeft}
                </p>
              </div>
              <div className="flex gap-1">
                <span className="rounded-full bg-warn-soft px-2 py-1 text-[9.5px] text-warn">
                  {t("today.expense")}
                </span>
                <span className="rounded-full bg-accent-soft px-2 py-1 text-[9.5px] text-accent">
                  {t("today.income")}
                </span>
              </div>
            </div>
          </Mini>

          <Mini title={t("today.body")}>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-ink-2">
                {t("today.weight")} <span className="text-ink">{DEMO_BODY.weight}</span> kg
              </span>
              <span className="rounded-full bg-[#f0ece4] px-2 py-0.5 text-[10px] text-ink-2">
                {DEMO_BODY.workout}
              </span>
            </div>
          </Mini>

          <Mini title={t("today.meals")}>
            <ul className="space-y-1.5">
              {DEMO_MEALS.map((m) => (
                <li key={m.id} className="flex gap-2 text-[11px]">
                  <span className="w-3 shrink-0 text-ink-3">{m.slot}</span>
                  <span className={m.text ? "text-ink-2" : "text-[#c8c4bc]"}>
                    {m.text || t("today.notRecorded")}
                  </span>
                </li>
              ))}
            </ul>
          </Mini>

          <Mini title={t("today.notes")} action={t("today.noteAdd")}>
            <p className="text-[11.5px] leading-relaxed text-ink-2">{DEMO_NOTE}</p>
          </Mini>
        </div>
      </div>
    </div>
  );
}
