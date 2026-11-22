import { detailTitle, expect, openApp, openSettings, row, test, toast } from "./test";

const tab = (page: import("@playwright/test").Page, name: string) => page.getByRole("tab", { name, exact: true });
const detail = (page: import("@playwright/test").Page) => page.locator("article");

test.describe("marks", () => {
  test("Save toggles a bookmark, shows it in Saved and un-saves on the second click", async ({ page, fake }) => {
    await openApp(page);
    const save = detail(page).getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect(detail(page).getByRole("button", { name: "Saved", exact: true })).toBeVisible();
    expect(fake.markBodies).toEqual([{ id: "nw-1", mark: "saved" }]);
    expect(fake.job("nw-1").mark).toBe("saved");

    await tab(page, "Saved").click();
    await expect(page.getByText("2 shown")).toBeVisible();
    await expect(row(page, /Software Engineer, New Grad/)).toBeVisible();

    await detail(page).getByRole("button", { name: "Saved", exact: true }).click();
    expect(fake.markBodies.at(-1)).toEqual({ id: "nw-1", mark: null });
    await expect(page.getByText("1 shown")).toBeVisible();
    await expect(row(page, /Software Engineer, New Grad/)).toHaveCount(0);
    // The un-saved job left the list, so the selection moved to its neighbor.
    await expect(detailTitle(page)).toHaveText("Machine Learning Engineer");
  });

  test("Hide removes the job from All and selects the next job", async ({ page, fake }) => {
    await openApp(page);
    await expect(page.getByRole("heading", { level: 2, name: /strong match/ })).toHaveText("3 strong matches");
    await detail(page).getByRole("button", { name: "Hide", exact: true }).click();
    await expect(row(page, /Software Engineer, New Grad/)).toHaveCount(0);
    await expect(page.getByText("8 shown")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /strong match/ })).toHaveText("2 strong matches");
    await expect(detailTitle(page)).toHaveText("Backend Engineer");
    expect(fake.markBodies).toEqual([{ id: "nw-1", mark: "hidden" }]);

    await tab(page, "Hidden").click();
    await expect(page.getByText("2 shown")).toBeVisible();
    await expect(row(page, /Software Engineer, New Grad/)).toBeVisible();
    await expect(detail(page).getByRole("button", { name: "Hidden", exact: true })).toBeVisible();
  });

  test("hiding the last job selects the one before it", async ({ page }) => {
    await openApp(page);
    await row(page, /Mobile Engineer/).click();
    await detail(page).getByRole("button", { name: "Hide", exact: true }).click();
    await expect(row(page, /Mobile Engineer/)).toHaveCount(0);
    await expect(detailTitle(page)).toHaveText("Site Reliability Engineer");
  });

  test("an un-hidden job leaves the Hidden list", async ({ page, fake }) => {
    await openApp(page);
    await tab(page, "Hidden").click();
    await expect(detailTitle(page)).toHaveText("QA Engineer");
    await detail(page).getByRole("button", { name: "Hidden", exact: true }).click();
    expect(fake.markBodies).toEqual([{ id: "um-10", mark: null }]);
    await expect(page.getByText("No jobs here. Try another filter or widen the scope.")).toBeVisible();
    await expect(page.getByText("Pick a job to see the details.")).toBeVisible();
    await tab(page, "All").click();
    await expect(page.getByText("10 shown")).toBeVisible();
  });

  test("S saves and H hides the selected job from the keyboard", async ({ page, fake }) => {
    await openApp(page);
    await page.keyboard.press("s");
    await expect(detail(page).getByRole("button", { name: "Saved", exact: true })).toBeVisible();
    await page.keyboard.press("s");
    await expect(detail(page).getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await page.keyboard.press("h");
    await expect(detailTitle(page)).toHaveText("Backend Engineer");
    await expect(row(page, /Software Engineer, New Grad/)).toHaveCount(0);
    expect(fake.markBodies).toEqual([
      { id: "nw-1", mark: "saved" },
      { id: "nw-1", mark: null },
      { id: "nw-1", mark: "hidden" },
    ]);
  });

  test("a failed mark reverts the job and shows a toast", async ({ page, fake }) => {
    fake.fail("PUT /api/job/mark", "marks table is locked", { status: 500 });
    await openApp(page);
    await detail(page).getByRole("button", { name: "Hide", exact: true }).click();
    await expect(toast(page, "Could not update the job")).toContainText("marks table is locked");
    await expect(row(page, /Software Engineer, New Grad/)).toBeVisible();
    await expect(page.getByText("9 shown")).toBeVisible();
    expect(fake.job("nw-1").mark).toBeNull();
  });

  test("a failed save reverts the bookmark", async ({ page, fake }) => {
    fake.fail("PUT /api/job/mark", "marks table is locked", { status: 500 });
    await openApp(page);
    await detail(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(toast(page, "Could not update the job")).toBeVisible();
    await expect(detail(page).getByRole("button", { name: "Save", exact: true })).toBeVisible();
  });
});

