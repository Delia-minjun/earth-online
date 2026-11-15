import { useTranslation } from "react-i18next";

/** 生活成长的规则弹窗：只讲当前真实生效的规则 */
export function GrowthRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  if (!open) return null;

  const sections = [
    { title: t("growth.rulesCoins"), body: t("growth.rulesCoinsBody") },
    { title: t("growth.rulesXp"), body: t("growth.rulesXpBody") },
    { title: t("growth.rulesAreas"), body: t("growth.rulesAreasBody") },
    { title: t("growth.rulesRewards"), body: t("growth.rulesRewardsBody") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="max-h-[76vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-ink">{t("growth.rulesTitle")}</h2>
          <button type="button" onClick={onClose} className="text-[13px] leading-none text-ink-3">
            ✕
          </button>
        </header>

        <div className="mt-3 space-y-3">
          {sections.map((s) => (
            <section key={s.title}>
              <h3 className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{s.title}</h3>
              <ul className="mt-1 space-y-1">
                {s.body
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => (
                    <li key={line} className="flex gap-1.5 text-[11px] leading-relaxed text-ink-2">
                      <span className="shrink-0 text-[#c0bbb2]">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
