import { evaluate, visaSentence } from "./evaluate";
import { fetchJobPage } from "./pages";

export type Profile = {
  resumeText: string | null;
  resumeVersion: number;
  categories: string[];
  locationKeywords: string[];
  needsSponsorship: boolean;
};

type ProfileRow = {
  resume_text: string | null;
  resume_version: number;
  categories: string;
  location_keywords: string;
  needs_sponsorship: number;
};

export async function getProfile(db: D1Database): Promise<Profile> {
  const row = (await db.prepare("SELECT * FROM profile WHERE id = 1").first<ProfileRow>())!;
  return {
    resumeText: row.resume_text,
    resumeVersion: row.resume_version,
    categories: JSON.parse(row.categories),
    locationKeywords: JSON.parse(row.location_keywords),
    needsSponsorship: row.needs_sponsorship === 1,
  };
}

export async function saveSettings(db: D1Database, s: Pick<Profile, "categories" | "locationKeywords" | "needsSponsorship">) {
  await db
    .prepare("UPDATE profile SET categories = ?, location_keywords = ?, needs_sponsorship = ? WHERE id = 1")
    .bind(JSON.stringify(s.categories), JSON.stringify(s.locationKeywords), s.needsSponsorship ? 1 : 0)
    .run();
}

export async function saveResume(db: D1Database, text: string) {
  await db
    .prepare("UPDATE profile SET resume_text = ?, resume_version = resume_version + 1 WHERE id = 1")
    .bind(text)
    .run();
}

// A job is in scope when it is active, in a chosen category, and matches a location keyword (or none are set).
// Keywords match whole words with case, so "NY" matches "New York, NY" but not "Sunnyvale, CA",
// and "IN" (Indiana) does not match "Remote in USA".
// jobs.active is the upstream status. A crawl that finds the page gone (job_pages.status = 'closed') also removes the job.
const IN_SCOPE = `
  j.active = 1
  AND NOT EXISTS (SELECT 1 FROM job_pages c WHERE c.job_id = j.id AND c.status = 'closed')
  AND j.category IN (SELECT value FROM json_each(?1))
  AND (json_array_length(?2) = 0
       OR EXISTS (SELECT 1 FROM json_each(?2) k
                  WHERE instr(' ' || replace(replace(replace(replace(j.locations, '"', ' '), ',', ' '), '[', ' '), ']', ' ') || ' ',
                              ' ' || k.value || ' ') > 0))`;

// Crawl a job with no page yet, one whose listing changed after the last fetch, or a failure older than a day.
const NEEDS_CRAWL = `
  NOT EXISTS (SELECT 1 FROM job_pages p WHERE p.job_id = j.id
              AND p.fetched_at >= j.date_updated * 1000
              AND (p.status <> 'failed' OR p.fetched_at > ?3 - 86400000))`;

const scopeParams = (p: Profile) => [JSON.stringify(p.categories), JSON.stringify(p.locationKeywords)];

type JobRow = { id: string; company: string; title: string; locations: string; description: string | null };

type Timed<T> = { ok: true; value: T; ms: number } | { ok: false; error: unknown; ms: number };

// Date.now() advances only across I/O in Workers, which is exactly the network wait being measured.
async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, value, ms: Date.now() - start };
  } catch (error) {
    return { ok: false, error, ms: Date.now() - start };
  }
}

const summarize = (ms: number[]) => ({
  count: ms.length,
  avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
  maxMs: ms.length ? Math.max(...ms) : 0,
});

export type BatchResult = {
  crawled: number;
  evaluated: number;
  errors: string[];
  timing: { batchMs: number; crawl: ReturnType<typeof summarize>; evaluate: ReturnType<typeof summarize> };
};

