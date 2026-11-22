import { describe, expect, it, vi } from "vitest";
import { getJob, getProfile, getStats, listJobs, processBatch, saveResume, saveSettings, setMark } from "../src/jobs.ts";
import {
  DAY, HOUR, LONG_DESC, LONG_HTML, NOW, RESUME, addEval, addJob, addPage, freezeTime, json, makeEnv, quiet,
  setResume, setSettings, stubFetch, useDb,
} from "./helpers";

const db = useDb();
const DECISIONS = "https://llm.test/v1/decisions";
const goodAnswer = { answers: { fit: { score: 2 }, sponsorship: { choice: "offers" }, new_grad: { noul: 0.7 } } };
const page = (id: string) => `https://careers.example.com/${id}`;
const html = () => new Response(LONG_HTML);

const ids = async (q = "") => (await listJobs(db(), q)).map((j) => j.id);
const pageRow = (id: string) => db().prepare("SELECT * FROM job_pages WHERE job_id = ?").bind(id).first<Record<string, unknown>>();

describe("profile", () => {
  it("has defaults, saves settings, and bumps the resume version on each resume", async () => {
    expect(await getProfile(db())).toEqual({
      resumeText: null, resumeVersion: 0, categories: ["Software", "AI/ML/Data"], locationKeywords: [], needsSponsorship: true,
    });
    await saveSettings(db(), { categories: ["Hardware"], locationKeywords: ["NY"], needsSponsorship: false });
    await saveResume(db(), "first");
    await saveResume(db(), "second");
    expect(await getProfile(db())).toEqual({
      resumeText: "second", resumeVersion: 2, categories: ["Hardware"], locationKeywords: ["NY"], needsSponsorship: false,
    });
  });
});

describe("scope rules", () => {
  it("includes only active jobs in a chosen category", async () => {
    await addJob(db(), { id: "sw" });
    await addJob(db(), { id: "ml", category: "AI/ML/Data" });
    await addJob(db(), { id: "hw", category: "Hardware" });
    await addJob(db(), { id: "closed", active: 0 });
    expect((await ids()).sort()).toEqual(["ml", "sw"]);
    await setSettings(db(), { categories: ["Hardware"] });
    expect(await ids()).toEqual(["hw"]);
  });

  it("matches location keywords as whole words with case", async () => {
    await addJob(db(), { id: "ny", locations: ["New York, NY"] });
    await addJob(db(), { id: "sunny", locations: ["Sunnyvale, CA"] });
    await addJob(db(), { id: "remote", locations: ["Remote in USA"] });
    await addJob(db(), { id: "indy", locations: ["Indianapolis, IN"] });
    await addJob(db(), { id: "multi", locations: ["Austin, TX", "Boston, MA"] });

    await setSettings(db(), { locationKeywords: ["NY"] });
    expect(await ids()).toEqual(["ny"]);
    await setSettings(db(), { locationKeywords: ["IN"] });
    expect(await ids()).toEqual(["indy"]);
    await setSettings(db(), { locationKeywords: ["ny"] });
    expect(await ids()).toEqual([]);
    await setSettings(db(), { locationKeywords: ["Remote", "MA"] });
    expect((await ids()).sort()).toEqual(["multi", "remote"]);
    await setSettings(db(), { locationKeywords: ["New York"] });
    expect(await ids()).toEqual(["ny"]);
    await setSettings(db(), { locationKeywords: [] });
    expect(await ids()).toHaveLength(5);
  });

  it("drops a job whose page turned out to be closed", async () => {
    await addJob(db(), { id: "a" });
    await addJob(db(), { id: "b" });
    await addPage(db(), "a", { status: "closed" });
    await addPage(db(), "b", { status: "failed", error: "HTTP 500" });
    expect(await ids()).toEqual(["b"]);
  });
});

