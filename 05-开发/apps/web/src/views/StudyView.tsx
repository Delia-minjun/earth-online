import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  type ApiCard,
  type ApiExam,
  type ApiPractice,
  type ApiWrongItem,
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
  const [wrongItems, setWrongItems] = useState<ApiWrongItem[]>([]);
  const [wrongOpen, setWrongOpen] = useState<string[]>([]);
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
  const [goalDraft, setGoalDraft] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);
  const [ask, setAsk] = useState("");
  /** 指令作用的章节；空 = 让 agent 自己判断 */
  const [askChapter, setAskChapter] = useState("");
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<string | null>(null);
  const [askElapsed, setAskElapsed] = useState(0);
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
      const [mats, q, cds, nts, prs, wrs] = await Promise.all([
        api.materials(subjectId),
        api.reviewQueue(subjectId),
        api.cards(subjectId),
        api.studyNotes(subjectId),
        api.practices(subjectId),
        api.wrongItems(subjectId),
      ]);
      setMaterials(mats);
      setCards(cds);
      setNotes(nts);
      setPractices(prs);
      setWrongItems(wrs);
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

  useEffect(() => {
    setGoalDraft(active?.goal ?? "");
  }, [active?.id, active?.goal]);

  /** 目标直接在当前这行编辑，失焦/回车保存 */
  const saveGoal = async () => {
    if (!active) return;
    const next = goalDraft.trim();
    if ((active.goal ?? "") === next) return;
    setGoalSaving(true);
    try {
      await api.renameSubject(active.id, { goal: next || null });
      const subs = await api.subjects();
      setSubjects(subs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGoalSaving(false);
    }
  };

  const chapters = useMemo(() => {
    const set = new Set<string>();
    for (const m of materials) if (m.chapter) set.add(m.chapter);
    return [...set].sort((a, b) => (a.match(/\d+/)?.[0] ?? "999").localeCompare(b.match(/\d+/)?.[0] ?? "999"));
  }, [materials]);

  /** 把一句话要求发给 agent：它自己决定改讲解还是出题 */
  const sendInstruction = async () => {
    if (!active || !ask.trim() || asking) return;
    setAsking(true);
    setAskResult(null);
    setAskElapsed(0);
    const timer = window.setInterval(() => setAskElapsed((s) => s + 1), 1000);
    try {
      const res = await api.instructStudy(active.id, ask.trim(), askChapter || null);
      setAskResult(res.message);
      setAsk("");
      await loadSubject(active.id);
      await loadAll();
    } catch (e) {
      setAskResult((e as Error).message);
    } finally {
      window.clearInterval(timer);
      setAsking(false);
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
          {/* 学习目标：直接输入，失焦保存 */}
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5">
            <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-ink-3">
              {t("study.goalLabel")}
            </span>
            <input
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              onBlur={() => void saveGoal()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder={t("study.goalPlaceholder")}
              disabled={goalSaving}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-ink-2 outline-none placeholder:text-[#c8c4bc] disabled:opacity-60"
            />
          </div>

          {/* 提要求：交给 agent 决定改讲解还是出题 */}
          <div className="rounded-xl border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <select
                value={askChapter}
                onChange={(e) => setAskChapter(e.target.value)}
                className="shrink-0 rounded-full border border-line bg-surface-2 px-1.5 py-[2px] text-[10px] text-ink-2 outline-none"
              >
                <option value="">{t("study.askAnyChapter")}</option>
                {chapters.map((c) => (
                  <option key={c} value={c}>
                    {/^l/i.test(c) ? t("study.lectureN", { n: c.slice(1) }) : t("study.chapterN", { n: c })}
                  </option>
                ))}
              </select>
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendInstruction();
                }}
                placeholder={t("study.askPlaceholder")}
                disabled={asking}
                className="min-w-0 flex-1 bg-transparent text-[11px] text-ink-2 outline-none placeholder:text-[#c8c4bc] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void sendInstruction()}
                disabled={asking || !ask.trim()}
                className="shrink-0 rounded-full bg-accent px-2.5 py-[3px] text-[10px] font-semibold text-white disabled:opacity-50"
              >
                {asking ? `${t("study.asking")} ${askElapsed}s` : t("study.askSend")}
              </button>
            </div>
            {askResult ? (
              <p className="mt-1.5 text-[10px] text-ink-3">{askResult}</p>
            ) : null}
          </div>

          {/* 资料：知识内容与题目资料分开上传、分别出卡片 */}
          <StudyMaterials
            subjectId={active.id}
            materials={materials}
            cards={cards}
            notes={notes}
            practices={practices}
            wrongItems={wrongItems.map((w) => ({ id: w.id, question: w.question }))}
            onAddWrong={async (item) => {
              try {
                await api.addWrong({
                  subjectId: active.id,
                  chapter: item.chapter,
                  question: item.question,
                  answer: item.answer,
                  ref: item.ref,
                });
              } catch {
                /* 重复收录由服务端 409 挡掉，这里静默即可 */
              }
              await loadSubject(active.id);
            }}
            busy={busy}
            onUpload={(files, role, chapter) => uploadMany(files, role, chapter)}
            onChanged={async () => {
              if (active) await loadSubject(active.id);
              await loadAll();
            }}
          />

        </div>
      )}

      {/* 错题本 */}
      <Card
        title={t("study.wrongBook")}
        action={
          wrongItems.length ? <span className="tabular-nums">{t("study.wrongCount", { n: wrongItems.length })}</span> : null
        }
      >
        <ul className="divide-y divide-line-2">
          {wrongItems.map((w) => {
            const open = wrongOpen.includes(w.id);
            return (
              <li key={w.id} className="py-2 first:pt-0">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] leading-relaxed text-ink-2">{w.question}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9.5px] text-ink-3">
                      {w.chapter ? (
                        <span className="rounded-full bg-surface-2 px-1.5 py-[1px]">
                          {/^l/i.test(w.chapter)
                            ? t("study.lectureN", { n: w.chapter.slice(1) })
                            : t("study.chapterN", { n: w.chapter })}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setWrongOpen((list) =>
                            list.includes(w.id) ? list.filter((k) => k !== w.id) : [...list, w.id],
                          )
                        }
                        className="transition-colors hover:text-accent"
                      >
                        {open ? t("study.hideAnswer") : t("study.showAnswer")}
                      </button>
                    </div>
                    {open ? (
                      <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-line-2 bg-surface-2 px-2.5 py-2 text-[11px] leading-relaxed text-ink-2">
                        {w.answer}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.deleteWrong(w.id);
                      if (active) await loadSubject(active.id);
                    }}
                    className="shrink-0 text-[10px] text-[#c0bbb2] transition-colors hover:text-warn"
                  >
                    {t("study.removeFromWrong")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {wrongItems.length === 0 ? (
          <p className="text-[10px] text-[#c8c4bc]">{t("study.wrongEmpty")}</p>
        ) : null}
      </Card>

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

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[10.5px] text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
