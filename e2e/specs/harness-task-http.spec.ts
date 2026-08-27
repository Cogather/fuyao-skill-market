import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('Harness 任务管理 HTTP 详情', () => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http',
    '仅在 VITE_SKILL_MARKET_TRANSPORT=http 时验证真实请求分支',
  );

  test('从 versions 提取版本并调用 Skill 目录与文件接口', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        '__skill_market_parent_context_v1__',
        JSON.stringify({
          type: 'Skill_Square_Init',
          userId: 'w30000001',
          userName: 'HTTP 测试用户',
          departmentList: [],
        }),
      );
    });
    await page.route('**/api/harness/task/command/my**', (route) =>
      route.fulfill({ json: { meta: { success: true, message: 'OK' }, data: [] } }),
    );
    await page.route('**/api/harness/task/skill/my**', (route) =>
      route.fulfill({
        json: {
          meta: { number: 5, message: 'OK', success: true },
          data: [
            {
              id: 'skill-task-http-001',
              skillName: '接口契约检查 Skill',
              status: '进行中',
              versions: [
                { version: '1.9.0', uploadedAt: '2026-08-17 10:30:00' },
                { version: '1.10.0', uploadedAt: '2026-08-14 10:30:00' },
                { version: '1.2.0', uploadedAt: '2026-08-16 10:30:00' },
              ],
            },
            {
              id: 'skill-task-http-002',
              skillName: '无时间版本回退 Skill',
              status: '已完成',
              versions: [{ version: '2.9.0' }, { version: '2.10.0' }],
            },
            {
              id: 'skill-task-http-003',
              skillName: '无可用版本 Skill',
              status: '进行中',
              versions: [],
            },
            {
              id: 'skill-task-http-004',
              skillName: '单版本响应 Skill',
              status: '进行中',
              versions: [
                {
                  version: '0.0.1',
                  uploadedAt: '2026-08-25 19:39:59',
                  mrId: '22',
                  repoUrl: 'https://example.com/skill.git',
                  tagName: null,
                },
              ],
            },
            {
              id: 'skill-task-http-005',
              skillName: '字符串版本响应 Skill',
              status: '进行中',
              versions: JSON.stringify([
                { version: '3.0.1', uploadedAt: '2026-08-26 10:30:00' },
              ]),
            },
          ],
        },
      }),
    );
    let treeRequestCount = 0;
    let fileRequestCount = 0;
    await page.route('**/api/harness/packages/tree**', (route) => {
      treeRequestCount += 1;
      return route.fulfill({
        json: { meta: { success: true, message: 'OK' }, data: ['SKILL.md'] },
      });
    });
    await page.route('**/api/harness/packages/file**', (route) => {
      fileRequestCount += 1;
      const version = new URL(route.request().url()).searchParams.get('componentVersion');
      return route.fulfill({
        json: { meta: { success: true, message: 'OK' }, data: `# HTTP Skill\n\n${version}` },
      });
    });

    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.getByRole('tab', { name: '任务管理', exact: true }).click();
    await page.getByRole('tab', { name: /^Skill待办/ }).click();

    await expect(page.locator('tbody .task-version')).toHaveText([
      '1.9.0',
      '2.10.0',
      '—',
      '0.0.1',
      '3.0.1',
    ]);

    const initialTreeRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/harness/packages/tree') &&
        new URL(request.url()).searchParams.get('componentVersion') === '1.9.0',
    );
    const initialFileRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/harness/packages/file') &&
        new URL(request.url()).searchParams.get('componentVersion') === '1.9.0',
    );
    await page.getByRole('button', { name: '查看 Skill', exact: true }).first().click();
    await Promise.all([initialTreeRequest, initialFileRequest]);

    const dialog = page.getByRole('dialog');
    const versionSelect = dialog.getByLabel('详情版本');
    await expect(versionSelect.locator('option')).toHaveCount(3);
    await expect(versionSelect).toHaveValue('1.9.0');
    await expect(dialog.locator('.task-detail-version-filter__updated > strong')).toHaveText(
      '2026-08-17 10:30:00',
    );
    await expect(dialog.locator('.task-detail-file-content')).toContainText('1.9.0');

    const switchedTreeRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/harness/packages/tree') &&
        new URL(request.url()).searchParams.get('componentVersion') === '1.10.0',
    );
    const switchedFileRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/harness/packages/file') &&
        new URL(request.url()).searchParams.get('componentVersion') === '1.10.0',
    );
    await versionSelect.selectOption('1.10.0');
    await Promise.all([switchedTreeRequest, switchedFileRequest]);
    await expect(dialog.locator('.task-detail-version-filter__updated > strong')).toHaveText(
      '2026-08-14 10:30:00',
    );
    await expect(dialog.locator('.task-detail-file-content')).toContainText('1.10.0');

    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
    await expect(dialog).toBeHidden();
    const treeRequestsBeforeEmptyDetail = treeRequestCount;
    const fileRequestsBeforeEmptyDetail = fileRequestCount;
    const emptyVersionRow = page.getByRole('row', { name: /无可用版本 Skill/ });
    await emptyVersionRow.getByRole('button', { name: '查看 Skill', exact: true }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/is-basic-only/);
    await expect(dialog.locator('.task-detail-version-filter')).toHaveCount(0);
    await expect(dialog.locator('.task-detail-capability')).toHaveCount(0);
    await expect(dialog.locator('footer')).toHaveCount(0);
    await page.waitForTimeout(100);
    expect(treeRequestCount).toBe(treeRequestsBeforeEmptyDetail);
    expect(fileRequestCount).toBe(fileRequestsBeforeEmptyDetail);
  });
});
