# Skill 清单新增对接 `/management/add` 设计

日期：2026-07-25  
状态：已确认（方案一）

## 背景

Skill 规划 → Skill 清单的「添加 Skill」当前写入 localStorage（`createSkillMasterRecord`），人员选择使用 `datalist`，且开发责任人 / 计划完成时间非必填。需要改为按约定 body 调用 `POST /management/add`，本地环境走 mock，人员搜索对齐配置管理「部门权限配置」的交互。

## 目标

1. 新增提交 body（**不含 `status`**）：

```json
{
  "skillName": "Skill名称",
  "skillDescription": "描述",
  "dimType": "部门级",
  "dimCode": "D001",
  "dimName": "部门A",
  "ownerName": "张三",
  "ownerId": "u001",
  "developOwnerName": "李四",
  "developOwnerId": "u002",
  "planFinishDate": "2026-08-31"
}
```

2. 弹窗内上述业务字段全部必填（维度来自顶部筛选，不在弹窗内再选）。
3. 责任 Owner、开发责任人：输入作搜索，接口查人后由用户点选；禁止自由文本直接当姓名/工号提交。
4. `skillBaseService` 增加真实方法；mock 拦截同路径；当前环境使用 mock。

## 非目标

- 本次不改造「编辑 Skill」的后端接口。
- 本次不抽公共 `PersonSearchSelect` 组件（可后续再抽）。
- 本次不新增列表查询 HTTP；列表仍刷新现有 master 数据源。
- 不传 `status`（本地展示用默认值，见下文）。

## 架构与数据流

```
SkillMasterManagementPanelV2.submitEditor
  → 校验 scope + 表单 + 已选人员
  → 组装 CreateSkillMasterManagementBody
  → skillBaseService.createSkillMasterManagement(body)
       → httpRequest.skill POST /management/add
       → mock: handleSkillRequest 拦截
  → 校验 response.meta.success === true
  → 调用方将 body 映射后写入本地 master 列表（便于现有 reload；mock/http 均如此，直到列表也切 HTTP）
  → 关弹窗 + toast + reload
```

## 接口层

### 类型

```ts
export type CreateSkillMasterManagementBody = {
  skillName: string;
  skillDescription: string;
  dimType: string;
  dimCode: string;
  dimName: string;
  ownerName: string;
  ownerId: string;
  developOwnerName: string;
  developOwnerId: string;
  planFinishDate: string;
};
```

### `skillBaseService`

新增方法（命名以实现时与现有 `createSkill*` 风格一致为准，建议 `createSkillMasterManagement`）：

- `httpRequest.skill`
- `url: '/management/add'`
- `method: 'post'`
- `data: body`

调用方：若 `meta.success !== true`，抛错并展示 `meta.message` 或 `message`。

### Mock（`skillBaseServiceMock` → `handleSkillRequest`）

- 拦截：`POST /management/add`
- 校验 body 必填字段；缺失则 `fail(message)`（`meta.success: false`）
- 成功：`ok({ id, ...body })`；mock 侧可保留内存副本，**不**直接写 localStorage
- 清单可见性：由调用方在 `meta.success === true` 后调用 `createSkillMasterRecord` 做字段映射写入

## 维度字段映射

来源：面板顶部 `masterScopeForm` + 部门路径，**不在弹窗内选择**。

| 条件   | dimType                               | dimCode                          | dimName         |
| ------ | ------------------------------------- | -------------------------------- | --------------- |
| 部门级 | `masterScopeForm.level`（「部门级」） | 末级部门 `deptCode`（或等价 id） | 末级部门 `name` |
| 产品级 | 「产品级」                            | `offeringId`                     | `offeringName`  |

顶部层级/部门/产品未就绪时：禁止新增或提交前拦截并提示（与现有 scope 门禁一致）。

## 弹窗字段与校验

| UI 字段      | 必填                                | 提交字段                              |
| ------------ | ----------------------------------- | ------------------------------------- |
| Skill 名称   | 是（产品级仍要求 `{产品名}-` 前缀） | `skillName`                           |
| Skill 说明   | 是                                  | `skillDescription`                    |
| 责任 Owner   | 是（必须点选搜索结果）              | `ownerName` + `ownerId`               |
| 开发责任人   | 是（必须点选搜索结果）              | `developOwnerName` + `developOwnerId` |
| 计划完成时间 | 是                                  | `planFinishDate`（`YYYY-MM-DD`）      |

提交前顺序：

1. 顶部 scope 完整
2. 名称 / 说明合法
3. Owner、开发责任人已选中（有 id + name）
4. 计划完成时间非空

## 人员搜索 UI

对齐 `DepartmentPlanningPermissionPanel`：

- 输入框 + 下拉面板（去掉当前 `datalist`）
- debounce 后调用 `querySkillPlanningUsers`
- 点击选项锁定选中人，展示「姓名 工号」
- 改关键字后需重新点选；未选中不得提交

Owner / 开发责任人两套独立搜索状态（keyword、options、selected、loading、message）。

## 成功 / 失败

- 成功：`meta.success === true` → 关弹窗、toast、`reload()`
- 失败：弹窗内 `editor.error` 展示错误信息，不关弹窗

## 本地列表映射（调用方在接口 success 后同步）

| API / body                        | 本地 `SkillMasterRecord`                                     |
| --------------------------------- | ------------------------------------------------------------ |
| skillName                         | name                                                         |
| skillDescription                  | description                                                  |
| dimType                           | level                                                        |
| dimName（产品级）                 | product（部门级可空字符串，与现逻辑一致）                    |
| ownerName + ownerId               | owner（展示用「姓名 工号」或现有 `personDisplayLabel` 约定） |
| developOwnerName + developOwnerId | developOwner                                                 |
| planFinishDate                    | plannedCompleteDate                                          |
| （不传）                          | status 默认 `'未开始'`（仅展示）                             |

## 测试要点

- Mock 成功：body 字段齐全，列表出现新记录，status 展示为未开始且未进请求 body
- Mock 失败：缺字段返回 `meta.success: false`，弹窗报错
- 人员：只输入不点选无法保存；点选后 id/name 正确进 body
- 部门级 / 产品级各自 dimCode、dimName 正确
- 开发责任人、计划完成时间为空时拦截

## 影响文件（预期）

- `src/services/skillMarket/skillBaseService.ts`
- `src/services/skillMarket/skillBaseServiceMock.ts`
- `src/services/skillMarket/apiTypes.ts`（或等价类型位置）
- `src/components/skill/SkillMasterManagementPanelV2.vue`
- 必要时薄封装一层 service（若需把 success 校验从组件挪出）
