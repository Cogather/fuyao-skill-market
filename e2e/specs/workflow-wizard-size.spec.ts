import { expect, test } from '../fixtures/base';
import { selectHarnessOption } from '../helpers/selectHarnessOption';
import type { WorkflowDetail } from '../../src/services/skillMarket/businessScenarioDesignService';

test('Workflow 设计弹窗在共享逻辑下保持大尺寸', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  const detail: WorkflowDetail = {
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
      data = [
        {
          firstScene: '研发提效',
          secondScene: '接口开发',
          sort: 0,
          ...detail,
        },
      ];
    } else if (path.endsWith('/workflow/detail')) {
      data = detail;
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });

  await page.route('**/skill-market/workflow-wizard-size-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto('/skill-market/workflow-wizard-size-test');
  await page.evaluate(async () => {
    const { createApp, h } = await import('/skill-market/node_modules/.vite/deps/vue.js');
    const { createHarnessScenarioWorkspace } =
      await import('/skill-market/src/composables/useHarnessScenarioWorkspace.ts');
    const { default: BusinessScenarioDesignPage } =
      await import('/skill-market/src/views/skill/BusinessScenarioDesignPage.vue');
    createApp({
      setup() {
        const workspace = createHarnessScenarioWorkspace(() => ({
          ready: true,
          userId: 'workflow-size-test',
          departmentTree: [
            { id: 'delivery', deptCode: 'delivery', name: '持续交付组', children: [] },
          ],
          defaultDepartmentPath: ['持续交付组'],
          allowedDepartmentPaths: [['持续交付组']],
          restrictToAllowedDepartments: true,
        }));
        return () => h(BusinessScenarioDesignPage, { workspace });
      },
    }).mount('#test-host');
  });

  await selectHarnessOption(page.getByRole('combobox', { name: '选择产品', exact: true }), {
    label: 'harness-pipeline',
  });
  await page.getByRole('tree').getByText('接口开发', { exact: true }).click();
  await page.getByRole('button', { name: '+ 开始设计 Workflow', exact: true }).click();

  const wizard = page.getByRole('dialog', { name: 'Workflow 设计', exact: true });
  const box = await wizard.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBe(1206);
  expect(box!.height).toBe(760);
});
