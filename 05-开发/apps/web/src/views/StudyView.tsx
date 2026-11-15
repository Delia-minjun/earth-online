import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  type ApiExam,
  type ApiMaterial,
  type ApiReviewCard,
  type ApiStudyStats,
  type ApiSubject,
} from "../api";
import { Card } from "../components/Card";
import { StudyMaterials } from "../components/StudyMaterials";
import { renderPdfPages } from "../lib/pdfPages";

/** 学习：科目 → 资料 → 卡片 → 间隔重复复习 */
export function StudyView() {
  const { t } = useTranslation();
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [materials, setMaterials] = useState<ApiMaterial[]>([]);
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
      const [mats, q] = await Promise.all([api.materials(subjectId), api.reviewQueue(subjectId)]);
      setMaterials(mats);
      setQueue(q.cards);
      setIdx(0);
      setFlipped(false);
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
  const uploadOne = async (file: File, role: "knowledge" | "questions") => {
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
  const uploadMany = async (files: FileList | File[], role: "knowledge" | "questions") => {
    if (!active) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    try {
      for (const f of list) await uploadOne(f, role);
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

  const grade = async (rating: "again" | "good" | "easy") => {
    const card = queue[idx];
    if (!card) return;
    try {
      const res = await api.reviewCard(card.id, rating);
      if (res.coins > 0) setToast(t("study.coins", { n: res.coins }));
      // 本地摘掉这张，避免整队重拉
      setQueue((q) => {
        const next = q.filter((c) => c.id !== card.id);
        setIdx((i) => (i >= next.length ? 0 : i));
        return next;
      });
      setFlipped(false);
      void loadAll();
      window.setTimeout(() => setToast(null), 2000);
    } catch (e) {
      setError((e as Error).message);
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
              onClick={() => pickSubject(s.id)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] transition-colors ${
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
          {/* 资料：知识内容与题目资料分开上传、分别出卡片 */}
          <StudyMaterials
            subjectId={active.id}
            materials={materials}
            busy={busy}
            onUpload={(files, role) => uploadMany(files, role)}
            onNote={async (text) => {
              await api.addMaterial({
                subjectId: active.id,
                title: text.split("\n")[0]!.slice(0, 24) || t("study.notePlaceholder"),
                kind: "text",
                content: text,
                role: "knowledge",
              });
              await loadSubject(active.id);
              await loadAll();
            }}
            onChanged={async () => {
              if (active) await loadSubject(active.id);
              await loadAll();
            }}
          />

          {/* 右：复习 */}
          <Card
            title={t("study.review")}
            action={
              <span className="tabular-nums">
                {t("study.todayDone", { n: stats?.reviewedToday ?? 0 })} · {t("study.dueN", { n: queue.length })}
              </span>
            }
          >
            {current ? (
              <div>
                <p className="text-[10px] text-ink-3">
                  {current.subject_name} · box {current.box}
                  {current.ref ? ` · ${current.ref}` : ""}
                </p>
                <div className="mt-2 rounded-xl border border-line-2 bg-surface-2 p-3">
                  <p className="text-[12.5px] leading-relaxed text-ink">{current.front}</p>
                  {flipped ? (
                    <p className="mt-2 border-t border-line pt-2 text-[11.5px] leading-relaxed text-ink-2">
                      {current.back}
                    </p>
                  ) : null}
                </div>

                {flipped ? (
                  <div className="mt-2.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void grade("again")}
                      className="flex-1 rounded-lg border border-line py-1.5 text-[10.5px] text-ink-2 hover:border-warn hover:text-warn"
                    >
                      {t("study.again")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void grade("good")}
                      className="flex-1 rounded-lg bg-accent py-1.5 text-[10.5px] font-semibold text-white"
                    >
                      {t("study.good")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void grade("easy")}
                      className="flex-1 rounded-lg border border-line py-1.5 text-[10.5px] text-ink-2 hover:border-accent hover:text-accent"
                    >
                      {t("study.easy")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFlipped(true)}
                    className="mt-2.5 w-full rounded-lg bg-accent py-1.5 text-[10.5px] font-semibold text-white"
                  >
                    {t("study.showAnswer")}
                  </button>
                )}
              </div>
            ) : (
              <p className="py-3 text-center text-[10.5px] text-[#c8c4bc]">{t("study.noDue")}</p>
            )}
          </Card>
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

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[10.5px] text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
