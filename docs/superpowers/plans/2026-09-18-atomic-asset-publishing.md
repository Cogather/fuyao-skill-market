# Agent / Skill / Command 独立发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Agent、Skill、Command 接入独立发布、历史和失败重试，同时完整保留 Extension 现有发布链路。

**Architecture:** 新建聚焦原子资产发布的 HTTP 适配层，负责请求构造、响应校验和字段映射；`AtomicAssetPublishPage.vue` 同时承载发布表单与历史列表，并在资产详情中复用历史模式。资产列表保留原有 Extension 分支，只向原子资产组件传入身份和资产数据。

**Tech Stack:** Vue 3 `<script setup>`、TypeScript、现有 `httpRequest.harnessApi`、Playwright、Vite SSR 测试。

**Spec:** `docs/superpowers/specs/2026-09-18-atomic-asset-publishing-design.md`

## Global Constraints

- 新接口仅用于 Agent、Skill、Command；Extension 继续使用 `/extensions/*`。
- 发布版本必须使用资产列表响应中的原始 `latestVersion`。
- 目标组织继续使用 `GET /extensions/orgs`，并传资产自身的 `dimType`、`dimCode`。
- 发布成功文案只能表示“任务已受理”，不能表示异步发布已经成功。
- 不覆盖工作区中与本功能无关的现有改动。

---

### Task 1: 原子资产发布 HTTP 契约

**Files:**

- Create: `src/services/skillMarket/atomicAssetPublishHttp.ts`
- Modify: `src/services/skillMarket/skillBaseService.ts`
- Modify: `src/services/skillMarket/assetManagementTypes.ts`
- Modify: `src/services/skillMarket/assetManagementHttp.ts`
- Test: `tests/harness-atomic-asset-publish-http.tests.mjs`

**Interfaces:**

- Consumes: `skillBaseService.queryUserPublishableOrgs` 与统一 API envelope。
- Produces: `queryAtomicPublishOrganizations(asset, userId)`、`publishAtomicAsset(input)`、`queryAtomicAssetPublishHistory(query)`、`retryAtomicAssetPublish(taskId, userId)` 以及发布/历史类型。

- [x] **Step 1: Write the failing test**

  用 Vite SSR 加载真实模块并替换底层 HTTP transport，断言：原始 `v1.2.3` 被保留；组织查询使用资产维度；发布 URL、query、body 精确匹配；历史默认分页并映射记录；只有合法 envelope 被接受；重试编码 taskId 并只传 userId。

- [x] **Step 2: Run test to verify it fails**

  Run: `node tests/harness-atomic-asset-publish-http.tests.mjs`

  Expected: FAIL，因为 `atomicAssetPublishHttp.ts` 及新 service 方法尚不存在。

- [x] **Step 3: Write minimal implementation**

  增加 `HarnessAsset.latestVersion?: string` 并在列表映射时保存 `String(record.latestVersion ?? '').trim()`；在 `skillBaseService` 增加三个 `/assets/publish*` 方法；新 HTTP 适配层严格校验 `meta.success`、数组和分页字段，提交类型映射为大写枚举。

- [x] **Step 4: Run test to verify it passes**

  Run: `node tests/harness-atomic-asset-publish-http.tests.mjs`

  Expected: PASS，打印原子发布 HTTP 契约通过。

### Task 2: 发布页、结果与历史重试交互

**Files:**

- Modify: `src/views/skill/AtomicAssetPublishPage.vue`
- Modify: `e2e/specs/harness-assets-atomic-publish.spec.ts`

**Interfaces:**

- Consumes: Task 1 的四个 HTTP 方法与类型。
- Produces: props `asset/userId/userName/initialPanel/releaseChrome`，events `close/notify/published`；发布模式和历史模式共用同一组件。

