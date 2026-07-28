# Task 3 Report: 必填校验 + 组装 body + 调接口并本地同步

**Status:** DONE  
**Commit:** `bd2aa71` — feat: submit Skill master create via /management/add  
**Date:** 2026-07-25

---

## Summary

Wired Skill 清单「添加 Skill」create submit to `POST /management/add` via `skillBaseService.createSkillMasterManagement`. Added `resolveDimFields()` for dimType/dimCode/dimName, enforced create-time required fields (说明 / Owner / 开发责任人 / 计划完成时间), assembled body **without** `status`, validated `meta.success === true`, then mapped into local `createSkillMasterRecord` with status `'未开始'`. Edit mode still uses local `updateSkillMasterRecord` only.

---

## Changes

### `src/components/skill/SkillMasterManagementPanelV2.vue`

#### 1. Imports

- `CreateSkillMasterManagementBody` from `../../services/skillMarket/apiTypes`
- `skillBaseService` from `../../services/skillMarket/skillBaseService`

#### 2. `resolveDimFields()`

- Guards with `ensureMasterScopeSelection(true)`
- 产品级: `dimCode` = offeringId（selected / form），`dimName` = offeringName；缺编码时报错
- 部门级: `dimCode` = 末级 `deptCode`/`id`，`dimName` = planningDeptName；缺编码时报错

#### 3. `submitEditor` create branch

Validation order:

1. `resolveDimFields()`
2. `ensureProductSkillNamePrefix()` + `editor.description` 非空
3. `ownerPicker.selected` / `developOwnerPicker.selected` 非空
4. `editor.plannedCompleteDate` 非空

Then:

- Assemble `CreateSkillMasterManagementBody`（无 `status`）
- `await skillBaseService.createSkillMasterManagement(body)`
- Fail if `meta.success !== true` → `editor.error`，不关弹窗
- Success → `createSkillMasterRecord({...})` 映射 → `closeEditor` + `reload` + toast

#### 4. Edit branch

Unchanged local path: prefix/owner/developOwner checks + `updateSkillMasterRecord`（不调 `/management/add`）。

#### 5. Template

计划完成时间 label → `计划完成时间 *`

---

## Spec Coverage

| Spec 要求                                               | 状态 |
| ------------------------------------------------------- | ---- |
| Body 字段齐全且不含 status                              | ✅   |
| dimType/dimCode/dimName 映射                            | ✅   |
| 弹窗必填（名称前缀/说明/Owner/开发责任人/计划完成时间） | ✅   |
| success 校验 + 本地同步列表                             | ✅   |
| 编辑不改后端接口                                        | ✅   |
| 不抽公共组件                                            | ✅   |

---

## Verification

| Check           | Result                                |
| --------------- | ------------------------------------- |
| `npm run build` | ✅ Pass (exit 0, 245 modules, ~15.6s) |
| Unit tests      | N/A（仓库无单测框架）                 |

### Manual E2E checklist（未在本环境实点 UI）

1. 部门级 + 归属部门 → 新增填全 + 点选两人 → 保存 → mock `POST /management/add` body 无 `status`，列表出现「未开始」
2. 缺开发责任人或计划完成时间 → 拦截，不关弹窗
3. 只输入 Owner 不点选 → 拦截
4. 产品级 + 选产品 → `dimCode`=`offeringId`，`dimName`=`offeringName`

---

## Self-Review

### Matches brief

- `resolveDimFields` 与 plan 一致
- create body 字段与 mapping 与 plan 一致
- 编辑仍本地更新
- trailing commas；新写 `if` 均带 `{}`

### Residual concerns

1. **部门级空名称**：create 侧未单独校验 `skillName` 非空（产品级靠前缀校验）；空名称会落到 mock「缺少必填字段」再回显，体验略晚一拍。
2. **编辑未强制计划完成时间 / 新 picker**：按 brief「以实现时能跑通为准」保留旧逻辑；与新增必填策略不一致，属预期非目标。
3. **E2E 未实跑**：仅 build 通过；Network/mock 与拦截路径需人工点验。

### No issues found for

- body 含 `status`
- create 成功未写本地列表
- 错误时仍关弹窗
- 误改编辑 HTTP 接口

---

## Commit

```
bd2aa71 feat: submit Skill master create via /management/add
```
