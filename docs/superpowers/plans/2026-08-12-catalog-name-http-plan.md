# Catalog Name HTTP Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce consistent product-aware catalog naming for Command, Skill, and Agent add/edit flows, including the active HTTP request path.

**Architecture:** Keep the existing regex and prefix helper as the shared source of truth, add a throwing assertion for HTTP boundaries, and update each editor to use the same prefix transition behavior. Skill requests will validate inside `skillBaseService`; Command and Agent requests will validate inside `harnessCapabilityPlanningHttp` before their capability-specific body is sent.

**Tech Stack:** Vue 3, TypeScript, Vite, Node built-in test runner with TypeScript stripping.

---

### Task 1: Add executable shared name-rule tests

**Files:**
- Create: `tests/catalogItemName.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests**

Test `getProductCatalogItemNamePrefix` and the shared assertion for:

```ts
assert.equal(getProductCatalogItemNamePrefix('产品级', 'test-product'), 'test-product-');
assert.equal(getProductCatalogItemNamePrefix('产品级', 'Test产品_01'), '');
assert.equal(getProductCatalogItemNamePrefix('部门级', 'test-product'), '');
assert.throws(() => assertCatalogItemName('bad name', '产品级', 'test-product'), /名称/);
assert.throws(() => assertCatalogItemName('other-name', '产品级', 'test-product'), /开头/);
assert.throws(() => assertCatalogItemName('test-product-', '产品级', 'test-product'), /补充/);
assert.doesNotThrow(() => assertCatalogItemName('plain-name', '产品级', 'Test产品_01'));
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- --test-name-pattern="catalog name"`

Expected: FAIL because the throwing assertion and test script do not exist yet.

### Task 2: Implement the shared rule and HTTP boundary validation

**Files:**
- Modify: `src/utils/catalogItemName.ts`
- Modify: `src/services/skillMarket/skillBaseService.ts`
- Modify: `src/services/skillMarket/harnessCapabilityPlanningHttp.ts`

- [ ] **Step 1: Add a shared throwing assertion**

Implement `assertCatalogItemName(name, level, originalProductName, label)` using the existing regex and prefix helper. It must validate ordinary format first, skip prefix validation for department level or invalid original products, and reject a name equal to the prefix.

- [ ] **Step 2: Apply it at the Skill HTTP create/update boundary**

Before `httpRequest.harnessSkill` is called in `createSkillMasterManagement` and `updateSkillMasterManagement`, validate `body.skillName` with `params.dimType` and `params.dimName`.

- [ ] **Step 3: Apply it at the Command/Agent HTTP create/update boundary**

Before the capability client is called from `createHttpCapabilityCatalogRecord` and `updateHttpCapabilityCatalogRecord`, validate `payload.name` with `payload.level`, `payload.product`, and the capability label.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- --test-name-pattern="catalog name"`

Expected: PASS.

### Task 3: Update Skill, Command, and Agent create/edit UX

**Files:**
- Modify: `src/components/skill/SkillMasterManagementPanelV2.vue`
- Modify: `src/components/skill/HarnessCapabilityCatalogPanel.vue`

- [ ] **Step 1: Add prefix transition synchronization**

When the active create editor is open, replace an untouched old prefix with the new lowercased prefix on product changes and preserve any suffix. When opening create, initialize the name from the current prefix. Do not rewrite edit names.

- [ ] **Step 2: Keep validation order and existing form logic**

Run ordinary format validation, then prefix validation, then the existing description/person/date checks. Keep the prefix-only-name rejection and all existing non-name validation.

- [ ] **Step 3: Run typecheck/build**

Run: `npm run build`

Expected: Vite build exits with code 0.

### Task 4: Verify HTTP-specific behavior and regression coverage

**Files:**
- Inspect: `src/services/skillMarket/harnessCapabilityPlanningService.ts`
- Inspect: `src/services/skillMarket/harnessCapabilityPlanningHttp.ts`
- Inspect: `src/services/skillMarket/skillBaseService.ts`

- [ ] **Step 1: Verify the HTTP transport selects the edited paths**

Confirm `VITE_SKILL_MARKET_TRANSPORT=http` selects `createHttpCapabilityPlanning`/`updateHttpCapabilityPlanning` for Command and Agent and that Skill directly calls the HTTP `skillBaseService` methods.

- [ ] **Step 2: Run all available verification commands**

Run: `npm test`; `npm run lint`; `npm run build`

Expected: all commands exit with code 0.