describe("processBatch crawling", () => {
  const env = (over = {}) => makeEnv(db(), { BATCH_SIZE: "10", ...over });
  const crawledUrls = (f: ReturnType<typeof stubFetch>) => f.calls.map((c) => c.url).sort();

  it("crawls jobs with no page and stores ok, closed and failed pages", async () => {
    quiet();
    freezeTime();
    await addJob(db(), { id: "ok" });
    await addJob(db(), { id: "gone" });
    await addJob(db(), { id: "bad" });
    stubFetch({
      [page("ok")]: html,
      [page("gone")]: () => new Response("", { status: 404 }),
      [page("bad")]: () => new Response("", { status: 500 }),
    });
    const r = await processBatch(env());
    expect(r).toMatchObject({ crawled: 3, evaluated: 0, errors: [] });
    expect(await pageRow("ok")).toMatchObject({ status: "ok", description: expect.stringContaining("new graduate"), error: null, fetched_at: NOW });
    expect(await pageRow("gone")).toMatchObject({ status: "closed", description: null });
    expect(await pageRow("bad")).toMatchObject({ status: "failed", description: null, error: "HTTP 500" });
    expect((await ids()).sort()).toEqual(["bad", "ok"]);
  });

  it("crawls the newest jobs first and no more than BATCH_SIZE", async () => {
    quiet();
    freezeTime();
    await addJob(db(), { id: "old", date_posted: 1_700_000_000 });
    await addJob(db(), { id: "mid", date_posted: 1_750_000_000 });
    await addJob(db(), { id: "new", date_posted: 1_790_000_000 });
    const f = stubFetch({ [page("mid")]: html, [page("new")]: html });
    await processBatch(env({ BATCH_SIZE: "2" }));
    expect(crawledUrls(f)).toEqual([page("mid"), page("new")]);
  });

  it("skips jobs outside the scope", async () => {
    quiet();
    freezeTime();
    await addJob(db(), { id: "hw", category: "Hardware" });
    await addJob(db(), { id: "off", active: 0 });
    const f = stubFetch();
    expect(await processBatch(env())).toMatchObject({ crawled: 0 });
    expect(f.calls).toHaveLength(0);
  });

  it("does not re-crawl a fetched page, but re-crawls one whose listing changed afterwards", async () => {
    quiet();
    freezeTime();
    const sec = NOW / 1000;
    await addJob(db(), { id: "fresh", date_updated: sec - 7200 });
    await addPage(db(), "fresh", { fetched_at: NOW - HOUR });
    await addJob(db(), { id: "stale", date_updated: sec - 60 });
    await addPage(db(), "stale", { fetched_at: NOW - HOUR });
    const f = stubFetch({ [page("stale")]: html });
    expect(await processBatch(env())).toMatchObject({ crawled: 1 });
    expect(crawledUrls(f)).toEqual([page("stale")]);
    expect(await pageRow("stale")).toMatchObject({ fetched_at: NOW });
  });

  it("retries a failed page only after a day", async () => {
    quiet();
    freezeTime();
    await addJob(db(), { id: "recent" });
    await addPage(db(), "recent", { status: "failed", error: "HTTP 500", fetched_at: NOW - HOUR });
    await addJob(db(), { id: "dayold" });
    await addPage(db(), "dayold", { status: "failed", error: "HTTP 500", fetched_at: NOW - DAY - 1000 });
    const f = stubFetch({ [page("dayold")]: html });
    expect(await processBatch(env())).toMatchObject({ crawled: 1 });
    expect(crawledUrls(f)).toEqual([page("dayold")]);
    expect(await pageRow("dayold")).toMatchObject({ status: "ok" });
  });

  it("reports timing, with zero averages for an empty batch", async () => {
    quiet();
    freezeTime();
    const r = await processBatch(env());
    expect(r.timing).toEqual({
      batchMs: 0, crawl: { count: 0, avgMs: 0, maxMs: 0 }, evaluate: { count: 0, avgMs: 0, maxMs: 0 },
    });

    let t = NOW;
    vi.spyOn(Date, "now").mockImplementation(() => (t += 10));
    await addJob(db(), { id: "slow" });
    stubFetch({ [page("slow")]: html });
    const timed = await processBatch(env());
    expect(timed.timing.crawl.count).toBe(1);
    expect(timed.timing.crawl.maxMs).toBeGreaterThan(0);
    expect(timed.timing.batchMs).toBeGreaterThanOrEqual(timed.timing.crawl.maxMs);
  });

  it("logs one JSON line per batch with the crawl calls", async () => {
    const { log } = quiet();
    freezeTime();
    await addJob(db(), { id: "a" });
    stubFetch({ [page("a")]: html });
    await processBatch(env());
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({ event: "batch", model: "test/model", calls: [{ step: "crawl", host: "careers.example.com", status: "ok" }] });
  });
});

