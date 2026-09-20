import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/base';

async function mountDialog(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      json: {
        meta: { success: true },
        data: { content: '# devops-center-v2-valid-code-review-run' },
      },
    }),
  );
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
                version: '1.0.0',
              },
            ],
          });
      },
    }).mount('#test-host');
  });
}

test('Workflow Command 条目不显示序号', async ({ page }) => {
  await mountDialog(page);

  const dialog = page.getByRole('dialog', {
    name: '合并请求自动评审流程 Command 清单',
    exact: true,
  });
  const item = dialog.locator('.workflow-command-item');

  await expect(item.getByText('01', { exact: true })).toHaveCount(0);
});

test('Workflow Command 条目交换外层与内容区背景', async ({ page }) => {
  await mountDialog(page);

  const dialog = page.getByRole('dialog', {
    name: '合并请求自动评审流程 Command 清单',
    exact: true,
  });
  const item = dialog.locator('.workflow-command-item');
  const name = item.locator('.workflow-command-name');
  const description = item.locator('.workflow-command-description');

  await expect(item).toHaveCSS('background-color', 'rgb(2, 6, 23)');
  await expect(item).toHaveCSS('background-image', 'none');
  await expect(name).toHaveCSS('color', 'rgb(125, 211, 252)');
  await expect(description).toHaveCSS('color', 'rgb(203, 213, 225)');

  await item.getByRole('button', { name: /Command \/devops-center/ }).click();
  const content = item.locator('.workflow-command-content');
  await expect(content).toContainText('# devops-center-v2-valid-code-review-run');
  await expect(content).toHaveCSS('background-color', 'rgb(248, 250, 252)');
  await expect(content).toHaveCSS('color', 'rgb(31, 41, 55)');
});
