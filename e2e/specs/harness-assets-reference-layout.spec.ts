import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';
import type { Page } from '@playwright/test';

async function openSecondAssetCatalog(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  await expect(
    page.locator('#harness-panel-assets').getByRole('heading', { name: '资产清单', exact: true }),
  ).toBeVisible();
}

test.describe('第二个资产清单参考稿样式', () => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    '参考稿视觉与本地筛选回归使用稳定的 mock 资产数据',
  );

  test('资产范围筛选与 Harness 工作流使用相同的容器和控件规格', async ({ page }) => {
    await openSecondAssetCatalog(page);
    await expect(page.getByLabel('产品筛选')).toBeVisible();

    const appearance = await page.locator('.asset-scope').evaluate((scope) => {
      const department = scope.querySelector<HTMLElement>('.asset-department')!;
      const departmentTrigger = department.querySelector<HTMLElement>(
        '.market-dept-cascader-trigger',
      )!;
      const product = scope.querySelector<HTMLElement>('.harness-select')!;
      const scopeStyle = getComputedStyle(scope);
      const departmentStyle = getComputedStyle(departmentTrigger);
      const productStyle = getComputedStyle(product);
      const scopeRect = scope.getBoundingClientRect();
      const departmentRect = department.getBoundingClientRect();
      return {
        scope: {
          width: Math.round(scopeRect.width),
          padding: scopeStyle.padding,
          borderWidth: scopeStyle.borderTopWidth,
          borderRadius: scopeStyle.borderRadius,
          background: scopeStyle.backgroundColor,
          gap: scopeStyle.gap,
        },
        department: {
          width: Math.round(departmentRect.width),
          height: departmentStyle.height,
          borderRadius: departmentStyle.borderRadius,
        },
        product: {
          width: Math.round(product.getBoundingClientRect().width),
          height: productStyle.height,
          borderRadius: productStyle.borderRadius,
        },
      };
    });

    expect(appearance.scope).toMatchObject({
      padding: '12px 16px',
      borderWidth: '1px',
      borderRadius: '8px',
      background: 'rgb(255, 255, 255)',
      gap: '12px',
    });
    expect(appearance.scope.width).toBeGreaterThan(1700);
    expect(appearance.department).toMatchObject({ height: '36px', borderRadius: '6px' });
    expect(appearance.department.width).toBeGreaterThan(appearance.scope.width / 2);
    expect(appearance.product).toEqual({ width: 200, height: '36px', borderRadius: '6px' });
  });

  test('类型页签和资产卡片呈现参考稿的信息层级', async ({ page }, testInfo) => {
    await openSecondAssetCatalog(page);

    const typeTabs = page.getByRole('navigation', { name: '资产类型' });
    await expect(typeTabs.locator('.asset-filter__dot')).toHaveCount(4);
    const firstCard = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name: '流水线异常分析 Agent', exact: true }),
    });
    await expect(firstCard.locator('.asset-card__icon')).toHaveText('A');
    await expect(firstCard.locator('.asset-card__developer')).toHaveText('李明');
    await expect(firstCard.locator('.asset-card__scope')).toHaveText('harness-pipeline');
    await expect(
      firstCard.locator('.asset-card__developer > span, .asset-card__scope > span'),
    ).toHaveCount(0);
    await expect(
      firstCard.locator('.asset-card__head > .asset-card__meta .asset-badge'),
    ).toBeVisible();
    const cardRows = await page
      .locator('.asset-card')
      .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top)));
    expect([...new Set(cardRows.slice(0, 4))]).toHaveLength(1);
    expect(cardRows[4]).toBeGreaterThan(cardRows[0]!);

    const appearance = await page.evaluate(() => {
      const tabs = document.querySelector<HTMLElement>('.asset-filters')!;
      const active = tabs.querySelector<HTMLElement>('button.is-active')!;
      const scope = document.querySelector<HTMLElement>('.asset-scope')!;
      const department = scope.querySelector<HTMLElement>('.market-dept-cascader-trigger')!;
      const search = document.querySelector<HTMLElement>('.asset-search input')!;
      const importButton = document.querySelector<HTMLElement>('.asset-page__actions button')!;
      const card = document.querySelector<HTMLElement>('.asset-card')!;
      const icon = card.querySelector<HTMLElement>('.asset-card__icon')!;
      const footer = card.querySelector<HTMLElement>('.asset-card__footer')!;
      const tabsStyle = getComputedStyle(tabs);
      const activeStyle = getComputedStyle(active);
      const scopeStyle = getComputedStyle(scope);
      const departmentStyle = getComputedStyle(department);
      const searchStyle = getComputedStyle(search);
      const importButtonStyle = getComputedStyle(importButton);
      const cardStyle = getComputedStyle(card);
      const iconStyle = getComputedStyle(icon);
      const footerStyle = getComputedStyle(footer);
      return {
        tabs: {
          padding: tabsStyle.padding,
          borderRadius: tabsStyle.borderRadius,
          background: tabsStyle.backgroundColor,
        },
        activeTab: {
          background: activeStyle.backgroundColor,
          fontWeight: activeStyle.fontWeight,
          boxShadow: activeStyle.boxShadow,
        },
        scope: {
          padding: scopeStyle.padding,
          borderTopWidth: scopeStyle.borderTopWidth,
          background: scopeStyle.backgroundColor,
        },
        department: {
          height: departmentStyle.height,
          borderRadius: departmentStyle.borderRadius,
        },
        search: {
          height: searchStyle.height,
          borderRadius: searchStyle.borderRadius,
        },
        action: {
          height: importButtonStyle.height,
          borderRadius: importButtonStyle.borderRadius,
        },
        card: {
          padding: cardStyle.padding,
          borderRadius: cardStyle.borderRadius,
          gap: cardStyle.gap,
        },
        icon: {
          width: iconStyle.width,
          height: iconStyle.height,
          borderRadius: iconStyle.borderRadius,
        },
        footer: {
          paddingTop: footerStyle.paddingTop,
          borderTopWidth: footerStyle.borderTopWidth,
        },
      };
    });

    expect(appearance).toEqual({
      tabs: {
        padding: '3px',
        borderRadius: '10px',
        background: 'rgb(233, 236, 243)',
      },
      activeTab: {
        background: 'rgb(255, 255, 255)',
        fontWeight: '600',
        boxShadow: 'rgba(0, 0, 0, 0.08) 0px 1px 3px 0px',
      },
      scope: {
        padding: '12px 16px',
        borderTopWidth: '1px',
        background: 'rgb(255, 255, 255)',
      },
      department: {
        height: '36px',
        borderRadius: '6px',
      },
      search: {
        height: '36px',
        borderRadius: '9px',
      },
      action: {
        height: '34px',
        borderRadius: '8px',
      },
      card: {
        padding: '16px',
        borderRadius: '14px',
        gap: '10px',
      },
      icon: {
        width: '38px',
        height: '38px',
        borderRadius: '10px',
      },
      footer: {
        paddingTop: '10px',
        borderTopWidth: '1px',
      },
    });
    await page.screenshot({ path: testInfo.outputPath('asset-list-reference.png') });
  });

  test('工具栏操作按钮按参考稿排列并统一为白底描边样式', async ({ page }) => {
    await openSecondAssetCatalog(page);

    const actions = page.locator('.asset-page__actions');
    const buttons = actions.locator(':scope > button');
    await expect(buttons).toHaveText(['＋ 新增', '导入', '导出']);

    const appearance = await buttons.evaluateAll((items) =>
      items.map((item) => {
        const style = getComputedStyle(item);
        return {
          height: style.height,
          padding: style.padding,
          borderRadius: style.borderRadius,
          borderColor: style.borderTopColor,
          background: style.backgroundColor,
          color: style.color,
        };
      }),
    );
    for (const button of appearance) {
      expect(button).toEqual({
        height: '34px',
        padding: '0px 14px',
        borderRadius: '8px',
        borderColor: 'rgb(221, 225, 234)',
        background: 'rgb(255, 255, 255)',
        color: 'rgb(60, 68, 87)',
      });
    }
  });

  test('新增直接使用当前资产类型且 Extension 不提供新增入口', async ({ page }) => {
    await openSecondAssetCatalog(page);

    for (const type of ['Agent', 'Skill', 'Command']) {
      await page.getByRole('button', { name: type, exact: true }).click();
      await page.getByRole('button', { name: '＋ 新增', exact: true }).click();
      await expect(page.getByRole('menu')).toHaveCount(0);
      const dialog = page.getByRole('dialog', { name: `添加 ${type}`, exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
    }

    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    const createButton = page.getByRole('button', { name: '＋ 新增', exact: true });
    await expect(createButton).toBeDisabled();
    await expect(createButton).toHaveAttribute('title', 'Extension 由场景及绑定能力自动生成');
  });

  test('搜索和状态页签在当前资产类型内筛选卡片', async ({ page }) => {
    await openSecondAssetCatalog(page);

    const search = page.getByRole('searchbox', { name: '搜索资产' });
    await search.fill('郑欣');
    await expect(page.locator('.asset-card')).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: '缺陷根因分析 Agent', exact: true }),
    ).toBeVisible();

    await search.fill('');
    const statusTabs = page.getByRole('navigation', { name: '资产状态' });
    await statusTabs.getByRole('button', { name: '开发中', exact: true }).click();
    await expect(page.getByRole('heading', { name: '交付协同 Agent', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '测试用例评审 Agent', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '流水线异常分析 Agent', exact: true }),
    ).toHaveCount(0);
  });

  test('卡片右下角通过省略号菜单执行详情、编辑和删除操作', async ({ page }, testInfo) => {
    await openSecondAssetCatalog(page);

    const firstCard = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name: '流水线异常分析 Agent', exact: true }),
    });
    const secondCard = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name: '发布风险评估 Agent', exact: true }),
    });
    const firstMore = firstCard.getByRole('button', {
      name: '更多操作：流水线异常分析 Agent',
      exact: true,
    });
    const secondMore = secondCard.getByRole('button', {
      name: '更多操作：发布风险评估 Agent',
      exact: true,
    });

    await expect(firstMore).toBeVisible();
    await expect(firstCard.locator('.asset-card__footer > :last-child')).toHaveAttribute(
      'aria-label',
      '更多操作：流水线异常分析 Agent',
    );
    await firstMore.click();
    const firstMenu = firstCard.getByRole('menu', { name: '流水线异常分析 Agent 操作' });
    await expect(firstMenu).toBeVisible();
    await expect(firstMenu.getByRole('menuitem')).toHaveText(['查看详情', '编辑信息', '删除']);
    await expect
      .poll(() =>
        firstCard.evaluate((element) => {
          const style = getComputedStyle(element);
          return { contentVisibility: style.contentVisibility, overflow: style.overflow };
        }),
      )
      .toEqual({ contentVisibility: 'visible', overflow: 'visible' });
    await page.screenshot({ path: testInfo.outputPath('asset-card-menu.png') });

    await page.keyboard.press('Escape');
    await expect(firstMenu).toBeHidden();
    await firstMore.click();
    await secondMore.click();
    await expect(firstMenu).toBeHidden();
    const secondMenu = secondCard.getByRole('menu', { name: '发布风险评估 Agent 操作' });
    await expect(secondMenu).toBeVisible();
    await page.getByRole('heading', { name: '资产清单', exact: true }).click();
    await expect(secondMenu).toBeHidden();

    await firstMore.click();
    await firstMenu.getByRole('menuitem', { name: '编辑信息', exact: true }).click();
    const editDialog = page.getByRole('dialog', { name: '编辑 Agent', exact: true });
    await expect(editDialog).toBeVisible();
    await expect(page.locator('.asset-detail')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '资产清单', exact: true })).toBeVisible();
    await expect(editDialog.getByRole('textbox', { name: '名称', exact: true })).toHaveValue(
      '流水线异常分析 Agent',
    );
    await editDialog.getByRole('button', { name: '取消', exact: true }).click();

    await firstMore.click();
    await firstMenu.getByRole('menuitem', { name: '删除', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /删除/ })).toBeVisible();
  });

  test('Extension 详情显示当前版本的发布人', async ({ page }) => {
    await openSecondAssetCatalog(page);
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    const extensionCard = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name: '问题分析 Extension', exact: true }),
    });
    await expect(extensionCard.locator('.asset-card__publisher')).toHaveText('李扶摇');
    await expect(extensionCard.locator('.asset-card__publisher')).toHaveAttribute(
      'title',
      '李扶摇',
    );
    await expect(extensionCard.locator('.asset-card__developer')).toHaveCount(0);
    await extensionCard.getByRole('heading', { name: '问题分析 Extension', exact: true }).click();

    const facts = page.locator('.asset-detail__facts.is-extension');
    await expect(facts.getByText('发布人', { exact: true })).toBeVisible();
    await expect(facts.getByText('李扶摇 A0123', { exact: true })).toBeVisible();
    await expect(facts.getByText('开发责任人', { exact: true })).toHaveCount(0);
  });

  test('Extension 卡片省略号菜单不显示发布历史', async ({ page }) => {
    await openSecondAssetCatalog(page);
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    const card = page.locator('.asset-card').filter({
      has: page.getByRole('heading', { name: '问题分析 Extension', exact: true }),
    });

    const more = card.getByRole('button', { name: '更多操作：问题分析 Extension' });
    await expect(more).toBeVisible();
    await more.click();

    const menu = card.getByRole('menu', { name: '问题分析 Extension 操作' });
    await expect(menu.getByRole('menuitem')).toHaveText(['查看详情']);
    await expect(menu.getByRole('menuitem', { name: '发布历史', exact: true })).toHaveCount(0);
  });
});
