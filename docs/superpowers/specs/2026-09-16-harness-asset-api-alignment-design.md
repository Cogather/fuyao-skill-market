# Harness 资产清单接口与交互对齐设计

## 目标与范围

资产清单以本次提供的后端契约为准，修正列表、详情和版本内容接口，并让类型、状态、搜索条件都由服务端查询。保留现有 Extension 发布流程；Skill、Agent、Command 仅预留后端返回的实体 ID，不新增发布、发布历史或重试界面。

## 清单查询

清单统一调用 `POST /api/harness/components/query`。每次查询都传 `userId`、当前资产 `type`、部门或产品维度、分页和排序；选中产品时只传 `productCode`，否则只传 `deptCode`。搜索词非空时传 `keyword`。状态 Tab 使用后端状态原值 `开发中`、`待发布`、`已发布`，“全部”不传 `status`。资产类型、状态、搜索条件或组织范围变化时重置分页并重新请求；前端不再二次执行状态或关键字过滤。

列表响应继续使用 `name`、`description`、`latestVersion`、`status`、维度、权限和更新时间字段，并预留可选的 `skillId`、`agentId`、`commandId`。这些实体 ID 只保存到资产模型，等后端返回后供未来独立发布使用；当前页面不展示、不提交。

Extension 固定展示“已发布”状态入口，类型切换后同样重新查询，并向接口传 `status: "已发布"`。页面总数使用服务端当前条件下的 `total`。

## 详情与版本内容

资产详情统一调用 `GET /api/harness/components/detail`。Extension 的 `name` 使用清单返回的 Extension 名称（即 `extension_name`）；详情中的版本列表保持后端最新在前顺序。

Skill、Command、Agent 的版本内容继续使用 `GET /api/harness/packages/tree` 和 `GET /api/harness/packages/file`，参数中的 `componentType` 使用小写。文件响应若声明 base64 编码，前端只进行可安全展示的文本解码，无法作为文本显示时保留明确提示。

Extension 版本内容改为调用 `GET /api/harness/extensions/version-history`，传当前资产自身的 `dimType`、`dimCode`、Extension 名称和选中版本。响应中的 `skills`、`commands`、`agents` 映射为三个文件夹；展开具体组件时再按其名称和冻结版本调用 packages tree/file，保证展示的是该 Extension 发布时冻结的内容，而不是当前绑定关系。

## 错误与并发处理

筛选快速切换沿用页面请求代次控制，旧响应不能覆盖新条件。接口失败保留现有错误提示策略；分页追加失败不清空已加载数据。缺少维度、名称或版本等必填参数时不发送无效请求，并在详情区域显示可理解的错误。

## 验证

补充或调整服务适配层单测，覆盖接口路径、状态参数、可选实体 ID、Extension 冻结清单映射，以及类型和状态切换触发的新查询。只运行相关单测、相关 lint/type check 和一次构建，不扩大到无关业务回归。
