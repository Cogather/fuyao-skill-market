import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('旧 Extension 场景树只显示各自 bindings readyStatus，不受发布历史或组件完备性影响', async ({
  page,
}) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');
  let publishStatus = '发布失败';
  let version = '0.2';
  let readyStatus: string | null | undefined = '不完备';
  let historyFails = false;
  let bindingRequests = 0;
  const sceneRows = [
    { firstScene: '开发', secondScene: '代码开发', sort: 0 },
    { firstScene: '开发', secondScene: '补丁开发', sort: 1 },
    { firstScene: '开发', secondScene: '无状态场景', sort: 2 },
    { firstScene: '测试', secondScene: '代码开发', sort: 0 },
  ];
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'status-user',
        userName: '状态测试用户',
        departmentList: [
          { deptId: 'dept-1', deptCode: 'dept-1', deptName: '研发部', deptLevel: 5 },
        ],
      }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    let data: unknown = [];
    if (path.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-1', path: ['研发部'], levelNo: 5 }],
        adminOrgs: [],
      };
    } else if (path.endsWith('/smapi-product-by-dept')) {
      data = [{ offeringId: 'product-1', offeringName: 'udm' }];
    } else if (path.endsWith('/scene-activity/scene')) {
      data = sceneRows;
    } else if (path.endsWith('/scenes/bindings')) {
      bindingRequests += 1;
      data = [
        {
          firstScene: '开发',
          secondScenes: [
            {
              secondScene: '代码开发',
              readyStatus,
              components: {
                skills: [{ name: 'udm-skill', version: '2.0.0' }],
                commands: [],
                agents: [],
              },
            },
            { secondScene: '补丁开发', readyStatus: '已就绪', components: {} },
            { secondScene: '无状态场景', ready: true, components: {} },
          ],
        },
        {
          firstScene: '测试',
          secondScenes: [{ secondScene: '代码开发', readyStatus: '接口新增状态' }],
        },
      ];
    } else if (path.endsWith('/extensions/history')) {
      if (historyFails) {
        await route.fulfill({
          json: { meta: { success: false, message: '历史接口失败' }, data: null },
        });
        return;
      }
      data = [
        {
          id: 'latest',
          firstScene: '开发',
          secondScene: '代码开发',
          extensionName: 'udm-extension',
          publishStatus,
          version,
          publishedAt: '2026-09-10 12:00:00',
        },
        {
          id: 'older',
          firstScene: '开发',
          secondScene: '代码开发',
          extensionName: 'udm-extension',
          publishStatus: '发布成功',
          version: '0.1',
          publishedAt: '2026-09-09 12:00:00',
        },
      ];
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-capabilities').click();
  await page.locator('#capability-management-tab-extension').click();
  const sceneButton = page
    .locator('.scene-list .scene-button')
    .filter({ hasText: /^开发代码开发/ });
  const badge = sceneButton.locator('.tree-status');
  const patchBadge = page
    .locator('.scene-button')
    .filter({ hasText: '补丁开发' })
    .locator('.tree-status');
  const missingBadge = page
    .locator('.scene-button')
    .filter({ hasText: '无状态场景' })
    .locator('.tree-status');
  const testBadge = page
    .locator('.scene-button')
    .filter({ hasText: /^测试代码开发/ })
    .locator('.tree-status');
  await expect(badge).toHaveText('不完备');
  await expect(badge).toHaveClass(/incomplete/);
  await expect(patchBadge).toHaveText('已就绪');
  await expect(patchBadge).toHaveClass(/ready/);
  await expect(testBadge).toHaveText('接口新增状态');
  await expect(missingBadge).toHaveCount(0);
  expect(bindingRequests).toBe(1);
  for (const status of ['等待审批', '发布中', '发布成功']) {
    publishStatus = status;
    version = '0.3';
    await sceneButton.click();
    await expect(sceneButton).toBeEnabled();
    await expect(badge).toHaveText('不完备');
  }
  for (const status of ['就绪', '已就绪', '未配置', '接口新增状态', '', undefined, null]) {
    readyStatus = status;
    await sceneButton.click();
    await expect(sceneButton).toBeEnabled();
    if (status) await expect(badge).toHaveText(status);
    else await expect(badge).toHaveCount(0);
  }
  historyFails = true;
  readyStatus = '不完备';
  await sceneButton.click();
  await expect(page.locator('.extension-load-alert')).toContainText('历史接口失败');
  await expect(badge).toHaveText('不完备');
  await expect(patchBadge).toHaveText('已就绪');
});
