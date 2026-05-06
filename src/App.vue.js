import { onBeforeUnmount, provide, ref } from 'vue';
import { RouterView } from 'vue-router';
import { normalizeSkillMarketRequestUserId, setSkillMarketRequestUserId, } from './services/skillMarket/requestUserContext';
const mockDepartmentList = [
    {
        deptName: '核心网产品线mock',
        deptLevel: 1,
        children: [
            {
                deptName: '核心网研究部',
                deptLevel: 2,
                children: [],
            },
        ],
    },
];
/** 父页面 postMessage 下发的部门树；在 setup 中 provide，子组件 inject 同一 Ref 即可响应更新 */
const departmentList = ref(mockDepartmentList);
provide('departmentList', departmentList);
/** 父页面 postMessage 下发的用户 id；接口层读取同一份上下文补到 `/api/skills...` 请求 */
const userId = ref('');
provide('userId', userId);
function updateUserIdFromParent(value) {
    const next = normalizeSkillMarketRequestUserId(value);
    userId.value = next;
    setSkillMarketRequestUserId(next);
}
function handleEvent(event) {
    const payload = event.data;
    if (!payload || typeof payload !== 'object') {
        return;
    }
    const p = payload;
    if (p.type !== 'init') {
        return;
    }
    if ('userId' in p) {
        updateUserIdFromParent(p.userId);
    }
    let list = null;
    if (Array.isArray(p.departmentList)) {
        list = p.departmentList;
    }
    else if (typeof p.departmentListStr === 'string' && p.departmentListStr.length > 0) {
        try {
            list = JSON.parse(p.departmentListStr);
        }
        catch {
            list = null;
        }
    }
    if (Array.isArray(list)) {
        departmentList.value = list;
    }
}
window.addEventListener('message', handleEvent);
onBeforeUnmount(() => {
    window.removeEventListener('message', handleEvent);
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.RouterView} */
RouterView;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5 = {};
var __VLS_3;
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
