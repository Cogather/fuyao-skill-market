import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

const workspaceKey = 'harness-scenario-workspace-v2:mock:w30000001';

async function openExperience(harness: HarnessManagementPage) {
  await harness.goto();
  await harness.switchToScenarios();
  await harness.scenariosDepartmentTrigger.click();
  await harness.scenariosPanel.getByRole('button', { name: '平台工具组', exact: true }).click();
  const products = harness.scenariosPanel.getByRole('combobox', { name: '选择产品', exact: true });
  await expect(products).toBeVisible();
  await products.selectOption({ label: 'harness-demo' });
  await harness.scenariosPanel
    .getByRole('tree', { name: '业务场景地图' })
    .getByText('接口开发体验', { exact: true })
    .click();
}

test('Mock 素材支持从空白二级场景完成设计并在刷新后恢复', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await openExperience(harness);
  await expect(harness.scenariosPanel.locator('.workflow-card')).toHaveCount(0);
  await harness.openScenarioDesign();
  const wizard = harness.workflowDesignDialog;
  await wizard.getByLabel('场景编码 *').fill('harness-demo-api-development');
  await wizard
    .getByLabel('场景说明与目标 *')
    .fill('根据接口需求生成实现代码，并输出代码评审结论。');
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByLabel('流程名称').fill('接口开发体验工作流');

  for (const [stageName, nodeName] of [
    ['开发', '生成代码'],
    ['评审', '检查代码'],
  ]) {
    await wizard.getByRole('button', { name: '+ 添加环节', exact: true }).click();
    await wizard.getByPlaceholder('环节名称').fill(stageName!);
    await wizard.getByRole('button', { name: '添加环节', exact: true }).click();
    const stage = wizard.locator('.edit-stage').filter({ hasText: stageName });
    await stage.getByRole('button', { name: '+ 添加节点', exact: true }).click();
    await stage.getByPlaceholder('节点名称').fill(nodeName!);
    await stage.getByRole('button', { name: '添加节点', exact: true }).click();
  }
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByRole('button', { name: '+ 选择一个 Command 加入… ▾' }).click();
  await wizard.getByRole('button', { name: /\/harness-demo-e2e-api/ }).click();
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByRole('button', { name: '+ 从资产库添加 Agent / Skill… ▾' }).click();
  await wizard
    .locator('.asset-option')
    .filter({ hasText: 'harness-demo-api-agent' })
    .getByRole('button', { name: '+ 添加', exact: true })
    .click();
  await wizard.locator('.picker-list').getByRole('button', { name: 'Skill', exact: true }).click();
  for (const name of ['harness-demo-code-generator', 'harness-demo-code-review']) {
    await wizard
      .locator('.asset-option')
      .filter({ hasText: name })
      .getByRole('button', { name: '+ 添加', exact: true })
      .click();
  }
  await wizard.locator('.picker-backdrop').click({ position: { x: 1, y: 1 } });
  const generation = wizard.locator('.assignment').filter({ hasText: '生成代码' });
  await generation.locator('select').selectOption({ label: 'harness-demo-api-agent' });
  await generation.locator('select').selectOption({ label: 'harness-demo-code-generator' });
  await wizard
    .locator('.assignment')
    .filter({ hasText: '检查代码' })
    .locator('select')
    .selectOption({ label: 'harness-demo-code-review' });
  await wizard.getByRole('button', { name: '完成设计', exact: true }).click();
  await expect(wizard).toBeHidden();
  await expect(harness.workflowCard('接口开发体验工作流').getByText('✓ 设计完成')).toBeVisible();
  await harness.switchToWorkflows();
  await harness.selectWorkflowProduct('harness-demo');
  await expect(harness.workflowInventoryRow('接口开发体验工作流')).toBeVisible();

  await page.reload();
  await openExperience(harness);
  await expect(harness.workflowCard('接口开发体验工作流').getByText('✓ 设计完成')).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), workspaceKey);
  const experienceWorkflows = saved.workflows.filter(
    (workflow: { name: string }) => workflow.name === '接口开发体验工作流',
  );
  expect(experienceWorkflows).toHaveLength(1);
  expect(experienceWorkflows[0].stages[0].steps[0].assets).toHaveLength(2);
  expect(experienceWorkflows[0].stages[1].steps[0].assets).toHaveLength(1);
});

test('体验数据追加到已有浏览器数据，保留草稿和资产修改且刷新不重复', async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      if (sessionStorage.getItem('experience-test-initialized')) return;
      sessionStorage.setItem('experience-test-initialized', '1');
      localStorage.setItem(
        key,
        JSON.stringify({
          workflows: [
            {
              _id: 'existing-workflow',
              scenarioId: 'existing-scenario',
              name: '原有流程',
              stages: [],
              assets: [],
              commands: [],
            },
          ],
          assets: [
            {
              _id: 'mock-workflow-experience-api-agent',
              name: 'harness-demo-api-agent',
              assetType: 'Agent',
              description: '用户已修改的说明',
              owner: '原有 Owner',
              developer: '原有开发者',
              status: 'draft',
              version: null,
            },
          ],
          commands: [],
          details: {
            'existing-scenario': {
              code: 'existing-code',
              description: '原有说明',
              releaseCount: 0,
            },
          },
        }),
      );
      localStorage.setItem(
        'skill-market-scene-settings-by-department-v2',
        JSON.stringify({
          平台工具组: [
            {
              id: 'existing-root',
              parentId: null,
              name: '原有场景',
              sort: 1,
              status: 'enabled',
              skillCount: 0,
            },
          ],
        }),
      );
    },
    { key: workspaceKey },
  );
  const harness = new HarnessManagementPage(page);
  await openExperience(harness);
  await expect(
    harness.scenariosPanel.getByRole('tree').getByText('原有场景', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await openExperience(harness);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), workspaceKey);
  expect(saved.workflows.map((item: { _id: string }) => item._id)).toContain('existing-workflow');
  expect(saved.details['existing-scenario'].description).toBe('原有说明');
  const experienceAssets = saved.assets.filter((asset: { _id: string }) =>
    asset._id.startsWith('mock-workflow-experience-'),
  );
  const experienceCommands = saved.commands.filter((command: { _id: string }) =>
    command._id.startsWith('mock-workflow-experience-'),
  );
  expect(experienceAssets).toHaveLength(3);
  expect(experienceCommands).toHaveLength(2);
  expect(
    experienceAssets.find(
      (asset: { _id: string }) => asset._id === 'mock-workflow-experience-api-agent',
    ).description,
  ).toBe('用户已修改的说明');
  await expect(
    harness.scenariosPanel.getByRole('tree').getByText('接口开发体验', { exact: true }),
  ).toHaveCount(1);
});
