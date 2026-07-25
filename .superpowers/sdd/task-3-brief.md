### Task 3: 蹇呭～鏍￠獙 + 缁勮 body + 璋冩帴鍙ｅ苟鏈湴鍚屾

**Files:**
- Modify: `src/components/skill/SkillMasterManagementPanelV2.vue`

**Interfaces:**
- Consumes: `skillBaseService.createSkillMasterManagement`銆乣CreateSkillMasterManagementBody`銆乣createSkillMasterRecord`
- Produces: 鏂板鎴愬姛鍚庡垪琛ㄥ彲瑙佺殑鏈湴璁板綍

- [ ] **Step 1: 澧炲姞缁村害瑙ｆ瀽鍑芥暟**

```ts
function resolveDimFields(): { dimType: string; dimCode: string; dimName: string } | null {
  if (!ensureMasterScopeSelection(true)) {
    return null;
  }
  const dimType = masterScopeForm.level;
  if (dimType === '浜у搧绾?) {
    const dimCode = String(
      selectedMasterProduct.value?.offeringId || masterScopeForm.offeringId || '',
    ).trim();
    const dimName = masterScopeForm.offeringName.trim();
    if (!dimCode || !dimName) {
      editor.error = '璇烽€夋嫨鏈夋晥浜у搧锛堥渶鍖呭惈浜у搧缂栫爜锛?;
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
    editor.error = '璇烽€夋嫨鏈夋晥褰掑睘閮ㄩ棬锛堥渶鍖呭惈閮ㄩ棬缂栫爜锛?;
    return null;
  }
  return {
    dimType,
    dimCode,
    dimName,
  };
}
```

- [ ] **Step 2: 鏀瑰啓 `submitEditor` 鐨?create 鍒嗘敮**

鏍￠獙椤哄簭锛?
1. `resolveDimFields()`
2. `ensureProductSkillNamePrefix()` + `editor.description` 闈炵┖
3. `ownerPicker.selected` / `developOwnerPicker.selected` 闈炵┖
4. `editor.plannedCompleteDate` 闈炵┖

缁勮锛?
```ts
const body: CreateSkillMasterManagementBody = {
  skillName: editor.name.trim(),
  skillDescription: editor.description.trim(),
  dimType: dim.dimType,
  dimCode: dim.dimCode,
  dimName: dim.dimName,
  ownerName: ownerPicker.selected.chName || ownerPicker.selected.label,
  ownerId: ownerPicker.selected.id,
  developOwnerName:
    developOwnerPicker.selected.chName || developOwnerPicker.selected.label,
  developOwnerId: developOwnerPicker.selected.id,
  planFinishDate: editor.plannedCompleteDate,
};
```

璋冪敤锛?
```ts
const response = await skillBaseService.createSkillMasterManagement(body);
if (response?.meta?.success !== true) {
  throw new Error(
    String(response?.meta?.message || response?.message || '鏂板澶辫触锛岃绋嶅悗閲嶈瘯'),
  );
}
createSkillMasterRecord({
  name: body.skillName,
  description: body.skillDescription,
  level: body.dimType,
  product: body.dimType === '浜у搧绾? ? body.dimName : '',
  owner: `${body.ownerName} ${body.ownerId}`.trim(),
  department: ownerPicker.selected?.deptName || '',
  developOwner: `${body.developOwnerName} ${body.developOwnerId}`.trim(),
  developOwnerDepartment: developOwnerPicker.selected?.deptName || '',
  plannedCompleteDate: body.planFinishDate,
  status: '鏈紑濮?,
});
```

缂栬緫鍒嗘敮锛坄editor.mode !== 'create'`锛変繚鎸佺幇鏈?`updateSkillMasterRecord` 閫昏緫锛涚紪杈戞椂鑻ヤ粛鐢ㄦ棫 owner 瀛楃涓插瓧娈碉紝鍙殏涓嶅己鍒惰蛋鏂?picker锛堟垨缂栬緫涔熻姹?selected鈥斺€斾互瀹炵幇鏃惰兘璺戦€氫负鍑嗭紝鏂板蹇呴』璧?API锛夈€?
妯℃澘锛氳鍒掑畬鎴愭椂闂?label 鏀逛负銆岃鍒掑畬鎴愭椂闂?*銆嶏紱寮€鍙戣矗浠讳汉宸插湪 Task 2 鍔?`*`銆?
浠?`@/services/skillMarket/skillBaseService` 涓?`apiTypes` 瀵煎叆鎵€闇€绗﹀彿銆?
- [ ] **Step 3: 鎵嬪姩绔埌绔獙璇?*

1. 椤堕儴閫夐儴闂ㄧ骇 + 褰掑睘閮ㄩ棬 鈫?鏂板 鈫?濉叏瀛楁骞剁偣閫変袱浜?鈫?淇濆瓨  
   - Network/mock log锛歚POST /management/add`锛宐ody **鏃?* `status`锛屽惈姝ｇ‘ `dimType/dimCode/dimName`  
   - 鍒楄〃鍑虹幇璁板綍锛岃繘灞曚负銆屾湭寮€濮嬨€?2. 缂哄紑鍙戣矗浠讳汉鎴栬鍒掑畬鎴愭椂闂?鈫?鎷︽埅锛屼笉鍏冲脊绐?3. 鍙緭鍏?Owner 涓嶇偣閫?鈫?鎷︽埅
4. 鍒囦骇鍝佺骇 + 閫変骇鍝?鈫?`dimCode`=`offeringId`锛宍dimName`=`offeringName`

- [ ] **Step 4: 鏋勫缓妫€鏌?*

```bash
npm run build
```

Expected: 鏋勫缓鎴愬姛锛堟棤鍥犳湰娆℃敼鍔ㄥ紩鍏ョ殑 TS/缂栬瘧閿欒锛夈€?
- [ ] **Step 5: Commit**

```bash
git add src/components/skill/SkillMasterManagementPanelV2.vue
git commit -m "feat: submit Skill master create via /management/add"
```

---

## Spec Coverage Checklist

| Spec 瑕佹眰 | Task |
|-----------|------|
| Body 瀛楁榻愬叏涓斾笉鍚?status | Task 1 mock + Task 3 缁勮 |
| `skillBaseService` + mock | Task 1 |
| 寮圭獥蹇呭～ | Task 3 |
| 浜哄憳鎼滅储鐐归€夊榻愰厤缃鐞?| Task 2 |
| dimType/dimCode/dimName 鏄犲皠 | Task 3 |
| success 鏍￠獙 + 鏈湴鍚屾鍒楄〃 | Task 3 |
| 涓嶆敼缂栬緫鎺ュ彛 / 涓嶆娊鍏叡缁勪欢 | 鍏ㄥ眬绾︽潫 |

## Self-Review Notes

- 鏃犲崟鍏冩祴璇曟鏋讹細鐢ㄦ墜鍔ㄩ獙璇?+ `npm run build` 浠ｆ浛
- `ownerName` 浼樺厛鐢?`chName`锛屼笌閰嶇疆绠＄悊灞曠ず涓€鑷?- 浜у搧绾х己 `offeringId` 鏃舵槑纭姤閿欙紝閬垮厤绌?`dimCode`
