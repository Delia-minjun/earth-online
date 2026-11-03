import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiBudget, type ApiCategory, type ApiMoneyCategory } from "../api";
import { Card } from "./Card";

/* ---------------- 月度预算 ---------------- */

export function BudgetCard() {
  const { t } = useTranslation();
  const [budget, setBudget] = useState<ApiBudget | null>(null);
  const [total, setTotal] = useState("");
  const [detail, setDetail] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cats, setCats] = useState<ApiMoneyCategory[]>([]);

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([api.budget(), api.moneyCategories()]);
    setBudget(b);
    setTotal(b.total ? String(b.total) : "");
    setCats(c.filter((x) => x.kind === "expense"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: ApiBudget) => {
    setState("saving");
    try {
      setBudget(await api.saveBudget(next));
      setState("saved");
    } catch {
      setState("error");
    }
  };

  const commitTotal = async () => {
    const value = Number(total);
    if (!Number.isFinite(value) || value < 0) return;
    await save({ total: value, byCategory: budget?.byCategory ?? {} });
  };

  const setCap = async (id: string, value: string) => {
    const num = Number(value);
    const next = { ...(budget?.byCategory ?? {}) };
    if (!value.trim() || !Number.isFinite(num) || num <= 0) delete next[id];
    else next[id] = num;
    await save({ total: budget?.total ?? 0, byCategory: next });
  };

  return (
    <Card
      title={t("budget.title")}
      action={
        state === "saving"
          ? t("common.saving")
          : state === "saved"
            ? t("common.saved")
            : state === "error"
              ? t("common.saveFailed")
              : null
      }
    >
      <p className="text-[10.5px] leading-relaxed text-ink-3">{t("budget.hint")}</p>
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-ink-2">
          {t("budget.monthly")}
          <input
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            onBlur={() => void commitTotal()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitTotal();
            }}
            placeholder="0"
            className="w-24 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] tabular-nums text-ink outline-none placeholder:text-[#c8c4bc]"
          />
        </label>
        <button
          type="button"
          onClick={() => setDetail((v) => !v)}
          className="ml-auto text-[10px] text-ink-3 underline decoration-dotted hover:text-accent"
        >
          {detail ? t("money.collapse") : t("budget.perCategory")}
        </button>
      </div>

      {detail ? (
        <ul className="mt-2 space-y-1">
          {cats.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[11px]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: c.color ?? "#d8d4cc" }}
              />
              <span className="w-14 shrink-0 text-ink-3">{c.name}</span>
              <input
                inputMode="decimal"
                defaultValue={budget?.byCategory?.[c.id] ? String(budget.byCategory[c.id]) : ""}
                onBlur={(e) => void setCap(c.id, e.target.value)}
                placeholder={t("budget.noCap")}
                className="w-20 rounded-lg border border-line bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-ink outline-none placeholder:text-[#c8c4bc]"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/* ---------------- 类别字典 ---------------- */

function NameColorRow({
  name,
  color,
  onRename,
  onRecolor,
  onDelete,
}: {
  name: string;
  color: string;
  onRename: (v: string) => void;
  onRecolor: (v: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  return (
    <li className="group flex items-center gap-1.5 py-1">
      <input
        type="color"
        value={color}
        onChange={(e) => onRecolor(e.target.value)}
        className="h-5 w-5 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
        aria-label="color"
      />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft.trim();
          if (v && v !== name) onRename(v);
          else setDraft(name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[11.5px] text-ink outline-none hover:bg-surface-2 focus:bg-surface-2"
      />
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-[11px] text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
        aria-label="delete"
      >
        ×
      </button>
    </li>
  );
}

export function CategoriesCard() {
  const { t } = useTranslation();
  const [blocks, setBlocks] = useState<ApiCategory[]>([]);
  const [money, setMoney] = useState<ApiMoneyCategory[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, m] = await Promise.all([api.categories(), api.moneyCategories()]);
    setBlocks(b);
    setMoney(m);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addBlock = async () => {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    await api.addCategory({ name });
    await load();
  };

  const removeBlock = async (id: string) => {
    try {
      await api.deleteCategory(id);
      await load();
      setError(null);
    } catch (e) {
      setError((e as Error).message.includes("in use") ? t("categories.inUse") : (e as Error).message);
    }
  };

  return (
    <Card title={t("categories.title")}>
      <p className="text-[10.5px] leading-relaxed text-ink-3">{t("categories.hint")}</p>

      <h3 className="mt-3 text-[10px] uppercase tracking-[0.12em] text-ink-3">
        {t("categories.blocks")}
      </h3>
      <ul className="mt-1">
        {blocks.map((c) => (
          <NameColorRow
            key={c.id}
            name={c.name}
            color={c.color}
            onRename={(v) => void api.patchCategory(c.id, { name: v }).then(load)}
            onRecolor={(v) => void api.patchCategory(c.id, { color: v }).then(load)}
            onDelete={() => void removeBlock(c.id)}
          />
        ))}
      </ul>

      <h3 className="mt-3 text-[10px] uppercase tracking-[0.12em] text-ink-3">
        {t("categories.money")}
      </h3>
      <ul className="mt-1">
        {money.map((c) => (
          <NameColorRow
            key={c.id}
            name={c.name}
            color={c.color ?? "#9BA7B0"}
            onRename={(v) => void api.patchMoneyCategory(c.id, { name: v }).then(load)}
            onRecolor={(v) => void api.patchMoneyCategory(c.id, { color: v }).then(load)}
            onDelete={() => void api.deleteMoneyCategory(c.id).then(load)}
          />
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-2 border-t border-line-2 pt-2">
        <span className="text-[10px] text-[#c8c4bc]">＋</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addBlock();
          }}
          placeholder={t("categories.addPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
        />
      </div>

      {error ? <p className="mt-1.5 text-[10px] text-warn">{error}</p> : null}
    </Card>
  );
}
