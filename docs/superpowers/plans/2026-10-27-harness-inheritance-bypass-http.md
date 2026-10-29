# Harness Inheritance, Bypass, and HTTP Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workflow inheritance, product-level scenario selection, Extension bypass management, structure preview, and publication conform to the 2026-10-27 HTTP contracts while preserving parent-injected user context and Mock behavior.

**Architecture:** Keep Vue pages dependent on focused adapters. `workflowInheritanceService` owns scene search/copy normalization, `extensionBypassService` owns bypass/search/tree operations, and `extensionPublishHttp` owns detail/save mapping. The scenario workspace refreshes authoritative server state after copy; the Extension page composes packaging controls and the publish confirmation without duplicating transport details.

**Tech Stack:** Vue 3 Composition API, TypeScript, Axios, Vite SSR service tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-harness-inheritance-bypass-http-design.md`

## Global Constraints

- Use only the parent-injected `userId`, username, and department tree.
- In HTTP mode, never fall back to old workflow or Extension endpoints.
- Treat bypass `extensionName` as `scene_extension_code`, distinct from the publish package name.
- Product-level operations bypass front-end department authorization; department-level operations remain restricted.
- Preserve unrelated user changes and do not commit unless requested.

---

### Task 1: Replace HTTP workflow inheritance with scene search and copy

**Files:**

- Modify: `src/services/skillMarket/businessScenarioDesignService.ts`
- Modify: `src/services/skillMarket/workflowInheritanceService.ts`
- Modify: `src/composables/useHarnessScenarioWorkspace.ts`
- Modify: `src/components/skill/WorkflowInheritanceDialog.vue`
- Test: `tests/workflow-inheritance.tests.mjs`
- Test: `tests/workflow-inheritance-dialog.tests.mjs`

- [ ] Write failing adapter tests requiring `GET /scenes/search` with `userId`, literal keyword, and cumulative limit, plus `POST /scene/copy` with exact source/target dimensions.
- [ ] Run both tests and verify they fail on `/workflow/list`, detail mapping, and overwrite wording.
- [ ] Implement typed search/copy service methods, response normalization, stable keys, current-scene exclusion, and cumulative-limit paging.
- [ ] Change HTTP confirmation to call copy, refresh the target scope, select the returned scene code, and remove the old detail-copy-save path.
- [ ] Update dialog fields and warning to create-new/same-name-rejected semantics; keep Mock inheritance behavior intact.
- [ ] Re-run focused tests to green.

### Task 2: Make product-level selection permission-aware

**Files:**

- Modify: `src/composables/useHarnessScenarioWorkspace.ts`
- Modify: `src/views/HarnessManagementPage.vue`
- Modify as needed: `src/views/skill/BusinessScenarioDesignPage.vue`
- Test: `tests/harness-scenario-scope.tests.mjs`
- Test: `e2e/specs/harness-scenario-scope.spec.ts`

- [ ] Add a failing test with a selected department outside `allowedDepartmentPaths`: product-level data and writes succeed; department-level selection/write remains blocked or moves to an allowed department.
- [ ] Run the focused scope tests and observe the existing global department guard fail.
- [ ] Make permission and department-tree filtering conditional on `scopeLevel`; preserve backend dimension values and department-level safety.
- [ ] Re-run unit and E2E scope tests.

### Task 3: Add typed Extension bypass and structure adapters

**Files:**

- Modify: `src/services/skillMarket/skillBaseService.ts`
- Add: `src/services/skillMarket/extensionBypassService.ts`
- Modify: `src/services/skillMarket/extensionPublishMock.ts`
- Test: `tests/extension-bypass-http.tests.mjs`

- [ ] Write failing tests for upload FormData, clear, layout, structure tree, download URL validation, bypass inheritance, and Extension search with cumulative limit.
- [ ] Run the new test and verify every missing method fails.
- [ ] Add exact HTTP methods and typed normalization. Reject missing user/scene identity, non-zip or >50MB uploads, malformed responses, and unsafe download URLs.
- [ ] Re-run adapter tests to green.

### Task 4: Align Extension detail and publication contracts

**Files:**

- Modify: `src/services/skillMarket/businessScenarioDesignService.ts`
- Modify: `src/services/skillMarket/skillBaseService.ts`
- Modify: `src/services/skillMarket/extensionPublishHttp.ts`
- Modify: `src/services/skillMarket/extensionPublishMock.ts`
- Test: `tests/extension-detail-http.tests.mjs`
- Test: `tests/extension-detail-release-type.tests.mjs`

- [ ] Change tests to require `GET /extensions/detail`, map `sceneExtensionCode`, `layoutMode`, `hasBypass`, and `bypassEntries`, and require `POST /extensions/save` with `inheritBypass` but no layout.
- [ ] Run tests and verify red on the old methods and missing fields.
- [ ] Implement the minimal route, query, type, mapping, and publish input changes.
- [ ] Re-run focused tests to green.

### Task 5: Build the packaging and bypass UI

**Files:**

- Add: `src/components/skill/ExtensionBypassInheritDialog.vue`
- Add: `src/components/skill/ExtensionPackagingPanel.vue`
- Modify: `src/views/skill/ExtensionPublishPage.vue`
- Test: `tests/extension-packaging-ui.tests.mjs`
- Test: `e2e/specs/extension-bypass-http.spec.ts`

- [ ] Add failing UI/E2E coverage for layout persistence, zip upload, ignored-entry warnings, clear confirmation, download, Extension search/inherit, source-colored structure tree, and stale-response protection.
- [ ] Run focused tests and verify the controls are absent.
- [ ] Implement the two composed components and page orchestration, refreshing the authoritative detail/tree after mutations.
- [ ] Re-run focused tests to green.

### Task 6: Add publish-time bypass choice

**Files:**

- Modify: `src/views/skill/ExtensionPublishPage.vue`
- Modify: `src/services/skillMarket/extensionPublishHttp.ts`
- Test: `tests/extension-detail-http.tests.mjs`
- Test: `e2e/specs/extension-detail-http.spec.ts`

- [ ] Add a failing HTTP test showing bypass entries in the publish dialog, unchecking inheritance, and sending `inheritBypass: false` to `/extensions/save`.
- [ ] Implement the default-checked state, file list, warning, and publish input wiring; omit layout from save.
- [ ] Re-run service and E2E publication tests.

### Task 7: Verify the integrated HTTP workflow

**Files:** Verify all files changed above.

- [ ] Run focused service tests: workflow inheritance, scope, bypass, Extension detail, and release type.
- [ ] Run focused Playwright specs: workflow inheritance, scope, Extension bypass, and Extension detail.
- [ ] Run ESLint on touched source/test files.
- [ ] Run `npx vue-tsc --noEmit` and `npm run build`.
- [ ] Run the repository security scan required for user-data and upload changes; triage findings before completion.
- [ ] Review `git diff` for endpoint accuracy, no old-login regression, no layout in save, no unrelated edits, and no unsafe fallback.
