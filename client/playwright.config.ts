import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.OFFICE_URL ?? 'http://localhost:8081',
    // Leave GPU headroom for the live room and two WebGL tabs under test.
    viewport: { width: 960, height: 600 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    },
  },
})
