import { describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import { LISTINGS_URL } from "../src/listings.ts";
import { getProfile } from "../src/jobs.ts";
import {
  LONG_HTML, NOW, RESUME, addJob, addPage, fakeAi, freezeTime, json, logged, makeEnv, quiet, setResume, stubFetch, useDb,
} from "./helpers";

const db = useDb();
const DECISIONS = "https://llm.test/v1/decisions";
const goodAnswer = { answers: { fit: { score: 3 }, sponsorship: { choice: "offers" }, new_grad: { noul: 0.9 } } };

const call = (method: string, path: string, init: RequestInit = {}, env = makeEnv(db())) =>
  worker.fetch!(new Request(`https://app.test${path}`, { method, ...init }), env, {} as ExecutionContext);
const body = async (res: Response) => (await res.json()) as any;
const put = (path: string, payload: unknown) =>
  call("PUT", path, { body: JSON.stringify(payload), headers: { "content-type": "application/json" } });

describe("routing", () => {
  it("returns 404 for an unknown path and for a known path with the wrong method", async () => {
    const a = await call("GET", "/api/nothing");
    expect(a.status).toBe(404);
    expect(await body(a)).toEqual({ error: "not found" });
    expect((await call("GET", "/api/sync")).status).toBe(404);
  });

  it("returns 500 with the message when a handler throws an Error", async () => {
    const { error } = quiet();
    stubFetch({ [LISTINGS_URL]: () => new Response("down", { status: 502 }) });
    const res = await call("POST", "/api/sync");
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ error: "listings fetch failed: 502" });
    expect(logged(error)[0]).toMatchObject({ route: "POST https://app.test/api/sync", error: "Error: listings fetch failed: 502" });
  });

  it("returns 500 when a handler throws something that is not an Error", async () => {
    quiet();
    const broken = { prepare: () => { throw "boom"; } } as unknown as D1Database;
    const res = await call("GET", "/api/state", {}, makeEnv(broken));
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ error: "boom" });
  });
});

describe("GET /api/state", () => {
  it("returns the counts and profile without the resume text", async () => {
    await setResume(db(), 1);
    await addJob(db(), { id: "a" });
    const res = await call("GET", "/api/state");
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.counts).toMatchObject({ active: 1, in_scope: 1 });
    expect(data.profile).toMatchObject({ hasResume: true });
    expect(data.profile.resumeText).toBeUndefined();
  });
});

describe("GET /api/jobs and /api/job", () => {
  it("lists jobs and filters by q", async () => {
    await addJob(db(), { id: "a", company: "Globex" });
    await addJob(db(), { id: "b", company: "Initech" });
    expect((await body(await call("GET", "/api/jobs"))).map((j: any) => j.id).sort()).toEqual(["a", "b"]);
    expect((await body(await call("GET", "/api/jobs?q=initech"))).map((j: any) => j.id)).toEqual(["b"]);
  });

  it("returns 400 without an id", async () => {
    const res = await call("GET", "/api/job");
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ error: "expected ?id=" });
  });

  it("returns the job page for an id", async () => {
    await addJob(db(), { id: "a" });
    await addPage(db(), "a", { description: "We cannot sponsor visas." });
    expect(await body(await call("GET", "/api/job?id=a"))).toMatchObject({ id: "a", pageStatus: "ok", visaSentence: "We cannot sponsor visas." });
  });
});

describe("PUT /api/job/mark", () => {
  it.each(["saved", "hidden", null])("stores the mark %s", async (mark) => {
    freezeTime();
    await addJob(db(), { id: "a" });
    const res = await put("/api/job/mark", { id: "a", mark });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ id: "a", mark });
    const row = await db().prepare("SELECT mark FROM job_marks WHERE job_id = 'a'").first("mark");
    expect(row).toBe(mark);
  });

  it.each([
    ["a missing id", { mark: "saved" }],
    ["an id that is not a string", { id: 5, mark: "saved" }],
    ["an unknown mark", { id: "a", mark: "starred" }],
    ["a missing mark", { id: "a" }],
  ])("returns 400 for %s", async (_n, payload) => {
    quiet();
    const res = await put("/api/job/mark", payload);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/expected \{ id: string/);
  });

  it("returns 500 for a body that is not JSON", async () => {
    quiet();
    expect((await call("PUT", "/api/job/mark", { body: "{nope" })).status).toBe(500);
  });
});

