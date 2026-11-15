import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiCard, type ApiMaterial, type ApiStudyNote } from "../api";
import { Card } from "../components/Card";
import { NoteMarkdown } from "./NoteMarkdown";
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
  busy,
  onUpload,
  onChanged,
}: {
  subjectId: string;
  materials: ApiMaterial[];
  cards: ApiCard[];
  notes: ApiStudyNote[];
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
  const fileRef = useRef<HTMLInputElement>(null);
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

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    // 章节从文件名猜：Ch3 / 第3章 / 03 Homework / L5
    await onUpload(list, role, guessChapter(list[0]!.name));
  };

  return (
    <Card title={t("study.courseMaterials")}>
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
                    onClick={() => void genNote(g.chapter)}
                    disabled={busy || !hasKnowledge || generating.includes(`note:${key}`)}
                    className="rounded-full border border-line px-2 py-[2px] text-[9.5px] text-ink-3 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {generating.includes(`note:${key}`)
                      ? t("study.noteGenerating")
                      : note
                        ? t("study.regenNote")
                        : t("study.genNote")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generate(g.chapter, "questions")}
                    disabled={busy || !hasQuestions || generating.includes(`${key}:questions`)}
                    className="rounded-full border border-line px-2 py-[2px] text-[9.5px] text-ink-3 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {generating.includes(`${key}:questions`) ? t("study.generating") : t("study.genQuestions")}
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
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-2">{m.title}</span>
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
                    <span className="font-semibold text-ink-2">{t("study.genNote")}</span>
                    <span>{openNote === key ? t("study.noteClose") : t("study.noteOpen")}</span>
                  </button>
                  {openNote === key ? (
                    <div className="max-h-[62vh] overflow-y-auto border-t border-line-2 bg-surface px-4 py-3">
                      <NoteMarkdown content={note.content} />
                    </div>
                  ) : (
                    <p className="border-t border-line-2 px-3 py-1.5 text-[10px] text-[#c8c4bc]">
                      {note.content.split("\n").find((l) => l.trim().startsWith("##"))?.replace(/^#+\s*/, "") ??
                        t("study.genNote")}
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
        {groups.length === 0 ? (
          <p className="text-[10px] text-[#c8c4bc]">{t("study.noMaterial")}</p>
        ) : null}
      </div>
    </Card>
  );
}
