# PR #73 Login Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整撤销 `f874f16` 并清理 PR #73 后续提交延续的登录链路，同时保留迁移、组织发布、UI 修复和 PR #79。

**Architecture:** 以 `f874f16^` 为登录链路参考版本。核心登录基础设施文件恢复到该版本；混合了后续迁移内容的大文件只修改身份/部门来源代码块。用运行时边界测试覆盖父级上下文、请求通道、部门初始化和身份优先级，并用构建、现有行为测试与最终差异审计约束迁移功能继续保留。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vite、Node.js test runner、Git

**Spec:** `docs/superpowers/specs/2026-10-26-pr73-login-rollback-design.md`

## Global Constraints

- 分支必须基于最新 `origin/master`；分支名为 `codex/revert-pr73-login-rollback`。
- 完整撤销 `f874f168c2ae3e00b32db8cb6922ab79ecc32650` 的代码效果。
- 仅撤销 `18df071` 与 `179c227` 中继续完善该登录方案的代码块。
- 完整保留 `7a2695f`、PR #79、组织发布、迁移页面、样式和 Mock 数据。
- 保留 `1c84e9a` 的头像地址与 `vite.config.ts` 代理目标变更。
- 当前 `master` 的 Node 基线为 30/33；不得新增失败测试文件。

## Review Focus

- 父页面上下文尚未到达时，页面应继续等待 `userId` 和部门树，而不是回退到新的 Profile 登录链路；由 Task 3 的消费者行为测试覆盖。
- `f874f16` 新增的登录请求与部门初始化不得继续执行；由 Task 2 的运行时边界测试覆盖。
- `UserMarketShell.vue` 的组织发布和 `SkillPlanningPage` 迁移内容不得被整文件恢复误删；由构建、现有测试和最终差异审计覆盖。
- `OrgPublishTaskPanel` 必须继续收到 `UserMarketShell` 显式传入的 `userId`；由最终差异审计覆盖。
- `1c84e9a` 的头像地址迁移和 Vite 代理目标不得随登录回退丢失；由最终差异审计覆盖。

---

### Task 1: 添加登录回退运行时回归测试

**Files:**
- Create: `tests/pr73-login-rollback.tests.mjs`
- Modify: `docs/superpowers/specs/2026-10-26-pr73-login-rollback-design.md`
- Create: `docs/superpowers/plans/2026-10-26-pr73-login-rollback.md`

**Interfaces:**
- Consumes: 当前 `master` 运行时行为与 `f874f16^` 确定的旧登录链路。
- Produces: 覆盖父级上下文、禁止自动登录启动、原请求通道、Profile 部门初始化和消费者身份优先级的 Node 测试。

- [ ] **Step 1: 编写核心登录运行时测试**

- 将 `Skill_Square_Init` 消息送入 `App.vue`，断言 `skillMarketStore` 收到用户和部门上下文。
- 客户端装载 `App.vue`，断言不会调用 Profile 初始化、Token 校验或注册登录定时器。
- 替换请求对象方法，断言 `getUserInfo()` 使用原 `direct` 通道而不是 Cookie 专用通道。
- 初始化 Profile Store，断言不会额外调用用户部门接口。

- [ ] **Step 2: 编写消费者身份优先级测试**

同时设置父页面注入身份和 Profile 身份，装载上传弹窗、UserMarketShell、Harness 与详情页，断言它们都使用父页面注入身份和部门上下文。

- [ ] **Step 3: 运行测试并确认红灯**

Run: `node --test tests/pr73-login-rollback.tests.mjs`

Expected: 核心测试在当前 `master` 上分别因上下文未写入、请求通道错误、额外部门请求而 FAIL；消费者测试因使用 Profile 身份而 FAIL。

### Task 2: 恢复核心登录基础设施

**Files:**
- Modify: `src/App.vue`
- Modify: `src/api/user.ts`
- Modify: `src/router/index.ts`
- Modify: `src/services/skillMarket/request.ts`
- Modify: `src/services/skillMarket/marketDeptTreeFromApi.ts`
- Modify: `src/stores/userStore.ts`
- Modify: `src/vite-env.d.ts`
- Test: `tests/pr73-login-rollback.tests.mjs`

**Interfaces:**
- Consumes: `f874f16^` 中的父页面上下文、原用户 API 与原 Profile Store 行为。
- Produces: 由 `skillMarketStore` 父页面上下文驱动的应用入口；不再自动启动新 SSO 登录链路。

- [ ] **Step 1: 恢复可整文件还原的核心文件**

