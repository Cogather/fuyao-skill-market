import type { Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

async function prepare(
  page: Page,
  type: string,
  options: {
    rejectFirst?: boolean;
    ambiguous?: boolean;
    delay?: boolean;
    detailCategory?: string;
  } = {},
) {
  const deletes: Request[] = [];
  let deleted = false;
  let rejectNext = options.rejectFirst;
  let releaseDelete: (() => void) | undefined;
  const assetName = `待删除 ${type} 资产`;
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'delete-user',
        userName: '删除测试用户',
        departmentList: [
          { deptId: 'dept-root', deptCode: 'dept-root', deptName: '研发部', deptLevel: 1 },
        ],
      }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    let data: unknown = [];
    if (path.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    } else if (path.endsWith('/smapi-product-by-dept')) {
      data = [{ offeringId: 'list-product', offeringName: '列表产品' }];
    } else if (path.endsWith('/components/query')) {
      data = {
        records: deleted
          ? []
          : [
              {
                id: 'component-not-master-id',
                name: assetName,
                latestVersion: '1.0.0',
                status: '已发布',
                category: '产品级/资产所属产品',
              },
            ],
        total: deleted ? 0 : 1,
        pageNo: 1,
        pageSize: 30,
      };
    } else if (path.endsWith('/components/detail')) {
      data = {
        name: assetName,
        description: '用于删除流程验证的资产',
        category: options.detailCategory ?? '产品级/资产所属产品',
        type: type.toUpperCase(),
        versions: [],
      };
    } else if (path.endsWith('/management/query')) {
      const record = {
        id: `master-${type}`,
        [`${type.toLowerCase()}Name`]: assetName,
        dimType: '产品级',
        dimCode: 'asset-product',
        dimName: '资产所属产品',
      };
      data = [
        { ...record, id: 'other-product-master', dimName: '其他产品' },
        record,
        ...(options.ambiguous ? [{ ...record, id: 'duplicate-master' }] : []),
      ];
    } else if (path.includes('/management/delete/')) {
      deletes.push(request);
      if (options.delay)
        await new Promise<void>((resolve) => {
          releaseDelete = resolve;
        });
      if (rejectNext) {
        rejectNext = false;
        return route.fulfill({
          json: { meta: { success: false, message: '资产已被引用，暂时无法删除' } },
        });
      }
      deleted = true;
    }
    await route.fulfill({ json: { meta: { success: true }, data } });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-assets').click();
  const typeCheckbox = page.getByRole('checkbox', { name: type, exact: true });
  if (await typeCheckbox.count()) {
    // The asset filters can retain multiple selected types.
    for (const label of ['Agent', 'Skill', 'Command', 'Extension']) {
      await page.getByRole('checkbox', { name: label, exact: true }).setChecked(label === type);
    }
  } else {
    await page.getByRole('button', { name: type, exact: true }).click();
  }
  await page.getByRole('heading', { name: assetName, exact: true }).click();
  return { deletes, assetName, release: () => releaseDelete?.() };
}

test.describe('HTTP 资产详情删除', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  for (const type of ['Agent', 'Command', 'Skill']) {
    test(`${type} 确认后使用所属主数据 ID 删除并刷新列表，取消不提交`, async ({
      page,
    }, testInfo) => {
      const { deletes, assetName } = await prepare(page, type);
      const trigger = page.getByRole('button', { name: '删除资产', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: `删除 ${type} 资产` });
      await expect(dialog).toContainText(assetName);
      await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(deletes).toHaveLength(0);
      await trigger.click();
      if (type === 'Agent')
        await dialog.screenshot({ path: testInfo.outputPath('delete-confirm.png') });
      await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('.asset-page > .asset-page__header')).toBeVisible();
      await expect(page.getByRole('heading', { name: assetName, exact: true })).toHaveCount(0);
      await expect(page.locator('.asset-empty')).toContainText('暂无');
      expect(deletes).toHaveLength(1);
      expect(deletes[0].method()).toBe('DELETE');
      const url = new URL(deletes[0].url());
      expect(url.pathname).toBe(
        `/api/harness/${type.toLowerCase()}s/management/delete/master-${type}`,
      );
      expect(Object.fromEntries(url.searchParams)).toEqual({ userId: 'delete-user' });
    });
  }

  test('删除失败保留详情和错误提示，允许重试', async ({ page }) => {
    const { deletes, assetName } = await prepare(page, 'Skill', { rejectFirst: true });
    await page.getByRole('button', { name: '删除资产', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '删除 Skill 资产' });
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('资产已被引用，暂时无法删除');
    await expect(page.getByRole('heading', { name: assetName, exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(deletes).toHaveLength(2);
  });

  test('提交中禁止重复提交和关闭弹窗', async ({ page }) => {
    const { deletes, release } = await prepare(page, 'Command', { delay: true });
    await page.getByRole('button', { name: '删除资产', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '删除 Command 资产' });
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect.poll(() => deletes.length).toBe(1);
    await expect(dialog.getByRole('button', { name: '删除中…', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(deletes).toHaveLength(1);
    release();
    await expect(dialog).toBeHidden();
  });

  test('同归属同名资产无法唯一定位时不发送删除请求', async ({ page }) => {
    const { deletes } = await prepare(page, 'Agent', { ambiguous: true });
    await page.getByRole('button', { name: '删除资产', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '删除 Agent 资产' });
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('多个同名');
    expect(deletes).toHaveLength(0);
  });

  test('Extension 详情不显示删除按钮', async ({ page }) => {
    await prepare(page, 'Extension');
    await expect(page.getByRole('button', { name: '返回列表' })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除资产', exact: true })).toHaveCount(0);
  });

  test('同名详情返回其他归属时阻止删除并提示刷新', async ({ page }) => {
    const { deletes } = await prepare(page, 'Agent', { detailCategory: '产品级/其他产品' });
    await page.getByRole('button', { name: '删除资产', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '删除 Agent 资产' });
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('详情与列表归属不一致');
    expect(deletes).toHaveLength(0);
  });
});
