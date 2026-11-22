import { NOW, SENTENCES, makeJob } from "./fixtures";
import { crawlButton, detailTitle, expect, gear, openApp, row, settingsDialog, test, toast } from "./test";

const strong = (page: import("@playwright/test").Page) => page.getByRole("heading", { level: 2, name: /strong match/ });
const tab = (page: import("@playwright/test").Page, name: string) => page.getByRole("tab", { name, exact: true });
const article = (page: import("@playwright/test").Page) => page.locator("article");

test.describe("job list", () => {
  test("shows the best fit first with a strong match count and a shown count", async ({ page }) => {
    await openApp(page);
    await expect(strong(page)).toHaveText("3 strong matches");
    await expect(page.getByText("9 shown")).toBeVisible();
    const titles = page.locator("aside button span.font-medium");
    await expect(titles).toHaveText([
      "Software Engineer, New Grad",
      "Backend Engineer",
      "Machine Learning Engineer",
      "Data Scientist",
      "Platform Engineer",
      "Gameplay Engineer",
      "Frontend Engineer",
      "Site Reliability Engineer",
      "Mobile Engineer",
    ]);
    const first = row(page, /Software Engineer, New Grad/);
    await expect(first).toContainText("Northwind Labs · Seattle, WA");
    await expect(first).toContainText("100");
    await expect(first).toContainText("1d ago");
    await expect(row(page, /Frontend Engineer/)).toContainText("today");
    await expect(row(page, /Frontend Engineer/)).toContainText("–");
    await expect(row(page, /Mobile Engineer/)).toContainText("12d ago");
  });

  test("says 1 strong match in the singular", async ({ page, fake }) => {
    fake.job("co-2").mark = "hidden";
    fake.job("in-9").fit = 2;
    await openApp(page);
    await expect(strong(page)).toHaveText("1 strong match");
  });

  test("filters between All, Top, Saved and Hidden", async ({ page }) => {
    await openApp(page);
    await expect(tab(page, "All")).toHaveAttribute("aria-selected", "true");

    await tab(page, "Top").click();
    await expect(page.getByText("5 shown")).toBeVisible();
    await expect(row(page, /Platform Engineer/)).toBeVisible();
    await expect(row(page, /Gameplay Engineer/)).toHaveCount(0);

    await tab(page, "Saved").click();
    await expect(page.getByText("1 shown")).toBeVisible();
    await expect(row(page, /Machine Learning Engineer/)).toBeVisible();
    await expect(detailTitle(page)).toHaveText("Machine Learning Engineer");

    await tab(page, "Hidden").click();
    await expect(page.getByText("1 shown")).toBeVisible();
    await expect(row(page, /QA Engineer/)).toBeVisible();
    await expect(detailTitle(page)).toHaveText("QA Engineer");

    await tab(page, "All").click();
    await expect(page.getByText("9 shown")).toBeVisible();
    await expect(row(page, /QA Engineer/)).toHaveCount(0);
  });

  test("an empty filter shows the empty state and an empty detail pane", async ({ page, fake }) => {
    fake.job("in-9").mark = null;
    await openApp(page);
    await tab(page, "Saved").click();
    await expect(page.getByText("No jobs here. Try another filter or widen the scope.")).toBeVisible();
    await expect(page.getByText("0 shown")).toBeVisible();
    await expect(page.getByText("Pick a job to see the details.")).toBeVisible();
    await expect(article(page)).toHaveCount(0);
  });

  test("search waits for typing to pause, sends q and filters the list", async ({ page, fake }) => {
    await openApp(page);
    const search = page.getByPlaceholder("Search");
    await search.pressSequentially("robotics");
    await expect(row(page, /Backend Engineer/)).toBeVisible();
    await expect(page.getByText("1 shown")).toBeVisible();
    expect(fake.jobQueries).toContain("robotics");
    expect(fake.jobQueries.filter((q) => q !== "" && q !== "robotics")).toEqual([]);

    await search.fill("boston");
    await expect(page.getByText("1 shown")).toBeVisible();
    await expect(row(page, /Backend Engineer/)).toBeVisible();
    await expect.poll(() => fake.jobQueries.at(-1)).toBe("boston");

    await search.fill("zzz nothing");
    await expect(page.getByText("No jobs here. Try another filter or widen the scope.")).toBeVisible();

    await search.fill("");
    await expect(page.getByText("9 shown")).toBeVisible();
    await expect.poll(() => fake.jobQueries.at(-1)).toBe("");
  });

  test("shows skeletons while the list loads", async ({ page, fake }) => {
    const release = fake.hold("GET /api/jobs");
    await page.goto("/");
    await expect(page.locator('aside [data-slot="skeleton"]')).toHaveCount(10);
    await expect(page.getByText("No jobs here")).toHaveCount(0);
    release();
    await expect(row(page, /Software Engineer, New Grad/)).toBeVisible();
    await expect(page.locator('aside [data-slot="skeleton"]')).toHaveCount(0);
  });

  test("a list that fails to load shows a toast and the empty state", async ({ page, fake }) => {
    fake.fail("GET /api/jobs", "database is offline");
    await page.goto("/");
    await expect(toast(page, "Could not load jobs")).toContainText("database is offline");
    await expect(page.getByText("No jobs here. Try another filter or widen the scope.")).toBeVisible();
    await expect(strong(page)).toHaveText("0 strong matches");
  });

  test("state that fails to load shows a toast and leaves Crawl + score off", async ({ page, fake }) => {
    fake.fail("GET /api/state", "state query timed out");
    await page.goto("/");
    await expect(toast(page, "Could not load state")).toContainText("state query timed out");
    await expect(row(page, /Software Engineer, New Grad/)).toBeVisible();
    await expect(crawlButton(page)).toBeDisabled();
    await expect(page.getByText(/ scored$/)).toHaveCount(0);
    await expect(settingsDialog(page)).toHaveCount(0);
    await expect(gear(page).locator(".bg-red-500")).toHaveCount(0);
  });

  test("the header shows how many in-scope jobs are scored", async ({ page }) => {
    await openApp(page);
    await expect(page.getByText("7 of 10 scored")).toBeVisible();
    const bar = page.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuenow", "70");
    await expect(bar.locator('[data-slot="progress-indicator"]')).toHaveAttribute("style", /translateX\(-30%\)/);
  });
});

