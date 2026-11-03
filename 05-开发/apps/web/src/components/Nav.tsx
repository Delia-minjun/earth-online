import { useTranslation } from "react-i18next";

export type ViewKey = "today" | "week" | "habits" | "review" | "study" | "reward" | "settings";

export const NAV_ITEMS: { key: ViewKey; implemented: boolean }[] = [
  { key: "today", implemented: true },
  { key: "week", implemented: false },
  { key: "habits", implemented: false },
  { key: "review", implemented: false },
  { key: "study", implemented: false },
  { key: "reward", implemented: true },
  { key: "settings", implemented: false },
];

/** 手机底部只放五项 */
export const MOBILE_ITEMS: ViewKey[] = ["today", "week", "study", "reward", "settings"];

export function Sidebar({
  active,
  onChange,
  status,
  version,
}: {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
  status: "ok" | "down" | "loading";
  version?: string;
}) {
  const { t } = useTranslation();
  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface-2 px-4 py-6 md:flex">
      <div className="flex items-center gap-2.5 px-1">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        <span className="text-[15px] font-semibold text-ink">{t("app.title")}</span>
      </div>
      <p className="mt-1.5 px-1 text-[9px] uppercase tracking-[0.18em] text-ink-3">
        {t("app.badge")}
      </p>

      <nav className="mt-7 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={`flex w-full items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-left text-[13px] transition-colors ${
                isActive
                  ? "bg-accent-soft font-semibold text-ink"
                  : "text-ink-2 hover:bg-surface"
              }`}
            >
              <span
                className={`h-[3px] w-[3px] rounded-full ${
                  isActive ? "bg-accent" : "bg-[#cecac2]"
                }`}
              />
              <span>{t(`nav.${item.key}`)}</span>
              {!item.implemented ? (
                <span className="ml-auto text-[9px] text-[#c8c4bc]">P1</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-1.5 px-1 pt-4 text-[9.5px] text-ink-3">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            status === "ok" ? "bg-accent" : status === "down" ? "bg-warn" : "bg-line"
          }`}
        />
        <span>
          {status === "ok"
            ? t("status.online")
            : status === "down"
              ? t("status.offline")
              : "…"}
        </span>
        {version ? <span className="ml-auto tabular-nums">v{version}</span> : null}
      </div>
    </aside>
  );
}

export function BottomNav({
  active,
  onChange,
}: {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex">
        {MOBILE_ITEMS.map((key) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className="flex flex-1 flex-col items-center gap-1 py-2.5"
            >
              <span
                className={`h-[5px] w-[5px] rounded-full ${
                  isActive ? "bg-accent" : "bg-[#d0ccc4]"
                }`}
              />
              <span
                className={`text-[9.5px] ${
                  isActive ? "font-semibold text-ink" : "text-ink-3"
                }`}
              >
                {t(`nav.${key}`)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
