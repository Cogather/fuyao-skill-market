# 部门 Skill 评审模块 · 后端接口设计文档

> 面向「skill 组织管理员」的部门 Skill 评审与一键发布到组织模块。
> 管理员在自己看管的部门下浏览全量个人级 Skill、填写评审意见、勾选后一键发布到组织，
> 生成发布任务通知组织 owner 确认，确认后即上架组织。

---

## 一、通用约定

### 1.1 响应壳

所有接口统一响应结构：

```jsonc
{
  "code": 0,            // 0 成功，非 0 失败
  "message": "success",
  "meta": {
    "success": true,
    "message": "success",
    "number": 0         // 分页接口为总条数，非分页接口为 0
  },
  "data": { /* 业务数据 */ }
}
```

### 1.2 通用 query 参数

| 参数    | 类型   | 必填 | 说明                                      |
| ------- | ------ | ---- | ----------------------------------------- |
| userId  | string | 是   | 当前登录用户工号，鉴权与数据范围判定均依赖 |

### 1.3 分页参数

| 参数      | 类型   | 必填 | 默认 | 说明                                       |
| --------- | ------ | ---- | ---- | ------------------------------------------ |
| pageNum   | number | 是   | 1    | 页码，从 1 开始                            |
| pageSize  | number | 是   | 10   | 每页条数，可选 10 / 20 / 50                |

### 1.4 枚举值

- **意见/任务处理动作** `ProcessAction`：
  - `close` 发起人关闭（撤回自己的一键发布申请）
  - `reject` 驳回（owner 驳回任务，或发起人驳回自己的申请）
  - `approve` owner 确认发布
- **意见/任务状态** `ProcessStatus`：`processing`(处理中) / `closed`(已关闭) / `rejected`(已驳回) / `approved`(已发布到组织)
- **意见类型** `DeptCommentType`：`review`(评审意见) / `publish`(一键发布申请)
- **排序字段** `SkillSortKey`：`downloads` / `access` / `aiScore` / `expertScore`
- **排序方向** `SortOrder`：`desc` / `asc`

---

## 二、数据模型

### 2.1 DeptSkillItem（部门评审 Skill 列表项）

| 字段          | 类型       | 说明                                    |
| ------------- | ---------- | --------------------------------------- |
| id            | string     | Skill ID                                |
| name          | string     | Skill 名称                              |
| version       | string     | 最新版本号，如 `v1.3.0`                 |
| author        | string     | 作者姓名                                |
| authorId      | string     | 作者工号                                |
| deptPath      | string     | 所属部门完整路径，如 `IT装备部 / 平台开发部 / 应用一部` |
| downloads     | number     | 下载量                                  |
| totalAccess   | number     | 累计调用量                              |
| aiScore       | number\|null | AI 评审总分(0-100)，未评审为 null      |
| expertScore   | number\|null | 专家评审总分(0-100)，未评审为 null    |
| badges        | string[]   | 勋章名称列表，如 `["金牌 Skill","高复用"]` |
| commentCount  | number     | 该 Skill 的评审意见 + 发布申请总数      |
| publishTaskId | string\|null | 关联的发布任务 ID，未发起发布时为 null |

### 2.2 DeptSkillCommentItem（评审意见 / 一键发布申请）

| 字段           | 类型                | 说明                                              |
| -------------- | ------------------- | ------------------------------------------------- |
| id             | string              | 意见 ID                                           |
| type           | DeptCommentType     | `review` 评审意见 / `publish` 一键发布申请        |
| submitter      | string              | 提交人姓名                                        |
| submitterId    | string              | 提交人工号                                        |
| content        | string              | 意见/申请内容                                     |
| status         | ProcessStatus       | 处理中/已关闭/已驳回/已发布到组织                 |
| createdAt      | string              | 提交时间，`yyyy-MM-dd HH:mm`                      |
| isMine         | boolean             | 是否为当前用户提交（前端可自行根据 submitterId 判断） |
| publishTaskId  | string\|null         | 关联的发布任务 ID（仅 publish 类型）              |

### 2.3 ManagedDeptNode（看管部门）

| 字段 | 类型   | 说明                              |
| ---- | ------ | --------------------------------- |
| id   | string | 部门 ID                           |
| path | string | 部门完整路径，`A / B / C`         |
| name | string | 部门短名（路径最后一段）          |

### 2.4 PublishTaskListItem（发布任务列表项）

