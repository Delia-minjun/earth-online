import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiAreaProgress, type ApiRewardItem, type ApiWallet } from "../api";
import { Card } from "../components/Card";

type Draft = { name: string; price: string; money: string };
const EMPTY: Draft = { name: "", price: "", money: "" };

const KIND_LABEL: Record<string, string> = {
  task: "reward.kindTask",
  habit: "reward.kindHabit",
  streak: "reward.kindStreak",
  focus: "reward.kindFocus",
  review: "reward.kindReview",
  redeem: "reward.kindRedeem",
  bonus: "reward.kindBonus",
};

export function RewardView() {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<ApiWallet | null>(null);
  const [areas, setAreas] = useState<ApiAreaProgress[]>([]);
  const [shop, setShop] = useState<ApiRewardItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, a, s] = await Promise.all([api.wallet(), api.areaProgress(), api.rewards()]);
      setWallet(w);
      setAreas(a);
      setShop(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startAdd = () => {
    setEditing(null);
    setDraft(EMPTY);
    setOpen(true);
  };

  const startEdit = (item: ApiRewardItem) => {
    setEditing(item.id);
    setDraft({
      name: item.name,
      price: String(item.price),
      money: item.money > 0 ? String(item.money) : "",
    });
    setOpen(true);
  };

  const submit = async () => {
    const name = draft.name.trim();
    const price = Number(draft.price);
    if (!name || !Number.isFinite(price) || price <= 0) return;
    setBusy(true);
    try {
      const payload = {
        name,
        price: Math.round(price),
        money: draft.money.trim() ? Math.round(Number(draft.money)) : 0,
      };
      if (editing) await api.updateReward(editing, payload);
      else await api.addReward(payload);
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteReward(id);
    await load();
  };

  const redeem = async (item: ApiRewardItem) => {
    if (!wallet || wallet.balance < item.price) return;
    try {
      await api.redeemReward(item.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const balance = wallet?.balance ?? 0;

  return (
    <div className="space-y-3.5">
      {error ? <p className="text-[10px] text-warn">{error}</p> : null}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card data-tour="wallet">
          <p className="text-[11px] text-ink-3">{t("reward.balance")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[42px] font-semibold leading-none tracking-tight text-ink">
              {balance.toLocaleString()}
            </span>
            <span className="text-[12px] text-ink-3">{t("reward.unit")}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold text-accent">
              {t("reward.weekIn", { n: wallet?.weekIn ?? 0 })}
            </span>
            <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[10px] font-semibold text-warn">
              {t("reward.weekOut", { n: wallet?.weekOut ?? 0 })}
            </span>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] text-ink-3">
              {t("reward.todayIn", { n: wallet?.todayIn ?? 0 })}
            </span>
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed text-[#bcb8b0]">{t("reward.hint")}</p>
        </Card>

        <Card title={t("reward.areas")} action={t("reward.decay")}>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {areas.map((a) => (
              <div key={a.id}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10.5px] text-ink-2">{a.name}</span>
                  <span className="text-[9.5px] tabular-nums text-ink-3">
                    {Math.round(a.pct * 100)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(a.pct * 100)}%`, background: a.color }}
                  />
                </div>
              </div>
            ))}
            {areas.length === 0 ? (
              <p className="text-[10px] text-[#c8c4bc]">{t("reward.noArea")}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card
        title={t("reward.shop")}
        action={
          <button
            type="button"
            onClick={startAdd}
            className="rounded-full border border-line px-2 py-[1px] text-[9px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
          >
            ＋
          </button>
        }
      >
        {shop.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {shop.map((r) => {
              const afford = balance >= r.price;
              return (
                <div
                  key={r.id}
                  className="group flex items-center gap-3 rounded-xl border border-line-2 bg-surface-2 px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[11.5px] text-ink">{r.name}</p>
                    <p className="text-[10px] text-ink-3">
                      {r.price} {t("reward.unit")}
                      {r.money > 0 ? ` · ¥${r.money}` : ""}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    className="shrink-0 self-center text-[11px] leading-none text-[#a9a49b] opacity-100 transition-colors hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                    aria-label="delete"
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    onClick={() => void redeem(r)}
                    disabled={!afford}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      afford
                        ? "bg-accent text-white hover:opacity-90"
                        : "border border-line bg-surface text-ink-3"
                    }`}
                  >
                    {t("reward.redeem")}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[10.5px] text-[#c8c4bc]">{t("reward.shopEmpty")}</p>
        )}
      </Card>

      <Card title={t("reward.ledger")}>
        {wallet?.entries.length ? (
          <ul className="divide-y divide-line-2">
            {wallet.entries.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    l.amount > 0 ? "bg-accent" : "bg-warn"
                  }`}
                />
                <span className="w-20 shrink-0 text-[9.5px] tabular-nums text-ink-3">
                  {l.created_at.slice(5, 16)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
                  {l.note ?? t(KIND_LABEL[l.kind] ?? "reward.kindBonus")}
                </span>
                <span
                  className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                    l.amount > 0 ? "text-accent" : "text-warn"
                  }`}
                >
                  {l.amount > 0 ? "+" : "−"}
                  {Math.abs(l.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[10.5px] text-[#c8c4bc]">{t("reward.ledgerEmpty")}</p>
        )}
      </Card>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">
                {editing ? t("reward.editTitle") : t("reward.addTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[13px] leading-none text-ink-3 transition-colors hover:text-ink"
                aria-label="close"
              >
                ✕
              </button>
            </header>

            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder={t("reward.namePlaceholder")}
              className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-[#c8c4bc]"
            />

            <div className="mt-2 flex items-center gap-2">
              <input
                inputMode="numeric"
                value={draft.price}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, price: e.target.value.replace(/\D/g, "") }))
                }
                placeholder={t("reward.pricePlaceholder")}
                className="w-20 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] tabular-nums text-ink outline-none placeholder:text-[#c8c4bc]"
              />
              <span className="text-[10px] text-ink-3">{t("reward.unit")}</span>
            </div>

            <input
              inputMode="numeric"
              value={draft.money}
              onChange={(e) =>
                setDraft((d) => ({ ...d, money: e.target.value.replace(/\D/g, "") }))
              }
              placeholder={t("reward.moneyPlaceholder")}
              className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11px] text-ink-2 outline-none placeholder:text-[#c8c4bc]"
            />
            <p className="mt-1 text-[9.5px] leading-relaxed text-ink-3">{t("reward.moneyHint")}</p>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-line px-3 py-1.5 text-[11px] text-ink-2 hover:border-accent"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !draft.name.trim() || !draft.price.trim()}
                className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
