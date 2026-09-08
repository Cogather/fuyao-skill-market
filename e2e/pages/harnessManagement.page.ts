import type { Locator, Page } from '@playwright/test';
import { APP_BASE_PATH } from '../helpers/constants';

/**
 * Harness 管理页（/harness-management）Page Object。
 *
 * 约定：本页面的所有定位器集中在此文件；UI 改版时优先改这里，用例文件尽量不动。
 * 定位器优先级：role/可见文本 > placeholder/aria-label > data-testid > 其他。
 */
export class HarnessManagementPage {
  readonly page: Page;

  // 顶栏身份区（任何权限下都渲染）
  readonly topbarIdentity: Locator;
  readonly tabList: Locator;
  readonly tabScenarios: Locator;
  readonly tabCapabilities: Locator;
  readonly capabilitiesPanel: Locator;
  readonly capabilityManagementTabList: Locator;
  readonly scenariosPanel: Locator;
  readonly scenariosHeading: Locator;
  readonly scenariosDepartmentTrigger: Locator;
  readonly codeGenerationScenario: Locator;
  readonly startWorkflowDesignButton: Locator;
  readonly continueWorkflowDesignButton: Locator;
  readonly workflowDesignDialog: Locator;
  readonly tabWorkflows: Locator;
  readonly workflowsPanel: Locator;
  readonly workflowsHeading: Locator;
  readonly workflowsDepartmentTrigger: Locator;
  readonly workflowsProductFilter: Locator;
  readonly workflowsTable: Locator;
  readonly workflowsPreviousPageButton: Locator;
  readonly workflowsNextPageButton: Locator;
  readonly workflowsToScenarioButton: Locator;
  readonly tabTasks: Locator;
  readonly tabExtension: Locator;
  readonly applicationRelationTab: Locator;
  readonly atomicCatalogTab: Locator;
  readonly planningHeroDescription: Locator;
  readonly tasksPanel: Locator;
  readonly extensionPanel: Locator;
  readonly extensionReadySceneButton: Locator;
  readonly extensionPublishButton: Locator;
  readonly extensionPublishDialog: Locator;
  readonly extensionFollowPublishNote: Locator;
  readonly extensionTargetOrganizationField: Locator;

  constructor(page: Page) {
    this.page = page;

    this.topbarIdentity = page.getByText('Harness 管理', { exact: true }).first();
    this.tabList = page.getByRole('tablist', { name: 'Harness 管理分区' });
    this.tabScenarios = page.locator('#harness-tab-scenarios');
    this.tabCapabilities = page.locator('#harness-tab-capabilities');
    this.capabilitiesPanel = page.locator('#harness-panel-capabilities');
    this.capabilityManagementTabList = this.capabilitiesPanel.getByRole('tablist', {
      name: '资产清单分区',
    });
    this.scenariosPanel = page.locator('#harness-panel-scenarios');
    this.scenariosHeading = this.scenariosPanel.getByRole('heading', { name: '业务场景设计台' });
    this.scenariosDepartmentTrigger = this.scenariosPanel.getByRole('button', {
      name: '选择部门',
      exact: true,
    });
    this.codeGenerationScenario = this.scenariosPanel.getByRole('heading', {
      name: '代码生成',
      exact: true,
    });
    this.startWorkflowDesignButton = this.scenariosPanel.getByRole('button', {
      name: '+ 开始设计 Workflow',
      exact: true,
    });
    this.continueWorkflowDesignButton = this.scenariosPanel.getByRole('button', {
      name: '继续设计',
      exact: true,
    });
    this.workflowDesignDialog = page.getByRole('dialog', { name: /Workflow 设计/ });
    this.tabWorkflows = page.locator('#harness-tab-workflows');
    this.workflowsPanel = page.locator('#harness-panel-workflows');
    this.workflowsHeading = this.workflowsPanel.getByRole('heading', {
      name: 'Harness 工作流',
      exact: true,
    });
    this.workflowsDepartmentTrigger = this.workflowsPanel.getByRole('button', {
      name: '选择部门',
      exact: true,
    });
    this.workflowsProductFilter = this.workflowsPanel.getByRole('combobox', {
      name: '筛选产品',
      exact: true,
    });
    this.workflowsTable = this.workflowsPanel.getByRole('table', {
      name: 'Harness 工作流清单',
      exact: true,
    });
    this.workflowsPreviousPageButton = this.workflowsPanel.getByRole('button', {
      name: '上一页',
      exact: true,
    });
    this.workflowsNextPageButton = this.workflowsPanel.getByRole('button', {
      name: '下一页',
      exact: true,
    });
    this.workflowsToScenarioButton = this.workflowsPanel.getByRole('button', {
      name: '前往场景设计 →',
      exact: true,
    });
    this.tabTasks = page.getByRole('tab', { name: '任务管理' });
    this.tabExtension = page.locator('#harness-tab-extension');
    this.applicationRelationTab = page.getByRole('button', {
      name: new RegExp('\\u573a\\u666f\\u5173\\u7cfb\\u914d\\u7f6e'),
    });
    this.atomicCatalogTab = page.getByRole('button', {
      name: /Skill\s*清单/,
    });
    this.planningHeroDescription = page.locator('.planning-hero .all-desc');
    this.tasksPanel = page.locator('#harness-panel-tasks');
    this.extensionPanel = this.capabilitiesPanel.locator('#capability-management-panel-extension');
    this.extensionReadySceneButton = this.extensionPanel.getByRole('button', {
      name: /构建诊断/,
    });
    this.extensionPublishButton = this.extensionPanel.getByRole('button', {
      name: '发布',
      exact: true,
    });
    this.extensionPublishDialog = page.getByRole('dialog', { name: /发布 Extension/ });
    this.extensionFollowPublishNote = this.extensionPublishDialog.getByText(
      '列表中归属于当前所选产品的 skill, command, agent 实体会跟随 Extension 一起发布到 Agent Center 平台。',
      { exact: true },
    );
    this.extensionTargetOrganizationField = this.extensionPublishDialog
      .locator('label.modal-field')
      .filter({ hasText: '目标组织' });
  }

