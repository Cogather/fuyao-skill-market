# Extension Release Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CodeAgent and TestAgent release assembly around the existing Extension publish card without changing that card's form or capability interactions.

**Architecture:** Keep `ExtensionPublishPage.vue` as the owner of the existing publish form and API call. Add a focused assembly service for package rules/mock boundaries and a focused Vue component for mode, inheritance, ZIP upload, and tree preview; connect their payload to the existing confirm action.

**Tech Stack:** Vue 3, TypeScript, Vite SSR tests, Playwright, PizZip.

**Spec:** `docs/superpowers/specs/2026-10-23-extension-release-targets-design.md`

## Global Constraints

- Preserve the existing Extension information form, styling, capability folders, and file expansion behavior.
- Default to CodeAgent; retain form values and uploads on target switch; reset inheritance to the new target's default.
- Keep all unknown backend behavior behind a replaceable mock service.
- Filter protected capability directories and root manifest files from uploaded ZIPs.

## Review Focus

- A target switch must not clear the current Extension description, channel, organization, or uploaded files.
- TestAgent must never retain the CoreALM conversion option.
- Protected upload paths must be rejected case-insensitively and nested paths must not bypass the filter.
- An uploaded sidecar at the same path must replace an inherited sidecar in the preview.
- Empty or malformed ZIP files must produce a visible error without corrupting the current preview.

---

### Task 1: Release assembly domain and mock boundary

**Files:**
- Create: `src/services/skillMarket/extensionReleaseAssembly.ts`
- Create: `tests/extension-release-assembly.tests.mjs`

**Interfaces:**
- Produces: `createAssemblyState`, `switchAssemblyTarget`, `buildExtensionPackageTree`, `filterExtensionArchivePaths`, `readExtensionArchive`, `createMockInheritanceSources`, and `submitExtensionAssemblyMock`.

- [x] Write behavior tests for both layouts, target switching, upload filtering, precedence, and conversion reset.
- [x] Run `node tests/extension-release-assembly.tests.mjs` and verify the missing module/exports fail.
- [x] Implement the typed pure functions and PizZip adapter.
- [x] Re-run the test and verify all assertions pass.

### Task 2: Assembly UI and existing publish-card integration

**Files:**
- Create: `src/components/skill/ExtensionReleaseAssemblyPanel.vue`
- Modify: `src/views/skill/ExtensionPublishPage.vue`
- Create: `e2e/specs/extension-release-targets.spec.ts`

**Interfaces:**
- Consumes: Task 1 assembly state, sources, tree builder, archive reader, and mock submitter.
- Produces: a `v-model` assembly state and an unchanged existing publish form wrapped by the new release flow.

- [x] Add a failing Playwright test that opens a workflow release, verifies CodeAgent default, switches to TestAgent, checks the `.testagent/` preview, changes inheritance, and switches back without losing uploads.
- [x] Run the targeted Playwright test and verify it fails because the assembly UI is absent.
- [x] Implement the assembly panel and connect it around the existing release card without changing the form/list markup.
- [x] Connect mock assembly submission to `confirmPublish`, including target-specific conversion behavior.
- [x] Re-run the targeted Playwright test and verify it passes.

### Task 3: Regression and build verification

**Files:**
- Modify only if a regression is found by a failing test.

**Interfaces:**
- Consumes: all Task 1 and Task 2 behavior.

- [x] Run the new domain test plus existing Extension context and style tests.
- [x] Run targeted workflow/Extension Playwright coverage.
- [x] Run a production build to a temporary output directory so the tracked `dist/` directory remains untouched.
- [x] Review the final diff against the spec, especially that existing form/list markup and selectors remain intact.

