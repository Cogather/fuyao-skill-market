import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

test('拖拽一级和二级场景后保存顺序，刷新后保持一致且保留工作流', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToScenarios();
  await harness.openScenarioDesign();
  await harness.workflowDesignDialog.getByRole('button', { name: '关闭 Workflow 设计' }).click();
  const workflow = harness.workflowCard('代码生成作业流');
  const workflowId = await workflow.getAttribute('data-workflow-id');
  expect(workflowId).toBeTruthy();

  const tree = harness.scenariosPanel.getByRole('tree', { name: '业务场景地图' });
  const row = (name: string) =>
    tree.locator('.tree-node').filter({
      has: page.locator('b').filter({ hasText: new RegExp(`^${name}$`) }),
    });
  const research = tree.locator('.tree-item').filter({
    has: page.locator('.tree-node > b').filter({ hasText: /^研发提效$/ }),
  });
  await row('代码生成')
    .getByLabel('拖动排序代码生成')
    .dragTo(row('代码审查'), {
      targetPosition: { x: 90, y: 4 },
    });
  await expect(research.locator('.child > b')).toHaveText([
    '接口开发',
    'SQL优化',
    '单元测试',
    '代码生成',
    '代码审查',
  ]);
  await expect(harness.scenariosPanel.getByRole('status')).toContainText('顺序已保存');
  await expect(workflow).toHaveAttribute('data-workflow-id', workflowId!);
  await expect(row('代码生成')).toHaveAttribute('aria-selected', 'true');

  await row('质量保障')
    .getByLabel('拖动排序质量保障')
    .dragTo(row('研发提效'), {
      targetPosition: { x: 90, y: 4 },
    });
  await expect(tree.locator('.tree-item > .tree-node > b').first()).toHaveText('质量保障');

  await page.reload();
  await harness.switchToScenarios();
  await expect(tree.locator('.tree-item > .tree-node > b').first()).toHaveText('质量保障');
  await expect(research.locator('.child > b')).toHaveText([
    '接口开发',
    'SQL优化',
    '单元测试',
    '代码生成',
    '代码审查',
  ]);
  await row('代码生成').click();
  await expect(workflow).toHaveAttribute('data-workflow-id', workflowId!);
});

test('拖拽不允许跨父级移动，原有上下箭头仍可保存排序', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToScenarios();
  const tree = harness.scenariosPanel.getByRole('tree', { name: '业务场景地图' });
  const source = tree.locator('.tree-node').filter({
    has: page.locator('b').filter({ hasText: /^代码生成$/ }),
  });
  const target = tree.locator('.tree-node').filter({
    has: page.locator('b').filter({ hasText: /^测试设计$/ }),
  });
  const research = tree.locator('.tree-item').filter({
    has: page.locator('.tree-node > b').filter({ hasText: /^研发提效$/ }),
  });
  await source.getByLabel('拖动排序代码生成').dragTo(target);
  await expect(research.locator('.child > b')).toHaveText([
    '代码生成',
    '接口开发',
    'SQL优化',
    '单元测试',
    '代码审查',
  ]);
  await expect(tree.locator('.is-dragging, .drop-before, .drop-after')).toHaveCount(0);
  await source.hover();
  await source.getByRole('button', { name: '下移代码生成', exact: true }).click();
  await expect(research.locator('.child > b')).toHaveText([
    '接口开发',
    '代码生成',
    'SQL优化',
    '单元测试',
    '代码审查',
  ]);
});
