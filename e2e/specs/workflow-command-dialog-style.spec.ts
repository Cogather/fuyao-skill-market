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

test('Workflow Command 弹窗标题区不保留英文小标题', async ({ page }) => {
  await mountDialog(page);

  const dialog = page.getByRole('dialog', {
    name: '合并请求自动评审流程 Command 清单',
    exact: true,
  });

  await expect(dialog.locator('.workflow-command-eyebrow')).toHaveCount(0);
  await expect(dialog.getByText('WORKFLOW COMMANDS', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('.workflow-command-header h2')).toContainText(
    '合并请求自动评审流程',
  );
});

test('Workflow Command 条目使用白底浅灰边框与浅蓝展开态', async ({ page }) => {
  await mountDialog(page);

  const dialog = page.getByRole('dialog', {
    name: '合并请求自动评审流程 Command 清单',
    exact: true,
  });
  const list = dialog.locator('.workflow-command-list');
  const item = dialog.locator('.workflow-command-item');
  const summary = item.locator('.workflow-command-summary');
  const name = item.locator('.workflow-command-name');
  const description = item.locator('.workflow-command-description');
  const version = item.locator('.workflow-command-version');

  // 收起态：白底 + 浅灰边框 + 8px 圆角，条目间距 8px
  await expect(list).toHaveCSS('gap', '8px');
  await expect(item).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(item).toHaveCSS('background-image', 'none');
  await expect(item).toHaveCSS('border-top-color', 'rgb(229, 231, 235)');
  await expect(item).toHaveCSS('border-radius', '8px');
  await expect(summary).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(summary).toHaveCSS('padding-left', '16px');

  // 文字层级：主文字 #1F2937，Command 名称用强调色 #2563EB，次文字 #6B7280
  await expect(name).toHaveCSS('color', 'rgb(37, 99, 235)');
  await expect(name).toHaveCSS('font-size', '14px');
  await expect(description).toHaveCSS('color', 'rgb(107, 114, 128)');
  await expect(version).toHaveCSS('background-color', 'rgb(243, 244, 246)');
  await expect(version).toHaveCSS('color', 'rgb(107, 114, 128)');
  await expect(version).toHaveCSS('border-top-width', '0px');

  await item.getByRole('button', { name: /Command \/devops-center/ }).click();
  const contentWrap = item.locator('.workflow-command-content-wrap');
  const content = item.locator('.workflow-command-content');
  await expect(content).toContainText('# devops-center-v2-valid-code-review-run');

  // 展开态：标题行浅蓝、正文浅灰，两者共用一个容器，中间仅一条细分隔线
  await expect(summary).toHaveCSS('background-color', 'rgb(240, 245, 255)');
  await expect(contentWrap).toHaveCSS('background-color', 'rgb(247, 248, 250)');
  await expect(contentWrap).toHaveCSS('border-top-color', 'rgb(229, 231, 235)');
  await expect(contentWrap).toHaveCSS('border-top-width', '1px');
  await expect(contentWrap).toHaveCSS('padding-top', '0px');
  await expect(contentWrap).toHaveCSS('padding-left', '0px');

  // 正文不再有外圈深色留边，也不再有内层卡片边框
  await expect(content).toHaveCSS('background-color', 'rgb(247, 248, 250)');
  await expect(content).toHaveCSS('color', 'rgb(31, 41, 55)');
  await expect(content).toHaveCSS('border-top-width', '0px');
  await expect(content).toHaveCSS('font-size', '14px');
  await expect(content).toHaveCSS('line-height', '22px');
});
