import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  // Browser context setup also needs headroom on CI software rendering.
  timeout: 60000,
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure', headless: true, launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {} },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } }],
  webServer: [
    { command: 'npm run preview:tournament', url: 'http://127.0.0.1:3013/readyz', reuseExistingServer: !process.env.CI },
    { command: 'npm start -w @minimorph/multiplayer-server', url: 'http://127.0.0.1:3001/readyz', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview:character', url: 'http://127.0.0.1:5175', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -w @minimorph/telegram -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -w @minimorph/minima -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
  ],
});
