import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

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
  await page.keyboard.press('Escape');
  await expect(tagDialog).toBeHidden();
  await opener.click();
  await expect(dialog.getByRole('searchbox', { name: '搜索场景标签' })).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
