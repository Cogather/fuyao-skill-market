import type { Locator, Page, Request } from '@playwright/test';

import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const DEPARTMENT_PATH = ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组'];
const HTTP_SKILL_NAME = 'HTTP 发布风险扫描 Skill';

function envelope<T>(data: T): { meta: { success: true; message: string }; data: T } {
  return { meta: { success: true, message: 'OK' }, data };
}

function assetCard(page: Page, name: string): Locator {
  return page.locator('.asset-card').filter({
    has: page.getByRole('heading', { name, exact: true }),
  });
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

test.describe('Agent / Skill 资产 HTTP 统一列表', () => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http',
    '仅在 VITE_SKILL_MARKET_TRANSPORT=http 时验证真实请求分支',
  );

  test('统一组件列表支持筛选，并保留详情、Skill 评估与 Extension 发布', async ({ page }) => {
    await page.addInitScript(
      ({ departmentPath }) => {
        window.sessionStorage.setItem(
          '__skill_market_parent_context_v1__',
          JSON.stringify({
            type: 'Skill_Square_Init',
            userId: 'http-user-001',
            userName: 'HTTP 测试用户',
            departmentList: [
              {
                deptId: 'dept-root',
                deptCode: 'dept-root',
                deptName: departmentPath[0],
                deptLevel: 1,
                children: [
                  {
                    deptId: 'dept-product-line',
                    deptCode: 'dept-product-line',
                    deptName: departmentPath[1],
                    deptLevel: 2,
                    children: [
                      {
                        deptId: 'dept-platform-tools',
                        deptCode: 'dept-platform-tools',
                        deptName: departmentPath[2],
                        deptLevel: 3,
                        children: [
                          {
                            deptId: 'dept-devops',
                            deptCode: 'dept-devops',
                            deptName: departmentPath[3],
                            deptLevel: 4,
                            children: [
                              {
                                deptId: 'dept-continuous',
                                deptCode: 'dept-continuous',
                                deptName: departmentPath[4],
                                deptLevel: 5,
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        );
      },
      { departmentPath: DEPARTMENT_PATH },
    );

    const componentRequests: Request[] = [];
    const productRequests: Request[] = [];
    const treeRequests: Request[] = [];
    const fileRequests: Request[] = [];
    const evaluationRequests: Request[] = [];
    const organizationRequests: Request[] = [];
    const historyRequests: Request[] = [];
    const extensionPublishRequests: Request[] = [];
    let extensionPublishing = false;
    let failNextScriptRequest = true;

    await page.route('**/api/harness/permission/user-depts**', (route) =>
      route.fulfill({
        json: envelope({
          ownedOrgs: [
            {
              deptName: '持续交付组',
              deptCode: 'dept-continuous',
              path: DEPARTMENT_PATH,
              levelNo: 5,
            },
          ],
          adminOrgs: [],
        }),
      }),
    );

    await page.route('**/api/harness/smapi-product-by-dept**', (route) => {
      productRequests.push(route.request());
      return route.fulfill({
        json: envelope([
          {
            offeringId: 'http-product',
            offeringName: 'harness-pipeline',
            planningDeptName: '持续交付组',
          },
        ]),
      });
    });

    await page.route('**/api/v1/harness/plans/components/query', (route) => {
      componentRequests.push(route.request());
      const body = route.request().postDataJSON();
      const names: Record<string, string> = {
        AGENT: 'HTTP 发布风险 Agent',
        SKILL: HTTP_SKILL_NAME,
        COMMAND: 'HTTP 接口契约检查 Command',
        EXTENSION: 'harness-pipeline-build-extension',
      };
      return route.fulfill({
        json: envelope({
          records: [
            {
              name: names[body.type],
              description: '统一组件列表返回的资产',
              latestVersion: body.type === 'SKILL' ? '1.10.0' : '0.1',
              status: '可发布',
              category: '产品级/harness-pipeline',
              updatedAt: '2026-03-24 10:00:00',
            },
          ],
          total: 1,
          pageNo: body.pageNo,
          pageSize: body.pageSize,
        }),
      });
    });

    await page.route('**/api/harness/packages/tree**', (route) => {
      treeRequests.push(route.request());
      return route.fulfill({ json: envelope(['SKILL.md', 'scripts/run.sh']) });
    });

    await page.route('**/api/harness/packages/file**', (route) => {
      fileRequests.push(route.request());
      const query = new URL(route.request().url()).searchParams;
      if (query.get('filePath') === 'scripts/run.sh' && failNextScriptRequest) {
        failNextScriptRequest = false;
        return route.fulfill({
          json: { meta: { success: false, message: '脚本内容加载失败' }, data: null },
        });
      }
      return route.fulfill({
        json: envelope({
          content: `# ${HTTP_SKILL_NAME}\n\ncurrent version: ${query.get('componentVersion')}`,
        }),
      });
    });

    await page.route('**/api/v1/harness/plans/skill/eval**', (route) => {
      evaluationRequests.push(route.request());
      return route.fulfill({
        json: envelope({
          skillName: HTTP_SKILL_NAME,
          version: '1.10.0',
          total: 94,
          max: 100,
          percent: 94,
          grade: 'A',
          dimensions: [
            { id: 'security', name: '安全扫描', score: 97, max: 100 },
            { id: 'tests', name: '单元测试覆盖率', score: 91, max: 100 },
          ],
        }),
      });
    });

    await page.route('**/api/harness/scene-activity/scene**', (route) =>
      route.fulfill({
        json: envelope([{ firstScene: '开发', secondScene: '构建诊断' }]),
      }),
    );

    await page.route('**/api/harness/scenes/bindings**', (route) =>
      route.fulfill({
        json: envelope([
          {
            firstScene: '开发',
            secondScenes: [
              {
                secondScene: '构建诊断',
                publishable: true,
                publishedExtension: { extensionName: 'harness-pipeline-build-extension' },
                components: {
                  skills: [
                    {
                      id: 'http-extension-skill',
                      name: 'HTTP 构建诊断 Skill',
                      version: '1.0.0',
                      ready: true,
                    },
                  ],
                  commands: [],
                  agents: [],
                },
              },
            ],
          },
        ]),
      }),
    );

    await page.route('**/api/harness/extensions**', (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith('/extensions/orgs') && request.method() === 'GET') {
        organizationRequests.push(request);
        return route.fulfill({
          json: envelope([
            {
              orgCode: 'org-http-target',
              orgName: 'HTTP 目标组织',
              deptId: 'dept-continuous',
              deptName: '持续交付组',
            },
          ]),
        });
      }
      if (pathname.endsWith('/extensions/history') && request.method() === 'POST') {
        historyRequests.push(request);
        const rows = extensionPublishing
          ? [
              {
                id: 'http-extension-release-001',
                version: '0.1',
                extensionName: 'harness-pipeline-build-extension',
                description: 'HTTP Extension 发布记录',
                releaseType: 'product',
                operatorId: 'http-user-001',
                operatorName: 'HTTP 测试用户',
                publishedAt: '2026-09-06 08:30:00',
                publishStatus: 'processing',
                targetOrgName: 'HTTP 目标组织',
                firstScene: '开发',
                secondScene: '构建诊断',
                skills: [{ name: 'HTTP 构建诊断 Skill', version: '1.0.0' }],
              },
            ]
          : [];
        return route.fulfill({ json: envelope({ list: rows, total: rows.length }) });
      }
      if (pathname.endsWith('/extensions') && request.method() === 'POST') {
        extensionPublishRequests.push(request);
        extensionPublishing = true;
        return route.fulfill({ json: envelope({ id: 'http-extension-release-001' }) });
      }
      return route.fulfill({ status: 404, json: { message: `Unexpected request: ${pathname}` } });
    });

    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.getByRole('tab', { name: 'Agent / Skill 资产' }).click();
    await expect(page.getByRole('heading', { name: '资产清单' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '资产类型' }).getByRole('button')).toHaveText(
      ['Agent', 'Skill', 'Command', 'Extension'],
    );
    await expect(assetCard(page, 'HTTP 发布风险 Agent')).toBeVisible();
    await selectDepartmentPath(page, DEPARTMENT_PATH);

    const productSelect = page.getByLabel('产品筛选');
    await expect(productSelect).toBeVisible();
    await productSelect.selectOption('http-product');
    await page.getByRole('button', { name: 'Skill', exact: true }).click();

    const skillCard = assetCard(page, HTTP_SKILL_NAME);
    await expect(skillCard).toBeVisible();
    await skillCard.click();

    await expect(page.locator('.asset-detail')).toContainText('current version: 1.10.0');
    expect(fileRequests).toHaveLength(1);
    const runScript = page.locator('.asset-detail').getByRole('button', { name: 'scripts/run.sh' });
    await expect(runScript).toHaveAttribute('aria-expanded', 'false');
    await runScript.click();
    await expect(runScript).toHaveAttribute('aria-expanded', 'true');
    const scriptContent = page.locator('.catalog-detail-file-content').nth(1);
    await expect(scriptContent).toContainText('脚本内容加载失败');
    expect(fileRequests).toHaveLength(2);
    expect(new URL(fileRequests[1]!.url()).searchParams.get('filePath')).toBe('scripts/run.sh');
    await scriptContent.getByRole('button', { name: '重试', exact: true }).click();
    await expect(scriptContent.locator('pre')).toContainText('current version: 1.10.0');
    expect(fileRequests).toHaveLength(3);
    await runScript.click();
    await runScript.click();
    expect(fileRequests).toHaveLength(3);

    await page.getByRole('tab', { name: '质量报告' }).click();
    const report = page.getByRole('tabpanel', { name: '质量报告' });
    await expect(report.locator('.catalog-evaluation-score-ring strong')).toHaveText('94');
    await expect(report.locator('.catalog-evaluation-dimensions article')).toHaveCount(2);
    await expect(report).toContainText('安全扫描');

    expect(productRequests.length).toBeGreaterThan(0);
    expect(componentRequests.every((request) => request.method() === 'POST')).toBe(true);
    expect(componentRequests[0]!.postDataJSON()).toEqual({
      userId: 'http-user-001',
      deptCode: 'dept-continuous',
      type: 'AGENT',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      pageNo: 1,
      pageSize: 30,
    });
    expect(componentRequests.at(-1)!.postDataJSON()).toEqual({
      userId: 'http-user-001',
      deptCode: 'dept-continuous',
      productCode: 'http-product',
      type: 'SKILL',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      pageNo: 1,
      pageSize: 30,
    });
    expect(treeRequests).toHaveLength(1);
    expect(fileRequests.length).toBeGreaterThan(0);
    expect(evaluationRequests).toHaveLength(1);

    const treeQuery = new URL(treeRequests[0]!.url()).searchParams;
    expect(treeQuery.get('componentType')).toBe('skill');
    expect(treeQuery.get('componentName')).toBe(HTTP_SKILL_NAME);
    expect(treeQuery.get('componentVersion')).toBe('1.10.0');
    const evaluationQuery = new URL(evaluationRequests[0]!.url()).searchParams;
    expect(evaluationQuery.get('skillName')).toBe(HTTP_SKILL_NAME);
    expect(evaluationQuery.get('version')).toBe('1.10.0');

    await page.locator('.asset-back').click();
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    const extensionCard = page.locator('.asset-card').filter({
      has: page.locator('.asset-badge.is-type', { hasText: 'Extension' }),
    });
    await expect(extensionCard.first()).toBeVisible();
    await extensionCard.first().getByRole('button', { name: '发布', exact: true }).click();

    const organizationSelect = page.getByRole('combobox', { name: '目标组织' });
    await expect(organizationSelect.getByRole('option', { name: 'HTTP 目标组织' })).toBeAttached();
    await organizationSelect.selectOption('org-http-target');
    await page.getByRole('button', { name: '确认发布' }).click();

    await expect(page.getByRole('button', { name: '发布历史' })).toHaveClass(/is-active/);
    await expect(page.locator('.asset-history__item').first()).toContainText('HTTP 目标组织');

    expect(organizationRequests.length).toBeGreaterThan(0);
    expect(historyRequests.length).toBeGreaterThan(0);
    expect(extensionPublishRequests).toHaveLength(1);

    const organizationQuery = new URL(organizationRequests.at(-1)!.url()).searchParams;
    expect(organizationQuery.get('userId')).toBe('http-user-001');
    expect(organizationQuery.get('dimCode')).toBe('http-product');
    const historyBody = historyRequests.at(-1)!.postDataJSON() as Record<string, unknown>;
    expect(historyBody.dimType).toBe('产品级');
    expect(historyBody.dimCode).toBe('http-product');
    expect(historyBody.dimName).toBe('harness-pipeline');
    const publishRequest = extensionPublishRequests[0]!;
    const publishQuery = new URL(publishRequest.url()).searchParams;
    expect(publishQuery.get('userId')).toBe('http-user-001');
    expect(publishQuery.get('dimCode')).toBe('http-product');
    const publishBody = publishRequest.postDataJSON() as Record<string, unknown>;
    const extensionName = String(publishBody.extensionName ?? '');
    expect(extensionName).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(extensionName).toMatch(/^harness-pipeline-/);
    expect(publishBody).toMatchObject({
      releaseType: 'product',
      firstScene: '开发',
      secondScene: '构建诊断',
      targetOrgCode: 'org-http-target',
      targetOrgName: 'HTTP 目标组织',
      skills: [{ name: 'HTTP 构建诊断 Skill', version: '1.0.0' }],
    });
  });
});
