---
name: frontend-page-e2e
description: 对任意前端页面实现、新增或维护 Playwright 端到端自动化测试，包括：从零接入测试环境、分析页面源码生成 Page Object 与用例、页面改版后同步更新用例、诊断失败用例、接入登录态与 CI。适用触发：给某个页面写 E2E 测试、页面自动化测试、新页面补测试、Playwright 用例报红排查、接入 Playwright 环境。
---

# 前端页面 E2E 自动化（页面无关、演进友好）

## 本 Skill 的设计原理（必读）

本 skill **不保存任何具体页面的知识**。它只保存三样稳定不变的东西：

1. **通用工作流**：从"目标页面"到"可运行的测试"的完整流程（下方阶段 0～4）
2. **团队约定**：文件结构、选择器优先级、等待/断言规则、反模式清单
3. **模板**：Page Object / 用例 / 页面上下文的标准骨架

页面专属知识存放在仓库的 `e2e/pages/`（定位器）与 `e2e/contexts/`（页面上下文笔记）。

因此：**换一个页面测试 = 重新执行阶段 1～4，skill 本体零改动**；**页面演进 = 更新该页面的 pages/contexts 文件，skill 本体依然零改动**。如果发现自己在往 skill 里加某个页面的具体内容，说明方向错了——那是页面知识，应该写进 contexts。

## 核心工作流

### 阶段 0：环境自检

检查测试环境是否就绪，缺什么补什么：

- `node --version` ≥ 18（Playwright 硬性要求）
- `package.json` 有 `@playwright/test`（没有则 `npm install -D @playwright/test`）
- `playwright.config.ts` 存在（没有则按本 skill「环境搭建基线」创建）
- 浏览器可用：标准路径 `npx playwright install chromium`；受限环境（代理/沙箱/磁盘）设 `PW_CHANNEL=msedge` 用系统 Edge，零下载
- 确认应用信息：dev 端口、`VITE_BASE` 前缀、数据模式（mock/http）、登录要求——从 `.env.development`、`vite.config.ts` 读取，**不要猜**

### 阶段 1：页面分析（写测试前必做）

1. **确定目标页面**：用户给出路由或页面名。在 `src/router` 中定位 route → 组件文件；页面名有歧义时列出候选让用户选，**禁止猜测**
2. **读组件源码提取稳定锚点**：可见文本（tab 名/标题/按钮文案）、`aria-label`、`placeholder`、已有 `data-testid`
3. **读 env/vite 配置**：base 前缀（所有 goto 必须拼接 `APP_BASE_PATH`）、数据模式（mock 还是 http）、是否依赖父应用注入（如 postMessage 参数）
4. **读已有页面上下文**：若 `e2e/contexts/<page>.md` 存在，先读；但必须对照当前源码验证是否过期（页面可能已改版）
5. **产出/更新上下文文件**：按 `e2e/templates/context.template.md` 写入 `e2e/contexts/<page>.md`
6. 关键信息缺失（无法本地跑、需要账号、接口需要真实环境）时，**先向用户确认再动手**

### 阶段 2：生成/更新测试代码

1. `e2e/pages/<PageName>.page.ts`：定位器集中 + 语义化动作方法（`gotoXxx`/`switchToXxx`/`openXxx`/`submitXxx`）
2. `e2e/specs/<page>.spec.ts`：复制 `e2e/templates/page.spec.template.ts` 修改。**无需注册任何 fixture**——spec 在 `beforeEach` 里直接实例化 POM，新增页面零额外改动
3. 用例分层：1～3 条 `@smoke`（能打开 + 核心路径）+ 必要的回归用例
4. 断言必须验证**用户可见的业务结果**，而非内部状态

### 阶段 3：运行与修复

1. `npm run test:e2e -- e2e/specs/<page>.spec.ts`（首次）→ 全绿后跑 `npm run test:e2e`
2. 报红时按「失败诊断三分法」处理（见下）
3. 修复后**连续跑 3 次全绿**才算完成（防 flaky 残留）

### 阶段 4：交付与同步

1. 回写 `e2e/contexts/<page>.md`：记录新增/变更的选择器、坑、数据依赖
2. 若页面演进（不是新页面），在「演进记录」里追加本次变更
3. 测试改动与页面改动同一 PR 提交，便于 review 对照

## 文件结构与职责

```
e2e/
  fixtures/base.ts          # 全局扩展点（登录态 storageState、全局钩子）；新增页面无需改动
  pages/*.page.ts           # Page Object：该页全部定位器；UI 改版主要改这里
  specs/*.spec.ts           # 用例：业务动作与断言；@smoke 标记冒烟
  contexts/*.md             # 页面上下文：路由/锚点/坑/演进记录；换页面换它，不动 skill
  templates/                # 三个模板：page.spec / context；复制即用
  helpers/constants.ts      # APP_BASE_PATH 等全局常量
```

## 选择器优先级（从上到下）

