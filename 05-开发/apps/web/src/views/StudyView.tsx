import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  type ApiCard,
  type ApiExam,
  type ApiPractice,
  type ApiStudyNote,
  type ApiMaterial,
  type ApiReviewCard,
  type ApiStudyStats,
  type ApiSubject,
} from "../api";
import { Card } from "../components/Card";
import { StudyMaterials } from "../components/StudyMaterials";
import { renderPdfPages } from "../lib/pdfPages";

type Stage = "independent" | "hinted" | "revealed" | "failed";

/** 学习：科目 → 资料 → 卡片 → 间隔重复复习 */
export function StudyView() {
  const { t } = useTranslation();
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [materials, setMaterials] = useState<ApiMaterial[]>([]);
  const [cards, setCards] = useState<ApiCard[]>([]);
  const [notes, setNotes] = useState<ApiStudyNote[]>([]);
  const [practices, setPractices] = useState<ApiPractice[]>([]);
  const [queue, setQueue] = useState<ApiReviewCard[]>([]);
  const [stats, setStats] = useState<ApiStudyStats | null>(null);
  const [exams, setExams] = useState<ApiExam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 新建科目
  const [newSubject, setNewSubject] = useState("");
  // 新建资料
  // 校对
  // 复习
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ good: string; wrong: string; next: string } | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = subjects.find((s) => s.id === activeId) ?? null;

  const loadAll = useCallback(async () => {
    try {
      const [subs, st, ex] = await Promise.all([api.subjects(), api.studyStats(), api.exams()]);
      setSubjects(subs);
      setStats(st);
      setExams(ex);
      setError(null);
      return subs;
    } catch (e) {
      setError((e as Error).message);
      return [] as ApiSubject[];
    }
  }, []);

  const loadSubject = useCallback(async (subjectId: string) => {
    if (!subjectId) {
      setMaterials([]);
      setQueue([]);
      return;
    }
    try {
      const [mats, q, cds, nts, prs] = await Promise.all([
        api.materials(subjectId),
        api.reviewQueue(subjectId),
        api.cards(subjectId),
        api.studyNotes(subjectId),
        api.practices(subjectId),
      ]);
      setMaterials(mats);
      setCards(cds);
      setNotes(nts);
      setPractices(prs);
      setQueue(q.cards);
      setIdx(0);
      setFlipped(false);
      setDraftAnswer("");
      setFeedback(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadAll().then((subs) => {
      const first = subs[0];
      if (first) {
        setActiveId(first.id);
        void loadSubject(first.id);
      }
    });
  }, [loadAll, loadSubject]);

  /** 拖动科目换顺序，松手后写回 sort */
  const onDropSubject = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = subjects.findIndex((s) => s.id === dragId);
    const to = subjects.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...subjects];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setSubjects(next);
    setDragId(null);
    try {
      await api.reorderSubjects(next.map((s) => s.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const pickSubject = (id: string) => {
    setActiveId(id);
    void loadSubject(id);
  };

  const addSubject = async () => {
    const name = newSubject.trim();
    if (!name) return;
    setBusy(true);
    try {
      const s = await api.addSubject({ name });
      setNewSubject("");
      await loadAll();
      pickSubject(s.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 选文件 → 文本类直接抽字，图片走 OCR */
  const uploadOne = async (file: File, role: "knowledge" | "questions", chapter: string | null) => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      const b64 = btoa(binary);
      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

      if (isImage) {
        const created = await api.addMaterial({
          subjectId: active.id,
          title: file.name.replace(/\.[^.]+$/, ""),
          kind: "image",
          content: "",
          source: file.name,
          imageBase64: b64,
          imageMime: file.type || "image/png",
          role,
          chapter,
        });
        if (created.ocrError === "NOKEY") setError(t("study.noKey"));
        else if (created.ocrError === "VISION_UNSUPPORTED") setError(t("study.visionUnsupported"));
        else if (created.ocrError) setError(created.ocrError);
        await loadSubject(active.id);
        await loadAll();

        return;
      }

      const isPdf = /\.pdf$/i.test(file.name);
      let created: ApiMaterial;
      try {
        created = await api.uploadMaterialFile({
          subjectId: active.id,
          filename: file.name,
          base64: b64,
          role,
          chapter,
        });
      } catch (e) {
        const msg = (e as Error).message;
        const needsVision = isPdf && (msg.includes("pdf_no_text") || msg.includes("garbled_text"));
        if (!needsVision) throw e;
        // 没有文字层或是乱码：像 agent 一样「看页面」
        const pages = await renderPdfPages(file, { maxPages: 10 });
        created = await api.ocrPages({
          subjectId: active.id,
          title: file.name.replace(/\.[^.]+$/, ""),
          role,
          chapter,
          pages: pages.map((b) => ({ base64: b, mime: "image/jpeg" })),
        });
      }
      await loadSubject(active.id);
      await loadAll();
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes("pdf_no_text")
          ? t("study.pdfNoText")
          : msg.includes("unsupported_type")
            ? t("study.unsupportedType")
            : msg.includes("empty_content")
              ? t("study.emptyFile")
              : msg.includes("too_large")
                ? t("study.tooLarge")
                : msg.includes("NOKEY")
                  ? t("study.noKey")
                  : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  /** 批量上传：拖进来的、多选的都走这里 */
  const uploadMany = async (
    files: FileList | File[],
    role: "knowledge" | "questions",
    chapter: string | null,
  ) => {
    if (!active) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    try {
      for (const f of list) await uploadOne(f, role, chapter);
    } finally {
      setBusy(false);
    }
  };

  const generate = async (m: ApiMaterial) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateCards(m.id, 8);
      setToast(t("study.generated", { n: res.cards.length }));
      if (active) await loadSubject(active.id);
      await loadAll();
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes("not_verified")
          ? t("study.needVerify")
          : msg.includes("NOKEY")
            ? t("study.noKey")
            : msg,
      );
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 2500);
    }
  };

  const grade = async (rating: "again" | "good" | "easy", stage: Stage = "independent") => {
    const card = queue[idx];
    if (!card) return;
    try {
      const res = await api.reviewCard(card.id, rating, stage, draftAnswer.trim() || undefined);
      if (res.coins > 0) setToast(t("study.coins", { n: res.coins }));
      // 本地摘掉这张，避免整队重拉
      setQueue((q) => {
        const next = q.filter((c) => c.id !== card.id);
        setIdx((i) => (i >= next.length ? 0 : i));
        return next;
      });
      setFlipped(false);
      setDraftAnswer("");
      setFeedback(null);
      void loadAll();
      window.setTimeout(() => setToast(null), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveGoal = async () => {
    if (!active) return;
    const text = goalDraft.trim();
    await api.renameSubject(active.id, { goal: text || null });
    setGoalOpen(false);
    const subs = await api.subjects();
    setSubjects(subs);
  };

  /** 看完答案后，用学习者的作答去要 AI 反馈 */
  const askFeedback = async () => {
    const card = queue[idx];
    if (!card || !draftAnswer.trim()) return;
    setFeedbackBusy(true);
    try {
      const fb = await api.cardFeedback(card.id, draftAnswer.trim());
      setFeedback({ good: fb.good, wrong: fb.wrong, next: fb.next });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFeedbackBusy(false);
    }
  };

  const upcoming = useMemo(
    () => exams.filter((e) => e.date >= new Date().toISOString().slice(0, 10)).slice(0, 3),
    [exams],
  );
  const current = queue[idx] ?? null;

  return (
    <div className="space-y-3.5">
      {error ? <p className="text-[10.5px] text-warn">{error}</p> : null}

      {/* 科目条：左边已有科目，右边新建 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void onDropSubject(s.id)}
              onClick={() => pickSubject(s.id)}
              className={`flex cursor-grab items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] transition-colors active:cursor-grabbing ${
                dragId === s.id ? "opacity-40" : ""
              } ${
                s.id === activeId
                  ? "bg-accent text-white"
                  : "border border-line bg-surface text-ink-2 hover:border-accent"
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: s.id === activeId ? "rgba(255,255,255,.8)" : (s.color ?? "#9BA7B0") }}
              />
              {s.name}
              {s.due > 0 ? (
                <span
                  className={`rounded-full px-1 text-[9px] ${
                    s.id === activeId ? "bg-white/25" : "bg-warn-soft text-warn"
                  }`}
                >
                  {s.due}
                </span>
              ) : null}
            </button>
          ))}
          {subjects.length === 0 ? (
            <span className="text-[10.5px] text-[#c8c4bc]">{t("study.noSubjectShort")}</span>
          ) : null}
        </div>

        {/* 新科目：输入框和 ＋ 合成一个胶囊，靠右 */}
        <div className="ml-auto flex items-center gap-1 rounded-full border border-line bg-surface py-[3px] pl-2.5 pr-[3px] transition-colors focus-within:border-[#cfc9be]">
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addSubject();
            }}
            placeholder={t("study.newSubject")}
            className="w-16 bg-transparent text-[10.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
          />
          <button
            type="button"
            onClick={() => void addSubject()}
            disabled={busy || !newSubject.trim()}
            aria-label={t("study.newSubject")}
            className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full bg-[#e3ded4] text-[12px] leading-none text-ink-2 transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
          >
            ＋
          </button>
        </div>
      </div>

      {!active ? null : (
        // 每张卡各占一整行，互不影响高度
        <div className="space-y-3.5">
          {/* 学习目标 */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{t("study.goalLabel")}</span>
            <span
              className={`min-w-0 flex-1 truncate text-[11px] ${
                active.goal ? "text-ink-2" : "text-[#c8c4bc]"
              }`}
            >
              {active.goal || t("study.goalPlaceholder")}
            </span>
            <button
              type="button"
              onClick={() => {
                setGoalDraft(active.goal ?? "");
                setGoalOpen(true);
              }}
              className="shrink-0 text-[11px] leading-none text-[#c0bbb2] transition-colors hover:text-accent"
              aria-label={t("study.goalEdit")}
            >
              ✎
            </button>
          </div>

          {/* 资料：知识内容与题目资料分开上传、分别出卡片 */}
          <StudyMaterials
            subjectId={active.id}
            materials={materials}
            cards={cards}
            notes={notes}
            practices={practices}
            busy={busy}
            onUpload={(files, role, chapter) => uploadMany(files, role, chapter)}
            onChanged={async () => {
              if (active) await loadSubject(active.id);
              await loadAll();
            }}
          />

        </div>
      )}

      {upcoming.length ? (
        // 考试做成一条横排的窄条，不再占一整个卡片高度
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-line bg-surface px-3 py-2">
          <span className="text-[10.5px] font-semibold text-ink-3">{t("study.exams")}</span>
          {upcoming.map((e) => {
            const days = Math.round(
              (new Date(`${e.date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) /
                86_400_000,
            );
            return (
              <span key={e.id} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                <span className="tabular-nums text-ink-3">{e.date.slice(5)}</span>
                <span className="max-w-[9rem] truncate">{e.title}</span>
                <span className="shrink-0 rounded-full bg-warn-soft px-1.5 py-[1px] text-[9px] text-warn">
                  {t("study.daysLeft", { n: days })}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await api.deleteExam(e.id);
                    await loadAll();
                  }}
                  className="text-[10px] text-[#c8c4bc] hover:text-warn"
                  aria-label="delete"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {goalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-24"
          onClick={() => setGoalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">{t("study.goalEdit")}</h2>
              <button type="button" onClick={() => setGoalOpen(false)} className="text-[13px] text-ink-3">
                ✕
              </button>
            </header>
            <textarea
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              rows={3}
              placeholder={t("study.goalPlaceholder")}
              className="mt-2 w-full resize-none rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] leading-relaxed text-ink outline-none placeholder:text-[#c8c4bc]"
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setGoalOpen(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void saveGoal()}
                className="rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[10.5px] text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
