import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node test/preview.mjs",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
  },
});
