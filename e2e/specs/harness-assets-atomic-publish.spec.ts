import type { Locator, Page } from '@playwright/test';

import { clickAssetCardAction, openAssetCardMenu } from '../helpers/assetCardActions';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const envelope = (data: unknown) => ({ meta: { success: true, message: 'OK' }, data });

type CapturedAtomicRequests = {
  organizations: Request[];
  publishes: Request[];
  histories: Request[];
  retries: Request[];
  packageTrees: Request[];
  packageFiles: Request[];
};

function assetCard(page: Page, name: string): Locator {
  return page.locator('.asset-card').filter({
    has: page.getByRole('heading', { name, exact: true }),
  });
}

async function prepareAtomicAssets(
  page: Page,
  captured: CapturedAtomicRequests = {
    organizations: [],
    publishes: [],
    histories: [],
    retries: [],
    packageTrees: [],
    packageFiles: [],
  },
): Promise<CapturedAtomicRequests> {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      '__skill_market_parent_context_v1__',
      JSON.stringify({
        type: 'Skill_Square_Init',
        userId: 'publish-user',
        userName: '发布测试用户',
        departmentList: [
          {
            deptId: 'dept-root',
            deptCode: 'dept-root',
            deptName: '研发部',
            deptLevel: 1,
          },
        ],
      }),
    );
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.fallback();

    let data: unknown = [];
    if (path.endsWith('/permission/user-depts')) {
      data = {
        ownedOrgs: [{ deptName: '研发部', deptCode: 'dept-root', path: ['研发部'], levelNo: 1 }],
        adminOrgs: [],
      };
    } else if (path.endsWith('/smapi-product-by-dept')) {
      data = [{ offeringId: 'product-1', offeringName: '交付平台' }];
    } else if (path.endsWith('/components/query')) {
      const body = request.postDataJSON() as { type: 'AGENT' | 'SKILL' | 'COMMAND' };
      const type = body.type[0] + body.type.slice(1).toLocaleLowerCase('en-US');
      data = {
        records: [
          {
            name: `${type} 可发布资产`,
            description: `${type} 发布说明`,
            latestVersion: 'v1.2.3',
            status: '开发中',
            category: '产品级/交付平台',
            dimType: '产品级',
            dimCode: 'product-1',
            dimName: '交付平台',
            updatedAt: '2026-09-18 09:00:00',
            canPublish: true,
            canEdit: true,
          },
          {
            name: `${type} 无发布权限资产`,
            description: '接口明确禁止发布',
            latestVersion: '1.0.0',
            status: '待发布',
            category: '产品级/交付平台',
            dimType: '产品级',
            dimCode: 'product-1',
            dimName: '交付平台',
            updatedAt: '2026-09-18 09:00:00',
            canPublish: false,
            canEdit: true,
          },
          {
            name: `${type} 未声明权限资产`,
            description: '接口未返回发布权限',
            latestVersion: '0.9.0',
            status: '可发布',
            category: '产品级/交付平台',
            dimType: '产品级',
            dimCode: 'product-1',
            dimName: '交付平台',
            updatedAt: '2026-09-18 09:00:00',
            canEdit: true,
          },
        ],
        total: 3,
        pageNo: body.type ? 1 : 1,
        pageSize: 30,
      };
    } else if (path.endsWith('/extensions/orgs')) {
      captured.organizations.push(request);
      data = [
        { orgCode: 'org-a', orgName: '研发一部' },
        { orgCode: 'org-b', orgName: '研发二部' },
      ];
    } else if (path.endsWith('/assets/publish/history')) {
      captured.histories.push(request);
      data = {
        records: [
          {
            id: 'task-independent',
            publishStatus: '发布失败',
            errorMessage: '签名失败',
            source: '独立发布',
            targetOrgName: '研发一部',
            targetOrgCode: 'org-a',
            operatorName: '发布测试用户',
            operatorId: 'publish-user',
            assetType: 'SKILL',
            assetName: 'Skill 可发布资产',
            assetVersion: 'v1.2.3',
            createdAt: '2026-09-18 10:00:00',
            updatedAt: '2026-09-18 10:01:00',
          },
          {
            id: 'task-extension',
            publishStatus: '发布失败',
            errorMessage: 'Extension 打包失败',
            source: 'Extension发布',
            targetOrgName: '研发一部',
            targetOrgCode: 'org-a',
            operatorName: '发布测试用户',
            operatorId: 'publish-user',
            assetType: 'SKILL',
            assetName: 'Skill 可发布资产',
            assetVersion: 'v1.2.2',
            createdAt: '2026-09-17 10:00:00',
            updatedAt: '2026-09-17 10:01:00',
          },
        ],
        total: 2,
        pageNum: 1,
        pageSize: 20,
      };
    } else if (/\/assets\/publish\/[^/]+\/retry$/.test(path)) {
      captured.retries.push(request);
      data = 'retry-accepted';
    } else if (path.endsWith('/packages/tree')) {
      captured.packageTrees.push(request);
      data = ['SKILL.md', 'references/usage.md'];
    } else if (path.endsWith('/packages/file')) {
      captured.packageFiles.push(request);
      const filePath = new URL(request.url()).searchParams.get('filePath') ?? '';
      data = {
        content:
          filePath === 'SKILL.md'
            ? '# Skill 可发布资产\n\nSkill 文件内容 v1.2.3'
            : '# 使用说明\n\n按需加载的文件内容',
      };
    } else if (path.endsWith('/assets/publish')) {
      captured.publishes.push(request);
      const body = request.postDataJSON() as {
        items: Array<{
          assetType: 'AGENT' | 'SKILL' | 'COMMAND';
          assetName: string;
          assetVersion: string;
        }>;
      };
      data = {
        batchId: 'batch-atomic-1',
        accepted: [{ ...body.items[0], taskId: 'task-independent' }],
        rejected: [
          {
            assetType: body.items[0]!.assetType,
            assetName: '同批次不可发布资产',
            assetVersion: 'v0.1.0',
            reason: '目标组织不匹配',
          },
        ],
      };
    }
    await route.fulfill({ json: envelope(data) });
  });

  await page.goto(
    `${process.env.PW_ATOMIC_PUBLISH_ORIGIN ?? ''}${APP_BASE_PATH}/harness-management`,
  );
  await page.locator('#harness-tab-assets').click();
  return captured;
}

