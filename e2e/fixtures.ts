import type { Request, Route } from "@playwright/test";
import type { AppState, Job, JobDetail, Mark, Profile, Settings, Sponsorship } from "../web/api";

/** The browser clock is pinned here so "posted Nd ago" and "last synced" never drift. */
export const NOW = new Date("2026-03-10T12:00:00Z");
const DAY = 86_400;
const nowSec = NOW.getTime() / 1000;

export const SWE = "Software Engineering";
export const DATA = "Data Science";
export const PM = "Product Management";
export const HW = "Hardware Engineering";
export const CATEGORY_ORDER = [SWE, DATA, PM, HW];

export const FAKE_RESUME_TEXT =
  "Jane Example. Software engineer with five years of experience building web services in TypeScript and Python. " +
  "Led a team of four at Example Systems, shipped a payments API used by two hundred merchants, and cut p95 latency by forty percent. " +
  "BS in Computer Science from Example University. Skills: React, Node.js, SQL, distributed systems, observability.";

export const SHORT_RESUME_TEXT = "Too short to be a resume.";
export const RESUME_TOO_SHORT = "resume text is too short; upload a PDF or paste the text";

export const SENTENCES = {
  offers: "We sponsor H-1B visas for qualified candidates, and authorization to work in the US is required at the start date.",
  no_sponsorship: "Unfortunately we are unable to sponsor work visas for this role.",
  citizen: "Applicants must be US citizens eligible to obtain a security clearance.",
} as const;

const postingText = (company: string, extra = "") =>
  `About ${company}\nWe build reliable software for example customers.\n\nWhat you will do\nShip features, review code, and run what you build.\n${extra}`.trim();

type Page = { description: string | null; error: string | null };

export type Seed = {
  job: Job;
  /** What the crawl stored for this job; absent when it was never crawled. */
  page?: Page;
};

export function makeJob(id: string, over: Partial<Job> = {}): Job {
  return {
    id,
    company: "Example Co",
    title: `Engineer ${id}`,
    category: SWE,
    url: `https://jobs.example.com/${id}`,
    locations: ["Remote, USA"],
    date_posted: nowSec - 2 * DAY,
    page_status: null,
    mark: null,
    eval_error: null,
    fit: null,
    sponsorship: null,
    new_grad_p: null,
    ...over,
  };
}

