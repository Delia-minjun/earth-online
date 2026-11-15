import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiMilestone, type ApiAreaGrowth } from "../api";
import { Card } from "../components/Card";

/** 里程碑：阶段目标 + 少量可验证小步 */
export function MilestonesCard({ areas }: { areas: ApiAreaGrowth[] }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ApiMilestone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
    const [stepDraft, setStepDraft] = useState("");

  const [draft, setDraft] = useState({ title: "", areaId: "", months: "" });
  const [stepDrafts, setStepDrafts] = useState<string[]>([""]);

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

  const submit = async () => {
    const title = draft.title.trim();
    if (!title) return;
    setBusy(true);
    try {
      const steps = stepDrafts.map((s) => s.trim()).filter(Boolean).slice(0, 8);
      await api.addMilestone({
        title,
        areaId: draft.areaId || undefined,
        months: draft.months ? Number(draft.months) : null,
        steps: steps.length ? steps : undefined,
      });
      setDraft({ title: "", areaId: "", months: "" });
      setStepDrafts([""]);
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 已经进行到第几天（从创建日算起，当天算第 1 天） */
  const dayIndex = (createdAt: string) => {
    const start = new Date(`${createdAt.slice(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1);
  };

  return (
    <Card
      title={t("growth.milestones")}
      action={
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-line px-2 py-[1px] text-[9px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
        >
          ＋
        </button>
      }
    >
      {error ? <p className="mb-2 text-[10px] text-warn">{error}</p> : null}

      <ul className="divide-y divide-line-2">
        {items.map((m) => {
          const done = Boolean(m.done_at);
          const steps = m.steps ?? [];
          const doneSteps = steps.filter((s) => s.done_at).length;

          return (
            <li key={m.id} className="py-2 first:pt-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await api.updateMilestone(m.id, { done: !done });
                    await load();
                  }}
                  aria-label={done ? t("growth.markUndone") : t("growth.markDone")}
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] leading-none transition-colors ${
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
                    <span className="tabular-nums">
                      {t("growth.dayN", { n: dayIndex(m.created_at) })}
                    </span>
                  </p>
                </div>

                {!done && m.coins > 0 ? (
                  <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-[1px] text-[9px] tabular-nums text-accent">
                    +{m.coins}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={async () => {
                    await api.deleteMilestone(m.id);
                    await load();
                  }}
                  className="shrink-0 text-[11px] leading-none text-[#c0bbb2] transition-colors hover:text-warn"
                  aria-label="delete"
                >
                  ×
                </button>
              </div>

              {steps.length || stepDraft ? (
                <div className="mt-1.5 ml-[7px] border-l border-line-2 pl-3">
                  <ul className="space-y-1">
                    {steps.map((s) => (
                      <li key={s.id} className="relative flex items-center gap-1.5">
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
                        <button
                          type="button"
                          onClick={async () => {
                            await api.deleteStep(s.id);
                            await load();
                          }}
                          className="shrink-0 text-[10px] text-[#c8c4bc] hover:text-warn"
                          aria-label="delete"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      value={stepDraft}
                      onChange={(e) => setStepDraft(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && stepDraft.trim()) {
                          await api.addStep(m.id, stepDraft.trim());
                          setStepDraft("");
                          await load();
                        }
                      }}
                      placeholder={t("growth.addStep")}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[10.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
                    />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="py-1.5 text-[10px] text-[#c8c4bc]">{t("growth.noMilestone")}</li>
        ) : null}
      </ul>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-20"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">{t("growth.newMilestone")}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-ink-3">
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

              {/* 小目标：一行一个输入，可增删 */}
              <div className="space-y-1">
                {stepDrafts.map((val, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="shrink-0 text-[10px] text-[#c0bbb2]">└</span>
                    <input
                      value={val}
                      onChange={(e) =>
                        setStepDrafts((list) => list.map((v, k) => (k === i ? e.target.value : v)))
                      }
                      placeholder={t("growth.stepPlaceholder")}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none placeholder:text-[#c8c4bc]"
                    />
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
                    onClick={() => setStepDrafts((list) => [...list, ""])}
                    className="text-[10px] text-ink-3 transition-colors hover:text-accent"
                  >
                    ＋ {t("growth.addStep")}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-1.5">
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
                disabled={busy || !draft.title.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