test.describe("keyboard", () => {
  test("J and K move the selection and stop at both ends", async ({ page }) => {
    await openApp(page);
    await expect(detailTitle(page)).toHaveText("Software Engineer, New Grad");
    await page.keyboard.press("k");
    await expect(detailTitle(page)).toHaveText("Software Engineer, New Grad");
    await page.keyboard.press("j");
    await expect(detailTitle(page)).toHaveText("Backend Engineer");
    await page.keyboard.press("j");
    await expect(detailTitle(page)).toHaveText("Machine Learning Engineer");
    await page.keyboard.press("k");
    await expect(detailTitle(page)).toHaveText("Backend Engineer");
    for (let i = 0; i < 12; i++) await page.keyboard.press("j");
    await expect(detailTitle(page)).toHaveText("Mobile Engineer");
  });

  test("O opens the posting in a new tab", async ({ page, context }) => {
    await openApp(page);
    await page.keyboard.press("j");
    await expect(detailTitle(page)).toHaveText("Backend Engineer");
    const opened = context.waitForEvent("page");
    await page.keyboard.press("o");
    expect((await opened).url()).toBe("https://jobs.example.com/co-2");
  });

  test("keys typed in the search box do not trigger shortcuts", async ({ page, fake, context }) => {
    await openApp(page);
    const search = page.getByPlaceholder("Search");
    await search.click();
    await page.keyboard.type("shjok");
    await expect(search).toHaveValue("shjok");
    expect(fake.markBodies).toEqual([]);
    expect(context.pages()).toHaveLength(1);
    await expect(page.getByText("No jobs here. Try another filter or widen the scope.")).toBeVisible();
  });

  test("shortcuts are ignored while settings are open and work again after", async ({ page, fake, context }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    await page.keyboard.press("h");
    await page.keyboard.press("s");
    await page.keyboard.press("j");
    await page.keyboard.press("o");
    expect(fake.markBodies).toEqual([]);
    expect(context.pages()).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(detailTitle(page)).toHaveText("Software Engineer, New Grad");
    await page.keyboard.press("j");
    await expect(detailTitle(page)).toHaveText("Backend Engineer");
  });

  test("shortcuts with a modifier key are left to the browser", async ({ page, fake }) => {
    await openApp(page);
    await page.keyboard.press("Control+h");
    await page.keyboard.press("Alt+s");
    await page.keyboard.press("Meta+j");
    expect(fake.markBodies).toEqual([]);
    await expect(detailTitle(page)).toHaveText("Software Engineer, New Grad");
  });

  test("shortcuts do nothing when no job is selected", async ({ page, fake }) => {
    fake.jobs.forEach((j) => (j.mark = j.mark === "saved" ? null : j.mark));
    await openApp(page);
    await tab(page, "Saved").click();
    await expect(page.getByText("Pick a job to see the details.")).toBeVisible();
    await page.keyboard.press("s");
    await page.keyboard.press("j");
    expect(fake.markBodies).toEqual([]);
  });
});
