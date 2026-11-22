import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { FakeApi, NOW } from "./fixtures";
import { COVERAGE_DIR } from "./paths";


type Fixtures = { fake: FakeApi; coverage: void; recordingOverlay: void };

// Headless video has no cursor and no test name. Draw both into every page of the context, popups included.
// They live in a closed shadow root with pointer-events off, so locators and hit tests never see them.
function installOverlay(caption: string) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .cursor { position:fixed; left:0; top:0; width:22px; height:22px; transform:translate(-100px,-100px); transition:transform 80ms linear; }
      .ring { position:absolute; left:-14px; top:-14px; width:28px; height:28px; border-radius:50%; border:3px solid #ef4444; opacity:0; }
      .ring.on { animation:click 400ms ease-out; }
      @keyframes click { from { opacity:1; transform:scale(.4); } to { opacity:0; transform:scale(1.4); } }
      .caption { position:fixed; left:8px; right:8px; bottom:8px; padding:6px 10px; border-radius:6px; background:rgba(15,23,42,.85);
                 color:#fff; font:600 12px/1.4 ui-sans-serif,system-ui,sans-serif; }
      .key { margin-left:8px; padding:0 6px; border-radius:4px; background:#fbbf24; color:#111; display:none; }
    </style>
    <div class="cursor"><div class="ring"></div>
      <svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 1 L2 18 L7 13.5 L10.5 21 L13.5 19.5 L10 12.5 L16.5 12.5 Z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>
    </div>
    <div class="caption"></div>`;
  const cursor = root.querySelector<HTMLElement>(".cursor")!;
  const ring = root.querySelector<HTMLElement>(".ring")!;
  const label = root.querySelector<HTMLElement>(".caption")!;
  label.textContent = caption;
  const key = document.createElement("span");
  key.className = "key";
  label.append(key);
  let keyTimer = 0;
  addEventListener("pointermove", (e) => (cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`), true);
  addEventListener("pointerdown", (e) => {
    cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    ring.classList.remove("on");
    void ring.offsetWidth;
    ring.classList.add("on");
  }, true);
  addEventListener("keydown", (e) => {
    key.textContent = `key ${e.key.length === 1 ? e.key.toUpperCase() : e.key}`;
    key.style.display = "inline";
    clearTimeout(keyTimer);
    keyTimer = window.setTimeout(() => (key.style.display = "none"), 800);
  }, true);
  const mount = () => document.body.append(host);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
}

export const test = base.extend<Fixtures>({
  recordingOverlay: [
    async ({ context }, use, testInfo) => {
      const caption = [path.basename(testInfo.file), ...testInfo.titlePath.slice(1)].join(" › ");
      await context.addInitScript(installOverlay, caption);
      await use();
    },
    { auto: true },
  ],
  fake: [
    async ({ page, context }, use) => {
      const fake = new FakeApi();
      await page.clock.setFixedTime(NOW);
      await page.route((url) => url.pathname.startsWith("/api/"), fake.handle);
      // Posting links point at example.com. Nothing may leave the machine.
      await context.route("https://jobs.example.com/**", (route) =>
        route.fulfill({ contentType: "text/html", body: "<title>Fake posting</title><h1>Fake posting</h1>" }),
      );
      await use(fake);
      expect(fake.unhandled, "the app called an /api/* route the fake does not handle").toEqual([]);
    },
    { auto: true },
  ],
  coverage: [
    async ({ page }, use) => {
      await use();
      const data = await page.evaluate(() => (window as unknown as { __coverage__?: unknown }).__coverage__);
      if (data) writeFileSync(path.join(COVERAGE_DIR, `${randomUUID()}.json`), JSON.stringify(data));
    },
    { auto: true },
  ],
});

export { expect };

// includeHidden: while the settings sheet is open, Radix marks the page behind it aria-hidden.
export const gear = (page: Page) => page.getByRole("button", { name: "Settings", includeHidden: true });
export const crawlButton = (page: Page) => page.getByRole("button", { name: /Crawl \+ score|Stop/, includeHidden: true });
export const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "Settings" });
export const detailTitle = (page: Page) => page.locator("article h2");
export const row = (page: Page, title: string | RegExp) => page.getByRole("button", { name: title });
// first(): React StrictMode runs mount effects twice in dev, so a failing first load can raise the same toast twice.
export const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

/** Open the app and wait until the first job list has rendered. */
export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/strong match/)).toBeVisible();
  await expect(page.locator('aside [data-slot="skeleton"]')).toHaveCount(0);
}

export async function openSettings(page: Page) {
  await gear(page).click();
  await expect(settingsDialog(page)).toBeVisible();
  return settingsDialog(page);
}

/** The dd next to a label in the settings Data card. */
export const stat = (dialog: Locator, label: string) => dialog.getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
