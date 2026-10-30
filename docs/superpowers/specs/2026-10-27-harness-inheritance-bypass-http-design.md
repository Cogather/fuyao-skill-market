# Harness 场景继承、旁路与发布 HTTP 对齐设计

## 目标与边界

本次以 2026-10-27 提供的 9 个新增接口和 2 个变更接口为唯一 HTTP 契约，补齐三条能力链：场景流复制、产品级场景设计、Extension 旁路与发布。Mock 模式继续保留现有本地数据和交互，不作为 HTTP 失败时的静默降级。

当前应用继续采用父应用通过 `Skill_Square_Init` 注入的 `userId`、用户名和部门树；所有新增 HTTP 请求从当前 workspace/store 取用户上下文，不恢复旧的登录校验、Profile Store 或 `/users/validate`。

## 场景流继承

继承面板在 HTTP 模式调用 `GET /scenes/search`，传 `userId`、trim 后的 `keyword` 和递增的 `limit`。接口没有页码或游标，因此懒加载使用 20、40、60、80、100 的累计上限：每次响应按源维度、场景和场景编码生成稳定键并去重，只追加新条目；返回条数小于本次 limit 或 limit 已到 100 时结束加载。Mock 模式仍使用本地分页。

搜索项展示工作流名、一级/二级场景、来源维度名称、维度类型、场景编码和活动数。当前场景按 `sourceDimType + sourceDimCode + sceneExtensionCode` 排除，避免把自身作为来源。

确认时调用 `POST /scene/copy?userId=...`，Body 使用选中项的源维度和场景名，以及当前产品/部门的目标维度。服务端返回的新 `scene_extension_code` 是最终身份。成功后重新查询当前目标维度的场景树，按返回编码选中新建场景并加载详情，不在前端复制或合并活动、Command、资产池，也不调用旧的 `/workflow/detail` 保存链。

交互文案采用服务端语义：继承会在当前维度创建新场景；目标存在同名场景时服务端拒绝，不覆盖原场景。接口错误保留弹窗和选择，便于用户修改来源或范围后重试。

## 产品级选择与权限

产品级是跨部门可选维度：场景页在产品级展示父应用注入的完整部门树，允许加载产品、选择产品并执行产品级写操作，最终权限由后端按产品级规则校验。部门级继续只展示 `allowedDepartmentPaths`，所有部门级写操作继续执行前端管理权限校验。

`canManageDepartment` 改为 scope-aware：Mock 恒为可管理；HTTP 产品级为 true；HTTP 部门级才匹配授权路径。部门树过滤同样按当前 `scopeLevel` 决定，切换到部门级时若当前部门不在授权范围，自动选择第一个授权部门；切回产品级恢复完整树，不伪造部门授权。

## Extension 身份与详情

旁路接口中的 `extensionName` 是场景级身份，即 `scene_extension_code`。`ExtensionScene` 增加 `sceneExtensionCode`，优先从场景绑定/详情响应的 `sceneExtensionCode` 读取；旁路操作缺少该编码时禁用并提示先保存场景编码。发布时填写的 Extension 名称仍用于发布包名称，两者不混用。

`POST /extensions/detail` 使用 Query 参数携带 `userId`，JSON Body 携带维度信息和可用的 `extensionName`（场景编码）或一、二级场景名。详情映射新增：

- `layoutMode`：仅接受 `standard` 或 `testagent`，否则回退 `standard`；
- `hasBypass`：显式布尔值；
- `bypassEntries`：标准化为 `{ path, size }[]`；
- `sceneExtensionCode`：作为旁路目标身份。

这里沿用存量详情查询所需的维度和场景身份，只把 Body 移到 Query；若联调后端要求更窄的 Query，可在服务适配层收敛，不改变页面接口。

## 旁路管理与完整目录树

Extension 发布页在当前场景内容区增加“打包与旁路”卡片，包含：

1. 布局模式：`standard` / `testagent`。用户确认切换后调用 `POST /extensions/layout`，成功响应作为页面唯一状态；失败回滚选择。
2. 旁路文件：选择一个 `.zip`，前端先校验扩展名和 50MB 上限，再以 multipart 调用 `POST /extensions/bypass`。接受项普通展示，忽略项使用警示样式显示 `reason`。
3. 移除旁路：有旁路时调用 `POST /extensions/bypass/clear`，二次确认后清空文件清单但保留当前布局。
4. 下载：调用 `GET /extensions/bypass/download` 获取预签名 URL，再由浏览器打开；不缓存过期 URL。
5. 继承旁路：打开独立居中弹窗，`GET /extensions/search` 按 Extension 名、二级场景名或工作流名搜索。沿用累计 limit 懒加载；条目展示来源、版本、布局和旁路文件数。确认后调用 `POST /extensions/bypass/inherit`，目标为当前场景编码。结果中的接受项和被剥离项立即显示，布局跟随服务端响应，并刷新完整目录树。
6. 完整目录树：根据当前 `sceneExtensionCode`、布局和页面现有组件清单调用 `POST /extensions/structure/tree?userId=...`，Content-Type 为 `application/json`。Body 为 `{ extensionName, layout, components }`，组件清单以对象数组传递；响应按 `SYSTEM`、`COMPONENT`、`FILE` 着色，布局、组件或旁路变化后刷新。

异步操作分别维护 loading/error 状态；请求期间禁用会产生冲突的按钮，旧响应不能覆盖已经切换的场景。

## 发布旁路继承

打开发布弹窗时使用已加载的详情元数据。`hasBypass=true` 时显示“发布时继承当前旁路文件”复选框，默认勾选，并列出 `bypassEntries` 的路径和格式化大小；取消勾选只影响本次发布，不立即清除编辑态旁路。

`POST /extensions/save` 保留现有用户、维度、组织、组件和发布通道参数，Body 增加 `inheritBypass`：有旁路时发送用户当前选择；无旁路时发送 `true` 以保持存量零感知。发布请求不传 layout。发布成功后沿用现有刷新和历史逻辑。

## 错误、安全与兼容

- 所有请求在发送前校验非空 `userId` 和场景编码，不从 URL、localStorage 或旧 Profile 读取身份。
- 搜索关键字交给 Axios Query 编码，前端不拼接 URL，`%`、`_` 保持普通字符。
- 上传仅接受单个 zip，限制 50MB；服务端红线校验错误原样展示，不尝试在浏览器解压或修改文件。
- 下载只接受后端返回的 `http:`/`https:` URL；空值或非 Web URL 视为错误。
- 不对新增接口自动回退旧接口，避免真实环境配置错误被 Mock 或旧路径掩盖。

## 验证范围

服务测试覆盖 11 个接口的 URL、方法、Query、Body/FormData、字段映射和错误分支；workspace 测试覆盖产品级放开与部门级限制；Playwright HTTP 用例覆盖场景搜索/复制、旁路上传与继承、完整树刷新和发布 `inheritBypass=false`。最后运行相关单测、相关 E2E、ESLint、`vue-tsc --noEmit` 和生产构建，并记录任何与本次无关的既存失败。
