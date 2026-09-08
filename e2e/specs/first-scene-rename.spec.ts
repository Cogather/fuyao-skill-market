import { expect, test } from '../fixtures/base';
import type { Page } from '@playwright/test';

async function mountScenarioPage(page: Page) {
  await page.route('**/skill-market/first-scene-rename-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto('/skill-market/first-scene-rename-test');
  await page.evaluate(async () => {
    const vueUrl = '/skill-market/node_modules/.vite/deps/vue.js';
    const workspaceUrl = '/skill-market/src/composables/useHarnessScenarioWorkspace.ts';
    const componentUrl = '/skill-market/src/views/skill/BusinessScenarioDesignPage.vue';
    const { createApp, h } = await import(vueUrl);
    const { createHarnessScenarioWorkspace } = await import(workspaceUrl);
    const { default: Component } = await import(componentUrl);
    createApp({
      setup() {
        const workspace = createHarnessScenarioWorkspace(() => ({
          ready: true,
          userId: 'scene-editor',
          departmentTree: [{ name: '持续交付组', deptCode: 'delivery' }],
          defaultDepartmentPath: ['持续交付组'],
          allowedDepartmentPaths: [['持续交付组']],
          restrictToAllowedDepartments: true,
        }));
        return () => h(Component, { workspace });
      },
    }).mount('#test-host');
  });
}

for (const level of ['一级', '二级']) {
  test(`HTTP ${level}场景通过名称旁的图标改名，保留元数据，失败时保留输入`, async ({
    page,
  }, testInfo) => {
    test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT !== 'http', '需要 HTTP 模式');
    const originalName = level === '一级' ? '研发提效' : '代码生成';
    const renamedName = level === '一级' ? '研发效率' : '代码生成新版';
    let rows = [
      {
        firstScene: '研发提效',
        firstSceneDescription: '研发一级说明',
        secondScene: '代码生成',
        secondSceneDescription: '代码生成目标',
        sceneExtensionCode: 'demo-code',
        flowName: '代码作业流',
        flowDescription: '代码工作流说明',
        tags: ['AI 提效'],
        sort: 0,
      },
      {
        firstScene: '研发提效',
        firstSceneDescription: '研发一级说明',
        secondScene: '接口开发',
        secondSceneDescription: '接口开发目标',
        sceneExtensionCode: 'demo-api',
        flowName: '接口作业流',
        flowDescription: '',
        tags: ['AI 提效'],
        sort: 1,
      },
      {
        firstScene: '质量保障',
        firstSceneDescription: '质量一级说明',
        secondScene: '',
        secondSceneDescription: '',
        sceneExtensionCode: '',
        flowName: '',
        flowDescription: '',
        tags: [],
        sort: 2,
      },
    ];
    const writes: { method: string; query: URLSearchParams; body: { scenes: typeof rows } }[] = [];
    const metadataWrites: {
      path: string;
      method: string;
      query: URLSearchParams;
      body: Record<string, string>;
      sceneWrites: number;
    }[] = [];
    let rejectSave = true;
    let bound = false;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      let data: unknown = [];
      if (path.endsWith('/smapi-product-by-dept')) {
        data = [{ offeringId: 'p-demo', offeringName: 'demo' }];
      } else if (path.endsWith('/scene-activity/scene') && request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push({ method: request.method(), query: url.searchParams, body });
        if (rejectSave) {
          await route.fulfill({
            json: { meta: { success: false, message: '场景保存失败，请重试' } },
          });
          return;
        }
        rows = body.scenes;
        data = null;
      } else if (path.endsWith('/scene/code') || path.endsWith('/scene/workflow-meta')) {
        const body = request.postDataJSON();
        metadataWrites.push({
          path,
          method: request.method(),
          query: url.searchParams,
          body,
          sceneWrites: writes.length,
        });
        Object.assign(
          rows.find(
            (row) => row.firstScene === body.firstScene && row.secondScene === body.secondScene,
          )!,
          body,
        );
        data = null;
      } else if (path.endsWith('/scene-activity/scene')) {
        data = rows;
      } else if (path.endsWith('/workflow/detail')) {
        data = {
          ...rows.find(
            (row) =>
              row.firstScene === url.searchParams.get('firstScene') &&
              row.secondScene === url.searchParams.get('secondScene'),
          ),
          commands: bound ? [{ commandName: '/demo-entry', description: '入口' }] : [],
          assetPool: [],
          stages: [],
          steps: [],
          nextStep: 0,
          allDone: false,
        };
      } else if (path.endsWith('/scene-tag/bindings/refresh')) {
        for (const binding of request.postDataJSON().bindings) {
          rows
            .filter((row) => row.firstScene === binding.firstScene)
            .forEach((row) => {
              row.tags = binding.tags;
            });
        }
        data = null;
      }
      await route.fulfill({ json: { meta: { success: true }, data } });
    });
    await mountScenarioPage(page);
    const tree = page.getByRole('tree', { name: '业务场景地图' });
    await expect(tree.getByText('代码生成', { exact: true })).toBeVisible();
    await tree.getByText('代码生成', { exact: true }).click();
    const opener = tree.getByRole('button', { name: `编辑${originalName}`, exact: true });
    await expect(opener).toBeVisible();
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: `编辑${level}场景`, exact: true });
    const name = dialog.getByLabel('场景名称');
    await expect(name).toHaveValue(originalName);
    await expect(dialog.getByLabel('场景编码')).toHaveCount(0);
    await name.fill('取消的名称');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(opener).toBeFocused();
    expect(writes).toHaveLength(0);
    await opener.click();
    await name.fill(level === '一级' ? '质量保障' : '接口开发');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('同名场景');
    expect(writes).toHaveLength(0);
    await name.fill(`  ${renamedName}  `);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('场景保存失败');
    await expect(name).toHaveValue(`  ${renamedName}  `);
    rejectSave = false;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(writes).toHaveLength(2);
    const saved = writes[1]!;
    expect(saved.method).toBe('POST');
    expect(Object.fromEntries(saved.query)).toMatchObject({
      userId: 'scene-editor',
      dimType: '产品级',
      dimCode: 'p-demo',
      dimName: 'demo',
    });
    expect(
      saved.body.scenes.map((row) => [
        row.firstScene,
        row.secondScene,
        row.firstSceneDescription,
        row.secondSceneDescription,
        row.sceneExtensionCode,
        row.flowName,
      ]),
    ).toEqual([
      [
        level === '一级' ? '研发效率' : '研发提效',
        level === '一级' ? '代码生成' : '代码生成新版',
        '研发一级说明',
        '代码生成目标',
        'demo-code',
        '代码作业流',
      ],
      [
        level === '一级' ? '研发效率' : '研发提效',
        '接口开发',
        '研发一级说明',
        '接口开发目标',
        'demo-api',
        '接口作业流',
      ],
      ['质量保障', '', '质量一级说明', '', '', ''],
    ]);
    expect(metadataWrites.map((write) => [write.path, write.method, write.sceneWrites])).toEqual(
      level === '一级'
        ? []
        : [
            ['/api/harness/scene-activity/scene/code', 'PUT', 2],
            ['/api/harness/scene-activity/scene/workflow-meta', 'PUT', 2],
          ],
    );
    if (level === '二级') {
      expect(metadataWrites[0]!.body).toEqual({
        firstScene: '研发提效',
        secondScene: '代码生成新版',
        sceneExtensionCode: 'demo-code',
        secondSceneDescription: '代码生成目标',
      });
      expect(metadataWrites[1]!.body).toEqual({
        firstScene: '研发提效',
        secondScene: '代码生成新版',
        flowName: '代码作业流',
        flowDescription: '代码工作流说明',
      });
      for (const write of metadataWrites)
        expect(Object.fromEntries(write.query)).toMatchObject({
          userId: 'scene-editor',
          dimType: '产品级',
          dimCode: 'p-demo',
          dimName: 'demo',
        });
    }
    await expect(tree.getByText(renamedName, { exact: true })).toBeVisible();
    await expect(tree.locator('.tree-node.child.active')).toContainText(
      level === '一级' ? '代码生成' : renamedName,
    );
    await page.screenshot({ path: testInfo.outputPath(`${level}-scene-renamed.png`) });
    await mountScenarioPage(page);
    await tree.getByRole('button', { name: `编辑${renamedName}`, exact: true }).click();
    await expect(name).toHaveValue(renamedName);
    bound = true;
    await name.fill('被绑定的场景');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('已绑定资产');
    expect(writes).toHaveLength(2);
  });

  test(`Mock ${level}场景可编辑名称，取消不修改且刷新后保留新名称`, async ({ page }) => {
    test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '需要 Mock 模式');
    await mountScenarioPage(page);
    await page.getByTitle('新建一级场景', { exact: true }).click();
    const creation = page.getByRole('dialog', { name: '新建一级场景', exact: true });
    await creation.getByLabel('场景名称').fill('改名测试场景');
    await creation.getByLabel('场景说明').fill('需要保留的说明');
    await creation.getByRole('button', { name: '创建', exact: true }).click();
    await expect(creation).toBeHidden();
    const originalName = level === '一级' ? '改名测试场景' : '下级改名测试';
    const renamedName = `修改后的${level}场景`;
    if (level === '二级') {
      await page.getByRole('button', { name: '在改名测试场景下新建场景', exact: true }).click();
      const childCreation = page.getByRole('dialog', { name: '新建下级场景', exact: true });
      await childCreation.getByLabel('场景名称').fill(originalName);
      await childCreation.getByLabel('场景编码').fill('harness-pipeline-rename');
      await childCreation.getByLabel('场景说明').fill('需要保留的说明');
      await childCreation.getByRole('button', { name: '创建', exact: true }).click();
      await expect(childCreation).toBeHidden();
    }
    await page.getByRole('button', { name: `编辑${originalName}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `编辑${level}场景`, exact: true });
    await expect(dialog.getByLabel('场景名称')).toHaveValue(originalName);
    await dialog.getByLabel('场景名称').fill('未保存名称');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: `编辑${originalName}`, exact: true }).click();
    await dialog.getByLabel('场景名称').fill(renamedName);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.summary')).toContainText('需要保留的说明');
    await mountScenarioPage(page);
    await expect(
      page.getByRole('button', { name: `编辑${renamedName}`, exact: true }),
    ).toBeVisible();
  });
}
