import { openHarnessSelect, selectHarnessOption } from '../helpers/selectHarnessOption';
import { clickAssetCardAction, openAssetCardMenu } from '../helpers/assetCardActions';
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

  test('发布页底部操作按钮保持常规高度', async ({ page }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await clickAssetCardAction(page.locator('.asset-card').first(), '发布');

    const publishPage = page.locator('.atomic-publish-page');
    await expect(publishPage).toBeVisible();
    const footerBox = await publishPage.locator('.atomic-publish__footer').boundingBox();
    const cancelBox = await publishPage
      .getByRole('button', { name: '取消', exact: true })
      .boundingBox();
    const confirmBox = await publishPage
      .getByRole('button', { name: '确认发布', exact: true })
      .boundingBox();

    expect(footerBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    expect(confirmBox).not.toBeNull();
    expect(footerBox!.height).toBeLessThanOrEqual(80);
    expect(cancelBox!.height).toBeLessThanOrEqual(40);
    expect(confirmBox!.height).toBeLessThanOrEqual(40);
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

  test('四类资产都有已发布 Mock 数据和多个已发布版本', async ({ page }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);

    for (const sample of [
      { type: 'Agent', name: '流水线异常分析 Agent' },
      { type: 'Skill', name: '流水线失败诊断 Skill' },
      { type: 'Command', name: '接口契约检查 Command' },
      { type: 'Extension', name: '问题分析 Extension' },
    ]) {
      await page.getByRole('button', { name: sample.type, exact: true }).click();
      await page
        .getByRole('navigation', { name: '资产状态' })
        .getByRole('button', { name: '已发布', exact: true })
        .click();
      const card = assetCard(page, sample.name);
      await expect(card).toBeVisible();
      await expect(card.getByText('已发布', { exact: true })).toBeVisible();
      await card.click();

      const versionSelect = page
        .locator('.asset-detail')
        .getByRole('combobox', { name: '版本', exact: true });
      await versionSelect.click();
      const options = page.getByRole('listbox', { name: '可用版本' }).getByRole('option');
      expect(await options.count()).toBeGreaterThanOrEqual(3);
      expect(
        (await options.allTextContents()).every((label) => label.trim().endsWith('已发布')),
      ).toBe(true);
      await versionSelect.press('Escape');
      await page.locator('.asset-back').click();
    }
  });

  test('原子资产详情在 Mock 模式展示匹配的发布记录并支持失败重试', async ({ page }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    const assetName = '流水线失败诊断 Skill';
    await assetCard(page, assetName).click();

    await page.getByRole('tab', { name: '发布记录', exact: true }).click();
    const history = page.getByRole('region', { name: 'Skill 发布记录' });
    await expect(history).toBeVisible();
    await expect(history.getByRole('alert')).toHaveCount(0);
    await expect(history.locator('.atomic-timeline__item')).toHaveCount(4);
    await expect(history.locator('.atomic-timeline__name')).toHaveText(
      Array.from({ length: 4 }, () => assetName),
    );
    await expect(history.locator('.atomic-timeline__status')).toHaveText([
      '发布成功',
      '进行中',
      '发布失败',
      '发布失败',
    ]);

    const retryRecord = history.locator('.atomic-timeline__item').nth(2);
    const retry = retryRecord.getByRole('button', { name: `重试：${assetName}` });
    await expect(retry).toHaveCount(1);
    await expect(retry).toHaveText('重试');
    await retry.click();
    await expect(retryRecord.locator('.atomic-timeline__status')).toHaveText('进行中');
    await expect(retryRecord.locator('.atomic-timeline__failure')).toHaveCount(0);
  });

  test('新建和导入资产均在当前页签选择独立归属', async ({ page }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await selectHarnessOption(page.getByLabel('\u4ea7\u54c1\u7b5b\u9009'), {
      label: 'Harness-Pipeline-Pro',
    });

    await page.getByRole('button', { name: 'Command', exact: true }).click();
    await page.getByRole('button', { name: '＋ 新增', exact: true }).click();

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

    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await page.getByRole('button', { name: '导入', exact: true }).click();
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

  test('新增资产弹窗忽略遮罩点击和 Escape，仅由显式按钮关闭', async ({ page }) => {
    for (const sample of [
      { type: 'Agent', dialogName: '添加 Agent', overlay: '.capability-master-overlay' },
      { type: 'Command', dialogName: '添加 Command', overlay: '.capability-master-overlay' },
      { type: 'Skill', dialogName: '添加 Skill', overlay: '.overlay.harness-workspace-overlay' },
    ]) {
      await page.getByRole('button', { name: sample.type, exact: true }).click();
      await page.getByRole('button', { name: '＋ 新增', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: sample.dialogName, exact: true });
      await expect(dialog).toBeVisible();

      await page.locator(sample.overlay).click({ position: { x: 6, y: 6 } });
      await expect(dialog).toBeVisible();
      await dialog.getByText(sample.dialogName, { exact: true }).click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();

      await dialog.locator('header button').click();
      await expect(dialog).toBeHidden();
    }
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
    await expect(versionSelect).toHaveText(/^\d/);
    await expect(versionSelect.locator('svg')).toHaveCount(0);
    await expect(versionSelect.locator('.harness-version-picker__status-dot')).toBeVisible();
    await versionSelect.click();
    const versionMenu = page.getByRole('listbox', { name: '可用版本' });
    await expect(versionMenu).toBeVisible();
    await expect(versionMenu.locator('.harness-version-picker__caption')).toHaveCount(0);
    const options = versionMenu.getByRole('option');
    const optionLabels = await options.allTextContents();
    const versions = optionLabels.map((label) => label.trim().match(/^\d[\w.-]*/)?.[0] ?? '');
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(
      optionLabels.every((label) => /^\d[\w.-]*\s*(开发中|待发布|已发布)$/.test(label.trim())),
    ).toBe(true);
    await expect(options.locator('.harness-version-picker__status-dot')).toHaveCount(
      optionLabels.length,
    );
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
    await expect(versionSelect).toContainText(versions.at(-1)!);
    await expect(versionMenu).toBeHidden();
    await expect(content).not.toHaveText(initialContent ?? '');

    await fileRows.nth(1).click();
    await expect(detail.locator('.catalog-detail-file-content')).toHaveCount(2);
    await expect(detail.locator('.catalog-detail-file-content').nth(1)).toContainText(
      `当前版本：${versions.at(-1)}`,
    );

    await detail.getByRole('tab', { name: '评估报告' }).click();
    const report = detail.getByRole('tabpanel', { name: '评估报告' });
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
    await options.first().click();
    await expect(report.getByText('综合得分', { exact: true })).toBeVisible();
    await detail.getByRole('tab', { name: '内容', exact: true }).click();
    await expect(content).toHaveText(initialContent ?? '');
    await expect(detail.locator('.catalog-detail-file-content')).toHaveCount(1);
  });

  test('Skill 详情按新顺序展示行为评测并支持核心交互', async ({ page }) => {
    const behaviorApiRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/harness/plans/skill/behavior-eval')) {
        behaviorApiRequests.push(request.url());
      }
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await assetCard(page, '发布风险扫描 Skill').click();

    const detail = page.locator('.asset-detail');
    const detailTabs = detail.getByRole('tablist', { name: '资产详情分区' }).getByRole('tab');
    await expect(detailTabs).toHaveText(['内容', '评估报告', '行为评测', '发布记录']);
    await expect(detail.locator('.asset-detail__version')).toBeVisible();
    await expect(detail.locator('.asset-detail__version-panel')).toHaveCount(0);
    await detail.getByRole('tab', { name: '评估报告', exact: true }).click();
    await expect(detail.locator('.catalog-evaluation-panel')).toBeVisible();
    await expect(detail.locator('.asset-detail__version')).toBeVisible();
    await expect(detail.locator('.asset-detail__version-panel')).toHaveCount(0);

    await detail.getByRole('tab', { name: '行为评测', exact: true }).click();
    await expect(detail.getByRole('tab', { name: '行为评测', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const panel = detail.getByRole('tabpanel', { name: '行为评测', exact: true });
    await expect(detail.locator('.asset-detail__version')).toHaveCount(0);
    await expect(detail.locator('.asset-detail__version-panel')).toHaveCount(0);
    await expect(detail.locator('.catalog-detail-capability')).toBeHidden();
    await expect(panel.getByText('评测触发时间', { exact: true })).toBeVisible();
    await expect(panel.getByText('触发结果构成', { exact: true })).toBeVisible();
    const behaviorVersion = panel.getByRole('combobox', { name: '版本', exact: true });
    await behaviorVersion.click();
    const behaviorVersionOptions = page
      .getByRole('listbox', { name: '可用版本' })
      .getByRole('option');
    expect(
      (await behaviorVersionOptions.allTextContents()).every((label) =>
        /(已评测|部分评测|进行中|失败|未评测)$/.test(label.trim()),
      ),
    ).toBe(true);
    await behaviorVersion.press('Escape');

    await panel.getByRole('button', { name: '不通过 2', exact: true }).click();
    await expect(panel.getByText('TC-T-007', { exact: true })).toBeVisible();
    await expect(panel.getByText('TC-T-001', { exact: true })).toBeHidden();
    const triggerCaseToggle = panel.getByRole('button', { name: '展开用例 TC-T-007' });
    await triggerCaseToggle.click();
    const expandedTriggerCaseToggle = panel.getByRole('button', { name: '收起用例 TC-T-007' });
    await expect(expandedTriggerCaseToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByText('未触发当前 Skill', { exact: true })).toBeVisible();
    await expandedTriggerCaseToggle.click();

    await panel.getByRole('tab', { name: '质量评测', exact: true }).click();
    await expect(panel.getByText('评测画像', { exact: true })).toBeVisible();
    const qualityCaseToggle = panel.getByRole('button', { name: '展开用例 TC-Q-001' });
    await qualityCaseToggle.click();
    await expect(panel.getByText('期望结果', { exact: true })).toBeVisible();
    await expect(panel.getByText('实际输出', { exact: true })).toBeVisible();
    await expect(panel.getByText('评分分析', { exact: true })).toBeVisible();

    await panel.getByRole('button', { name: '发起评测', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '发起行为评测', exact: true });
    const confirm = dialog.getByRole('button', { name: '触发', exact: true });
    await expect(confirm).toBeDisabled();
    const options = dialog.getByRole('checkbox');
    await expect(options).toHaveCount(2);
    await options.first().check();
    await expect(confirm).toBeEnabled();
    await options.nth(1).check();
    await expect(options.first()).toBeChecked();
    await expect(options.nth(1)).toBeChecked();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();

    await panel.getByRole('button', { name: '发起评测', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '发起行为评测', exact: true });
    await expect(dialog.getByRole('checkbox').first()).not.toBeChecked();
    await expect(dialog.getByRole('checkbox').nth(1)).not.toBeChecked();
    await dialog.getByRole('checkbox').first().check();
    await dialog.getByRole('button', { name: '触发', exact: true }).click();
    await expect(dialog).toBeHidden();
    await panel.getByRole('tab', { name: '触发评测' }).click();
    await expect(panel.getByText('触发评测进行中', { exact: true })).toBeVisible();

    await panel.getByRole('button', { name: '版本趋势', exact: true }).click();
    const trendDialog = page.getByRole('dialog', { name: '版本通过率趋势', exact: true });
    await expect(trendDialog.getByText('质量评测通过率', { exact: true })).toBeVisible();
    await expect(trendDialog.getByText('触发评测准确率', { exact: true })).toBeVisible();
    await expect(trendDialog.getByText(/v1\.10\.0/).first()).toBeVisible();
    await trendDialog.getByRole('button', { name: '关闭版本趋势弹窗' }).click();
    await expect(trendDialog).toBeHidden();
    expect(behaviorApiRequests).toHaveLength(0);
  });

  test('Skill 行为评测随版本切换展示未评测空态', async ({ page }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await assetCard(page, '流水线失败诊断 Skill').click();

    const detail = page.locator('.asset-detail');
    await detail.getByRole('tab', { name: '行为评测', exact: true }).click();
    const panel = detail.getByRole('tabpanel', { name: '行为评测', exact: true });
    const versionSelect = detail.getByRole('combobox', { name: '版本' });
    await expect(versionSelect).toContainText('1.1.0');
    await expect(panel.getByText('当前版本暂无触发评测数据', { exact: true })).toBeVisible();
    await expect(panel.getByText(/v1\.1\.0 尚未发起该模式评测/)).toBeVisible();

    await versionSelect.click();
    await expect(page.getByRole('option', { name: '1.1.0 未评测', exact: true })).toBeVisible();
    await page.getByRole('option', { name: /^0\.9\.0 / }).click();

    await expect(panel.getByText('当前版本暂无触发评测数据', { exact: true })).toBeVisible();
    await expect(panel.getByText(/v0\.9\.0 尚未发起该模式评测/)).toBeVisible();
    await panel.getByRole('status').getByRole('button', { name: '发起评测', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '发起行为评测', exact: true })).toBeVisible();
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
      await expect(detail.getByRole('tab', { name: '评估报告' })).toHaveCount(0);
      await expect(detail.getByRole('tab', { name: '行为评测' })).toHaveCount(0);
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
    await assetCard(page, '\u95ee\u9898\u5206\u6790 Extension').click();

    const detail = page.locator('.asset-detail');
    const versionSelect = detail.getByRole('combobox', { name: '\u7248\u672c' });
    await versionSelect.click();
    await page.getByRole('option', { name: /^0\.1\s/ }).click();

    await expect(detail.locator('.asset-file-tree')).toContainText('\u7248\u672c\uff1a1.0.0');
    await expect(detail.locator('.asset-file-tree')).not.toContainText('\u7248\u672c\uff1a1.2.0');
  });

  test('Extension \u5217\u8868\u9690\u85cf\u672a\u53d1\u5e03\u548c\u53d1\u5e03\u4e2d\u8d44\u4ea7', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await selectHarnessOption(page.getByLabel('\u4ea7\u54c1\u7b5b\u9009'), {
      label: 'harness-pipeline',
    });
    await page.getByRole('button', { name: 'Extension', exact: true }).click();

    await expect(assetCard(page, '\u6784\u5efa\u8bca\u65ad Extension')).toHaveCount(0);
    await expect(assetCard(page, 'MML\u5f00\u53d1 Extension')).toHaveCount(0);
    const publishedCard = assetCard(page, '\u95ee\u9898\u5206\u6790 Extension');
    await expect(publishedCard.getByText('\u5df2\u53d1\u5e03', { exact: true })).toBeVisible();
    const menu = await openAssetCardMenu(publishedCard);
    await expect(menu.getByRole('menuitem')).toHaveText([
      '\u67e5\u770b\u8be6\u60c5',
      '\u53d1\u5e03\u5386\u53f2',
    ]);
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
    const cardMenu = await openAssetCardMenu(card);
    await expect(cardMenu.getByRole('menuitem', { name: '\u53d1\u5e03', exact: true })).toHaveCount(
      0,
    );

    await card.click();
    await expect(page.locator('.asset-detail')).toBeVisible();
    await expect(
      page.locator('.asset-detail').getByRole('button', { name: '\u53d1\u5e03' }),
    ).toHaveCount(0);
  });
});
