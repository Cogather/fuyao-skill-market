import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SkillCard from '../../components/skill/SkillCard.vue';
import UploadSkillModal from '../../components/skill/UploadSkillModal.vue';
import { useSkillMarketStore } from '../../stores/skillMarketStore';
import { buildOpsDashboardBundle, parseOpsExcelBuffer } from '../../utils/opsExcelImport';
const store = useSkillMarketStore();
const { skills, totalDownloads, totalSkills, downloadsLast30Days, orgCount } = store;
const route = useRoute();
const router = useRouter();
const OVERVIEW_DEFAULT_VISIBLE_ROWS = 3;
const OVERVIEW_MAX_PAGE_SIZE = 48;
const innerTabAliases = {
    overview: 'overview',
    market: 'overview',
    '市场总览': 'overview',
    core: 'core',
    coreharness: 'core',
    releases: 'releases',
    publish: 'releases',
    '我的发布': 'releases',
    ops: 'ops',
    operation: 'ops',
    dashboard: 'ops',
    '运营看板': 'ops',
};
function routeTabFromQuery(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== 'string') {
        return 'overview';
    }
    return innerTabAliases[raw] ?? innerTabAliases[raw.toLowerCase()] ?? 'overview';
}
function overviewColumnCountByViewport() {
    if (typeof window === 'undefined') {
        return 3;
    }
    if (window.innerWidth >= 1920) {
        return 4;
    }
    if (window.innerWidth <= 760) {
        return 1;
    }
    if (window.innerWidth <= 1180) {
        return 2;
    }
    return 3;
}
function overviewPageSizeByLayout(columns, rows) {
    const safeColumns = Math.max(1, Math.floor(columns));
    const safeRows = Math.max(1, Math.floor(rows));
    return Math.min(OVERVIEW_MAX_PAGE_SIZE, safeColumns * safeRows);
}
function initialOverviewPageSize() {
    return overviewPageSizeByLayout(overviewColumnCountByViewport(), OVERVIEW_DEFAULT_VISIBLE_ROWS);
}
const innerTab = ref(routeTabFromQuery(route.query.tab));
const uploadOpen = ref(false);
const search = ref('');
const levelFilter = ref('all'); // publish_name（筛选组织）
const sceneFilter = ref('all'); // dept_name 层级（级联筛选：1~6）
const deptFilter = ref('all'); // 当前层级下的具体部门
const categoryFilter = ref('all');
const selectedTags = ref([]);
const quickFilter = ref('all');
const tabPanelRef = ref(null);
const tabPanelMinHeight = ref(0);
const marketContentRef = ref(null);
const overviewGridRef = ref(null);
const page = ref(1);
const pageSize = ref(initialOverviewPageSize());
const toast = ref('');
const versionPanelSkill = ref(null);
const detailPanelSkill = ref(null);
let overviewPageSizeFrame = 0;
function formatYmd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
const opsAsOfText = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatYmd(d);
});
function toListScope(filter) {
    return ['personal', 'devDept', 'pdu', 'productLine'].includes(filter)
        ? filter
        : 'all';
}
function deptSegments(raw) {
    return raw
        .split('/')
        .map((x) => x.trim())
        .filter(Boolean);
}
function deptAtLevel(skill, level) {
    const n = Number(level);
    if (!Number.isFinite(n) || n <= 0) {
        return '';
    }
    const segs = deptSegments(skill.dept_name ?? '');
    return segs[n - 1] ?? '';
}
function matchesScopeFilter(skill, scope) {
    if (scope === 'all') {
        return true;
    }
    if (scope === 'personal') {
        return ((skill.publish_level ?? skill.level ?? '').includes('个人') ||
            (skill.publish_name ?? skill.publisher ?? '').includes('个人') ||
            Boolean(skill.ownedByUser));
    }
    if (scope === 'devDept') {
        return (skill.publish_level ?? '').trim() === '组织级';
    }
    if (scope === 'pdu') {
        return (skill.publish_name ?? '').includes('PDU');
    }
    return (skill.publish_name ?? '').includes('产品线');
}
function matchesKeyword(skill, q) {
    if (!q) {
        return true;
    }
    return (skill.name ?? skill.skill_id ?? '').toLowerCase().includes(q);
}
function matchesOrgFilter(skill) {
    return levelFilter.value === 'all' || (skill.publish_name ?? '').trim() === levelFilter.value;
}
function skillCategory(skill) {
    return (skill.tagFunctional ?? '').trim();
}
function matchesCategoryFilter(skill) {
    return categoryFilter.value === 'all' || skillCategory(skill) === categoryFilter.value;
}
function skillTags(skill) {
    return (skill.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
}
function matchesSelectedTags(skill) {
    if (selectedTags.value.length === 0) {
        return true;
    }
    const tags = skillTags(skill);
    return selectedTags.value.every((tag) => tags.includes(tag));
}
function matchesDeptLevelFilter(skill) {
    if (sceneFilter.value === 'all') {
        return true;
    }
    return Boolean(deptAtLevel(skill, sceneFilter.value));
}
function matchesSpecificDeptFilter(skill) {
    return deptFilter.value === 'all' || deptAtLevel(skill, sceneFilter.value) === deptFilter.value;
}
function matchesPrimaryFilters(skill, q, scope) {
    return (matchesScopeFilter(skill, scope) &&
        matchesKeyword(skill, q) &&
        matchesOrgFilter(skill) &&
        matchesCategoryFilter(skill) &&
        matchesDeptLevelFilter(skill));
}
const orgOptions = computed(() => {
    const opts = new Set();
    for (const s of skills.value) {
        if ((s.publish_level ?? '').trim() !== '组织级') {
            continue;
        }
        const name = (s.publish_name ?? '').trim();
        if (name) {
            opts.add(name);
        }
    }
    return [...opts].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});
const categoryOptions = computed(() => {
    const opts = new Set();
    for (const s of skills.value) {
        const category = skillCategory(s);
        if (category) {
            opts.add(category);
        }
    }
    return [...opts].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});
const tagOptions = computed(() => {
    const q = search.value.trim().toLowerCase();
    const scope = toListScope(quickFilter.value);
    const opts = new Set();
    for (const s of skills.value) {
        if (!matchesPrimaryFilters(s, q, scope) || !matchesSpecificDeptFilter(s)) {
            continue;
        }
        for (const tag of skillTags(s)) {
            opts.add(tag);
        }
    }
    return [...opts].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});
const tabPanelFillStyle = computed(() => ({
    minHeight: tabPanelMinHeight.value > 0 ? `${tabPanelMinHeight.value}px` : undefined,
}));
function overviewGridColumnCount(grid) {
    const columns = window.getComputedStyle(grid).gridTemplateColumns;
    if (columns && columns !== 'none') {
        const count = columns.split(/\s+/).filter(Boolean).length;
        if (count > 0) {
            return count;
        }
    }
    return overviewColumnCountByViewport();
}
function syncOverviewPageSize() {
    void nextTick(() => {
        if (overviewPageSizeFrame) {
            window.cancelAnimationFrame(overviewPageSizeFrame);
        }
        overviewPageSizeFrame = window.requestAnimationFrame(() => {
            overviewPageSizeFrame = 0;
            if (innerTab.value !== 'overview') {
                return;
            }
            const content = marketContentRef.value;
            const grid = overviewGridRef.value;
            if (!content || !grid) {
                return;
            }
            const columns = overviewGridColumnCount(grid);
            const gridStyle = window.getComputedStyle(grid);
            const rowGap = Number.parseFloat(gridStyle.rowGap || gridStyle.gap) || 14;
            const firstCard = grid.firstElementChild;
            const measuredCardHeight = firstCard?.getBoundingClientRect().height ?? 0;
            const cardHeight = Math.max(1, measuredCardHeight || 136);
            const filters = content.querySelector('.filters');
            const filtersHeight = filters?.offsetHeight ?? 0;
            const filtersMarginBottom = filters
                ? Number.parseFloat(window.getComputedStyle(filters).marginBottom) || 0
                : 0;
            const pagerHeight = content.querySelector('.pager')?.offsetHeight ?? 0;
            const contentRect = content.getBoundingClientRect();
            const panel = tabPanelRef.value;
            const panelRect = panel?.getBoundingClientRect();
            const panelPaddingBottom = panel
                ? Number.parseFloat(window.getComputedStyle(panel).paddingBottom) || 0
                : 0;
            const plannedContentHeight = panelRect && tabPanelMinHeight.value > 0
                ? tabPanelMinHeight.value - (contentRect.top - panelRect.top) - panelPaddingBottom
                : content.clientHeight;
            const availableHeight = Math.max(cardHeight, plannedContentHeight - filtersHeight - filtersMarginBottom - pagerHeight);
            const rows = Math.max(OVERVIEW_DEFAULT_VISIBLE_ROWS, Math.floor((availableHeight + rowGap) / (cardHeight + rowGap)));
            const nextSize = overviewPageSizeByLayout(columns, rows);
            if (nextSize !== pageSize.value) {
                pageSize.value = nextSize;
            }
        });
    });
}
function syncTabPanelMinHeight() {
    void nextTick(() => {
        const panel = tabPanelRef.value;
        if (!panel) {
            return;
        }
        const bottomGutter = 32;
        const top = panel.getBoundingClientRect().top;
        tabPanelMinHeight.value = Math.max(360, Math.floor(window.innerHeight - top - bottomGutter));
        syncOverviewPageSize();
    });
}
function syncResponsiveLayout() {
    syncTabPanelMinHeight();
    syncOverviewPageSize();
}
onMounted(() => {
    syncResponsiveLayout();
    window.addEventListener('resize', syncResponsiveLayout);
});
onBeforeUnmount(() => {
    if (overviewPageSizeFrame) {
        window.cancelAnimationFrame(overviewPageSizeFrame);
    }
    window.removeEventListener('resize', syncResponsiveLayout);
});
const deptOptions = computed(() => {
    if (sceneFilter.value === 'all') {
        return [];
    }
    const q = search.value.trim().toLowerCase();
    const scope = toListScope(quickFilter.value);
    const opts = new Set();
    for (const s of skills.value) {
        if (!matchesPrimaryFilters(s, q, scope)) {
            continue;
        }
        const dept = deptAtLevel(s, sceneFilter.value);
        if (dept) {
            opts.add(dept);
        }
    }
    return [...opts].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});
const listResponse = computed(() => {
    const q = search.value.trim().toLowerCase();
    const scope = toListScope(quickFilter.value);
    let list = [...skills.value].filter((s) => matchesPrimaryFilters(s, q, scope));
    list = list.filter((s) => matchesSpecificDeptFilter(s) && matchesSelectedTags(s));
    if (quickFilter.value === 'highDl') {
        list.sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
    }
    else {
        list.sort((a, b) => (b.skill_id ?? '').localeCompare(a.skill_id ?? ''));
    }
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize.value));
    const safePage = Math.min(page.value, totalPages);
    const start = (safePage - 1) * pageSize.value;
    return {
        list: list.slice(start, start + pageSize.value),
        total,
        page: safePage,
        pageSize: pageSize.value,
        totalPages,
    };
});
const filteredSkills = computed(() => listResponse.value.list);
const myReleases = computed(() => skills.value.filter((skill) => skill.ownedByUser));
watch([search, quickFilter, levelFilter, sceneFilter, deptFilter, categoryFilter, selectedTags], () => {
    page.value = 1;
    syncOverviewPageSize();
});
watch(page, () => {
    syncOverviewPageSize();
});
watch(() => filteredSkills.value.length, () => {
    syncOverviewPageSize();
}, { flush: 'post' });
watch(() => listResponse.value.totalPages, (totalPages) => {
    if (page.value > totalPages) {
        page.value = totalPages;
    }
});
watch(() => skills.value.length, () => {
    syncOverviewPageSize();
});
watch(levelFilter, () => {
    deptFilter.value = 'all';
});
watch(sceneFilter, () => {
    deptFilter.value = 'all';
});
watch(deptOptions, (options) => {
    if (deptFilter.value !== 'all' && !options.includes(deptFilter.value)) {
        deptFilter.value = 'all';
    }
});
watch(tagOptions, (options) => {
    selectedTags.value = selectedTags.value.filter((tag) => options.includes(tag));
});
function toggleTagFilter(tag) {
    selectedTags.value = selectedTags.value.includes(tag)
        ? selectedTags.value.filter((item) => item !== tag)
        : [...selectedTags.value, tag];
}
function clearTagFilters() {
    selectedTags.value = [];
}
function openUpload() {
    uploadOpen.value = true;
}
function goTab(tab, replace = false) {
    innerTab.value = tab;
    const target = {
        name: 'skill-market',
        query: {
            ...route.query,
            tab,
        },
    };
    if (replace) {
        void router.replace(target);
    }
    else {
        void router.push(target);
    }
}
watch(() => route.query.tab, (tab) => {
    const nextTab = routeTabFromQuery(tab);
    if (nextTab !== innerTab.value) {
        innerTab.value = nextTab;
    }
});
watch(innerTab, () => {
    syncTabPanelMinHeight();
});
function showToast(message, ms = 3000) {
    toast.value = message;
    setTimeout(() => {
        toast.value = '';
    }, ms);
}
function skillKey(skill) {
    return skill.id ?? skill.skill_id;
}
function skillTitle(skill) {
    return skill.name ?? skill.skill_id;
}
function skillVersion(skill) {
    return skill.version ?? '1.0.0';
}
function skillAuthor(skill) {
    const raw = skill.owner_list?.trim();
    if (raw) {
        try {
            const owners = JSON.parse(raw);
            const owner = owners[0];
            if (owner?.lastName || owner?.Account) {
                return [owner.lastName, owner.Account].filter(Boolean).join(' ');
            }
        }
        catch {
            // owner_list can be a free-form string in imported Excel rows.
        }
    }
    return skill.publish_name ?? skill.publisher ?? '当前用户';
}
function skillScopeLabel(skill) {
    const level = (skill.publish_level ?? skill.level ?? skill.tagOrg ?? '').trim();
    if (level.includes('组织')) {
        return skill.publish_name ? `组织级 · ${skill.publish_name}` : '组织级';
    }
    if (level.includes('个人')) {
        return '个人级';
    }
    return level || '-';
}
function skillScopeClass(skill) {
    return skillScopeLabel(skill).includes('组织') ? 'scope-org' : 'scope-personal';
}
function skillDownloadCount(skill) {
    return (skill.download_count ?? skill.downloads ?? 0).toLocaleString('zh-CN');
}
function detailRows(skill) {
    return [
        { label: 'author', value: skillAuthor(skill) },
        { label: 'version', value: skillVersion(skill) },
        { label: 'category', value: skill.tagFunctional ?? '-' },
        { label: 'publish_level', value: skill.publish_level ?? skill.level ?? '-' },
        { label: 'publish_name', value: skill.publish_name ?? skill.publisher ?? '-' },
        { label: 'dept_name', value: skill.dept_name || '-' },
    ];
}
function detailFileTree(skill) {
    const root = skillTitle(skill);
    return `${root}/
├─ SKILL.md
├─ skill.yaml
├─ README.md
├─ prompts/
│  ├─ system.md
│  └─ examples.md
├─ scripts/
│  └─ main.py
├─ assets/
│  └─ config.example.json
└─ tests/
   └─ sample_input.json`;
}
function skillRequirements(skill) {
    return skillScopeLabel(skill).includes('组织') ? '需要组织内权限、Python 3.10+' : '本地运行环境、Python 3.10+';
}
function skillTagSummary(skill) {
    const deptParts = deptSegments(skill.dept_name ?? '');
    return [skill.tagFunctional, skill.skill_id, deptParts[deptParts.length - 1]]
        .filter(Boolean)
        .join(' ');
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
        showToast(`已下载当前版本：${skillTitle(result.skill)} v${skillVersion(result.skill)}`);
    }
    catch (e) {
        showToast(e instanceof Error ? e.message : '下载失败');
    }
}
function onViewVersions(id) {
    const skill = skills.value.find((item) => skillKey(item) === id);
    if (skill) {
        versionPanelSkill.value = skill;
    }
}
function openDetailPanel(id) {
    const skill = skills.value.find((item) => skillKey(item) === id);
    if (skill) {
        detailPanelSkill.value = skill;
    }
}
function closeDetailPanel() {
    detailPanelSkill.value = null;
}
function onDetailDownload() {
    if (!detailPanelSkill.value) {
        return;
    }
    onDownload(skillKey(detailPanelSkill.value));
}
function onTrySkill() {
    if (!detailPanelSkill.value) {
        return;
    }
    showToast(`已进入在线试用（演示）：${skillTitle(detailPanelSkill.value)}`);
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
        list = list.filter((s) => (s.name ?? s.skill_id ?? '').toLowerCase().includes(q) ||
            (s.publisher ?? s.publish_name ?? '').toLowerCase().includes(q) ||
            (s.tagOrg ?? s.dept_name ?? '').toLowerCase().includes(q) ||
            (s.tagFunctional ?? '').toLowerCase().includes(q) ||
            (s.description ?? '').toLowerCase().includes(q));
    }
    if (coreQuick.value === 'devDept') {
        list = list.filter((s) => (s.publish_level ?? '').trim() === '组织级');
    }
    if (coreQuick.value === 'pdu') {
        list = list.filter((s) => (s.publish_name ?? '').includes('PDU'));
    }
    if (coreQuick.value === 'productLine') {
        list = list.filter((s) => (s.publish_name ?? '').includes('产品线'));
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
    { key: 'personal', label: '个人级' },
    { key: 'published', label: '组织级' },
    { key: 'reviewing', label: '组织审核中' },
    { key: 'rejected', label: '组织已驳回' },
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
        return '组织级';
    }
    if (st === 'reviewing-dev') {
        return '组织审核中';
    }
    return '组织已驳回';
}
function lastActionText(st) {
    if (st === 'published') {
        return '已同步至公司组织';
    }
    if (st === 'reviewing-dev') {
        return '等待目标组织管理员审核';
    }
    return '需补充复现数据和说明文档';
}
function releasePrimaryLevel(skill) {
    if ((skill.publish_level ?? skill.level ?? '').includes('个人')) {
        return '个人级';
    }
    return '组织级';
}
function releaseOrgLabel(skill) {
    if ((skill.publish_level ?? skill.level ?? '').includes('个人')) {
        return '个人空间';
    }
    return skill.publish_name ?? skill.level ?? '';
}
const myReleaseRows = computed(() => {
    const list = myReleases.value.length > 0 ? myReleases.value : skills.value.slice(0, 4);
    return list.map((s) => {
        const st = statusOf(s);
        const isPersonal = (s.publish_level ?? s.level ?? '').includes('个人') || (s.dept_name ?? s.tagOrg ?? '').includes('个人');
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
const opsImportedBundle = ref(null);
const opsImporting = ref(false);
const opsExcelInputRef = ref(null);
const uiOpsKpiDesc = {
    totalSkills: '部门 Skill 分布总量',
    activeSkills: '公司市场组织级 Skill 数量',
    personalSkills: '个人发布的 Skill 数量',
    totalDownloads: '部门维度累计下载 Skill 数量',
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
function collectDeptMetricRows(nodes, parentPath = '', out = []) {
    for (const node of nodes) {
        const path = parentPath ? `${parentPath}/${node.name}` : node.name;
        out.push({
            name: path,
            label: node.name,
            parent: parentPath,
            skills: node.skills,
            downloads: node.downloads,
        });
        if (node.children && node.children.length > 0) {
            collectDeptMetricRows(node.children, path, out);
        }
    }
    return out;
}
function buildDefaultOpsKpi(nodes) {
    const totalSkills = nodes.reduce((sum, node) => sum + node.skills, 0);
    const totalDownloads = nodes.reduce((sum, node) => sum + node.downloads, 0);
    return {
        totalSkills: String(totalSkills),
        activeSkills: String(totalSkills),
        personalSkills: '0',
        totalDownloads: String(totalDownloads),
    };
}
function buildDefaultOrgBars(nodes) {
    return collectDeptMetricRows(nodes).map(({ name, skills, downloads }) => ({
        name,
        skills,
        downloads,
    }));
}
function buildDefaultTopDeptRows(nodes) {
    return collectDeptMetricRows(nodes)
        .sort((a, b) => b.downloads - a.downloads || b.skills - a.skills)
        .slice(0, 6)
        .map((row, index) => ({
        rank: index + 1,
        name: row.label,
        dept: row.parent || row.name,
        downloads: row.downloads,
    }));
}
const defaultOpsKpi = buildDefaultOpsKpi(defaultUiDeptTree);
const defaultUiOrgBars = buildDefaultOrgBars(defaultUiDeptTree);
const defaultUiTopDeptRows = buildDefaultTopDeptRows(defaultUiDeptTree);
const opsBarMode = ref('skills');
const opsBoardSystem = ref('company');
const uiDeptTree = computed(() => opsImportedBundle.value ? opsImportedBundle.value.deptTree : defaultUiDeptTree);
const uiOpsKpi = computed(() => opsImportedBundle.value ? opsImportedBundle.value.kpi : defaultOpsKpi);
const uiOrgBars = computed(() => opsImportedBundle.value ? opsImportedBundle.value.orgBars : defaultUiOrgBars);
const uiOrgBarsSorted = computed(() => {
    const list = [...uiOrgBars.value];
    if (opsBarMode.value === 'skills') {
        return list.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads);
    }
    return list.sort((a, b) => b.downloads - a.downloads || b.skills - a.skills);
});
const visibleOrgBars = computed(() => uiOrgBarsSorted.value.slice(0, 8));
function orgBarLabel(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        return '';
    }
    const parts = trimmed.split('/');
    return parts[parts.length - 1]?.trim() || trimmed;
}
function estimateOrgBarLabelWidth(label) {
    let width = 0;
    for (const char of label) {
        width += /[\u0000-\u00ff]/.test(char) ? 7 : 13;
    }
    return Math.ceil(width + 8);
}
const orgBarLabelColumnWidth = computed(() => {
    const widths = visibleOrgBars.value.map((row) => estimateOrgBarLabelWidth(orgBarLabel(row.name)));
    const contentWidth = Math.max(0, ...widths);
    return Math.min(180, Math.max(78, contentWidth));
});
function minDeptLabel(name) {
    return orgBarLabel(name);
}
const uiOrgBarsMax = computed(() => {
    const list = uiOrgBarsSorted.value.map((x) => opsBarMode.value === 'skills' ? x.skills : x.downloads);
    return Math.max(1, ...list);
});
const uiTopSkillsByDl = computed(() => opsImportedBundle.value
    ? opsImportedBundle.value.topSkills
    : defaultUiTopDeptRows);
const opsTopTitle = computed(() => opsImportedBundle.value ? 'TOP Skill（按下载量）' : 'TOP 部门（按下载量）');
const opsTopSubTitle = computed(() => opsImportedBundle.value
    ? '展示当前查询范围内下载量最高的Skill'
    : '展示默认部门树中下载量最高的部门节点');
const expandedDeptPaths = ref(new Set());
function collectExpandableDeptPaths(nodes, parentPath = '', out = new Set()) {
    for (const n of nodes) {
        const path = parentPath ? `${parentPath}/${n.name}` : n.name;
        if (n.children && n.children.length > 0) {
            out.add(path);
            collectExpandableDeptPaths(n.children, path, out);
        }
    }
    return out;
}
watch(uiDeptTree, (tree) => {
    expandedDeptPaths.value = collectExpandableDeptPaths(tree);
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
function buildOpsDeptTreeJsonFileName(sourceName) {
    const baseName = sourceName.replace(/\.[^.]+$/, '').trim() || 'ops-dept-tree';
    return `${baseName}-dept-tree.json`;
}
function downloadOpsDeptTreeJson(sourceName, deptTree) {
    const json = JSON.stringify(deptTree, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildOpsDeptTreeJsonFileName(sourceName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
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
        const bundle = buildOpsDashboardBundle(rows);
        opsImportedBundle.value = bundle;
        downloadOpsDeptTreeJson(file.name, bundle.deptTree);
        showToast(`已导入 ${rows.length} 条 Skill，运营看板已更新，部门树 JSON 已下载`);
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
/** @type {__VLS_StyleScopedClasses['ops-system-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-system-btn']} */ ;
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
/** @type {__VLS_StyleScopedClasses['active']} */ ;
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
/** @type {__VLS_StyleScopedClasses['detail-head']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-close']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-download']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-file-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-md-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-md-body']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-md-body']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-md-body']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-md-body']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta-table']} */ ;
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
/** @type {__VLS_StyleScopedClasses['skill-detail-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-main']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-foot']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-main']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-k']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-k']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-v']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-v']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-div']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-div']} */ ;
/** @type {__VLS_StyleScopedClasses['side-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['side-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-clear']} */ ;
/** @type {__VLS_StyleScopedClasses['side-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['side-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['market-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
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
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['cascade-selects']} */ ;
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['cascade-selects']} */ ;
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['title']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dl-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['pager']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['seg']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['seg']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['skill-name']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['cell-main']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['skill-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['cell-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['st']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['st-published']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['st-reviewing-dev']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['st-rejected-pdu']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['cascade-selects']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['market-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['market-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['cascade-selects']} */ ;
/** @type {__VLS_StyleScopedClasses['cascade-arrow']} */ ;
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
if (__VLS_ctx.detailPanelSkill) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeDetailPanel) },
        ...{ class: "overlay detail-overlay" },
        role: "presentation",
    });
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    /** @type {__VLS_StyleScopedClasses['detail-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "skill-detail-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "skill-detail-title",
    });
    /** @type {__VLS_StyleScopedClasses['skill-detail-dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "detail-head" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        id: "skill-detail-title",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeDetailPanel) },
        type: "button",
        ...{ class: "detail-close" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-close']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-toolbar" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-toolbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-tags" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-tags']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "detail-pill pill-category" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
    /** @type {__VLS_StyleScopedClasses['pill-category']} */ ;
    (__VLS_ctx.detailPanelSkill.tagFunctional);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "detail-pill pill-id" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
    /** @type {__VLS_StyleScopedClasses['pill-id']} */ ;
    (__VLS_ctx.detailPanelSkill.skill_id);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "detail-pill" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
    (__VLS_ctx.skillVersion(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "detail-pill" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
    (__VLS_ctx.skillAuthor(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "detail-pill" },
        ...{ class: (__VLS_ctx.skillScopeClass(__VLS_ctx.detailPanelSkill)) },
    });
    /** @type {__VLS_StyleScopedClasses['detail-pill']} */ ;
    (__VLS_ctx.skillScopeLabel(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "detail-download" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-download']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        viewBox: "0 0 24 24",
        fill: "none",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M12 4v12m0 0 4-4m-4 4-4-4M5 20h14",
        stroke: "currentColor",
        'stroke-width': "1.8",
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
    });
    (__VLS_ctx.skillDownloadCount(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.onTrySkill) },
        type: "button",
        ...{ class: "detail-btn ghost" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.onDetailDownload) },
        type: "button",
        ...{ class: "detail-btn primary" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-main" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-main']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
        ...{ class: "detail-file-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-file-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.pre, __VLS_intrinsics.pre)({});
    (__VLS_ctx.detailFileTree(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
        ...{ class: "detail-md-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-md-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-md-body" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-md-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.skillTitle(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.detailPanelSkill.description || '暂无描述。');
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "detail-meta-table" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-meta-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [row] of __VLS_vFor((__VLS_ctx.detailRows(__VLS_ctx.detailPanelSkill)))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (row.label),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (row.label);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.value);
        // @ts-ignore
        [uploadOpen, onUploadSubmit, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, closeDetailPanel, closeDetailPanel, skillVersion, skillAuthor, skillScopeClass, skillScopeLabel, skillDownloadCount, onTrySkill, onDetailDownload, detailFileTree, skillTitle, detailRows,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.skillRequirements(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
    (__VLS_ctx.skillTagSummary(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.detailPanelSkill.tagFunctional || '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.skillScopeLabel(__VLS_ctx.detailPanelSkill));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.detailPanelSkill.dept_name || '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
        ...{ class: "detail-foot" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-foot']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeDetailPanel) },
        type: "button",
        ...{ class: "detail-btn ghost" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.onDetailDownload) },
        type: "button",
        ...{ class: "detail-btn primary" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
}
// @ts-ignore
[detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, closeDetailPanel, skillScopeLabel, onDetailDownload, skillRequirements, skillTagSummary,];
var __VLS_10;
let __VLS_13;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
    to: "body",
}));
const __VLS_15 = __VLS_14({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
const { default: __VLS_18 } = __VLS_16.slots;
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
    (__VLS_ctx.versionPanelSkill.name ?? __VLS_ctx.versionPanelSkill.skill_id);
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
    (__VLS_ctx.versionPanelSkill.version ?? '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "v-list" },
    });
    /** @type {__VLS_StyleScopedClasses['v-list']} */ ;
    for (const [version] of __VLS_vFor(([...(__VLS_ctx.versionPanelSkill.versions ?? [])].reverse()))) {
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
        [versionPanelSkill, versionPanelSkill, versionPanelSkill, versionPanelSkill, versionPanelSkill, closeVersionPanel, closeVersionPanel,];
    }
}
// @ts-ignore
[];
var __VLS_16;
if (__VLS_ctx.toast) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toast" },
        role: "status",
    });
    /** @type {__VLS_StyleScopedClasses['toast']} */ ;
    (__VLS_ctx.toast);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-shell skill-market-shell" },
});
/** @type {__VLS_StyleScopedClasses['user-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['skill-market-shell']} */ ;
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
if (false) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(false))
                    return;
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
}
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
        ref: "tabPanelRef",
        ...{ class: "panel tab-panel overview-panel" },
        ...{ style: (__VLS_ctx.tabPanelFillStyle) },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
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
        ...{ class: "market-layout" },
    });
    /** @type {__VLS_StyleScopedClasses['market-layout']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
        ...{ class: "market-sidebar" },
        'aria-label': "市场筛选",
    });
    /** @type {__VLS_StyleScopedClasses['market-sidebar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "side-nav" },
    });
    /** @type {__VLS_StyleScopedClasses['side-nav']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.innerTab === 'overview'))
                    return;
                __VLS_ctx.quickFilter = 'all';
                // @ts-ignore
                [innerTab, innerTab, tabPanelFillStyle, totalSkills, totalDownloads, downloadsLast30Days, orgCount, quickFilter,];
            } },
        type: "button",
        ...{ class: "side-nav-item" },
        ...{ class: ({ active: __VLS_ctx.quickFilter === 'all' }) },
    });
    /** @type {__VLS_StyleScopedClasses['side-nav-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "side-nav-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['side-nav-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.innerTab === 'overview'))
                    return;
                __VLS_ctx.quickFilter = 'personal';
                // @ts-ignore
                [quickFilter, quickFilter,];
            } },
        type: "button",
        ...{ class: "side-nav-item" },
        ...{ class: ({ active: __VLS_ctx.quickFilter === 'personal' }) },
    });
    /** @type {__VLS_StyleScopedClasses['side-nav-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "side-nav-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['side-nav-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.innerTab === 'overview'))
                    return;
                __VLS_ctx.quickFilter = 'devDept';
                // @ts-ignore
                [quickFilter, quickFilter,];
            } },
        type: "button",
        ...{ class: "side-nav-item" },
        ...{ class: ({ active: __VLS_ctx.quickFilter === 'devDept' }) },
    });
    /** @type {__VLS_StyleScopedClasses['side-nav-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "side-nav-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['side-nav-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "side-block" },
    });
    /** @type {__VLS_StyleScopedClasses['side-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "side-title" },
    });
    /** @type {__VLS_StyleScopedClasses['side-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "side-help" },
    });
    /** @type {__VLS_StyleScopedClasses['side-help']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "side-tags" },
    });
    /** @type {__VLS_StyleScopedClasses['side-tags']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.innerTab === 'overview'))
                    return;
                __VLS_ctx.categoryFilter = 'all';
                // @ts-ignore
                [quickFilter, categoryFilter,];
            } },
        type: "button",
        ...{ class: "side-tag" },
        ...{ class: ({ active: __VLS_ctx.categoryFilter === 'all' }) },
    });
    /** @type {__VLS_StyleScopedClasses['side-tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    for (const [category] of __VLS_vFor((__VLS_ctx.categoryOptions))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    __VLS_ctx.categoryFilter = category;
                    // @ts-ignore
                    [categoryFilter, categoryFilter, categoryOptions,];
                } },
            key: (category),
            type: "button",
            ...{ class: "side-tag" },
            ...{ class: ({ active: __VLS_ctx.categoryFilter === category }) },
        });
        /** @type {__VLS_StyleScopedClasses['side-tag']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (category);
        // @ts-ignore
        [categoryFilter,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "side-block" },
    });
    /** @type {__VLS_StyleScopedClasses['side-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "side-title tag-title" },
    });
    /** @type {__VLS_StyleScopedClasses['side-title']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "side-help" },
    });
    /** @type {__VLS_StyleScopedClasses['side-help']} */ ;
    if (__VLS_ctx.selectedTags.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.clearTagFilters) },
            type: "button",
            ...{ class: "tag-clear" },
        });
        /** @type {__VLS_StyleScopedClasses['tag-clear']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "side-tags" },
    });
    /** @type {__VLS_StyleScopedClasses['side-tags']} */ ;
    for (const [tag] of __VLS_vFor((__VLS_ctx.tagOptions))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    __VLS_ctx.toggleTagFilter(tag);
                    // @ts-ignore
                    [selectedTags, clearTagFilters, tagOptions, toggleTagFilter,];
                } },
            key: (tag),
            type: "button",
            ...{ class: "side-tag" },
            ...{ class: ({ active: __VLS_ctx.selectedTags.includes(tag) }) },
        });
        /** @type {__VLS_StyleScopedClasses['side-tag']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (tag);
        // @ts-ignore
        [selectedTags,];
    }
    if (__VLS_ctx.tagOptions.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "side-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['side-empty']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "marketContentRef",
        ...{ class: "market-content" },
    });
    /** @type {__VLS_StyleScopedClasses['market-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filters" },
    });
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "search" },
        type: "search",
        placeholder: "搜索 Skill 名称",
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
    for (const [org] of __VLS_vFor((__VLS_ctx.orgOptions))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (org),
            value: (org),
        });
        (org);
        // @ts-ignore
        [tagOptions, search, levelFilter, orgOptions,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cascade-selects" },
        'aria-label': "部门级联筛选",
    });
    /** @type {__VLS_StyleScopedClasses['cascade-selects']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_ctx.sceneFilter),
        ...{ class: "select cascade-level" },
    });
    /** @type {__VLS_StyleScopedClasses['select']} */ ;
    /** @type {__VLS_StyleScopedClasses['cascade-level']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "all",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "1",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "3",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "4",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "5",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "6",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cascade-arrow" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['cascade-arrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_ctx.deptFilter),
        ...{ class: "select cascade-dept" },
        disabled: (__VLS_ctx.sceneFilter === 'all' || __VLS_ctx.deptOptions.length === 0),
    });
    /** @type {__VLS_StyleScopedClasses['select']} */ ;
    /** @type {__VLS_StyleScopedClasses['cascade-dept']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "all",
    });
    (__VLS_ctx.sceneFilter === 'all' ? '先选择部门层级' : '选择具体部门');
    for (const [d] of __VLS_vFor((__VLS_ctx.deptOptions))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (d),
            value: (d),
        });
        (d);
        // @ts-ignore
        [sceneFilter, sceneFilter, sceneFilter, deptFilter, deptOptions, deptOptions,];
    }
    if (__VLS_ctx.filteredSkills.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "overviewGridRef",
            ...{ class: "grid" },
        });
        /** @type {__VLS_StyleScopedClasses['grid']} */ ;
        for (const [s] of __VLS_vFor((__VLS_ctx.filteredSkills))) {
            const __VLS_19 = SkillCard;
            // @ts-ignore
            const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
                ...{ 'onDownload': {} },
                ...{ 'onOpenDetail': {} },
                ...{ 'onViewVersions': {} },
                key: (s.id ?? s.skill_id),
                ...{ class: "market-skill-card" },
                skill: (s),
                menuMode: "download-only",
            }));
            const __VLS_21 = __VLS_20({
                ...{ 'onDownload': {} },
                ...{ 'onOpenDetail': {} },
                ...{ 'onViewVersions': {} },
                key: (s.id ?? s.skill_id),
                ...{ class: "market-skill-card" },
                skill: (s),
                menuMode: "download-only",
            }, ...__VLS_functionalComponentArgsRest(__VLS_20));
            let __VLS_24;
            const __VLS_25 = ({ download: {} },
                { onDownload: (__VLS_ctx.onDownload) });
            const __VLS_26 = ({ openDetail: {} },
                { onOpenDetail: (__VLS_ctx.openDetailPanel) });
            const __VLS_27 = ({ viewVersions: {} },
                { onViewVersions: (__VLS_ctx.onViewVersions) });
            /** @type {__VLS_StyleScopedClasses['market-skill-card']} */ ;
            var __VLS_22;
            var __VLS_23;
            // @ts-ignore
            [filteredSkills, filteredSkills, onDownload, openDetailPanel, onViewVersions,];
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
        const __VLS_28 = SkillCard;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
            ...{ 'onDownload': {} },
            ...{ 'onViewVersions': {} },
            key: (s.id),
            skill: (s),
            variant: "coreHarness",
            menuMode: "full",
        }));
        const __VLS_30 = __VLS_29({
            ...{ 'onDownload': {} },
            ...{ 'onViewVersions': {} },
            key: (s.id),
            skill: (s),
            variant: "coreHarness",
            menuMode: "full",
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        let __VLS_33;
        const __VLS_34 = ({ download: {} },
            { onDownload: (__VLS_ctx.onDownload) });
        const __VLS_35 = ({ viewVersions: {} },
            { onViewVersions: (__VLS_ctx.onViewVersions) });
        var __VLS_31;
        var __VLS_32;
        // @ts-ignore
        [onDownload, onViewVersions, coreSearch, coreSkills,];
    }
}
else if (__VLS_ctx.innerTab === 'releases') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "tabPanelRef",
        ...{ class: "panel tab-panel my-release-panel" },
        ...{ style: (__VLS_ctx.tabPanelFillStyle) },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
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
                    [innerTab, tabPanelFillStyle, uiMyStats, uiMyStats, uiMyStats, uiMyStats, releaseFilters, releaseFilter,];
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
        (__VLS_ctx.releasePrimaryLevel(row.skill));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cell-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['cell-sub']} */ ;
        (__VLS_ctx.releaseOrgLabel(row.skill));
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
        ((row.skill.download_count ?? row.skill.downloads ?? 0).toLocaleString('zh-CN'));
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
                    [onUploadExistingVersion, filteredMyReleaseRows, releasePrimaryLevel, releaseOrgLabel, toastAction,];
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-dash-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-dash-heading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "ops-dash-title" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-dash-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "ops-dash-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-dash-desc']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-dash-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-dash-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-toggle ops-system-toggle" },
        role: "tablist",
        'aria-label': "运营看板系统切换",
    });
    /** @type {__VLS_StyleScopedClasses['ops-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-system-toggle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.innerTab === 'overview'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'core'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'releases'))
                    return;
                __VLS_ctx.opsBoardSystem = 'fuyao';
                // @ts-ignore
                [filteredMyReleaseRows, opsBoardSystem,];
            } },
        type: "button",
        ...{ class: "ops-system-btn" },
        'data-system': "fuyao",
        role: "tab",
        ...{ class: ({ active: __VLS_ctx.opsBoardSystem === 'fuyao' }) },
        'aria-selected': (__VLS_ctx.opsBoardSystem === 'fuyao'),
    });
    /** @type {__VLS_StyleScopedClasses['ops-system-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.innerTab === 'overview'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'core'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'releases'))
                    return;
                __VLS_ctx.opsBoardSystem = 'company';
                // @ts-ignore
                [opsBoardSystem, opsBoardSystem, opsBoardSystem,];
            } },
        type: "button",
        ...{ class: "ops-system-btn" },
        'data-system': "company",
        role: "tab",
        ...{ class: ({ active: __VLS_ctx.opsBoardSystem === 'company' }) },
        'aria-selected': (__VLS_ctx.opsBoardSystem === 'company'),
    });
    /** @type {__VLS_StyleScopedClasses['ops-system-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "ops-dash-note" },
        title: (`统计至：${__VLS_ctx.opsAsOfText}`),
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
                        [opsBoardSystem, opsBoardSystem, opsAsOfText, onOpsExcelFileChange, triggerOpsExcelImport, opsImporting, opsImporting, uiOpsKpi, uiOpsKpi, uiOpsKpi, uiOpsKpi, uiOpsKpiDesc, uiOpsKpiDesc, uiOpsKpiDesc, uiOpsKpiDesc, uiDeptFlat, toggleDeptExpand,];
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
        ...{ style: ({ '--org-bar-label-width': `${__VLS_ctx.orgBarLabelColumnWidth}px` }) },
    });
    /** @type {__VLS_StyleScopedClasses['org-bar-list']} */ ;
    for (const [row] of __VLS_vFor((__VLS_ctx.visibleOrgBars))) {
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
        [opsBarMode, opsBarMode, opsBarMode, orgBarLabelColumnWidth, visibleOrgBars, orgBarLabel, uiOrgBarsMax,];
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
    (__VLS_ctx.opsTopTitle);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "ops-panel-sub" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-panel-sub']} */ ;
    (__VLS_ctx.opsTopSubTitle);
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
        [opsTopTitle, opsTopSubTitle, uiTopSkillsByDl, minDeptLabel,];
    }
}
const __VLS_36 = UploadSkillModal;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.uploadOpen),
}));
const __VLS_38 = __VLS_37({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.uploadOpen),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_41;
const __VLS_42 = ({ submit: {} },
    { onSubmit: (__VLS_ctx.onUploadSubmit) });
var __VLS_39;
var __VLS_40;
let __VLS_43;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
    to: "body",
}));
const __VLS_45 = __VLS_44({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
const { default: __VLS_48 } = __VLS_46.slots;
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
    (__VLS_ctx.versionPanelSkill.name ?? __VLS_ctx.versionPanelSkill.skill_id);
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
    (__VLS_ctx.versionPanelSkill.version ?? '-');
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "v-list" },
    });
    /** @type {__VLS_StyleScopedClasses['v-list']} */ ;
    for (const [v] of __VLS_vFor(([...(__VLS_ctx.versionPanelSkill.versions ?? [])].reverse()))) {
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
        [uploadOpen, onUploadSubmit, versionPanelSkill, versionPanelSkill, versionPanelSkill, versionPanelSkill, versionPanelSkill, closeVersionPanel, closeVersionPanel,];
    }
}
// @ts-ignore
[];
var __VLS_46;
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
