import type { ReactNode } from "react";

/** 分区标题：页面统一把标题放在卡片外面 */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {action ? <div className="flex items-center gap-1.5 text-[11px] text-ink-3">{action}</div> : null}
    </header>
  );
}
