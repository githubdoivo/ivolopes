import { defineConfig, devices } from "@playwright/test";
// desktop + phone test this checkout; "live" checks the five real sites.
export default defineConfig({
  testDir: "tests",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4176", trace: "retain-on-failure" },
  webServer: { command: "python3 -m http.server 4176", url: "http://localhost:4176", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop", testMatch: /hub\.spec/, use: { ...devices["Desktop Chrome"] } },
    { name: "phone", testMatch: /hub\.spec/, use: { ...devices["Pixel 7"] } },
    { name: "live", testMatch: /live\.spec/, use: { ...devices["Desktop Chrome"] } },
  ],
});
