import { expect, test } from '../fixtures/base';

test('工作区在数据层限制二级场景单工作流，并在权限失效后拒绝创建', async ({ page }) => {
  await page.goto('/skill-market/harness-management');
  const result = await page.evaluate(async () => {
    const vuePath = '/skill-market/node_modules/.vite/deps/vue.js';
    const workspacePath = '/skill-market/src/composables/useHarnessScenarioWorkspace.ts';
    const { reactive, effectScope, watch, nextTick } = await import(vuePath);
    const { createHarnessScenarioWorkspace } = await import(workspacePath);
    const context = reactive({
      ready: true,
      userId: 'workspace-invariant-test',
      departmentTree: [{ id: 'test-dept', name: '持续交付组' }],
      defaultDepartmentPath: ['持续交付组'],
      allowedDepartmentPaths: [['持续交付组']],
      restrictToAllowedDepartments: true,
    });
    const scope = effectScope();
    const workspace = scope.run(() => createHarnessScenarioWorkspace(() => context));
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('工作区未加载完成')), 5000);
      const stop = watch(workspace.available, (ready: boolean) => {
        if (!ready) return;
        clearTimeout(timeout);
        stop();
        resolve();
      });
    });
    const root = workspace.scenarios.find((item: { level: number }) => item.level === 1);
    const leaf = workspace.scenarios.find((item: { name: string }) => item.name === '代码生成');
    const sibling = workspace.scenarios.find((item: { name: string }) => item.name === '接口开发');
    let rootRejected = false;
    try {
      workspace.ensureWorkflow(root._id);
    } catch {
      rootRejected = true;
    }
    const first = workspace.ensureWorkflow(leaf._id);
    const repeated = workspace.ensureWorkflow(leaf._id);
    const singletonCount = workspace.workflows.filter(
      (item: { scenarioId: string }) => item.scenarioId === leaf._id,
    ).length;
    context.ready = false;
    await nextTick();
    let unavailableRejected = false;
    try {
      workspace.ensureWorkflow(sibling._id);
    } catch {
      unavailableRejected = true;
    }
    const actual = {
      rootRejected,
      sameWorkflow: first._id === repeated._id,
      singletonCount,
      unavailableRejected,
      departmentsCleared: workspace.departments.length === 0,
      scenariosCleared: workspace.scenarios.length === 0,
    };
    scope.stop();
    return actual;
  });
  expect(result).toEqual({
    rootRejected: true,
    sameWorkflow: true,
    singletonCount: 1,
    unavailableRejected: true,
    departmentsCleared: true,
    scenariosCleared: true,
  });
});
