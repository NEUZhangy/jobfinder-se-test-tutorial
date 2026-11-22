# JobFinder: a software testing tutorial

This repository is a software engineering testing tutorial built around a small, real web app.
The app, JobFinder, is a single-user helper for new grad SDE job hunting on Cloudflare.
It pulls new grad listings from [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions),
crawls each job page, and ranks every job against your resume with an LLM.

| Layer | What is tested | Test runner | Coverage tool | Tests | Coverage goal |
|---|---|---|---|---|---|
| Backend | The Worker's JSON API, the sync, the crawlers, the scoring (`src/`) | [Vitest](https://vitest.dev) | V8, through `@vitest/coverage-v8` | 121 in `test/` | 85% |
| Frontend | The React page in a real browser (`web/`) | [Playwright](https://playwright.dev), Chromium | Istanbul, through `vite-plugin-istanbul` and `nyc` | 55 in `e2e/` | 80% |

## Test recording

**[`recordings/e2e-run.mp4`](recordings/e2e-run.mp4)** is a recording of the whole Playwright UI suite: all 55 tests, 2 minutes 5 seconds.

- Each test has its own chapter. QuickTime Player and VLC list the chapters, so you can jump to any test.
- At the bottom of every frame is the test's file and name. A pointer, a red ring on each click, and the key just pressed show what the test is doing.
- Two tests open the posting in a new tab. That tab is recorded separately and follows the test as its own clip, marked "popup tab" below.
- To see the chapters, download it from the file's page on GitHub ("Download raw file") and play it locally.

The recording was made by `npm run test:e2e` followed by `e2e/merge-videos.sh`. Section 3 below explains how.

<details>
<summary>Chapter list: where each test starts in the video</summary>

| Time | File | Test |
|---|---|---|
| 0:00 | `jobs.spec.ts` | job detail › Open posting is a new-tab link to the posting |
| 0:02 | `jobs.spec.ts` | job detail › Open posting is a new-tab link to the posting (popup tab) |
| 0:03 | `jobs.spec.ts` | job detail › a detail request that fails shows a toast and the error in place of the posting |
| 0:05 | `jobs.spec.ts` | job detail › a good fit that needs citizenship |
| 0:07 | `jobs.spec.ts` | job detail › a job crawled by the pipeline gets its detail refetched |
| 0:09 | `jobs.spec.ts` | job detail › a job that rules sponsorship out |
| 0:11 | `jobs.spec.ts` | job detail › a job that was never crawled is not scored |
| 0:13 | `jobs.spec.ts` | job detail › a job whose scoring failed shows the error |
| 0:15 | `jobs.spec.ts` | job detail › a posting that failed to load shows the page error |
| 0:17 | `jobs.spec.ts` | job detail › a strong fit shows fit, visa, new grad and the highlighted visa sentence |
| 0:19 | `jobs.spec.ts` | job detail › a weak fit whose posting says nothing about visas |
| 0:21 | `jobs.spec.ts` | job detail › shows skeletons until the posting arrives |
| 0:23 | `jobs.spec.ts` | job list › a list that fails to load shows a toast and the empty state |
| 0:24 | `jobs.spec.ts` | job list › an empty filter shows the empty state and an empty detail pane |
| 0:27 | `jobs.spec.ts` | job list › filters between All, Top, Saved and Hidden |
| 0:29 | `jobs.spec.ts` | job list › says 1 strong match in the singular |
| 0:31 | `jobs.spec.ts` | job list › search waits for typing to pause, sends q and filters the list |
| 0:34 | `jobs.spec.ts` | job list › shows skeletons while the list loads |
| 0:36 | `jobs.spec.ts` | job list › shows the best fit first with a strong match count and a shown count |
| 0:38 | `jobs.spec.ts` | job list › state that fails to load shows a toast and leaves Crawl + score off |
| 0:39 | `jobs.spec.ts` | job list › the header shows how many in-scope jobs are scored |
| 0:41 | `marks.spec.ts` | keyboard › J and K move the selection and stop at both ends |
| 0:43 | `marks.spec.ts` | keyboard › O opens the posting in a new tab |
| 0:45 | `marks.spec.ts` | keyboard › O opens the posting in a new tab (popup tab) |
| 0:46 | `marks.spec.ts` | keyboard › keys typed in the search box do not trigger shortcuts |
| 0:48 | `marks.spec.ts` | keyboard › shortcuts are ignored while settings are open and work again after |
| 0:50 | `marks.spec.ts` | keyboard › shortcuts do nothing when no job is selected |
| 0:52 | `marks.spec.ts` | keyboard › shortcuts with a modifier key are left to the browser |
| 0:54 | `marks.spec.ts` | marks › Hide removes the job from All and selects the next job |
| 0:56 | `marks.spec.ts` | marks › S saves and H hides the selected job from the keyboard |
| 0:58 | `marks.spec.ts` | marks › Save toggles a bookmark, shows it in Saved and un-saves on the second click |
| 1:00 | `marks.spec.ts` | marks › a failed mark reverts the job and shows a toast |
| 1:02 | `marks.spec.ts` | marks › a failed save reverts the bookmark |
| 1:04 | `marks.spec.ts` | marks › an un-hidden job leaves the Hidden list |
| 1:06 | `marks.spec.ts` | marks › hiding the last job selects the one before it |
| 1:08 | `mobile.spec.ts` | selecting a job shows its detail and All jobs goes back to the list |
| 1:10 | `pipeline.spec.ts` | crawl + score › Stop ends the run after the batch in flight |
| 1:12 | `pipeline.spec.ts` | crawl + score › a batch with errors shows a warning and keeps going |
| 1:14 | `pipeline.spec.ts` | crawl + score › a failing batch shows the error and lets the user try again |
| 1:17 | `pipeline.spec.ts` | crawl + score › progress moves after every batch |
| 1:19 | `pipeline.spec.ts` | crawl + score › runs batches until nothing is left and reports the result with timing |
| 1:22 | `pipeline.spec.ts` | crawl + score › several failures in one batch use the plural |
| 1:24 | `pipeline.spec.ts` | crawl + score › with nothing to do it reports zero without a timing line |
| 1:26 | `settings.spec.ts` | data › a database that never synced says so |
| 1:28 | `settings.spec.ts` | data › a failed sync shows the error |
| 1:31 | `settings.spec.ts` | data › a sync that changed things reports it and updates the counts and last synced time |
| 1:33 | `settings.spec.ts` | data › a sync with nothing new says it is up to date |
| 1:36 | `settings.spec.ts` | first load without a resume › pasting a resume saves it, clears the red dot and enables Crawl + score |
| 1:38 | `settings.spec.ts` | first load without a resume › settings open by themselves, the gear has a red dot and Crawl + score is off |
| 1:40 | `settings.spec.ts` | resume › a PDF with no text shows the server error and keeps the file |
| 1:43 | `settings.spec.ts` | resume › text that is too short shows the server error and keeps the text |
| 1:46 | `settings.spec.ts` | resume › the save button shows Saving while the request is in flight |
| 1:49 | `settings.spec.ts` | resume › uploading a PDF shows its name and size, then saves it as the next version |
| 1:52 | `settings.spec.ts` | scope › Save scope is disabled while no category is selected |
| 1:54 | `settings.spec.ts` | scope › a failed save shows the server error and Saving while it runs |
| 1:57 | `settings.spec.ts` | scope › the sponsorship switch alone hides roles that rule sponsorship out |
| 2:01 | `settings.spec.ts` | scope › toggling categories, editing locations and flipping sponsorship saves one PUT and re-filters the list |

</details>

## Testing tutorial

### 1. Set up and run everything

You need Node.js 22 or newer. No Cloudflare account and no API key are needed to run the tests.

```sh
npm install
npx playwright install chromium   # the browser Playwright drives, downloaded once

npm test                   # backend tests (Vitest)
npm run test:coverage      # backend tests with coverage, fails below 85%
npm run test:e2e           # UI tests (Playwright), records every test
npm run test:e2e:coverage  # UI tests with coverage, fails below 80%
npm run check              # TypeScript type check for the Worker and the web app
```

| Output | Where |
|---|---|
| Backend coverage report | `coverage/backend/index.html` |
| Frontend coverage report | `coverage/e2e/index.html` |
| Playwright HTML report | `npx playwright show-report` |
| Video, trace, and screenshot of each UI test | `test-results/<test name>/` |
| All UI videos joined into one | `e2e/merge-videos.sh` writes `recordings/e2e-run.mp4` |

### 2. Backend tests and how their coverage is measured

The backend tests in `test/` call the Worker's code directly in Node.js, with one test file per source file:

| Test file | Code under test |
|---|---|
| `test/index.test.ts` | `src/index.ts`, the HTTP routes, called as `worker.fetch(new Request(...))` |
| `test/jobs.test.ts` | `src/jobs.ts`, settings, the job list, and the crawl and score batch |
| `test/listings.test.ts` | `src/listings.ts`, the streamed sync of `listings.json` |
| `test/pages.test.ts` | `src/pages.ts`, the job page adapters |
| `test/evaluate.test.ts` | `src/evaluate.ts`, the LLM call and its parsing |

`test/helpers.ts` replaces everything outside the code under test:

- **Database.** `openDb()` uses Wrangler's `getPlatformProxy` to start a local in-memory D1 (SQLite), applies every file in `migrations/`, and `resetDb()` empties it before each test.
- **Network.** `stubFetch()` replaces `fetch` with a table of fake responses. A request to any URL not in the table throws `unrouted fetch`, so a forgotten mock fails the test instead of calling the internet.
- **Workers AI and the LLM.** `fakeAi()` and the `llm.test` base URL replace both. The key is the string `"test-key"`.
- **Time.** `freezeTime()` pins `Date.now()`, so "retry after an hour" can be tested without waiting.

#### How the backend coverage is computed

The tool is **V8 coverage**, read by Vitest's `@vitest/coverage-v8` provider. Its settings are in `vitest.config.ts`:

```ts
coverage: {
  provider: "v8",
  include: ["src/**"],
  reporter: ["text", "html"],
  reportsDirectory: "coverage/backend",
  thresholds: { lines: 85, statements: 85, functions: 85, branches: 85 },
}
```

This is what happens when you run `npm run test:coverage`:

1. Vitest turns on the coverage counters built into V8, the JavaScript engine inside Node.js. The source code is not changed. V8 itself counts how often each function and each block of code ran.
2. The tests run as usual.
3. At the end, Vitest reads the counters and uses the source maps to map them from the compiled JavaScript back to the lines of `src/*.ts`.
4. The result is reported in four columns, printed in the terminal and written as HTML to `coverage/backend/`.
5. If any column is below 85%, the command exits with an error, so a CI build would fail.

The four columns mean:

| Column | Counts | Example |
|---|---|---|
| Lines | Source lines that ran at least once | |
| Statements | Statements that ran, more than one can share a line | `a(); b();` is one line, two statements |
| Functions | Functions that were called at least once | |
| Branches | Each side of every decision that was taken | `if`, `else`, `? :`, `??`, `\|\|`, and `case` each count per side |

Branches is the strictest column. A test can run every line of `x ? 1 : 0` and still take only one side of it.

#### Backend coverage result

Measured on 2026-11-22 with `npm run test:coverage` (121 tests).

| File | Lines | Statements | Functions | Branches |
|---|---|---|---|---|
| `src/evaluate.ts` | 100% (20/20) | 100% (22/22) | 100% (5/5) | 100% (13/13) |
| `src/index.ts` | 100% (50/50) | 100% (58/58) | 100% (15/15) | 100% (36/36) |
| `src/jobs.ts` | 100% (63/63) | 100% (72/72) | 100% (26/26) | 93.75% (30/32) |
| `src/listings.ts` | 100% (32/32) | 100% (38/38) | 100% (4/4) | 100% (19/19) |
| `src/pages.ts` | 100% (60/60) | 100% (73/73) | 100% (20/20) | 98.14% (53/54) |
| **Total** | **100% (225/225)** | **100% (263/263)** | **100% (70/70)** | **98.05% (151/154)** |

The three uncovered branches:

- `src/jobs.ts`, in `saveSettings`: the `needsSponsorship ? 1 : 0` choice. The tests send both values through `PUT /api/settings`, so V8 likely miscounts this one.
- `src/jobs.ts`, in `processBatch`: the failed-crawl fallback. It cannot run, because `fetchJobPage` catches its own errors and never rejects.
- `src/pages.ts`, in `stripTags`: an out-of-range hex entity such as `&#xFFFFFFF;`, which no test sends.

Coverage shows what ran, not what was checked. A test with no `expect` still raises coverage, so read the numbers together with the assertions.

### 3. Frontend UI tests with Playwright, and the recording

The UI tests in `e2e/` start a real Chromium browser, open the page, and use it the way a user does: they click, type, and press keys, then check what is on screen.

| Test file | What the user does |
|---|---|
| `e2e/jobs.spec.ts` | Reads the job list, filters it, searches, and opens a job's details |
| `e2e/marks.spec.ts` | Saves and hides jobs with the mouse and with the `J` `K` `S` `H` `O` shortcuts |
| `e2e/pipeline.spec.ts` | Runs Crawl + score and watches its progress, errors, and Stop |
| `e2e/settings.spec.ts` | Uploads a resume, changes the scope, and syncs data in the settings sheet |
| `e2e/mobile.spec.ts` | Uses the page at phone width |

Locators find elements by role and visible text, not by CSS class:

```ts
test("says 1 strong match in the singular", async ({ page, fake }) => {
  fake.job("co-2").mark = "hidden";   // set up the fake backend
  fake.job("in-9").fit = 2;
  await openApp(page);                // open the page and wait for the list
  await expect(strong(page)).toHaveText("1 strong match");
});
```

#### How a UI test runs

`playwright.config.ts` controls the whole run:

1. **Start the page.** `webServer` starts Vite with `vite.config.e2e.ts` on port 5199. This config serves only `web/`, without the Cloudflare Worker.
2. **Fake the backend.** The `fake` fixture in `e2e/test.ts` intercepts every `/api/*` request with `page.route` and answers it from `FakeApi` in `e2e/fixtures.ts`, which holds invented jobs. A test changes the fake to set up its case, for example making a save fail. If the page calls an API route the fake does not know, the test fails.
3. **Fix the clock.** `page.clock.setFixedTime(NOW)`, `locale`, `timezoneId`, and `colorScheme` make "1d ago" and the screenshots the same on every machine.
4. **Run in parallel.** Four workers, each test in its own fresh browser context, so tests cannot affect each other.

#### How the recording works

Recording is turned on for every test in `playwright.config.ts`:

```ts
use: {
  video: "on",        // test-results/<test>/video.webm
  trace: "on",        // test-results/<test>/trace.zip
  screenshot: "on",   // test-results/<test>/*.png
}
```

- **Video** is a recording of the browser window for the whole test.
- **Trace** is a step-by-step replay: every action, the page's DOM before and after it, network calls, and console output. Open one with `npx playwright show-trace test-results/<test>/trace.zip`.
- **Screenshot** is the final state of the page.

A headless browser has no mouse pointer, so a raw video does not show what was clicked.
The `recordingOverlay` fixture in `e2e/test.ts` draws a pointer, a red ring on each click, the key just pressed, and the test's name at the bottom of every frame.
It lives in a closed shadow root with `pointer-events: none`, so the tests' locators and clicks never see it.

After a run, `e2e/merge-videos.sh` uses `ffmpeg` to join all test videos into one MP4 with a chapter per test:

```sh
npm run test:e2e
e2e/merge-videos.sh        # writes recordings/e2e-run.mp4
```

The per-test `.webm` files are left out of git. Only the joined `recordings/e2e-run.mp4` is committed.

#### How the frontend coverage is computed

V8 coverage would only see Node.js, but this code runs inside the browser.
So the frontend uses **Istanbul**, which works by rewriting the code itself:

1. **Instrument.** `vite-plugin-istanbul` in `vite.config.e2e.ts` rewrites every file in `web/` as Vite serves it. Before each statement, function, and branch it inserts a counter, such as `cov.s[12]++`. The counters live in `window.__coverage__`.
2. **Run.** The Playwright tests use the page. Every counter that runs goes up.
3. **Collect.** After each test, the `coverage` fixture in `e2e/test.ts` reads `window.__coverage__` from the page and saves it as one JSON file in `.nyc_output/`. `e2e/global-setup.ts` empties that folder before a run.
4. **Merge and report.** `nyc report` adds up all the JSON files and maps them back to the `.ts` and `.tsx` sources. `nyc check-coverage` fails below the 80% set in `.nycrc.json`. The HTML report goes to `coverage/e2e/`.

`npm run test:e2e:coverage` runs these steps in order: `playwright test && nyc report && nyc check-coverage`.

One detail: Vite's JSX transform leaves some generated lines without a source map entry, and nyc then drops whole React components from the report.
`e2e/instrumenter.ts` fills those gaps before Istanbul instruments the file, so every component is counted.

#### Frontend coverage result

Measured on 2026-11-22 with `npm run test:e2e:coverage` (55 tests, every file in `web/`).

| Folder | Files | Lines | Statements | Functions | Branches |
|---|---|---|---|---|---|
| `web/` | 3 | 100% (121/121) | 99.32% (147/148) | 100% (50/50) | 96.20% (76/79) |
| `web/components/` | 5 | 100% (85/85) | 100% (89/89) | 100% (35/35) | 98.92% (92/93) |
| `web/components/ui/` | 15 | 95.51% (85/89) | 95.51% (85/89) | 88.24% (30/34) | 90.48% (19/21) |
| `web/lib/` | 1 | 100% (7/7) | 100% (10/10) | 100% (4/4) | 100% (2/2) |
| **Total** | **24** | **98.67% (298/302)** | **98.51% (331/336)** | **96.74% (119/123)** | **96.92% (189/195)** |

What is not covered:

- `web/api.ts`: the `res.statusText` fallback for an error response with no `error` field. The fake API always sends one.
- `web/app.tsx`: the header progress bar when no job is in scope, and the guard that drops a failed detail request after the user has already picked another job.
- `web/components/resume-card.tsx`: cancelling the file picker, which Playwright cannot simulate.
- `web/components/ui/`: unused shadcn code. That is the `Badge` variants and `asChild`, `KbdGroup`, and `SheetTrigger`, `SheetClose` and `SheetFooter`.

## How the app works

```
SimplifyJobs listings.json ──(cron every 6 hours, full file, streamed)──► D1 jobs
D1 jobs in scope ──► job page adapters (Workday / Ashby / Workable / HTML) ──► D1 job_pages
resume + job page ──► Jev via Infron ──► D1 evaluations ──► web page
```

| Piece | Cloudflare product | File |
|---|---|---|
| JSON API | Worker | `src/index.ts` |
| Web page | React, shadcn/ui, Tailwind, served as Worker static assets | `web/` |
| Jobs, crawled pages, scores, profile | D1 | `migrations/0001_init.sql`, `src/jobs.ts` |
| Full sync, then batches until no job is left | Cron Trigger every 6 hours | `src/listings.ts`, `src/jobs.ts` |
| Resume PDF to text | Workers AI `toMarkdown`, text only | `src/index.ts` |
| Fit, sponsorship, and new grad judgments | TypeSafe Jev via Infron, key in a Wrangler secret | `src/evaluate.ts` |

### How the sync works

`listings.json` is about 13 MB with about 19,700 listings.
Every 6 hours the Worker downloads the full file and parses it as a stream, one listing at a time.
It writes the listings to D1 in chunks of 2,000 rows. Each chunk is one SQL statement with one JSON parameter, because D1 allows only 100 bound parameters per query.
The Worker skips the sync when the file's ETag did not change.

A closed listing is stored only when the job is already in D1, so the table holds the open jobs and the jobs that closed later.
SimplifyJobs closes and reopens jobs without a newer `date_updated`, so a stored job is updated when its status changed or its `date_updated` is newer.
Every write is an upsert, so the sync is safe to run at any time. The Sync button in the settings panel runs the same sync.

### Why the job pages need adapters

SimplifyJobs' own `sponsorship` field is "Other" for over 99% of listings, so visa terms must come from the posting itself.
Most pages are plain HTML, but some hiring systems render the description with JavaScript.
`src/pages.ts` holds one adapter per system that calls its public JSON API instead.
Adding a new hiring system means adding one entry to that table.

### What the model answers

Each job gets one model call with your resume and the job description, and three questions:

| Question | Type | Used for |
|---|---|---|
| `fit` | score, 0 to 3 | Ranking the list |
| `sponsorship` | choice of offers, no_sponsorship, citizenship_required, not_mentioned | Hiding roles that rule out sponsorship when you need it |
| `new_grad` | probability | Spotting roles that really want 2+ years |

Uploading a new resume bumps a version number, so every job in scope is re-scored without re-crawling.
A failed call is stored with its error and retried after an hour.

Scoring uses TypeSafe Jev (`typesafe/jev-1.13`) through Infron's decisions endpoint at `LLM_BASE_URL`, with the `LLM_API_KEY` secret.
Jev takes the resume and posting as `state` plus three typed questions and returns calibrated answers in roughly 0.2 seconds per job.
Changing `LLM_MODEL` re-scores every job in scope, because a score only counts when it was made by the configured model.

Every batch logs one JSON line with the duration of each page fetch and each model call.
Watch it live with `npx wrangler tail jobfinder`, or search past batches in the dashboard under Workers & Pages, jobfinder, Observability.
Cloudflare Workers AI is used only to extract text from a PDF resume, with image description turned off, so it calls no model.

### Web app

The page is a triage inbox. The left pane lists jobs in scope, best fit first, with filters for All, Top (fit of 67 or more), Saved, and Hidden.
The right pane shows the selected job: fit, visa label, new grad likelihood, the sentence from the posting about visas, and the full posting text.
Keyboard shortcuts: `J` and `K` move, `S` saves, `H` hides, `O` opens the posting.
Resume, scope, and data sync live in the settings sheet behind the gear button.

Saved and hidden marks are stored in their own `job_marks` table, so upstream syncs never overwrite them.

The UI lives in `web/` and uses [shadcn/ui](https://ui.shadcn.com) components on Tailwind CSS.
Add a component with `npx shadcn@latest add <name>`; it lands in `web/components/ui/`.
`@cloudflare/vite-plugin` runs the Worker inside the Vite dev server, so the page and `/api/*` share one origin.

## Run the app locally

The tests above need none of this. Running the real app needs a Cloudflare account and an LLM API key.

```sh
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars  # then put your LLM API key in .dev.vars, which git ignores
npx wrangler login              # the AI binding (PDF to text) always runs remotely, even in dev
npm run dev                     # Vite and the Worker together, http://localhost:5173
curl -X POST http://localhost:5173/api/sync   # fills the local jobs table
```

Trigger the cron by hand with `curl "http://localhost:5173/cdn-cgi/local/scheduled"`.

## Deploy

`wrangler.jsonc` holds the `database_id` of the author's D1 database.
Before your first deploy, create your own with `npx wrangler d1 create jobfinder` and put its ID in `wrangler.jsonc`.

```sh
npm run deploy                  # builds the web app and deploys
npx wrangler secret put LLM_API_KEY   # paste the key at the prompt; it is stored encrypted
npm run db:migrate:remote
curl -X POST https://<your-worker>.workers.dev/api/sync   # first sync, or wait for the cron
```

Then protect the site, because the API spends your LLM and Workers AI budget.
In the Cloudflare dashboard, open Zero Trust, then Access, then Applications.
Add a self-hosted application for your `*.workers.dev` hostname with a policy that allows only your email.

The free Workers plan allows only 50 subrequests per invocation, which limits how many jobs one batch can crawl and score.
Keep `BATCH_SIZE` in `wrangler.jsonc` at 10 or below on the free plan.
Its 10 ms CPU limit is also tight for turning ten HTML pages into text, so a batch may fail with error 1102.
If that happens, lower `BATCH_SIZE` or move to the $5 Workers Paid plan.

## Take the site offline and back online

The site is offline when `wrangler.jsonc` has `"workers_dev": false`, `"preview_urls": false`, and `"triggers": { "crons": [] }`.
The Worker, the D1 data, and the secret stay in place, so nothing is lost.
To bring it back, set `"workers_dev": true`, remove `"preview_urls"`, set `"crons": ["0 */6 * * *"]`, and run `npm run deploy`.
