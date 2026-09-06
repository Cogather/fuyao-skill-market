import type { Locator, Page, Request } from '@playwright/test';

import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

const DEPARTMENT_PATH = [
  '\u90e8\u95e81',
  '\u5e73\u53f0\u4ea7\u54c1\u7ebf',
  '\u5e73\u53f0\u5de5\u5177\u7ec4',
  'DevOps\u90e8',
  '\u6301\u7eed\u4ea4\u4ed8\u7ec4',
];

const HTTP_ASSET = {
  id: 'http-skill-pending',
  name: 'HTTP \u53d1\u5e03\u98ce\u9669\u626b\u63cf Skill',
  description: '\u4ece\u7edf\u4e00\u8d44\u4ea7 facade \u8fd4\u56de\u7684\u5f85\u53d1\u5e03 Skill',
  assetType: 'Skill' as const,
  currentVersion: '1.10.0',
  versions: ['1.10.0', '1.9.0'],
  owner: 'HTTP \u5f00\u53d1\u8005 http-user-001',
  departmentName: '\u6301\u7eed\u4ea4\u4ed8\u7ec4',
  departmentPath: DEPARTMENT_PATH,
  productId: 'http-product',
  productName: 'harness-pipeline',
  auto: false,
  marketplace: { rating: 4.6, downloads: 18, calls: 72 },
  releases: [],
  publishable: true,
};

type PublishedRelease = {
  id: string;
  version: string;
  publishedAt: string;
  organization: { id: string; name: string };
  notes: string;
  publisher: string;
  status: '成功';
};

function envelope<T>(data: T): { meta: { success: true; message: string }; data: T } {
  return { meta: { success: true, message: 'OK' }, data };
}

function assetCard(page: Page, name: string): Locator {
  return page.locator('.asset-card').filter({
    has: page.getByRole('heading', { name, exact: true }),
  });
}

async function selectDepartmentPath(page: Page, path: string[]): Promise<void> {
  await page.locator('.asset-department__trigger').click();
  const panel = page.locator('.asset-department__panel');
  await expect(panel).toBeVisible();

  for (let index = 0; index < path.length; index += 1) {
    const accessiblePath = path.slice(0, index + 1).join(' / ');
    const nameButton = panel.getByRole('button', { name: accessiblePath, exact: true });
    await expect(nameButton).toBeVisible();
    if (index === path.length - 1) {
      await nameButton.click();
      break;
    }
    const toggle = nameButton.locator('xpath=..').locator('.asset-department__toggle');
    if (((await toggle.getAttribute('aria-label')) ?? '').startsWith('\u5c55\u5f00')) {
      await toggle.click();
    }
  }
}

