import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiWorkout } from "../api";
import { Card } from "./Card";

/** 常用锻炼类型，点一下即可填入 */
const TAGS = ["有氧", "臀腿", "肩背", "燃脂", "手臂", "拉伸"];
const TAGS_EN = ["Cardio", "Legs", "Back", "Fat burn", "Arms", "Stretch"];

type Draft = { name: string; tag: string; minutes: number; note: string };
const EMPTY: Draft = { name: "", tag: TAGS[0]!, minutes: 30, note: "" };

/** 锻炼卡片：一天可以记多条，点条目可改，× 删除 */
export function WorkoutCard({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language === "zh-CN";
  const tags = zh ? TAGS : TAGS_EN;

  const [rows, setRows] = useState<ApiWorkout[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.workouts(date));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const startAdd = () => {
    setEditing(null);
    setDraft(EMPTY);
    setError(null);
    setOpen(true);
  };

  const startEdit = (row: ApiWorkout) => {
    setEditing(row.id);
    setDraft({
      name: row.name,
      tag: row.tag ?? tags[0]!,
      minutes: row.minutes,
      note: row.note ?? "",
    });
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      const payload = {
        name,
        tag: draft.tag || null,
        minutes: Number.isFinite(draft.minutes) ? draft.minutes : 0,
        note: draft.note.trim() || null,
      };
      if (editing) await api.updateWorkout(editing, payload);
      else await api.addWorkout({ date, ...payload });
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteWorkout(id);
    await load();
  };

  const total = rows.reduce((s, r) => s + r.minutes, 0);

  return (
    <Card
      title={t("workout.title")}
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
      {rows.length ? (
        <ul className="divide-y divide-line-2">
          {rows.map((r) => (
            <li key={r.id} className="group flex items-center gap-2 py-1.5">
              <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-[1px] text-[9px] text-ink-2">
                {r.tag ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => startEdit(r)}
                className="min-w-0 flex-1 truncate text-left text-[11.5px] text-ink-2 hover:text-ink"
              >
                {r.name}
                {r.note ? <span className="text-ink-3"> · {r.note}</span> : null}
              </button>
              <span className="shrink-0 text-[10px] tabular-nums text-ink-3">{r.minutes}′</span>
              <button
                type="button"
                onClick={() => void remove(r.id)}
                className="shrink-0 self-center text-[11px] leading-none text-[#a9a49b] opacity-100 transition-colors hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                aria-label="delete"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1 text-[10.5px] text-[#c8c4bc]">{t("workout.empty")}</p>
      )}

      {rows.length ? (
        <p className="mt-1.5 text-[9.5px] tabular-nums text-ink-3">
          {t("workout.total")} {total} {t("today.min")}
        </p>
      ) : null}

      {error ? <p className="mt-1 text-[9.5px] text-warn">{error}</p> : null}

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
                {editing ? t("workout.editTitle") : t("workout.addTitle")}
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
              placeholder={t("workout.namePlaceholder")}
              className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-[#c8c4bc]"
            />

            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, tag }))}
                  className={`rounded-full px-2 py-[3px] text-[10px] transition-colors ${
                    draft.tag === tag
                      ? "bg-accent text-white"
                      : "border border-line bg-surface text-ink-3 hover:border-accent"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                inputMode="numeric"
                value={String(draft.minutes)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, minutes: Number(e.target.value.replace(/\D/g, "")) || 0 }))
                }
                className="w-16 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] tabular-nums text-ink outline-none"
              />
              <span className="text-[10px] text-ink-3">{t("today.min")}</span>
            </div>

            <input
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder={t("workout.notePlaceholder")}
              className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11px] text-ink-2 outline-none placeholder:text-[#c8c4bc]"
            />

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
                disabled={busy || !draft.name.trim()}
                className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
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
