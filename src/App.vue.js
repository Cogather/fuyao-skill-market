import { onBeforeUnmount, provide, ref } from 'vue';
import { RouterView } from 'vue-router';
/** 父页面 postMessage 下发的部门树；在 setup 中 provide，子组件 inject 同一 Ref 即可响应更新 */
const departmentList = ref(null);
provide('departmentList', departmentList);
function handleEvent(event) {
    const payload = event.data;
    if (payload && typeof payload === 'object' && 'departmentList' in payload) {
        const list = payload.departmentList;
        if (Array.isArray(list)) {
            departmentList.value = list;
        }
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
