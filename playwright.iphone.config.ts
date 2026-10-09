import { defineConfig, devices } from '@playwright/test';

// iPhone 大小的 Chromium/WebKit 回归；登录确认使用明确的测试会话，真实接口单独验收。
export default defineConfig({
    testDir: './test/iphone',
    workers: 1,
    timeout: 90_000,
    expect: { timeout: 20_000 },
    reporter: 'line',
    use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block' },
    projects: [
        { name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] } } },
        { name: 'mobile-webkit', use: { ...devices['iPhone 13'], launchOptions: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH } : {} } },
    ],
    webServer: {
        command: 'cross-env VITE_LIBRARY_INITIAL_SUITE=grid VITE_NETEASE_API_BASE=/api/netease npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 120_000,
    },
});
