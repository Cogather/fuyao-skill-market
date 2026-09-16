# Harness Asset API Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Harness asset inventory with the documented component, detail, Extension version-history, and package-content contracts while making type, status, and keyword filters server-driven.

**Architecture:** Keep `HarnessAssetApi` as the page-facing boundary and correct the HTTP adapters beneath it. The list page owns only filter state and pagination; the server owns type, status, keyword, and total filtering. Extension release UI remains separate and unchanged, while Extension version content is sourced from the frozen version-history response and lazily expanded through package tree/file calls.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vite SSR test harness, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-harness-asset-api-alignment-design.md`

## Global Constraints

- Keep the existing Extension publish flow; do not add Skill, Agent, or Command publish/history/retry UI.
- Preserve the existing dirty worktree and do not commit overlapping user changes.
- `全部` omits `status`; the other status tabs send exactly `开发中`, `待发布`, or `已发布`.
- Extension always queries with `status: "已发布"`.
- Search remains a debounced server query through `keyword`.
- Send exactly one dimension selector: `productCode` when a product is selected, otherwise `deptCode`.
- Run only focused tests plus lint/type/build checks relevant to the touched files.

---

### Task 1: Correct component list/detail transport contracts

**Files:**
- Modify: `src/services/skillMarket/apiTypes.ts:761-825`
- Modify: `src/services/skillMarket/skillBaseService.ts:503-524`
- Modify: `src/services/skillMarket/assetManagementTypes.ts:80-116,156-160`
- Modify: `src/services/skillMarket/assetManagementHttp.ts:39-112`
- Test: `tests/harness-asset-components-http.tests.mjs`
- Test: `tests/harness-asset-detail-http.tests.mjs`

**Interfaces:**
- Produces: `HarnessAssetQueryStatus = '开发中' | '待发布' | '已发布'`.
- Produces: `HarnessAssetPageQuery.status?: HarnessAssetQueryStatus`.
- Produces: optional `skillId`, `agentId`, and `commandId` on `HarnessAssetComponentDto` and `HarnessAsset`.
- Preserves: `HarnessAssetApi.queryAssets(scope, page)` and `queryDetail(scope, asset, version, options)`.

- [ ] **Step 1: Change the component-list test to require the new route, status, and entity IDs**

  Update the request double to capture `request.harnessApi`, add `status: '待发布'` to the page query, and use a complete record fixture containing:

  ```js
  {
    name: 'pipeline-check',
    description: '检查流水线',
    latestVersion: '0.0.1',
    status: '待发布',
    skillId: 'skill-101',
    agentId: 'agent-102',
    commandId: 'command-103',
    category: '产品级/流水线',
    dimType: '产品级',
    dimCode: 'product-pipeline',
    dimName: '流水线',
    canPublish: false,
    updatedAt: '2026-03-24 10:00:00'
  }
  ```

  Assert the real adapter emits:

  ```js
  {
    url: '/components/query',
    method: 'post',
    data: {
      userId: 'asset-user',
      productCode: 'product-pipeline',
      keyword: 'pipeline',
      status: '待发布',
      type: 'SKILL',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      pageNo: 1,
      pageSize: 30
    }
  }
  ```

  Assert the mapped `HarnessAsset` retains all three optional IDs. This catches a regression where a valid backend entity ID is dropped before a future publish action can use it.

- [ ] **Step 2: Run the list test and verify RED**

  Run: `node tests/harness-asset-components-http.tests.mjs`

  Expected: FAIL because the request still uses `/v1/harness/plans/components/query`, ignores `status`, and drops entity IDs.

- [ ] **Step 3: Change the detail test to require the new detail route**

  Change its expected request to:

  ```js
  {
    url: '/components/detail',
    method: 'get',
    params: { userId: 'user-001', type: type.toUpperCase(), name: currentAsset.name }
  }
  ```

  This catches restoring either the old `/v1/harness/plans` prefix or the wrong request client.

- [ ] **Step 4: Run the detail test and verify RED**

  Run: `node tests/harness-asset-detail-http.tests.mjs`

  Expected: FAIL on the old detail request URL before the later Extension fixture assertions run.

- [ ] **Step 5: Implement the minimal contract changes**

  Add the exact optional fields and status type:

  ```ts
  export type HarnessAssetQueryStatus = '开发中' | '待发布' | '已发布';

  export type QueryHarnessAssetComponentsBody = {
    userId: string;
    deptCode?: string;
    productCode?: string;
    keyword?: string;
    status?: HarnessAssetQueryStatus;
    type: 'AGENT' | 'SKILL' | 'COMMAND' | 'EXTENSION';
    sortBy: 'updatedAt';
    sortOrder: 'desc';
    pageNo: number;
    pageSize: number;
  };
  ```

  Add `skillId?: string | null`, `agentId?: string | null`, and `commandId?: string | null` to the response DTO and normalized asset. Route both service calls through `httpRequest.harnessApi`:

  ```ts
  url: '/components/query'
  url: '/components/detail'
  ```

  In `queryHttpHarnessAssetPage`, trim and forward `page.status`, then copy the three IDs without synthesizing one as a backend entity ID. Keep the existing stable UI `id` fallback.

- [ ] **Step 6: Run both focused tests and verify GREEN for this task**

  Run:

  ```powershell
  node tests/harness-asset-components-http.tests.mjs
  node tests/harness-asset-detail-http.tests.mjs
  ```

  Expected: component list/detail request assertions pass; the Extension version-content assertions may remain red until Task 3 only if they share the same detail test file.

---

### Task 2: Make type and status tabs server-driven

**Files:**
- Modify: `src/views/skill/AgentSkillAssetsPage.vue:41-104,415-441,626-804,1228-1244`
- Test: `e2e/specs/harness-assets-query-http.spec.ts`

**Interfaces:**
- Consumes: `HarnessAssetPageQuery.status` from Task 1.
- Produces: `selectStatusFilter(nextFilter: AssetStatusFilter): Promise<void>`.
- Produces: page-level `assetTotal` reflecting `ComponentQueryItem.total` for the active query.

- [ ] **Step 1: Extend the HTTP query E2E test with status-tab requests**

  Make the route fixture match `/api/harness/components/query`. Filter its generated records according to `body.status`, return the filtered `total`, and after selecting Agent assert these interactions:

  ```ts
  await page.getByRole('button', { name: '开发中', exact: true }).click();
  await expect.poll(() => bodies.at(-1)?.status).toBe('开发中');
  await expect.poll(() => bodies.at(-1)?.pageNo).toBe(1);

  await page.getByRole('button', { name: '待发布', exact: true }).click();
  await expect.poll(() => bodies.at(-1)?.status).toBe('待发布');

  await page.getByRole('button', { name: '已发布', exact: true }).click();
  await expect.poll(() => bodies.at(-1)?.status).toBe('已发布');

  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect.poll(() => bodies.at(-1)?.status).toBeUndefined();
  ```

  After switching to Extension, assert `status === '已发布'`. This catches the current bug where status pills only filter already-loaded cards locally.

- [ ] **Step 2: Run the focused E2E test and verify RED**

  Run: `node_modules/.bin/playwright.cmd test e2e/specs/harness-assets-query-http.spec.ts --grep "HTTP 资产筛选"`

  Expected: FAIL because status clicks do not send a request and the query still targets the old path.

- [ ] **Step 3: Implement server status selection and totals**

  Add the literal mapping:

  ```ts
  const STATUS_QUERY_VALUES: Record<Exclude<AssetStatusFilter, 'all'>, HarnessAssetQueryStatus> = {
    developing: '开发中',
    pending: '待发布',
    published: '已发布',
  };
  ```

  Include the mapped `status` in `assetPageQuery`, remove HTTP-mode status filtering from `filteredAssets`, and add:

  ```ts
  async function selectStatusFilter(nextFilter: AssetStatusFilter): Promise<void> {
    if (assetStatusFilter.value === nextFilter) return;
    assetStatusFilter.value = nextFilter;
    await reloadAssets();
  }
  ```

  Bind each pill to `selectStatusFilter(item.key)`. Set `assetTotal` from the first-page response, reset it with the list state, and display `共 {{ assetTotal }} 个资产` in HTTP mode. Keep mock-mode local status/search filtering intact.

- [ ] **Step 4: Run the focused E2E test and verify GREEN**

  Run: `node_modules/.bin/playwright.cmd test e2e/specs/harness-assets-query-http.spec.ts --grep "HTTP 资产筛选"`

  Expected: PASS with a new first-page request for every type/status/search change and Extension always using `已发布`.

---

### Task 3: Load frozen Extension version contents from version-history

**Files:**
- Modify: `src/services/skillMarket/apiTypes.ts`
- Modify: `src/services/skillMarket/skillBaseService.ts`
- Modify: `src/services/skillMarket/extensionPublishHttp.ts:500-522,659-707`
- Modify: `src/services/skillMarket/assetManagementService.ts:1017-1040`
- Modify: `src/components/skill/HarnessExtensionDetailContent.vue:29-82`
- Test: `tests/harness-asset-detail-http.tests.mjs`

**Interfaces:**
- Produces: `QueryExtensionVersionHistoryParams` with `userId`, `dimType`, `dimCode`, `name`, and optional `version`.
- Produces: `ExtensionVersionHistoryDto` containing Extension metadata and frozen `skills`, `commands`, `agents` arrays of `{ name, version }`.
- Changes: `queryHttpExtensionVersionCapabilities(userId, scope, identity, version)` where `identity` contains `name` instead of first/second scene names.
- Preserves: lazy `queryHttpPlanningItemFiles` and `queryHttpPlanningItemContent` calls.

- [ ] **Step 1: Replace the old bindings fixture with a frozen-history fixture**

  In `tests/harness-asset-detail-http.tests.mjs`, make `request.harnessApi` return this complete response for `/extensions/version-history`:

  ```js
  success({
    extensionName: extensionAsset.name,
    version: '1.0.0',
    description: '发布时冻结内容',
    dimType: '部门级',
    dimCode: 'record-dept',
    dimName: '卡片部门',
    targetOrgCode: 'org-1',
    targetOrgName: '组织一',
    operatorName: '发布用户',
    publishStatus: '成功',
    releaseType: 'Product',
    skills: [{ name: 'selected-skill', version: '0.9.0' }],
    commands: [{ name: 'selected-command', version: '0.8.0' }],
    agents: [{ name: 'selected-agent', version: '0.7.0' }]
  })
  ```

  Assert the real request is:

  ```js
  {
    url: '/extensions/version-history',
    method: 'get',
    params: {
      userId: 'user-001',
      dimType: '部门级',
      dimCode: 'record-dept',
      name: extensionAsset.name,
      version: '1.0.0'
    }
  }
  ```

  Assert all three capabilities are mapped with empty `files`, because every component type must obtain its paths from the tree endpoint. Add malformed and failed-response assertions.

- [ ] **Step 2: Run the detail test and verify RED for frozen history**

  Run: `node tests/harness-asset-detail-http.tests.mjs`

  Expected: FAIL because the implementation still posts to `/scenes/bindings` and requires first/second scene fields.

- [ ] **Step 3: Implement the version-history client and mapper**

  Add `skillBaseService.queryExtensionVersionHistory(params)` using:

  ```ts
  return httpRequest.harnessApi<ApiEnvelope<ExtensionVersionHistoryDto>>({
    url: '/extensions/version-history',
    method: 'get',
    params,
  });
  ```

  Rewrite `queryHttpExtensionVersionCapabilities` to validate `scope.dimType`, `scope.dimCode`, Extension `identity.name`, and `version`; call the new service; validate success and object shape; map root `skills`, `commands`, and `agents` with the existing `mapCapability` helper and empty file lists. Update `assetManagementService.queryDetail` to pass `{ name: component.name || asset.name }`.

- [ ] **Step 4: Make every Extension child type query its package tree lazily**

  In `HarnessExtensionDetailContent.vue`, initialize every row with `loaded: false` and `files: []`. Change `loadFiles` to pass the section type rather than hard-coded `skill`:

  ```ts
  async function loadFiles(type: ExtensionCapabilityType, row: CapabilityRow): Promise<void> {
    const paths = await queryHttpPlanningItemFiles(props.userId, type, row.capability);
    // retain existing active-instance and error guards
  }
  ```

  Call it from `toggleCapability(section.type, row)`. This ensures command and agent paths come from `/packages/tree` rather than guessed `<name>.md` paths.

- [ ] **Step 5: Run the detail test and verify GREEN**

  Run: `node tests/harness-asset-detail-http.tests.mjs`

  Expected: PASS for component detail, frozen Extension content, lazy tree/content behavior, and API error propagation.

---

### Task 4: Focused regression verification

**Files:**
- Verify: all files modified by Tasks 1-3
- Update only if assertions reflect the superseded contract: `e2e/specs/extension-detail-http.spec.ts`, `e2e/specs/harness-assets-query-http.spec.ts`

**Interfaces:**
- Consumes all preceding task outputs.
- Produces no new runtime API.

- [ ] **Step 1: Run the complete focused service test set**

  Run:

  ```powershell
  node tests/harness-asset-components-http.tests.mjs
  node tests/harness-asset-detail-http.tests.mjs
  node tests/harness-asset-detail-display.tests.mjs
  node tests/harness-asset-pagination.tests.mjs
  ```

  Expected: all commands print their PASS summaries and exit 0.

- [ ] **Step 2: Run focused E2E coverage when the local Playwright binary is available**

  Run:

  ```powershell
  node_modules/.bin/playwright.cmd test e2e/specs/harness-assets-query-http.spec.ts e2e/specs/extension-detail-http.spec.ts
  ```

  Expected: both specs pass. If browser execution is unavailable, report that environment limitation separately rather than changing runtime code.

- [ ] **Step 3: Run static verification and build**

  Run:

  ```powershell
  npx eslint src/services/skillMarket/apiTypes.ts src/services/skillMarket/skillBaseService.ts src/services/skillMarket/assetManagementTypes.ts src/services/skillMarket/assetManagementHttp.ts src/services/skillMarket/extensionPublishHttp.ts src/services/skillMarket/assetManagementService.ts src/components/skill/HarnessExtensionDetailContent.vue src/views/skill/AgentSkillAssetsPage.vue
  npx vue-tsc --noEmit
  npm run build
  ```

  Expected: touched-file lint and build pass. Record pre-existing unrelated `vue-tsc` failures without expanding this task to fix them.

- [ ] **Step 4: Review the final diff for scope**

  Run: `git diff -- src/services/skillMarket/apiTypes.ts src/services/skillMarket/skillBaseService.ts src/services/skillMarket/assetManagementTypes.ts src/services/skillMarket/assetManagementHttp.ts src/services/skillMarket/extensionPublishHttp.ts src/services/skillMarket/assetManagementService.ts src/components/skill/HarnessExtensionDetailContent.vue src/views/skill/AgentSkillAssetsPage.vue tests/harness-asset-components-http.tests.mjs tests/harness-asset-detail-http.tests.mjs e2e/specs/harness-assets-query-http.spec.ts`

  Expected: no Skill/Agent/Command publish UI, no unrelated refactor, and no loss of existing user changes.
