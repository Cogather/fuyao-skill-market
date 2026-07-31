# Skill 清单新增对接 `/management/add` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skill 清单「添加 Skill」按约定 body 调用 `POST /management/add`，本地走 mock，Owner/开发责任人改为配置管理同款搜索点选，弹窗字段全部必填。

**Architecture:** 在 `skillBaseService` 增加 `createSkillMasterManagement`；mock 在 `handleSkillRequest` 拦截同路径并校验必填；面板提交时组装 body、校验 `meta.success`，成功后再映射写入现有 `createSkillMasterRecord` 以刷新列表。人员搜索去掉 datalist，改为下拉面板点选。

**Tech Stack:** Vue 3 + TypeScript、现有 `httpRequest.skill`、`skillBaseServiceMock`、`querySkillPlanningUsers`

## Global Constraints

- 新增 body **不传** `status`
- `dimType` = 顶部「层级」；部门级 `dimCode`/`dimName` = 末级部门编码/名称；产品级 = `offeringId`/`offeringName`
- Owner / 开发责任人必须从搜索结果点选，禁止自由文本直接提交
- 弹窗内：Skill 名称、说明、责任 Owner、开发责任人、计划完成时间均为必填
- 本次不改编辑接口；不抽公共 PersonSearch 组件；列表仍走本地 master
- `.js/.ts/.vue` 对象/数组使用拖尾逗号；`if/for/while` 等执行体加大括号 `{}`
- 本仓库无单元测试框架；用手动验证 + `npm run build` / 类型检查代替自动化 TDD

---

## File Structure

| 文件                                                    | 职责                                               |
| ------------------------------------------------------- | -------------------------------------------------- |
| `src/services/skillMarket/apiTypes.ts`                  | 新增 `CreateSkillMasterManagementBody` 类型        |
| `src/services/skillMarket/skillBaseService.ts`          | 新增 `createSkillMasterManagement` HTTP 方法       |
| `src/services/skillMarket/skillBaseServiceMock.ts`      | Mock `POST /management/add`                        |
| `src/components/skill/SkillMasterManagementPanelV2.vue` | 人员搜索 UI、必填校验、组装 body、调接口、本地同步 |

---

### Task 1: 类型 + `skillBaseService` 方法 + Mock

**Files:**

- Modify: `src/services/skillMarket/apiTypes.ts`
- Modify: `src/services/skillMarket/skillBaseService.ts`
- Modify: `src/services/skillMarket/skillBaseServiceMock.ts`（`handleSkillRequest`）

**Interfaces:**

- Produces: `CreateSkillMasterManagementBody`；`skillBaseService.createSkillMasterManagement(body)`；mock `POST /management/add`

- [ ] **Step 1: 在 `apiTypes.ts` 末尾（或合适位置）追加类型**

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

- [ ] **Step 2: 在 `skillBaseService.ts` 增加方法**

在 `createSkillPlanning` 附近（或 management 相关区域）增加：

```ts
createSkillMasterManagement: (body: CreateSkillMasterManagementBody): any => {
  return httpRequest.skill<any>({
    url: '/management/add',
    method: 'post',
    data: body,
  });
},
```

并从 `./apiTypes` 导入 `CreateSkillMasterManagementBody`（若文件已有 `ApiEnvelope` 导入，合并即可）。

- [ ] **Step 3: 在 `skillBaseServiceMock.ts` 的 `handleSkillRequest` 增加拦截**

在 `handleSkillRequest` 内合适位置（例如其它 `post` 分支附近）加入：

```ts
if (method === 'post' && path === '/management/add') {
  const body = (config.data ?? {}) as Record<string, unknown>;
  const requiredKeys = [
    'skillName',
    'skillDescription',
    'dimType',
    'dimCode',
    'dimName',
    'ownerName',
    'ownerId',
    'developOwnerName',
    'developOwnerId',
    'planFinishDate',
  ] as const;
  const missing = requiredKeys.filter((key) => !String(body[key] ?? '').trim());
  if (missing.length > 0) {
    return fail(`缺少必填字段: ${missing.join(', ')}`, null);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    return fail('status 不应传入', null);
  }
  const id = `skill-mgmt-${Date.now()}`;
  return ok({
    id,
    skillName: String(body.skillName).trim(),
    skillDescription: String(body.skillDescription).trim(),
    dimType: String(body.dimType).trim(),
    dimCode: String(body.dimCode).trim(),
    dimName: String(body.dimName).trim(),
    ownerName: String(body.ownerName).trim(),
    ownerId: String(body.ownerId).trim(),
    developOwnerName: String(body.developOwnerName).trim(),
    developOwnerId: String(body.developOwnerId).trim(),
    planFinishDate: String(body.planFinishDate).trim(),
  });
}
```

说明：使用已有 `ok` / `fail` 辅助函数；mock **不**写 localStorage。

- [ ] **Step 4: 手动冒烟（可选，DevTools）**

