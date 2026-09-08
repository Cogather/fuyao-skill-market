import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

type CapabilityType = 'Command' | 'Agent' | 'Skill';
type Option = {
  _id: string;
  name: string;
  description: string;
  owner: string;
  developer: string;
  version: string;
  type: CapabilityType;
};
type PickerProbe = {
  calls: { type: CapabilityType; keyword: string; pageNum: number }[];
  selected: Option[];
  resolve: (index: number, list: Option[], hasMore?: boolean) => void;
  reject: (index: number, message: string) => void;
};

function option(id: string, type: CapabilityType): Option {
  return {
    _id: id,
    name: `${id} ${type}`,
    description: `${id} 的资产说明`,
    owner: '测试负责人',
    developer: '测试开发者',
    version: '1.0.0',
    type,
  };
}

async function mountPicker(page: Page, types: CapabilityType[]): Promise<void> {
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.goto('/skill-market/harness-management');
  await page.evaluate(
    async ({ types, localOptions }) => {
      const vuePath = '/skill-market/node_modules/.vite/deps/vue.js';
      const componentPath = '/skill-market/src/components/skill/WorkflowCapabilityPicker.vue';
      const { createApp, h, ref } = await import(vuePath);
      const { default: Picker } = await import(componentPath);
      const appElement = document.getElementById('app');
      if (appElement) appElement.style.display = 'none';
      const host = document.createElement('div');
      host.id = 'workflow-picker-test';
      host.style.cssText = 'width:696px;margin:40px auto;background:white;padding:24px;';
      document.body.append(host);
      const selectedIds = ref([] as string[]);
      const pending: ((result: { list: Option[]; hasMore: boolean }) => void)[] = [];
      const failures: ((reason: Error) => void)[] = [];
      const probe: PickerProbe = {
        calls: [],
        selected: [],
        resolve(index, list, hasMore = false) {
          pending[index]!({ list, hasMore });
        },
        reject(index, message) {
          failures[index]!(new Error(message));
        },
      };
      (window as unknown as { pickerProbe: PickerProbe }).pickerProbe = probe;
      createApp({
        setup() {
          return () =>
            h(Picker, {
              types,
              localOptions,
              selectedIds: selectedIds.value,
              query(type: CapabilityType, keyword: string, pageNum: number) {
                if (!keyword) {
                  return Promise.resolve({
                    list: localOptions.filter((candidate) => candidate.type === type),
                    hasMore: false,
                  });
                }
                probe.calls.push({ type, keyword, pageNum });
                return new Promise<{ list: Option[]; hasMore: boolean }>((resolve, reject) => {
                  pending.push(resolve);
                  failures.push(reject);
                });
              },
              onSelect(selected: Option) {
                probe.selected.push(selected);
                selectedIds.value = [...selectedIds.value, selected._id];
              },
            });
        },
      }).mount(host);
    },
    {
      types,
      localOptions: [
        option('local-command', 'Command'),
        option('local-agent', 'Agent'),
        option('local-skill', 'Skill'),
      ],
    },
  );
  await page.clock.install({ time: new Date('2026-09-07T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-07T00:00:01Z'));
}

async function calls(page: Page) {
  return page.evaluate(() => (window as unknown as { pickerProbe: PickerProbe }).pickerProbe.calls);
}

async function resolveQuery(page: Page, index: number, list: Option[]): Promise<void> {
  await page.evaluate(
    ({ index, list }) =>
      (window as unknown as { pickerProbe: PickerProbe }).pickerProbe.resolve(index, list),
    { index, list },
  );
}

test('Command 搜索防抖查询、替换产品候选并添加远程结果', async ({ page }) => {
  await mountPicker(page, ['Command']);
  const picker = page.locator('#workflow-picker-test');
  await picker.getByRole('button', { name: '+ 选择一个 Command 加入… ▾' }).click();
  await expect(picker.locator('.command-picker-option')).toContainText('local-command');
  expect(await calls(page)).toHaveLength(0);

  const search = picker.getByRole('searchbox', { name: '搜索 Command' });
  await search.fill('rev');
  await expect(picker.locator('.command-picker-option')).toHaveCount(0);
  await page.clock.fastForward(150);
  await search.fill('review');
  await page.clock.fastForward(249);
  expect(await calls(page)).toHaveLength(0);
  await page.clock.fastForward(1);
  await expect
    .poll(() => calls(page))
    .toEqual([{ type: 'Command', keyword: 'review', pageNum: 1 }]);
  await resolveQuery(page, 0, [option('remote-review', 'Command')]);
  await expect(picker.locator('.command-picker-option')).toHaveCount(1);
  await picker.locator('.command-picker-option').click();
  expect(
    await page.evaluate(
      () => (window as unknown as { pickerProbe: PickerProbe }).pickerProbe.selected,
    ),
  ).toEqual([option('remote-review', 'Command')]);
});

test('切换 Agent / Skill 保留关键词并阻止旧类型响应覆盖当前结果', async ({ page }) => {
  await mountPicker(page, ['Agent', 'Skill']);
  const picker = page.locator('#workflow-picker-test');
  await picker.getByRole('button', { name: '+ 从资产库添加 Agent / Skill… ▾' }).click();
  await picker.getByRole('searchbox', { name: '搜索 Agent' }).fill('review');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await picker.locator('.picker-list').getByRole('button', { name: 'Skill', exact: true }).click();
  await expect(picker.getByRole('searchbox', { name: '搜索 Skill' })).toHaveValue('review');
  await expect
    .poll(() => calls(page))
    .toEqual([
      { type: 'Agent', keyword: 'review', pageNum: 1 },
      { type: 'Skill', keyword: 'review', pageNum: 1 },
    ]);
  await resolveQuery(page, 1, [option('remote-skill', 'Skill')]);
  await resolveQuery(page, 0, [option('stale-agent', 'Agent')]);
  await expect(picker.locator('.asset-option')).toHaveCount(1);
  await expect(picker.locator('.asset-option')).toContainText('remote-skill');
  await expect(picker.getByText('stale-agent Agent', { exact: true })).toHaveCount(0);
  await picker
    .locator('.asset-option')
    .getByRole('button', { name: '+ 添加', exact: true })
    .click();
  await expect(
    picker.locator('.asset-option').getByRole('button', { name: '已在池中', exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => (window as unknown as { pickerProbe: PickerProbe }).pickerProbe.selected,
    ),
  ).toEqual([option('remote-skill', 'Skill')]);
});

test('快速改词和清空搜索使旧请求失效，恢复产品候选', async ({ page }) => {
  await mountPicker(page, ['Command']);
  const picker = page.locator('#workflow-picker-test');
  await picker.getByRole('button', { name: '+ 选择一个 Command 加入… ▾' }).click();
  const search = picker.getByRole('searchbox', { name: '搜索 Command' });
  await search.fill('first');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await search.fill('second');
  await resolveQuery(page, 0, [option('stale-first', 'Command')]);
  await expect(picker.locator('.command-picker-option')).toHaveCount(0);
  await page.clock.fastForward(250);
  await expect.poll(async () => (await calls(page)).length).toBe(2);
  await picker.getByRole('button', { name: '清空搜索', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(picker.locator('.command-picker-option')).toContainText('local-command');
  await resolveQuery(page, 1, [option('stale-second', 'Command')]);
  await expect(picker.locator('.command-picker-option')).toHaveCount(1);
  await expect(picker.locator('.command-picker-option')).toContainText('local-command');
  expect(await calls(page)).toHaveLength(2);
});

test('成功查询后 Enter 重新搜索失败，重试仍从第一页查询', async ({ page }) => {
  await mountPicker(page, ['Command']);
  const picker = page.locator('#workflow-picker-test');
  await picker.getByRole('button', { name: '+ 选择一个 Command 加入… ▾' }).click();
  const search = picker.getByRole('searchbox', { name: '搜索 Command' });
  await search.fill('review');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await resolveQuery(page, 0, [option('first-review', 'Command')]);
  await expect(picker.locator('.command-picker-option')).toContainText('first-review');
  await search.press('Enter');
  await expect.poll(async () => (await calls(page)).length).toBe(2);
  await page.evaluate(() =>
    (window as unknown as { pickerProbe: PickerProbe }).pickerProbe.reject(1, '查询服务暂不可用'),
  );
  await expect(picker.getByRole('alert')).toContainText('查询服务暂不可用');
  await picker.getByRole('button', { name: '重试', exact: true }).click();
  await expect
    .poll(() => calls(page))
    .toEqual([
      { type: 'Command', keyword: 'review', pageNum: 1 },
      { type: 'Command', keyword: 'review', pageNum: 1 },
      { type: 'Command', keyword: 'review', pageNum: 1 },
    ]);
  await resolveQuery(page, 2, [option('retried-review', 'Command')]);
  await expect(picker.locator('.command-picker-option')).toHaveCount(1);
  await expect(picker.locator('.command-picker-option')).toContainText('retried-review');
});

test('资产搜索栏和候选行铺满面板，添加按钮使用紧凑高度', async ({ page }, testInfo) => {
  await mountPicker(page, ['Agent', 'Skill']);
  const picker = page.locator('#workflow-picker-test');
  const trigger = picker.getByRole('button', { name: '+ 从资产库添加 Agent / Skill… ▾' });
  await trigger.click();
  const panel = picker.locator('.picker-list');
  const search = picker.getByRole('searchbox', { name: '搜索 Agent' });
  const row = panel.locator('.asset-option');
  const add = row.getByRole('button', { name: '+ 添加', exact: true });
  await expect(row).toHaveCount(1);
  const [triggerBox, panelBox, searchBox, rowBox, addBox] = await Promise.all([
    trigger.boundingBox(),
    panel.boundingBox(),
    search.boundingBox(),
    row.boundingBox(),
    add.boundingBox(),
  ]);
  expect(Math.abs(panelBox!.width - triggerBox!.width)).toBeLessThanOrEqual(2);
  expect(searchBox!.width).toBeGreaterThan(400);
  expect(rowBox!.width).toBeGreaterThanOrEqual(panelBox!.width - 32);
  expect(addBox!.height).toBeLessThanOrEqual(30);
  for (const type of ['Agent', 'Skill']) {
    const box = await panel.getByRole('button', { name: type, exact: true }).boundingBox();
    expect(box!.height).toBeLessThanOrEqual(30);
  }
  await page.screenshot({ path: testInfo.outputPath('workflow-asset-search.png') });
});

test('真实向导搜索跨产品 Agent 后可分配节点，保存刷新仍保留资产快照', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.VITE_SKILL_MARKET_TRANSPORT === 'http',
    '使用本地 Mock 资产验证跨产品搜索和保存',
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('workflow-search-seeded')) return;
    sessionStorage.setItem('workflow-search-seeded', '1');
    localStorage.clear();
    localStorage.setItem(
      'skill-market-harness-capability-planning-v4-agent',
      JSON.stringify({
        catalog: [
          {
            id: 'remote-review-agent',
            name: 'external-review-agent',
            description: '跨产品代码评审 Agent，用于检查代码规范并输出评审建议。',
            level: '产品级',
            product: 'external-product',
            owner: '跨产品负责人 w30000002',
            department: '持续交付组',
            developOwner: '跨产品开发者 w30000003',
            developOwnerDepartment: '持续交付组',
            plannedCompleteDate: '2026-09-30',
            status: '已完成',
            versions: [],
            createdAt: '2026-09-07T00:00:00Z',
            updatedAt: '2026-09-07T00:00:00Z',
          },
        ],
        planning: [],
        catalogSeed: 3000,
        planningSeed: 3000,
      }),
    );
  });
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToScenarios();
  await harness.selectScenarioDepartment('平台工具组');
  await harness.scenariosPanel
    .getByRole('combobox', { name: '选择产品', exact: true })
    .selectOption({ label: 'harness-demo' });
  await harness.scenariosPanel
    .getByRole('tree', { name: '业务场景地图' })
    .getByText('接口开发体验', { exact: true })
    .click();
  await harness.openScenarioDesign();
  const wizard = harness.workflowDesignDialog;
  await wizard.getByLabel('场景编码 *').fill('harness-demo-remote-agent');
  await wizard.getByLabel('场景说明与目标').fill('从其他产品搜索并复用代码评审 Agent。');
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByLabel('流程名称').fill('跨产品资产搜索工作流');
  await wizard.getByRole('button', { name: '+ 添加环节', exact: true }).click();
  await wizard.getByPlaceholder('环节名称').fill('评审');
  await wizard.getByRole('button', { name: '添加环节', exact: true }).click();
  const stage = wizard.locator('.edit-stage').filter({ hasText: '评审' });
  await stage.getByRole('button', { name: '+ 添加节点', exact: true }).click();
  await stage.getByPlaceholder('节点名称').fill('检查代码');
  await stage.getByRole('button', { name: '添加节点', exact: true }).click();
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByRole('button', { name: '+ 选择一个 Command 加入… ▾' }).click();
  await wizard.getByRole('button', { name: /\/harness-demo-e2e-api/ }).click();
  await wizard.getByRole('button', { name: '下一步', exact: true }).click();
  await wizard.getByRole('button', { name: '+ 从资产库添加 Agent / Skill… ▾' }).click();
  await expect(
    wizard.locator('.asset-option').filter({ hasText: 'external-review-agent' }),
  ).toHaveCount(0);
  await wizard.getByRole('searchbox', { name: '搜索 Agent' }).fill('external-review');
  const remote = wizard.locator('.asset-option').filter({ hasText: 'external-review-agent' });
  await expect(remote).toBeVisible();
  await remote.getByRole('button', { name: '+ 添加', exact: true }).click();
  await expect(remote.getByRole('button', { name: '已在池中', exact: true })).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('workflow-capability-picker.png'),
  });
  await wizard.getByRole('button', { name: '清空搜索', exact: true }).click();
  await expect(
    wizard.locator('.asset-option').filter({ hasText: 'external-review-agent' }),
  ).toHaveCount(0);
  await wizard.locator('.picker-list').getByRole('button', { name: 'Skill', exact: true }).click();
  await wizard.locator('.picker-backdrop').click({ position: { x: 1, y: 1 } });
  await expect(wizard.locator('.chips').filter({ hasText: 'external-review-agent' })).toHaveCount(
    1,
  );
  await wizard
    .locator('.assignment')
    .filter({ hasText: '检查代码' })
    .locator('select')
    .selectOption({ label: 'external-review-agent（Agent）' });
  await wizard.getByRole('button', { name: '完成设计', exact: true }).click();
  await expect(wizard).toBeHidden();
  await expect(harness.workflowCard('跨产品资产搜索工作流')).toBeVisible();
  await page.reload();
  await expect(harness.topbarIdentity).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('harness-scenario-workspace-v2:mock:w30000001')!),
  );
  const workflow = saved.workflows.find(
    (item: { name: string }) => item.name === '跨产品资产搜索工作流',
  );
  expect(workflow.assets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ assetId: 'catalog:Agent:remote-review-agent' }),
    ]),
  );
  expect(workflow.stages[0].steps[0].assets).toHaveLength(1);
  expect(saved.assets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _id: 'catalog:Agent:remote-review-agent',
        name: 'external-review-agent',
        sourceId: 'remote-review-agent',
      }),
    ]),
  );
});