export function defaultSeeds(): Seed[] {
  return [
    {
      job: makeJob("nw-1", {
        company: "Northwind Labs",
        title: "Software Engineer, New Grad",
        locations: ["Seattle, WA", "Remote, USA"],
        date_posted: nowSec - 1 * DAY,
        page_status: "ok",
        fit: 3,
        sponsorship: "offers",
        new_grad_p: 0.92,
      }),
      page: { description: postingText("Northwind Labs", SENTENCES.offers), error: null },
    },
    {
      job: makeJob("co-2", {
        company: "Contoso Robotics",
        title: "Backend Engineer",
        locations: ["Boston, MA"],
        date_posted: nowSec - 3 * DAY,
        page_status: "ok",
        fit: 3,
        sponsorship: "no_sponsorship",
        new_grad_p: 0.4,
      }),
      page: { description: postingText("Contoso Robotics", SENTENCES.no_sponsorship), error: null },
    },
    {
      job: makeJob("fa-3", {
        company: "Fabrikam Cloud",
        title: "Platform Engineer",
        locations: ["Austin, TX"],
        date_posted: nowSec - 7 * DAY,
        page_status: "ok",
        fit: 2,
        sponsorship: "citizenship_required",
        new_grad_p: 0.15,
      }),
      page: { description: postingText("Fabrikam Cloud", SENTENCES.citizen), error: null },
    },
    {
      job: makeJob("ts-4", {
        company: "Tailspin Games",
        title: "Gameplay Engineer",
        locations: ["Los Angeles, CA"],
        date_posted: nowSec - 10 * DAY,
        page_status: "ok",
        fit: 1,
        sponsorship: "not_mentioned",
        new_grad_p: 0.55,
      }),
      page: { description: postingText("Tailspin Games"), error: null },
    },
    {
      job: makeJob("aw-5", {
        company: "Adventure Works",
        title: "Frontend Engineer",
        locations: ["Denver, CO"],
        date_posted: nowSec - 0.2 * DAY,
      }),
    },
    {
      job: makeJob("lw-6", {
        company: "Litware Systems",
        title: "Site Reliability Engineer",
        locations: ["Chicago, IL"],
        date_posted: nowSec - 5 * DAY,
        page_status: "ok",
        eval_error: "model returned invalid JSON",
      }),
      page: { description: postingText("Litware Systems"), error: null },
    },
    {
      job: makeJob("wt-7", {
        company: "Wingtip Payments",
        title: "Mobile Engineer",
        locations: ["Miami, FL"],
        date_posted: nowSec - 12 * DAY,
        page_status: "failed",
      }),
      page: { description: null, error: "HTTP 403 from jobs.example.com" },
    },
    {
      job: makeJob("pw-8", {
        company: "Proseware Analytics",
        title: "Data Scientist",
        category: DATA,
        locations: ["New York, NY"],
        date_posted: nowSec - 4 * DAY,
        page_status: "ok",
        fit: 2,
        sponsorship: "offers",
        new_grad_p: 0.7,
      }),
      page: { description: postingText("Proseware Analytics", SENTENCES.offers), error: null },
    },
    {
      job: makeJob("in-9", {
        company: "Initech",
        title: "Machine Learning Engineer",
        category: DATA,
        locations: ["Palo Alto, CA"],
        date_posted: nowSec - 6 * DAY,
        page_status: "ok",
        fit: 3,
        sponsorship: "offers",
        new_grad_p: 0.66,
        mark: "saved",
      }),
      page: { description: postingText("Initech", SENTENCES.offers), error: null },
    },
    {
      job: makeJob("um-10", {
        company: "Umbrella Software",
        title: "QA Engineer",
        locations: ["Portland, OR"],
        date_posted: nowSec - 9 * DAY,
        page_status: "ok",
        fit: 2,
        sponsorship: "not_mentioned",
        new_grad_p: 0.3,
        mark: "hidden",
      }),
      page: { description: postingText("Umbrella Software"), error: null },
    },
    {
      // Out of the default scope (Product Management is not selected).
      job: makeJob("gl-11", {
        company: "Globex Products",
        title: "Associate Product Manager",
        category: PM,
        locations: ["San Francisco, CA"],
        date_posted: nowSec - 2 * DAY,
      }),
    },
    {
      // Out of the default scope (Hardware Engineering is not selected).
      job: makeJob("hc-12", {
        company: "Hooli Devices",
        title: "Firmware Engineer",
        category: HW,
        locations: ["San Jose, CA"],
        date_posted: nowSec - 8 * DAY,
      }),
    },
  ];
}

export type ApiKey =
  | "GET /api/state"
  | "GET /api/jobs"
  | "GET /api/job"
  | "PUT /api/job/mark"
  | "PUT /api/settings"
  | "POST /api/resume"
  | "POST /api/sync"
  | "POST /api/process";

