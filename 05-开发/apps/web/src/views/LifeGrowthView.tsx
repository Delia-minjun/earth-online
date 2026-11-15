import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  type ApiAreaGrowth,
  type ApiRewardItem,
  type ApiWallet,
} from "../api";
import { Card } from "../components/Card";
import { SectionHeader } from "../components/SectionHeader";
import { MilestonesCard } from "../components/MilestonesCard";
import { TodayTasksCard } from "../components/TodayTasksCard";

/** 快乐方式分区：味觉 / 玩乐 / 拥有 / 创造 / 关系 / 出门 */
const TAG_META: Record<string, { label: string; color: string; icon: string }> = {
  taste: { label: "growth.tagTaste", color: "#CBAAA2", icon: "☕" },
  play: { label: "growth.tagPlay", color: "#A8B5A2", icon: "🎮" },
  own: { label: "growth.tagOwn", color: "#B4AAC4", icon: "🎁" },
  make: { label: "growth.tagMake", color: "#C9B99A", icon: "🎨" },
  bond: { label: "growth.tagBond", color: "#C4A8A8", icon: "🤝" },
  out: { label: "growth.tagOut", color: "#9FB3C0", icon: "🌤" },
  "": { label: "growth.tagOther", color: "#C7C2B8", icon: "✨" },
};

const TAG_KEYS = ["taste", "play", "own", "make", "bond", "out", ""];

type Draft = { name: string; price: string; money: string; tag: string };
const EMPTY: Draft = { name: "", price: "", money: "", tag: "" };

const KIND_LABEL: Record<string, string> = {
  task: "reward.kindTask",
  habit: "reward.kindHabit",
  streak: "reward.kindStreak",
  focus: "reward.kindFocus",
  review: "reward.kindReview",
  redeem: "reward.kindRedeem",
  bonus: "reward.kindBonus",
};