  /** 直达本页，等待顶部导航就绪 */
  async goto(): Promise<void> {
    await this.page.goto(`${APP_BASE_PATH}/harness-management`);
    await this.tabList.waitFor();
  }

  /** 切换到「业务场景设计台」，并等待场景面板渲染 */
  async switchToScenarios(): Promise<void> {
    await this.tabScenarios.click();
    await this.scenariosPanel.waitFor();
  }

  /** 切换到「资产清单」，并等待聚合管理面板渲染 */
  async switchToCapabilityManagement(): Promise<void> {
    await this.tabCapabilities.click();
    await this.capabilitiesPanel.waitFor();
  }

  capabilityManagementTab(name: 'Command 清单' | 'Skill 清单' | 'Agent 清单' | 'Extension 发布') {
    return this.capabilityManagementTabList.getByRole('tab', { name, exact: true });
  }

  /** 切换到只读的「Harness 工作流」清单，并等待面板渲染。 */
  async switchToWorkflows(): Promise<void> {
    await this.tabWorkflows.click();
    await this.workflowsPanel.waitFor();
  }

  /** 在 Harness 工作流清单中切换部门范围。 */
  async selectWorkflowDepartment(departmentName: string): Promise<void> {
    await this.workflowsDepartmentTrigger.click();
    const picker = this.page.getByRole('listbox');
    await picker.getByRole('searchbox', { name: '搜索部门', exact: true }).fill(departmentName);
    await picker
      .getByRole('button')
      .filter({ has: this.page.getByText(departmentName, { exact: true }) })
      .click();
    await picker.getByRole('button', { name: '完成', exact: true }).click();
  }

  /** 在 Harness 工作流清单中切换产品范围。 */
  async selectWorkflowProduct(productName: string): Promise<void> {
    await this.workflowsProductFilter.selectOption({ label: productName });
  }

  /** 按业务状态筛选 Harness 工作流。 */
  workflowStatusButton(status: '全部' | '已发布' | '设计中'): Locator {
    return this.workflowsPanel.getByRole('button', { name: status, exact: true });
  }

  /** 通过名称单元格定位工作流行，避免依赖表格 DOM 层级。 */
  workflowInventoryRow(name: string): Locator {
    return this.workflowsTable.getByRole('row').filter({
      has: this.page.getByRole('cell', { name, exact: true }),
    });
  }