describe("PUT /api/settings", () => {
  const valid = { categories: ["Hardware"], locationKeywords: ["NY"], needsSponsorship: false };

  it("saves the settings and returns the profile", async () => {
    const res = await put("/api/settings", valid);
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject(valid);
    expect(await getProfile(db())).toMatchObject(valid);
  });

  it.each([
    ["categories missing", { ...valid, categories: undefined }],
    ["categories not an array", { ...valid, categories: "Software" }],
    ["a category that is not a string", { ...valid, categories: ["Software", 1] }],
    ["locationKeywords missing", { ...valid, locationKeywords: undefined }],
    ["a keyword that is not a string", { ...valid, locationKeywords: [null] }],
    ["needsSponsorship not a boolean", { ...valid, needsSponsorship: "yes" }],
  ])("returns 400 when %s", async (_n, payload) => {
    quiet();
    const res = await put("/api/settings", payload);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/expected \{ categories: string\[\]/);
    expect(await getProfile(db())).toMatchObject({ categories: ["Software", "AI/ML/Data"] });
  });
});

describe("POST /api/resume", () => {
  const form = (fields: Record<string, string | File>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return { body: f };
  };
  const pdf = (size = 10) => new File([new Uint8Array(size)], "resume.pdf", { type: "application/pdf" });

  it("saves pasted text, trimmed, and bumps the version", async () => {
    const res = await call("POST", "/api/resume", form({ text: `  ${RESUME}  ` }));
    expect(res.status).toBe(200);
    expect((await body(res)).chars).toBe(RESUME.length + 4);
    expect(await getProfile(db())).toMatchObject({ resumeText: RESUME.trim(), resumeVersion: 1 });
  });

  it("returns 400 when the text is too short", async () => {
    quiet();
    const res = await call("POST", "/api/resume", form({ text: "x".repeat(199) }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/too short/);
    expect((await getProfile(db())).resumeVersion).toBe(0);
  });

  it("returns 400 when there is neither a file nor text", async () => {
    quiet();
    expect((await call("POST", "/api/resume", form({}))).status).toBe(400);
  });

  it("returns 500 when the body is not a form", async () => {
    quiet();
    expect((await call("POST", "/api/resume", { body: "plain", headers: { "content-type": "text/plain" } })).status).toBe(500);
  });

  it("converts a PDF to text without calling an image model", async () => {
    const { ai, toMarkdown } = fakeAi({ format: "markdown", data: RESUME });
    const res = await call("POST", "/api/resume", form({ file: pdf() }), makeEnv(db(), { AI: ai }));
    expect(res.status).toBe(200);
    expect(await getProfile(db())).toMatchObject({ resumeText: RESUME.trim(), resumeVersion: 1 });
    const [doc, options] = toMarkdown.mock.calls[0] as unknown as [{ name: string; blob: Blob }, unknown];
    expect(doc.name).toBe("resume.pdf");
    expect(doc.blob.type).toBe("application/pdf");
    expect(options).toEqual({ conversionOptions: { pdf: { images: { convert: false }, metadata: false } } });
  });

  it("returns 400 when the PDF cannot be read", async () => {
    quiet();
    const { ai } = fakeAi({ format: "error", error: "corrupt file" });
    const res = await call("POST", "/api/resume", form({ file: pdf() }), makeEnv(db(), { AI: ai }));
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ error: "could not read PDF: corrupt file" });
    expect((await getProfile(db())).resumeVersion).toBe(0);
  });

  it("falls back to the text field when the uploaded file is empty", async () => {
    const { ai, toMarkdown } = fakeAi();
    const res = await call("POST", "/api/resume", form({ file: pdf(0), text: RESUME }), makeEnv(db(), { AI: ai }));
    expect(res.status).toBe(200);
    expect(toMarkdown).not.toHaveBeenCalled();
  });
});

