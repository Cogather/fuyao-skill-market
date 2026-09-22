import type { Page, Request } from '@playwright/test';

import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const SKILL_NAME = 'HTTP 行为评测 Skill';
const DEPARTMENT_PATH = ['部门1', '平台产品线', '平台工具组', 'DevOps部', '持续交付组'];

function envelope<T>(data: T): { meta: { success: true; message: string }; data: T } {
  return { meta: { success: true, message: 'OK' }, data };
}

async function installUserContext(page: Page): Promise<void> {
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
}

test.describe('Skill 行为评测 HTTP 接口', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('按 mode 独立查询、加载趋势并携带当前用户发起评测', async ({ page }) => {
    await installUserContext(page);
    const behaviorRequests: Request[] = [];
    let qualityWasTriggered = false;

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
    await page.route('**/api/harness/smapi-product-by-dept**', (route) =>
      route.fulfill({ json: envelope([]) }),
    );
    await page.route('**/api/v1/harness/plans/components/query', (route) => {
      const body = route.request().postDataJSON();
      return route.fulfill({
        json: envelope({
          records:
            body.type === 'SKILL'
              ? [
                  {
                    name: SKILL_NAME,
                    description: '用于验证行为评测接口对接',
                    latestVersion: '1.10.0',
                    status: '待发布',
                    category: '部门级/持续交付组',
                    updatedAt: '2026-09-20 12:00:00',
                    canPublish: true,
                    canEdit: true,
                  },
                ]
              : [],
          total: body.type === 'SKILL' ? 1 : 0,
          pageNo: body.pageNo,
          pageSize: body.pageSize,
        }),
      });
    });
    await page.route('**/api/v1/harness/plans/components/detail**', (route) =>
      route.fulfill({
        json: envelope({
          name: SKILL_NAME,
          description: '用于验证行为评测接口对接',
          category: '部门级/持续交付组',
          ownerName: '张三',
          ownerId: 'u001',
          developerName: '李四',
          developerId: 'u002',
          type: 'SKILL',
          firstScene: null,
          secondScene: null,
          versions: [
            { version: '1.10.0', uploadedAt: '2026-09-20 12:00:00', uploadedBy: 'u002' },
            { version: '0.9.0', uploadedAt: '2026-09-18 12:00:00', uploadedBy: 'u002' },
            { version: '0.8.0', uploadedAt: '2026-09-17 12:00:00', uploadedBy: 'u002' },
          ],
        }),
      }),
    );
    await page.route('**/api/harness/packages/tree**', (route) =>
      route.fulfill({ json: envelope(['SKILL.md']) }),
    );
    await page.route('**/api/harness/packages/file**', (route) =>
      route.fulfill({ json: envelope({ content: `# ${SKILL_NAME}` }) }),
    );
    await page.route('**/api/v1/harness/skill-eval/behavior-eval**', (route) => {
      const request = route.request();
      behaviorRequests.push(request);
      const url = new URL(request.url());
      if (url.pathname.endsWith('/trend')) {
        return route.fulfill({
          json: envelope({
            quality: [{ version: '1.10.0', value: 100, evalTime: '2026-09-20 12:00:00' }],
            trigger: [
              { version: '0.7.0', value: 50, evalTime: '2026-09-18 12:00:00' },
              { version: '1.10.0', value: 66.67, evalTime: '2026-09-20 13:00:00' },
            ],
          }),
        });
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        if (body.mode === 'QUALITY') qualityWasTriggered = true;
        return route.fulfill({
          json: envelope({
            taskId: `${String(body.mode).toLowerCase()}-queuing-task`,
            skillName: body.skillName,
            version: body.version,
            mode: body.mode,
            state: 'queuing',
            needGenerate: false,
            existingCaseCount: 1,
          }),
        });
      }
      const mode = url.searchParams.get('mode');
      if (url.searchParams.get('version') === '0.9.0') {
        return route.fulfill({
          json: {
            meta: { success: false, message: '未找到该版本的评测记录' },
            data: null,
          },
        });
      }
      if (url.searchParams.get('version') === '0.8.0') {
        if (mode === 'QUALITY') {
          return route.fulfill({
            json: {
              meta: { success: false, message: '未找到该版本的评测记录' },
              data: null,
            },
          });
        }
        return route.fulfill({
          json: envelope({
            id: 3,
            skillName: SKILL_NAME,
            version: '0.8.0',
            mode: 'TRIGGER',
            creator: 'http-user-001',
            creatorName: 'HTTP 测试用户',
            taskId: 'failed-trigger',
            state: 'failed',
            report: null,
            error: '外部评测服务执行失败',
            createTime: '2026-09-17 13:00:00',
            updateTime: '2026-09-17 13:01:00',
          }),
        });
      }
      return route.fulfill({
        json: envelope({
          id: mode === 'TRIGGER' ? 1 : 2,
          skillName: SKILL_NAME,
          version: '1.10.0',
          mode,
          creator: 'http-user-001',
          creatorName: 'HTTP 测试用户',
          taskId:
            mode === 'QUALITY' && qualityWasTriggered
              ? 'quality-refreshed-task'
              : `completed-${mode?.toLowerCase()}`,
          state: 'completed',
          report:
            mode === 'TRIGGER'
              ? {
                  agent_name: 'CodeAgent',
                  model_name: 'fuyao/GLM4.7',
                  positive_trigger_rate: '1/2',
                  negative_false_trigger_rate: '0/1',
                  accuracy: '66.67%',
                  results: [
                    {
                      case_id: 'T-001',
                      task: '扫描当前发布风险',
                      type: 'positive',
                      expect_trigger: true,
                      actual_trigger: true,
                      passed: true,
                    },
                    {
                      case_id: 'T-002',
                      task: '整理会议纪要',
                      type: 'negative',
                      expect_trigger: false,
                      actual_trigger: false,
                      passed: true,
                    },
                  ],
                }
              : {
                  agent_name: 'CodeAgent',
                  model_name: 'fuyao/GLM4.7',
                  pass_rate: '100.00%',
                  total_cost_time: '3.20s',
                  results: [
                    {
                      case_id: 'Q-001',
                      task: '识别高风险发布项',
                      expect: '列出高风险项',
                      output: '已列出两个高风险项',
                      score: 92,
                      cost_time: 3.2,
                      passed: true,
                      reason: '风险识别准确',
                    },
                  ],
                },
          error: null,
          createTime: '2026-09-20 13:00:00',
          updateTime: '2026-09-20 13:05:00',
        }),
      });
    });

    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.locator('#harness-tab-assets').click();
    await page.getByRole('button', { name: 'Skill', exact: true }).click();
    await page
      .locator('.asset-card')
      .filter({ has: page.getByRole('heading', { name: SKILL_NAME, exact: true }) })
      .click();

    await expect(page.locator('.asset-detail__version')).toBeVisible();
    await expect(page.locator('.asset-detail__version-panel')).toHaveCount(0);
    await page.getByRole('tab', { name: '行为评测' }).click();
    const panel = page.getByRole('tabpanel', { name: '行为评测' });
    await expect(page.locator('.asset-detail__version')).toHaveCount(0);
    await expect(page.locator('.asset-detail__version-panel')).toHaveCount(0);
    await expect
      .poll(
        () =>
          behaviorRequests.filter(
            (request) =>
              request.method() === 'GET' && !new URL(request.url()).pathname.endsWith('/trend'),
          ).length,
      )
      .toBe(2);
    const queryModes = behaviorRequests
      .filter((request) => request.method() === 'GET')
      .map((request) => new URL(request.url()))
      .filter((url) => !url.pathname.endsWith('/trend'))
      .map((url) => ({
        skillName: url.searchParams.get('skillName'),
        version: url.searchParams.get('version'),
        mode: url.searchParams.get('mode'),
      }));
    expect(queryModes).toEqual([
      { skillName: SKILL_NAME, version: '1.10.0', mode: 'TRIGGER' },
      { skillName: SKILL_NAME, version: '1.10.0', mode: 'QUALITY' },
    ]);

    await expect(panel.getByText('触发结果构成', { exact: true })).toBeVisible();
    await expect(panel.getByText('66.67', { exact: true }).first()).toBeVisible();
    const versionSelect = panel.getByRole('combobox', { name: '版本', exact: true });
    await versionSelect.click();
    await expect(page.getByRole('option', { name: '1.10.0 已评测', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '0.9.0 未评测', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '0.8.0 未评测', exact: true })).toBeVisible();
    await versionSelect.press('Escape');
    await panel.getByRole('tab', { name: '质量评测' }).click();
    await expect(panel.getByText('3.20s', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: /展开用例 Q-001/ }).click();
    await expect(panel.getByText('风险识别准确', { exact: true })).toBeVisible();

    await panel.getByRole('button', { name: '版本趋势', exact: true }).click();
    const trendDialog = page.getByRole('dialog', { name: '版本通过率趋势' });
    await expect(trendDialog.getByText('触发评测准确率', { exact: true })).toBeVisible();
    await expect(trendDialog.getByText(/v0\.7\.0/).first()).toBeVisible();
    await trendDialog.getByRole('button', { name: '关闭版本趋势弹窗' }).click();
    expect(
      behaviorRequests.filter((request) => new URL(request.url()).pathname.endsWith('/trend')),
    ).toHaveLength(1);

    await panel.getByRole('button', { name: '发起评测', exact: true }).click();
    const triggerDialog = page.getByRole('dialog', { name: '发起行为评测' });
    await triggerDialog.getByRole('checkbox', { name: /检验输出质量/ }).check();
    await triggerDialog.getByRole('button', { name: '触发', exact: true }).click();
    await expect(panel.getByText('质量评测进行中', { exact: true })).toBeVisible();

    await panel.getByRole('button', { name: '发起评测', exact: true }).click();
    const duplicateDialog = page.getByRole('dialog', { name: '发起行为评测' });
    await expect(duplicateDialog.getByRole('checkbox', { name: /检验输出质量/ })).toBeDisabled();
    await expect(duplicateDialog.getByRole('checkbox', { name: /检验触发准确性/ })).toBeEnabled();
    await duplicateDialog.getByRole('button', { name: '取消', exact: true }).click();

    const qualityQueryCountBeforeRefresh = behaviorRequests.filter((request) => {
      const url = new URL(request.url());
      return request.method() === 'GET' && url.searchParams.get('mode') === 'QUALITY';
    }).length;
    await panel
      .locator('.behavior-state.is-running')
      .getByRole('button', { name: '刷新状态' })
      .click();
    await expect(panel.getByText('3.20s', { exact: true })).toBeVisible();
    await expect
      .poll(
        () =>
          behaviorRequests.filter((request) => {
            const url = new URL(request.url());
            return request.method() === 'GET' && url.searchParams.get('mode') === 'QUALITY';
          }).length,
      )
      .toBe(qualityQueryCountBeforeRefresh + 1);

    const post = behaviorRequests.find((request) => request.method() === 'POST');
    expect(post?.postDataJSON()).toEqual({
      skillName: SKILL_NAME,
      version: '1.10.0',
      mode: 'QUALITY',
      userId: 'http-user-001',
      userName: 'HTTP 测试用户',
    });
    const trend = behaviorRequests.find((request) =>
      new URL(request.url()).pathname.endsWith('/trend'),
    );
    expect(new URL(trend!.url()).searchParams.get('skillName')).toBe(SKILL_NAME);

    await versionSelect.click();
    await page.getByRole('option', { name: '0.9.0 未评测', exact: true }).click();
    await expect(panel.getByText('当前版本暂无触发评测数据', { exact: true })).toBeVisible();

    await versionSelect.click();
    await page.getByRole('option', { name: /^0\.8\.0 / }).click();
    await expect(panel.getByText('触发评测失败', { exact: true })).toBeVisible();
    await expect(panel.getByText('外部评测服务执行失败', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '重新发起', exact: true }).click();
    const retryDialog = page.getByRole('dialog', { name: '发起行为评测' });
    await expect(retryDialog.getByRole('checkbox', { name: /检验触发准确性/ })).toBeEnabled();
    await retryDialog.getByRole('button', { name: '取消', exact: true }).click();
  });
});
