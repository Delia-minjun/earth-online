import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiFocusSession, type ApiTask } from "../api";

const PRESETS = [25, 45, 60, 0]; // 0 = 正计时

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* 浏览器不给放就不放 */
  }
}

/** 番茄钟弹窗：开始 → 按时间戳倒计时 → 完成确认才写时间块与发币 */
export function FocusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<ApiFocusSession | null>(null);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [minutes, setMinutes] = useState(25);
  const [taskId, setTaskId] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rung = useRef(false);

  const load = useCallback(async () => {
    const [a, day] = await Promise.all([api.focusActive(), api.day()]);
    setActive(a);
    setTasks(day.tasks.filter((x) => x.status !== "done"));
  }, []);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    rung.current = false;
    void load().catch(() => undefined);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const elapsed = active ? (now - new Date(active.started_at).getTime()) / 1000 : 0;
  const planned = (active?.planned_min ?? 0) * 60;
  const remain = planned > 0 ? planned - elapsed : 0;
  const over = planned > 0 && remain <= 0;

  useEffect(() => {
    if (open && over && !rung.current) {
      rung.current = true;
      beep();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(t("focus.doneTitle"));
      }
    }
  }, [open, over, t]);

  const start = async () => {
    setBusy(true);
    try {
      const s = await api.focusStart({ plannedMin: minutes, taskId: taskId || null });
      setActive(s);
      setMsg(null);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const done = await api.focusFinish(active.id);
      setActive(null);
      setMsg(t("focus.finished", { min: Math.floor((done.actual_sec ?? 0) / 60), n: done.coins }));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const voidIt = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await api.focusVoid(active.id);
      setActive(null);
      setMsg(t("focus.voided"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-ink">{t("focus.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] leading-none text-ink-3 transition-colors hover:text-ink"
            aria-label="close"
          >
            ✕
          </button>
        </header>

        {active ? (
          <div className="mt-3 text-center">
            <p className="text-[44px] font-semibold leading-none tabular-nums text-ink">
              {planned > 0 ? fmt(over ? elapsed : remain) : fmt(elapsed)}
            </p>
            <p className="mt-1 text-[10px] text-ink-3">
              {planned > 0
                ? over
                  ? t("focus.overtime")
                  : t("focus.remaining")
                : t("focus.countUp")}
              {active.planned_min > 0 ? ` · ${t("focus.planned", { n: active.planned_min })}` : ""}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => void voidIt()}
                disabled={busy}
                className="rounded-full border border-line px-3 py-1.5 text-[11px] text-ink-2 transition-colors hover:border-warn hover:text-warn disabled:opacity-50"
              >
                {t("focus.giveUp")}
              </button>
              <button
                type="button"
                onClick={() => void finish()}
                disabled={busy}
                className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {t("focus.finish")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex gap-1.5">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`flex-1 rounded-full px-2 py-1.5 text-[10.5px] transition-colors ${
                    minutes === m
                      ? "bg-accent text-white"
                      : "border border-line bg-surface text-ink-3 hover:border-accent"
                  }`}
                >
                  {m === 0 ? t("focus.countUpShort") : `${m}′`}
                </button>
              ))}
            </div>

            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] text-ink-2 outline-none"
            >
              <option value="">{t("focus.noTask")}</option>
              {tasks.map((t2) => (
                <option key={t2.id} value={t2.id}>
                  {t2.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void start()}
              disabled={busy}
              className="mt-3 w-full rounded-full bg-accent py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {t("focus.start")}
            </button>
          </>
        )}

        {msg ? <p className="mt-2 text-center text-[10px] text-ink-3">{msg}</p> : null}
      </div>
    </div>
  );
}
