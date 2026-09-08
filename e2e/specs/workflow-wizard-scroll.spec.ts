import type { Locator } from '@playwright/test';
import { expect, test } from '../fixtures/base';

for (const type of ['Command', 'Agent', 'Skill'] as const) {
  test(`${type} 选择时弹窗各区域可滚动，长列表优先滚动并在边界衔接正文`, async ({ page }) => {
    test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '使用本地 Mock 工作区');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.route('**/skill-market/wizard-scroll-test', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
    );
    await page.goto('/skill-market/wizard-scroll-test');
    await page.evaluate(async () => {
      const vueUrl = '/skill-market/node_modules/.vite/deps/vue.js';
      const workspaceUrl = '/skill-market/src/composables/useHarnessScenarioWorkspace.ts';
      const componentUrl = '/skill-market/src/views/skill/BusinessScenarioDesignPage.vue';
      const { createApp, h, watch } = await import(vueUrl);
      const { createHarnessScenarioWorkspace } = await import(workspaceUrl);
      const { default: Component } = await import(componentUrl);
      createApp({
        setup() {
          const workspace = createHarnessScenarioWorkspace(() => ({
            ready: true,
            userId: 'wizard-scroll',
            departmentTree: [
              { id: 'delivery', deptCode: 'delivery', name: '持续交付组', children: [] },
            ],
            defaultDepartmentPath: ['持续交付组'],
            allowedDepartmentPaths: [['持续交付组']],
            restrictToAllowedDepartments: true,
          }));
          let seeded = false;
          watch(
            workspace.available,
            (ready: boolean) => {
              if (!ready || seeded) return;
              seeded = true;
              workspace.commands.splice(0);
              workspace.assets.splice(0);
              const workflow = workspace.ensureWorkflow(workspace.selectedScenarioId.value);
              workflow.commands = [
                {
                  id: 'entry',
                  commandId: 'entry',
                  name: '/harness-pipeline-e2e-entry',
                  description: '入口',
                },
              ];
              workflow.stages = Array.from({ length: 8 }, (_, index) => ({
                id: `stage-${index}`,
                name: `环节 ${index}`,
                description: '',
                order: index,
                steps: [
                  { id: `node-${index}`, name: '节点', description: '', order: 0, assets: [] },
                ],
              }));
            },
            { immediate: true },
          );
          workspace.queryCapabilityOptions = async (type: string, keyword: string) => ({
            list: Array.from({ length: keyword ? 20 : 3 }, (_, index) => ({
              _id: `${type}-${index}`,
              type,
              name: `${type} 候选 ${index}`,
              description: '用于验证滚轮交互的候选能力',
              owner: '',
              developer: '',
              version: '1.0.0',
            })),
            hasMore: false,
          });
          return () => h(Component, { workspace });
        },
      }).mount('#test-host');
    });
    await page
      .locator('.workflow-card .progress')
      .getByRole('button')
      .nth(type === 'Command' ? 2 : 3)
      .click();
    const wizard = page.getByRole('dialog', { name: 'Workflow 设计', exact: true });
    const content = wizard.locator('.wizard-page');
    const picker = wizard.locator('.workflow-capability-picker');
    await picker.locator('.capability-trigger').click();
    if (type === 'Skill') await picker.getByRole('button', { name: 'Skill', exact: true }).click();
    const results = picker.locator('.capability-results');
    await expect(results.locator('.capability-option')).toHaveCount(3);
    expect(await results.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(
      0,
    );
    expect(
      await content.evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeGreaterThan(0);
    const scrollTop = (locator: Locator) => locator.evaluate((element) => element.scrollTop);
    const wheelOver = async (locator: Locator, delta: number) => {
      const box = await locator.boundingBox();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.wheel(0, delta);
    };
    for (const area of [
      results,
      picker.getByRole('searchbox'),
      wizard.locator('header'),
      wizard.locator('nav'),
      wizard.locator('footer'),
    ]) {
      await area.scrollIntoViewIfNeeded();
      const before = await scrollTop(content);
      await wheelOver(area, before > 0 ? -100 : 100);
      await expect.poll(() => scrollTop(content)).not.toBe(before);
    }
    await picker.getByRole('searchbox').fill('many');
    await expect(results.locator('.capability-option')).toHaveCount(20);
    await results.scrollIntoViewIfNeeded();
    const outerBefore = await scrollTop(content);
    await wheelOver(results, 100);
    await expect.poll(() => scrollTop(results)).toBeGreaterThan(0);
    expect(await scrollTop(content)).toBe(outerBefore);
    await results.evaluate((element) => {
      element.scrollTop = 0;
    });
    await wheelOver(results, -100);
    await expect.poll(() => scrollTop(content)).toBeLessThan(outerBefore);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}
