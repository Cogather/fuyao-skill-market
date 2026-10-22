import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';
import { openHarnessSelect } from '../helpers/selectHarnessOption';

test('资产下拉选项将类型显示为右侧标签气泡，并支持按类型搜索', async ({ page }) => {
  await page.route('**/skill-market/harness-select-tag-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto('/skill-market/harness-select-tag-test');
  await page.evaluate(async () => {
    const { createApp, h } = await import('/skill-market/node_modules/.vite/deps/vue.js');
    const { default: HarnessSelect } =
      await import('/skill-market/src/components/skill/HarnessSelect.vue');
    createApp({
      render: () =>
        h(HarnessSelect, {
          'aria-label': '资产选择',
          options: [
            { value: 'agent', label: '持续交付编排助手', tag: 'Agent' },
            { value: 'skill', label: '持续交付结果校验', tag: 'Skill' },
            { value: 'plain', label: '普通选项' },
          ],
        }),
    }).mount('#test-host');
  });

  await page.getByRole('combobox', { name: '资产选择' }).click();
  const listbox = page.getByRole('listbox', { name: '资产选择' });
  const agentOption = listbox.getByRole('option', { name: '持续交付编排助手 Agent' });
  const label = agentOption.locator('.harness-select-panel__option-label');
  const tag = agentOption.locator('.harness-select-panel__option-tag');
  await expect(label).toHaveText('持续交付编排助手');
  await expect(tag).toHaveText('Agent');
  await expect(tag).toHaveCSS('border-radius', '999px');
  await expect(tag).toHaveCSS('background-color', 'rgb(237, 244, 255)');
  await expect(tag).toHaveCSS('color', 'rgb(37, 99, 235)');
  const [agentOptionBox, labelBox, tagBox] = await Promise.all([
    agentOption.boundingBox(),
    label.boundingBox(),
    tag.boundingBox(),
  ]);
  expect(tagBox!.x).toBeGreaterThan(labelBox!.x);
  expect(agentOptionBox!.x + agentOptionBox!.width - tagBox!.x - tagBox!.width).toBeLessThanOrEqual(
    12,
  );

  const skillTag = listbox
    .getByRole('option', { name: '持续交付结果校验 Skill' })
    .locator('.harness-select-panel__option-tag');
  await expect(skillTag).toHaveCSS('background-color', 'rgb(245, 240, 255)');
  await expect(skillTag).toHaveCSS('color', 'rgb(124, 58, 237)');
  await expect(
    listbox
      .getByRole('option', { name: '普通选项', exact: true })
      .locator('.harness-select-panel__option-side'),
  ).toHaveCount(0);

  await page.getByRole('searchbox', { name: '搜索选项' }).fill('Skill');
  await expect(listbox.getByRole('option')).toHaveCount(1);
  await expect(listbox.getByRole('option')).toHaveAccessibleName('持续交付结果校验 Skill');
});

test('三个工作区的产品选择使用统一浮层，并支持键盘、搜索和关闭', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '使用本地产品数据');
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.selectScenarioDepartment('平台工具组');
  const product = harness.scenariosPanel.getByRole('combobox', { name: '选择产品', exact: true });
  await product.click();
  const menu = page.getByRole('listbox', { name: '选择产品' });
  await expect(menu).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索选项' }).fill('harness-demo');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await page.getByRole('searchbox', { name: '搜索选项' }).press('ArrowDown');
  await page.getByRole('searchbox', { name: '搜索选项' }).press('Enter');
  await expect(product).toHaveText('harness-demo');
  await expect(product).toBeFocused();
  await expect(menu).toBeHidden();
  await product.click();
  await page.getByRole('searchbox', { name: '搜索选项' }).press('Enter');
  await expect(product).toHaveText('harness-demo');
  await product.click();
  await page.getByRole('searchbox', { name: '搜索选项' }).fill('不存在的产品');
  await expect(page.getByRole('status').filter({ hasText: '没有匹配的选项' })).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索选项' }).press('Escape');
  await expect(product).toHaveText('harness-demo');
  await expect(product).toBeFocused();

  await harness.switchToWorkflows();
  await harness.workflowsProductFilter.click();
  await expect(page.getByRole('listbox', { name: '筛选产品' })).toBeVisible();
  await harness.workflowsHeading.click();
  await expect(page.getByRole('listbox')).toBeHidden();

  await page.locator('#harness-tab-assets').click();
  const assetsProduct = page.getByRole('combobox', { name: '产品筛选', exact: true });
  await assetsProduct.click();
  await page
    .getByRole('listbox', { name: '产品筛选' })
    .getByRole('option', { name: 'harness-pipeline', exact: true })
    .click();
  await expect(assetsProduct).toHaveText('harness-pipeline');
  await expect(
    page.getByRole('heading', { name: '流水线异常分析 Agent', exact: true }),
  ).toBeVisible();
});

test('创建资产弹窗内点击标题可收起下拉菜单，Escape 不关闭表单', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await page.locator('#harness-tab-assets').click();
  await page.getByRole('button', { name: 'Skill', exact: true }).click();
  await page.getByRole('button', { name: '＋ 新增', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '添加 Skill' });
  const trigger = dialog.getByRole('combobox', { name: '层级', exact: true });
  const menu = await openHarnessSelect(trigger);
  await expect(menu).toBeVisible();
  await dialog.getByText('添加 Skill', { exact: true }).click();
  await expect(menu).toBeHidden();
  await trigger.click();
  await trigger.press('Escape');
  await expect(menu).toBeHidden();
  await expect(dialog).toBeVisible();
});