| 优先级 | 方式                                                | 示例                                               |
| ------ | --------------------------------------------------- | -------------------------------------------------- |
| 1      | 角色 + 可见文本                                     | `getByRole('button', { name: '发布 Skill' })`      |
| 2      | placeholder / aria-label                            | `getByPlaceholder('搜索名称 / 描述 / 创建者工号')` |
| 3      | data-testid（命名 `模块-语义`，组件开发时就应内嵌） | `getByTestId('skill-card-open-btn')`               |
| ❌     | class 定位、CSS 结构定位、深层 XPath                | `.btn-primary`、`div > div:nth-child(3)`           |

同页文本重复时用 `exact: true`；动态文本用正则（如 `/订单.*已提交/`）。

## 等待与断言

- ✅ `expect(locator).toBeVisible()` / `toHaveText()` 等自动重试断言
- ✅ 等待"结果出现"：成功提示、列表变化、`waitForResponse` 等网络完成
- ❌ 裸 `waitForTimeout()`：仅外部时序（第三方动画等）且必须写注释说明原因
- 断言业务结果："提交成功提示出现"而非"请求发出去了"；用例之间独立，不共享可变数据

## 登录与数据模式

- **本地 mock**（`VITE_*_TRANSPORT=mock`）：直接跑，无需登录
- **需登录**：storageState 方案——`e2e/auth/` 写登录 setup 脚本存 Cookie 到 `e2e/auth/user.json`（gitignore），config 的 projects 里挂 `storageState`；登录态过期重跑 setup 即可
- **依赖真实接口**：优先 `page.route()` 网络拦截 mock 关键接口；或确认测试环境地址后改 baseURL 跑

## 页面演进同步（页面不断变化时的标准动作）

1. 先跑 `npm run test:e2e:smoke` 看红了几条
2. 逐个判断：**页面意图变了 → 改用例；只是样式/结构变了 → 只改 Page Object 定位器**
3. 选择器反复失效时，在组件上加稳定 `data-testid`（`模块-语义`），POM 改用 testid
4. 重跑全量确认没有碰散其他用例
5. 回写 contexts 的「演进记录」

## 失败诊断三分法

1. 看失败附件：截图 + trace（`npm run test:e2e:report`）
2. 本地复现：`npx playwright test e2e/specs/xxx.spec.ts -g "用例名" --headed`
3. 分类处理：
   - **应用 bug** → 报给开发，用例保留
   - **环境问题**（端口/数据/mock 未起）→ 修环境，用例不动
   - **用例问题**（选择器失效/时序假设错误）→ 按演进同步流程修用例

## 反模式清单（写完用例逐项自检）

- [ ] 断言只验证"页面不报错"，没验证业务结果
- [ ] 用例间有顺序依赖或共享可变数据
- [ ] 裸 waitForTimeout 且无注释
- [ ] 使用 class/结构定位器
- [ ] 断言了内部状态（store、接口字段名）而非用户可见结果
- [ ] 一条用例塞了 3 条以上互不相关的路径
- [ ] 新页面有交互但没有 @smoke 用例
- [ ] 没读源码凭想象写选择器

## 环境搭建基线（新项目从零接入时用）

1. `npm install -D @playwright/test` + `npx playwright install chromium`
2. `playwright.config.ts` 关键项：

| 配置                     | 建议值                                      | 理由                                   |
| ------------------------ | ------------------------------------------- | -------------------------------------- |
| testDir / outputDir      | `./e2e/specs` / `./test-results`            | 用例与页面对象分离，失败留痕 gitignore |
| timeout / expect.timeout | 30s / 5s                                    | 宁可快速失败                           |
| workers / fullyParallel  | 1 / false                                   | 稳定优先，规模大了再开                 |
| retries                  | 本地 0，CI 1                                | 本地红灯是真问题                       |
| trace / screenshot       | on-first-retry / only-on-failure            | 失败可定位                             |
| video                    | off                                         | 需额外 ffmpeg，trace+截图足够          |
| webServer                | `npm run dev -- --port <port> --strictPort` | 自动起服务，防串端口                   |
| channel                  | `PW_CHANNEL` 环境变量可选                   | 受限环境切 msedge                      |

3. `package.json` 加 scripts：`test:e2e` / `test:e2e:smoke` / `test:e2e:ui` / `test:e2e:report`
4. CI：缓存浏览器目录、归档 `test-results/`、先用冒烟集做门禁

## 常见场景速查

- **弹窗/抽屉**：页面内弹层用 `getByRole('dialog')` 定位，等动画结束后再交互
- **上传下载**：`setInputFiles()`；下载用 `page.waitForEvent('download')` 并校验文件名/内容
- **表格/分页/搜索**：等待行数变化用 `expect(rows).toHaveCount(n)`，搜索后断言结果行文本
- **跨页导航**：每个页面单独 POM + 单独 spec；跨页流程在 spec 里组合多个 POM
