import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';
import type { Page } from '@playwright/test';

type LayoutScenario = {
  key: string;
  panelSelector: string;
  pageRootSelector: string;
  titleSelector: string;
  descriptionSelector: string;
};

const scenarios: LayoutScenario[] = [
  {
    key: 'scenarios',
    panelSelector: '#harness-panel-scenarios',
    pageRootSelector: '.scenario-page',
    titleSelector: '.page-header h1',
    descriptionSelector: '.page-header p',
  },
  {
    key: 'capabilities',
    panelSelector: '#harness-panel-capabilities',
    pageRootSelector: '.capability-management-page',
    titleSelector: '.capability-management-hero h2',
    descriptionSelector: '.capability-management-hero p',
  },
  {
    key: 'workflows',
    panelSelector: '#harness-panel-workflows',
    pageRootSelector: '.workflows-page',
    titleSelector: '.workflows-page-header h1',
    descriptionSelector: '.workflows-page-header p',
  },
  {
    key: 'assets',
    panelSelector: '#harness-panel-assets',
    pageRootSelector: '.asset-page',
    titleSelector: '.asset-page__header h1',
    descriptionSelector: '.asset-page__header p',
  },
  {
    key: 'settings',
    panelSelector: '#harness-panel-settings',
    pageRootSelector: '.configuration-page',
    titleSelector: '.configuration-hero h2',
    descriptionSelector: '.configuration-hero p',
  },
  {
    key: 'tasks',
    panelSelector: '#harness-panel-tasks',
    pageRootSelector: '.task-management-page',
    titleSelector: '.task-management-hero h2',
    descriptionSelector: '.task-management-hero p',
  },
];

const computedTextStyle = (element: Element) => {
  const style = window.getComputedStyle(element);
  return {
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    color: style.color,
    marginTop: style.marginTop,
  };
};

async function waitForTwoAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test('Harness 管理各顶层页面保持资产页标题排版与视口内滚动布局', async ({ page }) => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    'layout regression runs against the mock transport only',
  );

  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(`${APP_BASE_PATH}/harness-management`);

  const assetPage = page.locator('#harness-panel-assets');
  await page.locator('#harness-tab-assets').click();
  await expect(assetPage).toBeVisible();
  await expect(assetPage.locator('.asset-page__header h1')).toBeVisible();
  await expect(assetPage.locator('.asset-page__header p')).toBeVisible();

  const assetTitleStyle = await assetPage
    .locator('.asset-page__header h1')
    .evaluate(computedTextStyle);
  const assetDescriptionStyle = await assetPage
    .locator('.asset-page__header p')
    .evaluate(computedTextStyle);
  expect(assetTitleStyle).toMatchObject({ fontSize: '22.4px', fontWeight: '700' });
  expect(assetDescriptionStyle).toMatchObject({
    fontSize: '13.12px',
    fontWeight: '400',
    marginTop: '3.2px',
  });

  for (const scenario of scenarios) {
    await page.locator(`#harness-tab-${scenario.key}`).click();
    const panel = page.locator(scenario.panelSelector);
    await expect(panel).toBeVisible();

    const title = panel.locator(scenario.titleSelector);
    const description = panel.locator(scenario.descriptionSelector);
    await expect(title).toBeVisible();
    await expect(description).toBeVisible();
    await expect(title).toHaveCSS('font-size', assetTitleStyle.fontSize);
    await expect(title).toHaveCSS('font-weight', assetTitleStyle.fontWeight);
    await expect(title).toHaveCSS('line-height', assetTitleStyle.lineHeight);
    await expect(title).toHaveCSS('letter-spacing', assetTitleStyle.letterSpacing);
    await expect(title).toHaveCSS('color', assetTitleStyle.color);
    await expect(description).toHaveCSS('font-size', assetDescriptionStyle.fontSize);
    await expect(description).toHaveCSS('font-weight', assetDescriptionStyle.fontWeight);
    await expect(description).toHaveCSS('line-height', assetDescriptionStyle.lineHeight);
    await expect(description).toHaveCSS('letter-spacing', assetDescriptionStyle.letterSpacing);
    await expect(description).toHaveCSS('color', assetDescriptionStyle.color);
    await expect(description).toHaveCSS('margin-top', assetDescriptionStyle.marginTop);

    await expect(panel.getByText('SCENARIO DESIGN', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('WORKFLOWS', { exact: true })).toHaveCount(0);

    await waitForTwoAnimationFrames(page);
    const viewportOverflow = await page.evaluate(() => ({
      scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
      clientHeight: document.scrollingElement?.clientHeight ?? 0,
      scrollY: window.scrollY,
    }));
    expect(viewportOverflow.scrollHeight - viewportOverflow.clientHeight).toBeLessThanOrEqual(1);
    expect(viewportOverflow.scrollY).toBe(0);

    const rootOverflow = await panel.locator(scenario.pageRootSelector).evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(rootOverflow.scrollHeight).toBeLessThanOrEqual(rootOverflow.clientHeight + 1);

    if (scenario.key === 'assets') {
      await expect(panel.locator('.asset-card')).toHaveCount(24);
      const boardOverflow = await panel.locator('.asset-board--catalog').evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
      expect(boardOverflow.scrollHeight).toBeLessThanOrEqual(boardOverflow.clientHeight + 1);
    }
  }
});

test('narrow permission layout keeps its table inside a local scroll container', async ({
  page,
}) => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    'layout regression runs against the mock transport only',
  );

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-settings').evaluate((element: HTMLElement) => element.click());

  const permissionPanel = page.locator('#harness-panel-settings .permission-panel');
  const tableWrap = permissionPanel.locator('.member-table-wrap');
  await expect(permissionPanel).toBeVisible();
  await expect(tableWrap).toBeVisible();

  const geometry = await permissionPanel.evaluate((panel) => {
    const pane = panel.querySelector<HTMLElement>('.member-pane');
    const wrap = panel.querySelector<HTMLElement>('.member-table-wrap');
    if (!pane || !wrap) throw new Error('permission layout is incomplete');
    return {
      panelClientWidth: panel.clientWidth,
      panelScrollWidth: panel.scrollWidth,
      paneWidth: pane.getBoundingClientRect().width,
      wrapClientWidth: wrap.clientWidth,
      wrapScrollWidth: wrap.scrollWidth,
    };
  });

  expect(geometry.panelScrollWidth).toBeLessThanOrEqual(geometry.panelClientWidth + 1);
  expect(geometry.paneWidth).toBeLessThanOrEqual(geometry.panelClientWidth + 1);
  expect(geometry.wrapClientWidth).toBeLessThanOrEqual(geometry.paneWidth);
  expect(geometry.wrapScrollWidth).toBeGreaterThan(geometry.wrapClientWidth);
});
