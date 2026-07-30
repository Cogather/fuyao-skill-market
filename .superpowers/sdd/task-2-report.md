# Task 2 Report: 面板人员搜索改为配置管理同款点选

**Status:** DONE  
**Commit:** `4575d77` — feat: use search-select for Skill master owner fields  
**Date:** 2026-07-25

---

## Summary

Replaced Owner / 开发责任人 `<datalist>` free-text selection in `SkillMasterManagementPanelV2.vue` with search-and-click pickers aligned to `DepartmentPlanningPermissionPanel` (debounce 250ms, `requestSeq` race guard, dropdown panel).

Create path requires `ownerPicker.selected` / `developOwnerPicker.selected` (no free-text submit). Edit keeps local update; historical labels are backfilled into `keyword`, and parsed into `selected` when label + department are available.

`createSkillMasterManagement` / create API body wiring was **not** touched (Task 3).

---

## Changes

### `src/components/skill/SkillMasterManagementPanelV2.vue`

#### 1. Person picker state

Added:

```ts
type PersonPickerState = {
  keyword: string;
  open: boolean;
  loading: boolean;
  options: SkillPlanningUserOption[];
  message: string;
  selected: SkillPlanningUserOption | null;
};

const ownerPicker = reactive(createPersonPickerState());
const developOwnerPicker = reactive(createPersonPickerState());
```

Removed `ownerOptions` / `developOwnerOptions` datalist refs and related resolve-from-datalist helpers.

#### 2. Search / select

- `searchOwnerUsers` / `searchDevelopOwnerUsers` → `querySkillPlanningUsers`
- Debounce 250ms on input; `ownerSearchSequence` / `developOwnerSearchSequence` for race safety
- Click: set `selected`, `keyword = option.label`, sync `editor.owner` / `editor.department` (or develop-* fields), close panel
- Input clears `selected` when keyword ≠ selected label
- Focus opens panel; empty keyword shows「请输入人员信息」
- Esc closes panel

#### 3. Template

- Removed `<datalist>` for both fields
- Owner / 开发责任人 use `.person-search` dropdown (label: `责任 Owner *`, `开发责任人 *`)
- Scoped CSS copied/adapted from config panel; `.person-search` width `100%` for form grid

#### 4. Create / edit / submit

| Mode | Behavior |
|------|----------|
| Create | Reset pickers; submit requires both `selected` non-null |
| Edit | Backfill `keyword`; hydrate `selected` from label+dept when possible; local `updateSkillMasterRecord` unchanged |
| Close | Reset both pickers + clear search timers |

Submit still uses local create/update services only — no `/management/add` body.

---

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass (exit 0, 245 modules, ~16.5s) |
| IDE lints on changed file | ✅ No errors |
| Create API / Task 1 types unused here | ✅ Confirmed (no `createSkillMasterManagement` import) |

**Manual smoke (UI, not run in headless CI):** Open「添加 Skill」→ type name/工号 → mock users in dropdown → click → input shows「姓名 工号」→ edit keyword clears selection and requires re-pick.

---

## Self-review

### Checklist vs brief

- [x] `PersonPickerState` + `ownerPicker` / `developOwnerPicker`
- [x] Debounce 250ms + requestSeq anti-race
- [x] Datalist removed; dropdown panel UI
- [x] Create requires selected; edit backfill + local update
- [x] No shared PersonSearch component extracted
- [x] Trailing commas / braced if-bodies followed
- [x] Commit message per brief
- [x] No create API submit wiring

### Findings

1. **Low — Edit develop-owner still optional:** Create requires `developOwnerPicker.selected`. Edit with empty historical develop owner can still save (legacy rows). Intentional for backward compatibility; Task 3 API may tighten both fields.
2. **Low — Edit hydrate parse:** `hydratePickerFromValue` splits label on whitespace (`chName` = first token, `id` = rest-as-last). Matches typical `「姓名 工号」` labels; multi-token names are imperfect but only used for edit convenience.
3. **None blocking:** Build green; create free-text path blocked by selected checks.

### Out of scope (confirmed untouched)

- `CreateSkillMasterManagementBody` / `skillBaseService.createSkillMasterManagement`
- Submit body mapping (`ownerName`/`ownerId`/…) — Task 3

---

## Commit

```
4575d77 feat: use search-select for Skill master owner fields
```

---

## Review fix (Important findings)

**Date:** 2026-07-25

### Fixes applied

1. **Esc + debounce reopen**
   - Added `closeOwnerPersonSearch` / `closeDevelopOwnerPersonSearch` (aligned with `DepartmentPlanningPermissionPanel.closePersonSearch`): set `open = false`, clear debounce timer, increment search sequence, clear loading.
   - Esc handlers and click-select now call these closers so a pending 250ms timer cannot reopen the panel after Esc/select.

2. **Invalidate in-flight `requestSeq` + empty focus clears options**
   - `resetPersonPicker` / close person search / empty-keyword search & focus all increment the corresponding `ownerSearchSequence` / `developOwnerSearchSequence`, so late responses are ignored.
   - Empty-keyword focus clears `options`, sets loading false, and shows「请输入人员信息」.

3. **`hydratePickerFromValue` parse**
   - Label split: last whitespace token = 工号 (`id`), preceding tokens joined = `chName` (supports multi-token names).

### Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass (exit 0, 245 modules, ~12.8s) |
| IDE lints on changed file | ✅ No errors |

### Follow-up commit

```
b275384 fix: harden Skill master person picker close/search
```