import type { WeekInfo } from "@life/shared";

export interface ApiCategory {
  id: string;
  name: string;
  name_en: string | null;
  color: string;
}

export interface ApiArea {
  id: string;
  name: string;
  name_en: string | null;
  color: string | null;
}

export interface ApiMeta {
  areas: ApiArea[];
  categories: ApiCategory[];
  today: string;
}

export interface ApiTask {
  id: string;
  title: string;
  status: "todo" | "doing" | "done" | "dropped";
  priority: number;
  scheduled_date: string | null;
  done_at: string | null;
  is_focus: number;
}

export interface ApiBlock {
  id: string;
  start_min: number;
  end_min: number;
  title: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  source: string;
}

export interface ApiHabit {
  id: string;
  name: string;
  done: number;
}

export interface ApiHabitGrid {
  days: number;
  end: string;
  byHabit: Record<string, string[]>;
  streak: Record<string, number>;
}

export interface ApiDayReview {
  date: string;
  good: string;
  bad: string;
  next: string;
}

export interface ApiArea {
  id: string;
  name: string;
  nameEn: string | null;
  color: string | null;
  projects: number;
}

export interface ApiProject {
  id: string;
  name: string;
  status: "active" | "done" | "paused";
  dueDate: string | null;
  areaId: string | null;
  areaName: string | null;
  areaColor: string | null;
  openTasks: number;
  doneTasks: number;
}

export interface ApiProjectTask {
  id: string;
  title: string;
  status: "todo" | "doing" | "done" | "dropped";
  priority: number;
  scheduledDate: string | null;
}

export interface ApiJournal {
  date: string;
  mood: number | null;
  body: string;
}

export interface ApiCourse {
  id: string;
  name: string;
  weekday: number;
  start_min: number;
  end_min: number;
  location: string | null;
  color: string | null;
  week_type: string;
  week_start: number | null;
  week_end: number | null;
}

export interface ApiDay {
  date: string;
  week: WeekInfo;
  tasks: ApiTask[];
  blocks: ApiBlock[];
  habits: ApiHabit[];
  journal: ApiJournal | null;
  courses: ApiCourse[];
  teachingWeek: number | null;
}

export interface SemesterConfig {
  startDate: string | null;
}

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      // 超时兜底：请求挂住时会走 catch，界面能显示「保存失败」而不是一直转
      signal: AbortSignal.timeout(timeoutMs),
      ...init,
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(`TIMEOUT:${Math.round(timeoutMs / 1000)}`);
    }
    throw err;
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

export interface ApiWeekBlock {
  id: string;
  date: string;
  start_min: number;
  end_min: number;
  title: string;
  category_id: string | null;
  category_color: string | null;
}

export interface ApiWeekTask {
  id: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  priority: number;
  is_focus: number;
}

export interface ApiWeek {
  week: WeekInfo;
  weekId: string;
  tasks: ApiWeekTask[];
  blocks: ApiWeekBlock[];
  courses: ApiCourse[];
  teachingWeek: number | null;
}

export interface ApiReview {
  week_id: string;
  keep: string;
  improve: string;
  stop: string;
  start: string;
}

export interface PeriodsConfig {
  firstStart: string;
  lessonMin: number;
  breakMin: number;
  count: number;
}

export interface CourseCandidate {
  key: string;
  name: string;
  weekday: number | null;
  startMin: number | null;
  endMin: number | null;
  location: string;
  weekType: string;
  weekStart: number | null;
  weekEnd: number | null;
  ok: boolean;
}

export interface AiConfigInfo {
  configured: boolean;
  source: "env" | "db" | "file" | "none";
  model: string;
  base: string;
  masked: string;
}

