# Vue 3 + Vite + TypeScript（最小可用脚手架）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前空目录初始化可运行的 `Vue 3 + Vite + TypeScript` 工程，并落地 ESLint + Prettier 规范（强制 `{}` 与拖尾逗号），确保 `dev/build/lint/format` 都可执行。

**Architecture:** 使用 Vite 官方 `vue-ts` 模板生成基础工程，再追加 ESLint/Prettier 配置与 npm scripts；不引入 router/pinia/husky 等非目标依赖。

**Tech Stack:** Vue 3, Vite, TypeScript, ESLint, Prettier, npm

---

## File structure（将创建/修改的文件）

**Create（Vite 模板会生成的典型文件，具体以实际生成结果为准）：**

- `index.html`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`
- `src/main.ts`
- `src/App.vue`
- `src/assets/*`
- `src/style.css`（或 `src/assets/main.css` 等，取决于模板）

**Create（我们新增的规范文件）：**

- `.editorconfig`
- `.prettierrc.cjs`
- `.prettierignore`
- `eslint.config.js`（ESLint flat config）
- `.eslintignore`（可选；若 flat config 已覆盖忽略则不需要）

**Modify：**

- `package.json`（增加 lint/format 脚本与相关 devDependencies）
- `README.md`（补充运行与脚本说明；如果模板已带，进行最小增补）

## Task 1: 生成 Vite Vue TS 模板

**Files:**

- Create: （见上方模板文件）

- [ ] **Step 1: 确认目录为空且位于项目根**

Run (PowerShell):

```powershell
Set-Location "d:\赵星code\zhangyuyuTemp\projectTest"
Get-ChildItem -Force
```

Expected: 仅存在 `docs/` 与 `.git/`（以及刚写入的 `docs/superpowers/*` 文件）。

- [ ] **Step 2: 使用 Vite 创建项目到当前目录**

Run (PowerShell):

```powershell
Set-Location "d:\赵星code\zhangyuyuTemp\projectTest"
npm create vite@latest . -- --template vue-ts
```

Expected: 生成 Vite + Vue3 + TS 模板文件（会写入 `package.json` 等）。

- [ ] **Step 3: 安装依赖**

Run:

```powershell
npm install
```

Expected: 成功生成 `node_modules/`，无报错退出。

- [ ] **Step 4: 启动开发服务器验证**

Run:

```powershell
npm run dev
```

Expected: 控制台输出本地服务地址（例如 `http://localhost:5173/`），页面可打开看到默认 Vite/Vue 首页。

- [ ] **Step 5: Commit**

Run:

```powershell
git add .
git commit -m "chore: scaffold Vue3+Vite+TS app"
```

## Task 2: 引入 Prettier（强制拖尾逗号）

**Files:**

- Create: `.prettierrc.cjs`, `.prettierignore`
- Modify: `package.json`

- [ ] **Step 1: 安装 Prettier 相关依赖**

Run:

```powershell
npm install -D prettier
```

Expected: `prettier` 出现在 `devDependencies`。

- [ ] **Step 2: 添加 `.prettierrc.cjs`**

Create `d:\赵星code\zhangyuyuTemp\projectTest\.prettierrc.cjs`:

```js
/** @type {import("prettier").Config} */
module.exports = {
  printWidth: 100,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
};
```

- [ ] **Step 3: 添加 `.prettierignore`**

Create `d:\赵星code\zhangyuyuTemp\projectTest\.prettierignore`:

```gitignore
node_modules
dist
.vite
.turbo
coverage
*.log
```

- [ ] **Step 4: 添加 `format` 脚本并试跑**

Modify `package.json` scripts 增加：

```json
{
  "scripts": {
    "format": "prettier . --write"
  }
}
```

Run:

```powershell
npm run format
```

Expected: 对 `.ts/.js/.vue` 执行格式化，不报错退出。

- [ ] **Step 5: Commit**

Run:

```powershell
git add .prettierrc.cjs .prettierignore package.json package-lock.json
git commit -m "chore: add prettier with trailing commas"
```

## Task 3: 引入 ESLint（强制 `{}`）

**Files:**

- Create: `eslint.config.js`, `.editorconfig`
- Modify: `package.json`

- [ ] **Step 1: 安装 ESLint + Vue/TS 支持 + 与 Prettier 协同**

Run:

```powershell
npm install -D eslint eslint-plugin-vue @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier
```

Expected: 依赖安装成功。

- [ ] **Step 2: 添加 `eslint.config.js`（flat config）**

Create `d:\赵星code\zhangyuyuTemp\projectTest\eslint.config.js`:

```js
import vue from 'eslint-plugin-vue';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  // Vue 推荐规则（包含 .vue）
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      curly: ['error', 'all'],
    },
  },
  // 关闭与 Prettier 冲突的风格规则
  prettier,
];
```

- [ ] **Step 3: 添加 `.editorconfig`（保证基础一致性）**

Create `d:\赵星code\zhangyuyuTemp\projectTest\.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

- [ ] **Step 4: 添加 `lint` 脚本并试跑**

Modify `package.json` scripts 增加：

```json
{
  "scripts": {
    "lint": "eslint ."
  }
}
```

Run:

```powershell
npm run lint
```

Expected: 初次运行可能有少量模板代码风格提示；若有阻断性错误，按本计划后续步骤逐一修复直至通过。

- [ ] **Step 5: 验证 `{}` 强制生效（制造一个可预期的 ESLint 报错）**

Temporarily edit `src/main.ts`（只为验证规则，验证后立刻撤回该行修改）：

```ts
if (true) console.log('x');
```

Run:

```powershell
npm run lint
```

Expected: ESLint 报 `curly` 相关错误。

Revert（撤回该临时修改）：

```powershell
git restore src/main.ts
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add eslint.config.js .editorconfig package.json package-lock.json
git commit -m "chore: add eslint and enforce curly braces"
```

## Task 4: 验收（对应 spec 的验收标准）

**Files:**

- None (verification only)

- [ ] **Step 1: build**

Run:

```powershell
npm run build
```

Expected: 构建成功产出 `dist/`，进程退出码为 0。

- [ ] **Step 2: preview**

Run:

```powershell
npm run preview
```

Expected: 输出预览地址，浏览器打开正常渲染页面。

- [ ] **Step 3: lint + format**

Run:

```powershell
npm run lint
npm run format
```

Expected: 两者均可执行（lint 若发现问题，修复后保证通过）。

- [ ] **Step 4: 最终 Commit（如验收过程中产生修复）**

Run:

```powershell
git add .
git commit -m "chore: fix lint/format issues"
```

---

## Plan self-review（覆盖 spec 要求）

- Spec 要求的技术栈：已覆盖（Vue3/Vite/TS + ESLint/Prettier）
- 强制 `{}`：通过 ESLint `curly: ["error", "all"]` + 验证步骤覆盖
- 拖尾逗号：通过 Prettier `trailingComma: 'all'` 覆盖
- 验收命令：`dev/build/lint/format/preview` 均有明确命令与预期
