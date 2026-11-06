import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { DDL_TONE_CLASS, ddlTone } from "../ddl";

/**
 * DDL 按钮：点一下直接弹出系统日历（原生 date picker），不再有中间弹窗。
 * 已设置时按钮显示日期，并带一个 × 可清除。
 */
export function DdlButton({
  value,
  onChange,
  size = "sm",
}: {
  value: string;
  onChange: (date: string | null) => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    // showPicker 需要用户手势；不支持时退回到 focus + click
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* 某些浏览器会抛，走下面的兜底 */
      }
    }
    el.focus();
    el.click();
  };

  const pad = size === "md" ? "px-2.5 py-1 text-[10.5px]" : "px-1.5 py-[1px] text-[9px]";

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        className={`rounded-full border transition-colors ${pad} ${
          value
            ? `border-line ${DDL_TONE_CLASS[ddlTone(value)]}`
            : "border-line bg-surface text-[#a9a49b] hover:border-accent hover:text-accent"
        }`}
      >
        {value ? `DDL ${value.slice(5)}` : t("task.ddl")}
      </button>
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[10px] leading-none text-[#a9a49b] transition-colors hover:text-warn"
          aria-label={t("task.ddlClear")}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