export type BatchResult = {
  crawled: number;
  evaluated: number;
  errors: string[];
  timing: { batchMs: number; crawl: { count: number; avgMs: number; maxMs: number }; evaluate: { count: number; avgMs: number; maxMs: number } };
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Failure = { status: number; error: string; times: number };

/** A stateful stand-in for src/index.ts. Marks, settings, resume, sync and process batches change what later calls return. */
export class FakeApi {
  jobs: Job[];
  pages = new Map<string, Page>();
  profile: Profile = {
    resumeVersion: 3,
    hasResume: true,
    categories: [SWE, DATA],
    locationKeywords: [],
    needsSponsorship: false,
  };
  lastSync: number | null = NOW.getTime() - 90 * 60_000;
  syncResult: { changed: boolean; seen: number } = { changed: true, seen: 42 };
  /** Errors reported by the next batches, one entry per batch. */
  batchErrors: string[][] = [];
  /** How many jobs one batch crawls and scores. */
  batchSize = 2;

  requests: string[] = [];
  jobQueries: string[] = [];
  markBodies: { id: string; mark: Mark | null }[] = [];
  settingsBodies: Settings[] = [];
  resumeBodies: string[] = [];
  processCalls = 0;
  unhandled: string[] = [];

  private failures = new Map<string, Failure>();
  private gates = new Map<string, Promise<void>>();
  private scored = 0;
  private syncedJobs = 0;

  constructor(seeds: Seed[] = defaultSeeds()) {
    this.jobs = seeds.map((s) => s.job);
    for (const s of seeds) if (s.page) this.pages.set(s.job.id, s.page);
  }

  /** Make a route fail with a JSON error body. By default every call fails; pass `times` to recover after that many. */
  fail(key: ApiKey, error: string, opts: { status?: number; times?: number } = {}) {
    this.failures.set(key, { status: opts.status ?? 500, error, times: opts.times ?? Infinity });
  }

  clearFailure(key: ApiKey) {
    this.failures.delete(key);
  }

  /** Hold every call to a route until the returned function runs. */
  hold(key: ApiKey): () => void {
    let release!: () => void;
    this.gates.set(key, new Promise<void>((r) => (release = r)));
    return release;
  }

  addJob(seed: Seed) {
    this.jobs.push(seed.job);
    if (seed.page) this.pages.set(seed.job.id, seed.page);
  }

  job(id: string): Job {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) throw new Error(`no fake job ${id}`);
    return j;
  }

  private inScope(j: Job) {
    const { categories, locationKeywords } = this.profile;
    if (!categories.includes(j.category)) return false;
    if (locationKeywords.length === 0) return true;
    return j.locations.some((l) => l.split(/\W+/).some((w) => locationKeywords.includes(w)));
  }

  private needsWork(j: Job) {
    return this.inScope(j) && (j.page_status === null || (j.page_status === "ok" && j.fit === null && j.eval_error === null));
  }

  private state(): AppState {
    const scope = this.jobs.filter((j) => this.inScope(j));
    return {
      counts: {
        active: this.jobs.length,
        in_scope: scope.length,
        crawled: scope.filter((j) => j.page_status !== null).length,
        evaluated: scope.filter((j) => j.fit !== null).length,
      },
      categories: CATEGORY_ORDER.map((category) => ({ category, n: this.jobs.filter((j) => j.category === category).length })),
      lastSync: this.lastSync,
      profile: this.profile,
    };
  }

  private list(q: string): Job[] {
    const needle = q.toLowerCase();
    const match = (j: Job) => !needle || [j.company, j.title, j.locations.join(" ")].some((s) => s.toLowerCase().includes(needle));
    const blocked = (j: Job) => this.profile.needsSponsorship && (j.sponsorship === "no_sponsorship" || j.sponsorship === "citizenship_required");
    const rank = (j: Job) => [j.mark === "hidden" ? 1 : 0, j.fit === null ? 1 : 0, -(j.fit ?? 0), -j.date_posted];
    const byRank = (a: Job, b: Job) => {
      const [ra, rb] = [rank(a), rank(b)];
      const i = ra.findIndex((v, n) => v !== rb[n]);
      return i === -1 ? 0 : ra[i] - rb[i];
    };
    return this.jobs
      .filter((j) => this.inScope(j) && match(j) && !blocked(j))
      .sort(byRank)
      .map((j) => ({ ...j }));
  }

  private detail(id: string): JobDetail {
    const j = this.job(id);
    const page = this.pages.get(id);
    const description = page?.description ?? null;
    const sentence = description?.split(/(?<=[.!?])\s+|\n/).find((s) => /sponsor|citizen|visa|authori[sz]ation/i.test(s)) ?? null;
    return { id, pageStatus: j.page_status, pageError: page?.error ?? null, description, visaSentence: sentence };
  }

  private async resume(req: Request): Promise<{ chars: number }> {
    const body = req.postDataBuffer()?.toString("latin1") ?? "";
    const isFile = /name="file"; filename="[^"]+"/.test(body) && !/filename=""/.test(body);
    let text = "";
    if (isFile) {
      // A "scanned.pdf" has no extractable text, like the real extractor.
      text = /filename="scanned/.test(body) ? "" : FAKE_RESUME_TEXT.repeat(4);
    } else {
      text = /name="text"\r\n\r\n([\s\S]*?)\r\n--/.exec(body)?.[1] ?? "";
    }
    if (text.trim().length < 200) throw new HttpError(400, RESUME_TOO_SHORT);
    this.resumeBodies.push(isFile ? "[pdf]" : text.trim());
    this.profile = { ...this.profile, hasResume: true, resumeVersion: this.profile.resumeVersion + 1 };
    for (const j of this.jobs) Object.assign(j, { fit: null, sponsorship: null, new_grad_p: null, eval_error: null });
    return { chars: text.length };
  }

  private batch(): BatchResult {
    const errors = this.batchErrors.shift() ?? [];
    const work = this.jobs.filter((j) => this.needsWork(j)).slice(0, this.batchSize);
    let crawled = 0;
    let evaluated = 0;
    for (const j of work) {
      if (j.page_status === null) {
        crawled++;
        j.page_status = "ok";
        this.pages.set(j.id, { description: postingText(j.company, SENTENCES.offers), error: null });
      }
      const fit = ([3, 2, 1] as const)[this.scored % 3];
      const sponsorship = (["offers", "no_sponsorship", "not_mentioned"] as Sponsorship[])[this.scored % 3];
      this.scored++;
      Object.assign(j, { fit, sponsorship, new_grad_p: 0.5 });
      evaluated++;
    }
    const stat = (count: number, avg: number, max: number) => ({ count, avgMs: avg, maxMs: max });
    return {
      crawled,
      evaluated,
      errors,
      timing: { batchMs: 1200, crawl: stat(crawled, 400, 700), evaluate: stat(evaluated, 500, 900) },
    };
  }

  private sync() {
    const r = this.syncResult;
    this.lastSync = NOW.getTime();
    if (r.changed) {
      this.syncedJobs++;
      this.addJob({
        job: makeJob(`sy-${this.syncedJobs}`, { company: "Quill Software", title: `Release Engineer ${this.syncedJobs}`, locations: ["Remote, USA"], date_posted: nowSec }),
      });
    }
    return r;
  }

  private async route(req: Request, url: URL): Promise<unknown> {
    const key = `${req.method()} ${url.pathname}` as ApiKey;
    switch (key) {
      case "GET /api/state":
        return this.state();
      case "GET /api/jobs": {
        const q = url.searchParams.get("q") ?? "";
        this.jobQueries.push(q);
        return this.list(q);
      }
      case "GET /api/job": {
        const id = url.searchParams.get("id");
        if (!id) throw new HttpError(400, "expected ?id=");
        if (!this.jobs.some((j) => j.id === id)) throw new HttpError(404, "job not found");
        return this.detail(id);
      }
      case "PUT /api/job/mark": {
        const body = req.postDataJSON() as { id: string; mark: Mark | null };
        this.markBodies.push(body);
        this.job(body.id).mark = body.mark;
        return body;
      }
      case "PUT /api/settings": {
        const body = req.postDataJSON() as Settings;
        this.settingsBodies.push(body);
        this.profile = { ...this.profile, ...body };
        return this.profile;
      }
      case "POST /api/resume":
        return this.resume(req);
      case "POST /api/sync":
        return this.sync();
      case "POST /api/process":
        this.processCalls++;
        return this.batch();
      default:
        return undefined;
    }
  }

  private static readonly KNOWN = new Set<string>([
    "GET /api/state",
    "GET /api/jobs",
    "GET /api/job",
    "PUT /api/job/mark",
    "PUT /api/settings",
    "POST /api/resume",
    "POST /api/sync",
    "POST /api/process",
  ]);

  /** Route handler for every request under /api/. Anything it does not know is recorded and answered with 500. */
  handle = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = `${req.method()} ${url.pathname}`;
    const reply = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (!FakeApi.KNOWN.has(key)) {
      this.unhandled.push(`${key}${url.search}`);
      return reply(500, { error: `fake API has no handler for ${key}` });
    }
    this.requests.push(key);
    await this.gates.get(key as ApiKey);
    const failure = this.failures.get(key);
    if (failure && failure.times > 0) {
      failure.times--;
      return reply(failure.status, { error: failure.error });
    }
    try {
      return reply(200, await this.route(req, url));
    } catch (e) {
      if (e instanceof HttpError) return reply(e.status, { error: e.message });
      throw e;
    }
  };
}
