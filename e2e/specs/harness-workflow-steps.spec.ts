import type { Locator } from '@playwright/test';

import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

async function expectSeparateEditorRows(
  editor: Locator,
  precedingContent: Locator,
  namePlaceholder: string,
  descriptionPlaceholder: string,
): Promise<void> {
  const name = editor.getByPlaceholder(namePlaceholder, { exact: true });
  const description = editor.getByPlaceholder(descriptionPlaceholder, { exact: true });
  await expect(name).toBeVisible();
  await expect(description).toBeVisible();
  const [editorBox, precedingBox, nameBox, descriptionBox] = await Promise.all([
    editor.boundingBox(),
    precedingContent.boundingBox(),
    name.boundingBox(),
    description.boundingBox(),
  ]);
  expect(editorBox!.y).toBeGreaterThanOrEqual(precedingBox!.y + precedingBox!.height - 1);
  expect(descriptionBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height - 1);
  expect(Math.abs(nameBox!.x - descriptionBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(nameBox!.width - descriptionBox!.width)).toBeLessThanOrEqual(1);
}

test('四步向导保留独立编辑行、说明和调序，并将节点顺序与资产绑定带到第四步', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    '使用本地 Mock 场景和资产验证四步向导编排',
  );
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToScenarios();
  await harness.selectScenarioDepartment('平台工具组');
  await harness.scenariosPanel
    .getByRole('combobox', { name: '选择产品', exact: true })
    .selectOption({ label: 'harness-demo' });
  await harness.scenariosPanel
    .getByRole('tree', { name: '业务场景地图' })
    .getByText('接口开发体验', { exact: true })
    .click();
  await harness.openScenarioDesign();
  const wizard = harness.workflowDesignDialog;
  const next = wizard.getByRole('button', { name: '下一步', exact: true });
  const previous = wizard.getByRole('button', { name: '上一步', exact: true });
  const stageByName = (name: string) => wizard.locator('.edit-stage').filter({ hasText: name });
  const nodeByName = (stage: Locator, name: string) =>
    stage.locator('.node-item').filter({ hasText: name });

  await wizard.getByLabel('场景编码 *').fill('harness-demo-workflow-step-order');
  await wizard.getByLabel('场景说明与目标').fill('验证环节、节点的说明、编排顺序和资产绑定。');
  await expect(previous).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('workflow-step-1-scenario.png') });
  await next.click();
  await wizard.getByLabel('流程名称', { exact: true }).fill('四步编排回归工作流');
  await wizard.getByLabel('流程说明', { exact: true }).fill('按调整后的环节和节点顺序执行。');

  for (const [name, description] of [
    ['需求分析', '梳理需求和验收目标'],
    ['实现交付', '完成实现并交付验证结果'],
  ]) {
    await wizard.getByRole('button', { name: '+ 添加环节', exact: true }).click();
    await wizard.getByPlaceholder('环节名称', { exact: true }).fill(name!);
    await wizard.getByPlaceholder('环节说明（可选）', { exact: true }).fill(description!);
    await wizard.getByRole('button', { name: '添加环节', exact: true }).click();
  }
  for (const [stageName, name, description] of [
    ['需求分析', '资料核查', '核对输入材料'],
    ['需求分析', '结论输出', '输出评审结论'],
    ['实现交付', '功能交付', '提交功能和验证记录'],
  ]) {
    const stage = stageByName(stageName!);
    await stage.getByRole('button', { name: '+ 添加节点', exact: true }).click();
    await stage.getByPlaceholder('节点名称', { exact: true }).fill(name!);
    await stage.getByPlaceholder('节点说明（可选）', { exact: true }).fill(description!);
    await stage.getByRole('button', { name: '添加节点', exact: true }).click();
  }

  const analysisStage = stageByName('需求分析');
  await analysisStage.locator(':scope > header').getByRole('button', { name: '编辑' }).click();
  const stageEditor = analysisStage.locator('.structure-draft');
  await expectSeparateEditorRows(
    stageEditor,
    analysisStage.locator('.nodes'),
    '环节名称',
    '环节说明（可选）',
  );
  await expect(wizard.getByRole('button', { name: '+ 添加环节', exact: true })).toHaveCount(0);
  await stageEditor.getByPlaceholder('环节名称', { exact: true }).fill('实现交付');
  await stageEditor.getByRole('button', { name: '保存环节', exact: true }).click();
  await expect(wizard.locator('.wizard-footer .error')).toHaveText('当前场景已存在同名环节');
  await stageEditor.getByPlaceholder('环节名称', { exact: true }).fill('需求评审');
  await stageEditor
    .getByPlaceholder('环节说明（可选）', { exact: true })
    .fill('先确认范围和评审标准');
  await page.screenshot({ path: testInfo.outputPath('workflow-step-2-stage-editor.png') });
  await stageEditor.getByRole('button', { name: '保存环节', exact: true }).click();
  await expect(wizard.locator('.wizard-footer .error')).toBeEmpty();
  const reviewStage = stageByName('需求评审');
  await expect(reviewStage.getByText('先确认范围和评审标准', { exact: true })).toBeVisible();
  await expect(wizard.getByRole('button', { name: '+ 添加环节', exact: true })).toBeVisible();

  const checkNode = nodeByName(reviewStage, '资料核查');
  await checkNode.getByRole('button', { name: '编辑', exact: true }).click();
  const nodeEditor = checkNode.locator('.structure-draft');
  await expectSeparateEditorRows(
    nodeEditor,
    checkNode.locator('.node-row'),
    '节点名称',
    '节点说明（可选）',
  );
  await expect(reviewStage.getByRole('button', { name: '+ 添加节点', exact: true })).toHaveCount(0);
  await nodeEditor.getByPlaceholder('节点名称', { exact: true }).fill('结论输出');
  await nodeEditor.getByRole('button', { name: '保存节点', exact: true }).click();
  await expect(wizard.locator('.wizard-footer .error')).toHaveText('当前环节已存在同名节点');
  await nodeEditor.getByPlaceholder('节点名称', { exact: true }).fill('资料复核');
  await nodeEditor.getByPlaceholder('节点说明（可选）', { exact: true }).fill('复核材料与验收标准');
  await page.screenshot({ path: testInfo.outputPath('workflow-step-2-node-editor.png') });
  await nodeEditor.getByRole('button', { name: '保存节点', exact: true }).click();
  await expect(wizard.locator('.wizard-footer .error')).toBeEmpty();
  await expect(reviewStage.getByText('复核材料与验收标准', { exact: true })).toBeVisible();
  await expect(reviewStage.getByRole('button', { name: '+ 添加节点', exact: true })).toBeVisible();
  await expect(
    stageByName('实现交付').getByText('完成实现并交付验证结果', { exact: true }),
  ).toBeVisible();
  await expect(
    stageByName('实现交付').getByText('提交功能和验证记录', { exact: true }),
  ).toBeVisible();

  await nodeByName(reviewStage, '资料复核').getByRole('button', { name: '↓', exact: true }).click();
  await reviewStage
    .locator(':scope > header')
    .getByRole('button', { name: '↓', exact: true })
    .click();
  const expectStepTwo = async () => {
    await expect(wizard.getByLabel('流程名称', { exact: true })).toHaveValue('四步编排回归工作流');
    await expect(wizard.getByLabel('流程说明', { exact: true })).toHaveValue(
      '按调整后的环节和节点顺序执行。',
    );
    await expect(wizard.locator('.edit-stage > header b')).toHaveText(['实现交付', '需求评审']);
    await expect(stageByName('需求评审').locator('.node-row b')).toHaveText([
      '结论输出',
      '资料复核',
    ]);
    await expect(
      stageByName('需求评审').getByText('先确认范围和评审标准', { exact: true }),
    ).toBeVisible();
    await expect(
      stageByName('需求评审').getByText('复核材料与验收标准', { exact: true }),
    ).toBeVisible();
  };
  await expectStepTwo();
  await page.screenshot({ path: testInfo.outputPath('workflow-step-2-ordered.png') });
  await next.click();

  await wizard.getByRole('button', { name: '+ 选择一个 Command 加入… ▾', exact: true }).click();
  await wizard.getByRole('button', { name: /\/harness-demo-e2e-api/ }).click();
  await expect(wizard.locator('.command-row')).toContainText('/harness-demo-e2e-api');
  await page.screenshot({ path: testInfo.outputPath('workflow-step-3-command.png') });
  await previous.click();
  await expectStepTwo();
  await previous.click();
  await expect(wizard.getByLabel('场景编码 *')).toHaveValue('harness-demo-workflow-step-order');
  await expect(wizard.getByLabel('场景说明与目标')).toHaveValue(
    '验证环节、节点的说明、编排顺序和资产绑定。',
  );
  await next.click();
  await expectStepTwo();
  await next.click();
  await expect(wizard.locator('.command-row')).toContainText('/harness-demo-e2e-api');
  await next.click();

  const expectStepFourOrder = async () => {
    await expect(wizard.locator('.assignment > b')).toHaveText(['实现交付', '需求评审']);
    await expect(wizard.locator('.assignment strong')).toHaveText([
      '功能交付',
      '结论输出',
      '资料复核',
    ]);
    await expect(wizard.getByText('先确认范围和评审标准', { exact: true })).toBeVisible();
    await expect(wizard.getByText('复核材料与验收标准', { exact: true })).toBeVisible();
  };
  await expectStepFourOrder();
  await wizard
    .getByRole('button', { name: '+ 从资产库添加 Agent / Skill… ▾', exact: true })
    .click();
  const candidate = wizard.locator('.asset-option').first();
  await expect(candidate).toBeVisible();
  await candidate.getByRole('button', { name: '+ 添加', exact: true }).click();
  await wizard.locator('.picker-backdrop').click({ position: { x: 1, y: 1 } });
  const deliveryAssignment = wizard.locator('.assignment').filter({ hasText: '实现交付' });
  const assignmentSelect = deliveryAssignment.locator('select');
  const assetOption = assignmentSelect.locator('option').nth(1);
  const assetId = await assetOption.getAttribute('value');
  expect(assetId).toBeTruthy();
  await expect(assetOption).toHaveText(/.+（Agent）/);
  await assignmentSelect.selectOption({ value: assetId! });
  await expect(deliveryAssignment.locator('.chips > span')).toHaveCount(1);
  const assignedText = await deliveryAssignment.locator('.chips > span').innerText();
  for (const nodeName of ['结论输出', '资料复核']) {
    await wizard
      .getByRole('combobox', { name: `为${nodeName}分配资产`, exact: true })
      .selectOption({ value: assetId! });
  }
  await page.screenshot({ path: testInfo.outputPath('workflow-step-4-assignment.png') });

  await previous.click();
  await expect(wizard.locator('.command-row')).toContainText('/harness-demo-e2e-api');
  await previous.click();
  await expectStepTwo();
  await next.click();
  await next.click();
  await expectStepFourOrder();
  await expect(deliveryAssignment.locator('.chips > span')).toHaveText(assignedText, {
    useInnerText: true,
  });
  await wizard.getByRole('button', { name: '完成设计', exact: true }).click();
  await expect(wizard).toBeHidden();
  await expect(harness.workflowCard('四步编排回归工作流')).toBeVisible();
});
