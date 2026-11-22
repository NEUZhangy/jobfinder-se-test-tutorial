import { DATA, FAKE_RESUME_TEXT, HW, NOW, PM, RESUME_TOO_SHORT, SHORT_RESUME_TEXT, SWE } from "./fixtures";
import { crawlButton, expect, gear, openApp, openSettings, row, settingsDialog, stat, test, toast } from "./test";

const synced = (ms: number) => `Last synced ${new Date(ms).toLocaleString("en-US", { timeZone: "UTC" })}`;

test.describe("first load without a resume", () => {
  test.beforeEach(({ fake }) => {
    fake.profile = { ...fake.profile, hasResume: false, resumeVersion: 0 };
  });

  test("settings open by themselves, the gear has a red dot and Crawl + score is off", async ({ page }) => {
    await page.goto("/");
    const dialog = settingsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("None yet")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save resume" })).toBeDisabled();
    await expect(gear(page).locator(".bg-red-500")).toBeVisible();
    await expect(crawlButton(page)).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(gear(page).locator(".bg-red-500")).toBeVisible();
    await expect(crawlButton(page)).toBeDisabled();
  });

  test("pasting a resume saves it, clears the red dot and enables Crawl + score", async ({ page, fake }) => {
    await page.goto("/");
    const dialog = settingsDialog(page);
    await dialog.getByRole("tab", { name: "Paste text" }).click();
    const save = dialog.getByRole("button", { name: "Save resume" });
    await expect(save).toBeDisabled();
    await dialog.getByPlaceholder("Paste your resume as plain text").fill(FAKE_RESUME_TEXT);
    await expect(save).toBeEnabled();
    await save.click();

    const saved = toast(page, "Resume saved");
    await expect(saved).toContainText(`${FAKE_RESUME_TEXT.length.toLocaleString("en-US")} characters. Jobs in scope will be re-scored.`);
    expect(fake.resumeBodies).toEqual([FAKE_RESUME_TEXT]);
    await expect(dialog.getByText("v1", { exact: true })).toBeVisible();
    await expect(dialog.getByText("None yet")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Replace resume" })).toBeVisible();
    await expect(dialog.getByPlaceholder("Paste your resume as plain text")).toHaveValue("");
    await expect(gear(page).locator(".bg-red-500")).toHaveCount(0);
    await expect(crawlButton(page)).toBeEnabled();
    // Saving a resume throws away old scores, so nothing is scored yet.
    await expect(page.getByText("0 of 10 scored")).toBeVisible();
  });
});

test.describe("resume", () => {
  test("uploading a PDF shows its name and size, then saves it as the next version", async ({ page, fake }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    await expect(dialog.getByText("v3", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Choose a PDF")).toBeVisible();
    await expect(dialog.getByText("Text is extracted on Cloudflare")).toBeVisible();
    const replace = dialog.getByRole("button", { name: "Replace resume" });
    await expect(replace).toBeDisabled();

    await dialog.locator('input[type="file"]').setInputFiles({ name: "jane-example-resume.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(2500, 1) });
    await expect(dialog.getByText("jane-example-resume.pdf")).toBeVisible();
    await expect(dialog.getByText("3 KB")).toBeVisible();
    await expect(replace).toBeEnabled();
    await replace.click();

    await expect(toast(page, "Resume saved")).toContainText("characters");
    expect(fake.resumeBodies).toEqual(["[pdf]"]);
    await expect(dialog.getByText("v4", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Choose a PDF")).toBeVisible();
  });

  test("a PDF with no text shows the server error and keeps the file", async ({ page }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    await dialog.locator('input[type="file"]').setInputFiles({ name: "scanned-resume.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(100, 1) });
    await dialog.getByRole("button", { name: "Replace resume" }).click();
    const error = toast(page, "Could not save resume");
    await expect(error).toContainText(RESUME_TOO_SHORT);
    await expect(dialog.getByText("scanned-resume.pdf")).toBeVisible();
    await expect(dialog.getByText("v3", { exact: true })).toBeVisible();
  });

  test("text that is too short shows the server error and keeps the text", async ({ page, fake }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    await dialog.getByRole("tab", { name: "Paste text" }).click();
    const box = dialog.getByPlaceholder("Paste your resume as plain text");
    await box.fill(SHORT_RESUME_TEXT);
    await dialog.getByRole("button", { name: "Replace resume" }).click();
    await expect(toast(page, "Could not save resume")).toContainText(RESUME_TOO_SHORT);
    await expect(box).toHaveValue(SHORT_RESUME_TEXT);
    expect(fake.resumeBodies).toEqual([]);
    await expect(dialog.getByText("v3", { exact: true })).toBeVisible();
  });

  test("the save button shows Saving while the request is in flight", async ({ page, fake }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    await dialog.getByRole("tab", { name: "Paste text" }).click();
    await dialog.getByPlaceholder("Paste your resume as plain text").fill(FAKE_RESUME_TEXT);
    const release = fake.hold("POST /api/resume");
    await dialog.getByRole("button", { name: "Replace resume" }).click();
    await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
    release();
    await expect(toast(page, "Resume saved")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Replace resume" })).toBeVisible();
  });
});

test.describe("scope", () => {
  test("toggling categories, editing locations and flipping sponsorship saves one PUT and re-filters the list", async ({ page, fake }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    const category = (name: string) => dialog.getByRole("checkbox", { name: new RegExp(name) });
    await expect(category(SWE)).toBeChecked();
    await expect(category(DATA)).toBeChecked();
    await expect(category(PM)).not.toBeChecked();
    await expect(category(HW)).not.toBeChecked();
    await expect(dialog.getByRole("switch", { name: /I need visa sponsorship/ })).not.toBeChecked();

    await category(PM).check();
    await category(DATA).uncheck();
    await dialog.getByLabel("Locations").fill("CA,  NY , ,");
    await dialog.getByRole("switch", { name: /I need visa sponsorship/ }).check();
    await dialog.getByRole("button", { name: "Save scope" }).click();

    await expect(toast(page, "Scope saved")).toBeVisible();
    expect(fake.settingsBodies).toEqual([{ categories: [SWE, PM], locationKeywords: ["CA", "NY"], needsSponsorship: true }]);
    await expect(stat(dialog, "In scope")).toHaveText("2");

    await page.keyboard.press("Escape");
    await expect(page.getByText("2 shown")).toBeVisible();
    await expect(row(page, /Gameplay Engineer/)).toBeVisible();
    await expect(row(page, /Associate Product Manager/)).toBeVisible();
    await expect(row(page, /Data Scientist/)).toHaveCount(0);
  });

  test("the sponsorship switch alone hides roles that rule sponsorship out", async ({ page, fake }) => {
    await openApp(page);
    await expect(row(page, /Backend Engineer/)).toBeVisible();
    const dialog = await openSettings(page);
    await dialog.getByRole("switch", { name: /I need visa sponsorship/ }).click();
    await dialog.getByRole("button", { name: "Save scope" }).click();
    await expect(toast(page, "Scope saved")).toBeVisible();
    expect(fake.settingsBodies).toEqual([{ categories: [SWE, DATA], locationKeywords: [], needsSponsorship: true }]);
    await page.keyboard.press("Escape");
    await expect(row(page, /Backend Engineer/)).toHaveCount(0);
    await expect(row(page, /Platform Engineer/)).toHaveCount(0);
    await expect(row(page, /Software Engineer, New Grad/)).toBeVisible();
  });

  test("a failed save shows the server error and Saving while it runs", async ({ page, fake }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    fake.fail("PUT /api/settings", "settings table is locked", { status: 503 });
    const release = fake.hold("PUT /api/settings");
    await dialog.getByRole("button", { name: "Save scope" }).click();
    await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
    release();
    await expect(toast(page, "Could not save scope")).toContainText("settings table is locked");
    await expect(dialog.getByRole("button", { name: "Save scope" })).toBeEnabled();
    expect(fake.profile.categories).toEqual([SWE, DATA]);
  });

  test("Save scope is disabled while no category is selected", async ({ page }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    const save = dialog.getByRole("button", { name: "Save scope" });
    await expect(save).toBeEnabled();
    await dialog.getByRole("checkbox", { name: new RegExp(SWE) }).uncheck();
    await dialog.getByRole("checkbox", { name: new RegExp(DATA) }).uncheck();
    await expect(save).toBeDisabled();
    await dialog.getByRole("checkbox", { name: new RegExp(HW) }).check();
    await expect(save).toBeEnabled();
  });
});

test.describe("data", () => {
  test("a sync that changed things reports it and updates the counts and last synced time", async ({ page, fake }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    await expect(dialog.getByText(synced(NOW.getTime() - 90 * 60_000))).toBeVisible();
    await expect(stat(dialog, "Active listings")).toHaveText("12");
    await expect(stat(dialog, "In scope")).toHaveText("10");
    await expect(stat(dialog, "Crawled")).toHaveText("9");
    await expect(stat(dialog, "Scored")).toHaveText("7");

    const release = fake.hold("POST /api/sync");
    const button = dialog.getByRole("button", { name: "Sync all listings" });
    await button.click();
    await expect(button).toBeDisabled();
    release();

    await expect(toast(page, "Synced 42 recent listings")).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(stat(dialog, "Active listings")).toHaveText("13");
    await expect(stat(dialog, "In scope")).toHaveText("11");
    await expect(dialog.getByText(synced(NOW.getTime()))).toBeVisible();
  });

  test("a sync with nothing new says it is up to date", async ({ page, fake }) => {
    fake.syncResult = { changed: false, seen: 0 };
    await openApp(page);
    const dialog = await openSettings(page);
    await dialog.getByRole("button", { name: "Sync all listings" }).click();
    await expect(toast(page, "Already up to date")).toBeVisible();
    await expect(stat(dialog, "Active listings")).toHaveText("12");
    await expect(dialog.getByText(synced(NOW.getTime()))).toBeVisible();
  });

  test("a failed sync shows the error", async ({ page, fake }) => {
    fake.fail("POST /api/sync", "listings feed returned 502", { status: 502 });
    await openApp(page);
    const dialog = await openSettings(page);
    await dialog.getByRole("button", { name: "Sync all listings" }).click();
    await expect(toast(page, "Sync failed")).toContainText("listings feed returned 502");
    await expect(dialog.getByRole("button", { name: "Sync all listings" })).toBeEnabled();
    await expect(stat(dialog, "Active listings")).toHaveText("12");
  });

  test("a database that never synced says so", async ({ page, fake }) => {
    fake.lastSync = null;
    await openApp(page);
    const dialog = await openSettings(page);
    await expect(dialog.getByText("Not synced yet")).toBeVisible();
  });
});