  /** 从只读清单回到业务场景设计，并等待原面板重新显示。 */
  async openScenariosFromWorkflows(): Promise<void> {
    await this.workflowsToScenarioButton.click();
    await this.scenariosPanel.waitFor();
  }

  /** 通过业务场景设计 UI 新建二级场景。 */
  async createChildScenario(options: {
    parentScenarioName: string;
    scenarioName: string;
    scenarioCode: string;
    scenarioDescription: string;
  }): Promise<void> {
    const parentNode = this.scenariosPanel
      .getByRole('tree', { name: '业务场景地图' })
      .getByText(options.parentScenarioName, { exact: true })
      .locator('..');
    await parentNode.focus();
    await parentNode
      .getByRole('button', {
        name: `在${options.parentScenarioName}下新建场景`,
        exact: true,
      })
      .click();

    const scenarioDialog = this.page.getByRole('dialog', { name: '新建下级场景' });
    await scenarioDialog.getByLabel('场景名称').fill(options.scenarioName);
    await scenarioDialog.getByLabel('场景编码 *').fill(options.scenarioCode);
    await scenarioDialog.getByLabel('场景说明').fill(options.scenarioDescription);
    await scenarioDialog.getByRole('button', { name: '创建', exact: true }).click();
    await scenarioDialog.waitFor({ state: 'hidden' });
  }

  /** 新建二级场景，打开 Workflow 向导即落一条草稿，再通过关闭按钮返回。 */
  async createDraftScenarioWorkflow(options: {
    parentScenarioName: string;
    scenarioName: string;
    scenarioCode: string;
    scenarioDescription: string;
  }): Promise<void> {
    await this.createChildScenario(options);
    await this.scenariosPanel
      .getByRole('button', { name: '+ 开始设计 Workflow', exact: true })
      .click();
    await this.workflowDesignDialog.waitFor();
    await this.workflowDesignDialog.getByRole('button', { name: '关闭 Workflow 设计' }).click();
    await this.workflowDesignDialog.waitFor({ state: 'hidden' });
  }

  /** 为当前二级场景首次打开 Workflow 设计向导。 */
  async openScenarioDesign(): Promise<void> {
    await this.startWorkflowDesignButton.click();
    await this.workflowDesignDialog.waitFor();
  }

