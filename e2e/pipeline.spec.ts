import { makeJob, NOW } from "./fixtures";
import { crawlButton, expect, openApp, test, toast } from "./test";

test.describe("crawl + score", () => {
  test.beforeEach(({ fake }) => {
    for (let i = 1; i <= 4; i++) {
      fake.addJob({ job: makeJob(`todo-${i}`, { company: `Pipeline Co ${i}`, title: `Pipeline Engineer ${i}`, date_posted: NOW.getTime() / 1000 - i * 3600 }) });
    }
  });

  test("runs batches until nothing is left and reports the result with timing", async ({ page, fake }) => {
    await openApp(page);
    await expect(page.getByText("7 of 14 scored")).toBeVisible();
    const release = fake.hold("POST /api/process");
    await crawlButton(page).click();
    await expect(crawlButton(page)).toHaveText("Stop");
    release();

    const done = toast(page, "Crawled 5, scored 5");
    await expect(done).toContainText("Everything in scope is done.");
    await expect(done).toContainText("Last batch 1.2s: page fetch avg 0.4s (max 0.7s), model call avg 0.5s (max 0.9s).");
    await expect(crawlButton(page)).toHaveText("Crawl + score");
    // Three batches of 2, 2 and 1 job, then one empty batch that ends the loop.
    expect(fake.processCalls).toBe(4);
    await expect(page.getByText("12 of 14 scored")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "86");
    await expect(page.locator("aside").getByRole("button", { name: /Pipeline Engineer 1/ })).not.toContainText("–");
  });

  test("progress moves after every batch", async ({ page, fake }) => {
    await openApp(page);
    await crawlButton(page).click();
    await expect(page.getByText("12 of 14 scored")).toBeVisible();
    expect(fake.processCalls).toBeGreaterThanOrEqual(3);
  });

  test("a batch with errors shows a warning and keeps going", async ({ page, fake }) => {
    fake.batchErrors = [["https://jobs.example.com/todo-1: model returned an empty answer"]];
    await openApp(page);
    await crawlButton(page).click();
    await expect(toast(page, "1 job failed to score")).toContainText("model returned an empty answer");
    await expect(toast(page, "Crawled 5, scored 5")).toBeVisible();
  });

  test("several failures in one batch use the plural", async ({ page, fake }) => {
    fake.batchErrors = [["https://jobs.example.com/todo-1: timeout", "https://jobs.example.com/todo-2: timeout"]];
    await openApp(page);
    await crawlButton(page).click();
    await expect(toast(page, "2 jobs failed to score")).toContainText("todo-1: timeout");
  });

  test("Stop ends the run after the batch in flight", async ({ page, fake }) => {
    await openApp(page);
    const release = fake.hold("POST /api/process");
    await crawlButton(page).click();
    await expect(crawlButton(page)).toHaveText("Stop");
    await crawlButton(page).click();
    release();

    const stopped = toast(page, "Crawled 2, scored 2");
    await expect(stopped).toContainText("Stopped.");
    await expect(crawlButton(page)).toHaveText("Crawl + score");
    await expect(page.getByText("9 of 14 scored")).toBeVisible();
    expect(fake.processCalls).toBe(1);
  });

  test("a failing batch shows the error and lets the user try again", async ({ page, fake }) => {
    fake.fail("POST /api/process", "LLM provider is unavailable", { status: 502, times: 1 });
    await openApp(page);
    await crawlButton(page).click();
    await expect(toast(page, "Batch failed")).toContainText("LLM provider is unavailable");
    await expect(crawlButton(page)).toHaveText("Crawl + score");
    await expect(crawlButton(page)).toBeEnabled();
    await expect(page.getByText("7 of 14 scored")).toBeVisible();

    await crawlButton(page).click();
    await expect(toast(page, "Crawled 5, scored 5")).toBeVisible();
  });

  test("with nothing to do it reports zero without a timing line", async ({ page, fake }) => {
    for (const j of fake.jobs) if (j.page_status === null) j.page_status = "failed";
    await openApp(page);
    await crawlButton(page).click();
    const done = toast(page, "Crawled 0, scored 0");
    await expect(done).toContainText("Everything in scope is done.");
    await expect(done).not.toContainText("Last batch");
    expect(fake.processCalls).toBe(1);
  });
});
