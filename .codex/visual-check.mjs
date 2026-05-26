import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json',
);
const { chromium } = require('playwright');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://127.0.0.1:5175/skill-market/index.html';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1 });
const consoleMessages = [];
page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) {
    consoleMessages.push(`${msg.type()}: ${msg.text()}`);
  }
});
page.on('pageerror', (error) => {
  consoleMessages.push(`pageerror: ${error.message}`);
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: path.join(scriptDir, 'skill-market-desktop.png'), fullPage: false });

const desktopMetrics = await page.evaluate(() => {
  const rect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };
  const visibleCards = [...document.querySelectorAll('.card')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const overflowingCards = visibleCards.filter(
    (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
  );
  return {
    title: document.title,
    url: location.href,
    viewport: `${innerWidth}x${innerHeight}`,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    topbar: rect('.market-topbar'),
    hero: rect('.market-hero'),
    stats: rect('.stats-strip'),
    sidebar: rect('.market-sidebar'),
    grid: rect('.overview-panel .grid'),
    cards: visibleCards.length,
    overflowingCards: overflowingCards.length,
  };
});

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: path.join(scriptDir, 'skill-market-mobile.png'), fullPage: false });

const mobileMetrics = await page.evaluate(() => ({
  viewport: `${innerWidth}x${innerHeight}`,
  horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  topbarHeight: Math.round(document.querySelector('.market-topbar')?.getBoundingClientRect().height ?? 0),
  heroHeight: Math.round(document.querySelector('.market-hero')?.getBoundingClientRect().height ?? 0),
  visibleCards: [...document.querySelectorAll('.card')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }).length,
}));

await browser.close();

console.log(
  JSON.stringify(
    {
      desktop: desktopMetrics,
      mobile: mobileMetrics,
      consoleMessages: consoleMessages.slice(0, 12),
      screenshots: {
        desktop: path.join(scriptDir, 'skill-market-desktop.png'),
        mobile: path.join(scriptDir, 'skill-market-mobile.png'),
      },
    },
    null,
    2,
  ),
);
