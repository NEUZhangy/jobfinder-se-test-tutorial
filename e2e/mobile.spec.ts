import { detailTitle, expect, openApp, row, test } from "./test";

test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

test("selecting a job shows its detail and All jobs goes back to the list", async ({ page }) => {
  await openApp(page);
  const heading = page.getByRole("heading", { level: 2, name: /strong match/ });
  await expect(heading).toBeVisible();
  await expect(detailTitle(page)).toBeHidden();
  await expect(page.getByText(/ scored$/)).toBeHidden();

  await row(page, /Backend Engineer/).tap();
  await expect(detailTitle(page)).toBeVisible();
  await expect(detailTitle(page)).toHaveText("Backend Engineer");
  await expect(heading).toBeHidden();
  const back = page.getByRole("button", { name: "All jobs" });
  await expect(back).toBeVisible();

  await back.tap();
  await expect(heading).toBeVisible();
  await expect(detailTitle(page)).toBeHidden();
  await expect(back).toBeHidden();
  await expect(row(page, /Backend Engineer/)).toBeVisible();
});
