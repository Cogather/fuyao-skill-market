import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('旧 Extension HTTP 状态显示原始发布状态，成功显示版本，失败不回退旧成功版本', async ({
  page,
}) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');
  let publishStatus = '发布失败';
  let version = '0.2';
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
      data = [{ firstScene: '开发', secondScene: '代码开发', sort: 0 }];
    } else if (path.endsWith('/scenes/bindings')) {
      data = [
        {
          firstScene: '开发',
          secondScenes: [
            {
              secondScene: '代码开发',
              components: {
                skills: [{ name: 'udm-skill', version: '2.0.0' }],
                commands: [],
                agents: [],
              },
            },
          ],
        },
      ];
    } else if (path.endsWith('/extensions/history')) {
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
  const badge = page.locator('.scene-list .tree-status');
  await expect(badge).toHaveText('发布失败');
  await expect(badge).toHaveClass(/incomplete/);
  for (const status of ['等待审批', '发布中']) {
    publishStatus = status;
    await page.locator('.scene-list .scene-button').click();
    await expect(badge).toHaveText(status);
  }
  publishStatus = '发布成功';
  version = '0.3';
  await page.locator('.scene-list .scene-button').click();
  await expect(badge).toHaveText('v0.3');
});
