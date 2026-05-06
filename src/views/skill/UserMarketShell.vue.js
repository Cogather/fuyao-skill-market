import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SkillCard from '../../components/skill/SkillCard.vue';
import UploadSkillModal from '../../components/skill/UploadSkillModal.vue';
import { useSkillMarketStore } from '../../stores/skillMarketStore';
import { apiRecordToSkill, skillListQueryToDto } from '../../services/skillMarket/mappers';
import { mapDepartmentTreeDtoToForest } from '../../services/skillMarket/marketDeptTreeFromApi';
import { marketRoleCanCreateOrganization, marketRoleShowsOpsAndReview, marketRoleShowsOrgManagement, } from '../../services/skillMarket/roleUi';
import { emptyOpsDashboardBundle } from '../../services/skillMarket/mock/opsDashboardUiDefaults';
import { parseDeptNamePath, } from '../../utils/opsExcelImport';
import { buildOpsDashboardBundle, parseOpsExcelBuffer } from '../../utils/opsExcelImport';
const store = useSkillMarketStore();
const { skills, myPublishedSkills, refreshMyPublishedSkills, totalDownloads, totalSkills, downloadsLast30Days, orgCount, marketClient, currentUserRole, } = store;
const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const route = useRoute();
const router = useRouter();
const OVERVIEW_DEFAULT_VISIBLE_ROWS = 3;
const OVERVIEW_MAX_PAGE_SIZE = 48;
/** 标签数超过该值时默认折叠，可点「展开」拉高显示 */
const OVERVIEW_TAGS_COLLAPSE_THRESHOLD = 10;
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
    org: 'org',
    '组织管理': 'org',
    organization: 'org',
    approval: 'approval',
    '审核中心': 'approval',
    review: 'approval',
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
/** Mock：组织展示名；HTTP：组织 id 字符串（对接 `orgId`） */
const levelFilter = ref('all');
/** 市场部门级联：路径各段对应 `departmentL1`～`departmentL6`（与设计文档 §3.3.3 一致，多字段 AND） */
const overviewMarketDeptSegments = ref([]);
const overviewDeptCascaderOpen = ref(false);
const marketDeptCascaderWrapRef = ref(null);
const marketDeptCascaderPanelRef = ref(null);
/** 级联面板挂到 body + fixed，按触发器靠左且不超出视口，避免撑开页面滚动容器 */
const marketDeptPanelLayout = ref(null);
let deptPanelScrollCleanup = null;
const categoryFilter = ref('all');
const selectedTags = ref([]);
const quickFilter = ref('all');
/** 市场总览左侧标签区：标签过多时由用户展开 */
const overviewTagListExpanded = ref(false);
const tabPanelRef = ref(null);
const tabPanelMinHeight = ref(0);
const marketContentRef = ref(null);
const overviewGridRef = ref(null);
/** Mock / 本地全量筛选后，渐进展示的条数 */
const overviewVisibleCount = ref(initialOverviewPageSize());
/** HTTP：分页累加的原始列表（再经与 Mock 一致的筛选/排序） */
const overviewRemoteItems = ref([]);
const overviewRemoteTotal = ref(0);
const overviewRemoteNextPage = ref(1);
const overviewRemoteExhausted = ref(false);
const overviewRemoteLoading = ref(false);
let overviewRemoteFetchSeq = 0;
let overviewScrollRaf = 0;
let overviewLastScrollTriggerMs = 0;
const pageSize = ref(initialOverviewPageSize());
const toast = ref('');
const showAdminModules = computed(() => marketRoleShowsOrgManagement(currentUserRole.value));
const canCreateOrg = computed(() => marketRoleCanCreateOrganization(currentUserRole.value));
const adminOrganizations = ref([]);
const orgListLoading = ref(false);
/** `fetchDepartmentsTree` 映射后的森林；成功则级联以全量部门为准，否则回退为当前列表推导 */
const marketOverviewDeptTreeFromApi = ref(null);
const marketOverviewDeptTreeLoading = ref(false);
/** `App.vue` 对父页面 `postMessage` 的 `departmentList` 的 provide（同一 Ref，随消息更新） */
const departmentListFromParent = inject('departmentList');
const orgModalOpen = ref(false);
const orgModalMode = ref('create');
const orgForm = ref({
    id: 0,
    orgName: '',
    orgCode: '',
    admins: '',
    enabled: true,
});
const approvalSubTab = ref('pending');
const syncPendingRows = ref([]);
const syncDoneRows = ref([]);
const syncListLoading = ref(false);
const reviewModalOpen = ref(false);
const reviewTarget = ref(null);
const reviewDecision = ref('approve');
const reviewComment = ref('');
const reviewSubmitting = ref(false);
const orgDistinctAdminCount = computed(() => {
    const set = new Set();
    for (const o of adminOrganizations.value) {
        for (const a of o.admins.split(/[,，]/)) {
            const t = a.trim();
            if (t) {
                set.add(t);
            }
        }
    }
    return set.size;
});
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
function buildMarketOverviewDeptForest(skillList) {
    const root = { name: '', children: new Map() };
    for (const s of skillList) {
        const segs = parseDeptNamePath(s.dept_name ?? '');
        let node = root;
        for (const seg of segs) {
            if (!node.children.has(seg)) {
                node.children.set(seg, { name: seg, children: new Map() });
            }
            node = node.children.get(seg);
        }
    }
    function finalize(m, parentPath, levelNo) {
        const path = parentPath ? `${parentPath}/${m.name}` : m.name;
        const children = [...m.children.values()]
            .map((c) => finalize(c, path, levelNo + 1))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
        return {
            name: m.name,
            path,
            levelNo,
            children,
        };
    }
    return [...root.children.values()]
        .map((n) => finalize(n, '', 1))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
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
    if (levelFilter.value === 'all') {
        return true;
    }
    if (transportIsHttp) {
        const oid = Number(levelFilter.value);
        if (!Number.isFinite(oid) || oid <= 0) {
            return true;
        }
        const org = adminOrganizations.value.find((o) => o.id === oid);
        if (!org) {
            return true;
        }
        return (skill.publish_name ?? '').trim() === org.orgName.trim();
    }
    return (skill.publish_name ?? '').trim() === levelFilter.value;
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
    return selectedTags.value.some((tag) => tags.includes(tag));
}
function matchesPrimaryFiltersSansDept(skill, q, scope) {
    return (matchesScopeFilter(skill, scope) &&
        matchesKeyword(skill, q) &&
        matchesOrgFilter(skill) &&
        matchesCategoryFilter(skill));
}
function matchesOverviewDeptCascade(skill) {
    const path = overviewMarketDeptSegments.value;
    if (path.length === 0) {
        return true;
    }
    const parts = parseDeptNamePath(skill.dept_name ?? '');
    for (let i = 0; i < path.length; i++) {
        if (parts[i] !== path[i]) {
            return false;
        }
    }
    return true;
}
function matchesPrimaryFilters(skill, q, scope) {
    return (matchesPrimaryFiltersSansDept(skill, q, scope) && matchesOverviewDeptCascade(skill));
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
const marketOrgSelectOptions = computed(() => [...adminOrganizations.value]
    .filter((o) => o.enabled)
    .sort((a, b) => a.orgName.localeCompare(b.orgName, 'zh-Hans-CN')));
const skillsForMarketDeptTree = computed(() => {
    const q = search.value.trim().toLowerCase();
    const scope = toListScope(quickFilter.value);
    return skills.value.filter((s) => matchesPrimaryFiltersSansDept(s, q, scope));
});
const marketOverviewDeptTree = computed(() => {
    const apiTree = marketOverviewDeptTreeFromApi.value;
    if (apiTree && apiTree.length > 0) {
        return apiTree;
    }
    return buildMarketOverviewDeptForest(skillsForMarketDeptTree.value);
});
function marketOverviewDeptNodeByPartial(segments) {
    let nodes = marketOverviewDeptTree.value;
    let cur = null;
    for (const seg of segments) {
        cur = nodes.find((n) => n.name === seg) ?? null;
        if (!cur) {
            return null;
        }
        nodes = cur.children;
    }
    return cur;
}
function overviewDeptCascadeOptionsAt(levelIndex) {
    const tree = marketOverviewDeptTree.value;
    if (tree.length === 0) {
        return [];
    }
    const segs = overviewMarketDeptSegments.value;
    if (levelIndex > segs.length) {
        return [];
    }
    let nodes = tree;
    for (let i = 0; i < levelIndex; i++) {
        const name = segs[i];
        if (!name) {
            return [];
        }
        const hit = nodes.find((n) => n.name === name);
        if (!hit) {
            return [];
        }
        nodes = hit.children;
    }
    return nodes.map((n) => n.name);
}
const overviewDeptCascaderLabel = computed(() => {
    const s = overviewMarketDeptSegments.value;
    if (s.length === 0) {
        return '全部部门';
    }
    return s.join(' / ');
});
const overviewDeptCascadeColumns = computed(() => {
    const tree = marketOverviewDeptTree.value;
    if (tree.length === 0) {
        return [];
    }
    const segs = overviewMarketDeptSegments.value;
    const cols = [];
    for (let level = 0; level < 6; level++) {
        const opts = overviewDeptCascadeOptionsAt(level);
        if (opts.length === 0) {
            break;
        }
        cols.push({
            levelIndex: level,
            options: opts,
            active: segs[level],
        });
    }
    return cols;
});
function toggleOverviewDeptCascader() {
    overviewDeptCascaderOpen.value = !overviewDeptCascaderOpen.value;
    if (overviewDeptCascaderOpen.value) {
        updateMarketDeptPanelLayout();
        void nextTick(() => {
            updateMarketDeptPanelLayout();
        });
    }
}
function closeOverviewDeptCascader() {
    overviewDeptCascaderOpen.value = false;
}
function onOverviewDeptCascaderPick(levelIndex, name) {
    onOverviewDeptCascadeChange(levelIndex, name);
}
function marketOverviewDeptPickHasChildren(levelIndex, name) {
    const prefix = [...overviewMarketDeptSegments.value.slice(0, levelIndex), name];
    const n = marketOverviewDeptNodeByPartial(prefix);
    return Boolean(n && n.children.length > 0);
}
function clearOverviewDeptCascader() {
    overviewMarketDeptSegments.value = [];
    overviewDeptCascaderOpen.value = false;
}
function onMarketDeptCascaderDocDown(ev) {
    if (!overviewDeptCascaderOpen.value) {
        return;
    }
    const t = ev.target;
    const root = marketDeptCascaderWrapRef.value;
    const panel = marketDeptCascaderPanelRef.value;
    if (root?.contains(t) || panel?.contains(t)) {
        return;
    }
    overviewDeptCascaderOpen.value = false;
}
function onMarketDeptCascaderKeydown(ev) {
    if (!overviewDeptCascaderOpen.value) {
        return;
    }
    if (ev.key === 'Escape') {
        overviewDeptCascaderOpen.value = false;
    }
}
function updateMarketDeptPanelLayout() {
    if (!overviewDeptCascaderOpen.value) {
        marketDeptPanelLayout.value = null;
        return;
    }
    const wrap = marketDeptCascaderWrapRef.value;
    if (!wrap) {
        marketDeptPanelLayout.value = null;
        return;
    }
    const rect = wrap.getBoundingClientRect();
    const margin = 16;
    const fromLeft = Math.max(0, rect.left);
    const usable = Math.max(220, Math.floor(window.innerWidth - fromLeft - margin));
    marketDeptPanelLayout.value = {
        left: Math.floor(fromLeft),
        top: Math.floor(rect.bottom + 4),
        maxWidth: Math.min(720, usable),
    };
}
const marketDeptCascaderPanelStyle = computed(() => {
    const L = marketDeptPanelLayout.value;
    if (!L) {
        return {};
    }
    return {
        position: 'fixed',
        left: `${L.left}px`,
        top: `${L.top}px`,
        maxWidth: `${L.maxWidth}px`,
        zIndex: 2400,
    };
});
watch(overviewDeptCascaderOpen, (open) => {
    if (deptPanelScrollCleanup) {
        deptPanelScrollCleanup();
        deptPanelScrollCleanup = null;
    }
    if (open) {
        void nextTick(() => {
            updateMarketDeptPanelLayout();
        });
        const onScroll = () => {
            updateMarketDeptPanelLayout();
        };
        window.addEventListener('scroll', onScroll, true);
        deptPanelScrollCleanup = () => {
            window.removeEventListener('scroll', onScroll, true);
        };
    }
    else {
        marketDeptPanelLayout.value = null;
    }
});
function onOverviewDeptCascadeChange(levelIndex, raw) {
    if (!raw) {
        overviewMarketDeptSegments.value = overviewMarketDeptSegments.value.slice(0, levelIndex);
        return;
    }
    overviewMarketDeptSegments.value = [
        ...overviewMarketDeptSegments.value.slice(0, levelIndex),
        raw,
    ];
}
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
        if (!matchesPrimaryFilters(s, q, scope)) {
            continue;
        }
        for (const tag of skillTags(s)) {
            opts.add(tag);
        }
    }
    return [...opts].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});
