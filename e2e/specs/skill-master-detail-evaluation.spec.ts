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

  await expect(dialog.getByLabel('详情版本')).toBeVisible();
  await expect(dialog.getByText('评估模型', { exact: true })).toBeVisible();
  await expect(dialog.getByText('fuyao-DeepSeekV4-PD', { exact: true })).toBeVisible();
  await expect(dialog.locator('.catalog-detail-version-meta em')).toHaveText(/更新$/);
  await expect(dialog.locator('.catalog-detail-evaluation-meta small')).toHaveCSS(
    'white-space',
    'nowrap',
  );
  await expect(dialog.locator('.catalog-detail-meta > *')).toHaveCount(4);
  await expect(dialog.locator('.catalog-detail-heading-title .status-badge')).toBeVisible();
  await expect(dialog.locator('.catalog-detail-meta .status-badge')).toHaveCount(0);
  await expect
    .poll(() =>
      dialog
        .locator('.catalog-detail-header')
        .evaluate((element) => Math.round(element.getBoundingClientRect().height)),
    )
    .toBeLessThanOrEqual(90);
  await expect(dialog.locator('.catalog-detail-version-filter')).toHaveCount(0);
  await expect(detailTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('tabpanel', { name: '详情' })).toBeVisible();

  await evaluationTab.click();
  await expect(evaluationTab).toHaveAttribute('aria-selected', 'true');

  const evaluationPanel = dialog.getByRole('tabpanel', { name: '评估' });
  await expect(evaluationPanel).toBeVisible();
  await expect(evaluationPanel.getByText('评估模型', { exact: true })).toHaveCount(0);
  await expect(evaluationPanel.getByText('综合得分', { exact: true })).toBeVisible();
  await expect(evaluationPanel.getByText('得分率 95.8%', { exact: true })).toBeVisible();
  await expect(evaluationPanel.locator('.catalog-evaluation-profile')).toHaveCount(0);
  const summaryCards = evaluationPanel.locator('.catalog-evaluation-summary > article');
  await expect(summaryCards).toHaveCount(3);
  const scoreCard = evaluationPanel.locator('.catalog-evaluation-score-card');
  await expect(evaluationPanel.getByText('质量等级', { exact: true })).toHaveCount(0);
  await expect(scoreCard.locator('.catalog-evaluation-grade')).toHaveText('A');
  await expect(scoreCard.getByText('优秀', { exact: true })).toHaveCount(0);
  await expect
    .poll(async () => {
      const topPositions = await summaryCards.evaluateAll((elements) =>
        elements.map((element) => Math.round(element.getBoundingClientRect().top)),
      );
      return new Set(topPositions).size;
    })
    .toBe(1);
  const riskCountCard = evaluationPanel.locator('.catalog-evaluation-count-card.is-risk');
  await expect(riskCountCard.getByText('风险问题数', { exact: true })).toBeVisible();
  await expect(riskCountCard.getByText('7', { exact: true })).toBeVisible();
  const adviceCountCard = evaluationPanel.locator('.catalog-evaluation-count-card.is-advice');
  await expect(adviceCountCard.getByText('改进建议数', { exact: true })).toBeVisible();
  await expect(adviceCountCard.getByText('8', { exact: true })).toBeVisible();
  await expect(evaluationPanel.getByText('改进建议（Top 3）', { exact: true })).toBeVisible();
  const topAdviceCards = evaluationPanel.locator('.catalog-evaluation-top-list article');
  const adviceCards = evaluationPanel.locator('.catalog-evaluation-advice-grid article');
  await expect(topAdviceCards).toHaveCount(3);
  await expect(adviceCards).toHaveCount(0);
  await expect(topAdviceCards.nth(0).getByText('1', { exact: true })).toBeVisible();
  await expect(topAdviceCards.nth(1).getByText('2', { exact: true })).toBeVisible();
  await expect(topAdviceCards.nth(2).getByText('3', { exact: true })).toBeVisible();
  await expect(topAdviceCards.locator('small, strong')).toHaveCount(0);
  const firstTopAdviceDescription = topAdviceCards.nth(0).locator('p');
  await expect(firstTopAdviceDescription).toHaveAttribute(
    'title',
    '发布风险扫描 Skill 的目标、输入输出和适用场景描述较完整，建议补充失败示例。',
  );
  await expect
    .poll(() =>
      firstTopAdviceDescription.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('-webkit-line-clamp'),
      ),
    )
    .toBe('2');
  await expect
    .poll(() =>
      firstTopAdviceDescription.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          Math.abs(
            element.getBoundingClientRect().height - Number.parseFloat(style.lineHeight) * 2,
          ) < 1
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(async () => {
      const widths = await topAdviceCards.evaluateAll((elements) =>
        elements.map((element) => Math.round(element.getBoundingClientRect().width)),
      );
      return new Set(widths).size;
    })
    .toBe(1);
  await evaluationPanel.getByRole('button', { name: '查看全部改进建议（8）→' }).click();
  await expect(
    evaluationPanel.getByRole('heading', { name: '改进建议', exact: true }),
  ).toBeVisible();
  await expect(topAdviceCards).toHaveCount(0);
  await expect(adviceCards).toHaveCount(8);
  await expect(adviceCards.locator('strong')).toHaveCount(0);
  await expect(
    adviceCards
      .nth(0)
      .getByText(
        '关联维度：目标与边界清晰度；关联问题：版本号表明 Skill 可能仍处于早期开发阶段，需要补充实战验证说明。',
        { exact: true },
      ),
  ).toBeVisible();
  await expect(
    adviceCards.nth(1).getByText('关联维度：安全与权限约束', { exact: true }),
  ).toBeVisible();
  await expect(
    adviceCards.nth(2).getByText('关联问题：未对输入文件类型与大小进行校验。', { exact: true }),
  ).toBeVisible();
  const firstAdviceDescription = adviceCards.nth(0).locator('p');
  await expect(firstAdviceDescription).toHaveAttribute(
    'title',
    '发布风险扫描 Skill 的目标、输入输出和适用场景描述较完整，建议补充失败示例。',
  );
  await expect
    .poll(() =>
      firstAdviceDescription.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('-webkit-line-clamp'),
      ),
    )
    .toBe('2');
  await expect
    .poll(async () => {
      const heights = await adviceCards
        .locator('p')
        .evaluateAll((elements) =>
          elements.map((element) => Math.round(element.getBoundingClientRect().height)),
        );
      return new Set(heights).size;
    })
    .toBe(1);
  const unlinkedAdviceMeta = adviceCards
    .filter({ hasText: '记录输入文件、处理结果、异常堆栈与执行耗时。' })
    .locator('small');
  await expect(unlinkedAdviceMeta).toHaveClass(/is-empty/);
  await expect
    .poll(() => unlinkedAdviceMeta.evaluate((element) => getComputedStyle(element).visibility))
    .toBe('hidden');
  await expect
    .poll(async () => {
      const associationTexts = await adviceCards.locator('small').allTextContents();
      return associationTexts.some((text) => /\b(?:D\d+|F\d+|SEC-\d+)\b/.test(text));
    })
    .toBe(false);

  await expect(evaluationPanel.getByText('评估问题', { exact: true })).toBeVisible();
  const issueCards = evaluationPanel.locator('.catalog-evaluation-issue-grid article');
  await expect(issueCards).toHaveCount(2);
  await expect(issueCards.first().getByText('高风险', { exact: true })).toBeVisible();
  await expect(issueCards.first().getByText('SEC-003', { exact: true })).toBeVisible();
  await expect(issueCards.first().locator('h5')).toHaveAttribute(
    'title',
    'Skill 允许直接执行未经确认的删除命令。',
  );
  await evaluationPanel.getByRole('button', { name: '查看全部问题（7）→' }).click();
  await expect(issueCards).toHaveCount(7);
  await expect(evaluationPanel.getByText('各维度评分', { exact: true })).toBeVisible();
  const dimensionCards = evaluationPanel.locator('.catalog-evaluation-dimensions article');
  await expect(dimensionCards).toHaveCount(10);
  await expect(dimensionCards.getByText(/^D\d+$/, { exact: true })).toHaveCount(0);
  await expect(
    dimensionCards.first().locator('.catalog-evaluation-dimension-detail p'),
  ).toHaveAttribute('title', '目标与边界清晰度覆盖较完整，当前得分 17/20。');
  await expect
    .poll(() => evaluationPanel.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
});