describe("POST /api/sync and /api/process", () => {
  it("runs a sync", async () => {
    const one = JSON.stringify(
      [{ id: "a", company_name: "Acme", title: "SWE", category: "Software", url: "https://careers.example.com/a", locations: ["NY"], active: true, is_visible: true, date_posted: 1, date_updated: 2 }],
      null,
      4,
    );
    stubFetch({ [LISTINGS_URL]: () => new Response(one) });
    freezeTime();
    const res = await call("POST", "/api/sync");
    expect(await body(res)).toEqual({ changed: true, seen: 1, written: 1 });
  });

  it("runs one batch", async () => {
    quiet();
    freezeTime();
    await addJob(db(), { id: "a", url: "https://careers.example.com/a" });
    stubFetch({ "https://careers.example.com/a": () => new Response(LONG_HTML) });
    const res = await call("POST", "/api/process");
    expect(await body(res)).toMatchObject({ crawled: 1, evaluated: 0 });
  });
});

describe("scheduled", () => {
  const runCron = (env = makeEnv(db(), { BATCH_SIZE: "2" })) => worker.scheduled!({} as ScheduledController, env, {} as ExecutionContext);
  const cronLine = (log: ReturnType<typeof quiet>["log"]) => logged(log).find((l) => l.event === "cron")!;
  const seed = async () => {
    await setResume(db(), 1);
    for (const [id, posted] of [["a", 3], ["b", 2], ["c", 1]] as const) await addJob(db(), { id, date_posted: posted, url: `https://careers.example.com/${id}` });
  };

  it("catches a sync failure and still runs one empty batch", async () => {
    const { log } = quiet();
    stubFetch({ [LISTINGS_URL]: () => new Response("down", { status: 500 }) });
    await runCron();
    expect(cronLine(log)).toEqual({
      event: "cron", sync: { error: "Error: listings fetch failed: 500" }, batches: 1, crawled: 0, evaluated: 0,
    });
  });

  it("runs batches until one does nothing", async () => {
    const { log } = quiet();
    freezeTime();
    await seed();
    stubFetch({
      [LISTINGS_URL]: () => new Response(null, { status: 304 }),
      [DECISIONS]: () => json(goodAnswer),
      "https://careers.example.com/a": () => new Response(LONG_HTML),
      "https://careers.example.com/b": () => new Response(LONG_HTML),
      "https://careers.example.com/c": () => new Response(LONG_HTML),
    });
    await runCron();
    expect(cronLine(log)).toEqual({
      event: "cron", sync: { changed: false, seen: 0, written: 0 }, batches: 3, crawled: 3, evaluated: 3,
    });
  });

  it("stops when the 10 minute budget is used up", async () => {
    const { log } = quiet();
    let now = NOW;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await seed();
    stubFetch({
      [LISTINGS_URL]: () => new Response(null, { status: 304 }),
      [DECISIONS]: () => json(goodAnswer),
      "https://careers.example.com/a": () => ((now += 11 * 60 * 1000), new Response(LONG_HTML)),
      "https://careers.example.com/b": () => new Response(LONG_HTML),
      "https://careers.example.com/c": () => new Response(LONG_HTML),
    });
    await runCron();
    expect(cronLine(log)).toMatchObject({ batches: 1, crawled: 2, evaluated: 2 });
    const left = await db().prepare("SELECT COUNT(*) n FROM job_pages").first("n");
    expect(left).toBe(2);
  });
});