test.describe('Agent / Skill / Command 发布入口', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('严格按 canPublish 显示入口，并进入对应类型的发布页后返回列表', async ({ page }) => {
    await prepareAtomicAssets(page);

    for (const type of ['Agent', 'Skill', 'Command'] as const) {
      await page.getByRole('button', { name: type, exact: true }).click();

      for (const suffix of ['无发布权限资产', '未声明权限资产']) {
        const menu = await openAssetCardMenu(assetCard(page, `${type} ${suffix}`));
        await expect(menu.getByRole('menuitem', { name: '发布', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape');
      }

      const publishableName = `${type} 可发布资产`;
      await clickAssetCardAction(assetCard(page, publishableName), '发布');

      const publishPage = page.getByRole('region', { name: `发布 ${type} · ${publishableName}` });
      await expect(publishPage).toBeVisible();
      // 对齐 Harness 工作流发布页版式：主标题固定为「发布」，类型作为标题行右侧小标签。
      await expect(publishPage.getByRole('heading', { name: '发布', exact: true })).toBeVisible();
      await expect(
        publishPage.getByRole('heading', { name: `${type} 发布信息`, exact: true }),
      ).toBeVisible();
      await expect(publishPage).toContainText(publishableName);
      await expect(publishPage).toContainText('v1.2.3');
      await expect(publishPage).toContainText('交付平台');
      await expect(publishPage).toContainText('包含清单（1 项）');
      await expect(publishPage.getByLabel('发布说明', { exact: true })).toHaveCount(0);
      await expect(publishPage.getByText('归属范围', { exact: true })).toHaveCount(0);
      await expect(publishPage.getByText('当前状态', { exact: true })).toHaveCount(0);

      await publishPage.getByRole('button', { name: '返回', exact: true }).click();
      await expect(assetCard(page, publishableName)).toBeVisible();
    }
  });

  test('包含清单可展开文件目录并点击文件加载内容', async ({ page }) => {
    const captured = await prepareAtomicAssets(page);
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await clickAssetCardAction(assetCard(page, 'Skill 可发布资产'), '发布');

    const publishPage = page.getByRole('region', { name: '发布 Skill · Skill 可发布资产' });
    const checklistRow = publishPage.locator('.atomic-publish__checklist-row');
    await expect(checklistRow).toContainText('Skill 可发布资产');
    await expect(checklistRow).toHaveAttribute('aria-expanded', 'false');
    // 包含清单不再显示 skills/ 这类文件夹类型行；清单行保留适中左内边距，箭头不贴边。
    await expect(publishPage.locator('.atomic-publish__folder-heading')).toHaveCount(0);
    await expect(publishPage.locator('.atomic-publish__folder-caret')).toHaveCount(0);
    await expect(checklistRow).toHaveCSS('padding-left', '10px');
    // 箭头必须是固定尺寸 SVG 图标：文字字形 › 的墨迹贴基线，居中后会整体偏低。
    await expect(publishPage.locator('.atomic-publish__checklist-caret svg')).toHaveCount(1);

    await checklistRow.click();
    await expect.poll(() => captured.packageTrees.length).toBe(1);
    expect(Object.fromEntries(new URL(captured.packageTrees[0]!.url()).searchParams)).toEqual({
      userId: 'publish-user',
      componentType: 'skill',
      componentName: 'Skill 可发布资产',
      componentVersion: '1.2.3',
    });

    // 首个文件默认展开并加载内容
    const firstFileRow = publishPage.locator('.atomic-publish__file-row').first();
    await expect(firstFileRow).toContainText('SKILL.md');
    await expect.poll(() => captured.packageFiles.length).toBe(1);
    expect(Object.fromEntries(new URL(captured.packageFiles[0]!.url()).searchParams)).toEqual({
      userId: 'publish-user',
      componentType: 'skill',
      componentName: 'Skill 可发布资产',
      componentVersion: '1.2.3',
      filePath: 'SKILL.md',
    });
    await expect(publishPage.locator('.atomic-publish__file-content pre').first()).toContainText(
      'Skill 文件内容',
    );

    // 点击另一个文件按需加载其内容
    await publishPage
      .locator('.atomic-publish__file-row')
      .filter({ hasText: 'references/usage.md' })
      .click();
    await expect.poll(() => captured.packageFiles.length).toBe(2);
    expect(Object.fromEntries(new URL(captured.packageFiles[1]!.url()).searchParams)).toEqual({
      userId: 'publish-user',
      componentType: 'skill',
      componentName: 'Skill 可发布资产',
      componentVersion: '1.2.3',
      filePath: 'references/usage.md',
    });
    await expect(publishPage.locator('.atomic-publish__file-content pre').last()).toContainText(
      '使用说明',
    );
  });

  test('Command 进入发布页自动展开包含清单并直接拉取文件内容', async ({ page }) => {
    const captured = await prepareAtomicAssets(page);
    await page.getByRole('button', { name: 'Command', exact: true }).click();
    await clickAssetCardAction(assetCard(page, 'Command 可发布资产'), '发布');

    const publishPage = page.getByRole('region', {
      name: '发布 Command · Command 可发布资产',
    });
    const checklistRow = publishPage.locator('.atomic-publish__checklist-row');
    // 进入发布页后「包含清单」自动展开，无需用户手动点击清单行。
    await expect(checklistRow).toHaveAttribute('aria-expanded', 'true');

    // 不经过 /packages/tree，直接调用 /packages/file 拉取默认文件（名称加 .md）。
    await expect.poll(() => captured.packageFiles.length).toBe(1);
    expect(captured.packageTrees).toHaveLength(0);
    expect(Object.fromEntries(new URL(captured.packageFiles[0]!.url()).searchParams)).toEqual({
      userId: 'publish-user',
      componentType: 'command',
      componentName: 'Command 可发布资产',
      componentVersion: '1.2.3',
      filePath: 'Command 可发布资产.md',
    });
    await expect(publishPage.locator('.atomic-publish__direct-content pre')).toContainText(
      '按需加载的文件内容',
    );

    // 清单行仍可手动收起；再次展开不重复请求文件内容。
    await checklistRow.click();
    await expect(checklistRow).toHaveAttribute('aria-expanded', 'false');
    await expect(publishPage.locator('.atomic-publish__direct-content')).toHaveCount(0);
    await checklistRow.click();
    await expect(checklistRow).toHaveAttribute('aria-expanded', 'true');
    await expect(publishPage.locator('.atomic-publish__direct-content pre')).toContainText(
      '按需加载的文件内容',
    );
    expect(captured.packageFiles).toHaveLength(1);
  });

  test('提交最新版本后展示受理和拒绝结果，按 batchId 查看历史并限制失败重试', async ({ page }) => {
    const captured = await prepareAtomicAssets(page);
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await clickAssetCardAction(assetCard(page, 'Skill 可发布资产'), '发布');

    const publishPage = page.getByRole('region', {
      name: '发布 Skill · Skill 可发布资产',
    });
    await expect(publishPage.getByLabel('目标组织', { exact: true })).toHaveValue('org-a');
    expect(captured.organizations).toHaveLength(1);
    expect(Object.fromEntries(new URL(captured.organizations[0]!.url()).searchParams)).toEqual({
      userId: 'publish-user',
      dimType: '产品级',
      dimCode: 'product-1',
    });

    await publishPage.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(publishPage.getByRole('status', { name: '提交结果' })).toContainText(
      '发布任务已受理',
    );
    await expect(publishPage.getByRole('status', { name: '提交结果' })).toContainText(
      '目标组织不匹配',
    );

    expect(captured.publishes).toHaveLength(1);
    expect(new URL(captured.publishes[0]!.url()).pathname).toBe('/api/harness/assets/publish');
    expect(Object.fromEntries(new URL(captured.publishes[0]!.url()).searchParams)).toEqual({
      userId: 'publish-user',
      userName: '发布测试用户',
    });
    expect(captured.publishes[0]!.postDataJSON()).toEqual({
      items: [
        {
          assetType: 'SKILL',
          assetName: 'Skill 可发布资产',
          assetVersion: 'v1.2.3',
        },
      ],
      orgCode: 'org-a',
    });

    await expect.poll(() => captured.histories.length).toBe(1);
    expect(captured.histories[0]!.postDataJSON()).toEqual({
      batchId: 'batch-atomic-1',
      pageNum: 1,
      pageSize: 20,
    });
    const history = publishPage.getByRole('region', { name: 'Skill 发布记录' });
    await expect(history).toContainText('签名失败');
    await expect(history).toContainText('Extension 打包失败');
    await expect(history.getByRole('button', { name: /重试发布/ })).toHaveCount(1);

    await history.getByRole('button', { name: '重试发布：Skill 可发布资产' }).click();
    await expect.poll(() => captured.retries.length).toBe(1);
    expect(new URL(captured.retries[0]!.url()).pathname).toBe(
      '/api/harness/assets/publish/task-independent/retry',
    );
    expect(Object.fromEntries(new URL(captured.retries[0]!.url()).searchParams)).toEqual({
      userId: 'publish-user',
    });
    await expect.poll(() => captured.histories.length).toBe(2);
  });

  test('详情发布记录按资产类型和名称查询独立历史', async ({ page }) => {
    const captured = await prepareAtomicAssets(page);
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await clickAssetCardAction(assetCard(page, 'Skill 可发布资产'), '查看详情');
    await expect(page.locator('#asset-detail-title')).toHaveText('Skill 可发布资产');

    await page.getByRole('tab', { name: '发布记录', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Skill 发布记录' })).toBeVisible();
    await expect.poll(() => captured.histories.length).toBe(1);
    expect(captured.histories[0]!.postDataJSON()).toEqual({
      assetType: 'SKILL',
      assetName: 'Skill 可发布资产',
      pageNum: 1,
      pageSize: 20,
    });
  });
});
