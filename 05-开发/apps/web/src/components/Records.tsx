import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  type ApiBodyLog,
  type ApiBudget,
  type ApiMealDay,
  type ApiMoneyCategory,
  type ApiMoneyMonth,
} from "../api";
import { Card } from "./Card";

const WORKOUTS = ["有氧", "臀腿", "肩背", "燃脂", "手臂", "拉伸"];
const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

const yuan = (n: number) =>
  n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(n % 1 === 0 ? 0 : 2);

/* ---------------- 记账 ---------------- */

export function MoneyCard({ date }: { date: string }) {
  const { t } = useTranslation();
  const [cats, setCats] = useState<ApiMoneyCategory[]>([]);
  const [month, setMonth] = useState<ApiMoneyMonth | null>(null);
  const [budget, setBudget] = useState<ApiBudget | null>(null);
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState("");
  const [detail, setDetail] = useState(false);

  const load = useCallback(async () => {
    const [c, m, b] = await Promise.all([
      api.moneyCategories(),
      api.moneyMonth(date.slice(0, 7)),
      api.budget(),
    ]);
    setCats(c);
    setMonth(m);
    setBudget(b);
    setCatId((prev) => prev || c.find((x) => x.kind === "expense")?.id || "");
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setAmount("");
    await api.addMoney({ date, amount: value, categoryId: catId || undefined });
    await load();
  };

  const todayEntries = (month?.entries ?? []).filter((e) => e.date === date);
  const todayExpense = todayEntries
    .filter((e) => e.kind === "expense")
    .reduce((s, e) => s + e.amount, 0);
  const spent = month?.summary.expense ?? 0;
  const total = budget?.total ?? 0;
  const left = total - spent;
  const over = total > 0 && left < 0;

  return (
    <Card
      title={t("money.title")}
      action={
        <span className="tabular-nums">
          {t("money.todaySpent")} {yuan(todayExpense)}
        </span>
      }
    >
      <div className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="0"
          className="w-16 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] tabular-nums text-ink outline-none placeholder:text-[#c8c4bc]"
        />
        <select
          value={catId}
          onChange={(e) => setCatId(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[11px] text-ink-2 outline-none"
        >
          {cats
            .filter((c) => c.kind === "expense")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={() => void add()}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] text-white"
          aria-label={t("money.add")}
        >
          ＋
        </button>
      </div>

      {todayEntries.length ? (
        <ul className="mt-2 space-y-0.5">
          {todayEntries.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 py-0.5 text-[11px]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: e.categoryColor ?? "#d8d4cc" }}
              />
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {e.categoryName ?? t("money.uncategorized")}
                {e.note ? ` · ${e.note}` : ""}
              </span>
              <span
                className={`shrink-0 tabular-nums ${
                  e.kind === "income" ? "text-accent" : "text-ink"
                }`}
              >
                {e.kind === "income" ? "+" : "−"}
                {yuan(e.amount)}
              </span>
              <button
                type="button"
                onClick={() => void api.deleteMoney(e.id).then(load)}
                className="shrink-0 text-[11px] text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                aria-label="delete"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex items-center gap-2 border-t border-line-2 pt-2 text-[10px] text-ink-3">
        <span className="tabular-nums">{t("money.monthSpent", { n: yuan(spent) })}</span>
        {total > 0 ? (
          <span className={`tabular-nums ${over ? "text-warn" : ""}`}>
            {over ? t("money.over", { n: yuan(-left) }) : t("money.left", { n: yuan(left) })}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setDetail((v) => !v)}
          className="ml-auto text-[10px] text-ink-3 underline decoration-dotted hover:text-accent"
        >
          {detail ? t("money.collapse") : t("money.detail")}
        </button>
      </div>

      {detail ? (
        <ul className="mt-2 space-y-1">
          {Object.entries(month?.summary.byCategory ?? {})
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([id, bucket]) => {
              const pct = spent > 0 ? Math.round((bucket.amount / spent) * 100) : 0;
              return (
                <li key={id} className="flex items-center gap-2 text-[10.5px] text-ink-3">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: bucket.color ?? "#d8d4cc" }}
                  />
                  <span className="w-12 shrink-0">{bucket.name}</span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums">{yuan(bucket.amount)}</span>
                </li>
              );
            })}
          {Object.keys(month?.summary.byCategory ?? {}).length === 0 ? (
            <li className="text-[10.5px] text-[#c8c4bc]">{t("money.noRecords")}</li>
          ) : null}
        </ul>
      ) : null}
    </Card>
  );
}

/* ---------------- 身体 ---------------- */

export function BodyCard({ date }: { date: string }) {
  const { t } = useTranslation();
  const [row, setRow] = useState<ApiBodyLog>({ date, weight: null, workout: null });
  const [history, setHistory] = useState<ApiBodyLog[]>([]);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const from = new Date(`${date}T00:00:00`);
    from.setDate(from.getDate() - 13);
    const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(
      from.getDate(),
    ).padStart(2, "0")}`;
    const list = await api.bodyLog(fromStr, date);
    setHistory(list);
    const today = list.find((x) => x.date === date);
    setRow(today ?? { date, weight: null, workout: null });
    setDraft(today?.weight != null ? String(today.weight) : "");
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: { weight?: number | null; workout?: string | null }) => {
    const saved = await api.saveBody(date, patch);
    setRow(saved);
    await load();
  };

  const commitWeight = async () => {
    const value = Number(draft);
    if (!draft.trim()) {
      await save({ weight: null });
      return;
    }
    if (!Number.isFinite(value) || value < 20 || value > 300) return;
    await save({ weight: value });
  };

  const tags = (row.workout ?? "").split(",").filter(Boolean);
  const toggleWorkout = async (tag: string) => {
    const next = tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag];
    await save({ workout: next.join(",") || null });
  };

  const weighed = history.filter((h) => h.weight != null);
  const last = weighed[weighed.length - 1];
  const first = weighed[0];
  const delta = last && first && weighed.length > 1 ? last.weight! - first.weight! : null;

  // 迷你曲线
  const points = weighed.map((h) => h.weight as number);
  const min = points.length ? Math.min(...points) : 0;
  const max = points.length ? Math.max(...points) : 0;
  const path = weighed
    .map((h, i) => {
      const x = weighed.length === 1 ? 50 : (i / (weighed.length - 1)) * 100;
      const y = max === min ? 50 : 100 - ((h.weight! - min) / (max - min)) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Card
      title={t("body.title")}
      action={
        delta != null ? (
          <span className="tabular-nums">
            {t("body.twoWeeks")} {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}
          </span>
        ) : null
      }
    >
      <div className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitWeight()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitWeight();
          }}
          placeholder={t("body.weightPlaceholder")}
          className="w-20 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] tabular-nums text-ink outline-none placeholder:text-[#c8c4bc]"
        />
        <span className="text-[10px] text-ink-3">kg</span>
        {path ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="ml-1 h-7 flex-1">
            <path d={path} fill="none" stroke="#9BA7B0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {WORKOUTS.map((w) => {
          const on = tags.includes(w);
          return (
            <button
              key={w}
              type="button"
              onClick={() => void toggleWorkout(w)}
              className={`rounded-full px-2 py-[3px] text-[10px] transition-colors ${
                on
                  ? "bg-accent text-white"
                  : "border border-line bg-surface text-ink-3 hover:border-accent"
              }`}
            >
              {w}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- 饮食 ---------------- */

export function MealsCard({ date }: { date: string }) {
  const { t } = useTranslation();
  const [meal, setMeal] = useState<ApiMealDay | null>(null);
  const savedRef = useRef("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let alive = true;
    api
      .meals(date)
      .then((m) => {
        if (!alive) return;
        setMeal(m);
        savedRef.current = JSON.stringify(m);
        setState("idle");
      })
      .catch(() => alive && setMeal(null));
    return () => {
      alive = false;
    };
  }, [date]);

  useEffect(() => {
    if (!meal) return;
    const snap = JSON.stringify(meal);
    if (snap === savedRef.current) return;
    setState("saving");
    const timer = window.setTimeout(() => {
      api
        .saveMeals(date, {
          breakfast: meal.breakfast,
          lunch: meal.lunch,
          dinner: meal.dinner,
          snack: meal.snack,
        })
        .then(() => {
          savedRef.current = snap;
          setState("saved");
        })
        .catch(() => setState("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [meal, date]);

  const stateText =
    state === "saving"
      ? t("common.saving")
      : state === "saved"
        ? t("common.saved")
        : state === "error"
          ? t("common.saveFailed")
          : null;

  return (
    <Card title={t("meals.title")} action={stateText}>
      {SLOTS.map((slot) => (
        <label key={slot} className="mt-1.5 flex items-center gap-2 first:mt-0">
          <span className="w-7 shrink-0 text-[10px] text-ink-3">{t(`meals.${slot}`)}</span>
          <input
            value={meal?.[slot] ?? ""}
            onChange={(e) =>
              setMeal((prev) => (prev ? { ...prev, [slot]: e.target.value } : prev))
            }
            placeholder={t(`meals.${slot}Hint`)}
            className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-1 text-[11.5px] text-ink-2 outline-none placeholder:text-[#c8c4bc]"
          />
        </label>
      ))}
    </Card>
  );
}