  /** 新建二级场景，并走完整个 Workflow 设计闭环。 */
  async createCompletedScenarioWorkflow(options: {
    parentScenarioName: string;
    scenarioName: string;
    scenarioCode: string;
    scenarioDescription: string;
    stageName: string;
    nodeName: string;
    commandName: string;
    assetName: string;
  }): Promise<void> {
    await this.createChildScenario(options);

    await this.scenariosPanel
      .getByRole('button', { name: '+ 开始设计 Workflow', exact: true })
      .click();
    await this.workflowDesignDialog.waitFor();
    await this.workflowDesignDialog.getByRole('button', { name: '下一步', exact: true }).click();

    await this.workflowDesignDialog
      .getByRole('button', { name: '+ 添加环节', exact: true })
      .click();
    await this.workflowDesignDialog.getByPlaceholder('环节名称').fill(options.stageName);
    await this.workflowDesignDialog.getByPlaceholder('环节说明（可选）').fill('方案实现阶段');
    await this.workflowDesignDialog.getByRole('button', { name: '添加环节', exact: true }).click();

    const stage = this.workflowDesignDialog.locator('.edit-stage').filter({
      hasText: options.stageName,
    });
    await stage.getByRole('button', { name: '+ 添加节点', exact: true }).click();
    await stage.getByPlaceholder('节点名称').fill(options.nodeName);
    await stage.getByPlaceholder('节点说明（可选）').fill('执行核心开发任务');
    await stage.getByRole('button', { name: '添加节点', exact: true }).click();
    await this.workflowDesignDialog.getByRole('button', { name: '下一步', exact: true }).click();

    await this.workflowDesignDialog
      .getByRole('button', { name: '+ 新定义 Command', exact: true })
      .click();
    const commandEditor = this.workflowDesignDialog.locator('.inline.form');
    await commandEditor.getByPlaceholder(/e2e-codec$/).fill(options.commandName);
    await commandEditor.getByPlaceholder('描述 *').fill('端到端协议开发入口');
    await commandEditor
      .getByRole('combobox', { name: '开发责任人 *', exact: true })
      .fill('w30000001');
    await commandEditor.getByRole('option', { name: /w30000001/ }).click();
    await commandEditor.getByRole('combobox', { name: '责任人 *', exact: true }).fill('w30000002');
    await commandEditor.getByRole('option', { name: /w30000002/ }).click();
    await commandEditor.locator('input[type="date"]').fill('2026-12-31');
    await commandEditor.getByRole('button', { name: '创建并加入资产清单', exact: true }).click();
    await this.workflowDesignDialog.getByRole('button', { name: '下一步', exact: true }).click();

    await this.workflowDesignDialog
      .getByRole('button', { name: '+ 自定义 Agent', exact: true })
      .click();
    const assetEditor = this.workflowDesignDialog.locator('.inline.form');
    await assetEditor.getByPlaceholder(/coding-agent$/).fill(options.assetName);
    await assetEditor.getByPlaceholder('描述 *').fill('执行协议开发节点');
    await assetEditor
      .getByRole('combobox', { name: '开发责任人 *', exact: true })
      .fill('w30000001');
    await assetEditor.getByRole('option', { name: /w30000001/ }).click();
    await assetEditor.getByRole('combobox', { name: '责任人 *', exact: true }).fill('w30000002');
    await assetEditor.getByRole('option', { name: /w30000002/ }).click();
    await assetEditor.locator('input[type="date"]').fill('2026-12-31');
    await assetEditor.getByRole('button', { name: '创建并加入资产清单', exact: true }).click();

    const assignment = this.workflowDesignDialog.locator('.assignment').filter({
      hasText: options.nodeName,
    });
    await assignment.locator('select').selectOption({ label: `${options.assetName}（Agent）` });
    await this.workflowDesignDialog.getByRole('button', { name: '完成设计', exact: true }).click();
    await this.workflowDesignDialog.waitFor({ state: 'hidden' });
  }

  workflowCard(name: string): Locator {
    return this.scenariosPanel.locator('.workflow-card').filter({
      has: this.page.getByRole('heading', { name, exact: true }),
    });
  }

  async reopenWorkflow(name: string): Promise<void> {
    await this.workflowCard(name).getByRole('button', { name: '查看设计', exact: true }).click();
    await this.workflowDesignDialog.waitFor();
  }

  /** 删除叶子业务场景，并在确认框中确认级联删除其 Workflow。 */
  async deleteScenario(name: string): Promise<void> {
    const scenarioNode = this.scenariosPanel
      .getByRole('tree', { name: '业务场景地图' })
      .getByText(name, { exact: true })
      .locator('..');
    await scenarioNode.focus();
    await scenarioNode.getByRole('button', { name: `删除${name}`, exact: true }).click();

    const deleteDialog = this.page.getByRole('dialog', { name: '删除场景', exact: true });
    await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click();
    await deleteDialog.waitFor({ state: 'hidden' });
  }

  /** 切换到「任务管理」，并等待面板渲染 */
  async switchToTasks(): Promise<void> {
    await this.tabTasks.click();
    await this.tasksPanel.waitFor();
  }

  /** 通过「资产清单」切换到「Extension 发布」，并等待发布内容渲染 */
  async switchToExtension(): Promise<void> {
    await this.switchToCapabilityManagement();
    await this.capabilityManagementTab('Extension 发布').click();
    await this.extensionPanel.waitFor();
  }

  /** 切换到「原子清单」子页签 */
  async switchToAtomicCatalog(): Promise<void> {
    await this.atomicCatalogTab.click();
  }

  /** 选择一个可发布且未处于发布中的 Extension 场景 */
  async selectReadyExtensionScene(): Promise<void> {
    await this.extensionReadySceneButton.click();
    await this.extensionPanel.getByRole('heading', { name: /构建诊断/ }).waitFor();
  }

  /** 打开当前场景的 Extension 发布弹窗 */
  async openExtensionPublishDialog(): Promise<void> {
    await this.extensionPublishButton.click();
    await this.extensionPublishDialog.waitFor();
  }
}