describe("processBatch evaluation", () => {
  const env = (over = {}) => makeEnv(db(), over);
  const evalRows = (id: string) => db().prepare("SELECT * FROM evaluations WHERE job_id = ?").bind(id).all<Record<string, unknown>>().then((r) => r.results);
  const withLlm = (extra: Record<string, () => Response> = {}) =>
    stubFetch({ [DECISIONS]: () => json(goodAnswer), [page("a")]: html, [page("b")]: html, ...extra });

  it("does not evaluate without a resume", async () => {
    quiet();
    freezeTime();
    await addJob(db(), { id: "a" });
    const f = withLlm();
    expect(await processBatch(env())).toMatchObject({ crawled: 1, evaluated: 0 });
    expect(f.calls.map((c) => c.url)).toEqual([page("a")]);
  });

  it("crawls and then scores a job in the same batch", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "a" });
    const f = withLlm();
    expect(await processBatch(env())).toMatchObject({ crawled: 1, evaluated: 1, errors: [] });
    const sent = await f.calls.find((c) => c.url === DECISIONS)!.json();
    expect(sent.state.job).toMatchObject({ company: "Acme", locations: ["New York, NY"] });
    expect(sent.state.job.description).toContain("new graduate");
    expect(await evalRows("a")).toEqual([
      expect.objectContaining({ resume_version: 1, fit: 2, sponsorship: "offers", new_grad_p: 0.7, model: "test/model", error: null, evaluated_at: NOW }),
    ]);
    const [job] = await listJobs(db(), "");
    expect(job).toMatchObject({ id: "a", fit: 2, sponsorship: "offers", eval_error: null, page_status: "ok" });
  });

  it("scores a job whose page failed from the title alone", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "a" });
    await addPage(db(), "a", { status: "failed", error: "HTTP 500", fetched_at: NOW - HOUR });
    const f = withLlm();
    expect(await processBatch(env())).toMatchObject({ crawled: 0, evaluated: 1 });
    expect((await f.calls[0].json()).state.job.description).toMatch(/title only/);
  });

  it("stores a failure with its error and reports it", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "a" });
    await addPage(db(), "a");
    withLlm({ [DECISIONS]: () => new Response("rate limited", { status: 429 }) });
    const r = await processBatch(env());
    expect(r).toMatchObject({ crawled: 0, evaluated: 0 });
    expect(r.errors).toEqual(["Error: test/model HTTP 429: rate limited"]);
    expect(await evalRows("a")).toEqual([expect.objectContaining({ fit: null, sponsorship: null, error: "Error: test/model HTTP 429: rate limited" })]);
    expect((await listJobs(db(), ""))[0]).toMatchObject({ fit: null, eval_error: "Error: test/model HTTP 429: rate limited" });
  });

  it("retries a failed evaluation only after an hour", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "recent" });
    await addPage(db(), "recent");
    await addEval(db(), "recent", { fit: null, sponsorship: null, error: "boom", at: NOW - HOUR / 2 });
    await addJob(db(), { id: "hourold" });
    await addPage(db(), "hourold");
    await addEval(db(), "hourold", { fit: null, sponsorship: null, error: "boom", at: NOW - HOUR - 1000 });
    const f = withLlm();
    expect(await processBatch(env())).toMatchObject({ evaluated: 1 });
    expect(f.calls).toHaveLength(1);
    expect((await evalRows("hourold"))[0]).toMatchObject({ error: null, fit: 2 });
    expect((await evalRows("recent"))[0]).toMatchObject({ error: "boom" });
  });

  it("does not re-score a job with a successful score from the same model and resume", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "a" });
    await addPage(db(), "a");
    await addEval(db(), "a", { version: 1, model: "test/model", at: NOW - 30 * DAY });
    const f = withLlm();
    expect(await processBatch(env())).toMatchObject({ crawled: 0, evaluated: 0 });
    expect(f.calls).toHaveLength(0);
  });

  it("re-scores when the model changes", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "a" });
    await addPage(db(), "a");
    await addEval(db(), "a", { version: 1, model: "old/model", fit: 0 });
    withLlm();
    expect(await processBatch(env({ LLM_MODEL: "test/model" }))).toMatchObject({ evaluated: 1 });
    expect(await evalRows("a")).toEqual([expect.objectContaining({ model: "test/model", fit: 2 })]);
  });

  it("re-scores when a new resume is uploaded, without re-crawling", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "a" });
    await addPage(db(), "a");
    await addEval(db(), "a", { version: 1 });
    await saveResume(db(), RESUME);
    const f = withLlm();
    expect(await processBatch(env())).toMatchObject({ crawled: 0, evaluated: 1 });
    expect(f.calls.map((c) => c.url)).toEqual([DECISIONS]);
    expect((await evalRows("a")).map((r) => r.resume_version).sort()).toEqual([1, 2]);
  });

  it("does not score a job whose page is closed", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "a" });
    await addPage(db(), "a", { status: "closed" });
    const f = withLlm();
    expect(await processBatch(env())).toMatchObject({ crawled: 0, evaluated: 0 });
    expect(f.calls).toHaveLength(0);
  });

  it("limits evaluations to BATCH_SIZE, newest first", async () => {
    quiet();
    freezeTime();
    await setResume(db(), 1);
    for (const [id, posted] of [["a", 1_790_000_003], ["b", 1_790_000_002], ["c", 1_790_000_001]] as const) {
      await addJob(db(), { id, date_posted: posted });
      await addPage(db(), id);
    }
    withLlm();
    expect(await processBatch(env({ BATCH_SIZE: "2" }))).toMatchObject({ evaluated: 2 });
    const done = await db().prepare("SELECT job_id FROM evaluations ORDER BY job_id").all<{ job_id: string }>();
    expect(done.results.map((r) => r.job_id)).toEqual(["a", "b"]);
  });

  it("logs evaluate calls with the company and outcome", async () => {
    const { log } = quiet();
    freezeTime();
    await setResume(db(), 1);
    await addJob(db(), { id: "a", company: "Globex" });
    await addPage(db(), "a");
    withLlm();
    await processBatch(env());
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line.calls).toEqual([{ step: "evaluate", company: "Globex", ms: 0, ok: true }]);
  });
});

