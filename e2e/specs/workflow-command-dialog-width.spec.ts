import { expect, test, type Page } from '@playwright/test';

async function mountDialog(page: Page, isHttp: boolean): Promise<void> {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      json: {
        meta: { success: true },
        data: {
          flowName: '合并请求自动评审流程',
          flowDescription: '',
          sceneExtensionCode: 'review-flow',
          secondSceneDescription: '',
          commands: [],
          assetPool: [],
          stages: [],
          steps: [],
          nextStep: 0,
          allDone: false,
        },
      },
    }),
  );
  await page.route('**/skill-market/workflow-command-width-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto('/skill-market/workflow-command-width-test');
  await page.evaluate(async (httpMode) => {
    const { createApp, h } = await import('/skill-market/node_modules/.vite/deps/vue.js');
    const { default: WorkflowCommandsDialog } =
      await import('/skill-market/src/components/skill/WorkflowCommandsDialog.vue');
    createApp({
      setup() {
        return () =>
          h(WorkflowCommandsDialog, {
            open: true,
            workflowName: '合并请求自动评审流程',
            isHttp: httpMode,
            userId: 'workflow-command-width',
            dimType: '产品级',
            dimCode: 'devops-center-v2',
            dimName: 'devops-center-v2',
            firstScene: '研发提效',
            secondScene: '代码审查',
            initialCommands: [
              {
                name: '/devops-center-v2-valid-code-review-run',
                description: '合并请求自动评审流程的执行入口。',
                version: '1.0.0',
              },
            ],
          });
      },
    }).mount('#test-host');
  }, isHttp);
}

for (const isHttp of [false, true]) {
  test(`${isHttp ? 'HTTP' : 'mock'} 模式的 Workflow Command 弹窗宽度为 1080px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountDialog(page, isHttp);

    const dialog = page.getByRole('dialog', {
      name: '合并请求自动评审流程 Command 清单',
      exact: true,
    });
    await expect(dialog).toHaveCSS('width', '1080px');
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - 720)).toBeLessThan(1);
  });
}