在浏览器 console 或临时调用：`skillBaseService.createSkillMasterManagement({...完整 body})`，确认返回 `meta.success === true`；故意缺字段确认 `meta.success === false`。

- [ ] **Step 5: Commit**

```bash
git add src/services/skillMarket/apiTypes.ts src/services/skillMarket/skillBaseService.ts src/services/skillMarket/skillBaseServiceMock.ts
git commit -m "feat: add Skill master management create API and mock"
```

---

### Task 2: 面板人员搜索改为配置管理同款点选

**Files:**

- Modify: `src/components/skill/SkillMasterManagementPanelV2.vue`

**Interfaces:**

- Consumes: `querySkillPlanningUsers`、`SkillPlanningUserOption`（已有）
- Produces: `selectedOwner` / `selectedDevelopOwner`（或等价 state），提交时可读 `id` + `chName`

- [ ] **Step 1: 增加选中态与搜索态（替换仅靠字符串 + datalist 的逻辑）**

在 script 中增加（命名可微调，但语义保持）：

```ts
type PersonPickerState = {
  keyword: string;
  open: boolean;
  loading: boolean;
  options: SkillPlanningUserOption[];
  message: string;
  selected: SkillPlanningUserOption | null;
};

function createPersonPickerState(): PersonPickerState {
  return {
    keyword: '',
    open: false,
    loading: false,
    options: [],
    message: '请输入人员信息',
    selected: null,
  };
}

const ownerPicker = reactive(createPersonPickerState());
const developOwnerPicker = reactive(createPersonPickerState());
```

保留或移除旧的 `ownerOptions` / `developOwnerOptions` datalist 相关逻辑；创建/关闭编辑器时 reset picker（含 `selected = null`）。

- [ ] **Step 2: 实现搜索 / 点选（对齐 `DepartmentPlanningPermissionPanel`）**

参考该面板的 debounce 250ms、`requestSeq` 防竞态、下拉 panel：

- `searchOwnerUsers` / `searchDevelopOwnerUsers` 调 `querySkillPlanningUsers`
- 点选：`ownerPicker.selected = option`；`ownerPicker.keyword = option.label`；关闭 panel
- `@input` 时若关键字与已选 label 不一致，则 `selected = null`
- 模板中 Owner / 开发责任人：去掉 `<datalist>`，改为：

```html
<label class="owner-picker person-search" @keydown.esc="ownerPicker.open = false">
  <span>责任 Owner *</span>
  <input
    :value="ownerPicker.keyword"
    type="text"
    autocomplete="off"
    placeholder="输入姓名或工号后选择"
    @focus="ownerPicker.open = true"
    @input="onOwnerPickerInput"
  />
  <div v-if="ownerPicker.open" class="person-search__panel" @mousedown.stop>
    <span v-if="ownerPicker.loading" class="person-search__empty">查询中...</span>
    <template v-else>
      <button
        v-for="option in ownerPicker.options"
        :key="option.id || option.label"
        type="button"
        @click="selectOwner(option)"
      >
        <span
          ><strong>{{ option.chName || option.label }}</strong><small>{{ option.id }}</small></span
        >
        <em>{{ option.deptName || '部门信息待补充' }}</em>
      </button>
      <span v-if="ownerPicker.message" class="person-search__empty">{{ ownerPicker.message }}</span>
    </template>
  </div>
</label>
```

开发责任人同理，label 改为 `开发责任人 *`。

从 `DepartmentPlanningPermissionPanel.vue` 拷贝精简版 `.person-search` / `__panel` / `__empty` 样式到本组件 scoped CSS（宽度改为 `100%`，适配表单栅格）。

- [ ] **Step 3: 打开编辑时的回填**

编辑模式（本次仍走本地 update）：若有历史 `owner`/`developOwner` 字符串，可只回填 `keyword` 展示，但 **新增** 必须 `selected` 非空；编辑保存逻辑保持现有本地 update，不强制本次改接口。若编辑也要校验点选，可在编辑打开时尝试用现有 label 解析；新增路径必须以 `selected` 为准。

- [ ] **Step 4: 手动验证人员搜索**

打开「添加 Skill」，输入姓名/工号，确认下拉出现 mock 人员；点选后输入框显示「姓名 工号」；改字后需重新点选。

- [ ] **Step 5: Commit**

```bash
git add src/components/skill/SkillMasterManagementPanelV2.vue
git commit -m "feat: use search-select for Skill master owner fields"
```

---

### Task 3: 必填校验 + 组装 body + 调接口并本地同步

**Files:**

- Modify: `src/components/skill/SkillMasterManagementPanelV2.vue`

**Interfaces:**

- Consumes: `skillBaseService.createSkillMasterManagement`、`CreateSkillMasterManagementBody`、`createSkillMasterRecord`
- Produces: 新增成功后列表可见的本地记录

- [ ] **Step 1: 增加维度解析函数**

