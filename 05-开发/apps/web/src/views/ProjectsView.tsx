import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ApiArea, type ApiProject, type ApiProjectTask } from "../api";

export function ProjectsView() {
  const { t } = useTranslation();
  const [areas, setAreas] = useState<ApiArea[]>([]);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ApiProjectTask[]>([]);
  const [taskDraft, setTaskDraft] = useState("");

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", areaId: "", dueDate: "" });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", areaId: "", status: "active", dueDate: "" });

  const [areaOpen, setAreaOpen] = useState(false);
  const [areaDraft, setAreaDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        api.areas(),
        api.projects(showDone ? "all" : "active"),
      ]);
      setAreas(a);
      setProjects(p);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [showDone]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTasks = useCallback(async (projectId: string) => {
    try {
      setTasks(await api.projectTasks(projectId));
    } catch {
      setTasks([]);
    }
  }, []);

  const toggleExpand = (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    setTasks([]);
    void loadTasks(id);
  };

  const addProject = async () => {
    const name = form.name.trim();
    if (!name) return;
    await api.addProject({
      name,
      areaId: form.areaId || undefined,
      dueDate: form.dueDate || undefined,
    });
    setForm({ name: "", areaId: "", dueDate: "" });
    setAdding(false);
    await load();
  };

  const startEdit = (p: ApiProject) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      areaId: p.areaId ?? "",
      status: p.status,
      dueDate: p.dueDate ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editForm.name.trim();
    if (!name) return;
    await api.patchProject(editingId, {
      name,
      areaId: editForm.areaId || null,
      status: editForm.status,
      dueDate: editForm.dueDate || null,
    });
    setEditingId(null);
    await load();
  };

  const removeProject = async (id: string) => {
    await api.deleteProject(id);
    if (expanded === id) setExpanded(null);
    await load();
  };

  const addTask = async () => {
    const title = taskDraft.trim();
    if (!title || !expanded) return;
    setTaskDraft("");
    await api.addTask(title, undefined, expanded);
    await loadTasks(expanded);
    await load();
  };

  const toggleTask = async (task: ApiProjectTask) => {
    await api.setTaskStatus(task.id, task.status === "done" ? "todo" : "done");
    if (expanded) await loadTasks(expanded);
    await load();
  };

  const grouped = useMemo(() => {
    const byArea = new Map<string, ApiProject[]>();
    for (const p of projects) {
      const key = p.areaId ?? "";
      const list = byArea.get(key) ?? [];
      list.push(p);
      byArea.set(key, list);
    }
    const ordered = areas
      .filter((a) => byArea.has(a.id))
      .map((a) => ({ area: a, items: byArea.get(a.id) ?? [] }));
    const orphan = byArea.get("") ?? [];
    if (orphan.length) ordered.push({ area: null as unknown as ApiArea, items: orphan });
    return ordered;
  }, [areas, projects]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className={`rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
            showDone
              ? "border-accent bg-accent text-white"
              : "border-line bg-surface text-ink-3 hover:border-accent"
          }`}
        >
          {t("project.showDone")}
        </button>
        <button
          type="button"
          onClick={() => setAreaOpen((v) => !v)}
          className={`rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
            areaOpen
              ? "border-accent bg-accent text-white"
              : "border-line bg-surface text-ink-3 hover:border-accent"
          }`}
        >
          {t("project.areas")}
        </button>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className={`ml-auto rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
            adding
              ? "border-accent bg-accent text-white"
              : "border-line bg-surface text-ink-3 hover:border-accent"
          }`}
        >
          {t("project.add")}
        </button>
      </div>

      {error ? <p className="text-[10.5px] text-warn">{error}</p> : null}

      {areaOpen ? (
        <section className="space-y-2 rounded-2xl border border-line bg-surface p-3">
          <p className="text-[10.5px] text-ink-3">{t("project.areaHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => (
              <span
                key={a.id}
                className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10.5px] text-ink-2"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: a.color ?? "#9BA7B0" }}
                />
                {a.name}
                <span className="text-[9px] text-ink-3">{a.projects}</span>
                <button
                  type="button"
                  onClick={() => void api.deleteArea(a.id).then(load)}
                  className="opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                  aria-label="delete"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-line-2 pt-2">
            <input
              value={areaDraft}
              onChange={(e) => setAreaDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const name = areaDraft.trim();
                if (!name) return;
                setAreaDraft("");
                void api.addArea(name).then(load);
              }}
              placeholder={t("project.areaPlaceholder")}
              className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
            />
          </div>
        </section>
      ) : null}

      {adding ? (
        <section className="space-y-2 rounded-2xl border border-accent-soft bg-surface p-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addProject();
            }}
            placeholder={t("project.namePlaceholder")}
            className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-[#c8c4bc]"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={form.areaId}
              onChange={(e) => setForm((f) => ({ ...f, areaId: e.target.value }))}
              className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[10.5px] text-ink-2 outline-none"
            >
              <option value="">{t("project.noArea")}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[10.5px] tabular-nums text-ink-2 outline-none"
            />
            <button
              type="button"
              onClick={() => void addProject()}
              disabled={!form.name.trim()}
              className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white disabled:opacity-50"
            >
              {t("common.save")}
            </button>
          </div>
        </section>
      ) : null}

      {projects.length === 0 && !adding ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface-2 px-4 py-10 text-center">
          <p className="text-[11.5px] text-ink-3">{t("project.empty")}</p>
          <p className="mt-1.5 text-[10px] text-[#c8c4bc]">{t("project.emptyHint")}</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {grouped.map((group, gi) => (
          <section key={group.area?.id ?? `orphan-${gi}`} className="space-y-1.5">
            <h2 className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-[0.12em] text-ink-3">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: group.area?.color ?? "#CFCAC1" }}
              />
              {group.area?.name ?? t("project.noArea")}
            </h2>

            {group.items.map((p) =>
              editingId === p.id ? (
                <div key={p.id} className="space-y-1.5 rounded-2xl border border-line bg-surface p-3">
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-ink outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={editForm.areaId}
                      onChange={(e) => setEditForm((f) => ({ ...f, areaId: e.target.value }))}
                      className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[10.5px] text-ink-2 outline-none"
                    >
                      <option value="">{t("project.noArea")}</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                      className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[10.5px] text-ink-2 outline-none"
                    >
                      <option value="active">{t("project.statusActive")}</option>
                      <option value="paused">{t("project.statusPaused")}</option>
                    </select>
                    <input
                      type="date"
                      value={editForm.dueDate}
                      onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                      className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-[10.5px] tabular-nums text-ink-2 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      className="ml-auto rounded-lg bg-accent px-2.5 py-1 text-[10px] font-semibold text-white"
                    >
                      {t("common.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-line px-2.5 py-1 text-[10px] text-ink-3"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void api.patchProject(p.id, { status: "done" }).then(load);
                    }}
                    className="text-[10px] text-ink-3 underline decoration-dotted hover:text-accent"
                  >
                    {t("project.markDone")}
                  </button>
                </div>
              ) : (
                <div key={p.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <div className="group flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(p.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="text-[10px] text-ink-3">{expanded === p.id ? "▾" : "▸"}</span>
                      <span className="truncate text-[12.5px] text-ink">{p.name}</span>
                      <span className="shrink-0 text-[9.5px] text-ink-3">
                        {t("project.counts", { open: p.openTasks, done: p.doneTasks })}
                      </span>
                      {p.status === "done" ? (
                        <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] text-ink-3">
                          {t("project.statusDone")}
                        </span>
                      ) : null}
                      {p.dueDate ? (
                        <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] tabular-nums text-ink-3">
                          {p.dueDate.slice(5)}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="shrink-0 text-[10px] text-[#a9a49b] opacity-100 transition-opacity hover:text-accent md:opacity-0 md:group-hover:opacity-100"
                    >
                      {t("course.editRow")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeProject(p.id)}
                      className="shrink-0 text-[12px] text-[#a9a49b] opacity-100 transition-opacity hover:text-warn md:opacity-0 md:group-hover:opacity-100"
                      aria-label="delete"
                    >
                      ×
                    </button>
                  </div>

                  {expanded === p.id ? (
                    <div className="border-t border-line-2 px-3 py-2">
                      <ul>
                        {tasks.map((task) => (
                          <li key={task.id} className="flex items-center gap-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => void toggleTask(task)}
                              className={`grid h-[16px] w-[16px] shrink-0 place-items-center rounded-full border text-[8px] transition-colors ${
                                task.status === "done"
                                  ? "border-accent bg-accent text-white"
                                  : "border-line text-transparent hover:border-accent"
                              }`}
                            >
                              ✓
                            </button>
                            <span
                              className={`min-w-0 flex-1 truncate text-[11.5px] ${
                                task.status === "done" ? "text-ink-3 line-through" : "text-ink-2"
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.priority > 0 ? (
                              <span className="shrink-0 text-[9px] text-[#b08b6a]">
                                {task.priority >= 2 ? t("task.priority2") : t("task.priority1")}
                              </span>
                            ) : null}
                          </li>
                        ))}
                        {tasks.length === 0 ? (
                          <li className="py-1.5 text-[10.5px] text-ink-3">{t("project.noTasks")}</li>
                        ) : null}
                      </ul>
                      <div className="mt-1.5 flex items-center gap-2 border-t border-line-2 pt-2">
                        <span className="text-[10px] text-[#c8c4bc]">＋</span>
                        <input
                          value={taskDraft}
                          onChange={(e) => setTaskDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void addTask();
                          }}
                          placeholder={t("project.taskPlaceholder")}
                          className="w-full bg-transparent text-[11.5px] text-ink outline-none placeholder:text-[#c8c4bc]"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
