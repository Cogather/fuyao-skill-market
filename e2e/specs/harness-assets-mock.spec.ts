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
  await page.getByRole('tab', { name: 'Agent / Skill \u8d44\u4ea7' }).click();
  await expect(page.getByRole('heading', { name: '\u8d44\u4ea7\u6e05\u5355' })).toBeVisible();
}

async function selectDepartmentPath(page: Page, path: string[]): Promise<void> {
  await page.locator('.asset-department__trigger').click();
  const panel = page.locator('.asset-department__panel');
  await expect(panel).toBeVisible();

  for (let index = 0; index < path.length; index += 1) {
    const accessiblePath = path.slice(0, index + 1).join(' / ');
    const nameButton = panel.getByRole('button', { name: accessiblePath, exact: true });
    await expect(nameButton).toBeVisible();

    if (index === path.length - 1) {
      await nameButton.click();
      break;
    }

    const toggle = nameButton.locator('xpath=..').locator('.asset-department__toggle');
    const toggleLabel = (await toggle.getAttribute('aria-label')) ?? '';
    if (toggleLabel.startsWith('\u5c55\u5f00')) await toggle.click();
  }

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

  test('\u90e8\u95e8\u3001\u4ea7\u54c1\u548c\u8d44\u4ea7\u7c7b\u578b\u5171\u540c\u7ea6\u675f\u805a\u5408\u5217\u8868', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);

    await expect(assetCard(page, '\u6d41\u6c34\u7ebf\u5931\u8d25\u8bca\u65ad Skill')).toBeVisible();
    await expect(assetCard(page, '\u65e5\u5fd7\u5f02\u5e38\u5b9a\u4f4d Skill')).toHaveCount(0);

    const productSelect = page.getByLabel('\u4ea7\u54c1\u7b5b\u9009');
    await expect(productSelect).toBeVisible();
    await expect(
      productSelect.getByRole('option', { name: 'harness-pipeline', exact: true }),
    ).toBeAttached();
    await productSelect.selectOption({ label: 'harness-pipeline' });

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

  test('\u65b0\u5efa\u4e0e\u5bfc\u5165\u6cbf\u7528\u8d44\u4ea7\u9875\u8303\u56f4\u5e76\u8fdb\u5165\u5bf9\u5e94\u539f\u5b50\u80fd\u529b\u6e05\u5355', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page
      .getByLabel('\u4ea7\u54c1\u7b5b\u9009')
      .selectOption({ label: 'Harness-Pipeline-Pro' });

    await page.getByRole('button', { name: '+ \u65b0\u5efa\u8d44\u4ea7' }).click();
    await page.locator('.asset-action-menu').getByRole('menuitem', { name: 'Command' }).click();

    await expect(page.locator('#harness-tab-capabilities')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const capabilityManagementPanel = page.locator('#harness-panel-capabilities');
    await expect(
      capabilityManagementPanel.getByRole('tab', { name: 'Command \u6e05\u5355', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    const createDialog = page.locator('.capability-master-dialog');
    await expect(createDialog).toBeVisible();
    await expect(
      createDialog.getByPlaceholder('\u8bf7\u8f93\u5165 Command \u540d\u79f0'),
    ).toHaveValue('harness-pipeline-pro-');
    await createDialog.locator('header button').click();

    await page.getByRole('tab', { name: 'Agent / Skill \u8d44\u4ea7' }).click();
    await expect(page.getByRole('heading', { name: '\u8d44\u4ea7\u6e05\u5355' })).toBeVisible();
    await page
      .getByLabel('\u4ea7\u54c1\u7b5b\u9009')
      .selectOption({ label: '\u6d41\u6c34\u7ebf\u7ba1\u7406\u5e73\u53f0' });

    await page.getByRole('button', { name: '\u6279\u91cf\u5bfc\u5165' }).click();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.asset-action-menu').getByRole('menuitem', { name: 'Agent' }).click();
    await fileChooserPromise;

    await expect(page.locator('#harness-tab-capabilities')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      capabilityManagementPanel.getByRole('tab', { name: 'Agent \u6e05\u5355', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      capabilityManagementPanel
        .locator('#capability-management-panel-agent')
        .locator('.capability-master-field--product select'),
    ).toHaveValue('\u6d41\u6c34\u7ebf\u7ba1\u7406\u5e73\u53f0');
  });

  test('Skill \u8be6\u60c5\u4f7f\u7528\u771f\u5b9e\u7248\u672c\u5185\u5bb9\u5e76\u5c55\u793a\u8d28\u91cf\u62a5\u544a', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await assetCard(page, '\u53d1\u5e03\u98ce\u9669\u626b\u63cf Skill').click();

    const detail = page.locator('.asset-detail');
    await expect(detail).toBeVisible();
    const versionSelect = detail.getByRole('combobox', { name: '\u7248\u672c' });
    await expect(versionSelect).toBeVisible();
    expect(await versionSelect.locator('option').count()).toBeGreaterThanOrEqual(2);

    await expect(detail.getByText(/SKILL\.md/)).toBeVisible();
    const content = detail.locator('.asset-file-tree pre').first();
    await expect(content).toContainText('\u53d1\u5e03\u98ce\u9669\u626b\u63cf Skill');
    const initialContent = await content.textContent();
    const versions = await versionSelect
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    await versionSelect.selectOption(versions.at(-1)!);
    await expect(content).not.toHaveText(initialContent ?? '');

    await detail.getByRole('button', { name: '\u8d28\u91cf\u62a5\u544a' }).click();
    const report = detail.locator('.asset-report');
    await expect(report.getByText('\u6574\u4f53\u8bc4\u5206', { exact: true })).toBeVisible();
    await expect(report.locator('.asset-report__summary strong')).toHaveText(/^\d+(?:\.\d+)?$/);
    expect(await report.locator('tbody tr').count()).toBeGreaterThan(0);
  });

  test('Extension \u5386\u53f2\u7248\u672c\u6309\u5f53\u65f6\u53d1\u5e03\u7684\u80fd\u529b\u7248\u672c\u52a0\u8f7d\u5185\u5bb9', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByLabel('\u4ea7\u54c1\u7b5b\u9009').selectOption({ label: 'harness-pipeline' });
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    await assetCard(page, 'MML\u5f00\u53d1 Extension').click();

    const detail = page.locator('.asset-detail');
    const versionSelect = detail.getByRole('combobox', { name: '\u7248\u672c' });
    await versionSelect.selectOption('0.1.5');

    await expect(detail.locator('.asset-file-tree')).toContainText('\u7248\u672c\uff1a1.0.1');
    await expect(detail.locator('.asset-file-tree')).not.toContainText(
      'agents/\u4ee3\u7801\u8bc4\u5ba1Agent',
    );
  });

  test('Extension \u9009\u62e9\u76ee\u6807\u7ec4\u7ec7\u540e\u590d\u7528\u53d1\u5e03\u94fe\u8def\uff0c\u5386\u53f2\u548c\u5217\u8868\u72b6\u6001\u540c\u6b65\u5237\u65b0', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByLabel('\u4ea7\u54c1\u7b5b\u9009').selectOption({ label: 'harness-pipeline' });
    await page.getByRole('button', { name: 'Extension', exact: true }).click();

    const card = assetCard(page, '\u6784\u5efa\u8bca\u65ad Extension');
    await expect(card.getByText('\u5f85\u53d1\u5e03', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: '\u53d1\u5e03', exact: true }).click();

    const organizationSelect = page.getByRole('combobox', { name: '\u76ee\u6807\u7ec4\u7ec7' });
    await expect(organizationSelect).toBeVisible();
    const organizationOptions = await organizationSelect.locator('option').allTextContents();
    expect(organizationOptions.length).toBeGreaterThan(1);
    const selectedOrganization = organizationOptions[1]!.trim();
    await organizationSelect.selectOption({ index: 1 });
    await page.getByRole('button', { name: '\u786e\u8ba4\u53d1\u5e03' }).click();

    await expect(page.getByRole('button', { name: '\u53d1\u5e03\u5386\u53f2' })).toHaveClass(
      /is-active/,
    );
    const latestHistory = page.locator('.asset-history__item').first();
    await expect(latestHistory).toContainText(selectedOrganization);
    const publishedName = (await latestHistory.locator('strong').textContent())?.trim() ?? '';
    expect(publishedName).toMatch(/^[a-z0-9-]{1,64}$/);

    await page.locator('.asset-back').click();
    await page.locator('.asset-back').click();
    const refreshedCard = assetCard(page, publishedName);
    await expect(refreshedCard.getByText('\u53d1\u5e03\u4e2d', { exact: true })).toBeVisible();
    await expect(
      refreshedCard.getByRole('button', { name: '\u53d1\u5e03', exact: true }),
    ).toHaveCount(0);
  });

  test('\u6ca1\u6709\u53ef\u53d1\u5e03\u7248\u672c\u7684\u8d44\u4ea7\u6807\u8bb0\u4e3a\u672a\u5f00\u53d1\u4e14\u4e0d\u63d0\u4f9b\u53d1\u5e03\u5165\u53e3', async ({
    page,
  }) => {
    await selectDepartmentPath(page, CONTINUOUS_DELIVERY_PATH);
    await page.getByLabel('\u4ea7\u54c1\u7b5b\u9009').selectOption({ label: 'harness-pipeline' });
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
