# Task 1 Report: 类型 + skillBaseService 方法 + Mock

**Status:** DONE  
**Commit:** `4e99467` — feat: add Skill master management create API and mock  
**Date:** 2026-07-25

---

## Summary

Implemented the backend-facing layer for Skill 清单新增 `POST /management/add`:

1. **`CreateSkillMasterManagementBody`** type in `apiTypes.ts`
2. **`skillBaseService.createSkillMasterManagement(body)`** method in `skillBaseService.ts`
3. **Mock handler** for `POST /management/add` in `skillBaseServiceMock.ts` → `handleSkillRequest`

No Vue panel changes were made (out of scope for Task 1).

---

## Changes

### 1. `src/services/skillMarket/apiTypes.ts`

Added at file end:

```ts
/** Skill 清单新增（POST /management/add） */
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

**Note:** Body intentionally excludes `status` — callers must not send it.

### 2. `src/services/skillMarket/skillBaseService.ts`

- Imported `CreateSkillMasterManagementBody` from `./apiTypes`
- Added `createSkillMasterManagement` immediately after `createSkillPlanning`:

```ts
createSkillMasterManagement: (body: CreateSkillMasterManagementBody): any => {
  return httpRequest.skill<any>({
    url: '/management/add',
    method: 'post',
    data: body,
  });
},
```

### 3. `src/services/skillMarket/skillBaseServiceMock.ts`

Added `POST /management/add` branch in `handleSkillRequest` (after `/publish-to-market`):

- Validates 10 required string fields (trimmed non-empty)
- Rejects if `status` key is present (`hasOwnProperty` check)
- Returns `ok({ id, ...fields })` with `id = skill-mgmt-${Date.now()}`
- Does **not** persist to localStorage (stateless mock per brief)

---

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass (exit 0, 245 modules) |
| ESLint / IDE lints on changed files | ✅ No errors |
| Vue panel untouched | ✅ Confirmed |

**Manual smoke (optional, not run in CI):** With mock enabled, call:

```js
skillBaseService.createSkillMasterManagement({
  skillName: 'Test',
  skillDescription: 'Desc',
  dimType: 'DEPT',
  dimCode: 'D001',
  dimName: 'Dept A',
  ownerName: '张三',
  ownerId: 'w001',
  developOwnerName: '李四',
  developOwnerId: 'w002',
  planFinishDate: '2026-12-31',
})
```

Expected: `meta.success === true`, `data.id` starts with `skill-mgmt-`.

Missing field → `meta.success === false`, message lists missing keys.  
Body with `status` → `meta.success === false`, message `status 不应传入`.

---

## Self-Review

### Correctness

- Type fields match design spec and brief verbatim (10 fields, no `status`).
- Service method uses `httpRequest.skill` with correct URL/method, consistent with adjacent planning APIs.
- Mock uses existing `ok` / `fail` helpers and follows the same envelope shape as other skill mock endpoints.

### Scope

- Only the three specified files were modified.
- No Vue components, no panel wiring, no localStorage side effects.

### Conventions

- Trailing commas preserved in object/array literals per project rules.
- All `if` bodies use braces.

### Concerns / Follow-ups

- **None blocking.** Return type is `any` (consistent with neighboring service methods like `createSkillPlanning`); a future task could introduce a response DTO type if the design spec defines one.
- Manual DevTools smoke was not executed in this session; build verification was used instead per brief allowance.

---

## Files Changed

```
src/services/skillMarket/apiTypes.ts          (+14)
src/services/skillMarket/skillBaseService.ts  (+9, -1 import line expanded)
src/services/skillMarket/skillBaseServiceMock.ts (+37)
```

**Total:** 3 files, +60 / -1 lines
