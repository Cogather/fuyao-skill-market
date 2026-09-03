import { expect, test } from '../fixtures/base';
import { APP_BASE_PATH } from '../helpers/constants';

test('Skill 清单详情支持在详情与评估页签间切换', async ({ page }) => {
  await page.setViewportSize({ width: 1090, height: 869 });
  await page.goto(`${APP_BASE_PATH}/harness-management`);

  await page.getByRole('tab', { name: 'Skill 规划', exact: true }).click();
  await page.getByRole('button', { name: 'Skill 清单', exact: true }).click();
  await page.getByRole('button', { name: '查看 Skill', exact: true }).first().click();

  const dialog = page.getByRole('dialog');
  const detailTab = dialog.getByRole('tab', { name: '详情', exact: true });
  const evaluationTab = dialog.getByRole('tab', { name: '评估', exact: true });

  await expect(detailTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('tabpanel', { name: '详情' })).toBeVisible();

  await evaluationTab.click();
  await expect(evaluationTab).toHaveAttribute('aria-selected', 'true');

  const evaluationPanel = dialog.getByRole('tabpanel', { name: '评估' });
  await expect(evaluationPanel).toBeVisible();
  await expect(evaluationPanel.getByText('综合得分', { exact: true })).toBeVisible();
  await expect(evaluationPanel.getByText('优先改进（Top 3）', { exact: true })).toBeVisible();
  const adviceCards = evaluationPanel.locator('.catalog-evaluation-advice-grid article');
  await expect(adviceCards).toHaveCount(3);
  await evaluationPanel.getByRole('button', { name: '查看全部改进建议（8）→' }).click();
  await expect(evaluationPanel.getByText('优先改进', { exact: true })).toBeVisible();
  await expect(adviceCards).toHaveCount(8);

  await expect(evaluationPanel.getByText('安全与主要问题', { exact: true })).toBeVisible();
  const issueCards = evaluationPanel.locator('.catalog-evaluation-issue-grid article');
  await expect(issueCards).toHaveCount(2);
  await evaluationPanel.getByRole('button', { name: '查看全部问题（7）→' }).click();
  await expect(issueCards).toHaveCount(7);
  await expect(evaluationPanel.getByText('各维度表现', { exact: true })).toBeVisible();
  await expect
    .poll(() => evaluationPanel.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
});
