### Task 1: 绫诲瀷 + `skillBaseService` 鏂规硶 + Mock

**Files:**

- Modify: `src/services/skillMarket/apiTypes.ts`
- Modify: `src/services/skillMarket/skillBaseService.ts`
- Modify: `src/services/skillMarket/skillBaseServiceMock.ts`锛坄handleSkillRequest`锛?
  **Interfaces:**
- Produces: `CreateSkillMasterManagementBody`锛沗skillBaseService.createSkillMasterManagement(body)`锛沵ock `POST /management/add`

- [ ] **Step 1: 鍦?`apiTypes.ts` 鏈熬锛堟垨鍚堥€備綅缃級杩藉姞绫诲瀷**

```ts
/** Skill 娓呭崟鏂板锛圥OST /management/add锛?*/
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

- [ ] **Step 2: 鍦?`skillBaseService.ts` 澧炲姞鏂规硶**

鍦?`createSkillPlanning` 闄勮繎锛堟垨 management 鐩稿叧鍖哄煙锛夊鍔狅細

```ts
createSkillMasterManagement: (body: CreateSkillMasterManagementBody): any => {
  return httpRequest.skill<any>({
    url: '/management/add',
    method: 'post',
    data: body,
  });
},
```

骞朵粠 `./apiTypes` 瀵煎叆 `CreateSkillMasterManagementBody`锛堣嫢鏂囦欢宸叉湁 `ApiEnvelope` 瀵煎叆锛屽悎骞跺嵆鍙級銆?

- [ ] **Step 3: 鍦?`skillBaseServiceMock.ts` 鐨?`handleSkillRequest` 澧炲姞鎷︽埅**

鍦?`handleSkillRequest` 鍐呭悎閫備綅缃紙渚嬪鍏跺畠 `post` 鍒嗘敮闄勮繎锛夊姞鍏ワ細

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
    return fail(`缂哄皯蹇呭～瀛楁: ${missing.join(', ')}`, null);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    return fail('status 涓嶅簲浼犲叆', null);
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

璇存槑锛氫娇鐢ㄥ凡鏈?`ok` / `fail` 杈呭姪鍑芥暟锛沵ock \**涓?*鍐?localStorage銆?

- [ ] \*_Step 4: 鎵嬪姩鍐掔儫锛堝彲閫夛紝DevTools锛?_

鍦ㄦ祻瑙堝櫒 console 鎴栦复鏃惰皟鐢細`skillBaseService.createSkillMasterManagement({...瀹屾暣 body})`锛岀‘璁よ繑鍥?`meta.success === true`锛涙晠鎰忕己瀛楁纭 `meta.success === false`銆?

- [ ] **Step 5: Commit**

```bash
git add src/services/skillMarket/apiTypes.ts src/services/skillMarket/skillBaseService.ts src/services/skillMarket/skillBaseServiceMock.ts
git commit -m "feat: add Skill master management create API and mock"
```

---
