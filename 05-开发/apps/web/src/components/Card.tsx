import type { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className = "",
  ...rest
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-tour"?: string;
}) {
  return (
    <section
      {...rest}
      className={`rounded-2xl border border-line bg-surface p-4 shadow-[0_6px_20px_-14px_rgba(88,82,72,0.5)] ${className}`}
    >
      {title ? (
        <header className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {action ? (
            <div className="flex items-center gap-1.5 text-[11px] text-ink-3">{action}</div>
          ) : null}
        </header>
      ) : null}
      <div className={title ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

export function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2 px-4 py-7 text-center">
      <p className="text-[12px] text-ink-3">{text}</p>
      {hint ? <p className="mt-1.5 text-[10.5px] text-[#bcb8b0]">{hint}</p> : null}
    </div>
  );
}
