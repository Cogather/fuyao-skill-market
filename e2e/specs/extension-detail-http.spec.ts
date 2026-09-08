import type { Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('资产清单 Extension 新详情与旧发布', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('选择场景显示新详情，已有名称直接查询，发布保留旧请求体', async ({ page }) => {
    const detailRequests: Request[] = [];
    const bindingRequests: Request[] = [];
    const publishRequests: Request[] = [];
    const detail = {
      firstScene: '应用开发',
      secondScene: '代码开发',
      readyStatus: '已就绪',
      publishedExtension: {
        extensionName: 'udm-code-extension',
        version: '1.0.0',
        description: '新详情接口提供的描述',
        publishStatus: '发布成功',
      },
      components: {
        commands: [
          { name: 'udm-code-command', version: '2.0.0', uploadedAt: '2026-08-01 10:00:00' },
        ],
        agents: [{ name: 'udm-code-agent', version: '3.0.0', uploadedAt: '2026-08-02 10:00:00' }],
        skills: [],
      },
    };
    let rejectDetail = false;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data: unknown = [];
      if (path.endsWith('/smapi-product-by-dept')) {
        data = [{ offeringId: 'product-1', offeringName: 'udm' }];
      } else if (path.endsWith('/scene-activity/scene')) {
        data = [{ firstScene: '应用开发', secondScene: '代码开发', sort: 0 }];
      } else if (path.endsWith('/scenes/bindings')) {
        bindingRequests.push(request);
        data = [
          {
            firstScene: '应用开发',
            secondScenes: [
              {
                ...detail,
                readyStatus: '不完备',
                components: { commands: [], skills: [], agents: [] },
              },
            ],
          },
        ];
      } else if (path.endsWith('/extensions/detail')) {
        detailRequests.push(request);
        if (rejectDetail) {
          await route.fulfill({
            json: { meta: { success: false, message: 'SCENE_NOT_FOUND' }, data: null },
          });
          return;
        }
        data = detail;
      } else if (path.endsWith('/extensions/orgs')) {
        data = [{ orgCode: 'org-1', orgName: '目标组织' }];
      } else if (path.endsWith('/extensions/history')) {
        data = [
          {
            id: 'older-release',
            firstScene: '应用开发',
            secondScene: '代码开发',
            extensionName: 'udm-code-extension',
            version: '0.9.0',
            publishStatus: '发布成功',
            description: '历史接口尚未返回最新版本',
            publishedAt: '2026-07-01 10:00:00',
          },
        ];
      } else if (path.endsWith('/extensions') && request.method() === 'POST') {
        publishRequests.push(request);
        data = 'release-1';
      }
      await route.fulfill({
        json: {
          meta: { success: true, message: 'OK', number: Array.isArray(data) ? data.length : 0 },
          data,
        },
      });
    });

    await page.route(`**${APP_BASE_PATH}/extension-test`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
    );
    await page.goto(`${APP_BASE_PATH}/extension-test`);
    await page.evaluate(async () => {
      const vueUrl = '/skill-market/node_modules/.vite/deps/vue.js';
      const componentUrl = '/skill-market/src/views/skill/ExtensionPublishPage.vue';
      const { createApp, h } = await import(vueUrl);
      const { default: Component } = await import(componentUrl);
      createApp({
        setup() {
          return () =>
            h(
              'div',
              { id: 'capability-management-panel-extension' },
              h(Component, {
                userId: 'extension-tester',
                userName: 'Extension 测试用户',
                departmentTree: [
                  { id: 'dept-1', deptCode: 'dept-1', name: '研发部', children: [] },
                ],
                currentUserDepartmentPath: ['研发部'],
                allowedDepartmentPaths: [['研发部']],
                restrictToAllowedDepartments: true,
              }),
            );
        },
      }).mount('#test-host');
    });
    const panel = page.locator('#capability-management-panel-extension');
    await expect(panel.locator('.extension-name')).toHaveText('udm-code-extension');
    await expect(panel.locator('.extension-description')).toHaveText('新详情接口提供的描述');
    await expect(panel.locator('.version-text')).toHaveText('v1.0.0');
    await expect(panel.getByRole('button', { name: /udm-code-agent/ })).toContainText('2026-08-02');
    await expect(panel.getByRole('button', { name: '发布', exact: true })).toBeEnabled();
    expect(detailRequests).toHaveLength(1);
    expect(detailRequests[0]!.method()).toBe('POST');
    expect(new URL(detailRequests[0]!.url()).searchParams.get('userId')).toBe('extension-tester');
    expect(detailRequests[0]!.postDataJSON()).toEqual({
      dimType: '产品级',
      dimCode: 'product-1',
      dimName: 'udm',
      extensionName: 'udm-code-extension',
    });

    const initialBindings = bindingRequests.length;
    await panel.getByRole('button', { name: /应用开发 代码开发/ }).click();
    await expect.poll(() => detailRequests.length).toBe(2);
    expect(bindingRequests.length).toBe(initialBindings);

    await panel.getByRole('button', { name: '发布', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /发布 Extension/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(publishRequests).toHaveLength(1);
    expect(publishRequests[0]!.postDataJSON()).toMatchObject({
      extensionName: 'udm-code-extension',
      description: '新详情接口提供的描述',
      releaseType: 'beta',
      firstScene: '应用开发',
      secondScene: '代码开发',
      targetOrgCode: 'org-1',
      targetOrgName: '目标组织',
      commands: [{ name: 'udm-code-command', version: '2.0.0' }],
      agents: [{ name: 'udm-code-agent', version: '3.0.0' }],
      skills: [],
    });
    expect(new URL(publishRequests[0]!.url()).searchParams.get('operatorName')).toBe(
      'Extension 测试用户',
    );

    rejectDetail = true;
    await panel.getByRole('button', { name: /应用开发 代码开发/ }).click();
    await expect(panel.getByRole('alert')).toContainText('SCENE_NOT_FOUND');
  });
});
