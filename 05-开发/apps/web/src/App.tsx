import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HealthInfo, WeekInfo } from "@life/shared";
import { setLang, type Lang } from "./i18n";

const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-[0_6px_20px_-14px_rgba(88,82,72,0.5)]">
      <header className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {action ? <span className="text-[11px] text-ink-3">{action}</span> : null}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2 px-3 py-6 text-center text-[12px] text-ink-3">
      {text}
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
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
  const weekLabel = week ? t("week.label", { week: week.isoWeek }) : "—";
  const weekRange = week
    ? t("week.range", { start: short(week.startDate), end: short(week.endDate) })
    : "";

  return (
    <div className="flex min-h-full justify-center px-5 py-8 sm:py-12">
      <main className="w-full max-w-xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-3">
              {t("app.title")} · {t("app.badge")}
            </p>
            <h1 className="mt-2 text-[22px] font-semibold leading-tight text-ink">
              {dateText}
            </h1>
            <p className="mt-1.5 text-[11px] text-ink-3">
              {weekLabel}
              {weekRange ? ` · ${weekRange}` : ""}
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

        <div className="mt-7 space-y-3.5">
          <Card title={t("today.focus")} action={t("action.add")}>
            <Empty text={t("today.focusEmpty")} />
          </Card>

          <Card title={t("today.habits")}>
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <span
                    key={i}
                    className="grid h-8 w-8 place-items-center rounded-full border border-line text-[10px] text-ink-3"
                  >
                    {lang === "zh-CN" ? WEEKDAYS_ZH[i] : ["M", "T", "W", "T", "F", "S", "S"][i]}
                  </span>
                ))}
              </div>
              <span className="text-[11px] text-ink-3">{t("today.habitsEmpty")}</span>
            </div>
          </Card>

          <Card title={t("today.reward")}>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-none text-ink">0</span>
              <span className="text-[11px] text-ink-3">{t("today.rewardEmpty")}</span>
            </div>
          </Card>
        </div>

        <footer className="mt-8 flex items-center gap-2 text-[10.5px] text-ink-3">
          <span
            className={`h-1.5 w-1.5 rounded-full ${health ? "bg-accent" : failed ? "bg-warn" : "bg-line"}`}
          />
          <span>{health ? t("status.online") : failed ? t("status.offline") : "…"}</span>
          {health ? <span className="ml-auto">v{health.version}</span> : null}
        </footer>
      </main>
    </div>
  );
}