/** 生活成长（原奖赏）：快乐币 + 六领域成长 + 奖赏商店 + 最近账本 */
export function LifeGrowthView() {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<ApiWallet | null>(null);
  const [growth, setGrowth] = useState<ApiAreaGrowth[]>([]);
  const [shop, setShop] = useState<ApiRewardItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, g, s] = await Promise.all([api.wallet(), api.areasGrowth(), api.rewards()]);
      setWallet(w);
      setGrowth(g);
      setShop(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const balance = wallet?.balance ?? 0;

  const wishItems = useMemo(() => shop.filter((r) => r.wish), [shop]);

  const nextWish = useMemo(() => {
    const candidates = wishItems.filter((r) => r.price > balance).sort((a, b) => a.price - b.price);
    return candidates[0] ?? null;
  }, [wishItems, balance]);

  /** 按快乐方式分区，空区不显示 */
  const grouped = useMemo(() => {
    const buckets = new Map<string, ApiRewardItem[]>();
    for (const key of TAG_KEYS) buckets.set(key, []);
    for (const r of shop) {
      const key = r.tag && TAG_KEYS.includes(r.tag) ? r.tag : "";
      buckets.get(key)!.push(r);
    }
    return [...buckets.entries()].filter(([, list]) => list.length > 0);
  }, [shop]);

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
      tag: item.tag ?? "",
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
        tag: draft.tag || null,
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

  const toggleWish = async (item: ApiRewardItem) => {
    await api.updateReward(item.id, { wish: !item.wish });
    await load();
  };

  const redeem = async (item: ApiRewardItem) => {
    if (balance < item.price || redeeming) return;
    setRedeeming(item.id);
    try {
      await api.redeemReward(item.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRedeeming(null);
    }
  };

  const remove = async (id: string) => {
    await api.deleteReward(id);
    await load();
  };

  /** 近 7 天的净进出，画成一排小柱 */
  const week = useMemo(() => {
    const days: { date: string; net: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const net = (wallet?.entries ?? [])
        .filter((e) => e.date === key)
        .reduce((sum, e) => sum + e.amount, 0);
      days.push({ date: key, net });
    }
    return days;
  }, [wallet]);

  const ledger = (wallet?.entries ?? []).slice(0, 6);

  return (
    <div className="space-y-3.5">
      {error ? <p className="text-[10px] text-warn">{error}</p> : null}

      {/* 我的快乐币：整行横条 */}
      <section>
        <SectionHeader title={t("growth.coins")} />
        <Card data-tour="wallet">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[38px] font-semibold leading-none tracking-tight text-ink">
                {balance.toLocaleString()}
              </span>
              <span className="text-[12px] text-ink-3">{t("reward.unit")}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-accent-soft px-2.5 py-[3px] text-[10px] font-semibold text-accent">
                {t("reward.weekIn", { n: wallet?.weekIn ?? 0 })}
              </span>
              <span className="rounded-full bg-warn-soft px-2.5 py-[3px] text-[10px] font-semibold text-warn">
                {t("reward.weekOut", { n: wallet?.weekOut ?? 0 })}
              </span>
              <span className="rounded-full bg-surface-2 px-2.5 py-[3px] text-[10px] text-ink-3">
                {t("reward.todayIn", { n: wallet?.todayIn ?? 0 })}
              </span>
            </div>

            {/* 近 7 天进出 */}
            <div className="ml-auto flex items-end gap-1.5" title={t("growth.last7")}>
              {week.map((d) => {
                const peak = Math.max(1, ...week.map((x) => Math.abs(x.net)));
                const h = Math.max(2, Math.round((Math.abs(d.net) / peak) * 26));
                return (
                  <span key={d.date} className="flex flex-col items-center gap-1">
                    <span
                      className="w-[7px] rounded-sm"
                      style={{
                        height: `${h}px`,
                        background: d.net >= 0 ? "#A8B5A2" : "#C9A9A6",
                        opacity: d.net === 0 ? 0.25 : 1,
                      }}
                    />
                    <span className="text-[8px] tabular-nums text-[#c8c4bc]">{d.date.slice(8)}</span>
                  </span>
                );
              })}
            </div>
          </div>

          {nextWish ? (
            <div className="mt-3 border-t border-line-2 pt-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[10.5px] text-ink-2">
                  {t("growth.nextWish")} · {nextWish.name}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-ink-3">
                  {balance} / {nextWish.price} {t("reward.unit")}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(100, Math.round((balance / nextWish.price) * 100))}%` }}
                />
              </div>
            </div>
          ) : null}
        </Card>
      </section>

      {/* 六领域成长：整行三列 */}
      <Card>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {growth.map((a) => (
            <div key={a.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: a.color ?? "#9BA7B0" }}
                  />
                  <span className="truncate text-[10.5px] text-ink-2">{a.name}</span>
                </span>
                <span className="shrink-0 text-[9.5px] tabular-nums text-ink-3">Lv.{a.level}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, Math.round((a.inLevel / a.need) * 100))}%`,
                    background: a.color ?? "#9BA7B0",
                  }}
                />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-[9px] text-ink-3">
                <span className="tabular-nums">
                  {a.inLevel} / {a.need} XP
                </span>
                {a.recent14 > 0 ? (
                  <span className="tabular-nums">{t("growth.recent", { n: a.recent14 })}</span>
                ) : null}
              </div>
            </div>
          ))}
          {growth.length === 0 ? (
            <p className="text-[10px] text-[#c8c4bc]">{t("reward.noArea")}</p>
          ) : null}
        </div>
      </Card>

      <TodayTasksCard coinPerTask={wallet?.rules?.taskPer30 ?? 0} onChanged={load} />

      <MilestonesCard areas={growth} />

      {/* 商店：按快乐方式分区横排 */}
      <section>
        <SectionHeader
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
        />
        <Card>
        <div className="space-y-3">
          {grouped.map(([tagKey, list]) => {
            const meta = TAG_META[tagKey] ?? TAG_META[""]!;
            return (
              <section key={tagKey}>
                <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-3">
                  <span>{meta.icon}</span>
                  {t(meta.label)}
                </h3>
                <div className="mt-1.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((r) => {
                    const afford = balance >= r.price;
                    const ratio = Math.min(100, Math.round((balance / r.price) * 100));
                    return (
                      <div
                        key={r.id}
                        className="group flex flex-col rounded-xl border border-line-2 bg-surface-2 p-2.5 transition-transform duration-150 hover:-translate-y-0.5 hover:border-line"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px]"
                            style={{ background: `${meta.color}33`, color: meta.color }}
                          >
                            {meta.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] text-ink">{r.name}</p>
                            {r.money > 0 ? (
                              <p className="mt-0.5 truncate text-[9.5px] text-ink-3">¥{r.money}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void toggleWish(r)}
                            aria-label={t("growth.wish")}
                            className={`shrink-0 text-[12px] leading-none transition-colors ${
                              r.wish ? "text-[#c9a76a]" : "text-[#d5d0c7] hover:text-[#c9a76a]"
                            }`}
                          >
                            {r.wish ? "★" : "☆"}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            aria-label={t("growth.editReward")}
                            title={t("growth.editReward")}
                            className="shrink-0 text-[11px] leading-none text-[#c0bbb2] transition-colors hover:text-accent"
                          >
                            ✎
                          </button>
                        </div>

                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line-2">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${ratio}%`, background: meta.color }}
                          />
                        </div>

                        <div className="mt-1.5 flex items-end justify-between gap-2">
                          <span className="flex items-baseline gap-1">
                            <span className="text-[16px] font-semibold leading-none text-ink">
                              {r.price}
                            </span>
                            <span className="text-[9.5px] text-ink-3">{t("reward.unit")}</span>
                          </span>
                          {r.redeemed ? (
                            <span className="rounded-full bg-surface px-1.5 py-[1px] text-[9px] text-ink-3">
                              {r.last_redeemed
                                ? t("growth.redeemedOn", { d: r.last_redeemed.slice(5, 10) })
                                : t("growth.redeemedN", { n: r.redeemed })}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void redeem(r)}
                            disabled={!afford || redeeming === r.id}
                            className={`rounded-full px-2.5 py-[4px] text-[10px] font-semibold transition-colors ${
                              afford ? "bg-accent text-white hover:opacity-90" : "bg-surface text-ink-3"
                            } disabled:opacity-100`}
                          >
                            {redeeming === r.id
                              ? t("reward.redeeming")
                              : afford
                                ? t("reward.redeem")
                                : t("growth.shortBy", { n: r.price - balance })}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {shop.length === 0 ? (
            <p className="text-[10px] text-[#c8c4bc]">{t("growth.shopNone")}</p>
          ) : null}
        </div>
        </Card>
      </section>

      {/* 最近的账本 */}
      <section>
        <SectionHeader title={t("reward.ledger")} />
        <Card>
        <ul className="divide-y divide-line-2">
          {ledger.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 py-1.5 text-[10.5px]">
              <span className="w-[86px] shrink-0 tabular-nums text-ink-3">
                {e.date.slice(5)} {e.created_at.slice(11, 16)}
              </span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  e.amount >= 0 ? "bg-accent" : "bg-warn"
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {t(KIND_LABEL[e.kind] ?? "reward.kindBonus")}
                {e.note ? ` · ${e.note}` : ""}
              </span>
              <span
                className={`shrink-0 tabular-nums ${e.amount >= 0 ? "text-accent" : "text-warn"}`}
              >
                {e.amount >= 0 ? "+" : ""}
                {e.amount}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await api.deleteCoinEntry(e.id);
                  await load();
                }}
                className="shrink-0 text-[11px] leading-none text-[#c0bbb2] transition-colors hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                aria-label={t("growth.undoEntry")}
                title={t("growth.undoEntry")}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {ledger.length === 0 ? (
          <p className="text-[10px] text-[#c8c4bc]">{t("reward.ledgerEmptyShort")}</p>
        ) : null}
        </Card>
      </section>

      {/* 新建/编辑奖赏 */}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">
                {editing ? t("reward.editTitle") : t("reward.addTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[13px] text-ink-3"
              >
                ✕
              </button>
            </header>
            <div className="mt-3 space-y-1.5">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={t("reward.namePlaceholder")}
                className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
              />
              <select
                value={draft.tag}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                className="w-full rounded-lg border border-line bg-surface-2 px-1.5 py-1.5 text-[11px] text-ink-2 outline-none"
              >
                {TAG_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {TAG_META[k]!.icon} {t(TAG_META[k]!.label)}
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <input
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  inputMode="numeric"
                  placeholder={t("reward.pricePlaceholder")}
                  className="w-1/2 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] tabular-nums text-ink outline-none placeholder:text-[#c8c4bc]"
                />
                <input
                  value={draft.money}
                  onChange={(e) => setDraft({ ...draft, money: e.target.value })}
                  inputMode="numeric"
                  placeholder={t("reward.moneyPlaceholder")}
                  className="w-1/2 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] tabular-nums text-ink outline-none placeholder:text-[#c8c4bc]"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              {editing ? (
                <button
                  type="button"
                  onClick={async () => {
                    await remove(editing);
                    setOpen(false);
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-warn transition-colors hover:border-warn"
                >
                  {t("common.delete")}
                </button>
              ) : null}
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !draft.name.trim() || !draft.price.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white disabled:opacity-50"
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
