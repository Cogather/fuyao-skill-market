import type { Locator, Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const envelope = (data: unknown) => ({ meta: { success: true }, data });

async function prepareAssets(page: Page) {
  const imports: Request[] = [];
  const exports: Request[] = [];
  const lists: Request[] = [];
  const catalogQueries: Request[] = [];
  await page.addInitScript(() => {
    const openedUrls: string[] = [];
    Object.assign(window, { __assetDownloadUrls: openedUrls });
    window.open = (url) => {
      openedUrls.push(String(url));
      return null;
    };
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'import-user',
        userName: '导入测试用户',
        departmentList: [
          {
            deptId: 'dept-root',
            deptCode: 'dept-root',
            deptName: '研发部',
            deptLevel: 1,
            children: [
              { deptId: 'dept-a', deptCode: 'dept-a', deptName: '团队A', deptLevel: 2 },
              { deptId: 'dept-b', deptCode: 'dept-b', deptName: '团队B', deptLevel: 2 },
            ],
          },
        ],
      }),
    );
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    let data: unknown = [];
    if (url.pathname.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    } else if (url.pathname.endsWith('/smapi-product-by-dept')) {
      data =
        url.searchParams.get('deptCode') === 'dept-b'
          ? [{ offeringId: 'b-target', offeringName: 'target-product' }]
          : [{ offeringId: 'list-product', offeringName: 'list-product' }];
    } else if (url.pathname.endsWith('/components/query')) {
      lists.push(request);
      data = {
        records: [{ name: 'existing-asset', latestVersion: '1.0.0', status: '可发布' }],
        total: 1,
        pageNo: 1,
        pageSize: 30,
      };
    } else if (url.pathname.endsWith('/management/import')) {
      imports.push(request);
      data = { successCount: 2, failCount: 0 };
    } else if (url.pathname.endsWith('/management/export')) {
      exports.push(request);
      data = `https://downloads.example.test${url.pathname}.xlsx`;
    } else if (url.pathname.endsWith('/management/query')) {
      catalogQueries.push(request);
    }
    await route.fulfill({ json: envelope(data) });
  });
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.getByRole('tab', { name: 'Agent / Skill 资产' }).click();
  await page.getByLabel('产品筛选').selectOption('list-product');
  await expect(page.locator('.asset-card')).toHaveCount(1);
  return { imports, exports, lists, catalogQueries };
}

async function openImport(page: Page, type: string) {
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `导入 ${type}`, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function selectTargetDepartment(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: '导入资产部门', exact: true }).click();
  const panel = page.getByRole('listbox');
  await panel
    .locator('.market-dept-cascader-col')
    .nth(0)
    .getByRole('option')
    .filter({ hasText: '研发部' })
    .click();
  await panel
    .locator('.market-dept-cascader-col')
    .nth(1)
    .getByRole('option')
    .filter({ hasText: '团队B' })
    .click();
  await panel.getByRole('button', { name: '完成', exact: true }).click();
  await expect(panel).toBeHidden();
}

