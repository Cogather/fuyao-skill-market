# 页面上下文：技能市场（/skill-square）

> 本文件是「页面专属知识」的存放地，供 AI 与开发者复用。
> 页面演进后必须同步更新本文件；skill 本体（skills/frontend-page-e2e）不保存页面知识。

## 基本信息

- 路由：`/skill-market/skill-square`（注意 `VITE_BASE=/skill-market` 前缀，goto 统一拼接 `APP_BASE_PATH`）
- 组件：`src/views/SkillMarketPage.vue` → `src/views/skill/UserMarketShell.vue`
- 数据模式：dev 走 mock（`.env.development` 中 `VITE_SKILL_MARKET_TRANSPORT=mock`），无需后端
- 登录：本地 mock 无需登录；对接真实环境时按 storageState 方案接入

## 稳定锚点（选择器素材）

- 顶部 tab（button）：热榜 / 全部技能 / 我的发布 / 运营管理 / 组织管理 / 评审中心
- **热榜 tab 有 `data-testid="market-tab-hot"`**（POM 用 testid 定位，与文案解耦）
- 发布按钮：「发布 Skill」
- 热榜搜索 placeholder：`搜索热门 Skill / 创建者 / 描述`
- 全部技能：h1「全部技能」；搜索 placeholder：`搜索名称 / 描述 / 创建者工号`
- 我的发布：h1「我的发布」
- 注意：`我的发布` 同时出现在 tab 按钮和 h1 标题，定位需 `exact: true` + 角色区分

## 坑与约定

- 直接访问 `/skill-square` 不带 base 前缀会落到 Vite 提示页，必须带 `/skill-market/` 前缀
- 页面顶部 token 检查定时器（5 分钟）在本地 mock 模式下无副作用
- 「全部技能」与「我的发布」tab 下的搜索框 placeholder 不同，POM 中分开定义
- **tab 文案会随产品演进变动**：tab 类定位器优先用 data-testid，不要依赖文案

## 演进记录

- 首版：接入 E2E 冒烟 3 条（首页加载 / 全部技能搜索 / 我的发布可打开），全部绿色
- 演进演练：热榜 tab 文案变动（热榜→热榜广场）导致 3 条用例失效，按三分法判定"意图未变"→ 不改用例；为热榜 tab 增加 `data-testid="market-tab-hot"`，POM 改用 testid 与文案解耦，全量回归通过