- [x] **Step 1: Write the failing Playwright assertions**

  路由组织、发布、历史和重试请求。断言发布页没有“发布说明”，自动选择首个组织；提交使用原始 `latestVersion`；受理与拒绝结果分别出现；受理后按 `batchId` 查询；只有“发布失败 + 独立发布”显示重试；重试后刷新历史。

- [x] **Step 2: Run test to verify it fails**

  Run: `$env:VITE_SKILL_MARKET_TRANSPORT='http'; npx playwright test e2e/specs/harness-assets-atomic-publish.spec.ts`

  Expected: FAIL，因为当前页面仍是发布说明占位交互。

- [x] **Step 3: Implement minimal component behavior**

  首次进入发布模式加载组织；表单校验后调用发布接口；完整展示 accepted/rejected；有 accepted 时切换到 `batchId` 历史；历史支持刷新、加载更多和符合条件的失败重试；所有按钮具备加载/禁用状态。

- [x] **Step 4: Run target E2E to verify it passes**

  Run: `$env:VITE_SKILL_MARKET_TRANSPORT='http'; npx playwright test e2e/specs/harness-assets-atomic-publish.spec.ts`

  Expected: PASS。

### Task 3: 资产详情集成与 Extension 隔离回归

**Files:**

- Modify: `src/views/skill/AgentSkillAssetsPage.vue`
- Modify: `e2e/specs/harness-assets-atomic-publish.spec.ts`
- Test: `e2e/specs/harness-assets-extension-pages-http.spec.ts`
- Test: `tests/harness-asset-history-http.tests.mjs`

**Interfaces:**

- Consumes: `AtomicAssetPublishPage` 的历史模式和 `published` event。
- Produces: Agent/Skill/Command 详情“发布记录”页签；列表返回时刷新；Extension 详情继续使用 `ExtensionPublishPage`。

- [x] **Step 1: Add failing detail-history assertion**

  从 Agent/Skill/Command 卡片打开详情，点击“发布记录”，断言只请求 `/assets/publish/history`；Extension 详情断言仍请求 `/extensions/history`。

- [x] **Step 2: Run assertion to verify it fails**

  Run: `$env:VITE_SKILL_MARKET_TRANSPORT='http'; npx playwright test e2e/specs/harness-assets-atomic-publish.spec.ts --grep "详情发布记录"`

  Expected: FAIL，因为原子资产详情没有发布记录页签。

- [x] **Step 3: Integrate the component**

  新增原子历史判断和页签，历史内容区域嵌入 `AtomicAssetPublishPage`；发布受理设置列表待刷新；返回列表时执行已有刷新逻辑。Extension 判断和组件保持独立。

- [x] **Step 4: Run focused and regression checks**

  Run:

  ```powershell
  $env:VITE_SKILL_MARKET_TRANSPORT='http'
  npx playwright test e2e/specs/harness-assets-atomic-publish.spec.ts e2e/specs/harness-assets-extension-pages-http.spec.ts
  node tests/harness-asset-history-http.tests.mjs
  npx vue-tsc --noEmit -p tsconfig.app.json
  npx eslint src/services/skillMarket/atomicAssetPublishHttp.ts src/services/skillMarket/assetManagementTypes.ts src/services/skillMarket/assetManagementHttp.ts src/services/skillMarket/skillBaseService.ts src/views/skill/AtomicAssetPublishPage.vue src/views/skill/AgentSkillAssetsPage.vue e2e/specs/harness-assets-atomic-publish.spec.ts
  npm run build -- --outDir .tmp/atomic-publish-build
  ```

  Expected: 全部通过，且 Extension 请求仍为 `/extensions/history`。

## Self-Review

- Spec coverage: 发布权限、原始版本、组织维度、accepted/rejected、异步文案、历史分页、重试条件和 Extension 隔离均有对应任务。
- Placeholder scan: 计划无 TBD/TODO；每个实现步骤均指定行为和命令。
- Type consistency: HTTP 方法、组件 props/events 和详情集成名称在各任务中一致。
