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

export interface ApiJournal {
  date: string;
  mood: number | null;
  body: string;
}

export interface ApiDay {
  date: string;
  week: WeekInfo;
  tasks: ApiTask[];
  blocks: ApiBlock[];
  habits: ApiHabit[];
  journal: ApiJournal | null;
}

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
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

export const api = {
  meta: () => request<ApiMeta>("/meta"),
  day: (date?: string) => request<ApiDay>(`/day${date ? `?date=${date}` : ""}`),

  addTask: (title: string, date?: string) =>
    request<ApiTask>("/tasks", { method: "POST", body: JSON.stringify({ title, date }) }),
  setTaskStatus: (id: string, status: ApiTask["status"]) =>
    request<ApiTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteTask: (id: string) => request<{ ok: true }>(`/tasks/${id}`, { method: "DELETE" }),

  addBlock: (input: { startMin: number; endMin: number; title: string; categoryId?: string; date?: string }) =>
    request<ApiBlock>("/blocks", { method: "POST", body: JSON.stringify(input) }),
  deleteBlock: (id: string) => request<{ ok: true }>(`/blocks/${id}`, { method: "DELETE" }),

  toggleHabit: (id: string, date?: string) =>
    request<{ habitId: string; date: string; done: number }>(`/habits/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ date }),
    }),

  saveJournal: (date: string, body: string) =>
    request<ApiJournal>(`/journal/${date}`, { method: "PUT", body: JSON.stringify({ body }) }),
};

export const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const toMin = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
