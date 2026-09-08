import { expect, test } from '../fixtures/base';
import type { WorkflowDetail } from '../../src/services/skillMarket/businessScenarioDesignService';

test.describe('业务场景设计 HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');
  for (const missingCommandName of [false, true]) {
    test(`保存四步设计，刷新恢复后端进度，错误时保留输入${missingCommandName ? '（详情 Command 名称为空）' : ''}`, async ({
      page,
    }) => {
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
      await page.route('**/dataengineering/config-center/hw-userinfo**', (route) =>
        route.fulfill({
          json: {
            meta: { success: true },
            data: [{ chName: '张三', sAMAccountName: 'u1', deptName: '研发部' }],
          },
        }),
      );
      let rejectCode = false;
      let pauseMetadataSave = false;
      let finishMetadataSave: (() => void) | undefined;
      let currentSceneName = '代码生成';
      const commandName = missingCommandName ? '/demo-created-command' : '/demo-start';
      const skillName = missingCommandName ? 'demo-created-skill' : 'demo-coding';
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
              secondScene: currentSceneName,
              sort: 0,
              ...detail,
              commands: undefined,
              assetPool: undefined,
              stages: undefined,
              steps: undefined,
            },
          ];
        else if (path.endsWith('/scene-activity/scene') && method === 'POST') {
          currentSceneName = body.scenes.find((scene: any) => scene.secondScene)?.secondScene;
          detail.sceneExtensionCode = null;
          detail.secondSceneDescription = null;
          detail.flowName = null;
          detail.flowDescription = null;
          data = null;
        } else if (path.endsWith('/workflow/detail')) {
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
          data = missingCommandName
            ? {
                ...detail,
                commands: detail.commands.map(() => ({ commandName: null, description: null })),
              }
            : detail;
        } else if (path.endsWith('/scene/code')) {
          if (rejectCode)
            return route.fulfill({
              json: {
                meta: { success: false, message: 'SCENE_CODE_LOCKED：编码已锁定' },
                data: null,
              },
            });
          Object.assign(detail, body);
          data = null;
        } else if (path.endsWith('/scene/workflow-meta')) {
          if (pauseMetadataSave) {
            pauseMetadataSave = false;
            await new Promise<void>((resolve) => {
              finishMetadataSave = resolve;
            });
          }
          Object.assign(detail, body);
          data = null;
        } else if (path.endsWith('/hw-userinfo'))
          data = [{ chName: '张三', sAMAccountName: 'u1', deptName: '研发部' }];
        else if (/\/(commands|skills|agents)\/management\/add$/.test(path))
          data = 'new-capability-id';
        else if (path.endsWith('/commands/management/query'))
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
        } else if (path.endsWith('/commands/config/supplement/query')) {
          data = detail.commands.map((command, index) => ({
            commandConfigEntity: {
              id: `scene-command-${index}`,
              firstScene: '研发',
              secondScene: currentSceneName,
              dimCode: 'p-demo',
              commandName: command.commandName,
              commandDescription: command.description,
              activityNodeName: null,
              subActivityNodeName: null,
            },
          }));
        } else if (path.endsWith('/workflow/asset-pool')) data = detail.assetPool;
        else if (path.endsWith('/workflow/asset-pool/add')) {
          detail.assetPool.push({
            assetType: body.assetType,
            assetName: body.assetName,
            description: '生成代码',
            packageReady: true,
          });
          data = null;
        } else if (
          path.endsWith('/skills/config/supplement/add') ||
          path.endsWith('/agents/config/supplement/add')
        ) {
          detail.stages[0]!.steps[0]!.boundAssets.push({
            assetType: body.skillName ? 'SKILL' : 'AGENT',
            assetName: body.skillName || body.agentName,
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
      const steps = wizard.locator('nav > button');
      await expect(steps.nth(0)).toBeEnabled();
      await expect(steps.nth(1)).toBeEnabled();
      await expect(steps.nth(2)).toBeEnabled();
      await expect(steps.nth(3)).toBeDisabled();
      await steps.nth(1).click();
      await expect(wizard.locator('.wizard-page')).toHaveAttribute('aria-label', 'Workflow 规划');
      await steps.nth(0).click();
      await expect(wizard.locator('.wizard-page')).toHaveAttribute('aria-label', '业务场景分析');
      await wizard.getByLabel(/^场景名称/).fill('代码生成新版');
      await wizard.getByLabel(/^场景编码/).fill('DEMO_invalid');
      const mutationsBeforeInvalidCode = calls.filter((call) => call.method !== 'GET').length;
      await steps.nth(1).click();
      await expect(wizard.locator('.wizard-footer .error')).toContainText('场景编码不符合命名规则');
      expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(
        mutationsBeforeInvalidCode,
      );
      await wizard.getByLabel(/^场景编码/).fill('demo-design');
      await wizard.getByLabel('场景说明与目标 *').fill('已保存的场景目标');
      await wizard.getByRole('button', { name: '下一步', exact: true }).click();
      await wizard.getByLabel('流程名称', { exact: true }).fill('服务端工作流');
      await expect(wizard.locator('.wizard-save-status')).toContainText('有未保存修改');
      expect(detail.flowName).not.toBe('服务端工作流');
      const metadataRequest = page.waitForRequest(
        (request) =>
          request.method() === 'PUT' &&
          new URL(request.url()).pathname.endsWith('/scene/workflow-meta'),
      );
      pauseMetadataSave = true;
      await wizard.getByRole('button', { name: '保存', exact: true }).click();
      await metadataRequest;
      await expect(wizard).toHaveAttribute('aria-busy', 'true');
      await expect(wizard.locator('header .close')).toBeDisabled();
      const requestsDuringSave = calls.length;
      await panel.locator('.modal').click({ position: { x: 5, y: 5 } });
      await expect(wizard).toBeVisible();
      expect(calls).toHaveLength(requestsDuringSave);
      finishMetadataSave!();
      await expect(wizard.locator('.wizard-save-status')).toHaveText('已保存');
      await expect(wizard.locator('.wizard-page')).toHaveAttribute('aria-label', 'Workflow 规划');
      expect(detail.flowName).toBe('服务端工作流');
      const requestsBeforeSavedClose = calls.length;
      await wizard.getByRole('button', { name: '关闭 Workflow 设计', exact: true }).click();
      await expect(wizard).toHaveCount(0);
      expect(calls).toHaveLength(requestsBeforeSavedClose);
      await panel.locator('.workflow-card .progress').getByRole('button').nth(1).click();
      await expect(wizard.getByLabel('流程名称', { exact: true })).toHaveValue('服务端工作流');
      await wizard.getByRole('button', { name: '+ 添加环节', exact: true }).click();
      await wizard.getByPlaceholder('环节名称', { exact: true }).fill('尚未添加的环节');
      const requestsBeforePendingSave = calls.length;
      await wizard.getByRole('button', { name: '保存', exact: true }).click();
      await expect(wizard.locator('.wizard-footer .error')).toContainText('请先完成或取消');
      expect(calls).toHaveLength(requestsBeforePendingSave);
      await wizard
        .locator('.structure-draft-actions')
        .getByRole('button', { name: '取消', exact: true })
        .click();
      await wizard.getByRole('button', { name: '下一步', exact: true }).click();
      async function fillCapabilityPeople() {
        const form = wizard.locator('.capability-create-form');
        for (const label of ['开发责任人 *', '责任人 *']) {
          await form.getByRole('combobox', { name: label, exact: true }).fill('张三');
          await form.getByRole('option', { name: /u1/ }).click();
        }
        await form.getByPlaceholder('描述 *').fill('HTTP 创建能力');
        await form.locator('input[type="date"]').fill('2026-12-31');
      }
      if (missingCommandName) {
        await wizard.getByRole('button', { name: '+ 新定义 Command', exact: true }).click();
        await wizard.getByRole('textbox', { name: /^Command 名称/ }).fill(commandName);
        await fillCapabilityPeople();
        await wizard.getByRole('button', { name: '创建并加入资产清单', exact: true }).click();
      } else {
        await wizard.locator('.capability-trigger').click();
        await wizard.getByText(commandName, { exact: true }).click();
      }
      await expect(wizard.locator('.command-row code')).toHaveText(commandName);
      await expect(
        wizard.getByText('建议添加 e2e 主入口 Command，当前配置仍可继续保存。'),
      ).toBeVisible();
      await wizard.getByRole('button', { name: '下一步', exact: true }).click();
      await expect(wizard.locator('.wizard-page')).toHaveAttribute(
        'aria-label',
        'Skill / Agent 集成',
      );
      if (missingCommandName) {
        for (const type of ['Skill', 'Agent']) {
          await wizard.getByRole('button', { name: `+ 自定义 ${type}`, exact: true }).click();
          await wizard
            .getByRole('textbox', { name: new RegExp(`^${type} 名称`) })
            .fill(`demo-created-${type.toLowerCase()}`);
          await fillCapabilityPeople();
          await wizard.getByRole('button', { name: '创建并加入资产清单', exact: true }).click();
          await wizard
            .locator('.assignment select')
            .selectOption({ label: `demo-created-${type.toLowerCase()}（${type}）` });
        }
      } else {
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
      }
      await wizard.getByRole('button', { name: '完成设计', exact: true }).click();
      await expect(wizard).toHaveCount(0);
      await expect(panel.locator('.workflow-card')).toContainText('设计完成');
      const poolAdd = calls.findIndex((call) => call.path.endsWith('/asset-pool/add'));
      const binding = calls.findIndex((call) =>
        call.path.endsWith('/skills/config/supplement/add'),
      );
      expect(poolAdd).toBeGreaterThan(-1);
      expect(binding).toBeGreaterThan(poolAdd);
      expect(calls[poolAdd]!.body.secondScene).toBe('代码生成新版');
      expect(calls[poolAdd]!.body.assetName).toBe(skillName);
      const sceneRefresh = calls.findIndex(
        (call) => call.path.endsWith('/scene-activity/scene') && call.method === 'POST',
      );
      const sceneCode = calls.findIndex((call) => call.path.endsWith('/scene/code'));
      expect(sceneRefresh).toBeGreaterThan(-1);
      expect(sceneCode).toBeGreaterThan(sceneRefresh);
      expect(calls[sceneCode]!.body).toMatchObject({
        secondScene: '代码生成新版',
        sceneExtensionCode: 'demo-design',
        secondSceneDescription: '已保存的场景目标',
      });
      if (missingCommandName) {
        for (const type of ['commands', 'skills', 'agents']) {
          const createdAt = calls.findIndex((call) =>
            call.path.endsWith(`/${type}/management/add`),
          );
          const attachedAt = calls.findIndex((call) =>
            type === 'commands'
              ? call.path.endsWith('/commands/config/supplement/add')
              : call.path.endsWith('/asset-pool/add') &&
                call.body.assetType === (type === 'skills' ? 'SKILL' : 'AGENT'),
          );
          expect(createdAt).toBeGreaterThan(-1);
          expect(attachedAt).toBeGreaterThan(createdAt);
        }
      }
      const command = calls.find((call) => call.path.endsWith('/commands/config/supplement/add'))!;
      expect(command.body.activityNodeName).toBeNull();
      expect(command.body.subActivityNodeName).toBeNull();
      expect(command.query.get('dimCode')).toBe('p-demo');
      await mount();
      await expect(panel.getByRole('heading', { name: '服务端工作流', exact: true })).toBeVisible();
      await expect(panel.locator('.workflow-card')).toContainText('设计完成');
      await panel.locator('.workflow-card .progress').getByRole('button').first().click();
      for (const index of [3, 2, 1, 0]) {
        await expect(steps.nth(index)).toBeEnabled();
        await steps.nth(index).click();
        await expect(steps.nth(index)).toHaveAttribute('aria-current', 'step');
        await expect(wizard.getByRole('button', { name: '保存', exact: true })).toBeVisible();
        await expect(wizard.locator('.wizard-page')).toHaveAttribute(
          'aria-label',
          ['业务场景分析', 'Workflow 规划', 'Command 入口', 'Skill / Agent 集成'][index]!,
        );
        if (index === 2) await expect(wizard.getByText(commandName, { exact: true })).toBeVisible();
      }
      expect(
        calls.filter((call) => call.path.endsWith('/commands/config/supplement/add')),
      ).toHaveLength(1);
      expect(calls.some((call) => call.path.endsWith('/commands/config/supplement/query'))).toBe(
        missingCommandName,
      );
      await expect(wizard.getByLabel(/^场景编码/)).toHaveValue('demo-design');
      rejectCode = true;
      await wizard.getByLabel(/^场景编码/).fill('demo-rejected');
      await wizard.getByRole('button', { name: '保存', exact: true }).click();
      await expect(wizard.locator('.wizard-footer .error')).toContainText('编码已锁定');
      await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step');
      await expect(wizard.getByLabel(/^场景编码/)).toHaveValue('demo-rejected');
      const requestsBeforeErrorClose = calls.length;
      await wizard.getByRole('button', { name: '关闭 Workflow 设计', exact: true }).click();
      await expect(wizard).toHaveCount(0);
      expect(calls).toHaveLength(requestsBeforeErrorClose);
      for (const closeWith of ['button', 'escape', 'backdrop']) {
        await panel.locator('.workflow-card .progress').getByRole('button').first().click();
        await expect(wizard.getByLabel(/^场景编码/)).toHaveValue('demo-design');
        await wizard.getByLabel(/^场景编码/).fill('demo-unsaved');
        const requestsBeforeClose = calls.length;
        if (closeWith === 'button')
          await wizard.getByRole('button', { name: '关闭 Workflow 设计', exact: true }).click();
        else if (closeWith === 'escape') await page.keyboard.press('Escape');
        else await panel.locator('.modal').click({ position: { x: 5, y: 5 } });
        await expect(wizard).toHaveCount(0);
        expect(calls).toHaveLength(requestsBeforeClose);
        expect(detail.sceneExtensionCode).toBe('demo-design');
      }
    });
  }
});
