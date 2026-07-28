### Task 2: 闈㈡澘浜哄憳鎼滅储鏀逛负閰嶇疆绠＄悊鍚屾鐐归€?

**Files:**

- Modify: `src/components/skill/SkillMasterManagementPanelV2.vue`

**Interfaces:**

- Consumes: `querySkillPlanningUsers`銆乣SkillPlanningUserOption`锛堝凡鏈夛級
- Produces: `selectedOwner` / `selectedDevelopOwner`锛堟垨绛変环 state锛夛紝鎻愪氦鏃跺彲璇?`id` + `chName`

- [ ] \*_Step 1: 澧炲姞閫変腑鎬佷笌鎼滅储鎬侊紙鏇挎崲浠呴潬瀛楃涓?+ datalist 鐨勯€昏緫锛?_

鍦?script 涓鍔狅紙鍛藉悕鍙井璋冿紝浣嗚涔変繚鎸侊級锛?

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
    message: '璇疯緭鍏ヤ汉鍛樹俊鎭?,
    selected: null,
  };
}

const ownerPicker = reactive(createPersonPickerState());
const developOwnerPicker = reactive(createPersonPickerState());
```

淇濈暀鎴栫Щ闄ゆ棫鐨?`ownerOptions` / `developOwnerOptions` datalist 鐩稿叧閫昏緫锛涘垱寤?鍏抽棴缂栬緫鍣ㄦ椂 reset picker锛堝惈 `selected = null`锛夈€?

- [ ] \*_Step 2: 瀹炵幇鎼滅储 / 鐐归€夛紙瀵归綈 `DepartmentPlanningPermissionPanel`锛?_

鍙傝€冭闈㈡澘鐨?debounce 250ms銆乣requestSeq` 闃茬珵鎬併€佷笅鎷?panel锛?

- `searchOwnerUsers` / `searchDevelopOwnerUsers` 璋?`querySkillPlanningUsers`
- 鐐归€夛細`ownerPicker.selected = option`锛沗ownerPicker.keyword = option.label`锛涘叧闂?panel
- `@input` 鏃惰嫢鍏抽敭瀛椾笌宸查€?label 涓嶄竴鑷达紝鍒?`selected = null`
- 妯℃澘涓?Owner / 寮€鍙戣矗浠讳汉锛氬幓鎺?`<datalist>`锛屾敼涓猴細

```html
<label class="owner-picker person-search" @keydown.esc="ownerPicker.open = false">
  <span>璐ｄ换 Owner *</span>
  <input
    :value="ownerPicker.keyword"
    type="text"
    autocomplete="off"
    placeholder="杈撳叆濮撳悕鎴栧伐鍙峰悗閫夋嫨"
    @focus="ownerPicker.open = true"
    @input="onOwnerPickerInput"
  />
  <div v-if="ownerPicker.open" class="person-search__panel" @mousedown.stop>
    <span v-if="ownerPicker.loading" class="person-search__empty">鏌ヨ涓?..</span>
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
        <em>{{ option.deptName || '閮ㄩ棬淇℃伅寰呰ˉ鍏? }}</em>
      </button>
      <span v-if="ownerPicker.message" class="person-search__empty">{{ ownerPicker.message }}</span>
    </template>
  </div>
</label>
```

寮€鍙戣矗浠讳汉鍚岀悊锛宭abel 鏀逛负 `寮€鍙戣矗浠讳汉 *`銆?
浠?`DepartmentPlanningPermissionPanel.vue` 鎷疯礉绮剧畝鐗?`.person-search` / `__panel` / `__empty` 鏍峰紡鍒版湰缁勪欢 scoped CSS锛堝搴︽敼涓?`100%`锛岄€傞厤琛ㄥ崟鏍呮牸锛夈€?

- [ ] **Step 3: 鎵撳紑缂栬緫鏃剁殑鍥炲～**

缂栬緫妯″紡锛堟湰娆′粛璧版湰鍦?update锛夛細鑻ユ湁鍘嗗彶 `owner`/`developOwner` 瀛楃涓诧紝鍙彧鍥炲～ `keyword` 灞曠ず锛屼絾 **鏂板** 蹇呴』 `selected` 闈炵┖锛涚紪杈戜繚瀛橀€昏緫淇濇寔鐜版湁鏈湴 update锛屼笉寮哄埗鏈鏀规帴鍙ｃ€傝嫢缂栬緫涔熻鏍￠獙鐐归€夛紝鍙湪缂栬緫鎵撳紑鏃跺皾璇曠敤鐜版湁 label 瑙ｆ瀽锛涙柊澧炶矾寰勫繀椤讳互 `selected` 涓哄噯銆?

- [ ] **Step 4: 鎵嬪姩楠岃瘉浜哄憳鎼滅储**

鎵撳紑銆屾坊鍔?Skill銆嶏紝杈撳叆濮撳悕/宸ュ彿锛岀‘璁や笅鎷夊嚭鐜?mock 浜哄憳锛涚偣閫夊悗杈撳叆妗嗘樉绀恒€屽鍚?宸ュ彿銆嶏紱鏀瑰瓧鍚庨渶閲嶆柊鐐归€夈€?

- [ ] **Step 5: Commit**

```bash
git add src/components/skill/SkillMasterManagementPanelV2.vue
git commit -m "feat: use search-select for Skill master owner fields"
```

---
