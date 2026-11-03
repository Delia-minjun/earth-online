import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HealthInfo, WeekInfo } from "@life/shared";
import { setLang, type Lang } from "./i18n";
import { BottomNav, Sidebar, type ViewKey } from "./components/Nav";
import { TodayView } from "./views/TodayView";
import { RewardView } from "./views/RewardView";
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
      <Sidebar active={view} onChange={setView} />

      <div className="flex min-h-full flex-1 flex-col pb-[72px] md:pb-0">
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
                  ? `${t("week.label", { week: week.isoWeek })} · ${t(
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
          {isReward && <RewardView />}
          {!isToday && !isReward && <PlaceholderView nameKey={`nav.${view}`} />}
        </main>

        <footer className="mx-auto w-full max-w-3xl px-5 pb-6 pt-6 md:px-8">
          <div className="flex items-center gap-2 text-[10.5px] text-ink-3">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                health ? "bg-accent" : failed ? "bg-warn" : "bg-line"
              }`}
            />
            <span>{health ? t("status.online") : failed ? t("status.offline") : "…"}</span>
            {health ? <span className="ml-auto">v{health.version}</span> : null}
          </div>
        </footer>
      </div>

      <BottomNav active={view} onChange={setView} />
    </div>
  );
}
