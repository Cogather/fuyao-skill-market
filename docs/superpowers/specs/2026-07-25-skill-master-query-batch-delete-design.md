# Skill 清单查询与批量删除对接设计

日期：2026-07-25  
分支：`personal/zyy2`  
状态：已确认（方案 1；更新/单删暂不做）

## 范围

| 能力 | 接口 | 本次 |
|------|------|------|
| 新增 | `POST /management/add` | 已有；成功后改为只 `reload`，不再写 localStorage |
| 查询 | `POST /management/query` | 做 |
| 批量删除 | `DELETE /management/batch_delete` | 做 |
| 更新 | `PUT /management/update` | **跳过**；UI 隐藏「编辑」 |
| 单删 | `DELETE /management/delete/{skillName}` | **跳过**；UI 隐藏行内「删除」 |

列表数据源全面切 HTTP：不再用 localStorage 作为 Skill 清单数据源。

## 查询

**请求**（空字段不传或传空均可；面板实际传当前筛选项）：

```json
{
  "keyword": "",
  "dimType": "部门级",
  "dimCode": "D001",
  "sortBy": "updatedAt",
  "sortOrder": "desc",
  "pageNum": 1,
  "pageSize": 100
}
```

面板映射：

- `keyword` ← 顶部关键词
- `dimType` ← 层级
- `dimCode` ← 部门级末级部门编码 / 产品级 `offeringId`
- 暂不传：`statusList`、`ownerId`、`developOwnerId`（UI 无对应筛选）

**响应**：`meta.success`；`data` 为数组。行字段含 `skillName`、`skillDescription`、`dimType`、`dimCode`、`dimName`、`ownerName`、`ownerId`、`developOwnerName`、`developOwnerId`、`status`、`planFinishDate`、`createdAt`/`updatedAt`（数组）、`skillMatchId`、`skillMatchLevel`。

展示映射到现有表格列：

- `id` ← `skillName`（勾选/批量删除主键）
- `name` ← `skillName`
- `description` ← `skillDescription`
- `level` ← `dimType`
- `product` ← 产品级用 `dimName`，否则 `''`
- `owner` ← `ownerName + ' ' + ownerId`
- `developOwner` ← `developOwnerName + ' ' + developOwnerId`
- `plannedCompleteDate` ← `planFinishDate`
- `status` ← 接口原样（含「进行中」等）

## 批量删除

- `DELETE /management/batch_delete`，body：`string[]`（skillName 列表）
- 成功：`meta.success === true` 后 `reload`
- 行内删除隐藏；批量删除入口保留

## Mock

- 内存列表：`/management/add` 写入；`/management/query` 过滤；`/management/batch_delete` 按名删除
- 预置少量 seed 便于无新增时也能查到数据
- query 按 `dimType`/`dimCode`/`keyword`（模糊匹配 skillName、skillDescription、ownerName、developOwnerName）过滤

## 非目标

- 不接更新、单删
- 不改造 Skill 规划页对 `listSkillMasterRecords` 的依赖（仍可读旧本地数据；清单页本身已切 API）
- 不抽公共组件