test.describe('资产页导入弹窗 HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  for (const type of ['Agent', 'Skill', 'Command']) {
    for (const level of ['产品级', '部门级']) {
      test(`${type} ${level} 下载已有数据使用弹窗归属，不要求上传文件`, async ({
        page,
      }, testInfo) => {
        const { exports, imports, lists, catalogQueries } = await prepareAssets(page);
        const originalQuery = lists.at(-1)!.postDataJSON();
        const dialog = await openImport(page, type);
        await dialog.getByLabel('层级').selectOption(level);
        await selectTargetDepartment(page, dialog);
        if (level === '产品级') {
          await dialog.getByLabel('产品', { exact: true }).selectOption('target-product');
        }
        const download = dialog
          .locator('header')
          .getByRole('button', { name: '下载已有数据', exact: true });
        await expect(download).toBeEnabled();
        await expect(dialog.getByRole('button', { name: '开始导入', exact: true })).toBeDisabled();
        if (type === 'Skill' && level === '产品级') {
          await dialog.screenshot({ path: testInfo.outputPath('import-download-data.png') });
        }
        await download.click();
        await expect.poll(() => exports.length).toBe(1);
        const request = exports[0]!;
        const path = `/api/harness/${type.toLowerCase()}s/management/export`;
        expect(request.method()).toBe('GET');
        expect(new URL(request.url()).pathname).toBe(path);
        expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual({
          userId: 'import-user',
          dimType: level,
          dimCode: level === '产品级' ? 'b-target' : 'dept-b',
          dimName: level === '产品级' ? 'target-product' : '团队B',
        });
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as { __assetDownloadUrls: string[] }).__assetDownloadUrls,
            ),
          )
          .toEqual([`https://downloads.example.test${path}.xlsx`]);
        expect(imports).toHaveLength(0);
        expect(catalogQueries).toHaveLength(0);
        expect(lists.at(-1)!.postDataJSON()).toEqual(originalQuery);
        await expect(page.getByLabel('产品筛选')).toHaveValue('list-product');
        await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
        await expect(dialog).toBeVisible();
      });

      test(`${type} ${level} 在当前页确认导入，dim 取弹窗选择`, async ({ page }, testInfo) => {
        const { imports, lists, catalogQueries } = await prepareAssets(page);
        const originalQuery = lists.at(-1)!.postDataJSON();
        let chooserCount = 0;
        page.on('filechooser', () => chooserCount++);
        const dialog = await openImport(page, type);
        expect(chooserCount).toBe(0);
        await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#harness-panel-capabilities')).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: '开始导入', exact: true })).toBeDisabled();
        await dialog.getByLabel('层级').selectOption(level);
        await selectTargetDepartment(page, dialog);
        if (level === '产品级') {
          await dialog.getByLabel('产品', { exact: true }).selectOption('target-product');
          const chooserPromise = page.waitForEvent('filechooser');
          await dialog.getByRole('button', { name: '选择文件', exact: true }).click();
          await (
            await chooserPromise
          ).setFiles({
            name: 'assets.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from('test workbook'),
          });
        } else {
          const files = await page.evaluateHandle(() => {
            const transfer = new DataTransfer();
            transfer.items.add(
              new File(['test workbook'], 'assets.xls', { type: 'application/vnd.ms-excel' }),
            );
            return transfer;
          });
          await dialog
            .locator('.catalog-import-dropzone')
            .dispatchEvent('drop', { dataTransfer: files });
          await files.dispose();
        }
        await expect(
          dialog.getByText(level === '产品级' ? 'assets.xlsx' : 'assets.xls', { exact: true }),
        ).toBeVisible();
        expect(imports).toHaveLength(0);
        if (type === 'Agent' && level === '产品级')
          await dialog.screenshot({ path: testInfo.outputPath('import-dialog.png') });
        const listCount = lists.length;
        await dialog.getByRole('button', { name: '开始导入', exact: true }).click();
        await expect(dialog.getByRole('status')).toContainText('成功 2 条');
        expect(imports).toHaveLength(1);
        const request = imports[0]!;
        expect(request.method()).toBe('POST');
        expect(new URL(request.url()).pathname).toBe(
          `/api/harness/${type.toLowerCase()}s/management/import`,
        );
        expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual({
          userId: 'import-user',
          dimType: level,
          dimCode: level === '产品级' ? 'b-target' : 'dept-b',
          dimName: level === '产品级' ? 'target-product' : '团队B',
        });
        expect(request.postDataBuffer()!.toString()).toContain('name="file"; filename="assets.');
        await expect.poll(() => lists.length).toBeGreaterThan(listCount);
        expect(lists.at(-1)!.postDataJSON()).toEqual(originalQuery);
        expect(catalogQueries).toHaveLength(0);
        await expect(page.getByLabel('产品筛选')).toHaveValue('list-product');
        await dialog.getByRole('button', { name: '完成', exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('#harness-tab-assets')).toHaveAttribute('aria-selected', 'true');
      });
    }
  }

  test('文件校验、取消和失败重试不触发额外导入', async ({ page }) => {
    const { imports } = await prepareAssets(page);
    let dialog = await openImport(page, 'Skill');
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') });
    await expect(dialog.getByRole('alert')).toContainText('仅支持');
    await expect(dialog.getByRole('button', { name: '开始导入' })).toBeDisabled();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    expect(imports).toHaveLength(0);
    dialog = await openImport(page, 'Skill');
    await expect(dialog.getByText('bad.txt', { exact: true })).toHaveCount(0);
    await dialog.getByLabel('层级').selectOption('部门级');
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'retry.xlsx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('workbook'),
    });
    let attempts = 0;
    await page.route('**/skills/management/import**', async (route) => {
      attempts++;
      await route.fulfill({
        json:
          attempts === 1
            ? { meta: { success: false, message: '导入服务暂不可用' } }
            : envelope({
                successCount: 1,
                failCount: 1,
                errorList: [{ rowNum: 3, errMsg: '名称重复' }],
              }),
      });
    });
    await dialog.getByRole('button', { name: '开始导入' }).click();
    await expect(dialog.getByRole('alert')).toContainText('导入服务暂不可用');
    await expect(dialog.getByText('retry.xlsx', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '开始导入' }).click();
    await expect(dialog.getByRole('status')).toContainText('成功 1 条，失败 1 条');
    await expect(dialog.getByText('第 3 行：名称重复', { exact: true })).toBeVisible();
    expect(attempts).toBe(2);
  });

  test('下载需完整归属，失败保留文件可重试，处理中阻止重复提交', async ({ page }) => {
    const { imports } = await prepareAssets(page);
    const dialog = await openImport(page, 'Skill');
    const download = dialog.getByRole('button', { name: '下载已有数据', exact: true });
    await dialog.getByLabel('产品', { exact: true }).selectOption('');
    await expect(download).toBeDisabled();
    await dialog.getByLabel('产品', { exact: true }).selectOption('list-product');
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'keep.xlsx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('workbook'),
    });
    let attempts = 0;
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route('**/skills/management/export**', async (route) => {
      attempts++;
      if (attempts === 1) await responseGate;
      await route.fulfill({
        json:
          attempts === 1
            ? { meta: { success: false, message: '导出服务暂不可用' } }
            : attempts === 2
              ? envelope('')
              : envelope('https://downloads.example.test/retry.xlsx'),
      });
    });
    await download.click();
    await expect.poll(() => attempts).toBe(1);
    await expect(dialog.getByRole('button', { name: '下载中…', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('层级')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '开始导入', exact: true })).toBeDisabled();
    releaseResponse();
    await expect(dialog.getByRole('alert')).toContainText('导出服务暂不可用');
    await expect(dialog.getByText('keep.xlsx', { exact: true })).toBeVisible();
    await download.click();
    await expect(dialog.getByRole('alert')).toContainText('未获取到下载链接');
    await download.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __assetDownloadUrls: string[] }).__assetDownloadUrls,
        ),
      )
      .toEqual(['https://downloads.example.test/retry.xlsx']);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByText('keep.xlsx', { exact: true })).toBeVisible();
    expect(attempts).toBe(3);
    expect(imports).toHaveLength(0);
  });
});
