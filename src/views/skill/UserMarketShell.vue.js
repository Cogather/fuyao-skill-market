import { computed, ref, watch } from 'vue';
import SkillCard from '../../components/skill/SkillCard.vue';
import UploadSkillModal from '../../components/skill/UploadSkillModal.vue';
import { useSkillMarketStore } from '../../stores/skillMarketStore';
import { buildOpsDashboardBundle, parseOpsExcelBuffer } from '../../utils/opsExcelImport';
const store = useSkillMarketStore();
const { skills, totalDownloads, totalSkills, downloadsLast30Days, orgCount } = store;
const innerTab = ref('overview');
const uploadOpen = ref(false);
const search = ref('');
const levelFilter = ref('all');
const sceneFilter = ref('all');
const quickFilter = ref('all');
const page = ref(1);
const pageSize = 8;
const toast = ref('');
const versionPanelSkill = ref(null);
const quickEntries = [
    { key: 'all', label: '全部' },
    { key: 'personal', label: '个人' },
    { key: 'devDept', label: '开发部' },
    { key: 'pdu', label: 'PDU' },
    { key: 'productLine', label: '产品线' },
    { key: 'recent', label: '最近更新' },
    { key: 'highDl', label: '高下载' },
];
function toListScope(filter) {
    return ['personal', 'devDept', 'pdu', 'productLine'].includes(filter)
        ? filter
        : 'all';
}
const listResponse = computed(() => store.listSkills({
    keyword: search.value,
    page: page.value,
    pageSize,
    scope: toListScope(quickFilter.value),
}));
const filteredSkills = computed(() => listResponse.value.list);
const myReleases = computed(() => skills.value.filter((skill) => skill.ownedByUser));
watch([search, quickFilter], () => {
    page.value = 1;
});
function openUpload() {
    uploadOpen.value = true;
}
function goTab(tab) {
    innerTab.value = tab;
}
function showToast(message, ms = 3000) {
    toast.value = message;
    setTimeout(() => {
        toast.value = '';
    }, ms);
}
function onUploadSubmit(payload) {
    try {
        const result = store.uploadSkill(payload);
        page.value = 1;
        showToast(result.created
            ? `已发布新 Skill「${result.skill.name}」v${result.skill.version}`
            : `同名 Skill 已更新为 v${result.skill.version}（版本追加）`, 4000);
    }
    catch (e) {
        showToast(e instanceof Error ? e.message : '上传失败');
    }
}
function onDownload(id) {
    try {
        const result = store.downloadSkill(id);
        const url = URL.createObjectURL(result.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast(`已下载当前版本：${result.skill.name} v${result.skill.version}`);
    }
    catch (e) {
        showToast(e instanceof Error ? e.message : '下载失败');
    }
}
function onViewVersions(id) {
    const skill = skills.value.find((item) => item.id === id);
    if (skill) {
        versionPanelSkill.value = skill;
    }
}
function closeVersionPanel() {
    versionPanelSkill.value = null;
}
function prevPage() {
    page.value = Math.max(1, page.value - 1);
}
function nextPage() {
    page.value = Math.min(listResponse.value.totalPages, page.value + 1);
}
// 为贴近 UI 设计稿：我的发布指标按稿面数值
const uiMyStats = {
    maintained: '8',
    reviewing: '3',
    rejected: '1',
    myTotalDownloads: '1,278',
    my30DaysDownloads: '326',
};
const coreQuickEntries = [
    { key: 'all', label: '全部' },
    { key: 'devDept', label: '开发部' },
    { key: 'pdu', label: 'PDU' },
    { key: 'productLine', label: '产品线' },
];
const coreLevelStats = [
    { key: 'core', label: 'CoreHarness', count: 9 },
    { key: 'dev', label: '开发部级', count: 4 },
    { key: 'pdu', label: 'PDU级', count: 3 },
    { key: 'pl', label: '产品线级', count: 2 },
];
const coreQuick = ref('all');
const coreSearch = ref('');
const coreSkills = computed(() => {
    let list = [...skills.value];
    const q = coreSearch.value.trim().toLowerCase();
    if (q) {
        list = list.filter((s) => s.name.toLowerCase().includes(q) ||
            s.publisher.toLowerCase().includes(q) ||
            s.tagOrg.toLowerCase().includes(q) ||
            s.tagFunctional.toLowerCase().includes(q));
    }
    if (coreQuick.value === 'devDept') {
        list = list.filter((s) => s.tagOrg.includes('开发部') || s.level.includes('开发部'));
    }
    if (coreQuick.value === 'pdu') {
        list = list.filter((s) => s.tagOrg.includes('PDU') || s.level.includes('PDU'));
    }
    if (coreQuick.value === 'productLine') {
        list = list.filter((s) => s.tagOrg.includes('产品线') || s.level.includes('产品线'));
    }
    return list;
});
function onApplyCoreHarness() {
    toast.value = '已提交申请（演示）：将你的 Skill 纳入 CoreHarness';
    setTimeout(() => {
        toast.value = '';
    }, 2500);
}
const releaseFilter = ref('all');
const releaseFilters = [
    { key: 'all', label: '全部' },
    { key: 'personal', label: '个人层级' },
    { key: 'published', label: '已发布' },
    { key: 'reviewing', label: '审核中' },
    { key: 'rejected', label: '被驳回' },
    { key: 'coreApply', label: 'CoreHarness 申请' },
];
function statusOf(skill) {
    if (skill.id === '2') {
        return 'rejected-pdu';
    }
    if (skill.id === '4') {
        return 'reviewing-dev';
    }
    return 'published';
}
function statusText(st) {
    if (st === 'published') {
        return '已发布';
    }
    if (st === 'reviewing-dev') {
        return '开发部审核中';
    }
    return 'PDU 审核驳回';
}
function lastActionText(st) {
    if (st === 'published') {
        return '可申请升级到开发部级';
    }
    if (st === 'reviewing-dev') {
        return '等待终端安全开发一部审核';
    }
    return '需补充复现数据和说明文档';
}
const myReleaseRows = computed(() => {
    const list = myReleases.value.length > 0 ? myReleases.value : skills.value.slice(0, 4);
    return list.map((s) => {
        const st = statusOf(s);
        const isPersonal = s.level.includes('个人') || s.tagOrg.includes('个人');
        return {
            skill: s,
            statusKey: st,
            statusLabel: statusText(st),
            lastAction: lastActionText(st),
            personal: isPersonal,
            coreApply: s.id === '1' || s.id === '3',
        };
    });
});
const filteredMyReleaseRows = computed(() => {
    let list = [...myReleaseRows.value];
    if (releaseFilter.value === 'personal') {
        list = list.filter((x) => x.personal);
    }
    if (releaseFilter.value === 'published') {
        list = list.filter((x) => x.statusKey === 'published');
    }
    if (releaseFilter.value === 'reviewing') {
        list = list.filter((x) => x.statusKey === 'reviewing-dev');
    }
    if (releaseFilter.value === 'rejected') {
        list = list.filter((x) => x.statusKey === 'rejected-pdu');
    }
    if (releaseFilter.value === 'coreApply') {
        list = list.filter((x) => x.coreApply);
    }
    return list;
});
function toastAction(message) {
    toast.value = message;
    setTimeout(() => {
        toast.value = '';
    }, 2500);
}
function onUploadExistingVersion() {
    toastAction('上传已有 Skill 新版本（演示）：请在弹窗中选择同名 Skill 以追加版本');
    openUpload();
}
/** 运营看板：导入前展示设计稿默认数值 */
const defaultOpsKpi = {
    totalSkills: '334',
    activeSkills: '125',
    personalSkills: '44',
    totalDownloads: '508',
};
const opsImportedBundle = ref(null);
const opsImporting = ref(false);
const opsExcelInputRef = ref(null);
const uiOpsKpi = computed(() => opsImportedBundle.value ? opsImportedBundle.value.kpi : defaultOpsKpi);
const uiOpsKpiDesc = {
    totalSkills: '目前 Skill 的累计总数',
    activeSkills: '近30天内有使用的 Skill 数',
    personalSkills: '个人发布的 Skill 数量',
    totalDownloads: '部门内活跃下载',
};
const defaultUiDeptTree = [
    {
        name: '云化端到端经营管理部',
        skills: 165,
        downloads: 253,
        children: [
            { name: '智能数据产品部', skills: 61, downloads: 83 },
            { name: '物联平台部', skills: 55, downloads: 31 },
            { name: '质量工具组', skills: 38, downloads: 25 },
            { name: '平台工具组', skills: 15, downloads: 23 },
        ],
    },
    {
        name: '联通业务部',
        skills: 12,
        downloads: 20,
    },
    {
        name: '设备能源产品部',
        skills: 4,
        downloads: 4,
        children: [
            { name: '产品建设一组', skills: 1, downloads: 1 },
            { name: '物资管理案部', skills: 1, downloads: 1 },
        ],
    },
];
const defaultUiOrgBars = [
    { name: '项目管理部', skills: 31, downloads: 186 },
    { name: '平台二部部', skills: 24, downloads: 142 },
    { name: '质量工具组', skills: 18, downloads: 96 },
    { name: '平台工具组', skills: 15, downloads: 88 },
    { name: '二层系统', skills: 12, downloads: 62 },
    { name: 'R&D测试', skills: 10, downloads: 51 },
    { name: '业务运营组', skills: 9, downloads: 38 },
    { name: '数据库运营', skills: 8, downloads: 29 },
];
const opsBarMode = ref('skills');
const uiDeptTree = computed(() => opsImportedBundle.value ? opsImportedBundle.value.deptTree : defaultUiDeptTree);
const uiOrgBars = computed(() => opsImportedBundle.value ? opsImportedBundle.value.orgBars : defaultUiOrgBars);
const uiOrgBarsSorted = computed(() => {
    const list = [...uiOrgBars.value];
    if (opsBarMode.value === 'skills') {
        return list.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads);
    }
    return list.sort((a, b) => b.downloads - a.downloads || b.skills - a.skills);
});
function orgBarLabel(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        return '';
    }
    const parts = trimmed.split('/');
    return parts[parts.length - 1]?.trim() || trimmed;
}
function minDeptLabel(name) {
    return orgBarLabel(name);
}
const uiOrgBarsMax = computed(() => {
    const list = uiOrgBarsSorted.value.map((x) => opsBarMode.value === 'skills' ? x.skills : x.downloads);
    return Math.max(1, ...list);
});
const defaultUiTopSkillsByDl = [
    { rank: 1, name: 'Java 代码 Review 助手', dept: '门诊系统部', downloads: 43 },
    { rank: 2, name: '投口指标统计 Skill', dept: '门诊系统部', downloads: 41 },
    { rank: 3, name: '部门 Merit 生成 Skill', dept: '门诊系统部', downloads: 40 },
    { rank: 4, name: 'CICD 发布效率 Skill', dept: '平台工具组', downloads: 18 },
    { rank: 5, name: '部署开发资源 Skill', dept: '平台工程部', downloads: 14 },
    { rank: 6, name: '质量日工效率 Skill', dept: '平台工程部', downloads: 10 },
];
const uiTopSkillsByDl = computed(() => opsImportedBundle.value
    ? opsImportedBundle.value.topSkills
    : defaultUiTopSkillsByDl);
