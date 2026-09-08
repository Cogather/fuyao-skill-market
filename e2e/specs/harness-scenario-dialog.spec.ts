import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';
import type { Locator, Page } from '@playwright/test';

async function expectExplicitDismissalOnly(page: Page, dialog: Locator) {
  await dialog.locator('h2').click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  const heading = (await dialog.locator('h2').boundingBox())!;
  await page.mouse.move(heading.x + 10, heading.y + 10);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 5 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await dialog.locator('h2').hover();
  await page.mouse.wheel(0, 500);
  await expect(dialog).toBeVisible();
  await dialog.focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
}

for (const level of ['一级', '下级']) {
  test(`新建${level}场景仅通过按钮关闭，误点拖动滚动和 Esc 保留输入`, async ({ page }) => {
    const harness = new HarnessManagementPage(page);
    await harness.goto();
    const opener =
      level === '一级'
        ? harness.scenariosPanel.getByTitle('新建一级场景', { exact: true })
        : harness.scenariosPanel.getByRole('button', { name: '在研发提效下新建场景', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: `新建${level}场景`, exact: true });
    await dialog.getByLabel('场景名称').fill('保留未提交的场景');
    await dialog.getByLabel('场景说明').fill('误点和滚动后这段内容仍然保留');
    await expectExplicitDismissalOnly(page, dialog);
    await expect(dialog.getByLabel('场景名称')).toHaveValue('保留未提交的场景');
    await expect(dialog.getByLabel('场景说明')).toHaveValue('误点和滚动后这段内容仍然保留');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await opener.click();
    await dialog.getByRole('button', { name: '关闭新建场景', exact: true }).click();
    await expect(dialog).toBeHidden();
  });
}

test('从工作流页进入设计后，仅关闭按钮退出，误操作保留当前编辑', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();
  await harness.openScenariosFromWorkflows();
  await harness.openScenarioDesign();
  const wizard = harness.workflowDesignDialog;
  await wizard.getByLabel('场景说明与目标').fill('尚未保存的设计内容');
  await expectExplicitDismissalOnly(page, wizard);
  await expect(wizard.getByLabel('场景说明与目标')).toHaveValue('尚未保存的设计内容');
  await wizard.getByRole('button', { name: '关闭 Workflow 设计', exact: true }).click();
  await expect(wizard).toBeHidden();
});

test('场景标签和删除确认仅通过操作按钮关闭', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.scenariosPanel.getByRole('tree').getByText('研发提效', { exact: true }).click();
  await harness.scenariosPanel
    .locator('.summary')
    .getByRole('button', { name: /标签/ })
    .click();
  const tags = page.getByRole('dialog', { name: '场景标签', exact: true });
  await expectExplicitDismissalOnly(page, tags);
  await tags.getByRole('button', { name: '完成', exact: true }).click();
  await expect(tags).toBeHidden();
  const scenario = harness.scenariosPanel
    .locator('.tree-node')
    .filter({ has: page.locator('b', { hasText: /^代码生成$/ }) });
  await scenario.hover();
  await scenario.getByRole('button', { name: '删除代码生成', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: '删除场景', exact: true });
  await expectExplicitDismissalOnly(page, deletion);
  await deletion.getByRole('button', { name: '取消', exact: true }).click();
  await expect(deletion).toBeHidden();
  await expect(scenario).toBeVisible();
});

test('场景标签搜索保留勾选结果，长标签不会挤出底部操作区', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToScenarios();
  const opener = harness.scenariosPanel.getByTitle('新建一级场景', { exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '新建一级场景' });
  const search = dialog.getByRole('searchbox', { name: '搜索场景标签' });
  await expect(search).toBeVisible();
  await dialog.getByLabel('场景名称').fill('弹窗体验验证');
  await dialog.getByRole('button', { name: 'AI 提效', exact: true }).click();
  await search.fill('  pRoMpT  ');
  await search.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'AI 提效', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '大模型应用与 Prompt 工程', exact: true }).click();
  await search.fill('不存在的标签');
  await expect(dialog.getByText('未找到匹配的标签')).toBeVisible();
  await search.clear();
  await expect(dialog.getByRole('button', { name: 'AI 提效', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    dialog.getByRole('button', { name: '大模型应用与 Prompt 工程', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  const longTag = dialog.getByRole('button', {
    name: '面向多团队协同的跨部门流程打通与度量指标体系建设的超长标签示例',
    exact: true,
  });
  await longTag.scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: '创建', exact: true })).toBeInViewport();
  await expect(dialog.getByLabel('场景说明')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 680 });
  await longTag.scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: '创建', exact: true })).toBeInViewport();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await dialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(dialog).toBeHidden();
  const summary = harness.scenariosPanel.locator('.summary');
  await expect(summary.getByText('#AI 提效', { exact: true })).toBeVisible();
  await expect(summary.getByText('#大模型应用与 Prompt 工程', { exact: true })).toBeVisible();
  await summary.getByRole('button', { name: '编辑标签' }).click();
  const tagDialog = page.getByRole('dialog', { name: '场景标签', exact: true });
  await tagDialog.getByRole('searchbox', { name: '搜索场景标签' }).fill('Prompt');
  await tagDialog.getByRole('button', { name: '大模型应用与 Prompt 工程', exact: true }).click();
  await expect(
    tagDialog.getByRole('button', { name: '大模型应用与 Prompt 工程', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await tagDialog.getByRole('button', { name: '关闭场景标签', exact: true }).click();
  await expect(tagDialog).toBeHidden();
  await opener.click();
  await expect(dialog.getByRole('searchbox', { name: '搜索场景标签' })).toHaveValue('');
  await dialog.getByRole('button', { name: '关闭新建场景', exact: true }).click();
  await expect(opener).toBeFocused();
});