| 字段          | 类型             | 说明                          |
| ------------- | ---------------- | ----------------------------- |
| id            | string           | 任务 ID                       |
| targetOrgName | string           | 目标组织名称                  |
| creator       | string           | 发起人工号                    |
| skillCount    | number           | 涉及 Skill 数                 |
| status        | ProcessStatus    | 任务状态                      |
| createdAt     | string           | 创建时间 `yyyy-MM-dd HH:mm`   |
| completedAt   | string\|null      | 完成时间，未完成为 null       |

### 2.5 PublishTaskDetail（发布任务详情）

| 字段            | 类型                | 说明                          |
| --------------- | ------------------- | ----------------------------- |
| id              | string              | 任务 ID                       |
| targetOrgName   | string              | 目标组织名称                  |
| creator         | string              | 发起人工号                    |
| status          | ProcessStatus       | 任务状态                      |
| createdAt       | string              | 创建时间                      |
| completedAt     | string\|null         | 完成时间                      |
| approvalComment | string\|null         | 处理意见（关闭/驳回/确认时填写） |
| skills          | PublishTaskSkill[]  | 涉及的 Skill 快照列表         |

### 2.6 PublishTaskSkill（发布任务中的 Skill 快照）

| 字段    | 类型   | 说明       |
| ------- | ------ | ---------- |
| id      | string | Skill ID   |
| name    | string | Skill 名称 |
| version | string | 版本号     |
| author  | string | 作者       |

---

## 三、接口清单

| 序号 | 方法   | 路径                                          | 说明                          |
| ---- | ------ | --------------------------------------------- | ----------------------------- |
| 1    | GET    | /api/dept-review/departments                  | 看管部门列表（部门筛选用）    |
| 2    | GET    | /api/dept-review/skills                       | 部门评审 Skill 列表           |
| 3    | GET    | /api/dept-review/skills/{skillId}/comments    | 某 Skill 的意见列表           |
| 4    | POST   | /api/dept-review/skills/{skillId}/comments    | 提交评审意见                  |
| 5    | POST   | /api/dept-review/publish-tasks                | 创建发布任务（一键发布到组织）|
| 6    | POST   | /api/dept-review/publish-tasks/{taskId}/process | 处理发布任务（关闭/驳回/确认）|
| 7    | GET    | /api/dept-review/publish-tasks                | 发布任务列表                   |
| 8    | GET    | /api/dept-review/publish-tasks/{taskId}       | 发布任务详情                   |

> **复用现有接口，无需新增：**
> - `GET /api/users/current/role` 判断当前用户是否为组织管理员（菜单可见性）
> - `GET /api/organizations` 发布弹窗选择目标组织（需返回 `owner` 字段；若仅可见一个组织，前端默认选中）
> - `GET /api/skills/{id}` 点击 Skill 名称查看详情，沿用现有详情路由
>
> **勋章图标映射**（金牌→🥇、高复用→♻️ 等）为纯前端逻辑，无需后端接口。
> **AI/专家评分明细** 已在现有评审接口中提供，本模块列表仅展示总分。

---

## 四、接口详细定义

### 1. GET /api/dept-review/departments — 看管部门列表

用于部门筛选下拉框。

**Query**

| 参数   | 类型   | 必填 | 说明     |
| ------ | ------ | ---- | -------- |
| userId | string | 是   | 管理员工号 |

**Response.data**

```jsonc
{
  "departments": [
    { "id": "d-it-platform-app1", "path": "IT装备部 / 平台开发部 / 应用一部", "name": "应用一部" },
    { "id": "d-it-ops", "path": "IT装备部 / 运维部", "name": "运维部" }
  ]
}
```

---

### 2. GET /api/dept-review/skills — 部门评审 Skill 列表

返回当前管理员看管部门下的全量个人级 Skill。

**Query**

| 参数       | 类型   | 必填 | 说明                                                         |
| ---------- | ------ | ---- | ------------------------------------------------------------ |
| userId     | string | 是   | 管理员工号                                                   |
| deptId     | string | 否   | 部门 ID，不传或 `all` 表示全部看管部门                       |
| sortBy     | string | 否   | 排序字段：`downloads` / `access` / `aiScore` / `expertScore`，默认 `downloads` |
| sortOrder  | string | 否   | `desc` / `asc`，默认 `desc`                                  |
| pageNum    | number | 是   | 页码                                                         |
| pageSize   | number | 是   | 每页条数                                                     |

**Response.data**

```jsonc
{
  "skills": [
    {
      "id": "sk-1001",
      "name": "PDF 表格抽取 Skill",
      "version": "v1.3.0",
      "author": "王小明",
      "authorId": "wxiaoming",
      "deptPath": "IT装备部 / 平台开发部 / 应用一部",
      "downloads": 1280,
      "totalAccess": 8600,
      "aiScore": 88,
      "expertScore": 92,
      "badges": ["金牌 Skill", "高复用"],
      "commentCount": 2,
      "publishTaskId": null
    }
  ],
  "total": 8
}
```

