import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const DEPARTMENT_PATH = ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组'];
const MOCK_AGENT_STORAGE = 'skill-market-harness-capability-planning-v4-agent';

async function selectDepartmentPath(page: Page, path: string[]): Promise<void> {
  await page.locator('.asset-department__trigger').click();
  const panel = page.locator('.asset-department__panel');
  for (let index = 0; index < path.length; index += 1) {
    const accessiblePath = path.slice(0, index + 1).join(' / ');
    const nameButton = panel.getByRole('button', { name: accessiblePath, exact: true });
    await expect(nameButton).toBeVisible();
    if (index === path.length - 1) {
      await nameButton.click();
      return;
    }
    const toggle = nameButton.locator('xpath=..').locator('.asset-department__toggle');
    if (((await toggle.getAttribute('aria-label')) ?? '').startsWith('展开')) {
      await toggle.click();
    }
  }
}

async function scrollAssetBoard(page: Page, position: 'top' | 'bottom'): Promise<void> {
  await page.locator('.asset-board--catalog').evaluate((element, target) => {
    element.style.scrollBehavior = 'auto';
    element.scrollTop = target === 'bottom' ? element.scrollHeight : 0;
    element.dispatchEvent(new Event('scroll'));
  }, position);
}

test.describe('资产卡片分页懒加载', () => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    '该用例使用大批量 Mock 资产验证浏览器滚动行为',
  );

  test('只在向下触底时追加下一页，并在筛选变化后重置', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(
      ({ storageKey }) => {
        window.localStorage.clear();
        const catalog = Array.from({ length: 60 }, (_, index) => ({
          id: `lazy-agent-${String(index + 1).padStart(2, '0')}`,
          name: `懒加载 Agent ${String(index + 1).padStart(2, '0')}`,
          description: '用于验证资产列表向下触底后分批追加，已加载卡片保持在前端列表中。',
          level: '部门级',
          product: '',
          owner: '测试用户 w30000001',
          department: '持续交付组',
          developOwner: '开发用户 w30000002',
          developOwnerDepartment: '持续交付组',
          plannedCompleteDate: '2026-09-30',
          status: '已完成',
          versions: [],
          createdAt: `2026-09-06T08:${String(index).padStart(2, '0')}:00.000Z`,
          updatedAt: `2026-09-06T08:${String(index).padStart(2, '0')}:00.000Z`,
        }));
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ catalog, planning: [], catalogSeed: 3000, planningSeed: 3000 }),
        );
      },
      { storageKey: MOCK_AGENT_STORAGE },
    );

    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.getByRole('tab', { name: 'Agent / Skill 资产' }).click();
    await selectDepartmentPath(page, DEPARTMENT_PATH);
    await page
      .getByRole('navigation', { name: '资产类型' })
      .getByRole('button', { name: 'Agent', exact: true })
      .click();

    const board = page.locator('.asset-board--catalog');
    const cards = board.locator('.asset-card');
    await expect(cards).toHaveCount(24);
    const firstPageTitles = await cards.getByRole('heading', { level: 2 }).allTextContents();

    await board.evaluate((element) => {
      element.style.scrollBehavior = 'auto';
      element.scrollTop = 200;
      element.dispatchEvent(new Event('scroll'));
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
      element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 20);
      element.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(24);

    const compactCards = await page.addStyleTag({
      content:
        '.asset-board--catalog .asset-card { min-height: 1px !important; height: 1px !important; padding: 0 !important; overflow: hidden !important; }',
    });
    await expect
      .poll(() => board.evaluate((element) => element.scrollHeight <= element.clientHeight + 1))
      .toBe(true);
    await board.dispatchEvent('wheel', { deltaY: 120 });
    await expect(cards).toHaveCount(48);
    await expect(cards.getByRole('heading', { level: 2 })).toContainText(firstPageTitles);
    await compactCards.evaluate((element) => element.remove());

    await scrollAssetBoard(page, 'top');
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(48);

    await scrollAssetBoard(page, 'bottom');
    await expect(cards).toHaveCount(60);
    await expect(board.getByText('已加载全部 60 项')).toBeVisible();
    const allTitles = await cards.getByRole('heading', { level: 2 }).allTextContents();
    expect(new Set(allTitles).size).toBe(60);

    await scrollAssetBoard(page, 'bottom');
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(60);

    await page
      .getByRole('navigation', { name: '资产类型' })
      .getByRole('button', { name: 'Command', exact: true })
      .click();
    await expect.poll(() => board.evaluate((element) => element.scrollTop)).toBe(0);

    await page
      .getByRole('navigation', { name: '资产类型' })
      .getByRole('button', { name: 'Agent', exact: true })
      .click();
    await expect(cards).toHaveCount(24);
    await expect.poll(() => board.evaluate((element) => element.scrollTop)).toBe(0);
  });
});
