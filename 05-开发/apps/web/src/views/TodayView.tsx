import { useTranslation } from "react-i18next";
import type { WeekInfo } from "@life/shared";
import { Card, Empty } from "../components/Card";

const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAYS_EN = ["M", "T", "W", "T", "F", "S", "S"];

export function TodayView({ week }: { week: WeekInfo | null }) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language === "zh-CN";
  const days = zh ? WEEKDAYS_ZH : WEEKDAYS_EN;

  return (
    <div className="space-y-3.5">
      <Card title={t("today.focus")} action={t("action.add")}>
        <Empty text={t("today.focusEmpty")} hint={t("today.focusHint")} />
      </Card>

      <Card title={t("today.habits")} action={week ? t("week.label", { week: week.isoWeek }) : "—"}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {days.map((d, i) => (
              <span
                key={i}
                className="grid h-8 w-8 place-items-center rounded-full border border-line text-[10px] text-ink-3"
              >
                {d}
              </span>
            ))}
          </div>
          <span className="text-[10.5px] leading-relaxed text-ink-3">{t("today.habitsEmpty")}</span>
        </div>
      </Card>

      <Card title={t("today.notes")} action={t("action.add")}>
        <Empty text={t("today.notesEmpty")} />
      </Card>
    </div>
  );
}
