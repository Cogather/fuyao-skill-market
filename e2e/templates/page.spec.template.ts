import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

/**
 * 【新页面用例模板】页面新增/改版时复制本文件到 e2e/specs/，改名后按注释替换。
 *
 * 完整流程见 skills/frontend-page-e2e/SKILL.md：
 * 1. e2e/pages/ 新建 <PageName>.page.ts（定位器与语义化动作）
 * 2. e2e/contexts/ 新建 <page>.md（页面专属知识，从源码提取，参考 templates/context.template.md）
 * 3. 复制本模板替换占位内容——无需注册任何 fixture，新增页面零额外改动
 * 4. 冒烟断言打 @smoke；npm run test:e2e 连续 3 次全绿后提交
 */

// —— 示例 Page Object（正式编写时移到 e2e/pages/ 目录）——
class ExamplePage {
  readonly page: Page;
  readonly title: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // 选择器优先级：role/可见文本 > placeholder/aria-label > data-testid
    this.title = page.getByRole('heading', { name: '示例页面标题' });
    this.submitButton = page.getByRole('button', { name: '提交' });
  }

  async goto(): Promise<void> {
    // 路由必须带 APP_BASE_PATH 前缀（与 VITE_BASE 保持一致）
    await this.page.goto(`${APP_BASE_PATH}/example-route`);
    await this.title.waitFor();
  }
}

test.describe('示例页面', () => {
  let examplePage: ExamplePage;

  test.beforeEach(async ({ page }) => {
    examplePage = new ExamplePage(page);
  });

  test('@smoke 页面可打开', async () => {
    await examplePage.goto();
    await expect(examplePage.title).toBeVisible();
  });

  test('核心交互走通', async () => {
    await examplePage.goto();

    // 常见模式：
    // - 点击后等待结果：await expect(result).toBeVisible()（禁止裸 waitForTimeout）
    // - 表单填写：await input.fill(...) / selectOption(...)
    // - 弹窗：await dialog.accept() / dismiss()；页面内弹层用 getByRole('dialog')
    // - 网络等待：await page.waitForResponse((r) => r.url().includes('/api/xxx'))
    await examplePage.submitButton.click();
    await expect(examplePage.page.getByText('提交成功')).toBeVisible();
  });
});
