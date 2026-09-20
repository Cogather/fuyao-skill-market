import { expect, test } from '../fixtures/base';

test('Workflow Command 条目使用深色命令卡片展示', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/skill-market/workflow-command-style-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="test-host"></div>' }),
  );
  await page.goto('/skill-market/workflow-command-style-test');

  await page.evaluate(async () => {
    const { createApp, h } = await import('/skill-market/node_modules/.vite/deps/vue.js');
    const { default: WorkflowCommandsDialog } =
      await import('/skill-market/src/components/skill/WorkflowCommandsDialog.vue');
    createApp({
      setup() {
        return () =>
          h(WorkflowCommandsDialog, {
            open: true,
            workflowName: '合并请求自动评审流程',
            isHttp: false,
            userId: 'workflow-command-style',
            dimType: '产品级',
            dimCode: 'devops-center-v2',
            dimName: 'devops-center-v2',
            firstScene: '研发提效',
            secondScene: '代码审查',
            initialCommands: [
              {
                name: '/devops-center-v2-valid-code-review-run',
                description: '合并请求自动评审流程的执行入口。',
                version: null,
              },
            ],
          });
      },
    }).mount('#test-host');
  });

  const dialog = page.getByRole('dialog', {
    name: '合并请求自动评审流程 Command 清单',
    exact: true,
  });
  const item = dialog.locator('.workflow-command-item');
  const name = item.locator('.workflow-command-name');
  const description = item.locator('.workflow-command-description');

  await expect(item).toHaveCSS('background-color', 'rgb(15, 23, 42)');
  await expect(name).toHaveCSS('color', 'rgb(125, 211, 252)');
  await expect(description).toHaveCSS('color', 'rgb(203, 213, 225)');

  await item.getByRole('button', { name: /Command \/devops-center/ }).click();
  const unavailable = item.getByText('暂无已发布版本，暂不能查看内容', { exact: true });
  await expect(unavailable).toHaveCSS('background-color', 'rgb(30, 41, 59)');
  await expect(unavailable).toHaveCSS('color', 'rgb(148, 163, 184)');
});
