import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HealthInfo, WeekInfo } from "@life/shared";
import { setLang, type Lang } from "./i18n";
import { BottomNav, Sidebar, type ViewKey } from "./components/Nav";
import { TodayView } from "./views/TodayView";
import { RewardView } from "./views/RewardView";
import { WeekView } from "./views/WeekView";
import { ProjectsView } from "./views/ProjectsView";
import { ReviewView } from "./views/ReviewView";
import { SettingsView } from "./views/SettingsView";
import { PlaceholderView } from "./views/PlaceholderView";

export default function App() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<ViewKey>("reward");
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
  /** 所有栏目共用同一个正文宽度：1180px，和「今日」保持一致 */
  const shellWidth = "max-w-[1180px]";
  /** 月历开关放在标题旁，由周视图消费 */
  const [calOpen, setCalOpen] = useState(false);
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

        <header
          className={`mx-auto flex w-full items-start justify-between gap-4 px-5 pt-7 md:px-8 md:pt-9 ${shellWidth}`}
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-3">
              {isToday ? t("today.title") : t("app.title")}
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <h1 className="truncate text-[22px] font-semibold leading-tight text-ink">
                {isToday ? dateText : isReward ? t("reward.homeTitle") : t(`nav.${view}`)}
              </h1>
              {view === "week" ? (
                <div className="flex shrink-0 items-center rounded-full border border-line bg-surface p-0.5">
                  <button
                    type="button"
                    onClick={() => setCalOpen(false)}
                    aria-pressed={!calOpen}
                    className={`rounded-full px-3 py-1 text-[10.5px] transition-colors ${
                      calOpen ? "text-ink-3 hover:text-ink" : "bg-accent text-white"
                    }`}
                  >
                    {t("calendar.week")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalOpen(true)}
                    aria-pressed={calOpen}
                    className={`rounded-full px-3 py-1 text-[10.5px] transition-colors ${
                      calOpen ? "bg-accent text-white" : "text-ink-3 hover:text-ink"
                    }`}
                  >
                    {t("calendar.month")}
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-ink-3">
              {isToday
                ? week
                  ? `${week.teachingWeek ? `${t("week.teaching", { n: week.teachingWeek })} · ` : ""}${t(
                      "week.range",
                      { start: short(week.startDate), end: short(week.endDate) },
                    )}`
                  : "—"
                : t(`sub.${view}`)}
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

        <main
          className={`mx-auto w-full flex-1 px-5 pt-5 md:px-8 md:pt-6 ${shellWidth}`}
        >
          {isToday && <TodayView />}
          {view === "week" && <WeekView calOpen={calOpen} onCalOpenChange={setCalOpen} />}
          {view === "projects" && <ProjectsView />}
          {view === "review" && <ReviewView />}
          {isReward && <RewardView />}
          {view === "settings" && <SettingsView />}
          {!isToday &&
            !isReward &&
            view !== "week" &&
            view !== "projects" &&
            view !== "review" &&
            view !== "settings" && <PlaceholderView nameKey={`nav.${view}`} />}
        </main>
      </div>

      <BottomNav active={view} onChange={setView} />
    </div>
  );
}