> `meta.number` 同步返回总条数。

---

### 3. GET /api/dept-review/skills/{skillId}/comments — 某 Skill 的意见列表

返回该 Skill 的全部评审意见与一键发布申请，按时间倒序。

**Path**

| 参数     | 类型   | 说明     |
| -------- | ------ | -------- |
| skillId  | string | Skill ID |

**Query**

| 参数   | 类型   | 必填 | 说明     |
| ------ | ------ | ---- | -------- |
| userId | string | 是   | 当前用户 |

**Response.data**

```jsonc
{
  "comments": [
    {
      "id": "cm-1005-2",
      "type": "publish",
      "submitter": "A10023",
      "submitterId": "A10023",
      "content": "一键发布到组织：扶摇 IT 装备部组织，等待 owner 确认。",
      "status": "processing",
      "createdAt": "2026-07-18 09:35",
      "isMine": true,
      "publishTaskId": "task-2026-007"
    },
    {
      "id": "cm-1005-1",
      "type": "review",
      "submitter": "A10023",
      "submitterId": "A10023",
      "content": "巡检能力强，已发起一键发布到组织。",
      "status": "closed",
      "createdAt": "2026-07-18 09:30",
      "isMine": true,
      "publishTaskId": null
    }
  ]
}
```

---

### 4. POST /api/dept-review/skills/{skillId}/comments — 提交评审意见

当前管理员对某 Skill 提交一条评审意见。提交后在该 Skill 的个人发布详情中标记展示。

**Path**

| 参数     | 类型   | 说明     |
| -------- | ------ | -------- |
| skillId  | string | Skill ID |

**Body**

```jsonc
{
  "userId": "A10023",
  "content": "代码与文档质量较高，建议直接发布到组织。"
}
```

> `type` 固定为 `review`，后端无需接收；初始 `status` 为 `processing`。

**Response.data**

```jsonc
{
  "comment": {
    "id": "cm-20260720-001",
    "type": "review",
    "submitter": "A10023",
    "submitterId": "A10023",
    "content": "代码与文档质量较高，建议直接发布到组织。",
    "status": "processing",
    "createdAt": "2026-07-20 12:00",
    "isMine": true,
    "publishTaskId": null
  }
}
```

---

### 5. POST /api/dept-review/publish-tasks — 创建发布任务（一键发布到组织）

勾选若干 Skill 后一键发起，生成发布任务并通知组织 owner 确认。
组织选择复用现有 `GET /api/organizations`（前端在发布弹窗里选目标组织）。

**Body**

```jsonc
{
  "userId": "A10023",
  "targetOrgId": "org-fuyao-it",
  "skillIds": ["sk-1001", "sk-1003", "sk-1005"]
}
```

**Response.data**

```jsonc
{
  "task": {
    "id": "task-20260720-001",
    "targetOrgName": "扶摇 IT 装备部组织",
    "creator": "A10023",
    "status": "processing",
    "createdAt": "2026-07-20 12:00",
    "completedAt": null,
    "approvalComment": null,
    "skillCount": 3,
    "skills": [
      { "id": "sk-1001", "name": "PDF 表格抽取 Skill", "version": "v1.3.0", "author": "王小明" },
      { "id": "sk-1003", "name": "日志异常聚类分析", "version": "v2.1.0", "author": "赵敏" },
      { "id": "sk-1005", "name": "K8s 巡检 Skill", "version": "v3.0.1", "author": "周婷" }
    ]
  }
}
```

**后端需联动：**
- 为每个选中 Skill 追加一条 `publish` 类型的意见（status=`processing`，关联 taskId）
- 通知目标组织 owner（站内信/消息）
- 返回的任务信息可直接用于任务详情弹窗

---

### 6. POST /api/dept-review/publish-tasks/{taskId}/process — 处理发布任务

统一处理发布任务的关闭/驳回/确认，用 `action` 参数区分。不同 action 的权限与联动如下。

**Path**

| 参数   | 类型   | 说明    |
| ------ | ------ | ------- |
| taskId | string | 任务 ID |

**Body**

```jsonc
{
  "userId": "A10023",
  "action": "close",          // close / reject / approve
  "comment": "已确认发布..."  // approve 可选；reject 必填；close 可选
}
```

**action 权限与联动说明**

