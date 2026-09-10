import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('任务列表分页与内部滚动', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  for (const capability of ['Command', 'Skill', 'Agent']) {
    test(`${capability} 支持每页条数、跳转和搜索，滚动限制在表格内`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.addInitScript(() => {
        sessionStorage.setItem(
          '__skill_market_parent_context_v1__',
          JSON.stringify({
            type: 'Skill_Square_Init',
            userId: 'w30000001',
            userName: '分页测试用户',
            departmentList: [],
          }),
        );
      });
      await page.route('**/api/harness/task/*/my**', (route) =>
        route.fulfill({
          json: {
            meta: { success: true, message: 'OK' },
            data: Array.from({ length: 65 }, (_, index) => ({
              id: `task-${index}`,
              [`${capability.toLowerCase()}Name`]: `${capability} 任务 ${String(index + 1).padStart(2, '0')}`,
              status: index % 2 ? '进行中' : '已完成',
              ownerId: 'w30000001',
              ownerName: '分页测试用户',
              versions: [{ version: '1.0.0' }],
              updatedAt: '2026-09-10 10:00:00',
            })),
          },
        }),
      );
      await page.goto(`${APP_BASE_PATH}/harness-management`);
      await page.getByRole('tab', { name: '任务管理', exact: true }).click();
      await page.getByRole('tab', { name: new RegExp(`^${capability}待办`) }).click();
      const panel = page.locator('.task-management-content');
      const names = panel.locator('.task-name-cell strong');
      const pagination = panel.getByRole('navigation', { name: '任务分页' });
      const size = pagination.getByRole('combobox', { name: '每页条数' });
      await expect(names).toHaveCount(10);
      await expect(size).toBeVisible();
      for (const [value, count] of [
        [20, 20],
        [50, 50],
        [100, 65],
        [10, 10],
      ]) {
        await size.click();
        await page.getByRole('option', { name: `${value}条/页`, exact: true }).click();
        await expect(names).toHaveCount(count);
        await expect(
          pagination.getByRole('button', { name: '第 1 页', exact: true }),
        ).toHaveAttribute('aria-current', 'page');
      }
      const tableWrap = panel.locator('.task-table-wrap');
      const paginationTop = (await pagination.boundingBox())!.y;
      const headerTop = (await panel.locator('th').first().boundingBox())!.y;
      await tableWrap.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      expect(await tableWrap.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      expect((await panel.locator('th').first().boundingBox())!.y).toBeCloseTo(headerTop, 0);
      expect((await pagination.boundingBox())!.y).toBe(paginationTop);
      const overflow = await page.locator('#harness-panel-tasks').evaluate((node) => ({
        height: node.clientHeight,
        scroll: node.scrollHeight,
        top: node.scrollTop,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.height + 1);
      expect(overflow.top).toBe(0);
      await pagination.getByRole('button', { name: '下一页', exact: true }).click();
      await expect(names.first()).toHaveText(`${capability} 任务 11`);
      await expect(tableWrap).toHaveJSProperty('scrollTop', 0);
      const jump = pagination.getByRole('spinbutton', { name: '跳转页码' });
      await jump.fill('999');
      await jump.press('Enter');
      await expect(names).toHaveCount(5);
      await expect(jump).toHaveValue('7');
      await expect(pagination.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
      await panel.getByRole('searchbox').clear();
      await size.click();
      await page.getByRole('option', { name: '10条/页', exact: true }).click();
      for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(
          pagination.getByRole('button', { name: '第 7 页', exact: true }),
        ).toBeVisible();
        const bounds = (await pagination.boundingBox())!;
        for (const button of await pagination.getByRole('button').all()) {
          const rect = (await button.boundingBox())!;
          expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
          expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
        }
        expect(bounds.y + bounds.height).toBeLessThan(844);
      }
      await size.click();
      await page.getByRole('option', { name: '20条/页', exact: true }).click();
      await expect(names).toHaveCount(20);
      await expect(jump).toHaveValue('1');
      await pagination.getByRole('button', { name: '第 2 页', exact: true }).click();
      await panel.getByRole('searchbox').fill('任务 01');
      await expect(names).toHaveCount(1);
      await expect(jump).toHaveValue('1');
      await panel.getByRole('searchbox').fill('不存在的任务');
      await expect(names).toHaveCount(0);
      await expect(pagination).toContainText('共 0 条');
      await expect(pagination.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
      await expect(pagination.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
    });
  }
});