const showOverviewTagExpandToggle = computed(() => tagOptions.value.length > OVERVIEW_TAGS_COLLAPSE_THRESHOLD);
const overviewTagListExpandedUi = computed(() => {
    if (!showOverviewTagExpandToggle.value) {
        return true;
    }
    return overviewTagListExpanded.value;
});
const tabPanelFillStyle = computed(() => {
    const h = tabPanelMinHeight.value > 0 ? `${tabPanelMinHeight.value}px` : undefined;
    const capOverview = innerTab.value === 'overview';
    return {
        minHeight: h,
        maxHeight: capOverview ? h : undefined,
        overflow: capOverview ? 'hidden' : undefined,
    };
});
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
            const footerHeight = content.querySelector('.overview-list-footer')?.offsetHeight ?? 0;
            const contentRect = content.getBoundingClientRect();
            const panel = tabPanelRef.value;
            const panelRect = panel?.getBoundingClientRect();
            const panelPaddingBottom = panel
                ? Number.parseFloat(window.getComputedStyle(panel).paddingBottom) || 0
                : 0;
            const plannedContentHeight = panelRect && tabPanelMinHeight.value > 0
                ? tabPanelMinHeight.value - (contentRect.top - panelRect.top) - panelPaddingBottom
                : content.clientHeight;
            const availableHeight = Math.max(cardHeight, plannedContentHeight - filtersHeight - filtersMarginBottom - footerHeight);
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
    updateMarketDeptPanelLayout();
}
onMounted(() => {
    syncResponsiveLayout();
    window.addEventListener('resize', syncResponsiveLayout);
    void loadMarketDepartmentsTreeForOverview();
    if (transportIsHttp) {
        void loadAdminOrganizations();
    }
    if (transportIsHttp && innerTab.value === 'overview') {
        void startOverviewRemoteFetch();
    }
    void (async () => {
        const [fy, co] = await Promise.all([
            marketClient.fetchOpsDashboardUi('fuyao'),
            marketClient.fetchOpsDashboardUi('company'),
        ]);
        if (fy.code === 0) {
            fuyaoOpsDashboardBundleRef.value = fy.data;
        }
        if (co.code === 0) {
            companyOpsDashboardBundleRef.value = co.data;
        }
    })();
    scheduleMaybeFillOverviewViewport();
    document.addEventListener('mousedown', onMarketDeptCascaderDocDown);
    document.addEventListener('keydown', onMarketDeptCascaderKeydown);
});
onBeforeUnmount(() => {
    deptPanelScrollCleanup?.();
    deptPanelScrollCleanup = null;
    document.removeEventListener('mousedown', onMarketDeptCascaderDocDown);
    document.removeEventListener('keydown', onMarketDeptCascaderKeydown);
    if (overviewScrollRaf) {
        window.cancelAnimationFrame(overviewScrollRaf);
        overviewScrollRaf = 0;
    }
    if (overviewPageSizeFrame) {
        window.cancelAnimationFrame(overviewPageSizeFrame);
    }
    window.removeEventListener('resize', syncResponsiveLayout);
});
/** 本地（Mock）全量筛选结果，用于渐进展示 */
const overviewFilteredAll = computed(() => {
    const q = search.value.trim().toLowerCase();
    const scope = toListScope(quickFilter.value);
    let list = [...skills.value].filter((s) => matchesPrimaryFilters(s, q, scope));
    list = list.filter((s) => matchesSelectedTags(s));
    if (quickFilter.value === 'highDl') {
        list.sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
    }
    else {
        list.sort((a, b) => (b.skill_id ?? '').localeCompare(a.skill_id ?? ''));
    }
    return list;
});
function applyOverviewDisplayFilters(raw) {
    if (transportIsHttp) {
        let list = [...raw];
        if (quickFilter.value === 'highDl') {
            list.sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
        }
        else {
            list.sort((a, b) => (b.skill_id ?? '').localeCompare(a.skill_id ?? ''));
        }
        return list;
    }
    const q = search.value.trim().toLowerCase();
    const scope = toListScope(quickFilter.value);
    let list = raw.filter((s) => matchesPrimaryFilters(s, q, scope) && matchesSelectedTags(s));
    if (quickFilter.value === 'highDl') {
        list = [...list].sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
    }
    else {
        list = [...list].sort((a, b) => (b.skill_id ?? '').localeCompare(a.skill_id ?? ''));
    }
    return list;
}
function mergeOverviewSkillsById(prev, batch) {
    const seen = new Set(prev.map((s) => String(s.id ?? s.skill_id)));
    const out = [...prev];
    for (const s of batch) {
        const k = String(s.id ?? s.skill_id);
        if (!seen.has(k)) {
            seen.add(k);
            out.push(s);
        }
    }
    return out;
}
function buildOverviewSkillListParams(pageNo, fetchSize) {
    const scope = toListScope(quickFilter.value);
    const base = skillListQueryToDto({
        keyword: search.value,
        page: pageNo,
        pageSize: fetchSize,
        scope,
    });
    const params = {
        ...base,
        pageNo,
        pageSize: fetchSize,
    };
    if (categoryFilter.value !== 'all') {
        params.categoryGroupName = categoryFilter.value;
    }
    const deptPath = overviewMarketDeptSegments.value;
    const deptKeys = [
        'departmentL1',
        'departmentL2',
        'departmentL3',
        'departmentL4',
        'departmentL5',
        'departmentL6',
    ];
    for (let i = 0; i < deptPath.length && i < deptKeys.length; i++) {
        const v = deptPath[i]?.trim();
        if (v) {
            params[deptKeys[i]] = v;
        }
    }
    if (transportIsHttp && levelFilter.value !== 'all') {
        const oid = Number(levelFilter.value);
        if (Number.isFinite(oid) && oid > 0) {
            params.orgId = oid;
        }
    }
    if (selectedTags.value.length > 0) {
        params.tagList = selectedTags.value.join(',');
    }
    return params;
}
async function startOverviewRemoteFetch() {
    if (!transportIsHttp) {
        return;
    }
    overviewRemoteFetchSeq++;
    const seq = overviewRemoteFetchSeq;
    overviewRemoteItems.value = [];
    overviewRemoteNextPage.value = 1;
    overviewRemoteExhausted.value = false;
    overviewRemoteTotal.value = 0;
    await loadOverviewRemoteMore(seq);
}
async function loadOverviewRemoteMore(expectSeq) {
    if (!transportIsHttp) {
        return;
    }
    if (overviewRemoteLoading.value || overviewRemoteExhausted.value) {
        return;
    }
    const seq = expectSeq ?? overviewRemoteFetchSeq;
    overviewRemoteLoading.value = true;
    try {
        const fetchSize = Math.max(12, pageSize.value);
        const pageNo = overviewRemoteNextPage.value;
        const params = buildOverviewSkillListParams(pageNo, fetchSize);
        const env = await marketClient.fetchSkills(params);
        if (seq !== overviewRemoteFetchSeq) {
            return;
        }
        if (env.code !== 0 || !env.data) {
            showToast(env.message || '市场列表加载失败');
            return;
        }
        const batch = env.data.records.map((r) => apiRecordToSkill(r));
        const merged = pageNo === 1 ? batch : mergeOverviewSkillsById(overviewRemoteItems.value, batch);
        overviewRemoteItems.value = merged;
        overviewRemoteTotal.value = env.data.total;
        const received = batch.length;
        if (received === 0 ||
            merged.length >= env.data.total ||
            received < fetchSize) {
            overviewRemoteExhausted.value = true;
        }
        else {
            overviewRemoteNextPage.value = pageNo + 1;
        }
    }
    finally {
        overviewRemoteLoading.value = false;
        scheduleMaybeFillOverviewViewport();
    }
}
function onOverviewMarketScroll() {
    if (innerTab.value !== 'overview') {
        return;
    }
    if (overviewDeptCascaderOpen.value) {
        updateMarketDeptPanelLayout();
    }
    if (overviewScrollRaf) {
        return;
    }
    overviewScrollRaf = window.requestAnimationFrame(() => {
        overviewScrollRaf = 0;
        const root = marketContentRef.value;
        if (!root) {
            return;
        }
        const now = Date.now();
        if (now - overviewLastScrollTriggerMs < 180) {
            return;
        }
        const { scrollTop, clientHeight, scrollHeight } = root;
        const thresholdPx = 80;
        if (scrollHeight - scrollTop - clientHeight > thresholdPx) {
            return;
        }
        overviewLastScrollTriggerMs = now;
        void handleOverviewScrollNearEnd();
    });
}
/** 内容高度不足、没有出现滚动条时，连续拉取直到可滚动或没有更多 */
function scheduleMaybeFillOverviewViewport() {
    void nextTick(() => {
        requestAnimationFrame(() => {
            tryFillOverviewUntilScrollable();
        });
    });
}
function tryFillOverviewUntilScrollable() {
    if (innerTab.value !== 'overview') {
        return;
    }
    const root = marketContentRef.value;
    if (!root) {
        return;
    }
    if (!overviewHasMore.value) {
        return;
    }
    if (transportIsHttp && overviewRemoteLoading.value) {
        return;
    }
    const pad = 8;
    if (root.scrollHeight > root.clientHeight + pad) {
        return;
    }
    void handleOverviewScrollNearEnd();
}
async function handleOverviewScrollNearEnd() {
    if (innerTab.value !== 'overview') {
        return;
    }
    if (transportIsHttp) {
        await loadOverviewRemoteMore();
        return;
    }
    if (!overviewHasMoreLocal.value) {
        return;
    }
    overviewVisibleCount.value += Math.max(12, pageSize.value);
    scheduleMaybeFillOverviewViewport();
}
const filteredSkills = computed(() => {
    if (transportIsHttp) {
        return applyOverviewDisplayFilters(overviewRemoteItems.value);
    }
    return overviewFilteredAll.value.slice(0, overviewVisibleCount.value);
});
const overviewHasMoreLocal = computed(() => overviewVisibleCount.value < overviewFilteredAll.value.length);
const overviewHasMore = computed(() => {
    if (transportIsHttp) {
        if (overviewRemoteLoading.value) {
            return false;
        }
        if (overviewRemoteExhausted.value) {
            return false;
        }
        return overviewRemoteItems.value.length < overviewRemoteTotal.value;
    }
    return overviewHasMoreLocal.value;
});
const overviewListFooterHint = computed(() => {
    const shown = filteredSkills.value.length;
    if (transportIsHttp) {
        const total = overviewRemoteTotal.value;
        if (overviewRemoteLoading.value) {
            return `加载中…（已展示 ${shown} 条，接口合计 ${total} 条）`;
        }
        if (!overviewHasMore.value) {
            return `已加载全部 ${shown} 条（接口合计 ${total} 条）`;
        }
        return `已展示 ${shown} 条 · 接口合计 ${total} 条 · 继续下拉加载更多`;
    }
    const total = overviewFilteredAll.value.length;
    if (!overviewHasMore.value) {
        return `已展示全部 ${shown} 个 Skill`;
    }
    return `已展示 ${shown} / ${total} 个 Skill · 继续下拉加载更多`;
});
const myReleases = computed(() => {
    if (myPublishedSkills.value.length > 0) {
        return myPublishedSkills.value;
    }
    if (!transportIsHttp) {
        const mine = skills.value.filter((skill) => skill.ownedByUser);
        if (mine.length > 0) {
            return mine;
        }
        return skills.value.slice(0, 4);
    }
    return [];
});
watch([search, quickFilter, levelFilter, categoryFilter, selectedTags, overviewMarketDeptSegments], () => {
    overviewVisibleCount.value = pageSize.value;
    if (transportIsHttp) {
        void startOverviewRemoteFetch();
    }
    syncOverviewPageSize();
}, { deep: true });
watch(() => filteredSkills.value.length, () => {
    syncOverviewPageSize();
    scheduleMaybeFillOverviewViewport();
}, { flush: 'post' });
watch(() => skills.value.length, () => {
    syncOverviewPageSize();
});
watch(pageSize, (next, prev) => {
    if (transportIsHttp) {
        return;
    }
    if (next > prev) {
        overviewVisibleCount.value = Math.max(overviewVisibleCount.value, next);
    }
});
watch(levelFilter, () => {
    overviewMarketDeptSegments.value = [];
});
watch(marketOverviewDeptTree, () => {
    const segs = overviewMarketDeptSegments.value;
    if (segs.length === 0) {
        return;
    }
    let keep = 0;
    for (let i = 1; i <= segs.length; i++) {
        if (marketOverviewDeptNodeByPartial(segs.slice(0, i))) {
            keep = i;
        }
        else {
            break;
        }
    }
    if (keep < segs.length) {
        overviewMarketDeptSegments.value = segs.slice(0, keep);
    }
});
watch(marketOrgSelectOptions, (opts) => {
    if (!transportIsHttp || levelFilter.value === 'all') {
        return;
    }
    const id = Number(levelFilter.value);
    if (!Number.isFinite(id) || !opts.some((o) => o.id === id)) {
        levelFilter.value = 'all';
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
function normalizeSyncRecord(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const id = Number(r.id ?? 0);
    return {
        id,
        skillId: r.skillId !== undefined ? Number(r.skillId) : undefined,
        skillName: String(r.skillName ?? '—'),
        applyType: String(r.applyType ?? '同步至公司组织'),
        targetLevel: String(r.targetLevel ?? '组织级'),
        targetOrgId: r.targetOrgId !== undefined ? Number(r.targetOrgId) : undefined,
        targetOrgName: String(r.targetOrgName ?? ''),
        reason: String(r.reason ?? ''),
        reasonDetail: r.reasonDetail !== undefined ? String(r.reasonDetail) : undefined,
        approverLabel: String(r.approverLabel ?? '—'),
        status: String(r.status ?? ''),
        reviewResult: r.reviewResult !== undefined ? String(r.reviewResult) : undefined,
        reviewComment: r.reviewComment !== undefined ? String(r.reviewComment) : undefined,
        completedAt: r.completedAt !== undefined ? String(r.completedAt) : undefined,
    };
}
function canEditOrganization(org) {
    const role = currentUserRole.value;
    if (!role) {
        return false;
    }
    if (role.role === 'SUPER_ADMIN') {
        return true;
    }
    if (role.role === 'ORG_ADMIN') {
        return role.managedOrgIds.includes(org.id);
    }
    return false;
}
async function loadAdminOrganizations() {
    orgListLoading.value = true;
    try {
        const r = await marketClient.fetchOrganizations();
        if (r.code === 0 && Array.isArray(r.data)) {
            adminOrganizations.value = r.data;
            orgCount.value = r.data.length;
        }
    }
    finally {
        orgListLoading.value = false;
    }
}
function applyInjectedDepartmentTreeIfAny() {
    const holder = departmentListFromParent;
    if (!holder) {
        return;
    }
    const raw = holder.value;
    if (!Array.isArray(raw) || raw.length === 0) {
        return;
    }
    marketOverviewDeptTreeFromApi.value = mapDepartmentTreeDtoToForest(raw);
}
async function loadMarketDepartmentsTreeForOverview() {
    marketOverviewDeptTreeLoading.value = true;
    try {
        const r = await marketClient.fetchDepartmentsTree();
        if (r.code === 0 && Array.isArray(r.data) && r.data.length > 0) {
            marketOverviewDeptTreeFromApi.value = mapDepartmentTreeDtoToForest(r.data);
        }
        else {
            marketOverviewDeptTreeFromApi.value = null;
        }
        applyInjectedDepartmentTreeIfAny();
    }
    finally {
        marketOverviewDeptTreeLoading.value = false;
    }
}
watch(() => departmentListFromParent?.value, () => {
    applyInjectedDepartmentTreeIfAny();
}, { deep: true, immediate: true, });
async function loadSyncApplicationRows() {
    syncListLoading.value = true;
    try {
        const [p, d] = await Promise.all([
            marketClient.fetchSyncApplications({ tab: 'pending', pageNo: 1, pageSize: 100 }),
            marketClient.fetchSyncApplications({ tab: 'done', pageNo: 1, pageSize: 100 }),
        ]);
        if (p.code === 0 && p.data?.records) {
            syncPendingRows.value = p.data.records.map((row) => normalizeSyncRecord(row));
        }
        if (d.code === 0 && d.data?.records) {
            syncDoneRows.value = d.data.records.map((row) => normalizeSyncRecord(row));
        }
    }
    finally {
        syncListLoading.value = false;
    }
}
watch(() => route.query.tab, (tab) => {
    const nextTab = routeTabFromQuery(tab);
    if (nextTab !== innerTab.value) {
        innerTab.value = nextTab;
    }
});
watch(() => [currentUserRole.value, innerTab.value], ([role, tab]) => {
    if (!role) {
        return;
    }
    if (!marketRoleShowsOrgManagement(role) && (tab === 'org' || tab === 'approval')) {
        goTab('overview', true);
    }
});
watch(innerTab, (tab) => {
    if (tab === 'org') {
        void loadAdminOrganizations();
    }
    if (tab === 'approval') {
        void loadSyncApplicationRows();
    }
    if (tab === 'releases') {
        void refreshMyPublishedSkills();
    }
    syncTabPanelMinHeight();
}, { immediate: true });
function showToast(message, ms = 3000) {
    toast.value = message;
    setTimeout(() => {
        toast.value = '';
    }, ms);
}
function openOrgCreateModal() {
    orgModalMode.value = 'create';
    orgForm.value = {
        id: 0,
        orgName: '',
        orgCode: '',
        admins: '',
        enabled: true,
    };
    orgModalOpen.value = true;
}
function openOrgEditModal(org) {
    orgModalMode.value = 'edit';
    orgForm.value = {
        id: org.id,
        orgName: org.orgName,
        orgCode: org.orgCode,
        admins: org.admins,
        enabled: org.enabled,
    };
    orgModalOpen.value = true;
}
function closeOrgModal() {
    orgModalOpen.value = false;
}
async function submitOrgModal() {
    const f = orgForm.value;
    if (!f.orgName.trim() || !f.orgCode.trim()) {
        showToast('请填写组织名称与组织 ID');
        return;
    }
    const body = {
        orgName: f.orgName.trim(),
        orgCode: f.orgCode.trim(),
        admins: f.admins.trim(),
        enabled: f.enabled,
    };
    if (orgModalMode.value === 'create') {
        const r = await marketClient.postOrganization(body);
        if (r.code !== 0) {
            showToast(r.message || '新建失败');
            return;
        }
        showToast('已新建组织');
    }
    else {
        const r = await marketClient.putOrganization(f.id, body);
        if (r.code !== 0) {
            showToast(r.message || '保存失败');
            return;
        }
        showToast('已保存');
    }
    orgModalOpen.value = false;
    await loadAdminOrganizations();
}
function openReviewModal(row) {
    reviewTarget.value = row;
    reviewDecision.value = 'approve';
    reviewComment.value = '';
    reviewModalOpen.value = true;
}
function closeReviewModal() {
    reviewModalOpen.value = false;
    reviewTarget.value = null;
}
async function submitReviewModal() {
    const row = reviewTarget.value;
    if (!row) {
        return;
    }
    if (!reviewComment.value.trim()) {
        showToast('请填写审核意见');
        return;
    }
    reviewSubmitting.value = true;
    try {
        const r = await marketClient.postSyncApplicationReview(row.id, {
            decision: reviewDecision.value,
            comment: reviewComment.value.trim(),
        });
        if (r.code !== 0) {
            showToast(r.message || '提交失败');
            return;
        }
        showToast('已提交审核');
        closeReviewModal();
        await loadSyncApplicationRows();
    }
    finally {
        reviewSubmitting.value = false;
    }
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
    const deptParts = parseDeptNamePath(skill.dept_name ?? '');
    return [skill.tagFunctional, skill.skill_id, deptParts[deptParts.length - 1]]
        .filter(Boolean)
        .join(' ');
}
async function parseSkillArchiveForUpload(file) {
    const env = await marketClient.postSkillUploadParse(file);
    if (env.code !== 0) {
        throw new Error(env.message || '解析失败');
    }
    const d = env.data;
    const tags = Array.isArray(d.tags) ? d.tags.join(' ') : String(d.tags ?? '');
    return {
        duplicate: Boolean(d.nameExists),
        meta: {
            name: d.name,
            version: d.version,
            description: d.description,
            author: d.author,
            category: d.category,
            requirements: d.requirements ?? '',
            tags,
            level: d.level ?? '个人级（默认发布，无需审核）',
        },
    };
}
async function onUploadSubmit(payload) {
    try {
        const result = await store.uploadSkill(payload);
        overviewVisibleCount.value = pageSize.value;
        if (transportIsHttp) {
            void startOverviewRemoteFetch();
        }
        await refreshMyPublishedSkills();
        showToast(result.created
            ? `已发布新 Skill「${result.skill.name}」v${result.skill.version}`
            : `同名 Skill 已更新为 v${result.skill.version}（版本追加）`, 4000);
    }
    catch (e) {
        showToast(e instanceof Error ? e.message : '上传失败');
    }
}
function patchSkillsDownloadCountAfterDownload(id, skill) {
    const dl = skill.download_count ?? skill.downloads ?? 0;
    if (transportIsHttp) {
        overviewRemoteItems.value = overviewRemoteItems.value.map((s) => skillKey(s) === id ? { ...s, download_count: dl, downloads: dl } : s);
    }
    if (detailPanelSkill.value && skillKey(detailPanelSkill.value) === id) {
        detailPanelSkill.value = { ...detailPanelSkill.value, download_count: dl, downloads: dl };
    }
}
async function onDownload(id, sourcePage = 'market') {
    try {
        const result = await store.downloadSkill(id, { sourcePage });
        patchSkillsDownloadCountAfterDownload(id, result.skill);
        if (result.blob && result.blob.size > 0) {
            const url = URL.createObjectURL(result.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = result.fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            showToast(`已下载当前版本：${skillTitle(result.skill)} v${skillVersion(result.skill)}`);
            return;
        }
        if (result.directDownloadUrl) {
            const link = document.createElement('a');
            link.href = result.directDownloadUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.download = result.fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast(`正在打开下载链接：${skillTitle(result.skill)} v${skillVersion(result.skill)}`);
            return;
        }
        showToast('下载失败：无可保存的文件');
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
    void onDownload(skillKey(detailPanelSkill.value), 'detail');
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
    const ms = (skill.marketStatus ?? '').trim();
    if (ms.includes('驳回')) {
        return 'rejected-pdu';
    }
    if (ms.includes('审核')) {
        return 'reviewing-dev';
    }
    if (skill.id === '2') {
        return 'rejected-pdu';
    }
    if (skill.id === '4') {
        return 'reviewing-dev';
    }
    const pl = skill.publish_level ?? skill.level ?? '';
    if (pl.includes('个人')) {
        return 'personal-live';
    }
    return 'published';
}
function statusText(st) {
    if (st === 'personal-live') {
        return '个人级';
    }
    if (st === 'published') {
        return '组织级';
    }
    if (st === 'reviewing-dev') {
        return '组织审核中';
    }
    return '组织已驳回';
}
function lastActionText(st) {
    if (st === 'personal-live') {
        return '已发布为个人级 Skill';
    }
    if (st === 'published') {
        return '已同步至公司组织';
    }
    if (st === 'reviewing-dev') {
        return '等待目标组织管理员审核';
    }
    return '需补充复现数据和说明文档';
}
function releaseCategoryLabel(skill) {
    return skill.tagFunctional || '通用类';
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
function releaseSyncActionText(row) {
    if (row.statusKey === 'published' && !row.personal) {
        return '更新同步';
    }
    return '同步至公司组织';
}
function onReleaseNewVersion(row) {
    toastAction(`新版本（演示）：为「${skillTitle(row.skill)}」追加版本`);
    openUpload();
}
function onReleaseSync(row) {
    const action = releaseSyncActionText(row);
    toastAction(`${action}（演示）：${skillTitle(row.skill)}`);
}
function onReleaseRecord(row) {
    toastAction(`记录（演示）：查看「${skillTitle(row.skill)}」操作记录`);
}
const myReleaseRows = computed(() => {
    return myReleases.value.map((s) => {
        const st = statusOf(s);
        const isPersonal = st === 'personal-live' ||
            (s.publish_level ?? s.level ?? '').includes('个人') ||
            (s.dept_name ?? s.tagOrg ?? '').includes('个人');
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
const uiMyStats = computed(() => {
    const rows = myReleaseRows.value;
    if (rows.length === 0) {
        return {
            maintained: '0',
            reviewing: '0',
            rejected: '0',
            myTotalDownloads: '0',
            my30DaysDownloads: '—',
        };
    }
    const maintained = rows.length;
    const reviewing = rows.filter((x) => x.statusKey === 'reviewing-dev').length;
    const rejected = rows.filter((x) => x.statusKey === 'rejected-pdu').length;
    const totalDl = rows.reduce((sum, x) => sum + (x.skill.download_count ?? x.skill.downloads ?? 0), 0);
    return {
        maintained: String(maintained),
        reviewing: String(reviewing),
        rejected: String(rejected),
        myTotalDownloads: totalDl.toLocaleString('zh-CN'),
        my30DaysDownloads: '—',
    };
});
const filteredMyReleaseRows = computed(() => {
    let list = [...myReleaseRows.value];
    if (releaseFilter.value === 'personal') {
        list = list.filter((x) => x.personal || x.statusKey === 'personal-live');
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
const fuyaoOpsDashboardBundleRef = ref(null);
const companyOpsDashboardBundleRef = ref(null);
const opsBoardSystem = ref('company');
/** 公司运营看板「Excel 导入」仅管理员可用；扶摇看板不提供导入 */
const showOpsExcelImport = computed(() => opsBoardSystem.value === 'company' && marketRoleShowsOpsAndReview(currentUserRole.value));
const selectedOpsDeptPath = ref('');
const selectedOpsOrgName = ref('');
const defaultOpsDashboardBundle = computed(() => {
    const empty = emptyOpsDashboardBundle();
    if (opsBoardSystem.value === 'company') {
        return companyOpsDashboardBundleRef.value ?? empty;
    }
    return fuyaoOpsDashboardBundleRef.value ?? empty;
});
const opsDashboardBundle = computed(() => {
    if (opsBoardSystem.value === 'fuyao') {
        return defaultOpsDashboardBundle.value;
    }
    return opsImportedBundle.value ?? defaultOpsDashboardBundle.value;
});
const uiDeptTree = computed(() => opsDashboardBundle.value.deptTree);
const uiOrgBars = computed(() => opsDashboardBundle.value.orgBars);
const OPS_DEPT_DISPLAY_START_LEVEL = 4;
const expandedDeptPaths = ref(new Set());
function formatOpsNumber(value) {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value).replace(/,/g, ''), 10);
    return Number.isFinite(parsed) ? parsed.toLocaleString('zh-CN') : String(value ?? '-');
}
function opsSkillOwner(row) {
    return row.owner || row.publishName || '未填写发布人';
}
function collectDefaultExpandedDeptPaths(nodes) {
    const out = new Set();
    for (const n of nodes) {
        if (n.children && n.children.length > 0) {
            out.add(n.path);
        }
    }
    return out;
}
function collectDeptDisplayRoots(nodes) {
    const out = [];
    for (const node of nodes) {
        if (node.levelNo >= OPS_DEPT_DISPLAY_START_LEVEL) {
            out.push(node);
            continue;
        }
        out.push(...collectDeptDisplayRoots(node.children ?? []));
    }
    return out;
}
function firstDeptPath(nodes) {
    return nodes[0]?.path ?? '';
}
function findDeptNodeByPath(nodes, path) {
    for (const node of nodes) {
        if (node.path === path) {
            return node;
        }
        const child = findDeptNodeByPath(node.children ?? [], path);
        if (child) {
            return child;
        }
    }
    return null;
}
watch(uiDeptTree, (tree) => {
    const displayRoots = collectDeptDisplayRoots(tree);
    expandedDeptPaths.value = collectDefaultExpandedDeptPaths(displayRoots);
    if (!findDeptNodeByPath(displayRoots, selectedOpsDeptPath.value)) {
        selectedOpsDeptPath.value = firstDeptPath(displayRoots);
    }
}, { immediate: true });
watch(uiOrgBars, (bars) => {
    if (!bars.some((row) => row.name === selectedOpsOrgName.value)) {
        selectedOpsOrgName.value = bars[0]?.name ?? '';
    }
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
function selectOpsDept(path) {
    selectedOpsDeptPath.value = path;
}
function selectOpsOrg(name) {
    selectedOpsOrgName.value = name;
}
function flattenDeptTreeVisible(nodes) {
    const out = [];
    for (const n of nodes) {
        const hasChildren = Boolean(n.children && n.children.length > 0);
        const expanded = hasChildren ? expandedDeptPaths.value.has(n.path) : false;
        out.push({
            path: n.path,
            name: n.name,
            levelNo: Math.max(1, n.levelNo - OPS_DEPT_DISPLAY_START_LEVEL + 1),
            skills: n.skills,
            downloads: n.downloads,
            hasChildren,
            expanded,
        });
        if (hasChildren && expanded) {
            out.push(...flattenDeptTreeVisible(n.children));
        }
    }
    return out;
}
const uiDeptDisplayRoots = computed(() => collectDeptDisplayRoots(uiDeptTree.value));
const uiDeptFlat = computed(() => flattenDeptTreeVisible(uiDeptDisplayRoots.value));
const uiOrgBarsSorted = computed(() => [...uiOrgBars.value].sort((a, b) => b.downloads - a.downloads || b.skills - a.skills));
const uiOrgBarsMax = computed(() => Math.max(1, ...uiOrgBarsSorted.value.map((x) => x.downloads)));
const selectedDeptNode = computed(() => findDeptNodeByPath(uiDeptTree.value, selectedOpsDeptPath.value) ?? uiDeptTree.value[0] ?? null);
const selectedOrgBar = computed(() => uiOrgBars.value.find((row) => row.name === selectedOpsOrgName.value) ?? uiOrgBars.value[0]);
const selectedDeptSkillRows = computed(() => selectedDeptNode.value?.skillRows ?? []);
const selectedOrgSkillRows = computed(() => selectedOrgBar.value?.skillRows ?? []);
const opsKpiCards = computed(() => {
    const kpi = opsDashboardBundle.value.kpi;
    const systemName = opsBoardSystem.value === 'company' ? '公司系统' : '扶摇系统';
    return [
        {
            label: 'Skill 总数',
            value: kpi.totalSkills,
            desc: `${systemName}内个人级和组织级 Skill 总量`,
        },
        {
            label: '组织级 Skill',
            value: kpi.activeSkills,
            desc: opsBoardSystem.value === 'fuyao'
                ? '已同步至公司组织维度、在扶摇市场按组织发布的 Skill 数量'
                : '已发布为组织级、在公司系统统一治理的 Skill 数量',
        },
        {
            label: '个人级 Skill',
            value: kpi.personalSkills,
            desc: '个人发布、沉淀和验证的 Skill 数量',
        },
        {
            label: '全部累计下载量',
            value: kpi.totalDownloads,
            desc: '个人级和组织级 Skill 的累计下载',
        },
    ];
});
const uiTopSkillsByDl = computed(() => opsDashboardBundle.value.topSkills);
const opsTopTitle = 'TOP Skill';
const opsTopSubTitle = '按下载量展示当前市场中使用最集中的 Skill。';
const opsEmptyText = computed(() => opsBoardSystem.value === 'company'
    ? '暂无公司系统运营看板数据'
    : '暂无扶摇系统运营看板数据');
const opsOrgBarsHelpText = computed(() => opsBoardSystem.value === 'fuyao'
    ? '与已同步至公司组织维度的组织级 Skill 一致，按发布组织聚合；点击条目查看右侧明细。'
    : '点击横向条目后，右侧显示该组织级 Skill 列表。');
function buildOpsDashboardExportJsonFileName(sourceName) {
    const baseName = sourceName.replace(/\.[^.]+$/, '').trim() || 'ops-dashboard';
    return `${baseName}-ops-dashboard-export.json`;
}
function downloadOpsDashboardExportJson(sourceName, bundle) {
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildOpsDashboardExportJsonFileName(sourceName);
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
        const system = opsBoardSystem.value;
        if (system === 'company') {
            opsImportedBundle.value = bundle;
            downloadOpsDashboardExportJson(file.name, bundle);
            showToast(`已导入 ${rows.length} 条 Skill，当前页为预览；请用已下载 JSON 手动替换 src/mock/opsDashboardCompanyDefault.json 后重新运行 dev 以生效`);
        }
        else {
            downloadOpsDashboardExportJson(file.name, bundle);
            showToast(`已解析 ${rows.length} 条并下载 JSON；扶摇运营看板仅展示接口数据，导入不会更新该页`);
        }
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
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['ops']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-system-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-system-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-system-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-import-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-import-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-caret-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-download']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-count']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bar-top']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bar-top']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-skill-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-list']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['board-org-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bars']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-skill-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['board-org-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bars']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-skill-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['board-org-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bars']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-skill-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dept-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['org-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpis']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-count']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-download']} */ ;
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
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-system-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-system-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-system-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-data-note']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-import-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-data-note']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-import-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpis']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dept-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['org-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['board-org-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-count']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree-download']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-caret-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bars']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bar-top']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bar-top']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-bar-track']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-bar-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-skill-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['col-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['col-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['col-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['col-download']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['skill-row-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['owner-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['download-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['download-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-list']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-empty-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-rank']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dept-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['org-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['board-org-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-org-bars']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-skill-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-kpis']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-top-list']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-data-note']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['col-owner']} */ ;
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
/** @type {__VLS_StyleScopedClasses['summary-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-table']} */ ;
/** @type {__VLS_StyleScopedClasses['adm-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['adm-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['adm-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['adm-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-field']} */ ;
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
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['market-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['side-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['side-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-clear']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['side-tags-collapsible']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['side-block--tags']} */ ;
/** @type {__VLS_StyleScopedClasses['side-tags-collapsible']} */ ;
/** @type {__VLS_StyleScopedClasses['is-expanded']} */ ;
/** @type {__VLS_StyleScopedClasses['side-tags-expand']} */ ;
/** @type {__VLS_StyleScopedClasses['side-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['side-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['market-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
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
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-col']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-item']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-item']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-clear']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-done']} */ ;
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
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['market-content']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-head']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-stats']} */ ;
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
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['col-skill']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['col-level']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['col-ver']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['col-action']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['col-ops']} */ ;
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
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['ops']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['num']} */ ;
/** @type {__VLS_StyleScopedClasses['my-release-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-row']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['filters']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader']} */ ;
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
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-col']} */ ;
/** @type {__VLS_StyleScopedClasses['market-dept-cascader-col']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "user-shell" },
});
/** @type {__VLS_StyleScopedClasses['user-shell']} */ ;
const __VLS_0 = UploadSkillModal;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.uploadOpen),
    parseSkillArchive: (__VLS_ctx.parseSkillArchiveForUpload),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.uploadOpen),
    parseSkillArchive: (__VLS_ctx.parseSkillArchiveForUpload),
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
        [uploadOpen, parseSkillArchiveForUpload, onUploadSubmit, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, detailPanelSkill, closeDetailPanel, closeDetailPanel, skillVersion, skillAuthor, skillScopeClass, skillScopeLabel, skillDownloadCount, onTrySkill, onDetailDownload, detailFileTree, skillTitle, detailRows,];
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
    ...{ class: ({ 'ops-tabs': __VLS_ctx.innerTab === 'ops' || __VLS_ctx.innerTab === 'org' || __VLS_ctx.innerTab === 'approval' }) },
    'aria-label': "市场分区",
});
/** @type {__VLS_StyleScopedClasses['sub-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-tabs']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.goTab('overview');
            // @ts-ignore
            [toast, toast, openUpload, innerTab, innerTab, innerTab, goTab,];
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
if (__VLS_ctx.showAdminModules) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showAdminModules))
                    return;
                __VLS_ctx.goTab('org');
                // @ts-ignore
                [innerTab, goTab, showAdminModules,];
            } },
        type: "button",
        ...{ class: "sub-tab" },
        ...{ class: ({ on: __VLS_ctx.innerTab === 'org' }) },
    });
    /** @type {__VLS_StyleScopedClasses['sub-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
}
if (__VLS_ctx.showAdminModules) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showAdminModules))
                    return;
                __VLS_ctx.goTab('approval');
                // @ts-ignore
                [innerTab, goTab, showAdminModules,];
            } },
        type: "button",
        ...{ class: "sub-tab" },
        ...{ class: ({ on: __VLS_ctx.innerTab === 'approval' }) },
    });
    /** @type {__VLS_StyleScopedClasses['sub-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
}
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
        ...{ class: "side-block side-block--tags" },
    });
    /** @type {__VLS_StyleScopedClasses['side-block']} */ ;
    /** @type {__VLS_StyleScopedClasses['side-block--tags']} */ ;
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
        ...{ class: "side-tags-collapsible" },
        ...{ class: ({ 'is-expanded': __VLS_ctx.overviewTagListExpandedUi }) },
    });
    /** @type {__VLS_StyleScopedClasses['side-tags-collapsible']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-expanded']} */ ;
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
                    [selectedTags, clearTagFilters, overviewTagListExpandedUi, tagOptions, toggleTagFilter,];
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
    if (__VLS_ctx.showOverviewTagExpandToggle) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!(__VLS_ctx.showOverviewTagExpandToggle))
                        return;
                    __VLS_ctx.overviewTagListExpanded = !__VLS_ctx.overviewTagListExpanded;
                    // @ts-ignore
                    [tagOptions, showOverviewTagExpandToggle, overviewTagListExpanded, overviewTagListExpanded,];
                } },
            type: "button",
            ...{ class: "side-tags-expand" },
        });
        /** @type {__VLS_StyleScopedClasses['side-tags-expand']} */ ;
        (__VLS_ctx.overviewTagListExpanded ? '收起标签' : '展开全部标签');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onScroll: (__VLS_ctx.onOverviewMarketScroll) },
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
    if (__VLS_ctx.transportIsHttp) {
        for (const [o] of __VLS_vFor((__VLS_ctx.marketOrgSelectOptions))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (o.id),
                value: (String(o.id)),
            });
            (o.orgName);
            // @ts-ignore
            [overviewTagListExpanded, onOverviewMarketScroll, search, levelFilter, transportIsHttp, marketOrgSelectOptions,];
        }
    }
    else {
        for (const [org] of __VLS_vFor((__VLS_ctx.orgOptions))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (org),
                value: (org),
            });
            (org);
            // @ts-ignore
            [orgOptions,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "marketDeptCascaderWrapRef",
        ...{ class: "market-dept-cascader" },
        'aria-label': "部门级联筛选（departmentL1～L6）",
    });
    /** @type {__VLS_StyleScopedClasses['market-dept-cascader']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.toggleOverviewDeptCascader) },
        type: "button",
        ...{ class: "market-dept-cascader-trigger" },
        ...{ class: ({ 'is-open': __VLS_ctx.overviewDeptCascaderOpen }) },
        'aria-haspopup': "true",
        'aria-expanded': (__VLS_ctx.overviewDeptCascaderOpen),
    });
    /** @type {__VLS_StyleScopedClasses['market-dept-cascader-trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-open']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "market-dept-cascader-trigger-text" },
        title: (__VLS_ctx.overviewDeptCascaderLabel),
    });
    /** @type {__VLS_StyleScopedClasses['market-dept-cascader-trigger-text']} */ ;
    (__VLS_ctx.overviewDeptCascaderLabel);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "market-dept-cascader-caret" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['market-dept-cascader-caret']} */ ;
    let __VLS_19;
    /** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
    Teleport;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
        to: "body",
    }));
    const __VLS_21 = __VLS_20({
        to: "body",
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    const { default: __VLS_24 } = __VLS_22.slots;
    if (__VLS_ctx.overviewDeptCascaderOpen) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onMousedown: () => { } },
            ref: "marketDeptCascaderPanelRef",
            ...{ class: "market-dept-cascader-panel" },
            ...{ style: (__VLS_ctx.marketDeptCascaderPanelStyle) },
            role: "listbox",
        });
        /** @type {__VLS_StyleScopedClasses['market-dept-cascader-panel']} */ ;
        if (__VLS_ctx.overviewDeptCascadeColumns.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "market-dept-cascader-empty" },
            });
            /** @type {__VLS_StyleScopedClasses['market-dept-cascader-empty']} */ ;
            if (__VLS_ctx.marketOverviewDeptTreeLoading) {
            }
            else {
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "market-dept-cascader-columns" },
            });
            /** @type {__VLS_StyleScopedClasses['market-dept-cascader-columns']} */ ;
            for (const [col] of __VLS_vFor((__VLS_ctx.overviewDeptCascadeColumns))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: ('dept-col-' + col.levelIndex),
                    ...{ class: "market-dept-cascader-col" },
                    role: "presentation",
                });
                /** @type {__VLS_StyleScopedClasses['market-dept-cascader-col']} */ ;
                for (const [name] of __VLS_vFor((col.options))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.innerTab === 'overview'))
                                    return;
                                if (!(__VLS_ctx.overviewDeptCascaderOpen))
                                    return;
                                if (!!(__VLS_ctx.overviewDeptCascadeColumns.length === 0))
                                    return;
                                __VLS_ctx.onOverviewDeptCascaderPick(col.levelIndex, name);
                                // @ts-ignore
                                [toggleOverviewDeptCascader, overviewDeptCascaderOpen, overviewDeptCascaderOpen, overviewDeptCascaderOpen, overviewDeptCascaderLabel, overviewDeptCascaderLabel, marketDeptCascaderPanelStyle, overviewDeptCascadeColumns, overviewDeptCascadeColumns, marketOverviewDeptTreeLoading, onOverviewDeptCascaderPick,];
                            } },
                        key: (col.levelIndex + '-' + name),
                        type: "button",
                        ...{ class: "market-dept-cascader-item" },
                        ...{ class: ({ 'is-active': col.active === name }) },
                        role: "option",
                        'aria-selected': (col.active === name),
                    });
                    /** @type {__VLS_StyleScopedClasses['market-dept-cascader-item']} */ ;
                    /** @type {__VLS_StyleScopedClasses['is-active']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "market-dept-cascader-item-label" },
                    });
                    /** @type {__VLS_StyleScopedClasses['market-dept-cascader-item-label']} */ ;
                    (name);
                    if (__VLS_ctx.marketOverviewDeptPickHasChildren(col.levelIndex, name)) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "market-dept-cascader-item-chevron" },
                            'aria-hidden': "true",
                        });
                        /** @type {__VLS_StyleScopedClasses['market-dept-cascader-item-chevron']} */ ;
                    }
                    // @ts-ignore
                    [marketOverviewDeptPickHasChildren,];
                }
                // @ts-ignore
                [];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "market-dept-cascader-footer" },
        });
        /** @type {__VLS_StyleScopedClasses['market-dept-cascader-footer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.clearOverviewDeptCascader) },
            type: "button",
            ...{ class: "market-dept-cascader-clear" },
        });
        /** @type {__VLS_StyleScopedClasses['market-dept-cascader-clear']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.closeOverviewDeptCascader) },
            type: "button",
            ...{ class: "market-dept-cascader-done" },
        });
        /** @type {__VLS_StyleScopedClasses['market-dept-cascader-done']} */ ;
    }
    // @ts-ignore
    [clearOverviewDeptCascader, closeOverviewDeptCascader,];
    var __VLS_22;
    if (__VLS_ctx.transportIsHttp && __VLS_ctx.overviewRemoteLoading && __VLS_ctx.overviewRemoteItems.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty overview-loading-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        /** @type {__VLS_StyleScopedClasses['overview-loading-hint']} */ ;
    }
    else if (__VLS_ctx.filteredSkills.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "overviewGridRef",
            ...{ class: "grid" },
        });
        /** @type {__VLS_StyleScopedClasses['grid']} */ ;
        for (const [s] of __VLS_vFor((__VLS_ctx.filteredSkills))) {
            const __VLS_25 = SkillCard;
            // @ts-ignore
            const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
                ...{ 'onDownload': {} },
                ...{ 'onOpenDetail': {} },
                ...{ 'onViewVersions': {} },
                key: (s.id ?? s.skill_id),
                ...{ class: "market-skill-card" },
                skill: (s),
                menuMode: "download-only",
            }));
            const __VLS_27 = __VLS_26({
                ...{ 'onDownload': {} },
                ...{ 'onOpenDetail': {} },
                ...{ 'onViewVersions': {} },
                key: (s.id ?? s.skill_id),
                ...{ class: "market-skill-card" },
                skill: (s),
                menuMode: "download-only",
            }, ...__VLS_functionalComponentArgsRest(__VLS_26));
            let __VLS_30;
            const __VLS_31 = ({ download: {} },
                { onDownload: ((sid) => __VLS_ctx.onDownload(sid, 'market')) });
            const __VLS_32 = ({ openDetail: {} },
                { onOpenDetail: (__VLS_ctx.openDetailPanel) });
            const __VLS_33 = ({ viewVersions: {} },
                { onViewVersions: (__VLS_ctx.onViewVersions) });
            /** @type {__VLS_StyleScopedClasses['market-skill-card']} */ ;
            var __VLS_28;
            var __VLS_29;
            // @ts-ignore
            [transportIsHttp, overviewRemoteLoading, overviewRemoteItems, filteredSkills, filteredSkills, onDownload, openDetailPanel, onViewVersions,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "overview-list-footer" },
        role: "status",
    });
    /** @type {__VLS_StyleScopedClasses['overview-list-footer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.overviewListFooterHint);
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
        [innerTab, overviewListFooterHint, onApplyCoreHarness, coreLevelStats,];
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
        const __VLS_34 = SkillCard;
        // @ts-ignore
        const __VLS_35 = __VLS_asFunctionalComponent1(__VLS_34, new __VLS_34({
            ...{ 'onDownload': {} },
            ...{ 'onViewVersions': {} },
            key: (s.id),
            skill: (s),
            variant: "coreHarness",
            menuMode: "full",
        }));
        const __VLS_36 = __VLS_35({
            ...{ 'onDownload': {} },
            ...{ 'onViewVersions': {} },
            key: (s.id),
            skill: (s),
            variant: "coreHarness",
            menuMode: "full",
        }, ...__VLS_functionalComponentArgsRest(__VLS_35));
        let __VLS_39;
        const __VLS_40 = ({ download: {} },
            { onDownload: ((sid) => __VLS_ctx.onDownload(sid, 'market')) });
        const __VLS_41 = ({ viewVersions: {} },
            { onViewVersions: (__VLS_ctx.onViewVersions) });
        var __VLS_37;
        var __VLS_38;
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "my-release-head" },
    });
    /** @type {__VLS_StyleScopedClasses['my-release-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.openUpload) },
        type: "button",
        ...{ class: "btn primary my-upload-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['my-upload-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "my-release-body" },
    });
    /** @type {__VLS_StyleScopedClasses['my-release-body']} */ ;
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
                    [openUpload, innerTab, tabPanelFillStyle, uiMyStats, uiMyStats, uiMyStats, uiMyStats, releaseFilters, releaseFilter,];
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
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    __VLS_ctx.openDetailPanel(__VLS_ctx.skillKey(row.skill));
                    // @ts-ignore
                    [openDetailPanel, onUploadExistingVersion, filteredMyReleaseRows, skillKey,];
                } },
            key: (row.skill.id),
            ...{ class: "clickable-row" },
        });
        /** @type {__VLS_StyleScopedClasses['clickable-row']} */ ;
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
        (__VLS_ctx.releaseCategoryLabel(row.skill));
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ onClick: () => { } },
        });
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
                    __VLS_ctx.onReleaseNewVersion(row);
                    // @ts-ignore
                    [releaseCategoryLabel, releasePrimaryLevel, releaseOrgLabel, onReleaseNewVersion,];
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
                    __VLS_ctx.onReleaseSync(row);
                    // @ts-ignore
                    [onReleaseSync,];
                } },
            type: "button",
            ...{ class: "mini" },
        });
        /** @type {__VLS_StyleScopedClasses['mini']} */ ;
        (__VLS_ctx.releaseSyncActionText(row));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    __VLS_ctx.onReleaseRecord(row);
                    // @ts-ignore
                    [releaseSyncActionText, onReleaseRecord,];
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
else if (__VLS_ctx.innerTab === 'org') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "tabPanelRef",
        ...{ class: "panel tab-panel admin-org-panel" },
        ...{ style: (__VLS_ctx.tabPanelFillStyle) },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['admin-org-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "admin-panel-head" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-panel-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "panel-help" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-help']} */ ;
    if (__VLS_ctx.canCreateOrg) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.openOrgCreateModal) },
            type: "button",
            ...{ class: "btn primary" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "admin-panel-body" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-panel-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "summary-strip admin-summary" },
        role: "group",
        'aria-label': "组织摘要",
    });
    /** @type {__VLS_StyleScopedClasses['summary-strip']} */ ;
    /** @type {__VLS_StyleScopedClasses['admin-summary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "summary-item" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    (__VLS_ctx.adminOrganizations.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "summary-item" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    (__VLS_ctx.orgDistinctAdminCount);
    if (__VLS_ctx.orgListLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "admin-loading" },
        });
        /** @type {__VLS_StyleScopedClasses['admin-loading']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap admin-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        /** @type {__VLS_StyleScopedClasses['admin-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table admin-table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        /** @type {__VLS_StyleScopedClasses['admin-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [org] of __VLS_vFor((__VLS_ctx.adminOrganizations))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (org.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (org.orgName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (org.orgCode);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "cell-admins" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-admins']} */ ;
            (org.admins);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "adm-badge" },
                ...{ class: (org.enabled ? 'on' : 'off') },
            });
            /** @type {__VLS_StyleScopedClasses['adm-badge']} */ ;
            (org.enabled ? '启用' : '停用');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.innerTab === 'overview'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'core'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'releases'))
                            return;
                        if (!(__VLS_ctx.innerTab === 'org'))
                            return;
                        if (!!(__VLS_ctx.orgListLoading))
                            return;
                        __VLS_ctx.openOrgEditModal(org);
                        // @ts-ignore
                        [innerTab, tabPanelFillStyle, filteredMyReleaseRows, canCreateOrg, openOrgCreateModal, adminOrganizations, adminOrganizations, orgDistinctAdminCount, orgListLoading, openOrgEditModal,];
                    } },
                type: "button",
                ...{ class: "btn outline sm" },
                disabled: (!__VLS_ctx.canEditOrganization(org)),
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['outline']} */ ;
            /** @type {__VLS_StyleScopedClasses['sm']} */ ;
            // @ts-ignore
            [canEditOrganization,];
        }
        if (__VLS_ctx.adminOrganizations.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                colspan: "5",
                ...{ class: "empty-row" },
            });
            /** @type {__VLS_StyleScopedClasses['empty-row']} */ ;
        }
    }
}
else if (__VLS_ctx.innerTab === 'approval') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "tabPanelRef",
        ...{ class: "panel tab-panel admin-approval-panel" },
        ...{ style: (__VLS_ctx.tabPanelFillStyle) },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['admin-approval-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "admin-panel-head" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-panel-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "panel-title" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "panel-help" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-help']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "admin-panel-body" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-panel-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "summary-strip approval-summary" },
        role: "group",
        'aria-label': "审核摘要",
    });
    /** @type {__VLS_StyleScopedClasses['summary-strip']} */ ;
    /** @type {__VLS_StyleScopedClasses['approval-summary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "summary-item" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    (__VLS_ctx.syncPendingRows.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "summary-item" },
    });
    /** @type {__VLS_StyleScopedClasses['summary-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    (__VLS_ctx.syncDoneRows.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-toolbar admin-mini-toolbar" },
    });
    /** @type {__VLS_StyleScopedClasses['section-toolbar']} */ ;
    /** @type {__VLS_StyleScopedClasses['admin-mini-toolbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mini-tabs" },
        role: "tablist",
        'aria-label': "审核分区",
    });
    /** @type {__VLS_StyleScopedClasses['mini-tabs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.innerTab === 'overview'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'core'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'releases'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'org'))
                    return;
                if (!(__VLS_ctx.innerTab === 'approval'))
                    return;
                __VLS_ctx.approvalSubTab = 'pending';
                // @ts-ignore
                [innerTab, tabPanelFillStyle, adminOrganizations, syncPendingRows, syncDoneRows, approvalSubTab,];
            } },
        type: "button",
        ...{ class: "mini-tab" },
        ...{ class: ({ active: __VLS_ctx.approvalSubTab === 'pending' }) },
        role: "tab",
        'aria-selected': (__VLS_ctx.approvalSubTab === 'pending'),
    });
    /** @type {__VLS_StyleScopedClasses['mini-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.innerTab === 'overview'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'core'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'releases'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'org'))
                    return;
                if (!(__VLS_ctx.innerTab === 'approval'))
                    return;
                __VLS_ctx.approvalSubTab = 'done';
                // @ts-ignore
                [approvalSubTab, approvalSubTab, approvalSubTab,];
            } },
        type: "button",
        ...{ class: "mini-tab" },
        ...{ class: ({ active: __VLS_ctx.approvalSubTab === 'done' }) },
        role: "tab",
        'aria-selected': (__VLS_ctx.approvalSubTab === 'done'),
    });
    /** @type {__VLS_StyleScopedClasses['mini-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    if (__VLS_ctx.syncListLoading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "admin-loading" },
        });
        /** @type {__VLS_StyleScopedClasses['admin-loading']} */ ;
    }
    else if (__VLS_ctx.approvalSubTab === 'pending') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap admin-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        /** @type {__VLS_StyleScopedClasses['admin-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table admin-table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        /** @type {__VLS_StyleScopedClasses['admin-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [row] of __VLS_vFor((__VLS_ctx.syncPendingRows))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (row.skillName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.applyType);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.targetLevel);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.targetOrgName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "cell-reason" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-reason']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            (row.reason);
            if (row.reasonDetail) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "reason-detail" },
                });
                /** @type {__VLS_StyleScopedClasses['reason-detail']} */ ;
                (row.reasonDetail);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.approverLabel);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.innerTab === 'overview'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'core'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'releases'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'org'))
                            return;
                        if (!(__VLS_ctx.innerTab === 'approval'))
                            return;
                        if (!!(__VLS_ctx.syncListLoading))
                            return;
                        if (!(__VLS_ctx.approvalSubTab === 'pending'))
                            return;
                        __VLS_ctx.openReviewModal(row);
                        // @ts-ignore
                        [syncPendingRows, approvalSubTab, approvalSubTab, approvalSubTab, syncListLoading, openReviewModal,];
                    } },
                type: "button",
                ...{ class: "btn outline sm" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['outline']} */ ;
            /** @type {__VLS_StyleScopedClasses['sm']} */ ;
            // @ts-ignore
            [];
        }
        if (__VLS_ctx.syncPendingRows.length === 0) {
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
            ...{ class: "table-wrap admin-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        /** @type {__VLS_StyleScopedClasses['admin-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table admin-table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        /** @type {__VLS_StyleScopedClasses['admin-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [row] of __VLS_vFor((__VLS_ctx.syncDoneRows))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (row.skillName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.applyType);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.targetLevel);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.targetOrgName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "adm-badge" },
                ...{ class: (row.reviewResult === '通过' ? 'ok' : row.reviewResult === '不通过' ? 'bad' : '') },
            });
            /** @type {__VLS_StyleScopedClasses['adm-badge']} */ ;
            (row.reviewResult ?? '—');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "cell-reason" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-reason']} */ ;
            (row.reviewComment ?? '—');
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.completedAt ?? '—');
            // @ts-ignore
            [syncPendingRows, syncDoneRows,];
        }
        if (__VLS_ctx.syncDoneRows.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                colspan: "7",
                ...{ class: "empty-row" },
            });
            /** @type {__VLS_StyleScopedClasses['empty-row']} */ ;
        }
    }
}
else if (__VLS_ctx.innerTab === 'ops') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel tab-panel ops" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-dashboard-card ops-dashboard" },
        'aria-label': "Skill 运营看板",
    });
    /** @type {__VLS_StyleScopedClasses['ops-dashboard-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-dashboard']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "ops-title" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-filter" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-filter']} */ ;
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
                if (!!(__VLS_ctx.innerTab === 'org'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'approval'))
                    return;
                if (!(__VLS_ctx.innerTab === 'ops'))
                    return;
                __VLS_ctx.opsBoardSystem = 'fuyao';
                // @ts-ignore
                [innerTab, syncDoneRows, opsBoardSystem,];
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
                if (!!(__VLS_ctx.innerTab === 'org'))
                    return;
                if (!!(__VLS_ctx.innerTab === 'approval'))
                    return;
                if (!(__VLS_ctx.innerTab === 'ops'))
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
    if (__VLS_ctx.opsBoardSystem === 'company') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ops-data-note" },
            title: (`统计至：${__VLS_ctx.opsAsOfText}`),
        });
        /** @type {__VLS_StyleScopedClasses['ops-data-note']} */ ;
    }
    if (__VLS_ctx.showOpsExcelImport) {
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
            ...{ class: "btn btn-soft ops-import-btn" },
            disabled: (__VLS_ctx.opsImporting),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['btn-soft']} */ ;
        /** @type {__VLS_StyleScopedClasses['ops-import-btn']} */ ;
        (__VLS_ctx.opsImporting ? '导入中…' : 'Excel 导入');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-kpis" },
        role: "group",
        'aria-label': "运营看板指标",
    });
    /** @type {__VLS_StyleScopedClasses['ops-kpis']} */ ;
    for (const [card] of __VLS_vFor((__VLS_ctx.opsKpiCards))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (card.label),
            ...{ class: "ops-kpi" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-kpi']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (card.label);
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.formatOpsNumber(card.value));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (card.desc);
        // @ts-ignore
        [opsBoardSystem, opsBoardSystem, opsBoardSystem, opsAsOfText, showOpsExcelImport, onOpsExcelFileChange, triggerOpsExcelImport, opsImporting, opsImporting, opsKpiCards, formatOpsNumber,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-main-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-main-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-board-rows" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-board-rows']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-pair-row dept-row" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['dept-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-card-head" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-card-body ops-tree board-org-tree" },
        role: "tree",
    });
    /** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-tree']} */ ;
    /** @type {__VLS_StyleScopedClasses['board-org-tree']} */ ;
    if (__VLS_ctx.uiDeptFlat.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-empty-state" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-empty-state']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.opsEmptyText);
        if (__VLS_ctx.opsBoardSystem === 'company') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        }
    }
    for (const [row] of __VLS_vFor((__VLS_ctx.uiDeptFlat))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (row.path),
            ...{ class: "ops-tree-item" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-tree-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'org'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'approval'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'ops'))
                        return;
                    __VLS_ctx.selectOpsDept(row.path);
                    // @ts-ignore
                    [opsBoardSystem, uiDeptFlat, uiDeptFlat, opsEmptyText, selectOpsDept,];
                } },
            type: "button",
            ...{ class: "ops-tree-node" },
            ...{ class: ([
                    { active: __VLS_ctx.selectedOpsDeptPath === row.path },
                    'lv' + (row.levelNo > 6 ? 6 : row.levelNo),
                ]) },
            'aria-pressed': (__VLS_ctx.selectedOpsDeptPath === row.path),
        });
        /** @type {__VLS_StyleScopedClasses['ops-tree-node']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        if (row.hasChildren) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.innerTab === 'overview'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'core'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'releases'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'org'))
                            return;
                        if (!!(__VLS_ctx.innerTab === 'approval'))
                            return;
                        if (!(__VLS_ctx.innerTab === 'ops'))
                            return;
                        if (!(row.hasChildren))
                            return;
                        __VLS_ctx.toggleDeptExpand(row.path);
                        // @ts-ignore
                        [selectedOpsDeptPath, selectedOpsDeptPath, toggleDeptExpand,];
                    } },
                ...{ class: "ops-caret-btn" },
                role: "button",
                tabindex: "-1",
                'aria-label': (row.expanded ? '收起部门' : '展开部门'),
            });
            /** @type {__VLS_StyleScopedClasses['ops-caret-btn']} */ ;
            (row.expanded ? '▾' : '▸');
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ops-caret-placeholder" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['ops-caret-placeholder']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ops-tree-name" },
            title: (row.path),
        });
        /** @type {__VLS_StyleScopedClasses['ops-tree-name']} */ ;
        (row.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ops-tree-count" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-tree-count']} */ ;
        (row.skills);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ops-tree-download" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-tree-download']} */ ;
        (__VLS_ctx.formatOpsNumber(row.downloads));
        // @ts-ignore
        [formatOpsNumber,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-card ops-detail-table-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-detail-table-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-card-body" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-skill-table ops-dept-skill-table" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-skill-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-dept-skill-table']} */ ;
    if (__VLS_ctx.selectedDeptSkillRows.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-empty-state ops-detail-empty-state" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-empty-state']} */ ;
        /** @type {__VLS_StyleScopedClasses['ops-detail-empty-state']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-skill-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-skill-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table ops-detail-table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        /** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-name sticky-name" },
        });
        /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
        /** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell-ellipsis" },
            title: "Skill 名称",
        });
        /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-desc" },
        });
        /** @type {__VLS_StyleScopedClasses['col-desc']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell-ellipsis" },
            title: "描述",
        });
        /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-owner" },
        });
        /** @type {__VLS_StyleScopedClasses['col-owner']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell-ellipsis" },
            title: "发布人",
        });
        /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-download sticky-download" },
        });
        /** @type {__VLS_StyleScopedClasses['col-download']} */ ;
        /** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell-ellipsis" },
            title: "下载量",
        });
        /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [row, idx] of __VLS_vFor((__VLS_ctx.selectedDeptSkillRows))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (`dept-${row.name}-${row.dept}-${idx}`),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-name sticky-name" },
            });
            /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
            /** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "skill-name-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['skill-name-cell']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "skill-row-dot" },
            });
            /** @type {__VLS_StyleScopedClasses['skill-row-dot']} */ ;
            (idx + 1);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cell-ellipsis" },
                title: (row.name),
            });
            /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
            (row.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-desc" },
            });
            /** @type {__VLS_StyleScopedClasses['col-desc']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cell-ellipsis desc-text" },
                title: (row.description),
            });
            /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
            /** @type {__VLS_StyleScopedClasses['desc-text']} */ ;
            (row.description);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-owner" },
            });
            /** @type {__VLS_StyleScopedClasses['col-owner']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "owner-pill" },
                title: (__VLS_ctx.opsSkillOwner(row)),
            });
            /** @type {__VLS_StyleScopedClasses['owner-pill']} */ ;
            (__VLS_ctx.opsSkillOwner(row));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-download sticky-download" },
            });
            /** @type {__VLS_StyleScopedClasses['col-download']} */ ;
            /** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "download-pill" },
                title: (__VLS_ctx.formatOpsNumber(row.downloads)),
            });
            /** @type {__VLS_StyleScopedClasses['download-pill']} */ ;
            (__VLS_ctx.formatOpsNumber(row.downloads));
            // @ts-ignore
            [formatOpsNumber, formatOpsNumber, selectedDeptSkillRows, selectedDeptSkillRows, opsSkillOwner, opsSkillOwner,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-pair-row org-row" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-pair-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['org-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-card-head" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.opsOrgBarsHelpText);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-card-body" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-org-bars" },
        role: "list",
        'aria-label': "组织级 Skill 分布",
    });
    /** @type {__VLS_StyleScopedClasses['ops-org-bars']} */ ;
    if (__VLS_ctx.uiOrgBarsSorted.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-empty-state" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-empty-state']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.opsEmptyText);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
    for (const [row] of __VLS_vFor((__VLS_ctx.uiOrgBarsSorted))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.innerTab === 'overview'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'core'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'releases'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'org'))
                        return;
                    if (!!(__VLS_ctx.innerTab === 'approval'))
                        return;
                    if (!(__VLS_ctx.innerTab === 'ops'))
                        return;
                    __VLS_ctx.selectOpsOrg(row.name);
                    // @ts-ignore
                    [opsEmptyText, opsOrgBarsHelpText, uiOrgBarsSorted, uiOrgBarsSorted, selectOpsOrg,];
                } },
            key: (row.name),
            type: "button",
            ...{ class: "ops-org-bar" },
            ...{ class: ({ active: __VLS_ctx.selectedOpsOrgName === row.name }) },
        });
        /** @type {__VLS_StyleScopedClasses['ops-org-bar']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-org-bar-top" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-org-bar-top']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({
            title: (row.name),
        });
        (row.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (row.skills);
        (__VLS_ctx.formatOpsNumber(row.downloads));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-bar-track" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['ops-bar-track']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "ops-bar-fill" },
            ...{ style: ({ width: `${Math.round((row.downloads / __VLS_ctx.uiOrgBarsMax) * 100)}%` }) },
        });
        /** @type {__VLS_StyleScopedClasses['ops-bar-fill']} */ ;
        // @ts-ignore
        [formatOpsNumber, selectedOpsOrgName, uiOrgBarsMax,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-card ops-detail-table-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-detail-table-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-card-body" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-skill-table ops-org-skill-table" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-skill-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-org-skill-table']} */ ;
    if (__VLS_ctx.selectedOrgSkillRows.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-empty-state ops-detail-empty-state" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-empty-state']} */ ;
        /** @type {__VLS_StyleScopedClasses['ops-detail-empty-state']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-skill-table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-skill-table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table ops-detail-table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        /** @type {__VLS_StyleScopedClasses['ops-detail-table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-name sticky-name" },
        });
        /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
        /** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell-ellipsis" },
            title: "Skill 名称",
        });
        /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-desc" },
        });
        /** @type {__VLS_StyleScopedClasses['col-desc']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell-ellipsis" },
            title: "描述",
        });
        /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-owner" },
        });
        /** @type {__VLS_StyleScopedClasses['col-owner']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell-ellipsis" },
            title: "发布人",
        });
        /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "col-download sticky-download" },
        });
        /** @type {__VLS_StyleScopedClasses['col-download']} */ ;
        /** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell-ellipsis" },
            title: "下载量",
        });
        /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [row, idx] of __VLS_vFor((__VLS_ctx.selectedOrgSkillRows))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (`org-${row.name}-${row.publishName}-${idx}`),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-name sticky-name" },
            });
            /** @type {__VLS_StyleScopedClasses['col-name']} */ ;
            /** @type {__VLS_StyleScopedClasses['sticky-name']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "skill-name-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['skill-name-cell']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "skill-row-dot" },
            });
            /** @type {__VLS_StyleScopedClasses['skill-row-dot']} */ ;
            (idx + 1);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cell-ellipsis" },
                title: (row.name),
            });
            /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
            (row.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-desc" },
            });
            /** @type {__VLS_StyleScopedClasses['col-desc']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cell-ellipsis desc-text" },
                title: (row.description),
            });
            /** @type {__VLS_StyleScopedClasses['cell-ellipsis']} */ ;
            /** @type {__VLS_StyleScopedClasses['desc-text']} */ ;
            (row.description);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-owner" },
            });
            /** @type {__VLS_StyleScopedClasses['col-owner']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "owner-pill" },
                title: (__VLS_ctx.opsSkillOwner(row)),
            });
            /** @type {__VLS_StyleScopedClasses['owner-pill']} */ ;
            (__VLS_ctx.opsSkillOwner(row));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "col-download sticky-download" },
            });
            /** @type {__VLS_StyleScopedClasses['col-download']} */ ;
            /** @type {__VLS_StyleScopedClasses['sticky-download']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "download-pill" },
                title: (__VLS_ctx.formatOpsNumber(row.downloads)),
            });
            /** @type {__VLS_StyleScopedClasses['download-pill']} */ ;
            (__VLS_ctx.formatOpsNumber(row.downloads));
            // @ts-ignore
            [formatOpsNumber, formatOpsNumber, opsSkillOwner, opsSkillOwner, selectedOrgSkillRows, selectedOrgSkillRows,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "ops-card ops-top-card" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ops-top-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-card-head" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.opsTopTitle);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.opsTopSubTitle);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-card-body" },
    });
    /** @type {__VLS_StyleScopedClasses['ops-card-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ops-top-list" },
        role: "list",
    });
    /** @type {__VLS_StyleScopedClasses['ops-top-list']} */ ;
    if (__VLS_ctx.uiTopSkillsByDl.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-empty-state ops-top-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-empty-state']} */ ;
        /** @type {__VLS_StyleScopedClasses['ops-top-empty']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.opsEmptyText);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
    for (const [item] of __VLS_vFor((__VLS_ctx.uiTopSkillsByDl))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (`${item.rank}-${item.name}-${item.downloads}`),
            ...{ class: "ops-top-item" },
            role: "listitem",
        });
        /** @type {__VLS_StyleScopedClasses['ops-top-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-rank" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-rank']} */ ;
        (item.rank);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
        (item.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({
            title: (item.dept),
        });
        (__VLS_ctx.opsSkillOwner(item));
        (item.dept);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ops-download" },
        });
        /** @type {__VLS_StyleScopedClasses['ops-download']} */ ;
        (__VLS_ctx.formatOpsNumber(item.downloads));
        // @ts-ignore
        [formatOpsNumber, opsEmptyText, opsSkillOwner, opsTopTitle, opsTopSubTitle, uiTopSkillsByDl, uiTopSkillsByDl,];
    }
}
let __VLS_42;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
    to: "body",
}));
const __VLS_44 = __VLS_43({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_43));
const { default: __VLS_47 } = __VLS_45.slots;
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
        [versionPanelSkill, versionPanelSkill, versionPanelSkill, versionPanelSkill, versionPanelSkill, closeVersionPanel, closeVersionPanel,];
    }
}
// @ts-ignore
[];
var __VLS_45;
let __VLS_48;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
    to: "body",
}));
const __VLS_50 = __VLS_49({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
const { default: __VLS_53 } = __VLS_51.slots;
if (__VLS_ctx.orgModalOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeOrgModal) },
        ...{ class: "overlay" },
        role: "presentation",
    });
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-dialog v-dialog-wide" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "org-modal-title",
    });
    /** @type {__VLS_StyleScopedClasses['v-dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['v-dialog-wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-head" },
    });
    /** @type {__VLS_StyleScopedClasses['v-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
        id: "org-modal-title",
    });
    (__VLS_ctx.orgModalMode === 'create' ? '新建组织' : '配置组织');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeOrgModal) },
        type: "button",
        ...{ class: "close-x" },
        'aria-label': "关闭",
    });
    /** @type {__VLS_StyleScopedClasses['close-x']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "admin-form" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "admin-field" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.orgForm.orgName),
        type: "text",
        ...{ class: "search" },
        placeholder: "例如：IT装备部",
    });
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "admin-field" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.orgForm.orgCode),
        type: "text",
        ...{ class: "search" },
        placeholder: "例如：ORG-IT-001",
    });
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "admin-field" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.orgForm.admins),
        type: "text",
        ...{ class: "search" },
        placeholder: "多个账号用英文逗号分隔",
    });
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "admin-field admin-check" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['admin-check']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
    });
    (__VLS_ctx.orgForm.enabled);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['v-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeOrgModal) },
        type: "button",
        ...{ class: "btn outline sm" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['outline']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.submitOrgModal) },
        type: "button",
        ...{ class: "btn primary sm" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
}
// @ts-ignore
[orgModalOpen, closeOrgModal, closeOrgModal, closeOrgModal, orgModalMode, orgForm, orgForm, orgForm, orgForm, submitOrgModal,];
var __VLS_51;
let __VLS_54;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent1(__VLS_54, new __VLS_54({
    to: "body",
}));
const __VLS_56 = __VLS_55({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_55));
const { default: __VLS_59 } = __VLS_57.slots;
if (__VLS_ctx.reviewModalOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.closeReviewModal) },
        ...{ class: "overlay" },
        role: "presentation",
    });
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-dialog v-dialog-wide" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "review-modal-title",
    });
    /** @type {__VLS_StyleScopedClasses['v-dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['v-dialog-wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-head" },
    });
    /** @type {__VLS_StyleScopedClasses['v-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
        id: "review-modal-title",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeReviewModal) },
        type: "button",
        ...{ class: "close-x" },
        'aria-label': "关闭",
    });
    /** @type {__VLS_StyleScopedClasses['close-x']} */ ;
    if (__VLS_ctx.reviewTarget) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "v-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['v-sub']} */ ;
        (__VLS_ctx.reviewTarget.skillName);
        (__VLS_ctx.reviewTarget.targetOrgName);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "admin-form" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "review-decision-row" },
        role: "radiogroup",
        'aria-label': "审核结论",
    });
    /** @type {__VLS_StyleScopedClasses['review-decision-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "admin-radio" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-radio']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "radio",
        value: "approve",
    });
    (__VLS_ctx.reviewDecision);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "admin-radio" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-radio']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "radio",
        value: "reject",
    });
    (__VLS_ctx.reviewDecision);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "admin-field" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.textarea)({
        value: (__VLS_ctx.reviewComment),
        ...{ class: "admin-textarea" },
        rows: "4",
        placeholder: "请填写审核意见",
    });
    /** @type {__VLS_StyleScopedClasses['admin-textarea']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "v-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['v-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.closeReviewModal) },
        type: "button",
        ...{ class: "btn outline sm" },
        disabled: (__VLS_ctx.reviewSubmitting),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['outline']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.submitReviewModal) },
        type: "button",
        ...{ class: "btn primary sm" },
        disabled: (__VLS_ctx.reviewSubmitting),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['sm']} */ ;
}
// @ts-ignore
[reviewModalOpen, closeReviewModal, closeReviewModal, closeReviewModal, reviewTarget, reviewTarget, reviewTarget, reviewDecision, reviewDecision, reviewComment, reviewSubmitting, reviewSubmitting, submitReviewModal,];
var __VLS_57;
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
