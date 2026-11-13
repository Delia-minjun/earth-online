import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, COURSE_COLOR, hhmm, type ApiDay, type ApiFocusSession, type ApiWeekBlock } from "../api";
import { BlockEditor } from "./BlockEditor";
import { FocusModal } from "./FocusModal";

/**
 * 右侧时间轴栏：显示今天的时间块与课程。
 * 三个段落（今日/本周/本月）共用同一条固定栏，所以自己取数。
 * 新建/修改日程走弹窗，保持这里只是一条时间线。
 */
export function TimelineRail() {
  const { t } = useTranslation();
  const [day, setDay] = useState<ApiDay | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiWeekBlock | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focus, setFocus] = useState<ApiFocusSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.day();
      setDay(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.focusActive().then(setFocus).catch(() => undefined);
  }, [focusOpen]);

  const remove = async (id: string) => {
    await api.deleteBlock(id);
    await load();
  };

  const weekBlocks: ApiWeekBlock[] = (day?.blocks ?? []).map((b) => ({
    id: b.id,
    date: day?.date ?? "",
    start_min: b.start_min,
    end_min: b.end_min,
    title: b.title,
    category_id: b.category_id,
    category_color: b.category_color,
    note: b.note,
  }));

  return (
    <aside
      data-tour="rail"
      className="min-[1150px]:col-start-3 min-[1150px]:row-span-3 min-[1150px]:row-start-1 min-[1150px]:sticky min-[1150px]:top-0 min-[1150px]:h-[calc(100vh-6rem)] min-[1150px]:self-start min-[1150px]:overflow-y-auto min-[1150px]:border-l min-[1150px]:border-line min-[1150px]:pl-5"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold text-ink">
          {t("today.timeline")}
          {focus ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent" /> : null}
        </h2>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="text-[14px] leading-none text-[#c2beb6] transition-colors hover:text-accent"
          aria-label={t("action.add")}
        >
          ＋
        </button>
      </header>

      {/* 番茄钟入口：整行按钮，别再藏在小字里 */}
      <button
        type="button"
        onClick={() => setFocusOpen(true)}
        className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11.5px] transition-colors ${
          focus
            ? "border-accent bg-accent-soft font-semibold text-accent"
            : "border-line bg-surface-2 text-ink-2 hover:border-accent hover:text-accent"
        }`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="13.5" r="7.5" />
          <path d="M12 10v3.5l2.5 2" />
          <path d="M9.5 2.5h5" />
        </svg>
        {focus ? t("focus.running") : t("focus.startShort")}
      </button>

      <FocusModal
        open={focusOpen}
        onClose={() => {
          setFocusOpen(false);
          void load();
        }}
      />

      {error ? <p className="mt-2 text-[10px] text-warn">{error}</p> : null}

      <ul className="mt-3">
        {(day?.courses ?? []).map((c) => (
          <li key={`course-${c.id}`} className="flex gap-3 py-2 first:pt-0">
            <span className="w-10 shrink-0 pt-0.5 text-[10px] tabular-nums text-ink-3">
              {hhmm(c.start_min)}
            </span>
            <span className="w-[3px] shrink-0 rounded-full" style={{ background: COURSE_COLOR }} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-[12px] text-ink-2">{c.name}</p>
              <p className="mt-0.5 text-[10px] text-ink-3">
                {hhmm(c.start_min)}–{hhmm(c.end_min)}
                {c.location ? ` · ${c.location}` : ""} · {t("today.course")}
              </p>
            </div>
          </li>
        ))}

        {weekBlocks.map((b) => (
          <li
            key={b.id}
            onClick={() => setEditing(b)}
            title={t("block.editHint")}
            className="group flex cursor-pointer gap-3 rounded-lg py-2 transition-colors first:pt-0 hover:bg-surface-2"
          >
            <span className="w-10 shrink-0 pt-0.5 text-[10px] tabular-nums text-ink-3">
              {hhmm(b.start_min)}
            </span>
            <span
              className="w-[3px] shrink-0 rounded-full"
              style={{ background: b.category_color ?? "#d8d4cc" }}
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-[12px] text-ink">{b.title}</p>
              <p className="mt-0.5 text-[10px] text-ink-3">
                {hhmm(b.start_min)}–{hhmm(b.end_min)} · {b.end_min - b.start_min} {t("today.min")}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void remove(b.id);
              }}
              className="shrink-0 self-center text-[12px] leading-none text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
              aria-label="delete"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <BlockEditor
        open={createOpen || editing !== null}
        date={editing?.date ?? day?.date ?? ""}
        blocks={weekBlocks}
        courses={day?.courses ?? []}
        editing={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={() => void load()}
      />
    </aside>
  );
}
