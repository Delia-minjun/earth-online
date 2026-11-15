import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiMaterial } from "../api";
import { Card } from "../components/Card";

type Role = "knowledge" | "questions";

/**
 * 学习资料：知识内容（课件/笔记）与题目资料（quiz/作业）分开上传、分开出卡片。
 * 两边都可以为空，互不依赖。
 */
export function StudyMaterials({
  subjectId,
  materials,
  busy,
  onUpload,
  onNote,
  onChanged,
}: {
  subjectId: string;
  materials: ApiMaterial[];
  busy: boolean;
  onUpload: (files: FileList | File[], role: Role) => Promise<void>;
  onNote: (text: string) => Promise<void>;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [generating, setGenerating] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const byRole = (role: Role) => materials.filter((m) => (m.role ?? "knowledge") === role);

  const saveNote = async () => {
    const text = note.trim();
    if (!text) return;
    await onNote(text);
    setNote("");
    setNoteOpen(false);
  };

  const generate = async (role: Role) => {
    setGenerating(role);
    setError(null);
    try {
      await api.generateSection(subjectId, role, 8);
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

  return (
    <Card title={t("study.courseMaterials")}>
      {error ? <p className="mb-2 text-[10px] text-warn">{error}</p> : null}
      <div className="space-y-2.5">
        <Section
          role="knowledge"
          label={t("study.knowledge")}
          items={byRole("knowledge")}
          busy={busy}
          generating={generating === "knowledge"}
          onUpload={(files) => onUpload(files, "knowledge")}
          onGenerate={() => void generate("knowledge")}
          onChanged={onChanged}
        />
        {noteOpen ? (
          <div className="rounded-xl border border-line-2 bg-surface-2 p-2.5">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t("study.notePlaceholder")}
              className="w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] leading-relaxed text-ink outline-none placeholder:text-[#c8c4bc]"
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => void saveNote()}
                disabled={!note.trim()}
                className="rounded-lg bg-accent px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoteOpen(false);
                  setNote("");
                }}
                className="rounded-lg border border-line px-2.5 py-1 text-[10px] text-ink-3"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="text-[10px] text-ink-3 transition-colors hover:text-accent"
        >
          ＋ {t("study.notePlaceholder")}
        </button>

        <Section
          role="questions"
          label={t("study.questions")}
          items={byRole("questions")}
          busy={busy}
          generating={generating === "questions"}
          onUpload={(files) => onUpload(files, "questions")}
          onGenerate={() => void generate("questions")}
          onChanged={onChanged}
        />
      </div>
    </Card>
  );
}

function Section({
  role,
  label,
  items,
  busy,
  generating,
  onUpload,
  onGenerate,
  onChanged,
}: {
  role: Role;
  label: string;
  items: ApiMaterial[];
  busy: boolean;
  generating: boolean;
  onUpload: (files: FileList | File[]) => Promise<void>;
  onGenerate: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <section className="rounded-xl border border-line-2 bg-surface-2 p-2.5">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</h3>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || generating || items.length === 0}
          className="shrink-0 rounded-full bg-accent px-2.5 py-[3px] text-[10px] font-semibold text-white transition-opacity hover:opacity-90 disabled:bg-surface disabled:text-ink-3 disabled:opacity-100"
        >
          {generating ? t("study.generating") : t("study.generate")}
        </button>
      </header>

      <div
        role="button"
        tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter") ref.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) void onUpload(e.dataTransfer.files);
        }}
        className={`mt-2 cursor-pointer rounded-lg border border-dashed px-3 py-2.5 text-center transition-colors ${
          over ? "border-accent bg-accent-soft/30" : "border-[#d5cfc4] bg-surface hover:border-accent"
        }`}
      >
        <p className="text-[10.5px] text-ink-2">{busy ? t("study.uploading") : t("study.dropHint")}</p>
      </div>
      <input
        ref={ref}
        type="file"
        multiple
        accept=".pdf,.docx,.pptx,.md,.markdown,.txt,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void onUpload(e.target.files);
          e.target.value = "";
        }}
      />

      <ul className="mt-1.5">
        {items.map((m) => (
          <li key={m.id} className="group flex items-center gap-2 py-1">
            <p className="min-w-0 flex-1 truncate text-[11px] text-ink">{m.title}</p>
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
        {items.length === 0 ? (
          <li className="py-1 text-[10px] text-[#c8c4bc]">
            {role === "knowledge" ? t("study.knowledgeEmpty") : t("study.questionsEmpty")}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
