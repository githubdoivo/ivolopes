import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the solar system renders with no errors or broken images", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => { if (!r.url().includes("fonts.g")) errors.push(`failed: ${r.url()}`); });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const broken = await page.$$eval("img", (imgs) => imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
  expect(broken).toEqual([]);
  expect(errors).toEqual([]);
});

test("the sun is the contact: it opens an email", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("a.sun")).toHaveAttribute("href", "mailto:mail@ivolopes.com");
  await expect(page.locator("a.sun")).toHaveAccessibleName(/email/i);
});

test("each planet leads to its own area, and stage is marked Soon", async ({ page }) => {
  await page.goto("/");
  for (const area of ["qa", "art", "moss"]) {
    await expect(page.locator(`a.planet.${area}`)).toHaveAttribute("href", `https://${area}.ivolopes.com`);
  }
  await expect(page.locator(".planet.stage")).toContainText("Soon");
  expect(await page.locator(".planet.stage a, a.planet.stage").count()).toBe(0);
});

test("only the four areas and the email are linked: nothing else leaks out", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) expect(h).toMatch(/^(mailto:mail@ivolopes\.com|https:\/\/(qa|art|moss)\.ivolopes\.com)$/);
});

test("every planet is on screen and none sits on the sun", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(400);
  const vp = page.viewportSize();
  const sun = await page.locator("a.sun .ball").boundingBox();
  for (const p of ["qa", "art", "moss", "stage"]) {
    const b = await page.locator(`.planet.${p} .ball`).boundingBox();
    expect(b, p).toBeTruthy();
    expect(b.x + b.width / 2, `${p} x`).toBeGreaterThan(0);
    expect(b.x + b.width / 2, `${p} x`).toBeLessThan(vp.width);
    // Circles, and the sun's image includes its glow: allow the edges to touch.
    const d = Math.hypot(b.x + b.width / 2 - (sun.x + sun.width / 2), b.y + b.height / 2 - (sun.y + sun.height / 2));
    expect(d, `${p} sits on the sun`).toBeGreaterThan((b.width + sun.width) / 2 * .85);
  }
});

test("dark-mode extensions are asked to leave the sky alone", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="darkreader-lock"]')).toHaveCount(1);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", /only light/);
});

test("link previews have a title, the right description and an image that exists", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", "Different orbits, same universe.");
  const img = await page.locator('meta[property="og:image"]').getAttribute("content");
  const res = await request.get(new URL(img).pathname);
  expect(res.ok()).toBe(true);
  for (const f of ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"]) expect((await request.get(f)).ok(), f).toBe(true);
});

test("analytics only load on the real domain", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(0);
});

test("nothing scrolls sideways", async ({ page }) => {
  for (const vp of [{ width: 340, height: 700 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp);
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${vp.width}`).toBeLessThanOrEqual(0);
  }
});

test("no serious accessibility problems", async ({ page }) => {
  await page.goto("/");
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => ["serious", "critical"].includes(v.impact));
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("the sky holds still and always covers the whole screen", async ({ page }) => {
  for (const vp of [{ width: 390, height: 664 }, { width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 2560, height: 1080 }]) {
    await page.setViewportSize(vp);
    await page.goto("/");
    await page.mouse.move(10, 10); await page.mouse.move(vp.width - 10, vp.height - 10);
    const sky = await page.locator(".sky").evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, t: getComputedStyle(el).transform, anim: el.getAnimations().length }; });
    expect(sky.top, `${vp.width}`).toBeLessThanOrEqual(0);
    expect(sky.left).toBeLessThanOrEqual(0);
    expect(sky.right).toBeGreaterThanOrEqual(vp.width);
    expect(sky.bottom).toBeGreaterThanOrEqual(vp.height);
    expect(sky.t).toBe("none");
    expect(sky.anim).toBe(0);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const after = await page.locator(".sky").evaluate((el) => el.getBoundingClientRect().bottom);
    expect(after, `bottom after scrolling at ${vp.width}`).toBeGreaterThanOrEqual(vp.height);
  }
});
