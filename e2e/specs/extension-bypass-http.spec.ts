import type { Request } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('Extension packaging and bypass HTTP', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', 'Requires HTTP transport');

  test('deferred upload and save mutually exclude publication and every packaging request', async ({
    page,
  }) => {
    const requests: Request[] = [];
    let releaseUpload!: () => void;
    let releaseSave!: () => void;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const entries = [{ path: 'docs/guide.md', size: 18 }];
    await page.route('**/api/harness/**', async (route) => {
      const request = route.request();
      requests.push(request);
      const path = new URL(request.url()).pathname;
      let data: unknown = [];
      if (path.endsWith('/smapi-product-by-dept'))
        data = [{ offeringId: 'product-a', offeringName: 'product-a' }];
      else if (path.endsWith('/scene-activity/scene'))
        data = [
          { firstScene: '开发', secondScene: '构建', sceneExtensionCode: 'scene-target', sort: 0 },
        ];
      else if (path.endsWith('/extensions/detail'))
        data = {
          firstScene: '开发',
          secondScene: '构建',
          sceneExtensionCode: 'scene-target',
          readyStatus: '已就绪',
          layoutMode: 'standard',
          hasBypass: true,
          bypassEntries: entries,
          publishedExtension: {
            extensionName: 'product-a-package',
            description: 'Publication description',
          },
          components: { skills: [{ name: 'skill-a', version: '1.0.0' }], commands: [], agents: [] },
        };
      else if (path.endsWith('/extensions/orgs'))
        data = [{ orgCode: 'org-a', orgName: 'Organization A' }];
      else if (path.endsWith('/extensions/structure/tree'))
        data = {
          layoutMode: 'standard',
          entries: entries.map((entry) => ({ ...entry, type: 'file', source: 'FILE' })),
        };
      else if (path.endsWith('/extensions/bypass')) {
        await uploadGate;
        data = { layoutMode: 'standard', acceptedEntries: entries, ignoredEntries: [] };
      } else if (path.endsWith('/extensions')) {
        await saveGate;
        await route.fulfill({
          json: { meta: { success: false, message: 'SAVE_RETRY_REQUIRED' }, data: null },
        });
        return;
      }
      await route.fulfill({ json: { meta: { success: true }, data } });
    });
    await page.route(`**${APP_BASE_PATH}/extension-lock-test`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
    );
    await page.goto(`${APP_BASE_PATH}/extension-lock-test`);
    await page.evaluate(async () => {
      const componentUrl = '/skill-market/src/views/skill/ExtensionPublishPage.vue';
      const componentSource = await (await fetch(componentUrl)).text();
      const vueUrl = componentSource.match(/from ["']([^"']*\/vue\.js[^"']*)["']/)?.[1];
      if (!vueUrl) throw new Error('Vite did not emit Vue');
      const { createApp, h } = await import(vueUrl);
      const { default: Component } = await import(componentUrl);
      createApp({
        setup: () => () =>
          h(Component, {
            userId: 'parent-user',
            userName: 'Parent User',
            departmentTree: [{ id: 'dept', deptCode: 'dept', name: '研发部', children: [] }],
            currentUserDepartmentPath: ['研发部'],
            allowedDepartmentPaths: [['研发部']],
            restrictToAllowedDepartments: true,
          }),
      }).mount('#test-host');
    });
    const panel = page.locator('.packaging-panel');
    const count = (path: string) =>
      requests.filter((request) => new URL(request.url()).pathname.endsWith(path)).length;
    await expect(panel).toBeVisible();
    await panel.getByTestId('clear').click();
    await page.getByRole('button', { name: '发布', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /发布 Extension/ });
    const confirm = dialog.getByRole('button', { name: '确认发布', exact: true });
    await expect(confirm).toBeEnabled();
    try {
      await panel.getByTestId('upload').setInputFiles({
        name: 'pending.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from('zip fixture'),
      });
      await expect.poll(() => count('/extensions/bypass')).toBe(1);
      await expect(confirm).toBeDisabled();
      await confirm.dispatchEvent('click');
      await page.evaluate(() => new Promise(requestAnimationFrame));
      expect(count('/extensions')).toBe(0);
      releaseUpload();
      await expect(confirm).toBeEnabled();
      // Keep a clear confirmation open while publication is pending.
      await panel.getByTestId('clear').dispatchEvent('click');
      await confirm.click();
      await expect.poll(() => count('/extensions')).toBe(1);
      const before = requests.length;
      for (const id of ['layout', 'upload', 'clear', 'confirm-clear', 'download', 'inherit'])
        await expect(panel.getByTestId(id)).toBeDisabled();
      await panel.getByTestId('layout').evaluate((element: HTMLSelectElement) => {
        element.value = 'testagent';
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await panel.getByTestId('upload').setInputFiles({
        name: 'blocked.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from('blocked'),
      });
      for (const id of ['confirm-clear', 'download', 'inherit'])
        await panel.getByTestId(id).dispatchEvent('click');
      const refresh = panel.getByRole('button', { name: '刷新目录', exact: true });
      await expect(refresh).toBeDisabled();
      await refresh.dispatchEvent('click');
      await page.evaluate(() => new Promise(requestAnimationFrame));
      expect(requests.length).toBe(before);
      await expect(page.getByRole('dialog', { name: '从 Extension 继承旁路' })).toBeHidden();
      releaseSave();
      await expect(dialog.getByRole('alert')).toContainText('SAVE_RETRY_REQUIRED');
      await expect(panel.getByTestId('upload')).toBeEnabled();
    } finally {
      releaseUpload();
      releaseSave();
    }
  });

  test('scene packaging persists, inherits, refreshes detail and keeps parent identity', async ({
    page,
  }, testInfo) => {
    const requests: Request[] = [];
    let layoutMode = 'standard';
    let entries: { path: string; size: number }[] = [];
    let detailUnavailable = false;
    let delayTree = false;
    let releaseTree: (() => void) | undefined;
    let treeGate: Promise<void> | undefined;
    let delayedTreeRequests = 0;
    const accepted = [{ path: 'docs/guide.md', size: 18 }];
    const ignored = [{ path: 'skills/protected.md', size: 7, reason: 'target protected' }];
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      requests.push(request);
      const url = new URL(request.url());
      const endpoint = url.pathname;
      let data: unknown = [];
      if (endpoint.endsWith('/smapi-product-by-dept')) {
        data = [{ offeringId: 'product-a', offeringName: 'product-a' }];
      } else if (endpoint.endsWith('/scene-activity/scene')) {
        data = [
          { firstScene: '开发', secondScene: '构建', sceneExtensionCode: 'scene-target', sort: 0 },
        ];
      } else if (endpoint.endsWith('/extensions/detail')) {
        if (detailUnavailable) {
          await route.fulfill({
            json: {
              meta: { success: false, message: 'DETAIL_TEMPORARILY_UNAVAILABLE' },
              data: null,
            },
          });
          return;
        }
        data = {
          firstScene: '开发',
          secondScene: '构建',
          sceneExtensionCode: 'scene-target',
          readyStatus: '已就绪',
          layoutMode,
          hasBypass: entries.length > 0,
          bypassEntries: entries,
          publishedExtension: {
            extensionName: 'published-package',
            description: 'Package description',
          },
          components: { skills: [{ name: 'skill-a', version: '1.0.0' }], commands: [], agents: [] },
        };
      } else if (endpoint.endsWith('/extensions/layout')) {
        layoutMode = url.searchParams.get('layout')!;
        data = { layoutMode };
      } else if (endpoint.endsWith('/extensions/bypass')) {
        entries = accepted;
        data = { layoutMode, acceptedEntries: accepted, ignoredEntries: ignored };
      } else if (endpoint.endsWith('/extensions/bypass/clear')) {
        entries = [];
        data = null;
      } else if (endpoint.endsWith('/extensions/bypass/inherit')) {
        layoutMode = 'standard';
        entries = accepted;
        data = { layoutMode, acceptedEntries: accepted, ignoredEntries: ignored };
      } else if (endpoint.endsWith('/extensions/search')) {
        data = {
          total: 2,
          list: ['scene-target', 'source-one'].map((extensionName) => ({
            extensionName,
            description: 'Reusable source',
            layoutMode: 'standard',
            hasBypass: true,
            entryCount: 1,
            latestVersion: '2.0.0',
            sourceDimName: 'Team A',
          })),
        };
      } else if (endpoint.endsWith('/extensions/structure/tree')) {
        if (delayTree) {
          delayedTreeRequests += 1;
          await treeGate;
        }
        data = {
          layoutMode,
          entries: [
            { path: 'system/', type: 'dir', size: null, source: 'SYSTEM' },
            { path: 'skills/skill-a.md', type: 'file', size: 12, source: 'COMPONENT' },
            ...entries.map((entry) => ({ ...entry, type: 'file', source: 'FILE' })),
          ],
        };
      } else if (endpoint.endsWith('/extensions/orgs')) {
        data = [{ orgCode: 'org-a', orgName: 'Organization A' }];
      }
      await route.fulfill({ json: { meta: { success: true, message: 'OK' }, data } });
    });
    await page.route(`**${APP_BASE_PATH}/extension-bypass-test`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
    );
    await page.goto(`${APP_BASE_PATH}/extension-bypass-test`);
    await page.evaluate(async () => {
      const componentUrl = '/skill-market/src/views/skill/ExtensionPublishPage.vue';
      // Use the dependency URL emitted by this Vite server, including its optimizer version.
      const componentSource = await (await fetch(componentUrl)).text();
      const vueUrl = componentSource.match(/from ["']([^"']*\/vue\.js[^"']*)["']/)?.[1];
      if (!vueUrl) throw new Error('Vite did not emit a Vue dependency URL');
      const { createApp, h } = await import(vueUrl);
      const { default: Component } = await import(componentUrl);
      createApp({
        setup: () => () =>
          h(Component, {
            userId: 'parent-user',
            userName: 'Parent User',
            departmentTree: [{ id: 'dept-a', deptCode: 'dept-a', name: '研发部', children: [] }],
            currentUserDepartmentPath: ['研发部'],
            allowedDepartmentPaths: [['研发部']],
            restrictToAllowedDepartments: true,
          }),
      }).mount('#test-host');
    });
    const panel = page.locator('.packaging-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.source-system')).toHaveText('SYSTEM');
    await panel.getByTestId('layout').selectOption('testagent');
    await expect(panel.getByTestId('layout')).toHaveValue('testagent');
    await expect
      .poll(
        () =>
          requests.filter((r) => new URL(r.url()).pathname.endsWith('/extensions/detail')).length,
      )
      .toBeGreaterThan(1);
    detailUnavailable = true;
    await panel.getByTestId('upload').setInputFiles({
      name: 'files.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('zip fixture'),
    });
    await expect(panel.getByTestId('ignored-entries')).toContainText('target protected');
    await expect(panel.locator('.source-file')).toHaveText('FILE');
    await expect(page.getByText(/打包配置已保存.*详情刷新/)).toBeVisible();
    await expect(panel.getByTestId('layout')).toHaveValue('testagent');
    detailUnavailable = false;
    await panel.screenshot({ path: testInfo.outputPath('extension-packaging.png') });
    await panel.getByTestId('inherit').click();
    const dialog = page.getByRole('dialog', { name: '从 Extension 继承旁路' });
    await expect(dialog.getByRole('searchbox')).toBeFocused();
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await dialog.getByRole('option').click();
    delayTree = true;
    treeGate = new Promise<void>((resolve) => {
      releaseTree = resolve;
    });
    await dialog.getByTestId('confirm-inherit').click();
    await expect.poll(() => delayedTreeRequests).toBeGreaterThan(0);
    await expect(dialog).toBeVisible();
    await expect(panel.getByTestId('inherit')).toBeDisabled();
    delayTree = false;
    releaseTree!();
    await expect(dialog).toBeHidden();
    await expect(panel.getByTestId('inherit')).toBeEnabled();
    await expect(panel.getByTestId('inherit')).toBeFocused();
    await expect(panel.getByTestId('layout')).toHaveValue('standard');
    await panel.getByTestId('inherit').click();
    await expect(dialog.getByRole('searchbox')).toBeFocused();
    await dialog.getByRole('option').click();
    await dialog.getByTestId('confirm-inherit').focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(panel.getByTestId('inherit')).toBeFocused();
    await panel.getByTestId('inherit').click();
    await page.locator('.inherit-overlay').click({ position: { x: 5, y: 5 } });
    await expect(dialog).toBeHidden();
    await panel.getByTestId('clear').click();
    expect(
      requests.filter((r) => new URL(r.url()).pathname.endsWith('/extensions/bypass/clear')),
    ).toHaveLength(0);
    await panel.getByTestId('confirm-clear').click();
    await expect(panel.getByTestId('clear')).toBeDisabled();
    await expect(panel.locator('.source-file')).toHaveCount(0);
    const bypassRequests = requests.filter((r) =>
      /\/extensions\/(layout|structure|bypass|search)/.test(new URL(r.url()).pathname),
    );
    for (const request of bypassRequests) {
      if (new URL(request.url()).pathname.endsWith('/extensions/bypass')) {
        expect(request.postData()).toContain('parent-user');
        expect(request.postData()).toContain('scene-target');
      } else {
        expect(new URL(request.url()).searchParams.get('userId')).toBe('parent-user');
      }
      expect(request.url()).not.toContain('published-package');
    }
    const inheritance = requests.find((r) =>
      new URL(r.url()).pathname.endsWith('/extensions/bypass/inherit'),
    )!;
    expect(inheritance.postDataJSON()).toEqual({
      sourceExtensionName: 'source-one',
      targetExtensionName: 'scene-target',
    });
  });
});
