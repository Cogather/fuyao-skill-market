# Harness Management Compact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify every `/harness-management` tab with the Agent / Skill asset header style and keep the desktop page inside a 1920 x 1080 viewport without a document or full-page content scrollbar.

**Architecture:** Add shared page, heading, title, and description classes to the tab components, then define their canonical appearance once in `HarnessManagementPage.vue`. Replace viewport-minus-magic-number boards with a bounded flex/grid height chain so only dense tables and local panes scroll when their data exceeds the available area.

**Tech Stack:** Vue 3 SFC, scoped CSS with `:deep()`, TypeScript, Playwright.

**Spec:** User request and annotated screenshot supplied on 2026-09-07.

## Global Constraints

- The canonical title is the current `.asset-page__header h1`: `22.4px`, weight `700`, normal line height and letter spacing, color `#111827`.
- The canonical description is the current `.asset-page__header p`: `13.12px`, normal line height, color `#6b7280`, and `3.2px` top margin.
- Remove the visible `SCENARIO DESIGN` and `WORKFLOWS` eyebrow text.
- At `1920 x 1080`, document overflow and each top-level page-root overflow must be at most one pixel.
- Preserve local scrolling for large datasets and smaller viewports; do not clip controls or data.
- Preserve all existing uncommitted business changes and do not create a commit from the shared dirty worktree.

---

### Task 1: Add the desktop layout regression

**Files:**

- Create: `e2e/specs/harness-management-layout.spec.ts`

**Interfaces:**

- Consumes: top-level tab ids `#harness-tab-${key}`, panel ids `#harness-panel-${key}`, and the existing Agent / Skill asset header.
- Produces: one table-driven Playwright contract for shared typography, removed eyebrows, and 1080px viewport containment.

- [ ] **Step 1: Write the failing test**

Read the asset title and description computed styles, visit every top-level tab, and compare the same style fields. Assert no document/page-root vertical overflow and no asset-board overflow at `1920 x 1080`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/specs/harness-management-layout.spec.ts --project=chromium`

Expected: FAIL because scenario/workflow titles are `30px`, planning-style heroes are `42px`, English eyebrows are present, and fixed board heights can overflow the tab panel.

### Task 2: Introduce the shared header contract

**Files:**

- Modify: `src/views/HarnessManagementPage.vue`
- Modify: `src/views/skill/AgentSkillAssetsPage.vue`
- Modify: `src/views/skill/BusinessScenarioDesignPage.vue`
- Modify: `src/views/skill/HarnessCapabilityManagementPage.vue`
- Modify: `src/views/skill/HarnessWorkflowsPage.vue`
- Modify: `src/views/skill/SkillPlanningPage.vue`
- Modify: `src/views/skill/ExtensionPublishPage.vue`
- Modify: `src/views/skill/HarnessConfigurationPage.vue`
- Modify: `src/views/skill/HarnessTaskManagementPage.vue`

**Interfaces:**

- Produces: `.harness-viewport-page`, `.harness-page-heading`, `.harness-page-title`, and `.harness-page-description` classes.

- [ ] **Step 1: Add the common classes to each page root and visible page header**

Keep each component's existing structural class so local styles and tests remain compatible.

- [ ] **Step 2: Remove the two English eyebrow nodes**

Delete `SCENARIO DESIGN` and `WORKFLOWS`, then remove their unused CSS rules.

- [ ] **Step 3: Define the canonical header styles once in the shell**

Use scoped `:deep()` selectors under `.harness-management-shell` so modal and nested component headings are unaffected.

- [ ] **Step 4: Run the layout test**

Expected: typography and eyebrow assertions pass; remaining failures identify only height-chain work.

### Task 3: Bound each tab to the viewport and compact the dense content

**Files:**

- Modify: `src/views/HarnessManagementPage.vue`
- Modify: `src/views/skill/AgentSkillAssetsPage.vue`
- Modify: `src/views/skill/BusinessScenarioDesignPage.vue`
- Modify: `src/views/skill/HarnessCapabilityManagementPage.vue`
- Modify: `src/views/skill/HarnessWorkflowsPage.vue`
- Modify: `src/views/skill/SkillPlanningPage.vue`
- Modify: `src/views/skill/ExtensionPublishPage.vue`
- Modify: `src/views/skill/HarnessConfigurationPage.vue`
- Modify: `src/views/skill/HarnessTaskManagementPage.vue`
- Modify: `src/components/skill/HarnessCapabilityCatalogPanel.vue`
- Modify: `src/components/skill/SkillMasterManagementPanelV2.vue`
- Modify: `src/components/skill/SkillPlanningTaskPanel.vue`
- Modify: `src/components/skill/DepartmentPlanningPermissionPanel.vue`

**Interfaces:**

- Consumes: `.harness-viewport-page` from Task 2.
- Produces: a `100dvh` shell/panel height chain and local scroll containers for tables, scenario panes, and extension panes.

- [ ] **Step 1: Bound the shell and tab panel**

Set the shell to `100vh` plus `100dvh`, hide document-level overflow, and give each tab panel the remaining height below the 66px top bar.

- [ ] **Step 2: Convert page roots to fill the remaining panel height**

Use flex/grid rows with `min-height: 0`; keep compact header/filter/tab sections fixed and let the main board take `flex: 1`.

- [ ] **Step 3: Remove viewport magic numbers from desktop boards**

Set planning, capability, master, and extension boards to `height: auto; min-height: 0`; keep their table/content wrappers as the local overflow owners.

- [ ] **Step 4: Compact the default asset grid at 1080px**

Use a denser minimum card width and compact card text/actions so the default 24-item mock catalog fits without scrolling while the existing lazy-load test still scrolls at `1280 x 720` and with 60 records.

- [ ] **Step 5: Retain a small-window fallback**

Below the desktop width or height threshold, let the tab panel scroll so responsive one-column layouts remain reachable.

- [ ] **Step 6: Run the focused tests**

Run the new layout spec and the existing asset infinite-scroll and management specs.

### Task 4: Verify the integrated result

**Files:**

- Verify all changed files.

- [ ] **Step 1: Run formatting and lint checks**

Run Prettier check on the touched files and `npm run lint`.

- [ ] **Step 2: Run the full Harness E2E set**

Run: `npx playwright test e2e/specs/harness-management-layout.spec.ts e2e/specs/harness-management.spec.ts e2e/specs/harness-assets.spec.ts e2e/specs/harness-assets-infinite-scroll.spec.ts --project=chromium`

- [ ] **Step 3: Run the production build**

Run: `npm run build`

- [ ] **Step 4: Inspect the final diff**

Confirm only layout/header changes, the regression test, and this plan were added on top of the user's existing work.
