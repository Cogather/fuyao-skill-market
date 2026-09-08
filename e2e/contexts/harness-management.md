# 页面上下文：Harness 管理（/harness-management）

> 本文件是「页面专属知识」的存放地，供 AI 与开发者复用。
> 页面演进后必须同步更新本文件；skill 本体（skills/frontend-page-e2e）不保存页面知识。

## 基本信息

- 业务场景设计 HTTP 改名通过 `/scene-activity/scene/name`、`/scene-activity/activity/name` 级联迁移关联资产名称；删除通过对应 `DELETE /scene`、`DELETE /activity` 清理绑定和规划，不要求手动解绑。删除环节先逐个删子节点，再删除实际存在的父记录；保留资产本身和 Workflow 资产池。场景删除会清理其资产池，已发布 Extension 的场景由后端拒绝；有二级场景的一级场景仍需先删除下级。

- 路由：`/skill-market/harness-management`（带 `VITE_BASE=/skill-market` 前缀）
- 组件：`src/views/HarnessManagementPage.vue`（内部按 tab 挂载 HarnessCapabilityManagementPage / SkillPlanningPage / HarnessTaskManagementPage / HarnessConfigurationPage 等）
- 数据模式：dev 走 mock（`VITE_SKILL_MARKET_TRANSPORT=mock`），无需后端
- 登录：本地 mock 无需登录
- 权限影响：`task-only` 权限下只显示「任务管理」；其余权限依次显示「业务场景设计」「Harness 工作流」「资产清单」「Agent / Skill 资产」「配置管理」「任务管理」，默认进入「业务场景设计」。

## 稳定锚点（选择器素材）

- 顶栏身份区：「Harness 管理」强文本（任何权限下都渲染）
- tab 导航：`role=tablist`，aria-label「Harness 管理分区」
- tabs（`role=tab`）：业务场景设计 / Harness 工作流 / 资产清单 / Agent / Skill 资产 / 配置管理 / 任务管理；前四个 tab 的 DOM id 分别为 `#harness-tab-scenarios`、`#harness-tab-workflows`、`#harness-tab-capabilities`、`#harness-tab-assets`。四个旧规划入口暂时隐藏。
- 资产清单面板：`#harness-panel-capabilities`；内部 `role=tablist` 的 aria-label 为「资产清单分区」，依次包含 Command 清单 / Skill 清单 / Agent 清单 / Extension 发布。默认打开 Command 清单，四个分区复用原业务组件并按首次访问懒挂载，切换后保活。
- 业务场景面板：`#harness-panel-scenarios`，包含 heading「业务场景设计台」；场景树复用配置管理，mock 默认「研发提效 → 代码生成」，初始无 Workflow。「开始设计 Workflow」或「继续设计」打开设计 dialog。
- Harness 工作流面板：`#harness-panel-workflows`，包含 heading「Harness 工作流」、aria-label「选择部门」按钮、aria-label「筛选产品」下拉框、accessible name「Harness 工作流清单」的只读表格，以及「前往场景设计 →」按钮
- Harness 工作流表格固定六列：名称 / 产品 / 部门 / 状态 / 所属业务场景 / Command 入口；状态由发布次数决定（`releaseCount > 0` 为「已发布」，否则为「设计中」），不以四步设计是否完成决定
- 默认部门「持续交付组」、产品 `harness-pipeline`；初始工作流清单为空。部门筛选包含已关联工作流的下级部门，产品筛选进一步收窄结果；状态按钮 accessible name 为「全部」「已发布」「设计中」。
- Harness 工作流每页 10 条；切换部门、产品或状态会把页码重置为第一页，分页按钮 accessible name 为「上一页」「下一页」
- Agent / Skill 资产面板：`#harness-panel-assets`，HTTP 和 Mock 均只显示 Agent / Skill / Command / Extension 四个类型，默认选中 Agent，无「全部」入口；包含详情、Skill 质量报告和发布流程。
- HTTP 资产列表使用 `httpRequest.api` 的 `POST /v1/harness/plans/components/query`，body 包含 `userId`、可选 `deptCode` / `productCode`、大写 `type`、`sortBy: updatedAt`、`sortOrder: desc`、`pageNo`、`pageSize: 30`。未选部门或产品时省略对应编码；清空部门后仍可查询列表。
- HTTP 响应使用 `data.records`、`data.total`、`data.pageNo`、`data.pageSize`；记录类型来自当前筛选，展示 `name`、`description`、`latestVersion` 和原始 `status`，以类型 + `category` + 名称作为稳定身份。列表只调用统一查询，进入 Extension 详情或发布时再加载场景上下文。
- Mock 保留原资产聚合与每页 24 条的滚动加载。HTTP 切换部门、产品或类型时从第 1 页重载，晚返回的旧请求不能覆盖当前筛选。
- 任务管理面板：`#harness-panel-tasks`（`role=tabpanel`）

