import { openHarnessSelect, selectHarnessOption } from '../helpers/selectHarnessOption';
import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const CONTINUOUS_DELIVERY_PATH = [
  '\u90e8\u95e81',
  '\u5e73\u53f0\u4ea7\u54c1\u7ebf',
  '\u5e73\u53f0\u5de5\u5177\u7ec4',
  'DevOps\u90e8',
  '\u6301\u7eed\u4ea4\u4ed8\u7ec4',
];

function assetCard(page: Page, name: string): Locator {
  return page.locator('.asset-card').filter({
    has: page.getByRole('heading', { name, exact: true }),
  });
}

async function openAssets(page: Page): Promise<void> {
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await expect(
    page.locator('#harness-panel-assets').getByRole('heading', { name: '资产清单', exact: true }),
  ).toBeVisible();
}

async function selectDepartmentPath(page: Page, path: string[]): Promise<void> {
  await page
    .locator('.asset-department')
    .getByRole('button', { name: '选择部门', exact: true })
    .click();
  const panel = page.getByRole('listbox');
  await expect(panel).toBeVisible();
  for (let index = 0; index < path.length; index += 1) {
    await panel
      .locator('.market-dept-cascader-col')
      .nth(index)
      .getByRole('option')
      .filter({ has: page.getByText(path[index]!, { exact: true }) })
      .click();
  }
  await panel.getByRole('button', { name: '完成', exact: true }).click();
  await expect(panel).toBeHidden();
}

