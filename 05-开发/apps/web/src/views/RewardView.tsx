import { useTranslation } from "react-i18next";
import { Card } from "../components/Card";
import { CAT_COLOR, DEMO_REWARD } from "../demo";

export function RewardView() {
  const { t } = useTranslation();

  return (
    <div className="space-y-3.5">
      <p className="text-[10px] text-[#bcb8b0]">{t("demo.tag")}</p>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <p className="text-[11px] text-ink-3">{t("reward.balance")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[42px] font-semibold leading-none tracking-tight text-ink">
              {DEMO_REWARD.balance.toLocaleString()}
            </span>
            <span className="text-[12px] text-ink-3">{t("reward.unit")}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold text-accent">
              {t("reward.weekIn", { n: DEMO_REWARD.weekIn })}
            </span>
            <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[10px] font-semibold text-warn">
              {t("reward.weekOut", { n: DEMO_REWARD.weekOut })}
            </span>
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed text-[#bcb8b0]">{t("reward.hint")}</p>
        </Card>

        <Card title={t("reward.areas")} action={t("reward.decay")}>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {DEMO_REWARD.areas.map((a) => (
              <div key={a.key}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10.5px] text-ink-2">{t(`area.${a.key}`)}</span>
                  <span className="text-[9.5px] text-ink-3">{Math.round(a.pct * 100)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round(a.pct * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title={t("reward.shop")} action={t("action.add")}>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_REWARD.shop.map((r) => {
            const afford = DEMO_REWARD.balance >= r.price;
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-line-2 bg-surface-2 px-3 py-2.5"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{ background: `${CAT_COLOR[r.cat]}33` }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: CAT_COLOR[r.cat] }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] text-ink">{r.name}</p>
                  <p className="text-[10px] text-ink-3">
                    {r.price} {t("reward.unit")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!afford}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    afford ? "bg-accent text-white" : "border border-line bg-surface text-ink-3"
                  }`}
                >
                  {t("reward.redeem")}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={t("reward.ledger")} action={t("reward.ledgerAll")}>
        <ul className="divide-y divide-line-2">
          {DEMO_REWARD.ledger.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  l.delta > 0 ? "bg-accent" : "bg-warn"
                }`}
              />
              <span className="w-20 shrink-0 text-[9.5px] tabular-nums text-ink-3">{l.at}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">{l.text}</span>
              <span
                className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                  l.delta > 0 ? "text-accent" : "text-warn"
                }`}
              >
                {l.delta > 0 ? "+" : "−"}
                {Math.abs(l.delta)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
