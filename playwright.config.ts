import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置（本地优先、稳定优先）。
 *
 * 设计原则（配合 skills/frontend-page-e2e 使用）：
 * 1. 本地开发默认跑单浏览器、单 worker、不重试 —— 红灯就是真问题；
 * 2. CI 环境自动开启 1 次重试 + 失败留痕（trace/截图/视频）；
 * 3. webServer 自动拉起 vite dev server（5173 端口，被占用则直接报错，避免串环境）；
 * 4. 页面演进期以稳定为先：不开 fullyParallel，后续用例规模大了再调整。
 */
export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './test-results',

  timeout: 30_000,
  expect: { timeout: 5_000 },

  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    // 默认使用 playwright 自带的 chromium（npx playwright install chromium 安装）。
    // 受限环境（无法下载浏览器/企业代理）可设置 PW_CHANNEL=msedge 使用系统 Edge，零下载。
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // 视频默认关闭：录制需要额外安装 ffmpeg，trace + 截图已足够定位问题。
    // 如团队确实需要视频，先执行 npx playwright install ffmpeg，再改回 'retain-on-failure'。
    video: 'off',
    locale: 'zh-CN',
    actionTimeout: 10_000,
  },

  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
