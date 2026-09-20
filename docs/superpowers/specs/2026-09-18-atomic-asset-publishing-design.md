# Agent / Skill / Command 独立发布设计

## 目标

为资产清单中的 Agent、Skill、Command 接入独立发布、发布历史和失败重试能力。Extension 保持现有发布页面及 `/extensions/history`、`/extensions/{id}/retry` 链路不变。

## 交互

- 仅当资产列表记录明确返回 `canPublish: true` 时，在卡片菜单显示“发布”。
- 发布页显示资产名称、原始最新版本、归属范围和目标组织。目标组织通过 `/extensions/orgs` 查询，参数使用资产记录自身的 `dimType`、`dimCode`。
- 发布请求固定提交列表返回的原始 `latestVersion`，不提供旧版本选择，也不提交发布说明。
- `accepted` 非空表示异步任务已受理，页面切换到本批次发布记录；`rejected` 非空逐项展示后端 `reason`，不把受理提示表述为发布成功。
- Agent、Skill、Command 详情增加“发布记录”页签，按资产类型和名称查询。失败且来源为“独立发布”的记录显示“重试”按钮。
- 历史列表每页 20 条，支持刷新和加载更多；发布后用 `batchId` 查看本次完整结果。

## 接口边界

- `GET /extensions/orgs`：Agent、Skill、Command 与 Extension 共用的目标组织查询。
- `POST /assets/publish`：仅 Agent、Skill、Command 独立发布。
- `POST /assets/publish/history`：仅 Agent、Skill、Command 页面使用。
- `POST /assets/publish/{taskId}/retry`：仅独立发布失败记录重试。
- Extension 的发布、历史、重试调用路径和渲染组件均不改变。

## 数据约束

- 前端类型值 `Agent | Skill | Command` 提交为 `AGENT | SKILL | COMMAND`。
- 发布项使用资产 `name` 和未经去除 `v` 前缀的 `latestVersion`。
- 响应允许 `accepted` 与 `rejected` 同时存在；两者分别渲染。
- 历史记录保留后端 `publishStatus`、`source`、目标组织、操作人和时间字段；仅 `publishStatus === '发布失败' && source === '独立发布'` 可重试。

## 错误处理

- 缺少用户工号、资产维度、最新版本或目标组织时禁止提交并给出明确提示。
- 接口 `meta.success !== true`、响应结构错误和网络错误均进入可重试错误状态。
- 组织加载失败可重新加载；历史加载失败可刷新；重试失败保留原记录。

## 验收

- 三类资产均严格按照 `canPublish === true` 显示入口。
- 组织请求使用当前资产维度，发布请求携带正确用户、组织、类型、名称和原始版本。
- 受理后按 `batchId` 查询历史；拒绝原因可见。
- 详情历史页可加载、分页，并只对符合条件的记录开放重试。
- Extension 相关 E2E/服务测试继续验证 `/extensions/history`，不出现 `/assets/publish/history` 替换。
