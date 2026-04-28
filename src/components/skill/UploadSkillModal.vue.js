import { ref, watch } from 'vue';
const props = withDefaults(defineProps(), {
    modelValue: false,
});
const emit = defineEmits();
const name = ref('');
const userId = ref('当前用户');
const note = ref('');
const file = ref(null);
watch(() => props.modelValue, (open) => {
    if (open) {
        return;
    }
    name.value = '';
    userId.value = '当前用户';
    note.value = '';
    file.value = null;
});
function close() {
    emit('update:modelValue', false);
}
function onOverlayClick() {
    close();
}
function onFileChange(event) {
    const input = event.target;
    file.value = input.files?.[0] ?? null;
    name.value = file.value?.name ?? '';
    console.log(file.value);
    // name
}
function onSubmit() {
    emit('submit', {
        name: name.value,
        publisher: userId.value,
        note: note.value,
        file: file.value,
    });
    close();
}
const __VLS_defaults = {
    modelValue: false,
};
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
if (__VLS_ctx.modelValue) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.onOverlayClick) },
        ...{ class: "overlay" },
        role: "presentation",
    });
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "upload-title",
    });
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dialog-head" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        id: "upload-title",
        ...{ class: "dialog-title" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        type: "button",
        ...{ class: "close-x" },
        'aria-label': "关闭",
    });
    /** @type {__VLS_StyleScopedClasses['close-x']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "sk-file",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.onFileChange) },
        id: "sk-file",
        type: "file",
        accept: ".zip,application/zip",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "sk-note",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.textarea)({
        id: "sk-note",
        value: (__VLS_ctx.note),
        rows: "3",
        placeholder: "本次更新要点",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        type: "button",
        ...{ class: "btn ghost" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.onSubmit) },
        type: "button",
        ...{ class: "btn primary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
}
// @ts-ignore
[modelValue, onOverlayClick, close, close, onFileChange, note, onSubmit,];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
