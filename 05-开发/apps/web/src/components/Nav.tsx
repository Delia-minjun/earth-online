import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type ViewKey =
  | "today"
  | "week"
  | "projects"
  | "habits"
  | "review"
  | "study"
  | "reward"
  | "settings";

export const NAV_ITEMS: { key: ViewKey; implemented: boolean; phase?: string }[] = [
  { key: "today", implemented: true },
  { key: "week", implemented: true },
  { key: "projects", implemented: true },
  { key: "review", implemented: true },
  { key: "study", implemented: false, phase: "P5" },
  { key: "settings", implemented: true },
];

/** 手机底部只放五项 */
export const MOBILE_ITEMS: ViewKey[] = ["today", "week", "study", "reward", "settings"];

const ORDER_KEY = "life.navOrder";

function loadOrder(): ViewKey[] {
  const fallback = NAV_ITEMS.map((i) => i.key);
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return fallback;
    const valid = saved.filter(
      (k): k is ViewKey => typeof k === "string" && NAV_ITEMS.some((i) => i.key === k),
    );
    // 代码里新增、但存档里没有的项，补到末尾
    for (const item of NAV_ITEMS) if (!valid.includes(item.key)) valid.push(item.key);
    return valid;
  } catch {
    return fallback;
  }
}

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

  const [order, setOrder] = useState<ViewKey[]>(() => loadOrder());
  const orderRef = useRef<ViewKey[]>(order);
  const dragFrom = useRef<number | null>(null);
  const [dragging, setDragging] = useState<ViewKey | null>(null);

  const commit = (next: ViewKey[]) => {
    orderRef.current = next;
    setOrder(next);
  };

  const persist = () => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(orderRef.current));
    } catch {
      /* 忽略隐私模式下的写入失败 */
    }
  };

  const onDragOver = (e: React.DragEvent, to: number) => {
    e.preventDefault();
    const from = dragFrom.current;
    if (from === null || from === to) return;
    const next = [...orderRef.current];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    dragFrom.current = to;
    commit(next);
  };

  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface-2 px-4 py-6 md:flex">
      <button
        type="button"
        onClick={() => onChange("reward")}
        className="flex w-full items-center gap-2.5 rounded-[11px] px-1 py-0.5 text-left transition-opacity hover:opacity-80"
        title={t("reward.homeTitle")}
      >
        <img
          src="/icons/icon-48.png?v=2"
          alt=""
          className="h-6 w-6 rounded-[7px]"
          draggable={false}
        />
        <span className="text-[15px] font-semibold text-ink">{t("app.title")}</span>
      </button>
      <p className="mt-1.5 px-1 text-[9px] uppercase tracking-[0.18em] text-ink-3">
        {t("app.badge")}
      </p>

      <nav className="mt-7 space-y-1">
        {order.map((key, index) => {
          const item = NAV_ITEMS.find((i) => i.key === key);
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              draggable
              onDragStart={() => {
                dragFrom.current = index;
                setDragging(key);
              }}
              onDragOver={(e) => onDragOver(e, index)}
              onDragEnd={() => {
                dragFrom.current = null;
                setDragging(null);
                persist();
              }}
              onClick={() => onChange(key)}
              className={`flex w-full select-none items-center gap-2 rounded-[11px] px-2.5 py-2.5 text-left text-[13px] transition-colors ${
                isActive ? "bg-accent-soft font-semibold text-ink" : "text-ink-2 hover:bg-surface"
              } ${dragging === key ? "opacity-40" : ""}`}
            >
              <span
                className="cursor-grab text-[11px] leading-none text-[#d2cec5] active:cursor-grabbing"
                aria-hidden
              >
                ⠿
              </span>
              <span>{t(`nav.${key}`)}</span>
              {item?.phase ? (
                <span className="ml-auto text-[9px] text-[#c8c4bc]">{item.phase}</span>
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