export async function processBatch(env: Env): Promise<BatchResult> {
  const batchStart = Date.now();
  const db = env.DB;
  const limit = Number(env.BATCH_SIZE);
  const profile = await getProfile(db);
  const errors: string[] = [];

  const toCrawl = await db
    .prepare(
      `SELECT j.id, j.url FROM jobs j
       WHERE ${IN_SCOPE} AND ${NEEDS_CRAWL}
       ORDER BY j.date_posted DESC LIMIT ?4`,
    )
    .bind(...scopeParams(profile), Date.now(), limit)
    .all<{ id: string; url: string }>();

  const crawls = await Promise.all(
    toCrawl.results.map(async (j) => {
      const t = await timed(() => fetchJobPage(j.url));
      return { id: j.id, host: new URL(j.url).hostname, ms: t.ms, page: t.ok ? t.value : { status: "failed" as const, error: String(t.error) } };
    }),
  );
  const now = Date.now();
  const savePage = db.prepare(
    "INSERT OR REPLACE INTO job_pages (job_id, status, description, error, fetched_at) VALUES (?, ?, ?, ?, ?)",
  );
  if (crawls.length) {
    await db.batch(
      crawls.map(({ id, page }) =>
        savePage.bind(
          id,
          page.status,
          page.status === "ok" ? page.description : null,
          page.status === "failed" ? page.error : null,
          now,
        ),
      ),
    );
  }

  const llm = { baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL, apiKey: env.LLM_API_KEY };
  const finish = (evals: { company: string; ms: number; ok: boolean }[]): BatchResult => {
    const timing = {
      batchMs: Date.now() - batchStart,
      crawl: summarize(crawls.map((c) => c.ms)),
      evaluate: summarize(evals.map((e) => e.ms)),
    };
    console.log(
      JSON.stringify({
        event: "batch",
        model: llm.model,
        timing,
        calls: [
          ...crawls.map((c) => ({ step: "crawl", host: c.host, ms: c.ms, status: c.page.status })),
          ...evals.map((e) => ({ step: "evaluate", company: e.company, ms: e.ms, ok: e.ok })),
        ],
      }),
    );
    return { crawled: crawls.length, evaluated: evals.filter((e) => e.ok).length, errors, timing };
  };

  if (!profile.resumeText) return finish([]);

  const toEvaluate = await db
    .prepare(
      `SELECT j.id, j.company, j.title, j.locations, p.description FROM jobs j
       JOIN job_pages p ON p.job_id = j.id AND p.status IN ('ok', 'failed')
       WHERE ${IN_SCOPE}
         AND NOT EXISTS (SELECT 1 FROM evaluations e WHERE e.job_id = j.id AND e.resume_version = ?3 AND e.model = ?6
                         AND (e.error IS NULL OR e.evaluated_at > ?4 - 3600000))
       ORDER BY j.date_posted DESC LIMIT ?5`,
    )
    .bind(...scopeParams(profile), profile.resumeVersion, Date.now(), limit, llm.model)
    .all<JobRow>();

  const resume = profile.resumeText;
  const results = await Promise.all(
    toEvaluate.results.map(({ id, locations, ...job }) =>
      timed(() => evaluate(llm, resume, { ...job, locations: JSON.parse(locations) })),
    ),
  );
  // Failures are stored too, so a job that always fails cannot block the queue; they are retried after an hour.
  const saveEval = db.prepare(
    `INSERT OR REPLACE INTO evaluations
     (job_id, resume_version, fit, sponsorship, new_grad_p, model, error, evaluated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const rows = results.map((r, i) => {
    const id = toEvaluate.results[i].id;
    if (!r.ok) {
      errors.push(String(r.error));
      return saveEval.bind(id, profile.resumeVersion, null, null, null, llm.model, String(r.error), now);
    }
    const e = r.value;
    return saveEval.bind(id, profile.resumeVersion, e.fit, e.sponsorship, e.new_grad_p, e.model, null, now);
  });
  if (rows.length) await db.batch(rows);
  return finish(results.map((r, i) => ({ company: toEvaluate.results[i].company, ms: r.ms, ok: r.ok })));
}

export async function listJobs(db: D1Database, q: string) {
  const profile = await getProfile(db);
  const { results } = await db
    .prepare(
      `SELECT j.id, j.company, j.title, j.category, j.url, j.locations, j.date_posted,
              p.status AS page_status, m.mark, e.error AS eval_error, e.fit, e.sponsorship, e.new_grad_p
       FROM jobs j
       LEFT JOIN job_pages p ON p.job_id = j.id
       LEFT JOIN job_marks m ON m.job_id = j.id
       LEFT JOIN evaluations e ON e.job_id = j.id AND e.resume_version = ?3
       WHERE ${IN_SCOPE}
         AND (?4 = '' OR j.company LIKE '%' || ?4 || '%' OR j.title LIKE '%' || ?4 || '%' OR j.locations LIKE '%' || ?4 || '%')
         AND (?5 = 0 OR e.sponsorship IS NULL OR e.sponsorship NOT IN ('no_sponsorship', 'citizenship_required'))
       ORDER BY m.mark IS 'hidden', e.fit IS NULL, e.fit DESC, j.date_posted DESC
       LIMIT 2000`,
    )
    .bind(...scopeParams(profile), profile.resumeVersion, q, profile.needsSponsorship ? 1 : 0)
    .all();
  return results.map((r) => ({ ...r, locations: JSON.parse(r.locations as string) }));
}

export type Mark = "saved" | "hidden";

export async function getJob(db: D1Database, id: string) {
  const page = await db
    .prepare("SELECT status, description, error FROM job_pages WHERE job_id = ?")
    .bind(id)
    .first<{ status: string; description: string | null; error: string | null }>();
  return {
    id,
    pageStatus: page?.status ?? null,
    pageError: page?.error ?? null,
    description: page?.description ?? null,
    visaSentence: page?.description ? visaSentence(page.description) : null,
  };
}

export async function setMark(db: D1Database, id: string, mark: Mark | null) {
  await (mark
    ? db.prepare("INSERT OR REPLACE INTO job_marks (job_id, mark, marked_at) VALUES (?, ?, ?)").bind(id, mark, Date.now())
    : db.prepare("DELETE FROM job_marks WHERE job_id = ?").bind(id)
  ).run();
}

export async function getStats(db: D1Database, model: string) {
  const profile = await getProfile(db);
  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM jobs WHERE active = 1) AS active,
         (SELECT COUNT(*) FROM jobs j WHERE ${IN_SCOPE}) AS in_scope,
         (SELECT COUNT(*) FROM jobs j JOIN job_pages p ON p.job_id = j.id WHERE ${IN_SCOPE}) AS crawled,
         (SELECT COUNT(*) FROM jobs j JOIN evaluations e ON e.job_id = j.id AND e.resume_version = ?3 AND e.model = ?4 AND e.error IS NULL WHERE ${IN_SCOPE}) AS evaluated`,
    )
    .bind(...scopeParams(profile), profile.resumeVersion, model)
    .first();
  const categories = await db
    .prepare("SELECT category, COUNT(*) AS n FROM jobs WHERE active = 1 GROUP BY category ORDER BY n DESC")
    .all();
  const sync = await db.prepare("SELECT at FROM sync_state WHERE id = 1").first<number>("at");
  return {
    counts,
    categories: categories.results,
    lastSync: sync,
    profile: { ...profile, resumeText: undefined, hasResume: profile.resumeText != null },
  };
}