describe("listJobs", () => {
  it("orders hidden last, then by fit, then unscored, then newest", async () => {
    await setResume(db(), 1);
    const seeds: [string, number | null, number, string?][] = [
      ["low", 1, 100], ["high", 3, 100], ["unscored-new", null, 300], ["unscored-old", null, 200], ["hidden-high", 3, 400, "hidden"],
    ];
    for (const [id, fit, posted, mark] of seeds) {
      await addJob(db(), { id, date_posted: posted });
      if (fit !== null) await addEval(db(), id, { fit });
      if (mark) await setMark(db(), id, mark as "hidden");
    }
    expect(await ids()).toEqual(["high", "low", "unscored-new", "unscored-old", "hidden-high"]);
  });

  it("searches company, title and location without regard to case", async () => {
    await addJob(db(), { id: "a", company: "Globex", title: "Compiler Engineer", locations: ["Austin, TX"] });
    await addJob(db(), { id: "b", company: "Initech", title: "Web Developer", locations: ["Boston, MA"] });
    expect(await ids("globex")).toEqual(["a"]);
    expect(await ids("DEVELOPER")).toEqual(["b"]);
    expect(await ids("austin")).toEqual(["a"]);
    expect(await ids("nothing matches")).toEqual([]);
    expect((await ids("")).sort()).toEqual(["a", "b"]);
  });

  it("hides jobs that rule out sponsorship only when the user needs it", async () => {
    await setResume(db(), 1);
    for (const [id, s] of [["none", "no_sponsorship"], ["citizen", "citizenship_required"], ["offers", "offers"], ["unsaid", "not_mentioned"]] as const) {
      await addJob(db(), { id });
      await addEval(db(), id, { sponsorship: s });
    }
    await addJob(db(), { id: "unscored" });
    expect((await ids()).sort()).toEqual(["offers", "unsaid", "unscored"]);
    await setSettings(db(), { needsSponsorship: false });
    expect(await ids()).toHaveLength(5);
  });

  it("returns locations as an array, with marks and page status", async () => {
    await addJob(db(), { id: "a", locations: ["Austin, TX", "Remote"] });
    await addPage(db(), "a");
    await setMark(db(), "a", "saved");
    expect((await listJobs(db(), ""))[0]).toMatchObject({ locations: ["Austin, TX", "Remote"], mark: "saved", page_status: "ok" });
  });

  it("ignores scores made for an older resume", async () => {
    await setResume(db(), 2);
    await addJob(db(), { id: "a" });
    await addEval(db(), "a", { version: 1, fit: 3 });
    expect((await listJobs(db(), ""))[0]).toMatchObject({ fit: null });
  });
});