test.describe('Agent / Skill \u8d44\u4ea7 Mock \u4e1a\u52a1', () => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    '\u4ec5\u9a8c\u8bc1 mock transport \u4e0b\u7684\u5b8c\u6574\u8d44\u4ea7\u4e1a\u52a1\u94fe\u8def',
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await openAssets(page);
  });

  test('部门级联选择确认后才刷新产品范围，清空和切换页签正确收起面板', async ({
    page,
  }, testInfo) => {
    const trigger = page
      .locator('.asset-department')
      .getByRole('button', { name: '选择部门', exact: true });
    const product = page.getByLabel('产品筛选');
    await selectHarnessOption(product, { label: 'harness-pipeline' });
    const originalProduct = (await product.getAttribute('data-value'))!;
    await trigger.click();
    const panel = page.getByRole('listbox');
    await expect(panel.getByRole('searchbox', { name: '搜索部门', exact: true })).toBeVisible();
    const triggerBox = (await trigger.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.width).toBeCloseTo(triggerBox.width, 0);
    expect(Math.abs(panelBox.x - triggerBox.x)).toBeLessThanOrEqual(1);
    await panel.screenshot({ path: testInfo.outputPath('assets-department-cascader.png') });
    await panel
      .getByRole('option')
      .filter({ hasText: /^平台工具组/ })
      .click();
    await expect(trigger).toContainText('持续交付组');
    await expect(product).toHaveAttribute('data-value', originalProduct);
    await panel.getByRole('button', { name: '完成', exact: true }).click();
    await expect(trigger).toHaveText(/部门1 \/ 平台产品线 \/ 平台工具组\s*▾/);
    await expect(product).toHaveAttribute('data-value', '');
    await expect(
      (await openHarnessSelect(product)).getByRole('option', { name: 'harness-demo', exact: true }),
    ).toBeAttached();
    await trigger.click();
    const search = panel.getByRole('searchbox', { name: '搜索部门', exact: true });
    await search.fill('持续交付组');
    await panel
      .getByRole('button')
      .filter({ has: page.getByText('持续交付组', { exact: true }) })
      .click();
    await panel.getByRole('button', { name: '完成', exact: true }).click();
    await expect(trigger).toContainText('持续交付组');
    await trigger.click();
    await panel.getByRole('button', { name: '清空部门', exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(trigger).toContainText('选部门');
    await expect(page.locator('.asset-card')).toHaveCount(0);
    await trigger.click();
    await page.getByRole('tab', { name: '业务场景设计', exact: true }).click();
    await expect(panel).toBeHidden();
  });

  test('\u90e8\u95e8\u3001\u4ea7\u54c1\u548c\u8d44\u4ea7\u7c7b\u578b\u5171\u540c\u7ea6\u675f\u805a\u5408\u5217\u8868', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);

    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await expect(assetCard(page, '\u6d41\u6c34\u7ebf\u5931\u8d25\u8bca\u65ad Skill')).toBeVisible();
    await expect(assetCard(page, '\u65e5\u5fd7\u5f02\u5e38\u5b9a\u4f4d Skill')).toHaveCount(0);

    const productSelect = page.getByLabel('\u4ea7\u54c1\u7b5b\u9009');
    await expect(productSelect).toBeVisible();
    await expect(
      (await openHarnessSelect(productSelect)).getByRole('option', {
        name: 'harness-pipeline',
        exact: true,
      }),
    ).toBeAttached();
    await selectHarnessOption(productSelect, { label: 'harness-pipeline' });

    await page.getByRole('button', { name: 'Command', exact: true }).click();
    await expect(assetCard(page, '\u63a5\u53e3\u5951\u7ea6\u68c0\u67e5 Command')).toBeVisible();
    await expect
      .poll(async () => [
        ...new Set(
          (await page.locator('.asset-card .asset-badge.is-type').allTextContents()).map((label) =>
            label.trim(),
          ),
        ),
      ])
      .toEqual(['Command']);

    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await expect(assetCard(page, '\u6d41\u6c34\u7ebf\u5f02\u5e38\u5206\u6790 Agent')).toBeVisible();
    await expect(assetCard(page, '\u63a5\u53e3\u5951\u7ea6\u68c0\u67e5 Command')).toHaveCount(0);

    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    await expect(page.locator('.asset-card').first()).toBeVisible();
    await expect
      .poll(async () => [
        ...new Set(
          (await page.locator('.asset-card .asset-badge.is-type').allTextContents()).map((label) =>
            label.trim(),
          ),
        ),
      ])
      .toEqual(['Extension']);
  });

  test('新建和导入资产均在当前页签选择独立归属', async ({ page }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await selectHarnessOption(page.getByLabel('\u4ea7\u54c1\u7b5b\u9009'), {
      label: 'Harness-Pipeline-Pro',
    });

    await page.getByRole('button', { name: '+ \u65b0\u5efa\u8d44\u4ea7' }).click();
    await page.locator('.asset-action-menu').getByRole('menuitem', { name: 'Command' }).click();

    await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
    const createDialog = page.getByRole('dialog', { name: '添加 Command' });
    await expect(createDialog).toBeVisible();
    const scope = createDialog.getByRole('group', { name: '新增资产归属' });
    await expect(scope.getByLabel('层级')).toHaveAttribute('data-value', '产品级');
    await selectHarnessOption(scope.getByLabel('产品', { exact: true }), {
      label: 'harness-pipeline',
    });
    await expect(
      createDialog.getByPlaceholder('\u8bf7\u8f93\u5165 Command \u540d\u79f0'),
    ).toHaveValue('harness-pipeline-');
    await selectHarnessOption(scope.getByLabel('层级'), '部门级');
    await expect(scope.getByLabel('产品', { exact: true })).toHaveCount(0);
    await createDialog.locator('header button').click();
    await expect(page.getByLabel('产品筛选')).toHaveText('Harness-Pipeline-Pro');
    await expect(
      page.locator('#harness-panel-assets').getByRole('heading', { name: '资产清单', exact: true }),
    ).toBeVisible();
    await selectHarnessOption(page.getByLabel('\u4ea7\u54c1\u7b5b\u9009'), {
      label: '\u6d41\u6c34\u7ebf\u7ba1\u7406\u5e73\u53f0',
    });

    await page.getByRole('button', { name: '导入', exact: true }).click();
    await page.locator('.asset-action-menu').getByRole('menuitem', { name: 'Agent' }).click();
    const importDialog = page.getByRole('dialog', { name: '导入 Agent', exact: true });
    await expect(importDialog).toBeVisible();
    await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#harness-panel-capabilities')).toHaveCount(0);
    // The legacy mock list product is absent from the catalog product options.
    // Require an explicit choice instead of silently importing into another product.
    await expect(importDialog.getByLabel('产品', { exact: true })).toHaveAttribute(
      'data-value',
      '',
    );
    await selectHarnessOption(importDialog.getByLabel('产品', { exact: true }), 'harness-pipeline');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await importDialog.getByRole('button', { name: '选择文件', exact: true }).click();
    await fileChooserPromise;
    await importDialog.getByRole('button', { name: '取消', exact: true }).click();
  });

  test('Skill \u8be6\u60c5\u4f7f\u7528\u771f\u5b9e\u7248\u672c\u5185\u5bb9\u5e76\u5c55\u793a\u8d28\u91cf\u62a5\u544a', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await assetCard(page, '\u53d1\u5e03\u98ce\u9669\u626b\u63cf Skill').click();

    const detail = page.locator('.asset-detail');
    await expect(detail).toBeVisible();
    const versionSelect = detail.getByRole('combobox', { name: '\u7248\u672c' });
    await expect(versionSelect).toBeVisible();
    await versionSelect.click();
    const versionMenu = page.getByRole('listbox', { name: '可用版本' });
    await expect(versionMenu).toBeVisible();
    const versions = (await versionMenu.getByRole('option').allTextContents()).map((label) =>
      label.trim().replace(/^v/, ''),
    );
    expect(versions.length).toBeGreaterThanOrEqual(2);
    await versionSelect.press('Escape');
    await expect(versionMenu).toBeHidden();
    await expect(versionSelect).toBeFocused();

    await expect(detail.getByText(/SKILL\.md/)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const fileRows = detail.locator('.catalog-detail-file-row');
    await expect(fileRows).toHaveCount(4);
    await expect(fileRows.first()).toHaveAttribute('aria-expanded', 'true');
    await expect(fileRows.nth(1)).toHaveAttribute('aria-expanded', 'false');
    const content = detail.locator('.catalog-detail-file-content pre').first();
    await expect(detail.locator('.catalog-detail-file-content')).toHaveCount(1);
    await detail.screenshot({ path: testInfo.outputPath('asset-skill-detail.png') });
    await expect(detail.locator('.catalog-detail-file-content').first()).toHaveCSS(
      'background-color',
      'rgb(248, 250, 252)',
    );
    await expect(content).toContainText('\u53d1\u5e03\u98ce\u9669\u626b\u63cf Skill');
    const initialContent = await content.textContent();
    await versionSelect.press('ArrowDown');
    await versionSelect.press('End');
    await versionSelect.press('Enter');
    await expect(versionSelect).toContainText(`v${versions.at(-1)}`);
    await expect(versionMenu).toBeHidden();
    await expect(content).not.toHaveText(initialContent ?? '');

    await fileRows.nth(1).click();
    await expect(detail.locator('.catalog-detail-file-content')).toHaveCount(2);
    await expect(detail.locator('.catalog-detail-file-content').nth(1)).toContainText(
      `当前版本：${versions.at(-1)}`,
    );

    await detail.getByRole('tab', { name: '质量报告' }).click();
    const report = detail.getByRole('tabpanel', { name: '质量报告' });
    await expect(report.getByText('综合得分', { exact: true })).toBeVisible();
    await expect(report.locator('.catalog-evaluation-score-ring strong')).toHaveText(
      /^\d+(?:\.\d+)?$/,
    );
    await expect(report.locator('.catalog-evaluation-top-list article')).toHaveCount(3);
    expect(await report.locator('.catalog-evaluation-dimensions article').count()).toBeGreaterThan(
      0,
    );
    await expect(report.getByText('评估问题', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('asset-skill-quality-report.png') });
    const lastDimension = report.locator('.catalog-evaluation-dimensions article').last();
    await lastDimension.scrollIntoViewIfNeeded();
    await expect(lastDimension).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('asset-skill-quality-dimensions.png') });

    await versionSelect.click();
    await versionMenu.getByRole('option', { name: `v${versions[0]}`, exact: true }).click();
    await expect(report.getByText('综合得分', { exact: true })).toBeVisible();
    await detail.getByRole('tab', { name: '内容', exact: true }).click();
    await expect(content).toHaveText(initialContent ?? '');
    await expect(detail.locator('.catalog-detail-file-content')).toHaveCount(1);
  });

  test('Agent 和 Command 详情复用清单中的正文展示', async ({ page }) => {
    const detail = page.locator('.asset-detail');
    for (const type of ['Agent', 'Command']) {
      await page.getByRole('button', { name: type, exact: true }).click();
      const card = page.locator('.asset-card').first();
      const name = await card.getByRole('heading').innerText();
      await card.click();
      await expect(detail.locator('.catalog-detail-direct-content pre')).toContainText(name);
      await expect(detail.locator('.catalog-detail-direct-content')).toHaveCSS(
        'background-color',
        'rgb(248, 250, 252)',
      );
      await expect(detail.getByRole('tab', { name: '质量报告' })).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.locator('.asset-back').click();
    }
  });

  test('Extension \u5386\u53f2\u7248\u672c\u6309\u5f53\u65f6\u53d1\u5e03\u7684\u80fd\u529b\u7248\u672c\u52a0\u8f7d\u5185\u5bb9', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await selectHarnessOption(page.getByLabel('\u4ea7\u54c1\u7b5b\u9009'), {
      label: 'harness-pipeline',
    });
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    await assetCard(page, 'MML\u5f00\u53d1 Extension').click();

    const detail = page.locator('.asset-detail');
    const versionSelect = detail.getByRole('combobox', { name: '\u7248\u672c' });
    await versionSelect.click();
    await page.getByRole('option', { name: 'v0.1.5', exact: true }).click();

    await expect(detail.locator('.asset-file-tree')).toContainText('\u7248\u672c\uff1a1.0.1');
    await expect(detail.locator('.asset-file-tree')).not.toContainText(
      'agents/\u4ee3\u7801\u8bc4\u5ba1Agent',
    );
  });

  test('Extension \u9009\u62e9\u76ee\u6807\u7ec4\u7ec7\u540e\u590d\u7528\u53d1\u5e03\u94fe\u8def\uff0c\u5386\u53f2\u548c\u5217\u8868\u72b6\u6001\u540c\u6b65\u5237\u65b0', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await selectHarnessOption(page.getByLabel('\u4ea7\u54c1\u7b5b\u9009'), {
      label: 'harness-pipeline',
    });
    await page.getByRole('button', { name: 'Extension', exact: true }).click();

    const card = assetCard(page, '\u6784\u5efa\u8bca\u65ad Extension');
    await expect(card.getByText('\u5f85\u53d1\u5e03', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: '\u53d1\u5e03', exact: true }).click();

    const publishDialog = page.getByRole('region', { name: /发布 Extension/ });
    const publishedName = 'harness-pipeline-build-published';
    await publishDialog.getByLabel(/Extension 名称/).fill(publishedName);
    const organizationSelect = page.getByRole('combobox', { name: '\u76ee\u6807\u7ec4\u7ec7' });
    await expect(organizationSelect).toBeVisible();
    const organizationOptions = await (await openHarnessSelect(organizationSelect))
      .getByRole('option')
      .allTextContents();
    expect(organizationOptions.length).toBeGreaterThan(1);
    const selectedOrganization = organizationOptions[1]!.trim();
    await selectHarnessOption(organizationSelect, { index: 1 });
    await page.getByRole('button', { name: '\u786e\u8ba4\u53d1\u5e03' }).click();

    await expect(publishDialog).toBeHidden();
    const historyDialog = page.getByRole('region', { name: /发布历史/ });
    await expect(historyDialog.locator('.timeline-item').first()).toContainText(
      selectedOrganization,
    );
    await page.getByRole('button', { name: '返回', exact: true }).click();
    const refreshedCard = assetCard(page, publishedName);
    await expect(refreshedCard.getByText('\u53d1\u5e03\u4e2d', { exact: true })).toBeVisible();
    await expect(
      refreshedCard.getByRole('button', { name: '\u53d1\u5e03', exact: true }),
    ).toHaveCount(0);
    await refreshedCard.getByRole('button', { name: '发布历史' }).click();
    await expect(historyDialog.locator('.timeline-item').first()).toContainText(
      selectedOrganization,
    );
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(refreshedCard).toBeVisible();
  });

  test('\u6ca1\u6709\u53ef\u53d1\u5e03\u7248\u672c\u7684\u8d44\u4ea7\u6807\u8bb0\u4e3a\u672a\u5f00\u53d1\u4e14\u4e0d\u63d0\u4f9b\u53d1\u5e03\u5165\u53e3', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await selectHarnessOption(page.getByLabel('\u4ea7\u54c1\u7b5b\u9009'), {
      label: 'harness-pipeline',
    });
    await page.getByRole('button', { name: 'Skill', exact: true }).click();

    const card = assetCard(page, '\u6d41\u6c34\u7ebf\u914d\u7f6e\u5de1\u68c0 Skill');
    await expect(
      card.locator('.asset-badge').getByText('\u672a\u5f00\u53d1', { exact: true }),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: '\u53d1\u5e03', exact: true })).toHaveCount(0);

    await card.click();
    await expect(page.locator('.asset-detail')).toBeVisible();
    await expect(
      page.locator('.asset-detail').getByRole('button', { name: '\u53d1\u5e03' }),
    ).toHaveCount(0);
  });
});
