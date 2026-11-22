export type Sponsorship = "offers" | "no_sponsorship" | "citizenship_required" | "not_mentioned";
export type Mark = "saved" | "hidden";

export type Profile = {
  resumeVersion: number;
  hasResume: boolean;
  categories: string[];
  locationKeywords: string[];
  needsSponsorship: boolean;
};

export type AppState = {
  counts: { active: number; in_scope: number; crawled: number; evaluated: number };
  categories: { category: string; n: number }[];
  lastSync: number | null;
  profile: Profile;
};

export type Job = {
  id: string;
  company: string;
  title: string;
  category: string;
  url: string;
  locations: string[];
  date_posted: number;
  page_status: "ok" | "closed" | "failed" | null;
  mark: Mark | null;
  eval_error: string | null;
  fit: number | null;
  sponsorship: Sponsorship | null;
  new_grad_p: number | null;
};

export type JobDetail = {
  id: string;
  pageStatus: "ok" | "closed" | "failed" | null;
  pageError: string | null;
  description: string | null;
  visaSentence: string | null;
};

export type Settings = Pick<Profile, "categories" | "locationKeywords" | "needsSponsorship">;
type CallStats = { count: number; avgMs: number; maxMs: number };
type BatchResult = {
  crawled: number;
  evaluated: number;
  errors: string[];
  timing: { batchMs: number; crawl: CallStats; evaluate: CallStats };
};

async function call<T>(method: string, path: string, body?: BodyInit, json = false): Promise<T> {
  const res = await fetch(path, { method, body, headers: json ? { "content-type": "application/json" } : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export const api = {
  state: () => call<AppState>("GET", "/api/state"),
  jobs: (q: string) => call<Job[]>("GET", `/api/jobs?q=${encodeURIComponent(q)}`),
  job: (id: string) => call<JobDetail>("GET", `/api/job?id=${encodeURIComponent(id)}`),
  mark: (id: string, mark: Mark | null) => call<{ id: string; mark: Mark | null }>("PUT", "/api/job/mark", JSON.stringify({ id, mark }), true),
  saveSettings: (s: Settings) => call<Profile>("PUT", "/api/settings", JSON.stringify(s), true),
  saveResume: (form: FormData) => call<{ chars: number }>("POST", "/api/resume", form),
  sync: () => call<{ changed: boolean; seen: number }>("POST", "/api/sync"),
  process: () => call<BatchResult>("POST", "/api/process"),
};