从 `f874f16^` 恢复 `src/App.vue`、`src/api/user.ts`、`src/router/index.ts`、`src/services/skillMarket/request.ts`、`src/services/skillMarket/marketDeptTreeFromApi.ts`、`src/vite-env.d.ts`。这些文件在后续保留提交中的变更均属于登录延续或格式化，不包含需保留的迁移功能。

- [ ] **Step 2: 恢复 User Store 并保留头像迁移**

从 `f874f16^` 恢复 `src/stores/userStore.ts`，随后只把头像 URL 改回 `1c84e9a` 的 `https://xxx/face/${info.w3Id.substr(1)}/120`。不得保留 `departmentList`、部门接口初始化、防重入 Promise 或 iframe 登录跳转。

- [ ] **Step 3: 运行核心契约测试**

Run: `node --test --test-name-pattern="Skill_Square_Init|application startup|login user lookup|profile initialization" tests/pr73-login-rollback.tests.mjs`

Expected: PASS。

- [ ] **Step 4: 提交核心恢复**

```bash
git add src/App.vue src/api/user.ts src/router/index.ts src/services/skillMarket/request.ts src/services/skillMarket/marketDeptTreeFromApi.ts src/stores/userStore.ts src/vite-env.d.ts tests/pr73-login-rollback.tests.mjs docs/superpowers/specs/2026-10-26-pr73-login-rollback-design.md docs/superpowers/plans/2026-10-26-pr73-login-rollback.md
git commit -m "revert: restore pre-PR73 login plumbing"
```

### Task 3: 恢复页面身份来源并保留迁移内容

**Files:**
- Modify: `src/components/skill/UploadSkillModal.vue`
- Modify: `src/views/skill/SkillDetailPage.vue`
- Modify: `src/views/HarnessManagementPage.vue`
- Modify: `src/views/skill/UserMarketShell.vue`
- Test: `tests/pr73-login-rollback.tests.mjs`

**Interfaces:**
- Consumes: `skillMarketStore.userId: string`、`skillMarketStore.userName: string`、`skillMarketStore.departmentList: unknown[]`。
- Produces: 所有业务消费者优先使用父页面注入身份，同时保留 Profile Store 作为原有兜底的位置。

- [ ] **Step 1: 恢复 Upload 与详情页身份优先级**

在 `UploadSkillModal.vue` 和 `SkillDetailPage.vue` 恢复 `useSkillMarketStore`；计算用户 ID 时保持 `父级参数 > skillMarketStore.userId > profileStore.userInfo.w3Id`（Upload）及 `skillMarketStore.userId > profileStore.userInfo.w3Id`（详情页）。

- [ ] **Step 2: 恢复 Harness 父页面上下文**

将 `HarnessManagementPage.vue` 的 `userId`、`userName`、部门树和等待逻辑恢复为 `f874f16^` 的 `skillMarketStore` 实现；保留文件其余 Harness 功能不变。

- [ ] **Step 3: 恢复 UserMarketShell 身份来源**

只修改 `UserMarketShell.vue` 的 store 初始化、`userId`、`userName`、`departmentList`、等待条件和相应注释；不得删除或重排组织发布、意见列表、SkillPlanning、样式和 PR #79 代码。

- [ ] **Step 4: 运行消费者行为测试**

Run: `node --test --test-name-pattern="skill upload prefers" tests/pr73-login-rollback.tests.mjs`

Expected: PASS。

- [ ] **Step 5: 运行完整验证**

Run: `node --test tests/pr73-login-rollback.tests.mjs`

Expected: 6/6 PASS。

Run: `npm.cmd run build`

Expected: Vite build exit 0。

Run: `node --test (Get-ChildItem tests -Filter '*.tests.mjs').FullName`

Expected: 不新增失败测试文件；允许与 `master` 基线相同的三个既有失败文件。

Run: `git diff --check origin/master..HEAD`

Expected: exit 0。

- [ ] **Step 6: 提交消费者恢复**

```bash
git add src/components/skill/UploadSkillModal.vue src/views/skill/SkillDetailPage.vue src/views/HarnessManagementPage.vue src/views/skill/UserMarketShell.vue
git commit -m "revert: restore injected user context"
```

- [ ] **Step 7: 审计提交范围**

Run: `git diff --stat origin/master..HEAD`、`git diff --name-status origin/master..HEAD`、`git log --oneline origin/master..HEAD`。

Expected: 仅包含设计、计划、契约测试和上述登录相关源文件；不包含 `dist/`、`node_modules/`、测试报告或其他无关文件。
