import { test, expect } from "@playwright/test";
// Checks the real sites, once a day from CI. Run locally with: npm run test:live
const SITES = {
  hub: "https://ivolopes.com",
  qa: "https://qa.ivolopes.com",
  art: "https://art.ivolopes.com",
  moss: "https://moss.ivolopes.com",
};

for (const [name, url] of Object.entries(SITES)) {
  test(`${name} is up over HTTPS with its icons`, async ({ request }) => {
    const res = await request.get(url);
    expect(res.status()).toBe(200);
    for (const f of ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"]) {
      expect((await request.get(url + f)).ok(), `${name}${f}`).toBe(true);
    }
  });

  test(`${name} loads in a browser with no script errors`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: "networkidle" });
    expect(errors).toEqual([]);
  });
}

// Only the hub links to the areas. The areas never link to the hub or to each other.
for (const name of ["qa", "art", "moss"]) {
  test(`${name} does not link to the hub or the other areas`, async ({ page }) => {
    await page.goto(SITES[name], { waitUntil: "networkidle" });
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
    const others = Object.entries(SITES).filter(([n]) => n !== name).map(([, u]) => new URL(u).host);
    const bad = hrefs.filter((h) => { try { return others.includes(new URL(h).host); } catch { return false; } });
    expect(bad).toEqual([]);
  });
}

test("qa: no phone number on the site or in the PDFs' links", async ({ page }) => {
  await page.goto(SITES.qa, { waitUntil: "networkidle" });
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\+?351[\s\d]{9,}|\b9\d{2}\s?\d{3}\s?\d{3}\b/);
  expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
  for (const pdf of ["/ivo-lopes-cv.pdf", "/ivo-lopes-cv-pt.pdf"]) {
    const res = await page.request.get(SITES.qa + pdf);
    expect(res.ok(), pdf).toBe(true);
    expect(res.headers()["content-type"]).toContain("pdf");
  }
});
