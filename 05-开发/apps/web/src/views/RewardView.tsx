import { useTranslation } from "react-i18next";
import { Card, Empty } from "../components/Card";

const AREAS = ["health", "study", "relation", "finance", "growth", "fun"] as const;

export function RewardView() {
  const { t } = useTranslation();

  return (
    <div className="space-y-3.5">
      {/* 钱包 + 领域进度 */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <p className="text-[11px] text-ink-3">{t("reward.balance")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[42px] font-semibold leading-none tracking-tight text-ink">0</span>
            <span className="text-[12px] text-ink-3">{t("reward.unit")}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold text-accent">
              {t("reward.weekIn")}
            </span>
            <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[10px] font-semibold text-warn">
              {t("reward.weekOut")}
            </span>
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed text-[#bcb8b0]">{t("reward.hint")}</p>
        </Card>

        <Card title={t("reward.areas")} action={t("reward.decay")}>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {AREAS.map((a) => (
              <div key={a}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10.5px] text-ink-2">{t(`area.${a}`)}</span>
                  <span className="text-[9.5px] text-ink-3">0%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-line-2" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 商店 */}
      <Card title={t("reward.shop")} action={t("action.add")}>
        <Empty text={t("reward.shopEmpty")} hint={t("reward.shopHint")} />
      </Card>

      {/* 账本 */}
      <Card title={t("reward.ledger")} action={t("reward.ledgerAll")}>
        <Empty text={t("reward.ledgerEmpty")} />
      </Card>
    </div>
  );
}
