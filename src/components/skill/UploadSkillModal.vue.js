import { computed, ref, watch } from 'vue';
const props = withDefaults(defineProps(), {
    modelValue: false,
});
const emit = defineEmits();
const note = ref('');
const file = ref(null);
const parsed = ref(null);
const parseState = ref('idle');
const parsing = ref(false);
const parseError = ref('');
const parseNotice = computed(() => {
    if (parseError.value) {
        return parseError.value;
    }
    if (parseState.value === 'success') {
        return '解析成功：已从 SKILL.md Front Matter 中解析基础信息和 metadata，必填项完整，名称未重名。';
    }
    if (parseState.value === 'duplicate') {
        return '重名校验未通过：市场内已存在同名 Skill。请修改 SKILL.md Front Matter 中的 name 后重新上传；如果你是维护人，请从“我的发布”进入“上传新版本”。';
    }
    if (parsing.value) {
        return '正在请求后端解析压缩包…';
    }
    return '等待上传：解析字段会自动回显且禁填。';
});
const canSubmit = computed(() => Boolean(parsed.value) && parseState.value === 'success');
watch(() => props.modelValue, (open) => {
    if (open) {
        return;
    }
    reset();
});
function reset() {
    note.value = '';
    file.value = null;
    parsed.value = null;
    parseState.value = 'idle';
    parsing.value = false;
    parseError.value = '';
}
function close() {
    emit('update:modelValue', false);
}
function onOverlayClick() {
    close();
}
function fileBaseName(uploadFile) {
    return uploadFile.name.replace(/\.[^.]+$/, '').trim() || 'uploaded-skill';
}
function parseUploadOk(uploadFile) {
    const base = uploadFile ? fileBaseName(uploadFile) : 'pdf-document-extractor';
    parsed.value = {
        name: base === 'uploaded-skill' ? 'pdf-document-extractor' : base,
        version: '1.0.0',
        description: '从 PDF 文件中提取文本和表格、填充表单、合并文档。在处理 PDF 文件或用户提及 PDF、表单或文档提取时使用。',
        author: '当前用户',
        category: 'utility-doc',
        requirements: '需要 Python 3.10+ 和 pdfplumber 库',
        tags: 'pdf document extraction',
        level: '个人级（默认发布，无需审核）',
    };
    parseState.value = 'success';
}
async function onFileChange(event) {
    const input = event.target;
    file.value = input.files?.[0] ?? null;
    parseError.value = '';
    parsed.value = null;
    parseState.value = 'idle';
    if (!file.value) {
        return;
    }
    if (props.parseSkillArchive) {
        parsing.value = true;
        try {
            const r = await props.parseSkillArchive(file.value);
            parsed.value = r.meta;
            parseState.value = r.duplicate ? 'duplicate' : 'success';
        }
        catch (e) {
            parseError.value = e instanceof Error ? e.message : '解析请求失败';
            parseState.value = 'idle';
        }
        finally {
            parsing.value = false;
        }
        return;
    }
    parseUploadOk(file.value);
}
function onSubmit() {
    if (!parsed.value || parseState.value !== 'success') {
        return;
    }
    emit('submit', {
        name: parsed.value.name,
        publisher: parsed.value.author,
        note: note.value.trim() || parsed.value.description,
        file: file.value,
        scopeLabel: '个人级',
        tagFunctional: parsed.value.category,
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
/** @type {__VLS_StyleScopedClasses['close-x']} */ ;
/** @type {__VLS_StyleScopedClasses['notice']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['parse-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['parse-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-result-head']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-result-head']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-meta-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['actions-spacer']} */ ;
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "upload-title",
    });
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "dialog-head" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        id: "upload-title",
        ...{ class: "dialog-title" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "dialog-sub" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        type: "button",
        ...{ class: "close-x" },
        'aria-label': "关闭",
    });
    /** @type {__VLS_StyleScopedClasses['close-x']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "notice" },
    });
    /** @type {__VLS_StyleScopedClasses['notice']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "upload-zone" },
        ...{ class: ({ disabled: __VLS_ctx.parsing }) },
        for: "sk-file",
    });
    /** @type {__VLS_StyleScopedClasses['upload-zone']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "upload-icon" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.onFileChange) },
        id: "sk-file",
        type: "file",
        accept: ".zip,application/zip",
        disabled: (__VLS_ctx.parsing),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "parse-notice" },
        ...{ class: ({
                success: __VLS_ctx.parseState === 'success',
                error: __VLS_ctx.parseState === 'duplicate' || Boolean(__VLS_ctx.parseError),
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['parse-notice']} */ ;
    /** @type {__VLS_StyleScopedClasses['success']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    (__VLS_ctx.parseNotice);
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "upload-result-card" },
        'aria-label': "解析结果",
    });
    /** @type {__VLS_StyleScopedClasses['upload-result-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "upload-result-head" },
    });
    /** @type {__VLS_StyleScopedClasses['upload-result-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "upload-result-body" },
    });
    /** @type {__VLS_StyleScopedClasses['upload-result-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "upload-meta-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['upload-meta-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input readonly" },
        readonly: true,
        value: (__VLS_ctx.parsed?.name ?? '等待解析'),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    /** @type {__VLS_StyleScopedClasses['readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input readonly" },
        readonly: true,
        value: (__VLS_ctx.parsed?.version ?? '等待解析'),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    /** @type {__VLS_StyleScopedClasses['readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field full" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['full']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.textarea)({
        ...{ class: "textarea readonly" },
        readonly: true,
        value: (__VLS_ctx.parsed?.description ?? '等待解析'),
    });
    /** @type {__VLS_StyleScopedClasses['textarea']} */ ;
    /** @type {__VLS_StyleScopedClasses['readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input readonly" },
        readonly: true,
        value: (__VLS_ctx.parsed?.author ?? '等待解析'),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    /** @type {__VLS_StyleScopedClasses['readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input readonly" },
        readonly: true,
        value: (__VLS_ctx.parsed?.category ?? '等待解析'),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    /** @type {__VLS_StyleScopedClasses['readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field full" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['full']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input readonly" },
        readonly: true,
        value: (__VLS_ctx.parsed?.requirements ?? '等待解析'),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    /** @type {__VLS_StyleScopedClasses['readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field full" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['full']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input readonly" },
        readonly: true,
        value: (__VLS_ctx.parsed?.tags ?? '可选，等待解析'),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    /** @type {__VLS_StyleScopedClasses['readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input readonly" },
        readonly: true,
        value: (__VLS_ctx.parsed?.level ?? '个人级（默认发布，无需审核）'),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    /** @type {__VLS_StyleScopedClasses['readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-field full" },
    });
    /** @type {__VLS_StyleScopedClasses['form-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['full']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "sk-note",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.textarea)({
        id: "sk-note",
        value: (__VLS_ctx.note),
        ...{ class: "textarea" },
        placeholder: "可填写本次上传说明；为空时使用 description",
    });
    /** @type {__VLS_StyleScopedClasses['textarea']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "actions-spacer" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['actions-spacer']} */ ;
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
        disabled: (!__VLS_ctx.canSubmit),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
}
// @ts-ignore
[modelValue, onOverlayClick, close, close, parsing, parsing, onFileChange, parseState, parseState, parseError, parseNotice, parsed, parsed, parsed, parsed, parsed, parsed, parsed, parsed, note, onSubmit, canSubmit,];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
