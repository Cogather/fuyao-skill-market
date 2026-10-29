# PR #73 登录链路回退设计

## 意图

从最新 `master` 新建独立分支，完整回退 `f874f168c2ae3e00b32db8cb6922ab79ecc32650`，并清理 PR #73 后续保留提交中延续该登录方案的代码；迁移、组织发布、Harness 页面能力、样式与 Mock 数据继续保留。

## 目标

- 完整撤销 `f874f16` 引入的代码，而不是只关闭其中部分行为。
- 撤销 `18df071` 与 `179c227` 中继续完善 SSO、登录接口、登录跳转、用户/部门来源切换的代码块。
- 保留 `18df071` 中的大量市场迁移和组织发布内容。
- 完整保留 `7a2695f` 的 UI 修正。
- 保留 `1c84e9a` 的头像地址和 Vite 代理目标变更；它们按迁移配置处理，不属于本次登录流程回退。
- 保留 PR #79 及其他后续提交，并确保其显式传入的 `userId` 继续来自父页面上下文。

## 非目标

- 不回退 PR #73 的所有五个剩余提交。
- 不重做登录方案，也不新增新的认证逻辑。
- 不修复当前 `master` 已存在的三个 Node 测试失败。
- 不修改现有组织发布、业务场景、资产管理与 UI 行为，除非它们仅用于选择登录用户/部门来源。

## 方案比较

### 方案 A：整笔回退所有剩余提交

实现简单，但会删除迁移、组织发布和 UI 修复，不符合“其他代码保持”的要求。

### 方案 B：只关闭 App 中的登录初始化

改动最少，但会留下路由守卫、登录跳转、部门接口、Profile Store 来源切换和死代码，不能完整恢复旧链路。

### 方案 C：完整回退 `f874f16`，再按功能块清理后续登录延续代码（选定）

以 `f874f16` 的父版本作为登录链路参考，完整撤销该提交；对于后续混合提交，只逆转登录相关代码块，保留其余迁移和 UI 内容。这一方案范围最精确，也能避免把 PR #79 等后续功能带回退。

## 代码边界

登录相关代码将恢复到 PR #73 之前的行为：

- `src/App.vue`：恢复并缓存父页面 `Skill_Square_Init` 上下文；移除自动 Profile 初始化和定时登录校验。
- `src/api/user.ts`：恢复原请求方式和原环境变量来源，移除本次新增的部门接口链路。
- `src/router/index.ts`：移除新增的 Profile 登录守卫。
- `src/services/skillMarket/request.ts`：移除仅为新登录方案新增的 `getWithCookie`。
- `src/services/skillMarket/marketDeptTreeFromApi.ts`：移除仅服务于登录用户部门接口的扁平部门树转换。
- `src/stores/userStore.ts`：恢复 PR 前的用户初始化、清理和登录校验行为；保留 `1c84e9a` 的头像地址迁移。
- `src/components/skill/UploadSkillModal.vue`、`src/views/skill/SkillDetailPage.vue`、`src/views/HarnessManagementPage.vue`、`src/views/skill/UserMarketShell.vue`：恢复父页面注入的 `skillMarketStore` 用户和部门来源；其他业务/UI 代码保持不变。
- `src/vite-env.d.ts`：移除 `f874f16` 新增且只被该登录链路使用的环境变量声明。

`vite.config.ts`、组织发布组件及 `18df071` 的迁移/UI 大块不回退。

## 验证

- 对比最终差异，确认 `f874f16` 的所有代码效果均已撤销。
- 审计 `18df071`、`179c227`、`7a2695f`、`1c84e9a`，确认仅登录延续代码被撤销。
- 运行 `git diff --check`。
- 运行生产构建。
- 运行完整 Node 测试，并与当前 `master` 基线的 30/33 结果对照，确保不新增失败测试文件。
- 检查提交中没有构建产物、依赖目录或无关文件。
