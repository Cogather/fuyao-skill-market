import { expect, test, type Page, type Request } from '@playwright/test';
import { APP_BASE_PATH } from '../helpers/constants';

const TEST_USER_ID = 'w30000001';
const HTTP_MY_SKILLS = Array.from({ length: 16 }, (_, index) => ({
  id: `http-skill-${index + 1}`,
  name:
    index === 15
      ? '发布风险扫描发布风险扫描发布风险扫描发布风险扫描发布风险扫描发布风险扫描 Skill 133'
      : `HTTP 自动登录 Skill ${index + 1}`,
  level: '个人级',
  currentVersion: '1.0.0',
  status: '个人级',
  totalDownloads: 0,
}));

async function mockHttpGateways(
  page: Page,
  options: { mateUnavailable?: boolean } = {},
): Promise<Request[]> {
  const requests: Request[] = [];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    if (!['fetch', 'xhr'].includes(resourceType)) {
      await route.fallback();
      return;
    }

    requests.push(request);
    const url = new URL(request.url());

    if (url.pathname.endsWith('/matestoreauthservice/v1/users/validate')) {
      if (options.mateUnavailable) {
        await route.fulfill({
          status: 503,
          contentType: 'text/plain',
          body: 'Service Temporarily Unavailable',
        });
        return;
      }
      await route.fulfill({
        json: {
          uid: TEST_USER_ID,
          displayNameEN: 'auto-login-user',
          displayNameCN: '自动登录用户',
          mail: 'auto-login@example.test',
        },
      });
      return;
    }

    if (url.pathname.endsWith('/dataengineering/auth-manager/login')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            user: {
              userId: TEST_USER_ID,
              userName: 'fallback-login-user',
              userNameCn: '备用登录用户',
              email: 'fallback-login@example.test',
            },
          },
        },
      });
      return;
    }

    if (url.pathname.endsWith('/dataengineering/config-center/hw-userinfo')) {
      await route.fulfill({
        json: {
          code: 200,
          data: [
            {
              hwDepartName3: '平台产品线',
              hwDepartCode3: 'product-line',
              hwDepartName4: '平台工具组',
              hwDepartCode4: 'platform-tools',
            },
          ],
        },
      });
      return;
    }

    if (url.pathname.endsWith('/config-service/config-center/user')) {
      await route.fulfill({
        json: {
          messageEn: 'success',
          data: { list: [{ userId: TEST_USER_ID, role: 'SUPER_ADMIN' }] },
        },
      });
      return;
    }

    if (url.pathname.endsWith('/api/skills/my')) {
      await route.fulfill({
        json: {
          meta: { success: true, number: HTTP_MY_SKILLS.length },
          data: HTTP_MY_SKILLS,
        },
      });
      return;
    }

    await route.fulfill({ json: { meta: { success: true }, data: [] } });
  });

  return requests;
}

test.describe('HTTP 自动登录上下文', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');

  test('业务页面首批请求使用自动登录用户，且部门接口复用扶摇通道', async ({ page }) => {
    const requests = await mockHttpGateways(page);

    await page.goto(`${APP_BASE_PATH}/skill-square?tab=releases`);
    await expect(page.locator('#app')).not.toBeEmpty();

    await expect
      .poll(() =>
        requests.some((request) =>
          new URL(request.url()).pathname.endsWith('/dataengineering/config-center/hw-userinfo'),
        ),
      )
      .toBe(true);

    await expect
      .poll(() => {
        const expertRequest = requests.find((request) =>
          new URL(request.url()).pathname.endsWith('/api/skills/review/expert/check'),
        );
        return expertRequest ? new URL(expertRequest.url()).searchParams.get('userId') : undefined;
      })
      .toBe(TEST_USER_ID);
  });

  test('mateopenapi 返回 503 时通过 auth-manager 恢复自动登录', async ({ page }) => {
    const requests = await mockHttpGateways(page, { mateUnavailable: true });

    await page.goto(`${APP_BASE_PATH}/skill-square?tab=releases`);

    await expect
      .poll(() =>
        requests.some((request) =>
          new URL(request.url()).pathname.endsWith('/dataengineering/auth-manager/login'),
        ),
      )
      .toBe(true);
    await expect
      .poll(() => {
        const expertRequest = requests.find((request) =>
          new URL(request.url()).pathname.endsWith('/api/skills/review/expert/check'),
        );
        return expertRequest ? new URL(expertRequest.url()).searchParams.get('userId') : undefined;
      })
      .toBe(TEST_USER_ID);
  });

  test('HTTP 长列表最后一行的删除确认框显示在按钮上方且不越出视口', async ({ page }) => {
    await mockHttpGateways(page);
    await page.goto(`${APP_BASE_PATH}/skill-square?tab=releases`);

    const lastRow = page.locator('.my-release-data-row').last();
    await expect(lastRow).toContainText('Skill 133');
    const trigger = lastRow.getByRole('button', { name: '删除', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const popover = page.locator('.my-delete-popconfirm');
    await expect(popover).toBeVisible();
    const position = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>(
        '.my-release-data-row:last-child .my-rel-delete-trigger',
      );
      const dialog = document.querySelector<HTMLElement>('.my-delete-popconfirm');
      if (!button || !dialog) return null;
      const buttonRect = button.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      return {
        buttonTop: buttonRect.top,
        dialogTop: dialogRect.top,
        dialogBottom: dialogRect.bottom,
        viewportHeight: window.innerHeight,
      };
    });

    expect(position).not.toBeNull();
    expect(position!.dialogBottom).toBeLessThanOrEqual(position!.buttonTop);
    expect(position!.dialogTop).toBeGreaterThanOrEqual(8);
    expect(position!.dialogBottom).toBeLessThanOrEqual(position!.viewportHeight - 8);
  });
});
