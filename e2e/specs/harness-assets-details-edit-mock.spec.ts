import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test.describe('资产详情统一编辑 Mock', () => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '需要 Mock 模式');
  for (const type of ['Agent', 'Skill', 'Command']) {
    test(`${type} 长描述和多条人员结果不撑高编辑区域`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1920, height: 1112 });
      await page.goto(`${APP_BASE_PATH}/harness-management`);
      await page.locator('#harness-tab-assets').click();
      await page.getByRole('button', { name: type, exact: true }).click();
      await page.locator('.asset-card').first().getByRole('heading').click();
      await page.getByRole('button', { name: '编辑', exact: true }).click();
      const description = page.getByRole('textbox', { name: '描述', exact: true });
      await description.fill(
        '自动校验接口契约、请求参数和返回结构，输出可执行的差异清单。'.repeat(40),
      );
      await expect(description).toHaveAttribute('rows', '2');
      await expect(description).toHaveCSS('resize', 'none');
      expect(await description.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const layout = async () => ({
        people: await page.locator('.asset-detail__people').boundingBox(),
        owner: await page.getByRole('combobox', { name: '责任人', exact: true }).boundingBox(),
        developer: await page
          .getByRole('combobox', { name: '开发责任人', exact: true })
          .boundingBox(),
        version: await page.locator('.asset-detail__version').boundingBox(),
        tabs: await page.locator('.asset-detail__tabs').boundingBox(),
      });
      const bounds = await layout();
      for (const label of ['责任人', '开发责任人']) {
        const input = page.getByRole('combobox', { name: label, exact: true });
        await page.getByRole('button', { name: `清空${label}`, exact: true }).click();
        await expect(page.getByRole('status')).toBeVisible();
        expect(await layout()).toEqual(bounds);
        await input.fill('w');
        await expect(page.getByRole('option')).toHaveCount(9);
        expect(await layout()).toEqual(bounds);
        const popup = page.locator('.workflow-person-picker__popup');
        await expect(popup).toHaveCSS('position', 'fixed');
        expect(await popup.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`asset-${type}-${label}-overlay.png`) });
        await page.getByRole('option').last().click();
        await expect(input).toHaveValue('刘岚 w30000009');
        expect(await layout()).toEqual(bounds);
        await expect(page.getByRole('listbox')).toHaveCount(0);
      }
    });

    test(`${type} 保存后页面刷新仍保留改动`, async ({ page }) => {
      await page.goto(`${APP_BASE_PATH}/harness-management`);
      await page.locator('#harness-tab-assets').click();
      await page.getByRole('button', { name: type, exact: true }).click();
      await page.locator('.asset-card').first().getByRole('heading').click();
      await page.getByRole('button', { name: '编辑', exact: true }).click();
      const name = `harness-pipeline-${type.toLowerCase()}-saved-details`;
      await page.getByRole('textbox', { name: '名称', exact: true }).fill(name);
      await page.getByRole('textbox', { name: '描述', exact: true }).fill('持久化后的描述');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.locator('#asset-detail-title')).toHaveText(name);
      await page.reload();
      await page.locator('#harness-tab-assets').click();
      await page.getByRole('button', { name: type, exact: true }).click();
      await page.locator('.asset-card').getByRole('heading', { name, exact: true }).click();
      await expect(page.locator('.asset-detail__description')).toHaveText('持久化后的描述');
    });
  }
});
