# Extension 双目标发布设计

## 意图

在现有 Harness 工作流的 Extension 发布页中增加 CodeAgent（标准）与 TestAgent 两种发布目标，让用户在发布前看到继承、附加文件和最终目录结构，并把选择随发布动作一并提交。

## 已确认约束

- 现有“Extension 发布信息”区域的字段结构、样式和能力资产展开交互保持不变，只复用其表单数据与能力资产。
- 同一发布页内切换 CodeAgent 与 TestAgent；默认 CodeAgent。
- 切换目标时保留现有表单值和已上传附加文件，按目标重置默认继承；TestAgent 不支持发布后转换为 CoreALM-Next 小队。
- 后端尚未提供的继承、附加文件组装和发布目标接口先集中使用 mock，现有 Extension 查询与发布接口保持原有调用方式。

## 交互与打包规则

- CodeAgent：能力资产位于根目录的 `skills/`、`commands/`、`agents/`，根目录包含 `plugin.json` 与 `codeagent-extension.json`。
- TestAgent：能力资产位于 `.testagent/` 下，两个 JSON 文件仍位于根目录。
- CodeAgent 自动继承上次发布的旁路文件，可清除；TestAgent 默认继承上次发布，也可改选上次发布或部门通用 Extension。
- ZIP 附加包中的 `skills/`、`commands/`、`agents/`、`plugin.json`、`codeagent-extension.json` 被过滤，其余文件参与合并；同路径上传文件覆盖继承文件。
- 最终目录树标识系统、继承、上传三类来源，并随目标、继承和上传状态实时更新。
- CodeAgent 可选择“发布后转换为 CoreALM-Next 小队”；TestAgent 隐藏并清空该选项。

## 方案

1. **直接扩写现有 4000 行发布页**：接线最少，但会把新状态、ZIP 解析和目录算法继续堆入已有组件，回归风险高。
2. **独立发布组装组件 + 纯服务模块（采用）**：现有发布卡片原样保留，新组件负责模式、继承、上传和目录预览，纯模块负责可测试的合并规则与 mock 接口。
3. **新建独立发布路由**：隔离最彻底，但会复制现有表单和能力树，违背复用现有区域的要求。

## 非目标

- 不重做现有 Extension 发布信息区域的视觉样式。
- 不替换现有真实的 Extension 详情、组织、发布和历史接口。
- 不在本次实现真实的 CoreALM-Next 转换接口；只把选择写入 mock 组装提交结果。