## 坑与约定

- 页面 onMounted 有一段异步权限初始化，mock 模式下立即 ready，但断言建议等待 tablist 而非某个 tab 内容
- tab 切换用 `aria-selected` 属性断言选中态，不依赖样式 class
- 若未来断言面板内业务内容，注意不同权限（task-only/owner/admin）渲染差异
- 「业务场景设计」与「Harness 工作流」共享同一个路由级 workspace；跨 tab 新建的 Workflow 和当前部门必须立即同步，两个面板用 `v-show` 保持自身筛选 UI 状态
- 删除叶子业务场景时会级联删除其 Workflow，只读清单切回后不得残留对应行
- Harness 工作流是只读清单，不为行提供点击、详情或编辑入口；设计入口统一通过「前往场景设计 →」返回业务场景页
- 场景新建、标签、删除确认和 Workflow 设计弹窗仅通过显式操作按钮关闭（如取消、×、完成、完成设计）；点击遮罩或空白、拖动、滚动及 Esc 不关闭弹窗，也不会保存未提交的修改。Tab 焦点限制在弹窗内。

## 场景与活动统一关系

- 产品 → 一级场景 → 二级场景 → 至多一个 Harness 工作流 → 环节 → 节点。
- 配置管理的「场景管理」与业务场景设计共用 `harnessScenarioTaxonomyService`。HTTP 复用现有产品维度场景接口；mock 保留原有按部门保存的场景库（同部门产品共享 mock 场景），工作流仍按部门、产品、场景隔离。
- 原「活动管理」入口改为「环节与节点」。环节对应旧归属活动，节点对应旧子活动；新增/编辑均操作所选二级场景的工作流。
- 旧活动库及规划项引用不做破坏性迁移。用户可将指定旧活动及子活动导入当前场景，保留 `sourceActivityId`；其他场景不会被自动关联。
- 场景改名和排序保留稳定身份及 Workflow 关联；删除场景会清理其 Workflow、环节和节点，已被规划项引用的场景禁止直接删除。
- 场景地图通过左侧拖拽手柄排序：一级场景之间、同一一级场景内的二级场景之间可拖到目标行上半区/下半区，松手后自动保存。只调整同产品同父级顺序，保留原有上下箭头；保存成功前不改变现有顺序，失败显示原因，刷新及配置管理读取同一顺序。
- 工作流设计、场景编码/说明及关联保存在当前浏览器，按用户和 transport 隔离；目前没有工作流后端读写契约，不调用虚构接口。清空浏览器存储会移除本地工作流草稿。
- 场景标签沿用配置管理的标签服务；无权限、加载中或加载失败时禁止场景写入，失败加载不能被当作空配置保存。
- 相关回归：`harness-management.spec.ts`、`harness-scenario-relations.spec.ts`、`harness-workspace-relations.spec.ts`、`harness-scenario-ordering.spec.ts`；数据层排序回归为 `node tests/harness-scenario-ordering.tests.mjs`。

## 演进记录

- 恢复「Agent / Skill 资产」页签入口，位于「资产清单」之后，沿用原资产页面、默认页签与权限控制。
- 恢复「Harness 工作流」页签入口，放在「业务场景设计」和「资产清单」之间，沿用现有列表页面与权限控制。
- 在「业务场景设计」后新增「资产清单」，聚合 Command、Skill、Agent 清单和 Extension 发布；迁移验证期间保留四个原顶层入口
- 新增最左侧「Agent / Skill 资产」页签，原有页签顺序与默认选中状态保持不变
- 新增最左侧「业务场景设计」页签；完整页签数更新为 8 个，原默认页签保持不变
- 在「业务场景设计」后新增「Harness 工作流」只读清单页签；增加部门/产品/状态筛选、分页、返回场景设计入口，以及跨页签共享工作区 E2E 覆盖
- 首版：接入 E2E 冒烟 2 条（页面打开 / 切换到任务管理），全部绿色