describe("marks", () => {
  it("saves, replaces and clears a mark", async () => {
    freezeTime();
    await addJob(db(), { id: "a" });
    const mark = () => db().prepare("SELECT mark, marked_at FROM job_marks WHERE job_id = 'a'").first();
    await setMark(db(), "a", "saved");
    expect(await mark()).toEqual({ mark: "saved", marked_at: NOW });
    await setMark(db(), "a", "hidden");
    expect(await mark()).toMatchObject({ mark: "hidden" });
    await setMark(db(), "a", null);
    expect(await mark()).toBeNull();
  });
});

describe("getJob", () => {
  it("returns the description with the sentence about visas", async () => {
    await addJob(db(), { id: "a" });
    const description = "We build maps. We cannot sponsor H-1B visas. Apply now.";
    await addPage(db(), "a", { description });
    expect(await getJob(db(), "a")).toEqual({
      id: "a", pageStatus: "ok", pageError: null, description, visaSentence: "We cannot sponsor H-1B visas.",
    });
  });

  it("has no visa sentence when the posting does not mention one", async () => {
    await addJob(db(), { id: "a" });
    await addPage(db(), "a", { description: LONG_DESC });
    expect(await getJob(db(), "a")).toMatchObject({ pageStatus: "ok", visaSentence: null });
  });

  it("returns the error of a failed page", async () => {
    await addJob(db(), { id: "a" });
    await addPage(db(), "a", { status: "failed", error: "HTTP 500" });
    expect(await getJob(db(), "a")).toEqual({ id: "a", pageStatus: "failed", pageError: "HTTP 500", description: null, visaSentence: null });
  });

  it("returns nulls for a job that was never crawled", async () => {
    expect(await getJob(db(), "missing")).toEqual({ id: "missing", pageStatus: null, pageError: null, description: null, visaSentence: null });
  });
});

describe("getStats", () => {
  it("counts jobs by stage and hides the resume text", async () => {
    await setResume(db(), 1);
    await db().prepare("UPDATE sync_state SET at = 12345 WHERE id = 1").run();
    await addJob(db(), { id: "scored" });
    await addPage(db(), "scored");
    await addEval(db(), "scored", { model: "test/model" });
    await addJob(db(), { id: "othermodel" });
    await addPage(db(), "othermodel");
    await addEval(db(), "othermodel", { model: "old/model" });
    await addJob(db(), { id: "errored" });
    await addEval(db(), "errored", { error: "boom", fit: null });
    await addJob(db(), { id: "gone" });
    await addPage(db(), "gone", { status: "closed" });
    await addJob(db(), { id: "hw", category: "Hardware" });
    await addJob(db(), { id: "inactive", active: 0 });

    const stats = await getStats(db(), "test/model");
    expect(stats.counts).toEqual({ active: 5, in_scope: 3, crawled: 2, evaluated: 1 });
    expect(stats.categories).toEqual([{ category: "Software", n: 4 }, { category: "Hardware", n: 1 }]);
    expect(stats.lastSync).toBe(12345);
    expect(stats.profile).toMatchObject({ hasResume: true, resumeVersion: 1, needsSponsorship: true });
    expect(stats.profile.resumeText).toBeUndefined();
  });

  it("reports no resume and no sync on a fresh database", async () => {
    const stats = await getStats(db(), "test/model");
    expect(stats.counts).toEqual({ active: 0, in_scope: 0, crawled: 0, evaluated: 0 });
    expect(stats.lastSync).toBeNull();
    expect(stats.profile.hasResume).toBe(false);
  });
});