test.describe("job detail", () => {
  test("a strong fit shows fit, visa, new grad and the highlighted visa sentence", async ({ page }) => {
    await openApp(page);
    const a = article(page);
    await expect(detailTitle(page)).toHaveText("Software Engineer, New Grad");
    await expect(a).toContainText("Northwind Labs · Software Engineering · posted 1d ago");
    await expect(a).toContainText("Seattle, WA; Remote, USA");
    await expect(a.getByText("100", { exact: true })).toBeVisible();
    await expect(a.getByText("Strong fit")).toBeVisible();
    await expect(a.getByText("Sponsors", { exact: true })).toBeVisible();
    await expect(a.getByText("92%")).toBeVisible();
    await expect(a.locator("blockquote")).toHaveText(SENTENCES.offers);
    await expect(a.locator("blockquote mark")).toHaveText(["sponsor", "H-1B", "authorization"]);
    await expect(a.getByText("We build reliable software for example customers.")).toBeVisible();
  });

  test("a good fit that needs citizenship", async ({ page }) => {
    await openApp(page);
    await row(page, /Platform Engineer/).click();
    const a = article(page);
    await expect(detailTitle(page)).toHaveText("Platform Engineer");
    await expect(a.getByText("67", { exact: true })).toBeVisible();
    await expect(a.getByText("Good fit")).toBeVisible();
    await expect(a.getByText("Citizens only", { exact: true })).toBeVisible();
    await expect(a.getByText("15%")).toBeVisible();
    await expect(a.locator("blockquote mark")).toHaveText(["citizens", "clearance"]);
  });

  test("a job that rules sponsorship out", async ({ page }) => {
    await openApp(page);
    await row(page, /Backend Engineer/).click();
    const a = article(page);
    await expect(a.getByText("No sponsorship", { exact: true })).toBeVisible();
    await expect(a.getByText("40%")).toBeVisible();
    await expect(a.locator("blockquote mark")).toHaveText(["sponsor", "work visa"]);
  });

  test("a weak fit whose posting says nothing about visas", async ({ page }) => {
    await openApp(page);
    await row(page, /Gameplay Engineer/).click();
    const a = article(page);
    await expect(a.getByText("33", { exact: true })).toBeVisible();
    await expect(a.getByText("Weak fit")).toBeVisible();
    await expect(a.getByText("Not mentioned", { exact: true })).toBeVisible();
    await expect(a.getByText("55%")).toBeVisible();
    await expect(a.getByText("Nothing about sponsorship or work authorization in the posting.")).toBeVisible();
    await expect(a.locator("blockquote")).toHaveCount(0);
  });

  test("a job that was never crawled is not scored", async ({ page }) => {
    await openApp(page);
    await row(page, /Frontend Engineer/).click();
    const a = article(page);
    await expect(a.getByText("Not scored")).toHaveCount(2);
    await expect(a.getByText("–", { exact: true })).toBeVisible();
    await expect(a.getByText("The posting has not been crawled yet.")).toBeVisible();
    await expect(a.getByText("No description stored. Open the posting to read it on the company site.")).toBeVisible();
  });

  test("a job whose scoring failed shows the error", async ({ page }) => {
    await openApp(page);
    await row(page, /Site Reliability Engineer/).click();
    const a = article(page);
    await expect(a.getByText("Scoring failed")).toBeVisible();
    await expect(a.getByText("model returned invalid JSON")).toBeVisible();
    await expect(a.getByText("Nothing about sponsorship or work authorization in the posting.")).toBeVisible();
  });

  test("a posting that failed to load shows the page error", async ({ page }) => {
    await openApp(page);
    await row(page, /Mobile Engineer/).click();
    await expect(article(page).getByText("HTTP 403 from jobs.example.com Open the posting to read it on the company site.")).toBeVisible();
  });

  test("a detail request that fails shows a toast and the error in place of the posting", async ({ page, fake }) => {
    fake.fail("GET /api/job", "posting store is offline", { status: 503 });
    await openApp(page);
    await expect(toast(page, "Could not load the posting")).toContainText("posting store is offline");
    await expect(article(page).getByText("posting store is offline Open the posting to read it on the company site.")).toBeVisible();
    await expect(article(page).getByText("The posting has not been crawled yet.")).toBeVisible();
  });

  test("shows skeletons until the posting arrives", async ({ page, fake }) => {
    const release = fake.hold("GET /api/job");
    await openApp(page);
    await expect(article(page).locator('[data-slot="skeleton"]')).toHaveCount(4);
    release();
    await expect(article(page).locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expect(article(page).locator("blockquote")).toBeVisible();
  });

  test("Open posting is a new-tab link to the posting", async ({ page, context }) => {
    await openApp(page);
    const link = article(page).getByRole("link", { name: "Open posting" });
    await expect(link).toHaveAttribute("href", "https://jobs.example.com/nw-1");
    await expect(link).toHaveAttribute("target", "_blank");
    const opened = context.waitForEvent("page");
    await link.click();
    expect((await opened).url()).toBe("https://jobs.example.com/nw-1");
  });

  test("a job crawled by the pipeline gets its detail refetched", async ({ page, fake }) => {
    fake.addJob({ job: makeJob("new-1", { company: "Zenith Works", title: "Zenith Engineer", date_posted: NOW.getTime() / 1000 - 3600 }) });
    await openApp(page);
    await row(page, /Zenith Engineer/).click();
    await expect(article(page).getByText("The posting has not been crawled yet.")).toBeVisible();
    await page.getByRole("button", { name: "Crawl + score" }).click();
    await expect(toast(page, /Crawled/)).toBeVisible();
    await expect(article(page).getByText("About Zenith Works", { exact: false })).toBeVisible();
    await expect(article(page).locator("blockquote")).toBeVisible();
  });
});
