import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('资产清单分页与内部滚动', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  for (const capability of ['Command', 'Skill', 'Agent']) {
    test(`${capability} 分页、跳页及调整每页条数，页面和分页保持固定`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.addInitScript(() => {
        sessionStorage.setItem(
          '__skill_market_parent_context_v1__',
          JSON.stringify({
            type: 'Skill_Square_Init',
            userId: 'catalog-user',
            userName: '测试用户',
            departmentList: [{ deptCode: 'dept', deptName: '研发部', deptLevel: 1 }],
          }),
        );
      });
      const queries: Array<{ page: number; size: number }> = [];
      await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return route.fallback();
        let data: unknown = [];
        let total = 0;
        if (url.pathname.endsWith('/permission/user-depts')) {
          data = {
            ownedOrgs: [],
            adminOrgs: [{ deptCode: 'dept', deptName: '研发部', path: ['研发部'], levelNo: 1 }],
          };
        } else if (url.pathname.endsWith('/smapi-product-by-dept')) {
          data = [{ offeringId: 'product', offeringName: 'catalog-product' }];
        } else if (url.pathname.endsWith('/management/query')) {
          const pageNum = Number(url.searchParams.get('pageNum') || 1);
          const pageSize = Number(url.searchParams.get('pageSize') || 10);
          queries.push({ page: pageNum, size: pageSize });
          total = url.searchParams.get('keyword') ? 0 : 65;
          data = Array.from({ length: total }, (_, index) => ({
            id: `catalog-${index}`,
            name: `${capability} 资产 ${String(index + 1).padStart(2, '0')}`,
            [`${capability.toLowerCase()}Name`]: `${capability} 资产 ${String(index + 1).padStart(2, '0')}`,
            description: '用于验证资产清单内滚动、固定表头和分页的描述。',
            owner: '测试用户',
            ownerName: '测试用户',
            ownerId: 'catalog-user',
            developOwner: '开发用户',
            status: '已完成',
            versions: [{ version: '1.0.0' }],
          })).slice((pageNum - 1) * pageSize, pageNum * pageSize);
        }
        await route.fulfill({ json: { meta: { success: true, total, number: total }, data } });
      });
      await page.goto(`${APP_BASE_PATH}/harness-management`);
      await page.locator('#harness-tab-capabilities').click();
      await page.locator(`#capability-management-tab-${capability.toLowerCase()}`).click();
      const panel = page.locator(`#capability-management-panel-${capability.toLowerCase()}`);
      const table = panel.getByRole('region', { name: `${capability} 清单表格` });
      const rows = table.locator('tbody tr').filter({ has: page.getByRole('checkbox') });
      const pagination = panel.getByRole('navigation', { name: '资产清单分页' });
      const size = pagination.getByRole('combobox', { name: '每页条数' });
      await expect(rows).toHaveCount(10);
      await expect(pagination).toContainText('共 65 条');
      for (const [value, count] of [
        [20, 20],
        [50, 50],
        [100, 65],
        [10, 10],
      ]) {
        await size.click();
        await page.getByRole('option', { name: `${value}条/页`, exact: true }).click();
        await expect(rows).toHaveCount(count);
        expect(queries.at(-1)).toEqual({ page: 1, size: value });
      }
      for (const [width, height] of [
        [1920, 1080],
        [1366, 768],
        [1280, 720],
        [1024, 768],
      ]) {
        await page.setViewportSize({ width, height });
        const paginationTop = (await pagination.boundingBox())!.y;
        const headerTop = (await table.locator('th').first().boundingBox())!.y;
        await table.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
          node.scrollLeft = node.scrollWidth;
        });
        expect(await table.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        expect((await table.locator('th').first().boundingBox())!.y).toBeCloseTo(headerTop, 0);
        expect((await pagination.boundingBox())!.y).toBe(paginationTop);
        expect(paginationTop + (await pagination.boundingBox())!.height).toBeLessThan(height);
        for (const selector of [
          'html',
          'body',
          '#harness-panel-capabilities',
          '.capability-management-page',
          `#capability-management-panel-${capability.toLowerCase()}`,
        ]) {
          const overflow = await page
            .locator(selector)
            .evaluate((node) => ({ height: node.clientHeight, scroll: node.scrollHeight }));
          expect(overflow.scroll, `${selector} 在 ${width}×${height} 的高度`).toBeLessThanOrEqual(
            overflow.height + 1,
          );
        }
      }
      await pagination.getByRole('button', { name: '下一页', exact: true }).click();
      await expect(rows.first()).toContainText(`${capability} 资产 11`);
      await expect(table).toHaveJSProperty('scrollTop', 0);
      expect(queries.at(-1)).toEqual({ page: 2, size: 10 });
      const jump = pagination.getByRole('spinbutton', { name: '跳转页码' });
      await jump.fill('999');
      await jump.press('Enter');
      await expect(rows).toHaveCount(5);
      await expect(jump).toHaveValue('7');
      await expect(pagination.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
      await pagination.getByRole('button', { name: '第 1 页', exact: true }).click();
      await expect(rows.first()).toContainText(`${capability} 资产 01`);
      await expect(pagination.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
      await page.setViewportSize({ width: 1366, height: 768 });
      await table.evaluate((node) => {
        node.scrollLeft = 0;
      });
      await page.screenshot({ path: testInfo.outputPath(`${capability}-catalog.png`) });
      await panel.getByRole('searchbox', { name: '关键词' }).fill('不存在的资产');
      await panel.getByRole('button', { name: '查询', exact: true }).click();
      await expect(rows).toHaveCount(0);
      await expect(pagination).toContainText('共 0 条');
      await expect(pagination.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
      await expect(pagination.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
    });
  }

  test('Extension 场景列表在面板内部滚动，不撑高整个页面', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        '__skill_market_parent_context_v1__',
        JSON.stringify({
          type: 'Skill_Square_Init',
          userId: 'catalog-user',
          userName: '测试用户',
          departmentList: [{ deptCode: 'dept', deptName: '研发部', deptLevel: 1 }],
        }),
      );
    });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith('/api/')) return route.fallback();
      let data: unknown = [];
      if (path.endsWith('/permission/user-depts')) {
        data = {
          ownedOrgs: [{ deptCode: 'dept', deptName: '研发部', path: ['研发部'], levelNo: 1 }],
          adminOrgs: [],
        };
      } else if (path.endsWith('/smapi-product-by-dept')) {
        data = [{ offeringId: 'product', offeringName: 'catalog-product' }];
      } else if (path.endsWith('/scene-activity/scene')) {
        data = Array.from({ length: 40 }, (_, index) => ({
          firstScene: '开发',
          secondScene: `场景 ${index + 1}`,
          sort: index,
        }));
      } else if (path.endsWith('/scenes/bindings')) {
        data = [
          {
            firstScene: '开发',
            secondScenes: Array.from({ length: 40 }, (_, index) => ({
              secondScene: `场景 ${index + 1}`,
              readyStatus: '已就绪',
              components: {
                commands: [],
                agents: [],
                skills: Array.from({ length: 20 }, (_, index) => ({
                  name: `skill-${index}`,
                  version: '1.0.0',
                })),
              },
            })),
          },
        ];
      }
      await route.fulfill({ json: { meta: { success: true }, data } });
    });
    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.locator('#harness-tab-capabilities').click();
    await page.locator('#capability-management-tab-extension').click();
    const panel = page.locator('#capability-management-panel-extension');
    await expect(panel.locator('.scene-button')).toHaveCount(40);
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [1280, 720],
      [1024, 768],
    ]) {
      await page.setViewportSize({ width, height });
      const tree = panel.locator('.scene-tree-body');
      await tree.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      expect(await tree.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      const lastScene = (await panel.locator('.scene-button').last().boundingBox())!;
      expect(lastScene.y + lastScene.height).toBeLessThan(height);
      for (const selector of [
        'html',
        'body',
        '#harness-panel-capabilities',
        '.capability-management-page',
        '#capability-management-panel-extension',
        '#capability-management-panel-extension .extension-page',
      ]) {
        const overflow = await page
          .locator(selector)
          .evaluate((node) => ({ height: node.clientHeight, scroll: node.scrollHeight }));
        expect(overflow.scroll, `${selector} 在 ${width}×${height} 的高度`).toBeLessThanOrEqual(
          overflow.height + 1,
        );
      }
    }
    await page.screenshot({ path: testInfo.outputPath('Extension-catalog.png') });
  });
});
