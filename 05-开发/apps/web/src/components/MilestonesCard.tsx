import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiAreaGrowth, type ApiMilestone } from "../api";

type StepDraft = { id?: string; title: string; months: string; removed?: boolean };

/** 里程碑：每个阶段目标一张卡，卡内带小目标 */
export function MilestonesCard({ areas }: { areas: ApiAreaGrowth[] }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ApiMilestone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepDrafts, setStepDrafts] = useState<StepDraft[]>([]);

  // 新建/编辑共用
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", areaId: "", months: "" });

  const [inlineStep, setInlineStep] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setItems(await api.milestones());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dayIndex = (createdAt: string) => {
    const start = new Date(`${createdAt.slice(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1);
  };

  const openCreate = () => {
    setEditingId(null);
    setDraft({ title: "", areaId: "", months: "" });
    setStepDrafts([{ title: "", months: "" }]);
    setFormOpen(true);
  };

  const openEdit = (m: ApiMilestone) => {
    setEditingId(m.id);
    setDraft({ title: m.title, areaId: m.area_id ?? "", months: m.months ? String(m.months) : "" });
    setStepDrafts(
      (m.steps ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        months: s.months ? String(s.months) : "",
      })),
    );
    setFormOpen(true);
  };

  const submitForm = async () => {
    const title = draft.title.trim();
    if (!title) return;
    setBusy(true);
    try {
      const months = draft.months ? Number(draft.months) : null;
      const kept = stepDrafts.filter((s) => s.title.trim());

      if (!editingId) {
        await api.addMilestone({
          title,
          areaId: draft.areaId || undefined,
          months,
          steps: kept.map((s) => ({ title: s.title.trim(), months: s.months ? Number(s.months) : null })),
        });
      } else {
        const current = items.find((x) => x.id === editingId);
        await api.updateMilestone(editingId, {
          title,
          areaId: draft.areaId || null,
          months,
        });

        // 删掉被移出的小目标
        const keptIds = new Set(kept.map((s) => s.id).filter(Boolean));
        for (const old of current?.steps ?? []) {
          if (!keptIds.has(old.id)) await api.deleteStep(old.id);
        }
        // 更新已有的、新增没有 id 的
        for (const s of kept) {
          const smonths = s.months ? Number(s.months) : null;
          if (s.id) {
            await api.updateStep(s.id, {
              done: Boolean(current?.steps.find((x) => x.id === s.id)?.done_at),
              title: s.title.trim(),
              months: smonths,
            });
          } else {
            await api.addStep(editingId, s.title.trim(), smonths);
          }
        }
      }

      setFormOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2.5">
      <header className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink">{t("growth.milestones")}</h2>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full border border-line px-2 py-[1px] text-[9px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
        >
          ＋
        </button>
      </header>

      {error ? <p className="text-[10px] text-warn">{error}</p> : null}

      {items.map((m) => {
        const done = Boolean(m.done_at);
        const steps = m.steps ?? [];
        const doneSteps = steps.filter((s) => s.done_at).length;

        return (
          <div
            key={m.id}
            className="rounded-2xl border border-line bg-surface p-3 shadow-[0_6px_20px_-14px_rgba(88,82,72,0.5)]"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={async () => {
                  await api.updateMilestone(m.id, { done: !done });
                  await load();
                }}
                aria-label={done ? t("growth.markUndone") : t("growth.markDone")}
                className={`mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] leading-none transition-colors ${
                  done
                    ? "border-accent bg-accent text-white"
                    : "border-[#cfc9be] text-transparent hover:border-accent"
                }`}
              >
                ✓
              </button>

              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[11.5px] ${done ? "text-ink-3 line-through" : "text-ink"}`}
                >
                  {m.title}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-ink-3">
                  {m.area_id ? (
                    <span className="flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: m.area_color ?? "#9BA7B0" }}
                      />
                      {m.area_name}
                    </span>
                  ) : null}
                  {steps.length ? (
                    <span className="tabular-nums">
                      {doneSteps}/{steps.length}
                    </span>
                  ) : null}
                  {m.months ? (
                    <span className="tabular-nums">{t("growth.monthsN", { n: m.months })}</span>
                  ) : null}
                  <span className="tabular-nums">{t("growth.dayN", { n: dayIndex(m.created_at) })}</span>
                </p>
              </div>

              {!done && m.coins > 0 ? (
                <span className="mt-[2px] shrink-0 rounded-full bg-accent-soft px-1.5 py-[1px] text-[9px] tabular-nums text-accent">
                  +{m.coins}
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => openEdit(m)}
                className="mt-[1px] shrink-0 text-[11px] leading-none text-[#c0bbb2] transition-colors hover:text-accent"
                aria-label={t("growth.editMilestone")}
                title={t("growth.editMilestone")}
              >
                ✎
              </button>
              <button
                type="button"
                onClick={async () => {
                  await api.deleteMilestone(m.id);
                  await load();
                }}
                className="mt-[1px] shrink-0 text-[11px] leading-none text-[#c0bbb2] transition-colors hover:text-warn"
                aria-label="delete"
              >
                ×
              </button>
            </div>

            {steps.length ? (
              <ul className="mt-1.5 ml-[7px] space-y-1 border-l border-line-2 pl-3">
                {steps.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        await api.updateStep(s.id, { done: !s.done_at });
                        await load();
                      }}
                      className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border text-[8px] leading-none ${
                        s.done_at
                          ? "border-accent bg-accent text-white"
                          : "border-[#d5cfc4] text-transparent hover:border-accent"
                      }`}
                    >
                      ✓
                    </button>
                    <span
                      className={`min-w-0 flex-1 truncate text-[10.5px] ${
                        s.done_at ? "text-ink-3 line-through" : "text-ink-2"
                      }`}
                    >
                      {s.title}
                    </span>
                    {s.months ? (
                      <span className="shrink-0 text-[9px] tabular-nums text-ink-3">
                        {t("growth.monthsN", { n: s.months })}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-[9px] tabular-nums text-ink-3">
                      {t("growth.dayN", { n: dayIndex(s.created_at) })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-1.5 ml-[7px] border-l border-line-2 pl-3">
              <input
                value={inlineStep[m.id] ?? ""}
                onChange={(e) => setInlineStep((v) => ({ ...v, [m.id]: e.target.value }))}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && (inlineStep[m.id] ?? "").trim()) {
                    await api.addStep(m.id, (inlineStep[m.id] ?? "").trim());
                    setInlineStep((v) => ({ ...v, [m.id]: "" }));
                    await load();
                  }
                }}
                placeholder={t("growth.addStep")}
                className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1 text-[10.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
              />
            </div>
          </div>
        );
      })}

      {items.length === 0 ? (
        <p className="text-[10px] text-[#c8c4bc]">{t("growth.noMilestone")}</p>
      ) : null}

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-20"
          onClick={() => setFormOpen(false)}
        >
          <div
            className="max-h-[78vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">
                {editingId ? t("growth.editMilestone") : t("growth.newMilestone")}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-[13px] text-ink-3"
              >
                ✕
              </button>
            </header>

            <div className="mt-3 space-y-1.5">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={t("growth.milestoneTitle")}
                className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
              />
              <div className="flex gap-1.5">
                <select
                  value={draft.areaId}
                  onChange={(e) => setDraft({ ...draft, areaId: e.target.value })}
                  className="w-1/2 rounded-lg border border-line bg-surface-2 px-1.5 py-1.5 text-[11px] text-ink-2 outline-none"
                >
                  <option value="">{t("growth.noAreaPick")}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.months}
                  onChange={(e) => setDraft({ ...draft, months: e.target.value })}
                  className="w-1/2 rounded-lg border border-line bg-surface-2 px-1.5 py-1.5 text-[11px] text-ink-2 outline-none"
                >
                  <option value="">{t("growth.noDuration")}</option>
                  {[1, 2, 3, 4, 6, 9, 12, 18].map((n) => (
                    <option key={n} value={String(n)}>
                      {t("growth.monthsN", { n })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                {stepDrafts.map((val, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={val.title}
                      onChange={(e) =>
                        setStepDrafts((list) =>
                          list.map((v, k) => (k === i ? { ...v, title: e.target.value } : v)),
                        )
                      }
                      placeholder={t("growth.stepPlaceholder")}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none placeholder:text-[#c8c4bc]"
                    />
                    <select
                      value={val.months}
                      onChange={(e) =>
                        setStepDrafts((list) =>
                          list.map((v, k) => (k === i ? { ...v, months: e.target.value } : v)),
                        )
                      }
                      className="w-[74px] shrink-0 rounded-lg border border-line bg-surface-2 px-1 py-1.5 text-[10.5px] text-ink-2 outline-none"
                    >
                      <option value="">{t("growth.noDurationShort")}</option>
                      {[1, 2, 3, 4, 6, 9, 12].map((n) => (
                        <option key={n} value={String(n)}>
                          {t("growth.monthsN", { n })}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setStepDrafts((list) => list.filter((_, k) => k !== i))}
                      className="shrink-0 text-[11px] leading-none text-[#c8c4bc] hover:text-warn"
                      aria-label="remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {stepDrafts.length < 8 ? (
                  <button
                    type="button"
                    onClick={() => setStepDrafts((list) => [...list, { title: "", months: "" }])}
                    className="text-[10px] text-ink-3 transition-colors hover:text-accent"
                  >
                    ＋ {t("growth.addStepShort")}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submitForm()}
                disabled={busy || !draft.title.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
