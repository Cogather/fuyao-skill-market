import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('旧 Extension 场景树在 mock 模式也只读取 readyStatus，缺省不显示历史版本或推导状态', async ({
  page,
}) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '需要 mock 模式');
  await page.goto(`${APP_BASE_PATH}/harness-management`);
  await page.locator('#harness-tab-capabilities').click();
  await page.locator('#capability-management-tab-extension').click();
  const scenes = page.locator('.scene-list .scene-button');
  await expect(scenes).toHaveCount(8);
  // 默认 mock 数据有成功历史、发布中和组件就绪信息，但没有 readyStatus。
  await expect(scenes.locator('.tree-status')).toHaveCount(0);
});
