import { selectHarnessOption } from '../helpers/selectHarnessOption';
import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

test('Workflow 自定义 Command、Skill、Agent 必须选择查询人员并保存人员身份与资产类型', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToScenarios();
  await harness.openScenarioDesign();
  const wizard = harness.workflowDesignDialog;
  await wizard.getByLabel('场景编码 *').fill('harness-pipeline-personnel');
  await wizard.getByLabel('场景说明与目标').fill('执行研发任务并保留责任人信息');
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByLabel('流程名称', { exact: true }).fill('自定义资产人员工作流');
  await wizard.getByRole('button', { name: '+ 添加环节', exact: true }).click();
  await wizard.getByPlaceholder('环节名称').fill('实现');
  await wizard.getByRole('button', { name: '添加环节', exact: true }).click();
  await wizard.getByRole('button', { name: '+ 添加节点', exact: true }).click();
  await wizard.getByPlaceholder('节点名称').fill('开发');
  await wizard.getByRole('button', { name: '添加节点', exact: true }).click();
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByRole('button', { name: '+ 新定义 Command', exact: true }).click();
  const form = wizard.locator('.capability-create-form');
  await expect(form.getByPlaceholder(/e2e-codec$/)).toHaveValue('/harness-pipeline-');
  await form.getByPlaceholder(/e2e-codec$/).fill('  /harness-pipeline-e2e-people  ');
  await form.getByPlaceholder('描述 *').fill('研发入口');
  await form.locator('input[type="date"]').fill('2026-12-31');
  await form.getByRole('combobox', { name: '开发责任人 *', exact: true }).fill('随意填写的姓名');
  await form.getByRole('button', { name: '创建并加入资产清单', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('从结果中选择');
  await expect(wizard.locator('.command-row')).toHaveCount(0);

  async function choosePeople() {
    await form.getByRole('combobox', { name: '开发责任人 *', exact: true }).fill('张三');
    await form.getByRole('option', { name: /w30000001/ }).click();
    await form.getByRole('combobox', { name: '责任人 *', exact: true }).fill('w30000002');
    await form.getByRole('option', { name: /李四/ }).click();
  }
  await choosePeople();
  await form.getByRole('button', { name: '创建并加入资产清单', exact: true }).click();
  await expect(wizard.locator('.command-row code')).toHaveText('/harness-pipeline-e2e-people');
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(wizard.getByRole('button', { name: '+ 自定义 Skill', exact: true })).toBeVisible();
  await expect(wizard.getByRole('button', { name: '+ 自定义 Agent', exact: true })).toBeVisible();

  for (const type of ['Skill', 'Agent'] as const) {
    await wizard.getByRole('button', { name: `+ 自定义 ${type}`, exact: true }).click();
    await expect(form.getByRole('textbox', { name: new RegExp(`${type} 名称`) })).toHaveValue(
      'harness-pipeline-',
    );
    await expect(form.getByRole('button', { name: type, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await form
      .getByRole('textbox', { name: new RegExp(`${type} 名称`) })
      .fill(`  harness-pipeline-personnel-${type.toLowerCase()}  `);
    await form.getByPlaceholder('描述 *').fill(`${type} 研发执行能力`);
    await choosePeople();
    await form
      .getByRole('button', { name: type === 'Agent' ? 'Skill' : 'Agent', exact: true })
      .click();
    await expect(form.getByRole('combobox', { name: '开发责任人 *', exact: true })).toHaveValue(
      '张三 w30000001',
    );
    await form.getByRole('button', { name: type, exact: true }).click();
    await form.locator('input[type="date"]').fill('2026-12-31');
    if (type === 'Skill') {
      await page.setViewportSize({ width: 390, height: 740 });
      const overflow = await form.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.setViewportSize({ width: 1440, height: 960 });
      await form.screenshot({ path: testInfo.outputPath('custom-skill-personnel.png') });
    }
    await form.getByRole('button', { name: '创建并加入资产清单', exact: true }).click();
    await expect(form).toBeHidden();
    await selectHarnessOption(wizard.getByRole('combobox', { name: /分配资产$/ }), {
      label: `harness-pipeline-personnel-${type.toLowerCase()}（${type}）`,
    });
  }
  await wizard.getByRole('button', { name: '完成设计', exact: true }).click();
  await expect(wizard).toBeHidden();
  await page.reload();
  await expect(harness.scenariosPanel).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('harness-scenario-workspace-v2:mock:w30000001')!),
  );
  const expectedPeople = {
    owner: '李四 w30000002',
    ownerId: 'w30000002',
    ownerDepartment: '质量工具组',
    developer: '张三 w30000001',
    developerId: 'w30000001',
    developerDepartment: '持续交付组',
  };
  expect(
    saved.commands.find((item: { name: string }) => item.name === '/harness-pipeline-e2e-people'),
  ).toMatchObject(expectedPeople);
  for (const type of ['Skill', 'Agent']) {
    expect(
      saved.assets.find(
        (item: { name: string }) =>
          item.name === `harness-pipeline-personnel-${type.toLowerCase()}`,
      ),
    ).toMatchObject({ ...expectedPeople, assetType: type });
  }
  const workflow = saved.workflows.find((item: { commands: { name: string }[] }) =>
    item.commands.some((command) => command.name === '/harness-pipeline-e2e-people'),
  );
  expect(workflow.commands[0]).toMatchObject(expectedPeople);
  expect(
    workflow.stages[0].steps[0].assets.map((asset: { type: string }) => asset.type).sort(),
  ).toEqual(['Agent', 'Skill']);
});