| action   | 操作人     | comment 要求 | 任务 status 变更 | 关联 publish 意见 status | 其他联动                  |
| -------- | ---------- | ----------- | ---------------- | ----------------------- | ------------------------- |
| `close`  | 发起人     | 可选        | → `closed`       | → `closed`              | 清空各 Skill 的 publishTaskId |
| `reject` | owner（或发起人） | **必填**    | → `rejected`     | → `rejected`            | 清空各 Skill 的 publishTaskId |
| `approve`| owner      | 可选        | → `approved`     | → `closed`              | 各 Skill 实际上架到目标组织 |

> 后端根据 `userId` 校验该用户是否有权执行对应 action：
> - `close`：仅任务 `creator` 可执行
> - `approve`/`reject`：仅目标组织 owner 可执行
> - 校验失败返回 `meta.success=false`，前端 toast 提示

**Response.data**：返回处理后的任务详情，结构同接口 8。

```jsonc
{
  "task": {
    "id": "task-2026-007",
    "targetOrgName": "扶摇 IT 装备部组织",
    "creator": "A10023",
    "status": "approved",
    "createdAt": "2026-07-18 09:35",
    "completedAt": "2026-07-20 14:00",
    "approvalComment": "已确认发布，纳入组织资产。",
    "skills": [
      { "id": "sk-1005", "name": "K8s 巡检 Skill", "version": "v3.0.1", "author": "周婷" }
    ]
  }
}
```

> 该接口覆盖前端两处交互：
> - 评审意见弹窗里「关闭/驳回」我的一键发布申请 → action=`close`/`reject`
> - 任务详情弹窗里 owner「确认发布到组织/驳回」→ action=`approve`/`reject`

---

### 7. GET /api/dept-review/publish-tasks — 发布任务列表

**Query**

| 参数       | 类型   | 必填 | 说明                                                         |
| ---------- | ------ | ---- | ------------------------------------------------------------ |
| userId     | string | 是   | 当前用户（作为发起人或 owner 查询自己相关的任务）            |
| status     | string | 否   | 状态筛选：`processing` / `closed` / `rejected` / `approved`，不传为全部 |
| sortBy     | string | 否   | 排序字段，目前支持 `createdAt`，默认 `createdAt`             |
| sortOrder  | string | 否   | `desc` / `asc`，默认 `desc`                                  |
| pageNum    | number | 是   | 页码                                                         |
| pageSize   | number | 是   | 每页条数                                                     |

**Response.data**

```jsonc
{
  "tasks": [
    {
      "id": "task-2026-007",
      "targetOrgName": "扶摇 IT 装备部组织",
      "creator": "A10023",
      "skillCount": 1,
      "status": "processing",
      "createdAt": "2026-07-18 09:35",
      "completedAt": null
    }
  ],
  "total": 3
}
```

---

### 8. GET /api/dept-review/publish-tasks/{taskId} — 发布任务详情

返回任务完整信息及 Skill 清单（前端做滚动加载，后端可一次性返回或支持分页）。

**Path**

| 参数   | 类型   | 说明    |
| ------ | ------ | ------- |
| taskId | string | 任务 ID |

**Query**

| 参数   | 类型   | 必填 | 说明     |
| ------ | ------ | ---- | -------- |
| userId | string | 是   | 当前用户 |

**Response.data**

```jsonc
{
  "task": {
    "id": "task-2026-007",
    "targetOrgName": "扶摇 IT 装备部组织",
    "creator": "A10023",
    "status": "processing",
    "createdAt": "2026-07-18 09:35",
    "completedAt": null,
    "approvalComment": null,
    "skills": [
      { "id": "sk-1005", "name": "K8s 巡检 Skill", "version": "v3.0.1", "author": "周婷" }
    ]
  }
}
```

> 若 Skill 数量较多，后端可改为分页返回：增加 `skillPageNum` / `skillPageSize` query，`skills` 返回当前页，`meta.number` 返回 Skill 总数。

---

## 五、前端实现对照

| 前端交互                             | 对应接口 |
| ------------------------------------ | -------- |
| 部门筛选下拉                         | 接口 1   |
| 待发布清单表格（筛选/排序/分页）     | 接口 2   |
| 评审意见数量徽标 + 点击弹窗查看全部  | 接口 3   |
| 弹窗内「提交意见」                   | 接口 4   |
| 一键发布弹窗选组织                   | 复用 `GET /api/organizations` |
| 一键发布到组织（创建任务）           | 接口 5   |
| 弹窗内「关闭/驳回」我的一键发布申请  | 接口 6（action=close/reject） |
| owner「确认发布到组织/驳回」        | 接口 6（action=approve/reject） |
| 发布任务清单（状态筛选/时间排序/分页）| 接口 7   |
| 任务详情弹窗（含 Skill 清单滚动加载）| 接口 8   |
