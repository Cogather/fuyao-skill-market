import { expect, test } from '../fixtures/base';

test('Mock 向导四个步骤均显示保存，流程修改保存到本地', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '需要 Mock 模式');
  await page.route('**/skill-market/save-controls-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto('/skill-market/save-controls-test');
  await page.evaluate(async () => {
    const vueUrl = '/skill-market/node_modules/.vite/deps/vue.js';
    const workspaceUrl = '/skill-market/src/composables/useHarnessScenarioWorkspace.ts';
    const componentUrl = '/skill-market/src/views/skill/BusinessScenarioDesignPage.vue';
    const { createApp, h, watch } = await import(vueUrl);
    const { createHarnessScenarioWorkspace } = await import(workspaceUrl);
    const { default: Component } = await import(componentUrl);
    createApp({
      setup() {
        const workspace = createHarnessScenarioWorkspace(() => ({
          ready: true,
          userId: 'save-controls',
          departmentTree: [
            { id: 'delivery', deptCode: 'delivery', name: '持续交付组', children: [] },
          ],
          defaultDepartmentPath: ['持续交付组'],
          allowedDepartmentPaths: [['持续交付组']],
          restrictToAllowedDepartments: true,
        }));
        let seeded = false;
        watch(
          workspace.available,
          (ready: boolean) => {
            if (!ready || seeded) return;
            seeded = true;
            const scenario = workspace.scenarios.find(
              (item: any) => item._id === workspace.selectedScenarioId.value,
            );
            const product = workspace.products.find(
              (item: any) => item._id === workspace.productId.value,
            );
            const workflow = workspace.ensureWorkflow(scenario._id);
            workspace.saveScenarioDetails(scenario._id, {
              code: `${product.name}-save-test`,
              description: '保存按钮回归场景',
            });
            workflow.name = '原始流程';
            workflow.commands = [
              {
                id: 'entry',
                commandId: 'entry',
                name: `/${product.name}-e2e-entry`,
                description: '入口',
              },
            ];
            workflow.stages = [
              {
                id: 'stage',
                name: '开发',
                description: '',
                order: 0,
                steps: [{ id: 'node', name: '编码', description: '', order: 0, assets: [] }],
              },
            ];
          },
          { immediate: true },
        );
        return () => h('div', { id: 'scenario-panel' }, h(Component, { workspace }));
      },
    }).mount('#test-host');
  });
  const panel = page.locator('#scenario-panel');
  await panel.locator('.workflow-card .progress').getByRole('button').first().click();
  const wizard = page.getByRole('dialog', { name: 'Workflow 设计', exact: true });
  const save = wizard.getByRole('button', { name: '保存', exact: true });
  for (const index of [0, 1, 2, 3]) {
    await wizard.locator('nav > button').nth(index).click();
    await expect(save).toBeVisible();
    if (index === 1) await wizard.getByLabel('流程名称', { exact: true }).fill('本地已保存流程');
    await save.click();
    await expect(wizard.locator('.wizard-save-status')).toHaveText('已保存');
  }
  await wizard.getByRole('button', { name: '关闭 Workflow 设计', exact: true }).click();
  await expect(wizard).toHaveCount(0);
  await expect(panel.locator('.workflow-card')).toContainText('本地已保存流程');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('harness-scenario-workspace-v2:mock:save-controls'),
    ),
  ).toContain('本地已保存流程');
});
