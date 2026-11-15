import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiCard, type ApiMaterial } from "../api";
import { Card } from "../components/Card";
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
  busy,
  onUpload,
  onChanged,
}: {
  subjectId: string;
  materials: ApiMaterial[];
  cards: ApiCard[];
  busy: boolean;
  onUpload: (files: FileList | File[], role: Role, chapter: string | null) => Promise<void>;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState<Role>("knowledge");
  const [chapterInput, setChapterInput] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const chapterLabel = (chapter: string | null) =>
    chapter
      ? /^l/i.test(chapter)
        ? t("study.lectureN", { n: chapter.slice(1) })
        : t("study.chapterN", { n: chapter })
      : t("study.noChapter");

  const generate = async (chapter: string | null, which: Role) => {
    const key = `${chapter ?? ""}:${which}`;
    setGenerating(key);
    setError(null);
    try {
      await api.generateSection(subjectId, which, chapter, 8);
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
      setGenerating(null);
    }
  };

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const typed = chapterInput.trim() || null;
    await onUpload(list, role, typed ?? guessChapter(list[0]!.name));
  };

  return (
    <Card title={t("study.courseMaterials")}>
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
          <input
            value={chapterInput}
            onChange={(e) => setChapterInput(e.target.value)}
            placeholder={t("study.chapterPlaceholder")}
            className="w-24 rounded-full border border-line bg-surface px-2.5 py-[3px] text-[10.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
          />
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
          return (
            <section key={key} className="rounded-xl border border-line-2 p-2.5">
              <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-[11px] font-semibold text-ink">{chapterLabel(g.chapter)}</h3>
                <span className="text-[9.5px] text-ink-3">
                  {t("study.materialCount", { n: g.materials.length })}
                  {g.cards ? ` · ${t("study.cardCount", { n: g.cards })}` : ""}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void generate(g.chapter, "knowledge")}
                    disabled={busy || !hasKnowledge || generating === `${key}:knowledge`}
                    className="rounded-full border border-line px-2 py-[2px] text-[9.5px] text-ink-3 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {generating === `${key}:knowledge` ? t("study.generating") : t("study.genKnowledge")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generate(g.chapter, "questions")}
                    disabled={busy || !hasQuestions || generating === `${key}:questions`}
                    className="rounded-full border border-line px-2 py-[2px] text-[9.5px] text-ink-3 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {generating === `${key}:questions` ? t("study.generating") : t("study.genQuestions")}
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
