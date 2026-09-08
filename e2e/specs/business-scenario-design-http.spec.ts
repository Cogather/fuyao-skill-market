import { expect, test } from '../fixtures/base';
import type { WorkflowDetail } from '../../src/services/skillMarket/businessScenarioDesignService';

test.describe('业务场景设计 HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');
  test('保存四步设计，刷新恢复后端进度，错误时保留输入', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        '__skill_market_parent_context_v1__',
        JSON.stringify({
          type: 'Skill_Square_Init',
          userId: 'designer',
          userName: '设计用户',
          departmentList: [
            {
              deptId: 'dept-design',
              deptCode: 'dept-design',
              deptName: '研发部',
              deptLevel: 1,
              children: [],
            },
          ],
        }),
      );
    });
    const calls: { path: string; method: string; body: any; query: URLSearchParams }[] = [];
    let rejectCode = false;
    const detail: WorkflowDetail = {
      flowName: '代码作业流',
      flowDescription: '',
      sceneExtensionCode: 'demo-code',
      secondSceneDescription: '场景说明',
      commands: [],
      assetPool: [],
      stages: [
        {
          activityNodeName: '编码',
          sort: 0,
          steps: [{ subActivityNodeName: '生成', sort: 0, boundAssets: [] }],
        },
      ],
      steps: [],
      nextStep: 2,
      allDone: false,
    };
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const body = request.postDataJSON();
      const method = request.method();
      calls.push({ path, method, body, query: url.searchParams });
      let data: unknown = [];
      if (path.endsWith('/permission/user-depts'))
        data = {
          ownedOrgs: [
            { deptName: '研发部', deptCode: 'dept-design', path: ['研发部'], levelNo: 1 },
          ],
          adminOrgs: [],
        };
      else if (path.endsWith('/smapi-product-by-dept'))
        data = [{ offeringId: 'p-demo', offeringName: 'demo' }];
      else if (path.endsWith('/scene-activity/scene') && method === 'GET')
        data = [
          {
            firstScene: '研发',
            secondScene: '代码生成',
            sort: 0,
            ...detail,
            commands: undefined,
            assetPool: undefined,
            stages: undefined,
            steps: undefined,
          },
        ];
      else if (path.endsWith('/workflow/detail')) {
        detail.steps = [
          { key: 'scenario', label: '业务场景分析', state: 'done', reason: '' },
          { key: 'workflow', label: 'Workflow 规划', state: 'done', reason: '' },
          {
            key: 'command',
            label: 'Command 入口',
            state: detail.commands.length ? 'done' : 'todo',
            reason: '',
          },
          {
            key: 'assets',
            label: 'Skill / Agent 集成',
            state: detail.stages[0]!.steps[0]!.boundAssets.length ? 'done' : 'todo',
            reason: '',
          },
        ];
        detail.allDone = detail.steps.every((item) => item.state === 'done');
        detail.nextStep = detail.allDone
          ? 4
          : detail.steps.findIndex((item) => item.state !== 'done');
        data = detail;
      } else if (path.endsWith('/scene/code')) {
        if (rejectCode)
          return route.fulfill({
            json: {
              meta: { success: false, message: 'SCENE_CODE_LOCKED：编码已锁定' },
              data: null,
            },
          });
        detail.sceneExtensionCode = body.sceneExtensionCode;
        data = null;
      } else if (path.endsWith('/scene/workflow-meta')) {
        Object.assign(detail, body);
        data = null;
      } else if (path.endsWith('/commands/management/query'))
        data = [
          {
            id: 'command-1',
            commandName: 'demo-start',
            commandDescription: '普通入口',
            dimCode: 'p-demo',
            dimName: 'demo',
          },
        ];
      else if (path.endsWith('/skills/management/query'))
        data = [
          {
            id: 'skill-1',
            skillName: 'demo-coding',
            skillDescription: '生成代码',
            dimCode: 'p-demo',
            dimName: 'demo',
          },
        ];
      else if (path.endsWith('/commands/config/supplement/add')) {
        detail.commands.push({ commandName: body.commandName, description: '普通入口' });
        data = null;
      } else if (path.endsWith('/workflow/asset-pool')) data = detail.assetPool;
      else if (path.endsWith('/workflow/asset-pool/add')) {
        detail.assetPool.push({
          assetType: body.assetType,
          assetName: body.assetName,
          description: '生成代码',
          packageReady: true,
        });
        data = null;
      } else if (path.endsWith('/skills/config/supplement/add')) {
        detail.stages[0]!.steps[0]!.boundAssets.push({
          assetType: 'SKILL',
          assetName: body.skillName,
        });
        data = null;
      }
      await route.fulfill({ json: { meta: { success: true, message: 'OK' }, data } });
    });
    // Mount the real tab and workspace without unrelated shell dependencies.
    await page.route('**/skill-market/scenario-test', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
    );
    const mount = async () => {
      await page.goto('/skill-market/scenario-test');
      await page.evaluate(async () => {
        const vueUrl = '/skill-market/node_modules/.vite/deps/vue.js';
        const workspaceUrl = '/skill-market/src/composables/useHarnessScenarioWorkspace.ts';
        const componentUrl = '/skill-market/src/views/skill/BusinessScenarioDesignPage.vue';
        const { createApp, h } = await import(vueUrl);
        const { createHarnessScenarioWorkspace } = await import(workspaceUrl);
        const { default: Component } = await import(componentUrl);
        createApp({
          setup() {
            const workspace = createHarnessScenarioWorkspace(() => ({
              ready: true,
              userId: 'designer',
              departmentTree: [
                { id: 'dept-design', deptCode: 'dept-design', name: '研发部', children: [] },
              ],
              defaultDepartmentPath: ['研发部'],
              allowedDepartmentPaths: [['研发部']],
              restrictToAllowedDepartments: true,
            }));
            return () => h('div', { id: 'harness-panel-scenarios' }, h(Component, { workspace }));
          },
        }).mount('#test-host');
      });
    };
    await mount();
    const panel = page.locator('#harness-panel-scenarios');
    await expect(panel.getByRole('heading', { name: '代码作业流', exact: true })).toBeVisible();
    await panel.locator('.workflow-card .progress').getByRole('button').first().click();
    const wizard = page.getByRole('dialog', { name: 'Workflow 设计', exact: true });
    await expect(wizard).toBeVisible();
    await wizard.getByLabel(/^场景编码/).fill('demo-design');
    await wizard.getByLabel('场景说明与目标 *').fill('已保存的场景目标');
    await wizard.getByRole('button', { name: '下一步', exact: true }).click();
    await wizard.getByLabel('流程名称', { exact: true }).fill('服务端工作流');
    await wizard.getByRole('button', { name: '下一步', exact: true }).click();
    await wizard.locator('.capability-trigger').click();
    await wizard.getByText('/demo-start', { exact: true }).click();
    await expect(
      wizard.getByText('建议添加 e2e 主入口 Command，当前配置仍可继续保存。'),
    ).toBeVisible();
    await wizard.getByRole('button', { name: '下一步', exact: true }).click();
    await wizard.locator('.capability-trigger').click();
    await wizard
      .getByRole('group', { name: '资产类型' })
      .getByRole('button', { name: 'Skill', exact: true })
      .click();
    await wizard
      .locator('.asset-option')
      .filter({ hasText: 'demo-coding' })
      .getByRole('button', { name: '+ 添加', exact: true })
      .click();
    await wizard.getByRole('searchbox', { name: '搜索 Skill' }).press('Escape');
    await wizard.locator('select').selectOption({ label: 'demo-coding（Skill）' });
    await wizard.getByRole('button', { name: '完成设计', exact: true }).click();
    await expect(wizard).toHaveCount(0);
    await expect(panel.locator('.workflow-card')).toContainText('设计完成');
    const poolAdd = calls.findIndex((call) => call.path.endsWith('/asset-pool/add'));
    const binding = calls.findIndex((call) => call.path.endsWith('/skills/config/supplement/add'));
    expect(poolAdd).toBeGreaterThan(-1);
    expect(binding).toBeGreaterThan(poolAdd);
    expect(calls[poolAdd]!.body.secondScene).toBe('代码生成');
    const command = calls.find((call) => call.path.endsWith('/commands/config/supplement/add'))!;
    expect(command.body.activityNodeName).toBeNull();
    expect(command.body.subActivityNodeName).toBeNull();
    expect(command.query.get('dimCode')).toBe('p-demo');
    await mount();
    await expect(panel.getByRole('heading', { name: '服务端工作流', exact: true })).toBeVisible();
    await expect(panel.locator('.workflow-card')).toContainText('设计完成');
    await panel.locator('.workflow-card .progress').getByRole('button').first().click();
    await expect(wizard.getByLabel(/^场景编码/)).toHaveValue('demo-design');
    rejectCode = true;
    await wizard.getByLabel(/^场景编码/).fill('demo-rejected');
    await wizard.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(wizard.locator('.wizard-footer .error')).toContainText('编码已锁定');
    await expect(wizard.getByLabel(/^场景编码/)).toHaveValue('demo-rejected');
    await wizard.getByRole('button', { name: '放弃未保存修改' }).click();
    await expect(wizard).toHaveCount(0);
  });
});
