# 页面上下文：Harness 管理（/harness-management）

> 本文件是「页面专属知识」的存放地，供 AI 与开发者复用。
> 页面演进后必须同步更新本文件；skill 本体（skills/frontend-page-e2e）不保存页面知识。

## 基本信息

- 路由：`/skill-market/harness-management`（带 `VITE_BASE=/skill-market` 前缀）
- 组件：`src/views/HarnessManagementPage.vue`（内部按 tab 挂载 SkillPlanningPage / HarnessTaskManagementPage / HarnessConfigurationPage 等）
- 数据模式：dev 走 mock（`VITE_SKILL_MARKET_TRANSPORT=mock`），无需后端
- 登录：本地 mock 无需登录
- 权限影响：`task-only` 权限下只显示「任务管理」一个 tab；其余权限显示全部 6 个 tab

## 稳定锚点（选择器素材）

- 顶栏身份区：「Harness 管理」强文本（任何权限下都渲染）
- tab 导航：`role=tablist`，aria-label「Harness 管理分区」
- tabs（`role=tab`）：Command 规划 / Skill 规划 / Agent 规划 / Extension 发布 / 配置管理 / 任务管理
- 任务管理面板：`#harness-panel-tasks`（`role=tabpanel`）

## 坑与约定

- 页面 onMounted 有一段异步权限初始化，mock 模式下立即 ready，但断言建议等待 tablist 而非某个 tab 内容
- tab 切换用 `aria-selected` 属性断言选中态，不依赖样式 class
- 若未来断言面板内业务内容，注意不同权限（task-only/owner/admin）渲染差异

## 演进记录

- 首版：接入 E2E 冒烟 2 条（页面打开 / 切换到任务管理），全部绿色
