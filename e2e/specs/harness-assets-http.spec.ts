import { openHarnessSelect, selectHarnessOption } from '../helpers/selectHarnessOption';
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

  test('统一组件列表支持筛选，并保留详情、Skill 评估与 Extension 发布', async ({
    page,
  }, testInfo) => {
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
    const componentDetailRequests: Request[] = [];
    const publishDetailRequests: Request[] = [];
    const productRequests: Request[] = [];
    const treeRequests: Request[] = [];
    const fileRequests: Request[] = [];
    const evaluationRequests: Request[] = [];
    const organizationRequests: Request[] = [];
    const historyRequests: Request[] = [];
    const extensionPublishRequests: Request[] = [];
    let extensionPublishing = false;
    let failNextScriptRequest = true;
    let historicalSnapshotAvailable = false;

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
              status: '待发布',
              category: '产品级/harness-pipeline',
              updatedAt: '2026-03-24 10:00:00',
              firstScene: body.type === 'EXTENSION' ? '开发' : null,
              secondScene: body.type === 'EXTENSION' ? '构建诊断' : null,
              canPublish: true,
            },
            ...(body.type === 'EXTENSION'
              ? [
                  {
                    name: 'harness-pipeline-denied-extension',
                    description: '无发布权限的就绪资产',
                    latestVersion: '1.0.0',
                    status: '可发布',
                    category: '产品级/harness-pipeline',
                    updatedAt: '2026-03-24 10:00:00',
                    firstScene: '开发',
                    secondScene: '权限测试',
                    canPublish: false,
                  },
                ]
              : []),
          ],
          total: body.type === 'EXTENSION' ? 2 : 1,
          pageNo: body.pageNo,
          pageSize: body.pageSize,
        }),
      });
    });

    await page.route('**/api/harness/packages/tree**', (route) => {
      treeRequests.push(route.request());
      return route.fulfill({ json: envelope(['SKILL.md', 'scripts/run.sh']) });
    });

    await page.route('**/api/v1/harness/plans/components/detail**', (route) => {
      const request = route.request();
      componentDetailRequests.push(request);
      const query = new URL(request.url()).searchParams;
      const type = query.get('type');
      return route.fulfill({
        json: envelope({
          name: query.get('name'),
          description: '组件详情返回的描述',
          category: '产品级/harness-pipeline',
          ownerName: '张三',
          ownerId: 'u001',
          developerName: type === 'EXTENSION' ? null : '李四',
          developerId: type === 'EXTENSION' ? null : 'u002',
          type,
          firstScene: type === 'EXTENSION' ? '开发' : null,
          secondScene: type === 'EXTENSION' ? '构建诊断' : null,
          versions: [
            {
              version:
                type === 'SKILL'
                  ? '1.10.0'
                  : query.get('name') === 'harness-pipeline-denied-extension'
                    ? '1.0.0'
                    : '0.1',
              uploadedAt: '2026-09-02 12:00:00',
              uploadedBy: 'u002',
            },
            { version: '0.0.9', uploadedAt: null, uploadedBy: 'u001' },
            ...(type === 'EXTENSION'
              ? [{ version: '0.0.8', uploadedAt: null, uploadedBy: 'u001' }]
              : []),
          ],
        }),
      });
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
      if (pathname.endsWith('/extensions/detail') && request.method() === 'POST') {
        publishDetailRequests.push(request);
        return route.fulfill({
          json: envelope({
            firstScene: '开发',
            secondScene: '构建诊断',
            readyStatus: '已就绪',
            publishedExtension: null,
            components: {
              skills: [{ name: 'HTTP 构建诊断 Skill', version: '1.0.0' }],
              commands: [],
              agents: [],
            },
          }),
        });
      }
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
          : [
              {
                id: 'historical-extension',
                version: '0.0.9',
                extensionName: 'harness-pipeline-build-extension',
                firstScene: '开发',
                secondScene: '构建诊断',
                publishStatus: 'success',
                skills: [{ name: 'HTTP 历史诊断 Skill', version: '0.9.0' }],
              },
            ];
        if (historicalSnapshotAvailable) {
          rows.push({
            id: 'newly-available-extension-snapshot',
            version: '0.0.8',
            extensionName: 'harness-pipeline-build-extension',
            firstScene: '开发',
            secondScene: '构建诊断',
            publishStatus: 'success',
            skills: [{ name: 'HTTP 补充快照 Skill', version: '0.8.0' }],
          });
        }
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
    await page.locator('#harness-tab-assets').click();
    await expect(
      page.locator('#harness-panel-assets').getByRole('heading', { name: '资产清单', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: '资产类型' }).getByRole('button')).toHaveText(
      ['Agent', 'Skill', 'Command', 'Extension'],
    );
    await expect(assetCard(page, 'HTTP 发布风险 Agent')).toBeVisible();
    await selectDepartmentPath(page, DEPARTMENT_PATH);

    const productSelect = page.getByLabel('产品筛选');
    await expect(productSelect).toBeVisible();
    await selectHarnessOption(productSelect, 'http-product');
    await page.getByRole('button', { name: 'Skill', exact: true }).click();

    const skillCard = assetCard(page, HTTP_SKILL_NAME);
    await expect(skillCard).toBeVisible();
    await skillCard.click();

    await expect(page.locator('.asset-detail')).toContainText('current version: 1.10.0');
    await expect(page.locator('.asset-detail__description')).toHaveText('组件详情返回的描述');
    await expect(page.locator('.asset-detail__people')).toContainText('张三（u001）');
    await expect(page.locator('.asset-detail__people')).toContainText('李四（u002）');
    await page.getByRole('combobox', { name: '版本', exact: true }).click();
    await expect(page.getByRole('listbox', { name: '可用版本' }).getByRole('option')).toHaveText([
      'v1.10.0',
      'v0.0.9',
    ]);
    await page.getByRole('combobox', { name: '版本', exact: true }).press('Escape');
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

    await page.getByRole('combobox', { name: '版本', exact: true }).click();
    await page.getByRole('option', { name: 'v0.0.9', exact: true }).click();
    await page.getByRole('tab', { name: '内容', exact: true }).click();
    await expect(page.locator('.asset-detail')).toContainText('current version: 0.0.9');

    for (const [type, name] of [
      ['Agent', 'HTTP 发布风险 Agent'],
      ['Command', 'HTTP 接口契约检查 Command'],
    ]) {
      await page.locator('.asset-back').click();
      await page.getByRole('button', { name: type, exact: true }).click();
      await assetCard(page, name!).click();
      await expect(page.locator('.asset-detail__description')).toHaveText('组件详情返回的描述');
      expect(componentDetailRequests.at(-1)!.method()).toBe('GET');
      expect(
        Object.fromEntries(new URL(componentDetailRequests.at(-1)!.url()).searchParams),
      ).toEqual({
        userId: 'http-user-001',
        type: type!.toUpperCase(),
        name,
      });
    }

    await page.locator('.asset-back').click();
    await page.getByRole('button', { name: 'Extension', exact: true }).click();
    const deniedCard = assetCard(page, 'harness-pipeline-denied-extension');
    const deniedPublish = deniedCard.getByRole('button', { name: '发布', exact: true });
    await expect(deniedPublish).toBeVisible();
    await expect(deniedPublish).toBeDisabled();
    await deniedPublish.hover();
    await expect(deniedPublish).toHaveCSS('background-color', 'rgb(229, 231, 235)');
    await deniedCard.getByRole('heading').click();
    await expect(page.locator('.asset-detail__description')).toHaveText('组件详情返回的描述');
    await expect(page.locator('.asset-detail__publish')).toBeVisible();
    await expect(page.locator('.asset-detail__publish')).toBeDisabled();
    await expect(page.locator('.asset-file-tree')).toContainText('current version: 1.0.0');
    expect(publishDetailRequests).toHaveLength(1);
    expect(extensionPublishRequests).toHaveLength(0);
    await page.locator('.asset-back').click();
    const extensionCard = page.locator('.asset-card').filter({
      has: page.locator('.asset-badge.is-type', { hasText: 'Extension' }),
    });
    await expect(extensionCard.first()).toBeVisible();
    await extensionCard.first().click();
    await expect(page.locator('.asset-detail__description')).toHaveText('组件详情返回的描述');
    await expect(page.locator('.asset-detail__people')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '内容', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: '版本记录', exact: true })).toHaveCount(0);
    await expect(page.locator('.asset-version-history')).toHaveCount(0);
    await expect(page.locator('.asset-detail__badges')).not.toContainText('自动生成');
    const extensionVersion = page.getByRole('combobox', { name: '版本', exact: true });
    await expect(page.getByRole('combobox')).toHaveCount(1);
    await extensionVersion.click();
    await expect(page.getByRole('listbox', { name: '可用版本' }).getByRole('option')).toHaveText([
      'v0.1',
      'v0.0.9',
      'v0.0.8',
    ]);
    await extensionVersion.press('Escape');
    await expect(page.locator('.asset-file-tree')).toContainText(
      'skills/HTTP 构建诊断 Skill/SKILL.md',
    );
    await expect(page.locator('.asset-file-tree')).toContainText('current version: 1.0.0');
    const versionDetailRequestCount = publishDetailRequests.length;
    await extensionVersion.click();
    await page.getByRole('option', { name: 'v0.0.9', exact: true }).click();
    await expect(page.locator('.asset-file-tree')).toContainText(
      'skills/HTTP 历史诊断 Skill/SKILL.md',
    );
    await expect(page.locator('.asset-file-tree')).toContainText('current version: 0.9.0');
    await expect(page.locator('.asset-file-tree')).not.toContainText('current version: 1.0.0');
    expect(publishDetailRequests).toHaveLength(versionDetailRequestCount + 1);
    await extensionVersion.click();
    await page.getByRole('option', { name: 'v0.0.8', exact: true }).click();
    await expect(page.locator('.asset-file-tree')).toContainText('该版本暂无文件');
    historicalSnapshotAvailable = true;
    await extensionVersion.click();
    await page.getByRole('option', { name: 'v0.0.9', exact: true }).click();
    await expect(page.getByText('current version: 0.9.0', { exact: false }).first()).toBeVisible();
    await extensionVersion.click();
    await page.getByRole('option', { name: 'v0.0.8', exact: true }).click();
    await expect(page.locator('.asset-file-tree')).toContainText(
      'skills/HTTP 补充快照 Skill/SKILL.md',
    );
    await expect(page.getByText('current version: 0.8.0', { exact: false }).first()).toBeVisible();
    failNextScriptRequest = true;
    await extensionVersion.click();
    await page.getByRole('option', { name: 'v0.1', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('脚本内容加载失败');
    await expect(page.locator('.asset-file-tree')).toHaveCount(0);
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(page.locator('.asset-file-tree')).toContainText('current version: 1.0.0');
    await expect(page.getByRole('combobox')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('extension-content-http.png') });
    expect(componentDetailRequests.at(-1)!.method()).toBe('GET');
    expect(Object.fromEntries(new URL(componentDetailRequests.at(-1)!.url()).searchParams)).toEqual(
      {
        userId: 'http-user-001',
        type: 'EXTENSION',
        name: 'harness-pipeline-build-extension',
      },
    );
    const preparationCount = publishDetailRequests.length;
    expect(historyRequests.length).toBeGreaterThan(0);
    const cardDetailCount = componentDetailRequests.length;
    await page.getByRole('button', { name: '发布', exact: true }).click();

    const publishDialog = page.getByRole('region', { name: /发布 Extension/ });
    await expect(publishDialog.getByLabel(/Extension 名称/)).toHaveValue(
      'harness-pipeline-build-extension',
    );
    await publishDialog.getByLabel(/Extension 描述/).fill('HTTP Extension 发布记录');
    await selectHarnessOption(publishDialog.getByLabel(/发布通道/), 'product');
    const organizationSelect = page.getByRole('combobox', { name: '目标组织' });
    await expect(
      (await openHarnessSelect(organizationSelect)).getByRole('option', { name: 'HTTP 目标组织' }),
    ).toBeAttached();
    expect(componentDetailRequests).toHaveLength(cardDetailCount);
    expect(publishDetailRequests).toHaveLength(preparationCount + 1);
    expect(publishDetailRequests.at(-1)!.method()).toBe('POST');
    expect(publishDetailRequests.at(-1)!.postDataJSON()).toEqual({
      dimType: '产品级',
      dimCode: 'http-product',
      dimName: 'harness-pipeline',
      extensionName: 'harness-pipeline-build-extension',
      firstScene: '开发',
      secondScene: '构建诊断',
    });
    await selectHarnessOption(organizationSelect, 'org-http-target');
    await page.getByRole('button', { name: '确认发布' }).click();

    await expect(publishDialog).toBeHidden();
    const historyDialog = page.getByRole('region', { name: /发布历史/ });
    await expect(historyDialog.locator('.timeline-item').first()).toContainText('HTTP 目标组织');

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