test.describe('Agent / Skill \u8d44\u4ea7 HTTP facade', () => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http',
    '\u4ec5\u5728 VITE_SKILL_MARKET_TRANSPORT=http \u65f6\u9a8c\u8bc1\u771f\u5b9e\u8bf7\u6c42\u5206\u652f',
  );

  test('\u7edf\u4e00 facade \u8d2f\u901a\u8303\u56f4\u67e5\u8be2\u3001\u8be6\u60c5\u3001\u8d28\u91cf\u62a5\u544a\u548c\u53d1\u5e03', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ departmentPath }) => {
        window.sessionStorage.setItem(
          '__skill_market_parent_context_v1__',
          JSON.stringify({
            type: 'Skill_Square_Init',
            userId: 'http-user-001',
            userName: 'HTTP \u6d4b\u8bd5\u7528\u6237',
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

    const assetListRequests: Request[] = [];
    const detailRequests: Request[] = [];
    const qualityRequests: Request[] = [];
    const releaseListRequests: Request[] = [];
    const productRequests: Request[] = [];
    const organizationRequests: Request[] = [];
    let publishedRelease: PublishedRelease | null = null;

    await page.route('**/api/harness/permission/user-depts**', (route) =>
      route.fulfill({
        json: envelope({
          ownedOrgs: [
            {
              deptName: '\u6301\u7eed\u4ea4\u4ed8\u7ec4',
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
            planningDeptName: '\u6301\u7eed\u4ea4\u4ed8\u7ec4',
          },
        ]),
      });
    });

    await page.route('**/api/harness/extensions/orgs**', (route) => {
      organizationRequests.push(route.request());
      return route.fulfill({
        json: envelope([
          {
            orgCode: 'org-http-target',
            orgName: 'HTTP \u76ee\u6807\u7ec4\u7ec7',
            deptId: 'dept-continuous',
            deptName: '\u6301\u7eed\u4ea4\u4ed8\u7ec4',
          },
        ]),
      });
    });

    await page.route('**/api/harness/assets**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (pathname.endsWith('/api/harness/assets') && request.method() === 'GET') {
        assetListRequests.push(request);
        return route.fulfill({
          json: envelope({
            list: [
              {
                ...HTTP_ASSET,
                releases: publishedRelease ? [publishedRelease] : [],
              },
            ],
            total: 1,
          }),
        });
      }

      if (/\/quality-report$/.test(pathname) && request.method() === 'GET') {
        qualityRequests.push(request);
        return route.fulfill({
          json: envelope({
            overallScore: 94,
            grade: 'A',
            summary: 'HTTP \u8d28\u91cf\u95e8\u7981\u5df2\u901a\u8fc7',
            items: [
              { name: '\u5355\u5143\u6d4b\u8bd5\u8986\u76d6\u7387', value: '91%', pass: true },
              { name: '\u5b89\u5168\u626b\u63cf', value: '97 \u5206', pass: true },
            ],
          }),
        });
      }

      if (/\/releases$/.test(pathname) && request.method() === 'GET') {
        releaseListRequests.push(request);
        const list = publishedRelease ? [publishedRelease] : [];
        return route.fulfill({ json: envelope({ list, total: list.length }) });
      }

      if (/\/releases$/.test(pathname) && request.method() === 'POST') {
        const body = request.postDataJSON() as {
          version?: string;
          targetOrganization?: { id?: string; name?: string };
        };
        publishedRelease = {
          id: 'release-http-001',
          version: String(body.version ?? ''),
          publishedAt: '2026-09-06T08:30:00.000Z',
          organization: {
            id: String(body.targetOrganization?.id ?? ''),
            name: String(body.targetOrganization?.name ?? ''),
          },
          notes: 'HTTP facade publish',
          publisher: 'HTTP \u6d4b\u8bd5\u7528\u6237',
          status: '\u6210\u529f',
        };
        return route.fulfill({ json: envelope(publishedRelease) });
      }

      if (/\/api\/harness\/assets\/[^/]+\/[^/]+$/.test(pathname) && request.method() === 'GET') {
        detailRequests.push(request);
        return route.fulfill({
          json: envelope({
            versions: ['1.10.0', '1.9.0'],
            files: [
              {
                path: 'SKILL.md',
                content:
                  '# HTTP \u53d1\u5e03\u98ce\u9669\u626b\u63cf Skill\n\ncurrent version: 1.10.0',
                category: 'skill',
              },
              {
                path: 'run.sh',
                content: '#!/bin/bash\necho http-asset',
                category: 'skill',
              },
            ],
          }),
        });
      }

      return route.fulfill({
        status: 404,
        json: { message: `Unexpected assets request: ${pathname}` },
      });
    });

    await page.goto(`${APP_BASE_PATH}/harness-management`);
    await page.getByRole('tab', { name: 'Agent / Skill \u8d44\u4ea7' }).click();
    await expect(page.getByRole('heading', { name: '\u8d44\u4ea7\u6e05\u5355' })).toBeVisible();
    await selectDepartmentPath(page, DEPARTMENT_PATH);

    const productSelect = page.getByLabel('\u4ea7\u54c1\u7b5b\u9009');
    await expect(productSelect).toBeVisible();
    await productSelect.selectOption('http-product');
    await page.getByRole('button', { name: 'Skill', exact: true }).click();

    const card = assetCard(page, HTTP_ASSET.name);
    await expect(card).toBeVisible();
    await expect(card.getByText('\u5f85\u53d1\u5e03', { exact: true })).toBeVisible();
    await card.click();

    await expect(page.locator('.asset-detail')).toContainText('current version: 1.10.0');
    await page.getByRole('button', { name: '\u8d28\u91cf\u62a5\u544a' }).click();
    await expect(page.getByText('HTTP \u8d28\u91cf\u95e8\u7981\u5df2\u901a\u8fc7')).toBeVisible();
    await page.getByRole('button', { name: '\u53d1\u5e03', exact: true }).click();

    const organizationSelect = page.getByRole('combobox', { name: '\u76ee\u6807\u7ec4\u7ec7' });
    await expect(
      organizationSelect.getByRole('option', { name: 'HTTP \u76ee\u6807\u7ec4\u7ec7' }),
    ).toBeAttached();
    await organizationSelect.selectOption('org-http-target');
    const publishRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        /\/api\/harness\/assets\/[^/]+\/[^/]+\/releases$/.test(new URL(request.url()).pathname),
    );
    await page.getByRole('button', { name: '\u786e\u8ba4\u53d1\u5e03' }).click();
    const publishRequest = await publishRequestPromise;

    await expect(page.getByRole('button', { name: '\u53d1\u5e03\u5386\u53f2' })).toHaveClass(
      /is-active/,
    );
    await expect(page.locator('.asset-history__item').first()).toContainText(
      'HTTP \u76ee\u6807\u7ec4\u7ec7',
    );

    expect(productRequests).not.toHaveLength(0);
    expect(new URL(productRequests.at(-1)!.url()).searchParams.get('deptCode')).toBe(
      'dept-continuous',
    );

    await expect
      .poll(() =>
        assetListRequests.some((request) => {
          const query = new URL(request.url()).searchParams;
          return (
            query.get('userId') === 'http-user-001' &&
            Boolean(query.get('dimType')) &&
            query.get('dimCode') === 'http-product' &&
            query.get('dimName') === 'harness-pipeline' &&
            query.get('productId') === 'http-product' &&
            query.get('assetType') === 'Skill'
          );
        }),
      )
      .toBe(true);

    expect(detailRequests).toHaveLength(1);
    expect(decodeURIComponent(new URL(detailRequests[0]!.url()).pathname)).toMatch(
      /\/api\/harness\/assets\/skill\/http-skill-pending$/i,
    );
    expect(new URL(detailRequests[0]!.url()).searchParams.get('version')).toBe('1.10.0');
    expect(qualityRequests).toHaveLength(1);
    expect(new URL(qualityRequests[0]!.url()).searchParams.get('version')).toBe('1.10.0');
    expect(releaseListRequests.length).toBeGreaterThan(0);
    expect(organizationRequests.length).toBeGreaterThan(0);
    expect(new URL(organizationRequests.at(-1)!.url()).searchParams.get('userId')).toBe(
      'http-user-001',
    );
    expect(new URL(organizationRequests.at(-1)!.url()).searchParams.get('dimCode')).toBe(
      'http-product',
    );

    const publishPath = decodeURIComponent(new URL(publishRequest.url()).pathname);
    expect(publishPath).toMatch(/\/api\/harness\/assets\/skill\/http-skill-pending\/releases$/i);
    expect(publishRequest.postDataJSON()).toEqual({
      userId: 'http-user-001',
      operatorName: 'HTTP \u6d4b\u8bd5\u7528\u6237',
      version: '1.10.0',
      channel: 'product',
      targetOrganization: { id: 'org-http-target', name: 'HTTP \u76ee\u6807\u7ec4\u7ec7' },
      description:
        '\u4ece\u7edf\u4e00\u8d44\u4ea7 facade \u8fd4\u56de\u7684\u5f85\u53d1\u5e03 Skill',
    });
  });
});