const expandedDeptPaths = ref(new Set());
watch(uiDeptTree, (tree) => {
    const next = new Set();
    for (const n of tree) {
        next.add(n.name);
    }
    expandedDeptPaths.value = next;
}, { immediate: true });
function toggleDeptExpand(path) {
    const next = new Set(expandedDeptPaths.value);
    if (next.has(path)) {
        next.delete(path);
    }
    else {
        next.add(path);
    }
    expandedDeptPaths.value = next;
}
function flattenDeptTreeVisible(nodes, depth = 0, parentPath = '') {
    const out = [];
    for (const n of nodes) {
        const path = parentPath ? `${parentPath}/${n.name}` : n.name;
        const hasChildren = Boolean(n.children && n.children.length > 0);
        const expanded = hasChildren ? expandedDeptPaths.value.has(path) : false;
        out.push({
            path,
            name: n.name,
            skills: n.skills,
            downloads: n.downloads,
            depth,
            hasChildren,
            expanded,
        });
        if (hasChildren && expanded) {
            out.push(...flattenDeptTreeVisible(n.children, depth + 1, path));
        }
    }
    return out;
}
const uiDeptFlat = computed(() => flattenDeptTreeVisible(uiDeptTree.value));
function triggerOpsExcelImport() {
    opsExcelInputRef.value?.click();
}
async function onOpsExcelFileChange(ev) {
    const input = ev.target;
    const file = input.files?.[0];
    if (!file) {
        return;
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        showToast('请上传 .xlsx 格式的 Excel 文件');
        input.value = '';
        return;
    }
    opsImporting.value = true;
    try {
        const buf = await file.arrayBuffer();
        const rows = parseOpsExcelBuffer(buf);
        if (rows.length === 0) {
            showToast('Excel 中没有可解析的数据行');
            input.value = '';
            return;
        }
        opsImportedBundle.value = buildOpsDashboardBundle(rows);
        showToast(`已导入 ${rows.length} 条 Skill，运营看板已更新`);
    }
    catch (e) {
        showToast(e instanceof Error ? e.message : 'Excel 解析失败');
    }
    finally {
        opsImporting.value = false;
        input.value = '';
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['hero-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['hero']} */ ;
/** @type {__VLS_StyleScopedClasses['hero']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['core-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['my-div']} */ ;
/** @type {__VLS_StyleScopedClasses['seg']} */ ;
/** @type {__VLS_StyleScopedClasses['seg']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['my-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['ops']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-import-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-mid-2col']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['dept-tree-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dt-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['dt-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['dt-caret']} */ ;
/** @type {__VLS_StyleScopedClasses['dt-caret']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['org-bar-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-section']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-panel-hd']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-row']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-help']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['sm']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-k']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-v']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-div']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-div']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-block']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-block']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-row']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['search']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['search']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['more']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-pills']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pill']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['search']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['plain-list']} */ ;
/** @type {__VLS_StyleScopedClasses['plain-list']} */ ;
/** @type {__VLS_StyleScopedClasses['plain-list']} */ ;
/** @type {__VLS_StyleScopedClasses['v-list']} */ ;
/** @type {__VLS_StyleScopedClasses['v-list']} */ ;
/** @type {__VLS_StyleScopedClasses['v-list']} */ ;
/** @type {__VLS_StyleScopedClasses['v-list']} */ ;
/** @type {__VLS_StyleScopedClasses['hero']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['pager']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-block']} */ ;
/** @type {__VLS_StyleScopedClasses['two-col']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-shell" },
});
/** @type {__VLS_StyleScopedClasses['user-shell']} */ ;
const __VLS_0 = UploadSkillModal;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.uploadOpen),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.uploadOpen),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = ({ submit: {} },
    { onSubmit: (__VLS_ctx.onUploadSubmit) });
var __VLS_3;
var __VLS_4;
let __VLS_7;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
    to: "body",
}));
const __VLS_9 = __VLS_8({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
const { default: __VLS_12 } = __VLS_10.slots;
if (__VLS_ctx.versionPanelSkill) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeVersionPanel) },
        ...{ class: "overlay" },
        role: "presentation",
    });
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-dialog" },
        role: "dialog",
        'aria-modal': "true",
    });
    /** @type {__VLS_StyleScopedClasses['v-dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-head" },
    });
    /** @type {__VLS_StyleScopedClasses['v-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.versionPanelSkill.name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeVersionPanel) },
        type: "button",
        ...{ class: "close-x" },
        'aria-label': "关闭",
    });
    /** @type {__VLS_StyleScopedClasses['close-x']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "v-sub" },
    });
    /** @type {__VLS_StyleScopedClasses['v-sub']} */ ;
    (__VLS_ctx.versionPanelSkill.version);
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "v-list" },
    });
    /** @type {__VLS_StyleScopedClasses['v-list']} */ ;
    for (const [version] of __VLS_vFor(([...__VLS_ctx.versionPanelSkill.versions].reverse()))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (version.version + version.publishTime),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ver" },
        });
        /** @type {__VLS_StyleScopedClasses['ver']} */ ;
        (version.version);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "time" },
        });
        /** @type {__VLS_StyleScopedClasses['time']} */ ;
        (version.publishTime);
        if (version.packageFileName) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "note" },
            });
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
            (version.packageFileName);
        }
        if (version.note) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "note" },
            });
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
            (version.note);
        }
        // @ts-ignore
        [uploadOpen, onUploadSubmit, versionPanelSkill, versionPanelSkill, versionPanelSkill, versionPanelSkill, closeVersionPanel, closeVersionPanel,];
    }
}
// @ts-ignore
[];
var __VLS_10;
if (__VLS_ctx.toast) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toast" },
        role: "status",
    });
    /** @type {__VLS_StyleScopedClasses['toast']} */ ;
    (__VLS_ctx.toast);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-shell" },
});
/** @type {__VLS_StyleScopedClasses['user-shell']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "hero" },
});
/** @type {__VLS_StyleScopedClasses['hero']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "hero-inner" },
});
/** @type {__VLS_StyleScopedClasses['hero-inner']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
    ...{ class: "hero-title" },
});
/** @type {__VLS_StyleScopedClasses['hero-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "hero-desc" },
});
/** @type {__VLS_StyleScopedClasses['hero-desc']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "hero-actions" },
});
/** @type {__VLS_StyleScopedClasses['hero-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.openUpload) },
    type: "button",
    ...{ class: "btn primary" },
});
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "up" },
});
/** @type {__VLS_StyleScopedClasses['up']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
    ...{ class: "sub-tabs" },
    ...{ class: ({ 'ops-tabs': __VLS_ctx.innerTab === 'ops' }) },
    'aria-label': "市场分区",
});
/** @type {__VLS_StyleScopedClasses['sub-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tabs']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.goTab('overview');
            // @ts-ignore
            [toast, toast, openUpload, innerTab, goTab,];
        } },
    type: "button",
    ...{ class: "sub-tab" },
    ...{ class: ({ on: __VLS_ctx.innerTab === 'overview' }) },
});
/** @type {__VLS_StyleScopedClasses['sub-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.goTab('core');
            // @ts-ignore
            [innerTab, goTab,];
        } },
    type: "button",
    ...{ class: "sub-tab" },
    ...{ class: ({ on: __VLS_ctx.innerTab === 'core' }) },
});
/** @type {__VLS_StyleScopedClasses['sub-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.goTab('releases');
            // @ts-ignore
            [innerTab, goTab,];
        } },
    type: "button",
    ...{ class: "sub-tab" },
    ...{ class: ({ on: __VLS_ctx.innerTab === 'releases' }) },
});
/** @type {__VLS_StyleScopedClasses['sub-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.goTab('ops');
            // @ts-ignore
            [innerTab, goTab,];
        } },
    type: "button",
    ...{ class: "sub-tab" },
    ...{ class: ({ on: __VLS_ctx.innerTab === 'ops' }) },
});
/** @type {__VLS_StyleScopedClasses['sub-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
if (__VLS_ctx.innerTab === 'overview') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel tab-panel overview-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel-head" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "panel-help" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-help']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.openUpload) },
        type: "button",
        ...{ class: "btn primary sm" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "up" },
    });
    /** @type {__VLS_StyleScopedClasses['up']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stats-strip" },
        role: "group",
        'aria-label': "市场指标",
    });
    /** @type {__VLS_StyleScopedClasses['stats-strip']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stat-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-k" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-v" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-v']} */ ;
    (__VLS_ctx.totalSkills);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "stat-div" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['stat-div']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stat-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-k" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-v" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-v']} */ ;
    (__VLS_ctx.totalDownloads.toLocaleString('zh-CN'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "stat-div" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['stat-div']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stat-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-k" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-v" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-v']} */ ;
    (__VLS_ctx.downloadsLast30Days.toLocaleString('zh-CN'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "stat-div" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['stat-div']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stat-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-k" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stat-v" },
    });
    /** @type {__VLS_StyleScopedClasses['stat-v']} */ ;
    (__VLS_ctx.orgCount);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-block" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "quick-row" },
    });
    /** @type {__VLS_StyleScopedClasses['quick-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "quick-label" },
    });
    /** @type {__VLS_StyleScopedClasses['quick-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "quick-pills" },
    });
    /** @type {__VLS_StyleScopedClasses['quick-pills']} */ ;
    for (const [item] of __VLS_vFor((__VLS_ctx.quickEntries))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    __VLS_ctx.quickFilter = item.key;
                    // @ts-ignore
                    [openUpload, innerTab, innerTab, totalSkills, totalDownloads, downloadsLast30Days, orgCount, quickEntries, quickFilter,];
                } },
            key: (item.key),
            type: "button",
            ...{ class: "pill" },
            ...{ class: ({ active: __VLS_ctx.quickFilter === item.key }) },
        });
        /** @type {__VLS_StyleScopedClasses['pill']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (item.label);
        // @ts-ignore
        [quickFilter,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filters" },
    });
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "search" },
        type: "search",
        placeholder: "通过 Skill 名称搜索",
    });
    (__VLS_ctx.search);
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_ctx.levelFilter),
        ...{ class: "select" },
    });
    /** @type {__VLS_StyleScopedClasses['select']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "all",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "开发部",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "平台部",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "研发平台",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_ctx.sceneFilter),
        ...{ class: "select" },
    });
    /** @type {__VLS_StyleScopedClasses['select']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "all",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "review",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "cicd",
    });
    if (__VLS_ctx.filteredSkills.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid" },
        });
        /** @type {__VLS_StyleScopedClasses['grid']} */ ;
        for (const [s] of __VLS_vFor((__VLS_ctx.filteredSkills))) {
            const __VLS_13 = SkillCard;
            // @ts-ignore
            const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
                ...{ 'onDownload': {} },
                ...{ 'onViewVersions': {} },
                key: (s.id),
                skill: (s),
                menuMode: "download-only",
            }));
            const __VLS_15 = __VLS_14({
                ...{ 'onDownload': {} },
                ...{ 'onViewVersions': {} },
                key: (s.id),
                skill: (s),
                menuMode: "download-only",
            }, ...__VLS_functionalComponentArgsRest(__VLS_14));
            let __VLS_18;
            const __VLS_19 = ({ download: {} },
                { onDownload: (__VLS_ctx.onDownload) });
            const __VLS_20 = ({ viewVersions: {} },
                { onViewVersions: (__VLS_ctx.onViewVersions) });
            var __VLS_16;
            var __VLS_17;
            // @ts-ignore
            [search, levelFilter, sceneFilter, filteredSkills, filteredSkills, onDownload, onViewVersions,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pager" },
    });
    /** @type {__VLS_StyleScopedClasses['pager']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.listResponse.total);
    (__VLS_ctx.listResponse.page);
    (__VLS_ctx.listResponse.totalPages);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pager-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['pager-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.prevPage) },
        type: "button",
        ...{ class: "mini" },
        disabled: (__VLS_ctx.page <= 1),
    });
    /** @type {__VLS_StyleScopedClasses['mini']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.nextPage) },
        type: "button",
        ...{ class: "mini" },
        disabled: (__VLS_ctx.page >= __VLS_ctx.listResponse.totalPages),
    });
    /** @type {__VLS_StyleScopedClasses['mini']} */ ;
}
else if (__VLS_ctx.innerTab === 'core') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel tab-panel core" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['core']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "core-alert" },
        role: "note",
        'aria-label': "CoreHarness 提示",
    });
    /** @type {__VLS_StyleScopedClasses['core-alert']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "core-head" },
    });
    /** @type {__VLS_StyleScopedClasses['core-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "panel-help" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-help']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.onApplyCoreHarness) },
        type: "button",
        ...{ class: "btn outline sm" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['outline']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "core-levels" },
        role: "group",
        'aria-label': "CoreHarness 层级统计",
    });
    /** @type {__VLS_StyleScopedClasses['core-levels']} */ ;
    for (const [x] of __VLS_vFor((__VLS_ctx.coreLevelStats))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            key: (x.key),
            ...{ class: "lvl-pill" },
        });
        /** @type {__VLS_StyleScopedClasses['lvl-pill']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "lvl-k" },
        });
        /** @type {__VLS_StyleScopedClasses['lvl-k']} */ ;
        (x.label);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "lvl-v" },
        });
        /** @type {__VLS_StyleScopedClasses['lvl-v']} */ ;
        (x.count);
        // @ts-ignore
        [innerTab, listResponse, listResponse, listResponse, listResponse, prevPage, page, page, nextPage, onApplyCoreHarness, coreLevelStats,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter-block core-filter" },
    });
    /** @type {__VLS_StyleScopedClasses['filter-block']} */ ;
    /** @type {__VLS_StyleScopedClasses['core-filter']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "quick-row" },
    });
    /** @type {__VLS_StyleScopedClasses['quick-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "quick-label" },
    });
    /** @type {__VLS_StyleScopedClasses['quick-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "quick-pills" },
    });
    /** @type {__VLS_StyleScopedClasses['quick-pills']} */ ;
    for (const [item] of __VLS_vFor((__VLS_ctx.coreQuickEntries))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'core'))
                        return;
                    __VLS_ctx.coreQuick = item.key;
                    // @ts-ignore
                    [coreQuickEntries, coreQuick,];
                } },
            key: (item.key),
            type: "button",
            ...{ class: "pill" },
            ...{ class: ({ active: __VLS_ctx.coreQuick === item.key }) },
        });
        /** @type {__VLS_StyleScopedClasses['pill']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (item.label);
        // @ts-ignore
        [coreQuick,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filters core-filters" },
    });
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    /** @type {__VLS_StyleScopedClasses['core-filters']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "search" },
        type: "search",
        placeholder: "搜索 Skill 名称 / 维护方 / 目标系统",
    });
    (__VLS_ctx.coreSearch);
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "core-spacer" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['core-spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "core-spacer" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['core-spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "grid" },
    });
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    for (const [s] of __VLS_vFor((__VLS_ctx.coreSkills))) {
        const __VLS_21 = SkillCard;
        // @ts-ignore
        const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
            ...{ 'onDownload': {} },
            ...{ 'onViewVersions': {} },
            key: (s.id),
            skill: (s),
            variant: "coreHarness",
            menuMode: "full",
        }));
        const __VLS_23 = __VLS_22({
            ...{ 'onDownload': {} },
            ...{ 'onViewVersions': {} },
            key: (s.id),
            skill: (s),
            variant: "coreHarness",
            menuMode: "full",
        }, ...__VLS_functionalComponentArgsRest(__VLS_22));
        let __VLS_26;
        const __VLS_27 = ({ download: {} },
            { onDownload: (__VLS_ctx.onDownload) });
        const __VLS_28 = ({ viewVersions: {} },
            { onViewVersions: (__VLS_ctx.onViewVersions) });
        var __VLS_24;
        var __VLS_25;
        // @ts-ignore
        [onDownload, onViewVersions, coreSearch, coreSkills,];
    }
}
else if (__VLS_ctx.innerTab === 'releases') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel tab-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel-head" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "panel-help" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-help']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.openUpload) },
        type: "button",
        ...{ class: "btn primary sm" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "up" },
    });
    /** @type {__VLS_StyleScopedClasses['up']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-stats" },
        role: "group",
        'aria-label': "我的发布指标",
    });
    /** @type {__VLS_StyleScopedClasses['my-stats']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['my-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-k" },
    });
    /** @type {__VLS_StyleScopedClasses['my-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-v" },
    });
    /** @type {__VLS_StyleScopedClasses['my-v']} */ ;
    (__VLS_ctx.uiMyStats.maintained);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "my-div" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['my-div']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['my-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-k" },
    });
    /** @type {__VLS_StyleScopedClasses['my-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-v" },
    });
    /** @type {__VLS_StyleScopedClasses['my-v']} */ ;
    (__VLS_ctx.uiMyStats.reviewing);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "my-div" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['my-div']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['my-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-k" },
    });
    /** @type {__VLS_StyleScopedClasses['my-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-v" },
    });
    /** @type {__VLS_StyleScopedClasses['my-v']} */ ;
    (__VLS_ctx.uiMyStats.rejected);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "my-div" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['my-div']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['my-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-k" },
    });
    /** @type {__VLS_StyleScopedClasses['my-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-v" },
    });
    /** @type {__VLS_StyleScopedClasses['my-v']} */ ;
    (__VLS_ctx.uiMyStats.myTotalDownloads);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "my-div" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['my-div']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-cell" },
    });
    /** @type {__VLS_StyleScopedClasses['my-cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-k" },
    });
    /** @type {__VLS_StyleScopedClasses['my-k']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "my-v" },
    });
    /** @type {__VLS_StyleScopedClasses['my-v']} */ ;
    (__VLS_ctx.uiMyStats.my30DaysDownloads);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-toolbar" },
    });
    /** @type {__VLS_StyleScopedClasses['my-toolbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-filters" },
        role: "tablist",
        'aria-label': "我的发布筛选",
    });
    /** @type {__VLS_StyleScopedClasses['my-filters']} */ ;
    for (const [f] of __VLS_vFor((__VLS_ctx.releaseFilters))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    __VLS_ctx.releaseFilter = f.key;
                    // @ts-ignore
                    [openUpload, innerTab, uiMyStats, uiMyStats, uiMyStats, uiMyStats, uiMyStats, releaseFilters, releaseFilter,];
                } },
            key: (f.key),
            type: "button",
            ...{ class: "seg" },
            ...{ class: ({ on: __VLS_ctx.releaseFilter === f.key }) },
        });
        /** @type {__VLS_StyleScopedClasses['seg']} */ ;
        /** @type {__VLS_StyleScopedClasses['on']} */ ;
        (f.label);
        // @ts-ignore
        [releaseFilter,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.onUploadExistingVersion) },
        type: "button",
        ...{ class: "btn outline sm" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['outline']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-wrap my-table-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
    /** @type {__VLS_StyleScopedClasses['my-table-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "table my-table" },
    });
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['my-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "col-skill" },
    });
    /** @type {__VLS_StyleScopedClasses['col-skill']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "col-level" },
    });
    /** @type {__VLS_StyleScopedClasses['col-level']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "col-ver" },
    });
    /** @type {__VLS_StyleScopedClasses['col-ver']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "col-status" },
    });
    /** @type {__VLS_StyleScopedClasses['col-status']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "col-dl" },
    });
    /** @type {__VLS_StyleScopedClasses['col-dl']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "col-action" },
    });
    /** @type {__VLS_StyleScopedClasses['col-action']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "col-ops" },
    });
    /** @type {__VLS_StyleScopedClasses['col-ops']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [row] of __VLS_vFor((__VLS_ctx.filteredMyReleaseRows))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (row.skill.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "skill-main" },
        });
        /** @type {__VLS_StyleScopedClasses['skill-main']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
            ...{ class: "skill-name" },
        });
        /** @type {__VLS_StyleScopedClasses['skill-name']} */ ;
        (row.skill.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "skill-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['skill-sub']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (row.skill.publisher);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cell-main" },
        });
        /** @type {__VLS_StyleScopedClasses['cell-main']} */ ;
        (row.skill.level.split('·')[0]?.trim() || row.skill.level);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cell-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['cell-sub']} */ ;
        (row.skill.level);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cell-main" },
        });
        /** @type {__VLS_StyleScopedClasses['cell-main']} */ ;
        (row.skill.version);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cell-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['cell-sub']} */ ;
        (row.skill.latestPublishTime);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "st" },
            ...{ class: (`st-${row.statusKey}`) },
        });
        /** @type {__VLS_StyleScopedClasses['st']} */ ;
        (row.statusLabel);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "num" },
        });
        /** @type {__VLS_StyleScopedClasses['num']} */ ;
        (row.skill.downloads.toLocaleString('zh-CN'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "cell-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['cell-sub']} */ ;
        (row.lastAction);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops" },
        });
        /** @type {__VLS_StyleScopedClasses['ops']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    __VLS_ctx.toastAction('新版本（演示）：打开上传弹窗并追加版本');
                    // @ts-ignore
                    [onUploadExistingVersion, filteredMyReleaseRows, toastAction,];
                } },
            type: "button",
            ...{ class: "mini" },
        });
        /** @type {__VLS_StyleScopedClasses['mini']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    __VLS_ctx.toastAction('升级（演示）：提交层级升级申请');
                    // @ts-ignore
                    [toastAction,];
                } },
            type: "button",
            ...{ class: "mini" },
        });
        /** @type {__VLS_StyleScopedClasses['mini']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    __VLS_ctx.toastAction('转 CoreHarness（演示）：提交转换申请');
                    // @ts-ignore
                    [toastAction,];
                } },
            type: "button",
            ...{ class: "mini" },
        });
        /** @type {__VLS_StyleScopedClasses['mini']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    __VLS_ctx.toastAction('记录（演示）：打开操作记录面板');
                    // @ts-ignore
                    [toastAction,];
                } },
            type: "button",
            ...{ class: "mini" },
        });
        /** @type {__VLS_StyleScopedClasses['mini']} */ ;
        // @ts-ignore
        [];
    }
    if (__VLS_ctx.filteredMyReleaseRows.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: "7",
            ...{ class: "empty-row" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-row']} */ ;
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel tab-panel ops" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-dashboard-card" },
        'aria-label': "Skill 运营看板",
    });
    /** @type {__VLS_StyleScopedClasses['ops-dashboard-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "ops-dash-top" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-dash-top']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "ops-dash-title" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-dash-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-dash-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-dash-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "ops-dash-note" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-dash-note']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (__VLS_ctx.onOpsExcelFileChange) },
        ref: "opsExcelInputRef",
        ...{ class: "visually-hidden" },
        type: "file",
        accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        'aria-label': "选择运营看板 Excel 文件",
    });
    /** @type {__VLS_StyleScopedClasses['visually-hidden']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.triggerOpsExcelImport) },
        type: "button",
        ...{ class: "btn outline sm ops-import-btn" },
        disabled: (__VLS_ctx.opsImporting),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['outline']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-import-btn']} */ ;
    (__VLS_ctx.opsImporting ? '导入中…' : 'Excel 导入');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-grid" },
        role: "group",
        'aria-label': "运营看板指标",
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-label" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-value" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-value']} */ ;
    (__VLS_ctx.uiOpsKpi.totalSkills);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-desc']} */ ;
    (__VLS_ctx.uiOpsKpiDesc.totalSkills);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-label" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-value" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-value']} */ ;
    (__VLS_ctx.uiOpsKpi.activeSkills);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-desc']} */ ;
    (__VLS_ctx.uiOpsKpiDesc.activeSkills);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-label" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-value" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-value']} */ ;
    (__VLS_ctx.uiOpsKpi.personalSkills);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-desc']} */ ;
    (__VLS_ctx.uiOpsKpiDesc.personalSkills);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-label" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-value" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-value']} */ ;
    (__VLS_ctx.uiOpsKpi.totalDownloads);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpi-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpi-desc']} */ ;
    (__VLS_ctx.uiOpsKpiDesc.totalDownloads);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-mid-2col" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-mid-2col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-panel-block" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-panel-hd" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-hd']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "ops-panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "ops-panel-sub" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dept-tree-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['dept-tree-wrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dept-tree-head" },
    });
    /** @type {__VLS_StyleScopedClasses['dept-tree-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "dt-col-name" },
    });
    /** @type {__VLS_StyleScopedClasses['dt-col-name']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "dt-col-num" },
    });
    /** @type {__VLS_StyleScopedClasses['dt-col-num']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "dt-col-num" },
    });
    /** @type {__VLS_StyleScopedClasses['dt-col-num']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dept-tree-body" },
        role: "list",
    });
    /** @type {__VLS_StyleScopedClasses['dept-tree-body']} */ ;
    for (const [row] of __VLS_vFor((__VLS_ctx.uiDeptFlat))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (row.path),
            ...{ class: "dept-tree-row" },
            ...{ class: ({ child: row.depth > 0 }) },
            role: "listitem",
            ...{ style: ({ paddingLeft: `${12 + row.depth * 20}px` }) },
        });
        /** @type {__VLS_StyleScopedClasses['dept-tree-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['child']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "dt-name" },
        });
        /** @type {__VLS_StyleScopedClasses['dt-name']} */ ;
        if (row.hasChildren) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.innerTab === 'overview'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'core'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'releases'))
                            return;
                        if (!(row.hasChildren))
                            return;
                        __VLS_ctx.toggleDeptExpand(row.path);
                        // @ts-ignore
                        [filteredMyReleaseRows, onOpsExcelFileChange, triggerOpsExcelImport, opsImporting, opsImporting, uiOpsKpi, uiOpsKpi, uiOpsKpi, uiOpsKpi, uiOpsKpiDesc, uiOpsKpiDesc, uiOpsKpiDesc, uiOpsKpiDesc, uiDeptFlat, toggleDeptExpand,];
                    } },
                type: "button",
                ...{ class: "dt-toggle" },
                'aria-label': (row.expanded ? '收起' : '展开'),
            });
            /** @type {__VLS_StyleScopedClasses['dt-toggle']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "dt-caret" },
                ...{ class: ({ on: row.expanded }) },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['dt-caret']} */ ;
            /** @type {__VLS_StyleScopedClasses['on']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "dt-toggle-spacer" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['dt-toggle-spacer']} */ ;
        }
        if (row.depth > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "dt-bullet" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['dt-bullet']} */ ;
        }
        (row.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "dt-skills" },
        });
        /** @type {__VLS_StyleScopedClasses['dt-skills']} */ ;
        (row.skills);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "dt-dl" },
        });
        /** @type {__VLS_StyleScopedClasses['dt-dl']} */ ;
        (row.downloads);
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-panel-block" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-panel-hd ops-panel-hd-row" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-hd']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-panel-hd-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "ops-panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "ops-panel-sub" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-sub']} */ ;
    (__VLS_ctx.opsBarMode === 'skills'
        ? '按 Skill 数量倒序展示公司市场组织级 Skill'
        : '按下载量倒序展示公司市场组织级 Skill');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-toggle" },
        role: "group",
        'aria-label': "图表度量切换",
    });
    /** @type {__VLS_StyleScopedClasses['ops-toggle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.innerTab === 'overview'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'core'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'releases'))
                    return;
                __VLS_ctx.opsBarMode = 'skills';
                // @ts-ignore
                [opsBarMode, opsBarMode,];
            } },
        type: "button",
        ...{ class: "ops-toggle-btn" },
        ...{ class: ({ on: __VLS_ctx.opsBarMode === 'skills' }) },
    });
    /** @type {__VLS_StyleScopedClasses['ops-toggle-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.innerTab === 'overview'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'core'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'releases'))
                    return;
                __VLS_ctx.opsBarMode = 'downloads';
                // @ts-ignore
                [opsBarMode, opsBarMode,];
            } },
        type: "button",
        ...{ class: "ops-toggle-btn" },
        ...{ class: ({ on: __VLS_ctx.opsBarMode === 'downloads' }) },
    });
    /** @type {__VLS_StyleScopedClasses['ops-toggle-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "org-bar-list" },
        role: "list",
        'aria-label': "组织架构分布条形图",
    });
    /** @type {__VLS_StyleScopedClasses['org-bar-list']} */ ;
    for (const [row] of __VLS_vFor((__VLS_ctx.uiOrgBarsSorted.slice(0, 8)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (row.name),
            ...{ class: "org-bar-row" },
            role: "listitem",
        });
        /** @type {__VLS_StyleScopedClasses['org-bar-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "org-bar-label" },
            title: (row.name),
        });
        /** @type {__VLS_StyleScopedClasses['org-bar-label']} */ ;
        (__VLS_ctx.orgBarLabel(row.name));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "org-bar-track-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['org-bar-track-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "org-bar-track" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['org-bar-track']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "org-bar-fill" },
            ...{ style: ({
                    width: `${((__VLS_ctx.opsBarMode === 'skills' ? row.skills : row.downloads) /
                        __VLS_ctx.uiOrgBarsMax) *
                        100}%`,
                }) },
        });
        /** @type {__VLS_StyleScopedClasses['org-bar-fill']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "org-bar-val" },
        });
        /** @type {__VLS_StyleScopedClasses['org-bar-val']} */ ;
        (__VLS_ctx.opsBarMode === 'skills'
            ? `${row.skills}个`
            : `${row.downloads}下载`);
        // @ts-ignore
        [opsBarMode, opsBarMode, opsBarMode, uiOrgBarsSorted, orgBarLabel, uiOrgBarsMax,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-top-section" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-top-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-panel-hd" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-hd']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "ops-panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "ops-panel-sub" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "ops-top-list" },
        role: "list",
    });
    /** @type {__VLS_StyleScopedClasses['ops-top-list']} */ ;
    for (const [item] of __VLS_vFor((__VLS_ctx.uiTopSkillsByDl))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (`${item.rank}-${item.name}-${item.downloads}`),
            ...{ class: "ops-top-row" },
            role: "listitem",
        });
        /** @type {__VLS_StyleScopedClasses['ops-top-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ops-top-rank" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-top-rank']} */ ;
        (item.rank);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-top-main" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-top-main']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
            ...{ class: "ops-top-name" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-top-name']} */ ;
        (item.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ops-top-dept" },
            title: (item.dept),
        });
        /** @type {__VLS_StyleScopedClasses['ops-top-dept']} */ ;
        (__VLS_ctx.minDeptLabel(item.dept));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ops-top-dl" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-top-dl']} */ ;
        (item.downloads);
        // @ts-ignore
        [uiTopSkillsByDl, minDeptLabel,];
    }
}
const __VLS_29 = UploadSkillModal;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.uploadOpen),
}));
const __VLS_31 = __VLS_30({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.uploadOpen),
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
let __VLS_34;
const __VLS_35 = ({ submit: {} },
    { onSubmit: (__VLS_ctx.onUploadSubmit) });
var __VLS_32;
var __VLS_33;
let __VLS_36;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
    to: "body",
}));
const __VLS_38 = __VLS_37({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const { default: __VLS_41 } = __VLS_39.slots;
if (__VLS_ctx.versionPanelSkill) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeVersionPanel) },
        ...{ class: "overlay" },
        role: "presentation",
    });
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-dialog" },
        role: "dialog",
        'aria-modal': "true",
    });
    /** @type {__VLS_StyleScopedClasses['v-dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-head" },
    });
    /** @type {__VLS_StyleScopedClasses['v-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.versionPanelSkill.name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeVersionPanel) },
        type: "button",
        ...{ class: "close-x" },
        'aria-label': "关闭",
    });
    /** @type {__VLS_StyleScopedClasses['close-x']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "v-sub" },
    });
    /** @type {__VLS_StyleScopedClasses['v-sub']} */ ;
    (__VLS_ctx.versionPanelSkill.version);
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "v-list" },
    });
    /** @type {__VLS_StyleScopedClasses['v-list']} */ ;
    for (const [v] of __VLS_vFor(([...__VLS_ctx.versionPanelSkill.versions].reverse()))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (v.version + v.publishTime),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ver" },
        });
        /** @type {__VLS_StyleScopedClasses['ver']} */ ;
        (v.version);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "time" },
        });
        /** @type {__VLS_StyleScopedClasses['time']} */ ;
        (v.publishTime);
        if (v.note) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "note" },
            });
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
            (v.note);
        }
        // @ts-ignore
        [uploadOpen, onUploadSubmit, versionPanelSkill, versionPanelSkill, versionPanelSkill, versionPanelSkill, closeVersionPanel, closeVersionPanel,];
    }
}
// @ts-ignore
[];
var __VLS_39;
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
