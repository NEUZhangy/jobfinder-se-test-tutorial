import { getJob, getProfile, getStats, listJobs, processBatch, saveResume, saveSettings, setMark } from "./jobs";
import { syncAll } from "./listings";

const routes: Record<string, (req: Request, env: Env) => Promise<unknown>> = {
  "GET /api/state": (_req, env) => getStats(env.DB, env.LLM_MODEL),
  "GET /api/jobs": (req, env) => listJobs(env.DB, new URL(req.url).searchParams.get("q") ?? ""),
  "GET /api/job": (req, env) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "expected ?id=");
    return getJob(env.DB, id);
  },
  "PUT /api/job/mark": async (req, env) => {
    const body = (await req.json()) as { id?: unknown; mark?: unknown };
    if (typeof body.id !== "string" || !(body.mark === null || body.mark === "saved" || body.mark === "hidden")) {
      throw new HttpError(400, 'expected { id: string, mark: "saved" | "hidden" | null }');
    }
    await setMark(env.DB, body.id, body.mark);
    return { id: body.id, mark: body.mark };
  },
  "POST /api/sync": (_req, env) => syncAll(env.DB),
  "POST /api/process": (_req, env) => processBatch(env),
  "PUT /api/settings": async (req, env) => {
    const body = (await req.json()) as Record<string, unknown>;
    const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
    if (!strings(body.categories) || !strings(body.locationKeywords) || typeof body.needsSponsorship !== "boolean") {
      throw new HttpError(400, "expected { categories: string[], locationKeywords: string[], needsSponsorship: boolean }");
    }
    await saveSettings(env.DB, body as Parameters<typeof saveSettings>[1]);
    return getProfile(env.DB);
  },
  "POST /api/resume": async (req, env) => {
    const form = await req.formData();
    const file = form.get("file");
    const text = file instanceof File && file.size > 0 ? await pdfToText(env.AI, file) : String(form.get("text") ?? "");
    if (text.trim().length < 200) throw new HttpError(400, "resume text is too short; upload a PDF or paste the text");
    await saveResume(env.DB, text.trim());
    return { chars: text.length };
  },
};

const CRON_BUDGET_MS = 10 * 60 * 1000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function pdfToText(ai: Ai, file: File): Promise<string> {
  // Text extraction only: embedded images are skipped so no Workers AI model is called.
  const result = await ai.toMarkdown(
    { name: file.name, blob: new Blob([await file.arrayBuffer()], { type: "application/pdf" }) },
    { conversionOptions: { pdf: { images: { convert: false }, metadata: false } } },
  );
  if (result.format === "error") throw new HttpError(400, `could not read PDF: ${result.error}`);
  return result.data;
}

export default {
  async fetch(req, env): Promise<Response> {
    const route = routes[`${req.method} ${new URL(req.url).pathname}`];
    if (!route) return Response.json({ error: "not found" }, { status: 404 });
    try {
      return Response.json(await route(req, env));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      console.error(JSON.stringify({ route: `${req.method} ${req.url}`, error: String(e) }));
      return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status });
    }
  },

  // Every 6 hours: one full sync, then batches until nothing is left or the time budget is used.
  async scheduled(_controller, env) {
    const sync = await syncAll(env.DB).catch((e) => ({ error: String(e) }));
    const stopAt = Date.now() + CRON_BUDGET_MS;
    let batches = 0;
    let crawled = 0;
    let evaluated = 0;
    while (Date.now() < stopAt) {
      const batch = await processBatch(env);
      batches++;
      crawled += batch.crawled;
      evaluated += batch.evaluated;
      if (batch.crawled + batch.evaluated === 0) break;
    }
    console.log(JSON.stringify({ event: "cron", sync, batches, crawled, evaluated }));
  },
} satisfies ExportedHandler<Env>;
