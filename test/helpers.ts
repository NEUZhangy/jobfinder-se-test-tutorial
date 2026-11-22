import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

// A local in-memory D1 (workerd SQLite). No remote binding, no .dev.vars, nothing persisted to disk.
export async function openDb() {
  const proxy = await getPlatformProxy<Env>({ persist: false, remoteBindings: false, envFiles: [] });
  const db = proxy.env.DB;
  const dir = join(import.meta.dirname, "..", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8").replace(/\n/g, " "));
  }
  return { db, dispose: () => proxy.dispose() };
}

const TABLES = ["job_marks", "evaluations", "job_pages", "jobs"];

export async function resetDb(db: D1Database) {
  await db.batch([
    ...TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)),
    db.prepare(
      `UPDATE profile SET resume_text = NULL, resume_version = 0, categories = '["Software","AI/ML/Data"]',
         location_keywords = '[]', needs_sponsorship = 1 WHERE id = 1`,
    ),
    db.prepare("UPDATE sync_state SET etag = NULL, at = NULL WHERE id = 1"),
  ]);
}

export const fakeAi = (result: unknown = { format: "markdown", data: "" }) => {
  const toMarkdown = vi.fn(async () => result);
  return { ai: { toMarkdown } as unknown as Ai, toMarkdown };
};

export const makeEnv = (db: D1Database, over: Partial<Env> = {}): Env => ({
  DB: db,
  AI: fakeAi().ai,
  BATCH_SIZE: "10",
  LLM_MODEL: "test/model",
  LLM_BASE_URL: "https://llm.test/v1",
  LLM_API_KEY: "test-key",
  ...over,
});

export const NOW = 1_800_000_000_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const freezeTime = (ms = NOW) => vi.spyOn(Date, "now").mockImplementation(() => ms);

export type JobSeed = {
  id: string;
  company?: string;
  title?: string;
  category?: string;
  url?: string;
  locations?: string[];
  active?: number;
  date_posted?: number;
  date_updated?: number;
};

export async function addJob(db: D1Database, j: JobSeed) {
  await db
    .prepare("INSERT INTO jobs (id, company, title, category, url, locations, active, date_posted, date_updated) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(
      j.id,
      j.company ?? "Acme",
      j.title ?? "Software Engineer, New Grad",
      j.category ?? "Software",
      j.url ?? `https://careers.example.com/${j.id}`,
      JSON.stringify(j.locations ?? ["New York, NY"]),
      j.active ?? 1,
      j.date_posted ?? 1_790_000_000,
      j.date_updated ?? 1_790_000_100,
    )
    .run();
}

export async function addPage(
  db: D1Database,
  jobId: string,
  p: { status?: "ok" | "closed" | "failed"; description?: string | null; error?: string | null; fetched_at?: number } = {},
) {
  const status = p.status ?? "ok";
  await db
    .prepare("INSERT OR REPLACE INTO job_pages (job_id, status, description, error, fetched_at) VALUES (?,?,?,?,?)")
    .bind(jobId, status, p.description === undefined ? (status === "ok" ? LONG_DESC : null) : p.description, p.error ?? null, p.fetched_at ?? NOW)
    .run();
}

export async function addEval(
  db: D1Database,
  jobId: string,
  e: { version?: number; fit?: number | null; sponsorship?: string | null; model?: string; error?: string | null; at?: number } = {},
) {
  await db
    .prepare("INSERT OR REPLACE INTO evaluations (job_id, resume_version, fit, sponsorship, new_grad_p, model, error, evaluated_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(jobId, e.version ?? 1, e.fit === undefined ? 2 : e.fit, e.sponsorship ?? "not_mentioned", 0.9, e.model ?? "test/model", e.error ?? null, e.at ?? NOW)
    .run();
}

export const RESUME = "Jane Doe. Computer science graduate. Built distributed systems in Go and TypeScript. ".repeat(4);

export const setResume = (db: D1Database, version = 1, text = RESUME) =>
  db.prepare("UPDATE profile SET resume_text = ?, resume_version = ? WHERE id = 1").bind(text, version).run();

export const setSettings = (db: D1Database, s: { categories?: string[]; locationKeywords?: string[]; needsSponsorship?: boolean }) =>
  db
    .prepare("UPDATE profile SET categories = ?, location_keywords = ?, needs_sponsorship = ? WHERE id = 1")
    .bind(JSON.stringify(s.categories ?? ["Software", "AI/ML/Data"]), JSON.stringify(s.locationKeywords ?? []), s.needsSponsorship === false ? 0 : 1)
    .run();

// A posting long enough to pass the 300 character minimum of pages.ts.
export const LONG_DESC = "We are hiring new graduate engineers to build reliable systems. ".repeat(8);
export const LONG_HTML = `<div><h2>About</h2><p>${LONG_DESC}</p></div>`;

type Handler = (req: Request) => Response | Promise<Response>;

// Replaces global fetch with a URL router. Anything unrouted is an error: no test touches the network,
// except the local workerd proxy that the D1 binding itself talks to.
export function stubFetch(routes: Record<string, Handler> = {}) {
  const real = globalThis.fetch;
  const table = new Map<string, Handler>(Object.entries(routes));
  const calls: Request[] = [];
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const { hostname } = new URL(req.url);
    if (hostname === "127.0.0.1" || hostname === "localhost") return real(input, init);
    calls.push(req.clone());
    const handler = table.get(req.url);
    if (!handler) throw new Error(`unrouted fetch: ${req.method} ${req.url}`);
    return handler(req);
  });
  vi.stubGlobal("fetch", stub);
  return {
    calls,
    route: (url: string, handler: Handler) => void table.set(url, handler),
  };
}

export const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);

// One local D1 per test file, emptied before every test. Mocks and stubs are undone after every test.
export function useDb() {
  let ctx: Awaited<ReturnType<typeof openDb>>;
  beforeAll(async () => {
    ctx = await openDb();
  });
  afterAll(() => ctx.dispose());
  beforeEach(() => resetDb(ctx.db));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  return () => ctx.db;
}

export const quiet = () => ({
  log: vi.spyOn(console, "log").mockImplementation(() => {}),
  error: vi.spyOn(console, "error").mockImplementation(() => {}),
});

export const logged = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
