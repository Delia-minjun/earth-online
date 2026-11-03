import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HealthInfo, WeekInfo } from "@life/shared";
import { setLang, type Lang } from "./i18n";
import { BottomNav, Sidebar, type ViewKey } from "./components/Nav";
import { TodayView } from "./views/TodayView";
import { RewardView } from "./views/RewardView";
import { WeekView } from "./views/WeekView";
import { ReviewView } from "./views/ReviewView";
import { SettingsView } from "./views/SettingsView";
import { PlaceholderView } from "./views/PlaceholderView";

export default function App() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<ViewKey>("today");
  const [week, setWeek] = useState<WeekInfo | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/week/current").then((r) => r.json() as Promise<WeekInfo>),
      fetch("/api/health").then((r) => r.json() as Promise<HealthInfo>),
    ])
      .then(([w, h]) => {
        if (!alive) return;
        setWeek(w);
        setHealth(h);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  // 连不上时每 5 秒重试一次，服务恢复后提示自动消失
  useEffect(() => {
    if (!failed) return;
    const timer = window.setInterval(() => {
      fetch("/api/health")
        .then((r) => r.json() as Promise<HealthInfo>)
        .then((h) => {
          setHealth(h);
          setFailed(false);
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [failed]);

  const lang = i18n.language as Lang;
  const dateText = useMemo(
    () =>
      new Intl.DateTimeFormat(lang, {
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    [lang],
  );

  const short = (d: string) => d.slice(5).replace("-", "/");
  const isToday = view === "today";
  const isReward = view === "reward";

  return (
    <div className="flex min-h-full">
      <Sidebar
        active={view}
        onChange={setView}
        status={health ? "ok" : failed ? "down" : "loading"}
        version={health?.version}
      />

      <div className="flex min-h-full flex-1 flex-col pb-[72px] md:pb-0">
        {failed && !health ? (
          <div className="border-b border-[#f0d9d2] bg-warn-soft px-5 py-2 text-center text-[10.5px] leading-relaxed text-warn md:px-8">
            {t("status.offlineBanner")}
          </div>
        ) : null}

        <header className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-5 pt-7 md:px-8 md:pt-9">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-3">
              {isToday ? t("today.title") : t("app.title")}
            </p>
            <h1 className="mt-1.5 truncate text-[22px] font-semibold leading-tight text-ink">
              {isToday ? dateText : t(`nav.${view}`)}
            </h1>
            <p className="mt-1 text-[11px] text-ink-3">
              {isToday
                ? week
                  ? `${week.teachingWeek ? `${t("week.teaching", { n: week.teachingWeek })} · ` : ""}${t(
                      "week.range",
                      { start: short(week.startDate), end: short(week.endDate) },
                    )}`
                  : "—"
                : isReward
                  ? t("reward.sub")
                  : t("placeholder.sub")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === "zh-CN" ? "en-US" : "zh-CN")}
            className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-ink"
          >
            {t("action.lang")}
          </button>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-5 md:px-8 md:pt-6">
          {isToday && <TodayView />}
          {view === "week" && <WeekView />}
          {view === "review" && <ReviewView />}
          {isReward && <RewardView />}
          {view === "settings" && <SettingsView />}
          {!isToday && !isReward && view !== "week" && view !== "review" && view !== "settings" && (
            <PlaceholderView nameKey={`nav.${view}`} />
          )}
        </main>
      </div>

      <BottomNav active={view} onChange={setView} />
    </div>
  );
}
