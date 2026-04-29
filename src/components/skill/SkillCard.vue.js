import { computed, ref } from 'vue';
const props = withDefaults(defineProps(), {
    menuMode: 'full',
    variant: 'default',
});
const emit = defineEmits();
const menuOpen = ref(false);
const statusLabel = computed(() => {
    if (props.variant !== 'coreHarness') {
        return '';
    }
    const downloads = props.skill.download_count ?? props.skill.downloads ?? 0;
    if (downloads >= 2000) {
        return '已发布';
    }
    if (props.skill.ownedByUser) {
        return '待发布';
    }
    return '试用中';
});
const orgShort = computed(() => {
    if (props.variant !== 'coreHarness') {
        return '';
    }
    const raw = props.skill.tagOrg || props.skill.level || props.skill.dept_name || '';
    const parts = raw.split('·').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
        return raw;
    }
    return parts.slice(0, 2).join(' · ');
});
const scopeLabel = computed(() => {
    const rawLevel = (props.skill.publish_level ?? props.skill.level ?? props.skill.tagOrg ?? '').trim();
    if (rawLevel.includes('组织')) {
        const orgName = (props.skill.publish_name ?? props.skill.publisher ?? '').trim();
        return orgName ? `组织级 · ${orgName}` : '组织级';
    }
    if (rawLevel.includes('个人')) {
        return '个人级';
    }
    return rawLevel;
});
const scopeKind = computed(() => {
    const rawLevel = (props.skill.publish_level ?? props.skill.level ?? props.skill.tagOrg ?? '').trim();
    if (rawLevel.includes('组织')) {
        return 'org';
    }
    if (rawLevel.includes('个人')) {
        return 'personal';
    }
    return 'other';
});
function toggleMenu() {
    menuOpen.value = !menuOpen.value;
}
function closeMenu() {
    menuOpen.value = false;
}
function onDownload() {
    closeMenu();
    emit('download', props.skill.id ?? props.skill.skill_id);
}
function onViewVersions() {
    closeMenu();
    emit('view-versions', props.skill.id ?? props.skill.skill_id);
}
function onFooterDownload() {
    emit('download', props.skill.id ?? props.skill.skill_id);
}
function onOpenDetail() {
    emit('open-detail', props.skill.id ?? props.skill.skill_id);
}
const __VLS_defaults = {
    menuMode: 'full',
    variant: 'default',
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
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['more']} */ ;
/** @type {__VLS_StyleScopedClasses['dd-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-status']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-status']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-status']} */ ;
/** @type {__VLS_StyleScopedClasses['dl-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
    ...{ onClick: (__VLS_ctx.onOpenDetail) },
    ...{ onKeydown: (__VLS_ctx.onOpenDetail) },
    ...{ onKeydown: (__VLS_ctx.onOpenDetail) },
    ...{ class: "card" },
    role: "button",
    tabindex: "0",
});
/** @type {__VLS_StyleScopedClasses['card']} */ ;
if (__VLS_ctx.variant === 'coreHarness') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "top-tags" },
        'aria-label': "CoreHarness 标签区",
    });
    /** @type {__VLS_StyleScopedClasses['top-tags']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tag tag-core" },
    });
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag-core']} */ ;
    if (__VLS_ctx.orgShort) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "tag tag-org" },
        });
        /** @type {__VLS_StyleScopedClasses['tag']} */ ;
        /** @type {__VLS_StyleScopedClasses['tag-org']} */ ;
        (__VLS_ctx.orgShort);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tag tag-ver" },
    });
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag-ver']} */ ;
    (__VLS_ctx.skill.version);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tag tag-status" },
        ...{ class: (`st-${__VLS_ctx.statusLabel}`) },
    });
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag-status']} */ ;
    (__VLS_ctx.statusLabel);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "card-head" },
});
/** @type {__VLS_StyleScopedClasses['card-head']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
    ...{ class: "title" },
});
/** @type {__VLS_StyleScopedClasses['title']} */ ;
(__VLS_ctx.skill.name ?? __VLS_ctx.skill.skill_id);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: () => { } },
    ...{ class: "menu-wrap" },
});
/** @type {__VLS_StyleScopedClasses['menu-wrap']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.toggleMenu) },
    type: "button",
    ...{ class: "more" },
    'aria-label': "更多",
    'aria-haspopup': "true",
    'aria-expanded': (__VLS_ctx.menuOpen),
});
/** @type {__VLS_StyleScopedClasses['more']} */ ;
if (__VLS_ctx.menuOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dropdown" },
        role: "menu",
    });
    /** @type {__VLS_StyleScopedClasses['dropdown']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.onDownload) },
        type: "button",
        role: "menuitem",
        ...{ class: "dd-item" },
    });
    /** @type {__VLS_StyleScopedClasses['dd-item']} */ ;
    if (__VLS_ctx.menuMode === 'full') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.onViewVersions) },
            type: "button",
            role: "menuitem",
            ...{ class: "dd-item" },
        });
        /** @type {__VLS_StyleScopedClasses['dd-item']} */ ;
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "meta" },
});
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
(__VLS_ctx.skill.publish_name ?? __VLS_ctx.skill.publisher);
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "meta" },
});
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
(__VLS_ctx.skill.publish_level ?? __VLS_ctx.skill.level);
if (__VLS_ctx.skill.description) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "meta" },
    });
    /** @type {__VLS_StyleScopedClasses['meta']} */ ;
    (__VLS_ctx.skill.description);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "card-foot" },
});
/** @type {__VLS_StyleScopedClasses['card-foot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tags" },
    ...{ class: ({ compact: __VLS_ctx.variant === 'coreHarness' }) },
});
/** @type {__VLS_StyleScopedClasses['tags']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
if (__VLS_ctx.skill.tagFunctional) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tag tag-fn" },
    });
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag-fn']} */ ;
    (__VLS_ctx.skill.tagFunctional);
}
if (__VLS_ctx.variant !== 'coreHarness' && __VLS_ctx.scopeLabel) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tag" },
        ...{ class: (__VLS_ctx.scopeKind === 'personal' ? 'tag-personal' : 'tag-org') },
    });
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    (__VLS_ctx.scopeLabel);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.onFooterDownload) },
    type: "button",
    ...{ class: "dl-btn" },
    'aria-label': "下载",
});
/** @type {__VLS_StyleScopedClasses['dl-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    ...{ class: "dl-icon" },
    viewBox: "0 0 24 24",
    fill: "none",
    'aria-hidden': "true",
});
/** @type {__VLS_StyleScopedClasses['dl-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    d: "M12 4v12m0 0l4-4m-4 4L8 12M5 19h14",
    stroke: "currentColor",
    'stroke-width': "1.75",
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "dl-num" },
});
/** @type {__VLS_StyleScopedClasses['dl-num']} */ ;
((__VLS_ctx.skill.download_count ?? __VLS_ctx.skill.downloads ?? 0).toLocaleString('zh-CN'));
// @ts-ignore
[onOpenDetail, onOpenDetail, onOpenDetail, variant, variant, variant, orgShort, orgShort, skill, skill, skill, skill, skill, skill, skill, skill, skill, skill, skill, skill, skill, statusLabel, statusLabel, toggleMenu, menuOpen, menuOpen, onDownload, menuMode, onViewVersions, scopeLabel, scopeLabel, scopeKind, onFooterDownload,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
