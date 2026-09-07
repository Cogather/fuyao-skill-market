import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

/**
 * Harness 管理页冒烟：只验证"能打开 + tab 切换核心路径走通"。
 * 页面演进时优先保证本文件全绿。
 */
test.describe('Harness 管理冒烟', { tag: '@smoke' }, () => {
  let harnessPage: HarnessManagementPage;

  test.beforeEach(async ({ page }) => {
    harnessPage = new HarnessManagementPage(page);
  });

  test('页面打开并渲染顶部工作台', async () => {
    await harnessPage.goto();

    await expect(harnessPage.topbarIdentity).toBeVisible();
    await expect(harnessPage.tabList).toBeVisible();
    const tabs = harnessPage.tabList.getByRole('tab');
    await expect(tabs.nth(0)).toHaveText('业务场景设计');
    await expect(tabs.nth(1)).toHaveText('Harness 工作流');
    await expect(harnessPage.tabTasks).toBeVisible();
  });

  test('切换到业务场景设计台并可打开 Workflow 设计向导', async () => {
    await harnessPage.goto();
    await harnessPage.switchToScenarios();

    await expect(harnessPage.tabScenarios).toHaveAttribute('aria-selected', 'true');
    await expect(harnessPage.scenariosPanel).toBeVisible();
    await expect(harnessPage.scenariosHeading).toBeVisible();
    await expect(harnessPage.codeGenerationScenario).toBeVisible();
    await expect(harnessPage.startWorkflowDesignButton).toBeVisible();

    await harnessPage.openScenarioDesign();

    await expect(harnessPage.workflowDesignDialog).toBeVisible();
    await expect(harnessPage.workflowDesignDialog).toBeFocused();
    for (const step of ['业务场景分析', 'Workflow 规划', 'Command 入口', 'Skill / Agent 集成']) {
      await expect(harnessPage.workflowDesignDialog.getByText(step, { exact: true })).toBeVisible();
    }
    await harnessPage.page.keyboard.press('Shift+Tab');
    await expect(harnessPage.workflowDesignDialog.locator(':focus')).toHaveCount(1);
    await harnessPage.page.keyboard.press('Tab');
    await expect(
      harnessPage.workflowDesignDialog.getByRole('button', { name: '关闭 Workflow 设计' }),
    ).toBeFocused();
    await harnessPage.page.keyboard.press('Escape');
    await expect(harnessPage.workflowDesignDialog).toBeHidden();
    await expect(harnessPage.continueWorkflowDesignButton).toBeFocused();
  });

  test('开始设计 Workflow 按钮保持紧凑', async () => {
    await harnessPage.goto();
    await harnessPage.switchToScenarios();

    const buttonBox = await harnessPage.startWorkflowDesignButton.boundingBox();

    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeLessThanOrEqual(40);
  });

  test('缺少 crypto.randomUUID 时仍可开始 Workflow 设计', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.crypto, 'randomUUID', {
        configurable: true,
        value: undefined,
      });
    });
    await harnessPage.goto();
    await harnessPage.switchToScenarios();

    await harnessPage.startWorkflowDesignButton.click();

    await expect(harnessPage.workflowDesignDialog).toBeVisible();
  });

  test('前往场景设计按钮使用紧凑内边距', async () => {
    await harnessPage.goto();
    await harnessPage.switchToWorkflows();

    const padding = await harnessPage.workflowsToScenarioButton.evaluate((button) => {
      const style = getComputedStyle(button);
      return {
        block: Number.parseFloat(style.paddingTop),
        inline: Number.parseFloat(style.paddingRight),
      };
    });

    expect(padding.block).toBeLessThanOrEqual(6);
    expect(padding.inline).toBeLessThanOrEqual(14);
  });

  test('Harness 工作流从空态同步场景草稿并按发布状态筛选', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await harnessPage.goto();
    await harnessPage.switchToWorkflows();
    await harnessPage.selectWorkflowProduct('harness-pipeline');

    await expect(harnessPage.tabWorkflows).toHaveAttribute('aria-selected', 'true');
    await expect(harnessPage.workflowsHeading).toBeVisible();
    await expect(harnessPage.workflowsPanel.getByText('暂无工作流', { exact: true })).toBeVisible();
    await expect(harnessPage.workflowsTable).toHaveCount(0);

    await harnessPage.openScenariosFromWorkflows();
    await expect(harnessPage.codeGenerationScenario).toBeVisible();
    await harnessPage.openScenarioDesign();
    await page.keyboard.press('Escape');
    await expect(harnessPage.workflowDesignDialog).toBeHidden();
    await harnessPage.switchToWorkflows();

    await expect(harnessPage.workflowsTable.getByRole('columnheader')).toHaveText([
      '名称',
      '产品',
      '部门',
      '状态',
      '所属业务场景',
      'Command 入口',
    ]);
    await expect(harnessPage.workflowStatusButton('全部')).toHaveText(/全部\s*1/);
    await expect(harnessPage.workflowStatusButton('已发布')).toHaveText(/已发布\s*0/);
    await expect(harnessPage.workflowStatusButton('设计中')).toHaveText(/设计中\s*1/);

    const draftRow = harnessPage.workflowInventoryRow('代码生成作业流');
    await expect(draftRow.getByRole('cell')).toHaveText([
      '代码生成作业流',
      'harness-pipeline',
      '持续交付组',
      '设计中',
      '研发提效 / 代码生成',
      '0 个',
    ]);
    await expect(harnessPage.workflowsPreviousPageButton).toBeDisabled();
    await expect(harnessPage.workflowsNextPageButton).toBeDisabled();

    await page.screenshot({
      path: testInfo.outputPath('harness-workflows-1920.png'),
      fullPage: true,
      animations: 'disabled',
    });

    await harnessPage.workflowStatusButton('已发布').click();
    await expect(
      harnessPage.workflowsPanel.getByText('该状态下暂无工作流', { exact: true }),
    ).toBeVisible();
    await expect(
      harnessPage.workflowsPanel.getByText('切换到其他状态看看。', { exact: true }),
    ).toBeVisible();
  });

  test('Harness 工作流按所选部门及产品限定清单', async () => {
    await harnessPage.goto();
    await harnessPage.switchToScenarios();
    await harnessPage.openScenarioDesign();
    await harnessPage.page.keyboard.press('Escape');
    await expect(harnessPage.workflowDesignDialog).toBeHidden();
    await harnessPage.switchToWorkflows();

    const draftRow = harnessPage.workflowInventoryRow('代码生成作业流');
    await harnessPage.selectWorkflowProduct('harness-pipeline');
    await expect(draftRow).toBeVisible();

    await harnessPage.selectWorkflowDepartment('流水线平台小组');
    await expect(harnessPage.workflowsDepartmentTrigger).toContainText('流水线平台小组');
    await expect(draftRow).toHaveCount(0);
    await expect(harnessPage.workflowsTable.locator('tbody').getByRole('row')).toHaveCount(3);

    await harnessPage.selectWorkflowDepartment('持续交付组');
    await harnessPage.selectWorkflowProduct('harness-pipeline');
    await expect(draftRow).toBeVisible();

    await harnessPage.selectWorkflowProduct('devops-center-v2');
    await expect(draftRow).toHaveCount(0);
    await expect(harnessPage.workflowsTable.locator('tbody').getByRole('row')).toHaveCount(4);

    await harnessPage.selectWorkflowProduct('harness-pipeline');
    await expect(draftRow).toBeVisible();
  });

  test('Harness 工作流选择的部门通过入口带回业务场景设计', async () => {
    await harnessPage.goto();
    await harnessPage.switchToWorkflows();
    await harnessPage.selectWorkflowDepartment('流水线平台小组');

    await harnessPage.openScenariosFromWorkflows();

    await expect(harnessPage.tabScenarios).toHaveAttribute('aria-selected', 'true');
    await expect(harnessPage.scenariosDepartmentTrigger).toContainText(
      '部门1 / 平台产品线 / 平台工具组 / DevOps部 / 持续交付组 / 流水线平台小组',
    );
  });

  test('Harness 工作流分页可往返且筛选后回到第一页', async () => {
    test.slow();
    await harnessPage.goto();
    await harnessPage.switchToScenarios();
    await harnessPage.openScenarioDesign();
    await harnessPage.page.keyboard.press('Escape');
    await expect(harnessPage.workflowDesignDialog).toBeHidden();

    for (let index = 1; index <= 10; index += 1) {
      const suffix = String(index).padStart(2, '0');
      await harnessPage.createDraftScenarioWorkflow({
        parentScenarioName: '研发提效',
        scenarioName: `分页场景${suffix}`,
        scenarioCode: `harness-pipeline-page-${suffix}`,
        scenarioDescription: `验证工作流清单第 ${index} 条分页数据。`,
      });
    }

    await harnessPage.switchToWorkflows();
    await harnessPage.selectWorkflowProduct('harness-pipeline');
    await expect(harnessPage.workflowsPanel.getByText('共 11 条', { exact: true })).toBeVisible();
    await expect(harnessPage.workflowsTable.locator('tbody').getByRole('row')).toHaveCount(10);
    await expect(harnessPage.workflowInventoryRow('代码生成作业流')).toBeVisible();

    await harnessPage.workflowsNextPageButton.click();
    await expect(harnessPage.workflowsTable.locator('tbody').getByRole('row')).toHaveCount(1);
    await expect(harnessPage.workflowInventoryRow('分页场景10作业流')).toBeVisible();

    await harnessPage.workflowsPreviousPageButton.click();
    await expect(harnessPage.workflowInventoryRow('代码生成作业流')).toBeVisible();

    await harnessPage.workflowsNextPageButton.click();
    await expect(harnessPage.workflowInventoryRow('分页场景10作业流')).toBeVisible();
    await harnessPage.workflowStatusButton('设计中').click();
    await expect(harnessPage.workflowInventoryRow('代码生成作业流')).toBeVisible();
    await expect(harnessPage.workflowInventoryRow('分页场景10作业流')).toHaveCount(0);
  });

  test('切换到任务管理面板', async () => {
    await harnessPage.goto();
    await harnessPage.switchToTasks();

    await expect(harnessPage.tabTasks).toHaveAttribute('aria-selected', 'true');
    await expect(harnessPage.tasksPanel).toBeVisible();
  });

  test('业务场景的 Workflow 新建与级联删除实时同步到只读清单', async () => {
    const scenarioName = '协议开发';
    const workflowName = `${scenarioName}作业流`;
    const commandName = '/harness-pipeline-e2e-protocol';
    const assetName = 'harness-pipeline-coding-agent';
    const nodeName = '代码实现';

    await harnessPage.goto();
    await harnessPage.switchToScenarios();
    await harnessPage.createCompletedScenarioWorkflow({
      parentScenarioName: '研发提效',
      scenarioName,
      scenarioCode: 'harness-pipeline-protocol-development',
      scenarioDescription: '完成协议设计、实现与交付。',
      stageName: '实现',
      nodeName,
      commandName,
      assetName,
    });

    const workflowCard = harnessPage.workflowCard(workflowName);
    await expect(workflowCard).toBeVisible();
    await expect(workflowCard.getByText('✓ 设计完成', { exact: true })).toBeVisible();
    await expect(workflowCard.getByText(commandName, { exact: true })).toBeVisible();
    await expect(workflowCard.getByText(assetName).first()).toBeVisible();
    await expect(workflowCard.getByText(nodeName, { exact: true })).toBeVisible();

    await harnessPage.reopenWorkflow(workflowName);
    await expect(harnessPage.workflowDesignDialog.getByText(assetName).first()).toBeVisible();
    await expect(
      harnessPage.workflowDesignDialog.getByText(nodeName, { exact: true }),
    ).toBeVisible();

    await harnessPage.page.keyboard.press('Escape');
    await expect(harnessPage.workflowDesignDialog).toBeHidden();
    await harnessPage.switchToWorkflows();
    await harnessPage.selectWorkflowProduct('harness-pipeline');

    await expect(harnessPage.workflowInventoryRow(workflowName).getByRole('cell')).toHaveText([
      workflowName,
      'harness-pipeline',
      '持续交付组',
      '设计中',
      `研发提效 / ${scenarioName}`,
      '1 个',
    ]);

    await harnessPage.openScenariosFromWorkflows();
    await harnessPage.deleteScenario(scenarioName);
    await harnessPage.switchToWorkflows();

    await expect(harnessPage.workflowInventoryRow(workflowName)).toHaveCount(0);
  });

  test('发布 Extension 弹窗以普通文字提示产品下实体会跟随发布', async () => {
    await harnessPage.goto();
    await harnessPage.switchToExtension();
    await harnessPage.selectReadyExtensionScene();
    await harnessPage.openExtensionPublishDialog();

    await expect(harnessPage.extensionFollowPublishNote).toBeVisible();
    await expect(harnessPage.extensionFollowPublishNote).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(harnessPage.extensionFollowPublishNote).toHaveCSS('border-top-width', '0px');
    await expect(harnessPage.extensionFollowPublishNote).toHaveCSS('padding-left', '0px');
    await expect(harnessPage.extensionFollowPublishNote).toHaveCSS('padding-right', '0px');

    const noteBox = await harnessPage.extensionFollowPublishNote.boundingBox();
    const targetOrganizationBox = await harnessPage.extensionTargetOrganizationField.boundingBox();

    expect(noteBox).not.toBeNull();
    expect(targetOrganizationBox).not.toBeNull();
    expect(noteBox!.y).toBeLessThan(targetOrganizationBox!.y);
  });

  test('Skill 规划说明随子页签切换', async () => {
    await harnessPage.goto();

    await expect(harnessPage.applicationRelationTab).toBeVisible();
    await expect(harnessPage.planningHeroDescription).toContainText(
      '用于配置原子能力在部门/产品下的场景关系，将能力关联到一级/二级场景及归属活动/子活动，形成可跟踪的能力规划关系。',
    );

    await harnessPage.switchToAtomicCatalog();

    await expect(harnessPage.planningHeroDescription).toContainText(
      '用于维护部门/产品范围内的原子能力及基础建设信息，作为场景关系配置的数据来源，支持查询、新增、导入、导出和批量维护。',
    );
  });
});
