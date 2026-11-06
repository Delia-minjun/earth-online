import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 从今天起算的快捷日期 */
function quickDates() {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const tomorrow = new Date(base);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 这周日（今天是周日则算今天）
  const sunday = new Date(base);
  const dow = sunday.getDay() || 7; // 1..7
  sunday.setDate(sunday.getDate() + (7 - dow));

  // 下周一
  const nextMonday = new Date(base);
  nextMonday.setDate(nextMonday.getDate() + (8 - dow));

  return [
    { key: "today", date: ymd(base) },
    { key: "tomorrow", date: ymd(tomorrow) },
    { key: "sunday", date: ymd(sunday) },
    { key: "nextMonday", date: ymd(nextMonday) },
  ];
}

/**
 * DDL 选择弹窗：快捷日期 + 自定义日期。
 * 选快捷日期立即生效并关闭；自定义日期需要点确定。
 */
export function DdlPicker({
  open,
  value,
  onClose,
  onPick,
}: {
  open: boolean;
  value: string;
  onClose: () => void;
  onPick: (date: string | null) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  const quick = quickDates();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-28"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-ink">{t("task.ddlTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] leading-none text-ink-3 transition-colors hover:text-ink"
            aria-label="close"
          >
            ✕
          </button>
        </header>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {quick.map((q) => {
            const active = draft === q.date;
            return (
              <button
                key={q.key}
                type="button"
                onClick={() => {
                  onPick(q.date);
                  onClose();
                }}
                className={`rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-surface text-ink-2 hover:border-accent hover:text-ink"
                }`}
              >
                {t(`task.ddlQuick.${q.key}`)}
              </button>
            );
          })}
        </div>

        <div className="mt-3 border-t border-line-2 pt-3">
          <label className="flex items-center gap-2 text-[11px] text-ink-2">
            {t("task.ddlCustom")}
            <input
              type="date"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] tabular-nums text-ink outline-none"
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          {value ? (
            <button
              type="button"
              onClick={() => {
                onPick(null);
                onClose();
              }}
              className="text-[10px] text-[#a9a49b] underline decoration-dotted hover:text-warn"
            >
              {t("task.ddlClear")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              onPick(draft || null);
              onClose();
            }}
            disabled={!draft}
            className="rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
