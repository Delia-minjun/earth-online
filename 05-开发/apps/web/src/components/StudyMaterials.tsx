import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  type ApiCard,
  type ApiMaterial,
  type ApiPractice,
  type ApiStudyNote,
} from "../api";
import { Card } from "../components/Card";
import { NoteMarkdown } from "./NoteMarkdown";
import { correctOptionLetter, splitQuestion } from "../lib/questionText";
import { chapterSortKey, guessChapter } from "../lib/chapter";

type Role = "knowledge" | "questions";

interface ChapterGroup {
  chapter: string | null;
  materials: ApiMaterial[];
  cards: number;
}

/** 课程资料：按章节分组，每章分别出知识卡 / 练习题 */
export function StudyMaterials({
  subjectId,
  materials,
  cards,
  notes,
  practices,
  wrongItems,
  onAddWrong,
  busy,
  onUpload,
  onChanged,
}: {
  subjectId: string;
  materials: ApiMaterial[];
  cards: ApiCard[];
  notes: ApiStudyNote[];
  practices: ApiPractice[];
  wrongItems: { question: string; id: string }[];
  onAddWrong: (item: { chapter: string | null; question: string; answer: string; ref: string | null }) => Promise<void>;
  busy: boolean;
  onUpload: (files: FileList | File[], role: Role, chapter: string | null) => Promise<void>;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState<Role>("knowledge");
  /** 可能同时跑「知识卡」和「练习题」，所以是集合而不是单值 */
  const [generating, setGenerating] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [openPractice, setOpenPractice] = useState<string | null>(null);
  /** 允许多题同时展开，值为 `${practiceId}-${index}` */
  const [openAnswers, setOpenAnswers] = useState<string[]>([]);
  /** 选择题的勾选：${practiceId}-${题号} → 选项序号 */
  const [choices, setChoices] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  /** 章节内的 ＋ 上传：指定章节与类别 */
  const chapterFileRef = useRef<HTMLInputElement>(null);
  const [chapterTarget, setChapterTarget] = useState<string | null>(null);
  /** 正在移动章节的资料 */
  const [moving, setMoving] = useState<ApiMaterial | null>(null);
  const [moveDraft, setMoveDraft] = useState("");
  const [over, setOver] = useState(false);

  const groups = useMemo<ChapterGroup[]>(() => {
    const map = new Map<string, ChapterGroup>();
    for (const m of materials) {
      const key = m.chapter ?? "";
      const g = map.get(key) ?? { chapter: m.chapter ?? null, materials: [], cards: 0 };
      g.materials.push(m);
      map.set(key, g);
    }
    for (const c of cards) {
      const key = c.chapter ?? "";
      const g = map.get(key);
      if (g) g.cards += 1;
    }
    return [...map.values()].sort((a, b) => chapterSortKey(a.chapter) - chapterSortKey(b.chapter));
  }, [materials, cards]);

  const cardBreakdown = (g: ChapterGroup) => {
    const k = cards.filter((c) => (c.chapter ?? null) === g.chapter && c.kind === "knowledge").length;
    const q = cards.filter((c) => (c.chapter ?? null) === g.chapter && c.kind === "questions").length;
    const parts: string[] = [];
    if (k) parts.push(`${t("study.knowledge")} ${k}`);
    if (q) parts.push(`${t("study.questions")} ${q}`);
    if (!k && !q && g.cards) parts.push(t("study.cardCount", { n: g.cards }));
    return parts.join(" · ");
  };

  /** 题目下方的胶囊按钮统一尺寸，避免两个按钮高低不齐 */
  const PILL = "inline-flex h-[22px] items-center rounded-full border px-2.5 text-[10px] leading-none transition-colors";

  const chapterLabel = (chapter: string | null) =>
    chapter
      ? /^l/i.test(chapter)
        ? t("study.lectureN", { n: chapter.slice(1) })
        : t("study.chapterN", { n: chapter })
      : t("study.noChapter");

  const generate = async (chapter: string | null, which: Role) => {
    const key = `${chapter ?? ""}:${which}`;
    setGenerating((list) => [...list, key]);
    setError(null);
    try {
      const res = await api.generateSection(subjectId, which, chapter, 8);
      setToast(
        t("study.generatedN", {
          n: res.cards.length,
          chapter: chapter ? chapterLabel(chapter) : t("study.noChapter"),
          kind: which === "knowledge" ? t("study.knowledge") : t("study.questions"),
        }),
      );
      window.setTimeout(() => setToast(null), 3000);
      await onChanged();
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes("no_material")
          ? t("study.generateNeedFile")
          : msg.includes("NOKEY")
            ? t("study.noKey")
            : msg,
      );
    } finally {
      setGenerating((list) => list.filter((k) => k !== key));
    }
  };

  /** 生成本章讲解（知识点 + 易错点），不是出题 */
  const genNote = async (chapter: string | null) => {
    const key = `note:${chapter ?? ""}`;
    setGenerating((list) => [...list, key]);
    setError(null);
    try {
      await api.generateNote(subjectId, chapter);
      setToast(t("study.noteReady"));
      window.setTimeout(() => setToast(null), 3000);
      setOpenNote(chapter ?? "");
      await onChanged();
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes("no_material") ? t("study.noteGenFailed") : msg.includes("NOKEY") ? t("study.noKey") : msg,
      );
    } finally {
      setGenerating((list) => list.filter((k) => k !== key));
    }
  };

  /** 生成整章练习：参考资料题型，出整套题 + 答案解析 */
  const genPractice = async (chapter: string | null) => {
    const key = `practice:${chapter ?? ""}`;
    setGenerating((list) => [...list, key]);
    setError(null);
    try {
      const res = await api.generatePractice(subjectId, chapter, 10);
      setToast(t("study.practiceReady") + ` · ${t("study.questionN", { n: res.count })}`);
      window.setTimeout(() => setToast(null), 3000);
      setOpenPractice(chapter ?? "");
      setOpenAnswers([]);
      await onChanged();
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes("no_material")
          ? t("study.practiceFailed")
          : msg.includes("NOKEY")
            ? t("study.noKey")
            : msg,
      );
    } finally {
      setGenerating((list) => list.filter((k) => k !== key));
    }
  };

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    // 章节从文件名猜：Ch3 / 第3章 / 03 Homework / L5
    await onUpload(list, role, guessChapter(list[0]!.name));
  };

  return (
    <Card title={t("study.courseMaterials")}>
      <input
        ref={chapterFileRef}
        type="file"
        multiple
        accept=".pdf,.docx,.pptx,.md,.markdown,.txt,image/*"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          e.target.value = "";
          if (!files?.length) return;
          const chapter = chapterTarget ? chapterTarget : null;
          void onUpload(files, role, chapter);
        }}
      />
      {toast ? (
        <p className="mb-2 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[10.5px] text-accent">{toast}</p>
      ) : null}
      {error ? <p className="mb-2 text-[10px] text-warn">{error}</p> : null}

      {/* 上传：先选类别与章节，再拖文件 */}
      <div className="rounded-xl border border-line-2 bg-surface-2 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center rounded-full border border-line bg-surface p-0.5">
            {(
              [
                ["knowledge", t("study.knowledge")],
                ["questions", t("study.questions")],
              ] as [Role, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRole(key)}
                className={`rounded-full px-2.5 py-[2px] text-[10px] transition-colors ${
                  role === key ? "bg-accent text-white" : "text-ink-3 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter") fileRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
          }}
          className={`mt-2 cursor-pointer rounded-lg border border-dashed px-3 py-2 text-center transition-colors ${
            over ? "border-accent bg-accent-soft/30" : "border-[#d5cfc4] bg-surface hover:border-accent"
          }`}
        >
          <p className="text-[10.5px] text-ink-2">{busy ? t("study.uploading") : t("study.dropHint")}</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.md,.markdown,.txt,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* 章节列表 */}
      <div className="mt-2.5 space-y-2">
        {groups.map((g) => {
          const hasKnowledge = g.materials.some((m) => (m.role ?? "knowledge") === "knowledge");
          const hasQuestions = g.materials.some((m) => m.role === "questions");
          const key = `${g.chapter ?? ""}`;
          const note = notes.find((n) => (n.chapter ?? null) === g.chapter);
          const practice = practices.find((p) => (p.chapter ?? null) === g.chapter);
          return (
            <section key={key} className="rounded-xl border border-line-2 p-2.5">
              <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {g.chapter ? (
                  <h3 className="text-[11px] font-semibold text-ink">{chapterLabel(g.chapter)}</h3>
                ) : null}
                <span className="text-[9.5px] text-ink-3">
                  {t("study.materialCount", { n: g.materials.length })}
                  {cardBreakdown(g) ? ` · ${cardBreakdown(g)}` : ""}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setChapterTarget(g.chapter ?? "");
                      chapterFileRef.current?.click();
                    }}
                    title={t("study.addToChapter")}
                    className="rounded-full border border-line px-[7px] py-[2px] text-[9.5px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    onClick={() => void genNote(g.chapter)}
                    disabled={busy || !hasKnowledge || generating.includes(`note:${key}`)}
                    className="rounded-full border border-line px-2 py-[2px] text-[9.5px] text-ink-3 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {generating.includes(`note:${key}`)
                      ? t("study.noteGenerating")
                      : note
                        ? t("study.regenNote")
                        : t("study.writeNote")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void genPractice(g.chapter)}
                    disabled={busy || !hasQuestions || generating.includes(`practice:${key}`)}
                    className="rounded-full border border-line px-2 py-[2px] text-[9.5px] text-ink-3 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {generating.includes(`practice:${key}`)
                      ? t("study.practiceGenerating")
                      : practice
                        ? t("study.regenPractice")
                        : t("study.practiceSet")}
                  </button>
                </span>
              </header>

              <ul className="mt-1.5 space-y-1">
                {g.materials.map((m) => (
                  <li key={m.id} className="group flex items-center gap-1.5">
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-[1px] text-[8.5px] ${
                        m.role === "questions"
                          ? "bg-warn-soft text-warn"
                          : "bg-accent-soft text-accent"
                      }`}
                    >
                      {m.role === "questions" ? t("study.questions") : t("study.knowledge")}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setMoving(m);
                        setMoveDraft(m.chapter ?? "");
                      }}
                      title={t("study.moveChapter")}
                      className="min-w-0 flex-1 truncate text-left text-[10.5px] text-ink-2 transition-colors hover:text-accent"
                    >
                      {m.title}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.deleteMaterial(m.id);
                        await onChanged();
                      }}
                      className="shrink-0 text-[11px] leading-none text-[#c0bbb2] transition-colors hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                      aria-label="delete"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>

              {note ? (
                <div className="mt-2 rounded-lg border border-line-2 bg-surface-2">
                  <button
                    type="button"
                    onClick={() => setOpenNote(openNote === key ? null : key)}
                    className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] text-ink-3 transition-colors hover:text-accent"
                  >
                    <span className="font-semibold text-ink-2">{t("study.chapterNote")}</span>
                    <span>{openNote === key ? t("study.noteClose") : t("study.noteOpen")}</span>
                  </button>
                  {openNote === key ? (
                    <div className="max-h-[62vh] overflow-y-auto border-t border-line-2 bg-surface px-4 py-3">
                      <NoteMarkdown
                        content={note.content}
                        onRewrite={async (heading) => {
                          setGenerating((list) => [...list, `sec:${note.id}`]);
                          try {
                            await api.regenNoteSection(note.id, heading);
                            await onChanged();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setGenerating((list) => list.filter((k) => k !== `sec:${note.id}`));
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {practice ? (
                <div className="mt-2 rounded-lg border border-line-2 bg-surface-2">
                  <button
                    type="button"
                    onClick={() => setOpenPractice(openPractice === key ? null : key)}
                    className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] text-ink-3 transition-colors hover:text-accent"
                  >
                    <span className="font-semibold text-ink-2">{t("study.genPractice")}</span>
                    <span>
                      {openPractice === key
                        ? t("study.practiceClose")
                        : `${t("study.practiceOpen")} · ${practice.items.length}`}
                    </span>
                  </button>
                  {openPractice === key ? (
                    <div className="border-t border-line-2 bg-surface">
                      <div className="flex items-center justify-between gap-2 border-b border-line-2 px-3 py-1.5">
                        <span className="text-[10px] tabular-nums text-ink-3">
                          {t("study.questionCount", { n: practice.items.length })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const keys = practice.items.map((_, i) => `${practice.id}-${i}`);
                            const allOpen = keys.every((k) => openAnswers.includes(k));
                            setOpenAnswers(allOpen ? [] : keys);
                          }}
                          className="text-[10px] text-ink-3 transition-colors hover:text-accent"
                        >
                          {practice.items.every((_, i) => openAnswers.includes(`${practice.id}-${i}`))
                            ? t("study.collapseAll")
                            : t("study.expandAll")}
                        </button>
                      </div>

                      <ol className="max-h-[72vh] space-y-3 overflow-y-auto px-3.5 py-3">
                        {practice.items.map((item, qi) => {
                          const ansKey = `${practice.id}-${qi}`;
                          const open = openAnswers.includes(ansKey);
                          const { stem, options } = splitQuestion(item.q);
                          return (
                            <li
                              key={ansKey}
                              className="rounded-xl border border-line-2 bg-surface-2 px-3.5 py-3"
                            >
                              <div className="flex gap-3">
                                <span className="mt-[2px] grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold tabular-nums text-accent">
                                  {qi + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="max-w-[70ch] text-[12.5px] leading-[1.9] text-ink-2">
                                    {stem}
                                  </p>
                                  {options.length ? (
                                    <ul className="mt-2 max-w-[70ch] space-y-1">
                                      {options.map((opt, oi) => {
                                        const letter = String.fromCharCode(65 + oi);
                                        const picked = choices[ansKey] === oi;
                                        const answered = choices[ansKey] !== undefined;
                                        const correct = correctOptionLetter(item.a) === letter;
                                        // 选错的选项标红，正确选项（无论是否选中）标绿
                                        const tone = !answered
                                          ? picked
                                            ? "border-accent bg-accent-soft text-ink"
                                            : "border-line bg-surface text-ink-2 hover:border-accent"
                                          : correct
                                            ? "border-[#8fae86] bg-[#eaf1e6] text-ink"
                                            : picked
                                              ? "border-[#c98b83] bg-[#f8e7e4] text-ink"
                                              : "border-line bg-surface text-ink-2";
                                        return (
                                          <li key={`${ansKey}-o${oi}`}>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setChoices((m) => ({ ...m, [ansKey]: oi }))
                                              }
                                              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-[5px] text-left text-[12px] leading-[1.7] transition-colors ${tone}`}
                                            >
                                              <span
                                                className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[9.5px] font-semibold tabular-nums ${
                                                  answered && correct
                                                    ? "border-[#8fae86] bg-[#8fae86] text-white"
                                                    : answered && picked
                                                      ? "border-[#c98b83] bg-[#c98b83] text-white"
                                                      : picked
                                                        ? "border-accent bg-accent text-white"
                                                        : "border-line text-ink-3"
                                                }`}
                                              >
                                                {letter}
                                              </span>
                                              <span className="flex-1">{opt}</span>
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  ) : null}

                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenAnswers((list) =>
                                        list.includes(ansKey)
                                          ? list.filter((k) => k !== ansKey)
                                          : [...list, ansKey],
                                      )
                                    }
                                    className={`${PILL} ${
                                      open
                                        ? "border-accent bg-accent-soft text-accent"
                                        : "border-line text-ink-3 hover:border-accent hover:text-accent"
                                    }`}
                                  >
                                    {open ? t("study.hideAnswer") : t("study.showAnswer")}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={generating.includes(`item:${ansKey}`)}
                                    onClick={async () => {
                                      setGenerating((list) => [...list, `item:${ansKey}`]);
                                      try {
                                        await api.regenPracticeItem(practice.id, qi);
                                        await onChanged();
                                      } catch (e) {
                                        setError((e as Error).message);
                                      } finally {
                                        setGenerating((list) => list.filter((k) => k !== `item:${ansKey}`));
                                      }
                                    }}
                                    className={`${PILL} border-line text-ink-3 hover:border-accent hover:text-accent disabled:opacity-50`}
                                  >
                                    {generating.includes(`item:${ansKey}`)
                                      ? t("study.practiceGenerating")
                                      : t("study.regenOne")}
                                  </button>
                                  {(() => {
                                    const saved = wrongItems.some((w) => w.question === item.q);
                                    return (
                                      <button
                                        type="button"
                                        disabled={saved}
                                        onClick={() =>
                                          void onAddWrong({
                                            chapter: g.chapter,
                                            question: item.q,
                                            answer: item.a,
                                            ref: item.ref,
                                          })
                                        }
                                        className={`${PILL} ${
                                          saved
                                            ? "border-line text-[#c8c4bc]"
                                            : "border-line text-ink-3 hover:border-warn hover:text-warn"
                                        }`}
                                      >
                                        {saved ? t("study.inWrongBook") : t("study.addToWrong")}
                                      </button>
                                    );
                                  })()}
                                  </div>

                                  {open ? (
                                    <div className="mt-2 max-w-[70ch] rounded-lg border border-line-2 bg-surface px-3 py-2.5">
                                      <p className="text-[9.5px] uppercase tracking-[0.12em] text-ink-3">
                                        {t("study.answerLabel")}
                                      </p>
                                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-[1.9] text-ink-2">
                                        {item.a}
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
        {groups.length === 0 ? (
          <p className="text-[10px] text-[#c8c4bc]">{t("study.noMaterial")}</p>
        ) : null}
      </div>

      {moving ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-24"
          onClick={() => setMoving(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">{t("study.moveChapter")}</h2>
              <button type="button" onClick={() => setMoving(null)} className="text-[13px] text-ink-3">
                ✕
              </button>
            </header>
            <p className="mt-1 truncate text-[10px] text-ink-3">{moving.title}</p>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[...new Set(materials.map((x) => x.chapter).filter((c): c is string => Boolean(c)))]
                .sort()
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setMoveDraft(c)}
                    className={`rounded-full border px-2 py-[2px] text-[10px] transition-colors ${
                      moveDraft === c
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line text-ink-3 hover:border-accent"
                    }`}
                  >
                    {t("study.chapterN", { n: c })}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setMoveDraft("")}
                className={`rounded-full border px-2 py-[2px] text-[10px] transition-colors ${
                  moveDraft === ""
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-ink-3 hover:border-accent"
                }`}
              >
                {t("study.noChapterPick")}
              </button>
            </div>

            <input
              value={moveDraft}
              onChange={(e) => setMoveDraft(e.target.value)}
              placeholder={t("study.chapterInputPlaceholder")}
              className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
            />

            <div className="mt-3 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setMoving(null)}
                className="rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = moving.id;
                  await api.updateMaterial(id, { chapter: moveDraft.trim() || null });
                  setMoving(null);
                  await onChanged();
                }}
                className="rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white"
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