```ts
function resolveDimFields(): { dimType: string; dimCode: string; dimName: string } | null {
  if (!ensureMasterScopeSelection(true)) {
    return null;
  }
  const dimType = masterScopeForm.level;
  if (dimType === '产品级') {
    const dimCode = String(
      selectedMasterProduct.value?.offeringId || masterScopeForm.offeringId || '',
    ).trim();
    const dimName = masterScopeForm.offeringName.trim();
    if (!dimCode || !dimName) {
      editor.error = '请选择有效产品（需包含产品编码）';
      return null;
    }
    return {
      dimType,
      dimCode,
      dimName,
    };
  }
  const node = findMasterDepartmentNode(masterDepartmentSegments.value);
  const dimCode = String(node?.deptCode ?? node?.id ?? '').trim();
  const dimName = masterScopeForm.planningDeptName.trim();
  if (!dimCode || !dimName) {
    editor.error = '请选择有效归属部门（需包含部门编码）';
    return null;
  }
  return {
    dimType,
    dimCode,
    dimName,
  };
}
```

- [ ] **Step 2: 改写 `submitEditor` 的 create 分支**

校验顺序：

1. `resolveDimFields()`
2. `ensureProductSkillNamePrefix()` + `editor.description` 非空
3. `ownerPicker.selected` / `developOwnerPicker.selected` 非空
4. `editor.plannedCompleteDate` 非空

组装：

```ts
const body: CreateSkillMasterManagementBody = {
  skillName: editor.name.trim(),
  skillDescription: editor.description.trim(),
  dimType: dim.dimType,
  dimCode: dim.dimCode,
  dimName: dim.dimName,
  ownerName: ownerPicker.selected.chName || ownerPicker.selected.label,
  ownerId: ownerPicker.selected.id,
  developOwnerName: developOwnerPicker.selected.chName || developOwnerPicker.selected.label,
  developOwnerId: developOwnerPicker.selected.id,
  planFinishDate: editor.plannedCompleteDate,
};
```

调用：

```ts
const response = await skillBaseService.createSkillMasterManagement(body);
if (response?.meta?.success !== true) {
  throw new Error(String(response?.meta?.message || response?.message || '新增失败，请稍后重试'));
}
createSkillMasterRecord({
  name: body.skillName,
  description: body.skillDescription,
  level: body.dimType,
  product: body.dimType === '产品级' ? body.dimName : '',
  owner: `${body.ownerName} ${body.ownerId}`.trim(),
  department: ownerPicker.selected?.deptName || '',
  developOwner: `${body.developOwnerName} ${body.developOwnerId}`.trim(),
  developOwnerDepartment: developOwnerPicker.selected?.deptName || '',
  plannedCompleteDate: body.planFinishDate,
  status: '未开始',
});
```

编辑分支（`editor.mode !== 'create'`）保持现有 `updateSkillMasterRecord` 逻辑；编辑时若仍用旧 owner 字符串字段，可暂不强制走新 picker（或编辑也要求 selected——以实现时能跑通为准，新增必须走 API）。

模板：计划完成时间 label 改为「计划完成时间 _」；开发责任人已在 Task 2 加 `_`。

从 `@/services/skillMarket/skillBaseService` 与 `apiTypes` 导入所需符号。

- [ ] **Step 3: 手动端到端验证**

1. 顶部选部门级 + 归属部门 → 新增 → 填全字段并点选两人 → 保存
   - Network/mock log：`POST /management/add`，body **无** `status`，含正确 `dimType/dimCode/dimName`
   - 列表出现记录，进展为「未开始」
2. 缺开发责任人或计划完成时间 → 拦截，不关弹窗
3. 只输入 Owner 不点选 → 拦截
4. 切产品级 + 选产品 → `dimCode`=`offeringId`，`dimName`=`offeringName`

- [ ] **Step 4: 构建检查**

```bash
npm run build
```

Expected: 构建成功（无因本次改动引入的 TS/编译错误）。

- [ ] **Step 5: Commit**

```bash
git add src/components/skill/SkillMasterManagementPanelV2.vue
git commit -m "feat: submit Skill master create via /management/add"
```

---

## Spec Coverage Checklist

| Spec 要求                    | Task                      |
| ---------------------------- | ------------------------- |
| Body 字段齐全且不含 status   | Task 1 mock + Task 3 组装 |
| `skillBaseService` + mock    | Task 1                    |
| 弹窗必填                     | Task 3                    |
| 人员搜索点选对齐配置管理     | Task 2                    |
| dimType/dimCode/dimName 映射 | Task 3                    |
| success 校验 + 本地同步列表  | Task 3                    |
| 不改编辑接口 / 不抽公共组件  | 全局约束                  |

## Self-Review Notes

- 无单元测试框架：用手动验证 + `npm run build` 代替
- `ownerName` 优先用 `chName`，与配置管理展示一致
- 产品级缺 `offeringId` 时明确报错，避免空 `dimCode`
