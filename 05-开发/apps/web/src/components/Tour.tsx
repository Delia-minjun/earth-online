import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type TourStep = {
  selector: string;
  title: string;
  text: string;
  /** 进入这一步前先切到对应页面，保证目标可见 */
  prepare?: () => void;
};

const KEY = "life.tour.done.v1";

type Rect = { top: number; left: number; width: number; height: number };

/** 聚光灯引导：高亮目标、其余变灰，点页面任意处或「下一步」推进 */
export function Tour({
  steps,
  onDone,
}: {
  steps: TourStep[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const timer = useRef<number | null>(null);

  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) {
      // 目标不存在就跳过，别把用户卡在空步骤上
      setIndex((i) => (i + 1 < steps.length ? i + 1 : i));
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    const r = el.getBoundingClientRect();
    const pad = 6;
    setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  }, [step, steps.length]);

  useEffect(() => {
    if (!step) return;
    step.prepare?.();
    // 等页面切换/滚动稳定再量
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(measure, 120);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [step, measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [measure]);

  if (!step) return null;

  const finish = () => {
    localStorage.setItem(KEY, "1");
    onDone();
  };

  const next = () => {
    if (index + 1 >= steps.length) finish();
    else setIndex(index + 1);
  };

  const cardTop = rect ? Math.min(window.innerHeight - 190, rect.top + rect.height + 14) : 200;
  const cardLeft = rect
    ? Math.min(Math.max(16, rect.left + rect.width / 2 - 150), window.innerWidth - 316)
    : 16;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* 全屏灰层：点一下就下一步 */}
      <div className="absolute inset-0 bg-black/45" onClick={next} />

      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-white/70 transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            background: "transparent",
          }}
        />
      ) : null}

      <div
        className="absolute w-[300px] rounded-2xl border border-line bg-surface p-4 shadow-xl"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[9px] uppercase tracking-[0.18em] text-ink-3">
            {index + 1} / {steps.length}
          </p>
          <button
            type="button"
            onClick={finish}
            className="text-[10px] text-ink-3 transition-colors hover:text-ink"
          >
            {t("tour.skip")}
          </button>
        </div>
        <h3 className="mt-1.5 text-[13px] font-semibold text-ink">{step.title}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{step.text}</p>

        <div className="mt-3 flex justify-between">
          <button
            type="button"
            onClick={() => setIndex(Math.max(0, index - 1))}
            disabled={index === 0}
            className="rounded-full border border-line px-3 py-1.5 text-[10.5px] text-ink-2 disabled:opacity-40"
          >
            {t("tour.prev")}
          </button>
          <button
            type="button"
            onClick={next}
            className="rounded-full bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white"
          >
            {index + 1 >= steps.length ? t("tour.done") : t("tour.next")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 是否还没看过引导 */
export function tourPending(): boolean {
  return !localStorage.getItem(KEY);
}

export function resetTour(): void {
  localStorage.removeItem(KEY);
}
