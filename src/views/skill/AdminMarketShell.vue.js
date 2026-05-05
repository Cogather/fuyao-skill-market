import { computed, ref } from 'vue';
import { useSkillMarketStore } from '../../stores/skillMarketStore';
const store = useSkillMarketStore();
const { skills, marketClient } = store;
const toast = ref('');
const rows = computed(() => [...skills.value].sort((a, b) => (a.latestPublishTime ?? '') < (b.latestPublishTime ?? '') ? 1 : -1));
async function approve(skillId) {
    try {
        const pending = await marketClient.fetchSyncApplications({
            tab: 'pending',
            pageNo: 1,
            pageSize: 20,
        });
        const rec = pending.data.records[0];
        const applicationId = rec?.id ?? 90_001;
        const r = await marketClient.postSyncApplicationReview(String(applicationId), {
            decision: 'approve',
            comment: `演示：批准 Skill ${skillId} 同步至组织`,
        });
        toast.value =
            r.code === 0
                ? `已调用审核接口：申请 #${applicationId}（Skill #${skillId}）`
                : r.message || '审核接口返回异常';
        setTimeout(() => {
            toast.value = '';
        }, 3500);
    }
    catch (e) {
        toast.value = e instanceof Error ? e.message : '审核请求失败';
        setTimeout(() => {
            toast.value = '';
        }, 3500);
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['hero']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-shell" },
});
/** @type {__VLS_StyleScopedClasses['admin-shell']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "hero admin" },
});
/** @type {__VLS_StyleScopedClasses['hero']} */ ;
/** @type {__VLS_StyleScopedClasses['admin']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "hero-inner" },
});
/** @type {__VLS_StyleScopedClasses['hero-inner']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "badge" },
});
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
    ...{ class: "hero-title" },
});
/** @type {__VLS_StyleScopedClasses['hero-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "hero-desc" },
});
/** @type {__VLS_StyleScopedClasses['hero-desc']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "panel" },
});
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
    ...{ class: "panel-title" },
});
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "panel-help" },
});
/** @type {__VLS_StyleScopedClasses['panel-help']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "table-wrap" },
});
/** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
    ...{ class: "table" },
});
/** @type {__VLS_StyleScopedClasses['table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
for (const [s] of __VLS_vFor((__VLS_ctx.rows))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        key: (s.id ?? s.skill_id),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "icon" },
    });
    /** @type {__VLS_StyleScopedClasses['icon']} */ ;
    (s.icon);
    (s.name ?? s.skill_id);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (s.version);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (s.publish_name ?? s.publisher);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (s.latestPublishTime);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (s.download_count ?? s.downloads ?? 0);
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.approve(String(s.id ?? s.skill_id));
                // @ts-ignore
                [rows, approve,];
            } },
        type: "button",
        ...{ class: "link-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['link-btn']} */ ;
    // @ts-ignore
    [];
}
if (__VLS_ctx.toast) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toast" },
        role: "status",
    });
    /** @type {__VLS_StyleScopedClasses['toast']} */ ;
    (__VLS_ctx.toast);
}
// @ts-ignore
[toast, toast,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
