import { expect, test } from '../fixtures/base';

test('新建 Workflow 使用产品前缀、可选目标和空流程信息，保存后回填原值', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const metadataWrites: { method: string; body: unknown }[] = [];
  const detail = {
    flowName: '',
    flowDescription: '',
    sceneExtensionCode: '',
    secondSceneDescription: '',
    commands: [],
    assetPool: [],
    stages: [],
    steps: [],
    nextStep: 0,
    allDone: false,
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/smapi-product-by-dept')) {
      data = [{ offeringId: 'harness-pipeline', offeringName: 'harness-pipeline' }];
    } else if (path.endsWith('/scene-activity/scene')) {
      data = [{ firstScene: '研发提效', secondScene: '接口开发', sort: 0, ...detail }];
    } else if (path.endsWith('/workflow/detail')) {
      data = detail;
    } else if (path.endsWith('/scene/code') || path.endsWith('/scene/workflow-meta')) {
      if (path.endsWith('/scene-activity/scene/workflow-meta')) {
        metadataWrites.push({
          method: route.request().method(),
          body: route.request().postDataJSON(),
        });
      }
      Object.assign(detail, route.request().postDataJSON());
      data = null;
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.route('**/skill-market/workflow-defaults-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto('/skill-market/workflow-defaults-test');
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
          userId: 'workflow-defaults',
          departmentTree: [
            { id: 'delivery', deptCode: 'delivery', name: '持续交付组', children: [] },
          ],
          defaultDepartmentPath: ['持续交付组'],
          allowedDepartmentPaths: [['持续交付组']],
          restrictToAllowedDepartments: true,
        }));
        return () => h(Component, { workspace });
      },
    }).mount('#test-host');
  });
  await page
    .getByRole('combobox', { name: '选择产品', exact: true })
    .selectOption({ label: 'harness-pipeline' });
  await page.getByRole('tree').getByText('接口开发', { exact: true }).click();
  await page.getByRole('button', { name: '+ 开始设计 Workflow', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'Workflow 设计', exact: true });
  expect((await wizard.boundingBox())!.width).toBeGreaterThanOrEqual(1040);
  const scenarioName = wizard.getByLabel(/^场景名称/);
  const code = wizard.getByLabel(/^场景编码/);
  const description = wizard.getByLabel('场景说明与目标', { exact: true });
  await expect(scenarioName).toHaveAttribute('required', '');
  await expect(code).toHaveAttribute('required', '');
  await expect(description).not.toHaveAttribute('required');
  const marks = wizard.locator('.wizard-page .required-mark');
  await expect(marks).toHaveCount(2);
  for (const mark of await marks.all()) await expect(mark).toHaveCSS('color', 'rgb(237, 100, 100)');
  await expect(code).toHaveValue('harness-pipeline-');
  await wizard.screenshot({ path: testInfo.outputPath('workflow-analysis.png') });
  await scenarioName.clear();
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(wizard.locator('.wizard-footer .error')).toContainText('请填写场景名称');
  await scenarioName.fill('接口开发');
  await code.clear();
  await wizard.getByRole('button', { name: '保存', exact: true }).click();
  await expect(wizard.locator('.wizard-footer .error')).toContainText('请填写场景编码');
  await code.fill('harness-pipeline-');
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(wizard.locator('.wizard-footer .error')).toContainText('编码不符合');
  await code.fill('harness-pipeline-api');
  await description.clear();
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(wizard.getByLabel('流程名称', { exact: true })).toHaveValue('');
  await expect(wizard.getByLabel('流程说明', { exact: true })).toHaveValue('');
  await wizard.screenshot({ path: testInfo.outputPath('workflow-planning.png') });
  await wizard.getByLabel('流程名称', { exact: true }).fill('用户填写的流程');
  await wizard.getByLabel('流程说明', { exact: true }).fill('用户填写的说明');
  await wizard.getByRole('button', { name: '保存', exact: true }).click();
  await expect(wizard.locator('.wizard-save-status')).toHaveText('已保存');
  if (process.env.VITE_SKILL_MARKET_TRANSPORT === 'http') {
    expect(metadataWrites.at(-1)).toEqual({
      method: 'PUT',
      body: {
        firstScene: '研发提效',
        secondScene: '接口开发',
        flowName: '用户填写的流程',
        flowDescription: '用户填写的说明',
      },
    });
  }
  await wizard.getByRole('button', { name: '关闭 Workflow 设计', exact: true }).click();
  await page.locator('.workflow-card .progress').getByRole('button').first().click();
  await expect(code).toHaveValue('harness-pipeline-api');
  await expect(description).toHaveValue('');
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(wizard.getByLabel('流程名称', { exact: true })).toHaveValue('用户填写的流程');
  await expect(wizard.getByLabel('流程说明', { exact: true })).toHaveValue('用户填写的说明');
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByRole('button', { name: '+ 新定义 Command', exact: true }).click();
  await expect(wizard.getByPlaceholder(/e2e-codec$/)).toHaveValue('/harness-pipeline-');
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await wizard.boundingBox())!.width).toBeLessThanOrEqual(390);
});