export const api = {
  meta: () => request<ApiMeta>("/meta"),
  day: (date?: string) => request<ApiDay>(`/day${date ? `?date=${date}` : ""}`),
  week: (isoYear: number, isoWeek: number) => request<ApiWeek>(`/week/${isoYear}/${isoWeek}`),
  review: (weekId: string) => request<ApiReview>(`/review/${weekId}`),
  saveReview: (weekId: string, patch: Partial<Omit<ApiReview, "week_id">>) =>
    request<ApiReview>(`/review/${weekId}`, { method: "PUT", body: JSON.stringify(patch) }),

  addTask: (title: string, date?: string, projectId?: string) =>
    request<ApiTask>("/tasks", { method: "POST", body: JSON.stringify({ title, date, projectId }) }),
  setTaskStatus: (id: string, status: ApiTask["status"]) =>
    request<ApiTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  patchTask: (
    id: string,
    patch: { title?: string; date?: string | null; priority?: number; areaId?: string | null },
  ) => request<ApiTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTask: (id: string) => request<{ ok: true }>(`/tasks/${id}`, { method: "DELETE" }),

  addBlock: (input: { startMin: number; endMin: number; title: string; categoryId?: string; date?: string }) =>
    request<ApiBlock>("/blocks", { method: "POST", body: JSON.stringify(input) }),
  deleteBlock: (id: string) => request<{ ok: true }>(`/blocks/${id}`, { method: "DELETE" }),

  toggleHabit: (id: string, date?: string) =>
    request<{ habitId: string; date: string; done: number }>(`/habits/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ date }),
    }),
  addHabit: (name: string) =>
    request<{ id: string; name: string }>("/habits", { method: "POST", body: JSON.stringify({ name }) }),
  deleteHabit: (id: string) => request<{ ok: true }>(`/habits/${id}`, { method: "DELETE" }),
  habitGrid: (days = 14) =>
    request<ApiHabitGrid>(`/habits/grid?days=${days}`),

  dayReview: (date: string) => request<ApiDayReview>(`/day-review/${date}`),
  saveDayReview: (date: string, patch: Partial<Omit<ApiDayReview, "date">>) =>
    request<ApiDayReview>(`/day-review/${date}`, { method: "PUT", body: JSON.stringify(patch) }),

  areas: () => request<ApiArea[]>("/areas"),
  addArea: (name: string, color?: string) =>
    request<{ id: string; name: string }>("/areas", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  deleteArea: (id: string) => request<{ ok: true }>(`/areas/${id}`, { method: "DELETE" }),

  projects: (status: "active" | "done" | "all" = "active") =>
    request<ApiProject[]>(`/projects?status=${status}`),
  addProject: (input: { name: string; areaId?: string; dueDate?: string }) =>
    request<ApiProject>("/projects", { method: "POST", body: JSON.stringify(input) }),
  patchProject: (
    id: string,
    patch: { name?: string; areaId?: string | null; status?: string; dueDate?: string | null },
  ) => request<ApiProject>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProject: (id: string) => request<{ ok: true }>(`/projects/${id}`, { method: "DELETE" }),
  projectTasks: (id: string) => request<ApiProjectTask[]>(`/projects/${id}/tasks`),

  courses: () => request<ApiCourse[]>("/courses"),
  addCourse: (input: {
    name: string;
    weekday: number;
    startMin: number;
    endMin: number;
    location?: string;
    weekType?: string;
    weekStart?: number | null;
    weekEnd?: number | null;
  }) => request<ApiCourse>("/courses", { method: "POST", body: JSON.stringify(input) }),
  deleteCourse: (id: string) => request<{ ok: true }>(`/courses/${id}`, { method: "DELETE" }),
  updateCourse: (
    id: string,
    patch: {
      name?: string;
      weekday?: number;
      startMin?: number;
      endMin?: number;
      location?: string | null;
      weekType?: string;
      weekStart?: number | null;
      weekEnd?: number | null;
    },
  ) => request<ApiCourse>(`/courses/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  periods: () => request<PeriodsConfig>("/settings/periods"),
  savePeriods: (p: PeriodsConfig) =>
    request<PeriodsConfig>("/settings/periods", { method: "PUT", body: JSON.stringify(p) }),
  semester: () => request<SemesterConfig>("/settings/semester"),
  saveSemester: (s: SemesterConfig) =>
    request<SemesterConfig>("/settings/semester", { method: "PUT", body: JSON.stringify(s) }),

  aiSettings: () => request<AiConfigInfo>("/settings/ai"),
  saveAi: (patch: { apiKey?: string; model?: string; base?: string }) =>
    request<{ ok: boolean; configured: boolean; source: string }>("/settings/ai", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  testAi: async (): Promise<{ ok: boolean; detail: string; status: number }> => {
    const res = await fetch(BASE + "/settings/ai/test", {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
    });
    const body = (await res.json().catch(() => ({ ok: false, detail: "bad response" }))) as {
      ok: boolean;
      detail: string;
    };
    return { ...body, status: res.status };
  },
  listAiModels: async (): Promise<{ ok: boolean; models: string[]; vision: string[]; detail: string }> => {
    const res = await fetch(BASE + "/settings/ai/models", { signal: AbortSignal.timeout(25_000) });
    return (await res.json().catch(() => ({ ok: false, models: [], vision: [], detail: "bad response" }))) as {
      ok: boolean;
      models: string[];
      vision: string[];
      detail: string;
    };
  },
  parseTimetable: (imageBase64: string, mimeType: string) =>
    request<{ candidates: CourseCandidate[]; periods: PeriodsConfig }>(
      "/courses/parse-image",
      { method: "POST", body: JSON.stringify({ imageBase64, mimeType }) },
      180_000,
    ),
  bulkCourses: (
    courses: {
      name: string;
      weekday: number;
      startMin: number;
      endMin: number;
      location?: string;
      weekType?: string;
      weekStart?: number | null;
      weekEnd?: number | null;
    }[],
  ) =>
    request<{ inserted: number; skipped: { name: string; reason: string }[] }>("/courses/bulk", {
      method: "POST",
      body: JSON.stringify({ courses }),
    }),

  saveJournal: (date: string, body: string) =>
    request<ApiJournal>(`/journal/${date}`, { method: "PUT", body: JSON.stringify({ body }) }),
};

/** 课表统一用这个颜色；时间块才按类别分色 */
export const COURSE_COLOR = "#9BA7B0";

export const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const toMin = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** ISO 周：与 server/src/week.ts 保持一致 */
export function isoWeekOf(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return { isoYear, isoWeek };
}

/** 本周一（本地零点） */
export function mondayOfThisWeek(): Date {
  const now = new Date();
  const dayNum = now.getDay() || 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayNum - 1));
  return monday;
}

export function shiftWeeks(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta * 7);
}
