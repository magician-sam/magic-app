import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./test/e2e',
  testMatch:'bugfixes.spec.mjs',
  workers:1,
  timeout:45000,
  use:{baseURL:'http://127.0.0.1:3245',browserName:'chromium',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node test/bugfix-preview.mjs',url:'http://127.0.0.1:3245/api/health',reuseExistingServer:!process.env.CI},
});
