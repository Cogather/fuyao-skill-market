<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { CSSProperties } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SkillCard from '../../components/skill/SkillCard.vue';
import UploadSkillModal from '../../components/skill/UploadSkillModal.vue';
import { useSkillMarketStore } from '../../stores/skillMarketStore';
import type {
  DepartmentTreeNodeDto,
  OrganizationDto,
  SkillDownloadSourcePage,
  SkillListParamsDto,
  SyncApplicationListItemDto,
} from '../../services/skillMarket/apiTypes';
import { apiRecordToSkill, skillListQueryToDto } from '../../services/skillMarket/mappers';
import type { MarketDeptForestNode } from '../../services/skillMarket/marketDeptTreeFromApi';
import { mapDepartmentTreeDtoToForest } from '../../services/skillMarket/marketDeptTreeFromApi';
import {
  marketRoleCanCreateOrganization,
  marketRoleShowsOpsAndReview,
  marketRoleShowsOrgManagement,
} from '../../services/skillMarket/roleUi';
import type {
  OverviewQuickFilter,
  Skill,
  SkillMarketScope,
  SkillUploadPayload,
  UserInnerTab,
} from '../../types/skill';
import { emptyOpsDashboardBundle } from '../../services/skillMarket/mock/opsDashboardUiDefaults';
import {
  parseDeptNamePath,
  type DeptTreeNode,
  type OpsDashboardBundle,
  type OpsSkillDetailRow,
} from '../../utils/opsExcelImport';
import { buildOpsDashboardBundle, parseOpsExcelBuffer } from '../../utils/opsExcelImport';

const store = useSkillMarketStore();
const {
  skills,
  myPublishedSkills,
  refreshMyPublishedSkills,
  totalDownloads,
  totalSkills,
  downloadsLast30Days,
  orgCount,
  marketClient,
  currentUserRole,
} = store;

const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const route = useRoute();
const router = useRouter();

const OVERVIEW_DEFAULT_VISIBLE_ROWS = 3;
const OVERVIEW_MAX_PAGE_SIZE = 48;
/** 标签数超过该值时默认折叠，可点「展开」拉高显示 */
const OVERVIEW_TAGS_COLLAPSE_THRESHOLD = 10;

const innerTabAliases: Record<string, UserInnerTab> = {
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

function routeTabFromQuery(value: unknown): UserInnerTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return 'overview';
  }
  return innerTabAliases[raw] ?? innerTabAliases[raw.toLowerCase()] ?? 'overview';
}

function overviewColumnCountByViewport(): number {
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

function overviewPageSizeByLayout(columns: number, rows: number): number {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  return Math.min(OVERVIEW_MAX_PAGE_SIZE, safeColumns * safeRows);
}

function initialOverviewPageSize(): number {
  return overviewPageSizeByLayout(overviewColumnCountByViewport(), OVERVIEW_DEFAULT_VISIBLE_ROWS);
}

const innerTab = ref<UserInnerTab>(routeTabFromQuery(route.query.tab));
const uploadOpen = ref(false);
const search = ref('');
/** Mock：组织展示名；HTTP：组织 id 字符串（对接 `orgId`） */
const levelFilter = ref('all');
/** 市场部门级联：路径各段对应 `departmentL1`～`departmentL6`（与设计文档 §3.3.3 一致，多字段 AND） */
const overviewMarketDeptSegments = ref<string[]>([]);
const overviewDeptCascaderOpen = ref(false);
const marketDeptCascaderWrapRef = ref<HTMLElement | null>(null);
const marketDeptCascaderPanelRef = ref<HTMLElement | null>(null);
/** 级联面板挂到 body + fixed，按触发器靠左且不超出视口，避免撑开页面滚动容器 */
const marketDeptPanelLayout = ref<{ left: number; top: number; maxWidth: number } | null>(null);
let deptPanelScrollCleanup: (() => void) | null = null;
const categoryFilter = ref('all');
const selectedTags = ref<string[]>([]);
const quickFilter = ref<OverviewQuickFilter>('all');
/** 市场总览左侧标签区：标签过多时由用户展开 */
const overviewTagListExpanded = ref(false);
const tabPanelRef = ref<HTMLElement | null>(null);
const tabPanelMinHeight = ref(0);
const marketContentRef = ref<HTMLElement | null>(null);
const overviewGridRef = ref<HTMLElement | null>(null);
/** Mock / 本地全量筛选后，渐进展示的条数 */
const overviewVisibleCount = ref(initialOverviewPageSize());
/** HTTP：分页累加的原始列表（再经与 Mock 一致的筛选/排序） */
const overviewRemoteItems = ref<Skill[]>([]);
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

const adminOrganizations = ref<OrganizationDto[]>([]);
const orgListLoading = ref(false);
/** `fetchDepartmentsTree` 映射后的森林；成功则级联以全量部门为准，否则回退为当前列表推导 */
const marketOverviewDeptTreeFromApi = ref<MarketDeptForestNode[] | null>(null);
const marketOverviewDeptTreeLoading = ref(false);
/** `App.vue` 对父页面 `postMessage` 的 `departmentList` 的 provide（同一 Ref，随消息更新） */
const departmentListFromParent = inject<Ref<DepartmentTreeNodeDto[] | null> | undefined>('departmentList');
const orgModalOpen = ref(false);
const orgModalMode = ref<'create' | 'edit'>('create');
const orgForm = ref({
  id: 0 as number,
  orgName: '',
  orgCode: '',
  admins: '',
  enabled: true,
});

const approvalSubTab = ref<'pending' | 'done'>('pending');
const syncPendingRows = ref<SyncApplicationListItemDto[]>([]);
const syncDoneRows = ref<SyncApplicationListItemDto[]>([]);
const syncListLoading = ref(false);

const reviewModalOpen = ref(false);
const reviewTarget = ref<SyncApplicationListItemDto | null>(null);
const reviewDecision = ref<'approve' | 'reject'>('approve');
const reviewComment = ref('');
const reviewSubmitting = ref(false);

const orgDistinctAdminCount = computed(() => {
  const set = new Set<string>();
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

const versionPanelSkill = ref<Skill | null>(null);
const detailPanelSkill = ref<Skill | null>(null);
let overviewPageSizeFrame = 0;

function formatYmd(date: Date): string {
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

function toListScope(filter: OverviewQuickFilter): SkillMarketScope {
  return ['personal', 'devDept', 'pdu', 'productLine'].includes(filter)
    ? (filter as SkillMarketScope)
    : 'all';
}

type MarketDeptMutable = { name: string; children: Map<string, MarketDeptMutable> };

type MarketDeptNode = MarketDeptForestNode;

function buildMarketOverviewDeptForest(skillList: Skill[]): MarketDeptNode[] {
  const root: MarketDeptMutable = { name: '', children: new Map() };
  for (const s of skillList) {
    const segs = parseDeptNamePath(s.dept_name ?? '');
    let node = root;
    for (const seg of segs) {
      if (!node.children.has(seg)) {
        node.children.set(seg, { name: seg, children: new Map() });
      }
      node = node.children.get(seg)!;
    }
  }
  function finalize(m: MarketDeptMutable, parentPath: string, levelNo: number): MarketDeptNode {
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

function matchesScopeFilter(skill: Skill, scope: SkillMarketScope): boolean {
  if (scope === 'all') {
    return true;
  }
  if (scope === 'personal') {
    return (
      (skill.publish_level ?? skill.level ?? '').includes('个人') ||
      (skill.publish_name ?? skill.publisher ?? '').includes('个人') ||
      Boolean(skill.ownedByUser)
    );
  }
  if (scope === 'devDept') {
    return (skill.publish_level ?? '').trim() === '组织级';
  }
  if (scope === 'pdu') {
    return (skill.publish_name ?? '').includes('PDU');
  }
  return (skill.publish_name ?? '').includes('产品线');
}

function matchesKeyword(skill: Skill, q: string): boolean {
  if (!q) {
    return true;
  }
  return (skill.name ?? skill.skill_id ?? '').toLowerCase().includes(q);
}

function matchesOrgFilter(skill: Skill): boolean {
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

function skillCategory(skill: Skill): string {
  return (skill.tagFunctional ?? '').trim();
}

function matchesCategoryFilter(skill: Skill): boolean {
  return categoryFilter.value === 'all' || skillCategory(skill) === categoryFilter.value;
}

function skillTags(skill: Skill): string[] {
  return (skill.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
}

function matchesSelectedTags(skill: Skill): boolean {
  if (selectedTags.value.length === 0) {
    return true;
  }
  const tags = skillTags(skill);
  return selectedTags.value.some((tag) => tags.includes(tag));
}

function matchesPrimaryFiltersSansDept(skill: Skill, q: string, scope: SkillMarketScope): boolean {
  return (
    matchesScopeFilter(skill, scope) &&
    matchesKeyword(skill, q) &&
    matchesOrgFilter(skill) &&
    matchesCategoryFilter(skill)
  );
}

function matchesOverviewDeptCascade(skill: Skill): boolean {
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

function matchesPrimaryFilters(skill: Skill, q: string, scope: SkillMarketScope): boolean {
  return (
    matchesPrimaryFiltersSansDept(skill, q, scope) && matchesOverviewDeptCascade(skill)
  );
}

const orgOptions = computed(() => {
  const opts = new Set<string>();
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

const marketOrgSelectOptions = computed(() =>
  [...adminOrganizations.value]
    .filter((o) => o.enabled)
    .sort((a, b) => a.orgName.localeCompare(b.orgName, 'zh-Hans-CN')),
);

const skillsForMarketDeptTree = computed(() => {
  const q = search.value.trim().toLowerCase();
  const scope = toListScope(quickFilter.value);
  return skills.value.filter((s) => matchesPrimaryFiltersSansDept(s, q, scope));
});

const marketOverviewDeptTree = computed((): MarketDeptNode[] => {
  const apiTree = marketOverviewDeptTreeFromApi.value;
  if (apiTree && apiTree.length > 0) {
    return apiTree;
  }
  return buildMarketOverviewDeptForest(skillsForMarketDeptTree.value);
});

function marketOverviewDeptNodeByPartial(segments: string[]): MarketDeptNode | null {
  let nodes = marketOverviewDeptTree.value;
  let cur: MarketDeptNode | null = null;
  for (const seg of segments) {
    cur = nodes.find((n) => n.name === seg) ?? null;
    if (!cur) {
      return null;
    }
    nodes = cur.children;
  }
  return cur;
}

function overviewDeptCascadeOptionsAt(levelIndex: number): string[] {
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
    return [] as { levelIndex: number; options: string[]; active: string | undefined }[];
  }
  const segs = overviewMarketDeptSegments.value;
  const cols: { levelIndex: number; options: string[]; active: string | undefined }[] = [];
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

function toggleOverviewDeptCascader(): void {
  overviewDeptCascaderOpen.value = !overviewDeptCascaderOpen.value;
  if (overviewDeptCascaderOpen.value) {
    updateMarketDeptPanelLayout();
    void nextTick(() => {
      updateMarketDeptPanelLayout();
    });
  }
}

function closeOverviewDeptCascader(): void {
  overviewDeptCascaderOpen.value = false;
}

function onOverviewDeptCascaderPick(levelIndex: number, name: string): void {
  onOverviewDeptCascadeChange(levelIndex, name);
}

function marketOverviewDeptPickHasChildren(levelIndex: number, name: string): boolean {
  const prefix = [...overviewMarketDeptSegments.value.slice(0, levelIndex), name];
  const n = marketOverviewDeptNodeByPartial(prefix);
  return Boolean(n && n.children.length > 0);
}

function clearOverviewDeptCascader(): void {
  overviewMarketDeptSegments.value = [];
  overviewDeptCascaderOpen.value = false;
}

function onMarketDeptCascaderDocDown(ev: MouseEvent): void {
  if (!overviewDeptCascaderOpen.value) {
    return;
  }
  const t = ev.target as Node;
  const root = marketDeptCascaderWrapRef.value;
  const panel = marketDeptCascaderPanelRef.value;
  if (root?.contains(t) || panel?.contains(t)) {
    return;
  }
  overviewDeptCascaderOpen.value = false;
}

function onMarketDeptCascaderKeydown(ev: KeyboardEvent): void {
  if (!overviewDeptCascaderOpen.value) {
    return;
  }
  if (ev.key === 'Escape') {
    overviewDeptCascaderOpen.value = false;
  }
}

function updateMarketDeptPanelLayout(): void {
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

const marketDeptCascaderPanelStyle = computed((): CSSProperties => {
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
    const onScroll = (): void => {
      updateMarketDeptPanelLayout();
    };
    window.addEventListener('scroll', onScroll, true);
    deptPanelScrollCleanup = (): void => {
      window.removeEventListener('scroll', onScroll, true);
    };
  } else {
    marketDeptPanelLayout.value = null;
  }
});

function onOverviewDeptCascadeChange(levelIndex: number, raw: string): void {
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
  const opts = new Set<string>();
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
  const opts = new Set<string>();
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

const showOverviewTagExpandToggle = computed(
  () => tagOptions.value.length > OVERVIEW_TAGS_COLLAPSE_THRESHOLD,
);

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

function overviewGridColumnCount(grid: HTMLElement): number {
  const columns = window.getComputedStyle(grid).gridTemplateColumns;
  if (columns && columns !== 'none') {
    const count = columns.split(/\s+/).filter(Boolean).length;
    if (count > 0) {
      return count;
    }
  }
  return overviewColumnCountByViewport();
}

function syncOverviewPageSize(): void {
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
      const firstCard = grid.firstElementChild as HTMLElement | null;
      const measuredCardHeight = firstCard?.getBoundingClientRect().height ?? 0;
      const cardHeight = Math.max(1, measuredCardHeight || 136);
      const filters = content.querySelector<HTMLElement>('.filters');
      const filtersHeight = filters?.offsetHeight ?? 0;
      const filtersMarginBottom = filters
        ? Number.parseFloat(window.getComputedStyle(filters).marginBottom) || 0
        : 0;
      const footerHeight = content.querySelector<HTMLElement>('.overview-list-footer')?.offsetHeight ?? 0;
      const contentRect = content.getBoundingClientRect();
      const panel = tabPanelRef.value;
      const panelRect = panel?.getBoundingClientRect();
      const panelPaddingBottom = panel
        ? Number.parseFloat(window.getComputedStyle(panel).paddingBottom) || 0
        : 0;
      const plannedContentHeight =
        panelRect && tabPanelMinHeight.value > 0
          ? tabPanelMinHeight.value - (contentRect.top - panelRect.top) - panelPaddingBottom
          : content.clientHeight;
      const availableHeight = Math.max(
        cardHeight,
        plannedContentHeight - filtersHeight - filtersMarginBottom - footerHeight,
      );
      const rows = Math.max(
        OVERVIEW_DEFAULT_VISIBLE_ROWS,
        Math.floor((availableHeight + rowGap) / (cardHeight + rowGap)),
      );
      const nextSize = overviewPageSizeByLayout(columns, rows);
      if (nextSize !== pageSize.value) {
        pageSize.value = nextSize;
      }
    });
  });
}

function syncTabPanelMinHeight(): void {
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

function syncResponsiveLayout(): void {
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
  } else {
    list.sort((a, b) => (b.skill_id ?? '').localeCompare(a.skill_id ?? ''));
  }
  return list;
});

function applyOverviewDisplayFilters(raw: Skill[]): Skill[] {
  if (transportIsHttp) {
    let list = [...raw];
    if (quickFilter.value === 'highDl') {
      list.sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
    } else {
      list.sort((a, b) => (b.skill_id ?? '').localeCompare(a.skill_id ?? ''));
    }
    return list;
  }
  const q = search.value.trim().toLowerCase();
  const scope = toListScope(quickFilter.value);
  let list = raw.filter(
    (s) => matchesPrimaryFilters(s, q, scope) && matchesSelectedTags(s),
  );
  if (quickFilter.value === 'highDl') {
    list = [...list].sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
  } else {
    list = [...list].sort((a, b) => (b.skill_id ?? '').localeCompare(a.skill_id ?? ''));
  }
  return list;
}

function mergeOverviewSkillsById(prev: Skill[], batch: Skill[]): Skill[] {
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

function buildOverviewSkillListParams(pageNo: number, fetchSize: number): SkillListParamsDto {
  const scope = toListScope(quickFilter.value);
  const base = skillListQueryToDto({
    keyword: search.value,
    page: pageNo,
    pageSize: fetchSize,
    scope,
  });
  const params: SkillListParamsDto = {
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
  ] as const;
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

async function startOverviewRemoteFetch(): Promise<void> {
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

async function loadOverviewRemoteMore(expectSeq?: number): Promise<void> {
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
    const merged =
      pageNo === 1 ? batch : mergeOverviewSkillsById(overviewRemoteItems.value, batch);
    overviewRemoteItems.value = merged;
    overviewRemoteTotal.value = env.data.total;
    const received = batch.length;
    if (
      received === 0 ||
      merged.length >= env.data.total ||
      received < fetchSize
    ) {
      overviewRemoteExhausted.value = true;
    } else {
      overviewRemoteNextPage.value = pageNo + 1;
    }
  } finally {
    overviewRemoteLoading.value = false;
    scheduleMaybeFillOverviewViewport();
  }
}

function onOverviewMarketScroll(): void {
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
function scheduleMaybeFillOverviewViewport(): void {
  void nextTick(() => {
    requestAnimationFrame(() => {
      tryFillOverviewUntilScrollable();
    });
  });
}

function tryFillOverviewUntilScrollable(): void {
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

async function handleOverviewScrollNearEnd(): Promise<void> {
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

const overviewHasMoreLocal = computed(
  () => overviewVisibleCount.value < overviewFilteredAll.value.length,
);

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

watch(
  [search, quickFilter, levelFilter, categoryFilter, selectedTags, overviewMarketDeptSegments],
  () => {
  overviewVisibleCount.value = pageSize.value;
  if (transportIsHttp) {
    void startOverviewRemoteFetch();
  }
  syncOverviewPageSize();
  },
  { deep: true },
);

watch(
  () => filteredSkills.value.length,
  () => {
    syncOverviewPageSize();
    scheduleMaybeFillOverviewViewport();
  },
  { flush: 'post' },
);

watch(
  () => skills.value.length,
  () => {
    syncOverviewPageSize();
  },
);

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
    } else {
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

function toggleTagFilter(tag: string): void {
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter((item) => item !== tag)
    : [...selectedTags.value, tag];
}

function clearTagFilters(): void {
  selectedTags.value = [];
}

function openUpload(): void {
  uploadOpen.value = true;
}

function goTab(tab: UserInnerTab, replace = false): void {
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
  } else {
    void router.push(target);
  }
}

function normalizeSyncRecord(raw: unknown): SyncApplicationListItemDto {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
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

function canEditOrganization(org: OrganizationDto): boolean {
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

async function loadAdminOrganizations(): Promise<void> {
  orgListLoading.value = true;
  try {
    const r = await marketClient.fetchOrganizations();
    if (r.code === 0 && Array.isArray(r.data)) {
      adminOrganizations.value = r.data;
      orgCount.value = r.data.length;
    }
  } finally {
    orgListLoading.value = false;
  }
}

function applyInjectedDepartmentTreeIfAny(): void {
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

async function loadMarketDepartmentsTreeForOverview(): Promise<void> {
  marketOverviewDeptTreeLoading.value = true;
  try {
    const r = await marketClient.fetchDepartmentsTree();
    if (r.code === 0 && Array.isArray(r.data) && r.data.length > 0) {
      marketOverviewDeptTreeFromApi.value = mapDepartmentTreeDtoToForest(r.data);
    } else {
      marketOverviewDeptTreeFromApi.value = null;
    }
    applyInjectedDepartmentTreeIfAny();
  } finally {
    marketOverviewDeptTreeLoading.value = false;
  }
}

watch(
  () => departmentListFromParent?.value,
  () => {
    applyInjectedDepartmentTreeIfAny();
  },
  { deep: true, immediate: true, },
);

async function loadSyncApplicationRows(): Promise<void> {
  syncListLoading.value = true;
  try {
    const [p, d] = await Promise.all([
      marketClient.fetchSyncApplications({ tab: 'pending', pageNo: 1, pageSize: 100 }),
      marketClient.fetchSyncApplications({ tab: 'done', pageNo: 1, pageSize: 100 }),
    ]);
    if (p.code === 0 && p.data?.records) {
      syncPendingRows.value = p.data.records.map((row: unknown) => normalizeSyncRecord(row));
    }
    if (d.code === 0 && d.data?.records) {
      syncDoneRows.value = d.data.records.map((row: unknown) => normalizeSyncRecord(row));
    }
  } finally {
    syncListLoading.value = false;
  }
}

watch(
  () => route.query.tab,
  (tab) => {
    const nextTab = routeTabFromQuery(tab);
    if (nextTab !== innerTab.value) {
      innerTab.value = nextTab;
    }
  },
);

watch(
  () => [currentUserRole.value, innerTab.value] as const,
  ([role, tab]) => {
    if (!role) {
      return;
    }
    if (!marketRoleShowsOrgManagement(role) && (tab === 'org' || tab === 'approval')) {
      goTab('overview', true);
    }
  },
);

watch(
  innerTab,
  (tab) => {
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
  },
  { immediate: true },
);

function showToast(message: string, ms = 3000): void {
  toast.value = message;
  setTimeout(() => {
    toast.value = '';
  }, ms);
}

function openOrgCreateModal(): void {
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

function openOrgEditModal(org: OrganizationDto): void {
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

function closeOrgModal(): void {
  orgModalOpen.value = false;
}

async function submitOrgModal(): Promise<void> {
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
  } else {
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

function openReviewModal(row: SyncApplicationListItemDto): void {
  reviewTarget.value = row;
  reviewDecision.value = 'approve';
  reviewComment.value = '';
  reviewModalOpen.value = true;
}

function closeReviewModal(): void {
  reviewModalOpen.value = false;
  reviewTarget.value = null;
}

async function submitReviewModal(): Promise<void> {
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
  } finally {
    reviewSubmitting.value = false;
  }
}

function skillKey(skill: Skill): string {
  return skill.id ?? skill.skill_id;
}

function skillTitle(skill: Skill): string {
  return skill.name ?? skill.skill_id;
}

function skillVersion(skill: Skill): string {
  return skill.version ?? '1.0.0';
}

function skillAuthor(skill: Skill): string {
  const raw = skill.owner_list?.trim();
  if (raw) {
    try {
      const owners = JSON.parse(raw) as Array<{ lastName?: string; Account?: string }>;
      const owner = owners[0];
      if (owner?.lastName || owner?.Account) {
        return [owner.lastName, owner.Account].filter(Boolean).join(' ');
      }
    } catch {
      // owner_list can be a free-form string in imported Excel rows.
    }
  }
  return skill.publish_name ?? skill.publisher ?? '当前用户';
}

function skillScopeLabel(skill: Skill): string {
  const level = (skill.publish_level ?? skill.level ?? skill.tagOrg ?? '').trim();
  if (level.includes('组织')) {
    return skill.publish_name ? `组织级 · ${skill.publish_name}` : '组织级';
  }
  if (level.includes('个人')) {
    return '个人级';
  }
  return level || '-';
}

function skillScopeClass(skill: Skill): string {
  return skillScopeLabel(skill).includes('组织') ? 'scope-org' : 'scope-personal';
}

function skillDownloadCount(skill: Skill): string {
  return (skill.download_count ?? skill.downloads ?? 0).toLocaleString('zh-CN');
}

function detailRows(skill: Skill): { label: string; value: string }[] {
  return [
    { label: 'author', value: skillAuthor(skill) },
    { label: 'version', value: skillVersion(skill) },
    { label: 'category', value: skill.tagFunctional ?? '-' },
    { label: 'publish_level', value: skill.publish_level ?? skill.level ?? '-' },
    { label: 'publish_name', value: skill.publish_name ?? skill.publisher ?? '-' },
    { label: 'dept_name', value: skill.dept_name || '-' },
  ];
}

function detailFileTree(skill: Skill): string {
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

function skillRequirements(skill: Skill): string {
  return skillScopeLabel(skill).includes('组织') ? '需要组织内权限、Python 3.10+' : '本地运行环境、Python 3.10+';
}

function skillTagSummary(skill: Skill): string {
  const deptParts = parseDeptNamePath(skill.dept_name ?? '');
  return [skill.tagFunctional, skill.skill_id, deptParts[deptParts.length - 1]]
    .filter(Boolean)
    .join(' ');
}

async function parseSkillArchiveForUpload(file: File): Promise<{
  duplicate: boolean;
  meta: {
    name: string;
    version: string;
    description: string;
    author: string;
    category: string;
    requirements: string;
    tags: string;
    level: string;
  };
}> {
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

async function onUploadSubmit(payload: SkillUploadPayload): Promise<void> {
  try {
    const result = await store.uploadSkill(payload);
    overviewVisibleCount.value = pageSize.value;
    if (transportIsHttp) {
      void startOverviewRemoteFetch();
    }
    await refreshMyPublishedSkills();
    showToast(
      result.created
        ? `已发布新 Skill「${result.skill.name}」v${result.skill.version}`
        : `同名 Skill 已更新为 v${result.skill.version}（版本追加）`,
      4000,
    );
  } catch (e) {
    showToast(e instanceof Error ? e.message : '上传失败');
  }
}

function patchSkillsDownloadCountAfterDownload(id: string, skill: Skill): void {
  const dl = skill.download_count ?? skill.downloads ?? 0;
  if (transportIsHttp) {
    overviewRemoteItems.value = overviewRemoteItems.value.map((s) =>
      skillKey(s) === id ? { ...s, download_count: dl, downloads: dl } : s,
    );
  }
  if (detailPanelSkill.value && skillKey(detailPanelSkill.value) === id) {
    detailPanelSkill.value = { ...detailPanelSkill.value, download_count: dl, downloads: dl };
  }
}

async function onDownload(id: string, sourcePage: SkillDownloadSourcePage = 'market'): Promise<void> {
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
  } catch (e) {
    showToast(e instanceof Error ? e.message : '下载失败');
  }
}

function onViewVersions(id: string): void {
  const skill = skills.value.find((item) => skillKey(item) === id);
  if (skill) {
    versionPanelSkill.value = skill;
  }
}

function openDetailPanel(id: string): void {
  const skill = skills.value.find((item) => skillKey(item) === id);
  if (skill) {
    detailPanelSkill.value = skill;
  }
}

function closeDetailPanel(): void {
  detailPanelSkill.value = null;
}

function onDetailDownload(): void {
  if (!detailPanelSkill.value) {
    return;
  }
  void onDownload(skillKey(detailPanelSkill.value), 'detail');
}

function onTrySkill(): void {
  if (!detailPanelSkill.value) {
    return;
  }
  showToast(`已进入在线试用（演示）：${skillTitle(detailPanelSkill.value)}`);
}

function closeVersionPanel(): void {
  versionPanelSkill.value = null;
}

const coreQuickEntries: { key: 'all' | 'devDept' | 'pdu' | 'productLine'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'devDept', label: '开发部' },
  { key: 'pdu', label: 'PDU' },
  { key: 'productLine', label: '产品线' },
];

const coreLevelStats: { key: string; label: string; count: number }[] = [
  { key: 'core', label: 'CoreHarness', count: 9 },
  { key: 'dev', label: '开发部级', count: 4 },
  { key: 'pdu', label: 'PDU级', count: 3 },
  { key: 'pl', label: '产品线级', count: 2 },
];

const coreQuick = ref<'all' | 'devDept' | 'pdu' | 'productLine'>('all');
const coreSearch = ref('');

const coreSkills = computed(() => {
  let list = [...skills.value];
  const q = coreSearch.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (s) =>
        (s.name ?? s.skill_id ?? '').toLowerCase().includes(q) ||
        (s.publisher ?? s.publish_name ?? '').toLowerCase().includes(q) ||
        (s.tagOrg ?? s.dept_name ?? '').toLowerCase().includes(q) ||
        (s.tagFunctional ?? '').toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q),
    );
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

function onApplyCoreHarness(): void {
  toast.value = '已提交申请（演示）：将你的 Skill 纳入 CoreHarness';
  setTimeout(() => {
    toast.value = '';
  }, 2500);
}

type ReleaseFilterKey =
  | 'all'
  | 'personal'
  | 'published'
  | 'reviewing'
  | 'rejected'
  | 'coreApply';

const releaseFilter = ref<ReleaseFilterKey>('all');

const releaseFilters: { key: ReleaseFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'personal', label: '个人级' },
  { key: 'published', label: '组织级' },
  { key: 'reviewing', label: '组织审核中' },
  { key: 'rejected', label: '组织已驳回' },
];

type ReleaseStatusKey = 'personal-live' | 'published' | 'reviewing-dev' | 'rejected-pdu';

function statusOf(skill: Skill): ReleaseStatusKey {
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

function statusText(st: ReleaseStatusKey): string {
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

function lastActionText(st: ReleaseStatusKey): string {
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

function releaseCategoryLabel(skill: Skill): string {
  return skill.tagFunctional || '通用类';
}

function releasePrimaryLevel(skill: Skill): string {
  if ((skill.publish_level ?? skill.level ?? '').includes('个人')) {
    return '个人级';
  }
  return '组织级';
}

function releaseOrgLabel(skill: Skill): string {
  if ((skill.publish_level ?? skill.level ?? '').includes('个人')) {
    return '个人空间';
  }
  return skill.publish_name ?? skill.level ?? '';
}

function releaseSyncActionText(row: { skill: Skill; statusKey: ReleaseStatusKey; personal: boolean }): string {
  if (row.statusKey === 'published' && !row.personal) {
    return '更新同步';
  }
  return '同步至公司组织';
}

function onReleaseNewVersion(row: { skill: Skill }): void {
  toastAction(`新版本（演示）：为「${skillTitle(row.skill)}」追加版本`);
  openUpload();
}

function onReleaseSync(row: { skill: Skill; statusKey: ReleaseStatusKey; personal: boolean }): void {
  const action = releaseSyncActionText(row);
  toastAction(`${action}（演示）：${skillTitle(row.skill)}`);
}

function onReleaseRecord(row: { skill: Skill }): void {
  toastAction(`记录（演示）：查看「${skillTitle(row.skill)}」操作记录`);
}

const myReleaseRows = computed(() => {
  return myReleases.value.map((s) => {
    const st = statusOf(s);
    const isPersonal =
      st === 'personal-live' ||
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
  const totalDl = rows.reduce(
    (sum, x) => sum + (x.skill.download_count ?? x.skill.downloads ?? 0),
    0,
  );
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

function toastAction(message: string): void {
  toast.value = message;
  setTimeout(() => {
    toast.value = '';
  }, 2500);
}

function onUploadExistingVersion(): void {
  toastAction('上传已有 Skill 新版本（演示）：请在弹窗中选择同名 Skill 以追加版本');
  openUpload();
}

const opsImportedBundle = ref<OpsDashboardBundle | null>(null);
const opsImporting = ref(false);
const opsExcelInputRef = ref<HTMLInputElement | null>(null);
const fuyaoOpsDashboardBundleRef = ref<OpsDashboardBundle | null>(null);
const companyOpsDashboardBundleRef = ref<OpsDashboardBundle | null>(null);

const opsBoardSystem = ref<'fuyao' | 'company'>('company');
/** 公司运营看板「Excel 导入」仅管理员可用；扶摇看板不提供导入 */
const showOpsExcelImport = computed(
  () => opsBoardSystem.value === 'company' && marketRoleShowsOpsAndReview(currentUserRole.value),
);
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

type OpsKpiCard = { label: string; value: string; desc: string };

type FlatDeptRow = {
  name: string;
  path: string;
  levelNo: number;
  skills: number;
  downloads: number;
  hasChildren: boolean;
  expanded: boolean;
};

const expandedDeptPaths = ref<Set<string>>(new Set());

function formatOpsNumber(value: string | number): string {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value).replace(/,/g, ''), 10);
  return Number.isFinite(parsed) ? parsed.toLocaleString('zh-CN') : String(value ?? '-');
}

function opsSkillOwner(row: OpsSkillDetailRow): string {
  return row.owner || row.publishName || '未填写发布人';
}

function collectDefaultExpandedDeptPaths(nodes: DeptTreeNode[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      out.add(n.path);
    }
  }
  return out;
}

function collectDeptDisplayRoots(nodes: DeptTreeNode[]): DeptTreeNode[] {
  const out: DeptTreeNode[] = [];
  for (const node of nodes) {
    if (node.levelNo >= OPS_DEPT_DISPLAY_START_LEVEL) {
      out.push(node);
      continue;
    }
    out.push(...collectDeptDisplayRoots(node.children ?? []));
  }
  return out;
}

function firstDeptPath(nodes: DeptTreeNode[]): string {
  return nodes[0]?.path ?? '';
}

function findDeptNodeByPath(nodes: DeptTreeNode[], path: string): DeptTreeNode | null {
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

watch(
  uiDeptTree,
  (tree) => {
    const displayRoots = collectDeptDisplayRoots(tree);
    expandedDeptPaths.value = collectDefaultExpandedDeptPaths(displayRoots);
    if (!findDeptNodeByPath(displayRoots, selectedOpsDeptPath.value)) {
      selectedOpsDeptPath.value = firstDeptPath(displayRoots);
    }
  },
  { immediate: true },
);

watch(
  uiOrgBars,
  (bars) => {
    if (!bars.some((row) => row.name === selectedOpsOrgName.value)) {
      selectedOpsOrgName.value = bars[0]?.name ?? '';
    }
  },
  { immediate: true },
);

function toggleDeptExpand(path: string): void {
  const next = new Set(expandedDeptPaths.value);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  expandedDeptPaths.value = next;
}

function selectOpsDept(path: string): void {
  selectedOpsDeptPath.value = path;
}

function selectOpsOrg(name: string): void {
  selectedOpsOrgName.value = name;
}

function flattenDeptTreeVisible(nodes: DeptTreeNode[]): FlatDeptRow[] {
  const out: FlatDeptRow[] = [];
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
      out.push(...flattenDeptTreeVisible(n.children!));
    }
  }
  return out;
}

const uiDeptDisplayRoots = computed(() => collectDeptDisplayRoots(uiDeptTree.value));

const uiDeptFlat = computed(() => flattenDeptTreeVisible(uiDeptDisplayRoots.value));

const uiOrgBarsSorted = computed(() =>
  [...uiOrgBars.value].sort((a, b) => b.downloads - a.downloads || b.skills - a.skills),
);

const uiOrgBarsMax = computed(() => Math.max(1, ...uiOrgBarsSorted.value.map((x) => x.downloads)));

const selectedDeptNode = computed(() =>
  findDeptNodeByPath(uiDeptTree.value, selectedOpsDeptPath.value) ?? uiDeptTree.value[0] ?? null,
);

const selectedOrgBar = computed(
  () => uiOrgBars.value.find((row) => row.name === selectedOpsOrgName.value) ?? uiOrgBars.value[0],
);

const selectedDeptSkillRows = computed(() => selectedDeptNode.value?.skillRows ?? []);

const selectedOrgSkillRows = computed(() => selectedOrgBar.value?.skillRows ?? []);

const opsKpiCards = computed<OpsKpiCard[]>(() => {
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
      desc:
        opsBoardSystem.value === 'fuyao'
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

const opsEmptyText = computed(() =>
  opsBoardSystem.value === 'company'
    ? '暂无公司系统运营看板数据'
    : '暂无扶摇系统运营看板数据',
);

const opsOrgBarsHelpText = computed(() =>
  opsBoardSystem.value === 'fuyao'
    ? '与已同步至公司组织维度的组织级 Skill 一致，按发布组织聚合；点击条目查看右侧明细。'
    : '点击横向条目后，右侧显示该组织级 Skill 列表。',
);

function buildOpsDashboardExportJsonFileName(sourceName: string): string {
  const baseName = sourceName.replace(/\.[^.]+$/, '').trim() || 'ops-dashboard';
  return `${baseName}-ops-dashboard-export.json`;
}

function downloadOpsDashboardExportJson(sourceName: string, bundle: OpsDashboardBundle): void {
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

function triggerOpsExcelImport(): void {
  opsExcelInputRef.value?.click();
}

async function onOpsExcelFileChange(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
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
      showToast(
        `已导入 ${rows.length} 条 Skill，当前页为预览；请用已下载 JSON 手动替换 src/mock/opsDashboardCompanyDefault.json 后重新运行 dev 以生效`,
      );
    } else {
      downloadOpsDashboardExportJson(file.name, bundle);
      showToast(
        `已解析 ${rows.length} 条并下载 JSON；扶摇运营看板仅展示接口数据，导入不会更新该页`,
      );
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Excel 解析失败');
  } finally {
    opsImporting.value = false;
    input.value = '';
  }
}
</script>

<template>
  <div class="user-shell">

    <UploadSkillModal
      v-model="uploadOpen"
      :parse-skill-archive="parseSkillArchiveForUpload"
      @submit="onUploadSubmit"
    />

    <Teleport to="body">
      <div
        v-if="detailPanelSkill"
        class="overlay detail-overlay"
        role="presentation"
        @click.self="closeDetailPanel"
      >
        <section class="skill-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="skill-detail-title">
          <header class="detail-head">
            <h2 id="skill-detail-title">Skill 详情</h2>
            <button type="button" class="detail-close" @click="closeDetailPanel">关闭</button>
          </header>

          <div class="detail-toolbar">
            <div class="detail-tags">
              <span class="detail-pill pill-category">{{ detailPanelSkill.tagFunctional }}</span>
              <span class="detail-pill pill-id">{{ detailPanelSkill.skill_id }}</span>
              <span class="detail-pill">版本 {{ skillVersion(detailPanelSkill) }}</span>
              <span class="detail-pill">作者 {{ skillAuthor(detailPanelSkill) }}</span>
              <span class="detail-pill" :class="skillScopeClass(detailPanelSkill)">
                {{ skillScopeLabel(detailPanelSkill) }}
              </span>
              <span class="detail-download">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 4v12m0 0 4-4m-4 4-4-4M5 20h14"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {{ skillDownloadCount(detailPanelSkill) }}
              </span>
            </div>
            <div class="detail-actions">
              <button type="button" class="detail-btn ghost" @click="onTrySkill">在线试用</button>
              <button type="button" class="detail-btn primary" @click="onDetailDownload">下载到本地</button>
            </div>
          </div>

          <div class="detail-main">
            <aside class="detail-file-panel">
              <div class="detail-panel-title">文件结构</div>
              <pre>{{ detailFileTree(detailPanelSkill) }}</pre>
            </aside>
            <article class="detail-md-panel">
              <div class="detail-panel-title">SKILL.md</div>
              <div class="detail-md-body">
                <h3>{{ skillTitle(detailPanelSkill) }} Skill</h3>
                <p>{{ detailPanelSkill.description || '暂无描述。' }}</p>

                <h4>Metadata</h4>
                <table class="detail-meta-table">
                  <tbody>
                    <tr v-for="row in detailRows(detailPanelSkill)" :key="row.label">
                      <th>{{ row.label }}</th>
                      <td>{{ row.value }}</td>
                    </tr>
                    <tr>
                      <th>requirements</th>
                      <td>{{ skillRequirements(detailPanelSkill) }}</td>
                    </tr>
                    <tr>
                      <th>tags</th>
                      <td>{{ skillTagSummary(detailPanelSkill) }}</td>
                    </tr>
                  </tbody>
                </table>

                <h4>分类信息</h4>
                <ul>
                  <li>大类：{{ detailPanelSkill.tagFunctional || '-' }}</li>
                  <li>发布层级：{{ skillScopeLabel(detailPanelSkill) }}</li>
                  <li>所属部门：{{ detailPanelSkill.dept_name || '-' }}</li>
                </ul>

                <h4>使用说明</h4>
                <p>
                  下载后可在本地 Skill 运行环境中加载使用；组织级 Skill 可在对应组织范围内共享和复用。
                </p>
              </div>
            </article>
          </div>

          <footer class="detail-foot">
            <button type="button" class="detail-btn ghost" @click="closeDetailPanel">取消</button>
            <button type="button" class="detail-btn primary" @click="onDetailDownload">下载到本地</button>
          </footer>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="versionPanelSkill" class="overlay" role="presentation" @click.self="closeVersionPanel">
        <div class="v-dialog" role="dialog" aria-modal="true">
          <div class="v-head">
            <strong>{{ versionPanelSkill.name ?? versionPanelSkill.skill_id }}</strong>
            <button type="button" class="close-x" aria-label="关闭" @click="closeVersionPanel">x</button>
          </div>
          <p class="v-sub">当前展示版本：{{ versionPanelSkill.version ?? '-' }}</p>
          <ul class="v-list">
            <li
              v-for="version in [...(versionPanelSkill.versions ?? [])].reverse()"
              :key="version.version + version.publishTime"
            >
              <span class="ver">{{ version.version }}</span>
              <span class="time">{{ version.publishTime }}</span>
              <span v-if="version.packageFileName" class="note">{{ version.packageFileName }}</span>
              <span v-if="version.note" class="note">{{ version.note }}</span>
            </li>
          </ul>
        </div>
      </div>
    </Teleport>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
  <!-- <p>--------------------------------这是分界线--------------------------------</p> -->
  <div class="user-shell skill-market-shell">
    <section class="hero">
      <div class="hero-inner">
        <h1 class="hero-title">把零散的日常作业经验沉淀成可复用的 Skill</h1>
        <p class="hero-desc">
          Skill 是将脚本、文档、检查清单等日常能力打包后的可复用单元，便于在团队内发现与下载。个人上传默认仅对自己可见；进入市场总览需经分层发布与管理员审批。同名 Skill 再次上传将自动作为该条目的新版本。
        </p>
        <div class="hero-actions">
          <button type="button" class="btn primary" @click="openUpload">
            <span class="up">↑</span> 上传 Skill
          </button>
        </div>
      </div>
    </section>

    <nav
      class="sub-tabs"
      :class="{ 'ops-tabs': innerTab === 'ops' || innerTab === 'org' || innerTab === 'approval' }"
      aria-label="市场分区"
    >
      <button
        type="button"
        class="sub-tab"
        :class="{ on: innerTab === 'overview' }"
        @click="goTab('overview')"
      >
        市场总览
      </button>
      <button
        v-if="false"
        type="button"
        class="sub-tab"
        :class="{ on: innerTab === 'core' }"
        @click="goTab('core')"
      >
        CoreHarness
      </button>
      <button
        type="button"
        class="sub-tab"
        :class="{ on: innerTab === 'releases' }"
        @click="goTab('releases')"
      >
        我的发布
      </button>
      <button
        v-if="showAdminModules"
        type="button"
        class="sub-tab"
        :class="{ on: innerTab === 'org' }"
        @click="goTab('org')"
      >
        组织管理
      </button>
      <button
        v-if="showAdminModules"
        type="button"
        class="sub-tab"
        :class="{ on: innerTab === 'approval' }"
        @click="goTab('approval')"
      >
        审核中心
      </button>
      <button
        type="button"
        class="sub-tab"
        :class="{ on: innerTab === 'ops' }"
        @click="goTab('ops')"
      >
        运营看板
      </button>
    </nav>

    <div
      v-if="innerTab === 'overview'"
      ref="tabPanelRef"
      class="panel tab-panel overview-panel"
      :style="tabPanelFillStyle"
    >
      <div class="stats-strip" role="group" aria-label="市场指标">
        <div class="stat-cell">
          <span class="stat-k">Skill</span>
          <span class="stat-v">{{ totalSkills }}</span>
        </div>
        <div class="stat-div" aria-hidden="true" />
        <div class="stat-cell">
          <span class="stat-k">累计下载</span>
          <span class="stat-v">{{ totalDownloads.toLocaleString('zh-CN') }}</span>
        </div>
        <div class="stat-div" aria-hidden="true" />
        <div class="stat-cell">
          <span class="stat-k">近 30 天下载</span>
          <span class="stat-v">{{ downloadsLast30Days.toLocaleString('zh-CN') }}</span>
        </div>
        <div class="stat-div" aria-hidden="true" />
        <div class="stat-cell">
          <span class="stat-k">覆盖组织</span>
          <span class="stat-v">{{ orgCount }}</span>
        </div>
      </div>

      <div class="market-layout">
        <aside class="market-sidebar" aria-label="市场筛选">
          <nav class="side-nav">
            <button
              type="button"
              class="side-nav-item"
              :class="{ active: quickFilter === 'all' }"
              @click="quickFilter = 'all'"
            >
              <span class="side-nav-icon">◇</span>全部 Skill
            </button>
            <button
              type="button"
              class="side-nav-item"
              :class="{ active: quickFilter === 'personal' }"
              @click="quickFilter = 'personal'"
            >
              <span class="side-nav-icon">♙</span>个人级
            </button>
            <button
              type="button"
              class="side-nav-item"
              :class="{ active: quickFilter === 'devDept' }"
              @click="quickFilter = 'devDept'"
            >
              <span class="side-nav-icon">▦</span>组织级
            </button>
          </nav>
          <div class="side-block">
            <div class="side-title">分类 <span class="side-help">?</span></div>
            <div class="side-tags">
              <button
                type="button"
                class="side-tag"
                :class="{ active: categoryFilter === 'all' }"
                @click="categoryFilter = 'all'"
              >
                全部
              </button>
              <button
                v-for="category in categoryOptions"
                :key="category"
                type="button"
                class="side-tag"
                :class="{ active: categoryFilter === category }"
                @click="categoryFilter = category"
              >
                {{ category }}
              </button>
            </div>
          </div>
          <div class="side-block side-block--tags">
            <div class="side-title tag-title">
              <span>标签 <span class="side-help">?</span></span>
              <button
                v-if="selectedTags.length > 0"
                type="button"
                class="tag-clear"
                @click="clearTagFilters"
              >
                清除
              </button>
            </div>
            <div
              class="side-tags-collapsible"
              :class="{ 'is-expanded': overviewTagListExpandedUi }"
            >
              <div class="side-tags">
                <button
                  v-for="tag in tagOptions"
                  :key="tag"
                  type="button"
                  class="side-tag"
                  :class="{ active: selectedTags.includes(tag) }"
                  @click="toggleTagFilter(tag)"
                >
                  {{ tag }}
                </button>
                <span v-if="tagOptions.length === 0" class="side-empty">暂无标签</span>
              </div>
            </div>
            <button
              v-if="showOverviewTagExpandToggle"
              type="button"
              class="side-tags-expand"
              @click="overviewTagListExpanded = !overviewTagListExpanded"
            >
              {{ overviewTagListExpanded ? '收起标签' : '展开全部标签' }}
            </button>
          </div>
        </aside>

        <div
          ref="marketContentRef"
          class="market-content"
          @scroll.passive="onOverviewMarketScroll"
        >
          <div class="filters">
            <input
              v-model="search"
              class="search"
              type="search"
              placeholder="搜索 Skill 名称"
            />
            <select v-model="levelFilter" class="select">
              <option value="all">筛选组织</option>
              <template v-if="transportIsHttp">
                <option
                  v-for="o in marketOrgSelectOptions"
                  :key="o.id"
                  :value="String(o.id)"
                >
                  {{ o.orgName }}
                </option>
              </template>
              <template v-else>
                <option v-for="org in orgOptions" :key="org" :value="org">{{ org }}</option>
              </template>
            </select>
            <div
              ref="marketDeptCascaderWrapRef"
              class="market-dept-cascader"
              aria-label="部门级联筛选（departmentL1～L6）"
            >
              <button
                type="button"
                class="market-dept-cascader-trigger"
                :class="{ 'is-open': overviewDeptCascaderOpen }"
                aria-haspopup="true"
                :aria-expanded="overviewDeptCascaderOpen"
                @click.stop="toggleOverviewDeptCascader"
              >
                <span class="market-dept-cascader-trigger-text" :title="overviewDeptCascaderLabel">{{
                  overviewDeptCascaderLabel
                }}</span>
                <span class="market-dept-cascader-caret" aria-hidden="true">▾</span>
              </button>
              <Teleport to="body">
                <div
                  v-if="overviewDeptCascaderOpen"
                  ref="marketDeptCascaderPanelRef"
                  class="market-dept-cascader-panel"
                  :style="marketDeptCascaderPanelStyle"
                  role="listbox"
                  @mousedown.prevent
                >
                <div
                  v-if="overviewDeptCascadeColumns.length === 0"
                  class="market-dept-cascader-empty"
                >
                  <template v-if="marketOverviewDeptTreeLoading">正在加载部门树…</template>
                  <template v-else>暂无部门数据（可先调整组织/分类或等待列表加载）</template>
                </div>
                  <div v-else class="market-dept-cascader-columns">
                    <div
                      v-for="col in overviewDeptCascadeColumns"
                      :key="'dept-col-' + col.levelIndex"
                      class="market-dept-cascader-col"
                      role="presentation"
                    >
                      <button
                        v-for="name in col.options"
                        :key="col.levelIndex + '-' + name"
                        type="button"
                        class="market-dept-cascader-item"
                        :class="{ 'is-active': col.active === name }"
                        role="option"
                        :aria-selected="col.active === name"
                        @click="onOverviewDeptCascaderPick(col.levelIndex, name)"
                      >
                        <span class="market-dept-cascader-item-label">{{ name }}</span>
                        <span
                          v-if="marketOverviewDeptPickHasChildren(col.levelIndex, name)"
                          class="market-dept-cascader-item-chevron"
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </button>
                    </div>
                  </div>
                  <div class="market-dept-cascader-footer">
                    <button type="button" class="market-dept-cascader-clear" @click="clearOverviewDeptCascader">
                      清空部门
                    </button>
                    <button type="button" class="market-dept-cascader-done" @click="closeOverviewDeptCascader">
                      完成
                    </button>
                  </div>
                </div>
              </Teleport>
            </div>
          </div>

          <p
            v-if="transportIsHttp && overviewRemoteLoading && overviewRemoteItems.length === 0"
            class="empty overview-loading-hint"
          >
            正在从接口加载市场列表…
          </p>
          <template v-else-if="filteredSkills.length > 0">
            <div ref="overviewGridRef" class="grid">
              <SkillCard
                v-for="s in filteredSkills"
                :key="s.id ?? s.skill_id"
                class="market-skill-card"
                :skill="s"
                menu-mode="download-only"
                @download="(sid) => onDownload(sid, 'market')"
                @open-detail="openDetailPanel"
                @view-versions="onViewVersions"
              />
            </div>
          </template>
          <p v-else class="empty">没有匹配的 Skill，可调整筛选条件。</p>

          <div class="overview-list-footer" role="status">
            <span>{{ overviewListFooterHint }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="innerTab === 'core'" class="panel tab-panel core">
      <div class="core-alert" role="note" aria-label="CoreHarness 提示">
        <strong>CoreHarness</strong> 是独立资产产线，区分开发部级 / PDU / 产品线三个层级。用户不能直接发布
        CoreHarness，只能申请把自己的 Skill 转为 CoreHarness；申请将到哪一级，就由哪一级管理员审核，审核通过后自动发布。
      </div>

      <div class="core-head">
        <div>
          <h2 class="panel-title">CoreHarness 列表</h2>
          <p class="panel-help">采用与市场总览一致的卡片形式展示，点击卡片可查看组成、来源 Skill 和发布说明。</p>
        </div>
        <button type="button" class="btn outline sm" @click="onApplyCoreHarness">申请转为 CoreHarness</button>
      </div>

      <div class="core-levels" role="group" aria-label="CoreHarness 层级统计">
        <span v-for="x in coreLevelStats" :key="x.key" class="lvl-pill">
          <span class="lvl-k">{{ x.label }}</span>
          <span class="lvl-v">{{ x.count }}</span>
        </span>
      </div>

      <div class="filter-block core-filter">
        <div class="quick-row">
          <span class="quick-label">快捷入口</span>
          <div class="quick-pills">
            <button
              v-for="item in coreQuickEntries"
              :key="item.key"
              type="button"
              class="pill"
              :class="{ active: coreQuick === item.key }"
              @click="coreQuick = item.key"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
        <div class="filters core-filters">
          <input
            v-model="coreSearch"
            class="search"
            type="search"
            placeholder="搜索 Skill 名称 / 维护方 / 目标系统"
          />
          <div class="core-spacer" aria-hidden="true" />
          <div class="core-spacer" aria-hidden="true" />
        </div>
      </div>

      <div class="grid">
        <SkillCard
          v-for="s in coreSkills"
          :key="s.id"
          :skill="s"
          variant="coreHarness"
          menu-mode="full"
          @download="(sid) => onDownload(sid, 'market')"
          @view-versions="onViewVersions"
        />
      </div>
    </div>

    <div
      v-else-if="innerTab === 'releases'"
      ref="tabPanelRef"
      class="panel tab-panel my-release-panel"
      :style="tabPanelFillStyle"
    >
      <header class="my-release-head">
        <div>
          <h2>我的发布</h2>
        </div>
        <button type="button" class="btn primary my-upload-btn" @click="openUpload">上传新 Skill</button>
      </header>

      <div class="my-release-body">
        <div class="my-stats" role="group" aria-label="我的发布指标">
          <div class="my-cell">
            <span class="my-k">我维护的 Skill</span>
            <span class="my-v">{{ uiMyStats.maintained }}</span>
          </div>
          <div class="my-div" aria-hidden="true" />
          <div class="my-cell">
            <span class="my-k">审核中</span>
            <span class="my-v">{{ uiMyStats.reviewing }}</span>
          </div>
          <div class="my-div" aria-hidden="true" />
          <div class="my-cell">
            <span class="my-k">被驳回</span>
            <span class="my-v">{{ uiMyStats.rejected }}</span>
          </div>
          <div class="my-div" aria-hidden="true" />
          <div class="my-cell">
            <span class="my-k">我的累计下载</span>
            <span class="my-v">{{ uiMyStats.myTotalDownloads }}</span>
          </div>
        </div>

        <div class="my-toolbar">
          <div class="my-filters" role="tablist" aria-label="我的发布筛选">
            <button
              v-for="f in releaseFilters"
              :key="f.key"
              type="button"
              class="seg"
              :class="{ on: releaseFilter === f.key }"
              @click="releaseFilter = f.key"
            >
              {{ f.label }}
            </button>
          </div>
          <button type="button" class="btn outline sm" @click="onUploadExistingVersion">
            上传已有 Skill 新版本
          </button>
        </div>

        <div class="table-wrap my-table-wrap">
          <table class="table my-table">
            <thead>
              <tr>
                <th class="col-skill">Skill</th>
                <th class="col-level">当前层级</th>
                <th class="col-ver">最新版本</th>
                <th class="col-status">状态</th>
                <th class="col-dl">下载量</th>
                <th class="col-action">最近动作</th>
                <th class="col-ops">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredMyReleaseRows"
                :key="row.skill.id"
                class="clickable-row"
                @click="openDetailPanel(skillKey(row.skill))"
              >
                <td>
                  <div class="skill-main">
                    <strong class="skill-name">{{ row.skill.name }}</strong>
                    <div class="skill-sub">
                      <span>{{ releaseCategoryLabel(row.skill) }} · 作者：{{ row.skill.publisher }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="cell-main">{{ releasePrimaryLevel(row.skill) }}</div>
                  <div class="cell-sub">{{ releaseOrgLabel(row.skill) }}</div>
                </td>
                <td>
                  <div class="cell-main">{{ row.skill.version }}</div>
                  <div class="cell-sub">{{ row.skill.latestPublishTime }}</div>
                </td>
                <td>
                  <span class="st" :class="`st-${row.statusKey}`">{{ row.statusLabel }}</span>
                </td>
                <td class="num">
                  {{ (row.skill.download_count ?? row.skill.downloads ?? 0).toLocaleString('zh-CN') }}
                </td>
                <td class="cell-sub">{{ row.lastAction }}</td>
                <td @click.stop>
                  <div class="ops">
                    <button type="button" class="mini" @click="onReleaseNewVersion(row)">新版本</button>
                    <button type="button" class="mini" @click="onReleaseSync(row)">
                      {{ releaseSyncActionText(row) }}
                    </button>
                    <button type="button" class="mini" @click="onReleaseRecord(row)">记录</button>
                  </div>
                </td>
              </tr>
              <tr v-if="filteredMyReleaseRows.length === 0">
                <td colspan="7" class="empty-row">暂无符合条件的数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      v-else-if="innerTab === 'org'"
      ref="tabPanelRef"
      class="panel tab-panel admin-org-panel"
      :style="tabPanelFillStyle"
    >
      <header class="admin-panel-head">
        <div>
          <h2 class="panel-title">组织管理</h2>
          <p class="panel-help">
            配置组织名称、组织 ID 与组织管理员。配置在组织管理员名单内的用户，即拥有本 Skill 市场的管理员角色。
          </p>
        </div>
        <button v-if="canCreateOrg" type="button" class="btn primary" @click="openOrgCreateModal">
          新建组织
        </button>
      </header>
      <div class="admin-panel-body">
        <div class="summary-strip admin-summary" role="group" aria-label="组织摘要">
          <span class="summary-item">组织 <b>{{ adminOrganizations.length }}</b></span>
          <span class="summary-item">组织管理员账号 <b>{{ orgDistinctAdminCount }}</b></span>
        </div>
        <div v-if="orgListLoading" class="admin-loading">加载中…</div>
        <div v-else class="table-wrap admin-table-wrap">
          <table class="table admin-table">
            <thead>
              <tr>
                <th>组织名称</th>
                <th>组织 ID</th>
                <th>组织管理员</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="org in adminOrganizations" :key="org.id">
                <td>
                  <strong>{{ org.orgName }}</strong>
                </td>
                <td>{{ org.orgCode }}</td>
                <td class="cell-admins">{{ org.admins }}</td>
                <td>
                  <span class="adm-badge" :class="org.enabled ? 'on' : 'off'">{{
                    org.enabled ? '启用' : '停用'
                  }}</span>
                </td>
                <td>
                  <button
                    type="button"
                    class="btn outline sm"
                    :disabled="!canEditOrganization(org)"
                    @click="openOrgEditModal(org)"
                  >
                    配置
                  </button>
                </td>
              </tr>
              <tr v-if="adminOrganizations.length === 0">
                <td colspan="5" class="empty-row">暂无组织数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      v-else-if="innerTab === 'approval'"
      ref="tabPanelRef"
      class="panel tab-panel admin-approval-panel"
      :style="tabPanelFillStyle"
    >
      <header class="admin-panel-head">
        <div>
          <h2 class="panel-title">审核中心</h2>
          <p class="panel-help">
            个人级同步到组织级时，由目标组织的组织管理员审核。审核中心区分待审核和已完成。
          </p>
        </div>
      </header>
      <div class="admin-panel-body">
        <div class="summary-strip approval-summary" role="group" aria-label="审核摘要">
          <span class="summary-item">待审核 <b>{{ syncPendingRows.length }}</b></span>
          <span class="summary-item">已完成 <b>{{ syncDoneRows.length }}</b></span>
        </div>
        <div class="section-toolbar admin-mini-toolbar">
          <div class="mini-tabs" role="tablist" aria-label="审核分区">
            <button
              type="button"
              class="mini-tab"
              :class="{ active: approvalSubTab === 'pending' }"
              role="tab"
              :aria-selected="approvalSubTab === 'pending'"
              @click="approvalSubTab = 'pending'"
            >
              待审核
            </button>
            <button
              type="button"
              class="mini-tab"
              :class="{ active: approvalSubTab === 'done' }"
              role="tab"
              :aria-selected="approvalSubTab === 'done'"
              @click="approvalSubTab = 'done'"
            >
              已完成
            </button>
          </div>
        </div>
        <div v-if="syncListLoading" class="admin-loading">加载中…</div>
        <div v-else-if="approvalSubTab === 'pending'" class="table-wrap admin-table-wrap">
          <table class="table admin-table">
            <thead>
              <tr>
                <th>申请单</th>
                <th>类型</th>
                <th>目标层级</th>
                <th>目标组织</th>
                <th>申请理由</th>
                <th>当前审核人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in syncPendingRows" :key="row.id">
                <td>
                  <strong>{{ row.skillName }}</strong>
                </td>
                <td>{{ row.applyType }}</td>
                <td>{{ row.targetLevel }}</td>
                <td>{{ row.targetOrgName }}</td>
                <td class="cell-reason">
                  <div>{{ row.reason }}</div>
                  <div v-if="row.reasonDetail" class="reason-detail">{{ row.reasonDetail }}</div>
                </td>
                <td>{{ row.approverLabel }}</td>
                <td>
                  <button type="button" class="btn outline sm" @click="openReviewModal(row)">
                    审核
                  </button>
                </td>
              </tr>
              <tr v-if="syncPendingRows.length === 0">
                <td colspan="7" class="empty-row">暂无待审核申请</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="table-wrap admin-table-wrap">
          <table class="table admin-table">
            <thead>
              <tr>
                <th>申请单</th>
                <th>类型</th>
                <th>目标层级</th>
                <th>目标组织</th>
                <th>审核结果</th>
                <th>审核意见</th>
                <th>完成时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in syncDoneRows" :key="row.id">
                <td>
                  <strong>{{ row.skillName }}</strong>
                </td>
                <td>{{ row.applyType }}</td>
                <td>{{ row.targetLevel }}</td>
                <td>{{ row.targetOrgName }}</td>
                <td>
                  <span
                    class="adm-badge"
                    :class="row.reviewResult === '通过' ? 'ok' : row.reviewResult === '不通过' ? 'bad' : ''"
                  >
                    {{ row.reviewResult ?? '—' }}
                  </span>
                </td>
                <td class="cell-reason">{{ row.reviewComment ?? '—' }}</td>
                <td>{{ row.completedAt ?? '—' }}</td>
              </tr>
              <tr v-if="syncDoneRows.length === 0">
                <td colspan="7" class="empty-row">暂无已完成记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-else-if="innerTab === 'ops'" class="panel tab-panel ops">
      <section class="ops-dashboard-card ops-dashboard" aria-label="Skill 运营看板">
        <header class="ops-title">
          <div>
            <h2>运营看板</h2>
            <p>扶摇系统侧关注个人级沉淀、快速验证和产线验证；公司系统侧关注目标系统统一管理的组织级 Skill。</p>
          </div>
          <div class="ops-filter">
            <div class="ops-toggle ops-system-toggle" role="tablist" aria-label="运营看板系统切换">
              <button
                type="button"
                class="ops-system-btn"
                data-system="fuyao"
                role="tab"
                :class="{ active: opsBoardSystem === 'fuyao' }"
                :aria-selected="opsBoardSystem === 'fuyao'"
                @click="opsBoardSystem = 'fuyao'"
              >
                扶摇系统
              </button>
              <button
                type="button"
                class="ops-system-btn"
                data-system="company"
                role="tab"
                :class="{ active: opsBoardSystem === 'company' }"
                :aria-selected="opsBoardSystem === 'company'"
                @click="opsBoardSystem = 'company'"
              >
                公司系统
              </button>
            </div>
            <span
              v-if="opsBoardSystem === 'company'"
              class="ops-data-note"
              :title="`统计至：${opsAsOfText}`"
            >
              数据口径：T+1（统计数据延迟 1 天）
            </span>
            <template v-if="showOpsExcelImport">
              <input
                ref="opsExcelInputRef"
                class="visually-hidden"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                aria-label="选择运营看板 Excel 文件"
                @change="onOpsExcelFileChange"
              />
              <button
                type="button"
                class="btn btn-soft ops-import-btn"
                :disabled="opsImporting"
                @click="triggerOpsExcelImport"
              >
                {{ opsImporting ? '导入中…' : 'Excel 导入' }}
              </button>
            </template>
          </div>
        </header>

        <div class="ops-kpis" role="group" aria-label="运营看板指标">
          <div v-for="card in opsKpiCards" :key="card.label" class="ops-kpi">
            <small>{{ card.label }}</small>
            <strong>{{ formatOpsNumber(card.value) }}</strong>
            <span>{{ card.desc }}</span>
          </div>
        </div>

        <div class="ops-main-grid">
          <div class="ops-board-rows">
            <div class="ops-pair-row dept-row">
              <section class="ops-card">
                <div class="ops-card-head">
                  <div>
                    <h3>部门 Skill 分布详情</h3>
                    <p>点击任一部门层级后，右侧显示该层级 Skill 明细。</p>
                  </div>
                </div>
                <div class="ops-card-body ops-tree board-org-tree" role="tree">
                  <div v-if="uiDeptFlat.length === 0" class="ops-empty-state">
                    <strong>{{ opsEmptyText }}</strong>
                    <span v-if="opsBoardSystem === 'company'">
                      导入 Excel 后会在这里展示四级及以下部门、Skill 数量和下载量。
                    </span>
                    <span v-else>接口未返回部门分布或当前无可展示数据。</span>
                  </div>
                  <div v-for="row in uiDeptFlat" :key="row.path" class="ops-tree-item">
                    <button
                      type="button"
                      class="ops-tree-node"
                      :class="[
                        { active: selectedOpsDeptPath === row.path },
                        'lv' + (row.levelNo > 6 ? 6 : row.levelNo),
                      ]"
                      :aria-pressed="selectedOpsDeptPath === row.path"
                      @click="selectOpsDept(row.path)"
                    >
                      <span
                        v-if="row.hasChildren"
                        class="ops-caret-btn"
                        role="button"
                        tabindex="-1"
                        :aria-label="row.expanded ? '收起部门' : '展开部门'"
                        @click.stop="toggleDeptExpand(row.path)"
                      >
                        {{ row.expanded ? '▾' : '▸' }}
                      </span>
                      <span v-else class="ops-caret-placeholder" aria-hidden="true">•</span>
                      <span class="ops-tree-name" :title="row.path">{{ row.name }}</span>
                      <span class="ops-tree-count">{{ row.skills }}个</span>
                      <span class="ops-tree-download">{{ formatOpsNumber(row.downloads) }}下载</span>
                    </button>
                  </div>
                </div>
              </section>

              <section class="ops-card ops-detail-table-card">
                <div class="ops-card-body">
                  <div class="ops-skill-table ops-dept-skill-table">
                    <div v-if="selectedDeptSkillRows.length === 0" class="ops-empty-state ops-detail-empty-state">
                      <strong>暂无 Skill 明细</strong>
                      <span>选择有数据的部门层级后，将展示该层级下的 Skill 列表。</span>
                    </div>
                    <div v-else class="ops-skill-table-wrap">
                      <table class="table ops-detail-table">
                        <thead>
                          <tr>
                            <th class="col-name sticky-name">
                              <span class="cell-ellipsis" title="Skill 名称">Skill 名称</span>
                            </th>
                            <th class="col-desc"><span class="cell-ellipsis" title="描述">描述</span></th>
                            <th class="col-owner">
                              <span class="cell-ellipsis" title="发布人">发布人</span>
                            </th>
                            <th class="col-download sticky-download">
                              <span class="cell-ellipsis" title="下载量">下载量</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(row, idx) in selectedDeptSkillRows"
                            :key="`dept-${row.name}-${row.dept}-${idx}`"
                          >
                            <td class="col-name sticky-name">
                              <div class="skill-name-cell">
                                <span class="skill-row-dot">{{ idx + 1 }}</span>
                                <span class="cell-ellipsis" :title="row.name">{{ row.name }}</span>
                              </div>
                            </td>
                            <td class="col-desc">
                              <span class="cell-ellipsis desc-text" :title="row.description">
                                {{ row.description }}
                              </span>
                            </td>
                            <td class="col-owner">
                              <span class="owner-pill" :title="opsSkillOwner(row)">
                                {{ opsSkillOwner(row) }}
                              </span>
                            </td>
                            <td class="col-download sticky-download">
                              <span class="download-pill" :title="formatOpsNumber(row.downloads)">
                                {{ formatOpsNumber(row.downloads) }}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div class="ops-pair-row org-row">
              <section class="ops-card">
                <div class="ops-card-head">
                  <div>
                    <h3>组织级 Skill 分布详情</h3>
                    <p>{{ opsOrgBarsHelpText }}</p>
                  </div>
                </div>
                <div class="ops-card-body">
                  <div class="ops-org-bars" role="list" aria-label="组织级 Skill 分布">
                    <div v-if="uiOrgBarsSorted.length === 0" class="ops-empty-state">
                      <strong>{{ opsEmptyText }}</strong>
                      <span>暂无可展示的组织级 Skill 分布。</span>
                    </div>
                    <button
                      v-for="row in uiOrgBarsSorted"
                      :key="row.name"
                      type="button"
                      class="ops-org-bar"
                      :class="{ active: selectedOpsOrgName === row.name }"
                      @click="selectOpsOrg(row.name)"
                    >
                      <div class="ops-org-bar-top">
                        <b :title="row.name">{{ row.name }}</b>
                        <span>{{ row.skills }}个 · {{ formatOpsNumber(row.downloads) }}下载</span>
                      </div>
                      <div class="ops-bar-track" aria-hidden="true">
                        <span
                          class="ops-bar-fill"
                          :style="{ width: `${Math.round((row.downloads / uiOrgBarsMax) * 100)}%` }"
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </section>

              <section class="ops-card ops-detail-table-card">
                <div class="ops-card-body">
                  <div class="ops-skill-table ops-org-skill-table">
                    <div v-if="selectedOrgSkillRows.length === 0" class="ops-empty-state ops-detail-empty-state">
                      <strong>暂无组织级 Skill 明细</strong>
                      <span>选择有数据的组织条目后，将展示该组织级 Skill 列表。</span>
                    </div>
                    <div v-else class="ops-skill-table-wrap">
                      <table class="table ops-detail-table">
                        <thead>
                          <tr>
                            <th class="col-name sticky-name">
                              <span class="cell-ellipsis" title="Skill 名称">Skill 名称</span>
                            </th>
                            <th class="col-desc"><span class="cell-ellipsis" title="描述">描述</span></th>
                            <th class="col-owner">
                              <span class="cell-ellipsis" title="发布人">发布人</span>
                            </th>
                            <th class="col-download sticky-download">
                              <span class="cell-ellipsis" title="下载量">下载量</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(row, idx) in selectedOrgSkillRows"
                            :key="`org-${row.name}-${row.publishName}-${idx}`"
                          >
                            <td class="col-name sticky-name">
                              <div class="skill-name-cell">
                                <span class="skill-row-dot">{{ idx + 1 }}</span>
                                <span class="cell-ellipsis" :title="row.name">{{ row.name }}</span>
                              </div>
                            </td>
                            <td class="col-desc">
                              <span class="cell-ellipsis desc-text" :title="row.description">
                                {{ row.description }}
                              </span>
                            </td>
                            <td class="col-owner">
                              <span class="owner-pill" :title="opsSkillOwner(row)">
                                {{ opsSkillOwner(row) }}
                              </span>
                            </td>
                            <td class="col-download sticky-download">
                              <span class="download-pill" :title="formatOpsNumber(row.downloads)">
                                {{ formatOpsNumber(row.downloads) }}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section class="ops-card ops-top-card">
              <div class="ops-card-head">
                <div>
                  <h3>{{ opsTopTitle }}</h3>
                  <p>{{ opsTopSubTitle }}</p>
                </div>
              </div>
              <div class="ops-card-body">
                <div class="ops-top-list" role="list">
                  <div v-if="uiTopSkillsByDl.length === 0" class="ops-empty-state ops-top-empty">
                    <strong>{{ opsEmptyText }}</strong>
                    <span>暂无下载排行数据。</span>
                  </div>
                  <div
                    v-for="item in uiTopSkillsByDl"
                    :key="`${item.rank}-${item.name}-${item.downloads}`"
                    class="ops-top-item"
                    role="listitem"
                  >
                    <div class="ops-rank">{{ item.rank }}</div>
                    <div>
                      <b>{{ item.name }}</b>
                      <small :title="item.dept">{{ opsSkillOwner(item) }} · {{ item.dept }}</small>
                    </div>
                    <div class="ops-download">{{ formatOpsNumber(item.downloads) }}</div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="versionPanelSkill" class="overlay" role="presentation" @click.self="closeVersionPanel">
        <div class="v-dialog" role="dialog" aria-modal="true">
          <div class="v-head">
            <strong>{{ versionPanelSkill.name ?? versionPanelSkill.skill_id }}</strong>
            <button type="button" class="close-x" aria-label="关闭" @click="closeVersionPanel">×</button>
          </div>
          <p class="v-sub">当前展示版本：{{ versionPanelSkill.version ?? '-' }}</p>
          <ul class="v-list">
            <li v-for="v in [...(versionPanelSkill.versions ?? [])].reverse()" :key="v.version + v.publishTime">
              <span class="ver">{{ v.version }}</span>
              <span class="time">{{ v.publishTime }}</span>
              <span v-if="v.note" class="note">{{ v.note }}</span>
            </li>
          </ul>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="orgModalOpen" class="overlay" role="presentation" @click.self="closeOrgModal">
        <div class="v-dialog v-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="org-modal-title">
          <div class="v-head">
            <strong id="org-modal-title">{{ orgModalMode === 'create' ? '新建组织' : '配置组织' }}</strong>
            <button type="button" class="close-x" aria-label="关闭" @click="closeOrgModal">×</button>
          </div>
          <div class="admin-form">
            <label class="admin-field">
              <span>组织名称</span>
              <input v-model="orgForm.orgName" type="text" class="search" placeholder="例如：IT装备部" />
            </label>
            <label class="admin-field">
              <span>组织 ID</span>
              <input v-model="orgForm.orgCode" type="text" class="search" placeholder="例如：ORG-IT-001" />
            </label>
            <label class="admin-field">
              <span>组织管理员</span>
              <input
                v-model="orgForm.admins"
                type="text"
                class="search"
                placeholder="多个账号用英文逗号分隔"
              />
            </label>
            <label class="admin-field admin-check">
              <input v-model="orgForm.enabled" type="checkbox" />
              <span>启用</span>
            </label>
          </div>
          <div class="v-actions">
            <button type="button" class="btn outline sm" @click="closeOrgModal">取消</button>
            <button type="button" class="btn primary sm" @click="submitOrgModal">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="reviewModalOpen" class="overlay" role="presentation" @click.self="closeReviewModal">
        <div class="v-dialog v-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
          <div class="v-head">
            <strong id="review-modal-title">审核同步申请</strong>
            <button type="button" class="close-x" aria-label="关闭" @click="closeReviewModal">×</button>
          </div>
          <p v-if="reviewTarget" class="v-sub">
            {{ reviewTarget.skillName }} · {{ reviewTarget.targetOrgName }}
          </p>
          <div class="admin-form">
            <div class="review-decision-row" role="radiogroup" aria-label="审核结论">
              <label class="admin-radio">
                <input v-model="reviewDecision" type="radio" value="approve" />
                <span>通过</span>
              </label>
              <label class="admin-radio">
                <input v-model="reviewDecision" type="radio" value="reject" />
                <span>驳回</span>
              </label>
            </div>
            <label class="admin-field">
              <span>审核意见</span>
              <textarea
                v-model="reviewComment"
                class="admin-textarea"
                rows="4"
                placeholder="请填写审核意见"
              />
            </label>
          </div>
          <div class="v-actions">
            <button type="button" class="btn outline sm" :disabled="reviewSubmitting" @click="closeReviewModal">
              取消
            </button>
            <button
              type="button"
              class="btn primary sm"
              :disabled="reviewSubmitting"
              @click="submitReviewModal"
            >
              提交
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.user-shell {
  width: 100%;
  max-width: none;
  min-width: 0;
  margin: 0;
  padding: 0 clamp(16px, 2vw, 32px) 32px;
  box-sizing: border-box;
}

.skill-market-shell {
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.hero {
  margin-top: 16px;
  width: 100%;
  box-sizing: border-box;
  border-radius: 8px;
  background: linear-gradient(105deg, #e6f4ff 0%, #f0e6ff 100%);
  padding: 26px 28px;
  border: 1px solid #d6e4ff;
}

.hero-inner {
  max-width: none;
  text-align: left;
}

.hero-desc {
  max-width: 980px;
}

.badge {
  display: inline-block;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(24, 144, 255, 0.12);
  color: #1890ff;
  margin-bottom: 12px;
}

.hero-title {
  margin: 0 0 12px;
  font-size: 26px;
  line-height: 1.35;
  color: rgba(0, 0, 0, 0.88);
  font-weight: 700;
}

.hero-desc {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(0, 0, 0, 0.55);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  /* gap: 10px; */
  margin-top: 10px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #1677ff;
  font-size: 13px;
  font-weight: 700;
}

.hero h1,
.panel h2 {
  margin: 0;
  color: #10243e;
}

.hero h1 {
  font-size: 26px;
  line-height: 1.35;
}

.hero-desc,
.panel p,
.muted {
  margin: 8px 0 0;
  color: #667085;
  font-size: 14px;
  line-height: 1.7;
}

.btn {
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn.primary {
  background: #1890ff;
  border-color: #1890ff;
  color: #fff;
}

.btn.outline {
  background: #fff;
  border-color: #1890ff;
  color: #1890ff;
}

.btn.sm {
  padding: 6px 14px;
  font-size: 13px;
}

.up {
  font-weight: 700;
}

.sub-tabs {
  display: flex;
  gap: 4px;
  margin-top: 16px;
  width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
  padding: 0 8px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px 8px 0 0;
  border-bottom: none;
}

.sub-tab {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  padding: 12px 16px;
  font-size: 14px;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.65);
  border-bottom: 2px solid transparent;
  margin-bottom: 0;
  white-space: nowrap;
}

.sub-tab.on {
  color: #1890ff;
  border-bottom-color: #1890ff;
  font-weight: 500;
}

/* .sub-tabs.ops-tabs {
  align-items: center;
  gap: 22px;
  min-height: 64px;
  padding: 0 22px;
  background: #e8eef7;
  border: 1px solid #cfd9e8;
  border-radius: 8px;
}

.sub-tabs.ops-tabs .sub-tab {
  border-bottom: none;
  border-radius: 8px;
  padding: 10px 14px;
  color: #334155;
  font-weight: 700;
}

.sub-tabs.ops-tabs .sub-tab.on {
  background: #fff;
  color: #0958d9;
  border: 2px solid #111827;
  box-shadow: none;
} */

.panel.tab-panel {
  width: 100%;
  box-sizing: border-box;
  margin-top: 0;
  background: #fff;
  border-radius: 0 0 8px 8px;
  padding: 20px 24px 24px;
  border: 1px solid #f0f0f0;
  border-top: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.panel.tab-panel.overview-panel {
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 180px);
  padding: 20px;
  border-color: #e7edf6;
  box-shadow: 0 10px 28px rgba(22, 58, 105, 0.06);
}

.panel.tab-panel.my-release-panel {
  display: flex;
  flex-direction: column;
}

.panel.muted {
  min-height: 200px;
}

.panel.core {
  padding-top: 16px;
}

.core-alert {
  background: rgba(250, 173, 20, 0.12);
  border: 1px solid rgba(250, 173, 20, 0.35);
  border-radius: 8px;
  padding: 10px 12px;
  color: rgba(0, 0, 0, 0.72);
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 14px;
}

.core-alert strong {
  color: #d46b08;
  margin-right: 6px;
}

.core-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.core-levels {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fafafa;
  margin-bottom: 14px;
}

.lvl-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #f0f0f0;
  background: #fff;
  font-size: 13px;
}

.lvl-k {
  color: rgba(0, 0, 0, 0.55);
}

.lvl-v {
  color: rgba(0, 0, 0, 0.88);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.filter-block.core-filter {
  padding: 12px;
}

.filters.core-filters {
  grid-template-columns: 1fr 1fr 1fr;
}

.core-spacer {
  height: 34px;
  border: 1px solid transparent;
}

.my-stats {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 0;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 10px 8px;
  margin-bottom: 14px;
}

.my-cell {
  flex: 1 1 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 10px;
}

.my-k {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
}

.my-v {
  font-size: 14px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.88);
  font-variant-numeric: tabular-nums;
}

.my-div {
  width: 1px;
  background: #e8e8e8;
  align-self: stretch;
  min-height: 48px;
  margin: 4px 0;
}

@media (max-width: 820px) {
  .my-div {
    display: none;
  }
}

.my-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.my-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.seg {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: rgba(0, 0, 0, 0.65);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  line-height: 1.5;
}

.seg:hover {
  color: #1890ff;
  border-color: #1890ff;
}

.seg.on {
  background: #e6f7ff;
  border-color: #91d5ff;
  color: #1890ff;
  font-weight: 500;
}

.table-wrap {
  overflow-x: auto;
  height: 445px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th,
.table td {
  border-bottom: 1px solid #f0f0f0;
  padding: 12px 10px;
  text-align: left;
  vertical-align: top;
}

.table th {
  background: #fafafa;
  color: rgba(0, 0, 0, 0.65);
  font-weight: 500;
}

.my-table th {
  white-space: nowrap;
}

.my-table {
  min-width: 1120px;
}

.col-skill {
  min-width: 260px;
}

.col-level {
  min-width: 150px;
}

.col-ver {
  min-width: 140px;
}

.col-action {
  min-width: 200px;
}

.col-ops {
  min-width: 240px;
}

.skill-main {
  display: grid;
  gap: 4px;
}

.skill-name {
  color: rgba(0, 0, 0, 0.88);
  font-weight: 600;
}

.skill-sub,
.cell-sub {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 1.6;
}

.cell-main {
  color: rgba(0, 0, 0, 0.88);
  font-size: 13px;
  line-height: 1.6;
}

.num {
  font-variant-numeric: tabular-nums;
}

.st {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
}

.st-published {
  color: #389e0d;
  background: rgba(82, 196, 26, 0.12);
}

.st-reviewing-dev {
  color: #d46b08;
  background: rgba(250, 173, 20, 0.14);
}

.st-rejected-pdu {
  color: #cf1322;
  background: rgba(245, 34, 45, 0.1);
}

.ops {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mini {
  border: 1px solid #f0f0f0;
  background: #fff;
  color: rgba(0, 0, 0, 0.65);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  line-height: 1.4;
}

.mini:hover {
  border-color: #91d5ff;
  color: #1890ff;
  background: #e6f7ff;
}

.empty-row {
  padding: 18px 10px;
  text-align: center;
  color: rgba(0, 0, 0, 0.45);
}

.panel.tab-panel.ops {
  padding: 22px 0 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.ops-dashboard-card {
width: 100%;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 20px 24px 28px;
  box-sizing: border-box;
}

.ops-dash-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.ops-dash-heading {
  display: grid;
  gap: 6px;
  min-width: 280px;
}

.ops-dash-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.88);
}

.ops-dash-desc {
  margin: 0;
  max-width: 720px;
  color: rgba(0, 0, 0, 0.45);
  font-size: 13px;
  line-height: 1.6;
}

.ops-dash-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ops-dash-note {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 18px;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  background: #f8fbff;
  color: #2563eb;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.ops-import-btn {
  border-color: #1890ff;
  color: #1890ff;
}

.ops-import-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.ops-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

@media (max-width: 1100px) {
  .ops-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .ops-kpi-grid {
    grid-template-columns: 1fr;
  }
}

.ops-kpi-card {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 16px 18px;
  min-height: 100px;
  box-sizing: border-box;
}

.ops-kpi-label {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.65);
  font-weight: 500;
}

.ops-kpi-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  color: rgba(0, 0, 0, 0.88);
  font-variant-numeric: tabular-nums;
}

.ops-kpi-desc {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  line-height: 1.5;
}

.ops-mid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: stretch;
  margin-bottom: 24px;
}

@media (max-width: 1000px) {
  .ops-mid-2col {
    grid-template-columns: 1fr;
  }
}

.ops-panel-block {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ops-panel-hd {
  padding: 16px 18px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.ops-panel-hd-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ops-panel-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.88);
}

.ops-panel-sub {
  margin: 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  line-height: 1.6;
}

.ops-toggle {
  display: inline-flex;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  overflow: hidden;
  background: #fafafa;
  flex-shrink: 0;
}

.ops-system-toggle {
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-color: #e2e8f0;
  border-radius: 9px;
  background: #f8fafc;
  overflow: visible;
}

.ops-system-btn {
  min-height: 32px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #334155;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  padding: 0 12px;
  white-space: nowrap;
}

.ops-system-btn.active {
  background: #2563eb;
  color: #fff;
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.2);
}

.ops-system-btn:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.35);
  outline-offset: 2px;
}

.ops-toggle-btn {
  border: none;
  background: transparent;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.65);
}

.ops-toggle-btn.on {
  background: #e6f4ff;
  color: #1677ff;
  font-weight: 500;
}

.dept-tree-wrap {
  padding: 0 0 16px;
  font-size: 13px;
}

.dept-tree-head {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  padding: 10px 18px;
  background: #fafafa;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.dept-tree-body {
  max-height: 380px;
  overflow: auto;
}

.dept-tree-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 10px 18px 10px 12px;
  border-bottom: 1px solid #f5f5f5;
  box-sizing: border-box;
}

.dept-tree-row.child {
  background: #fcfcfc;
}

.dt-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(0, 0, 0, 0.88);
}

.dt-toggle {
  width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  border:none;
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
  flex: 0 0 auto;
}

.dt-toggle:hover {
  border-color: #91d5ff;
  background: #f0f7ff;
}

.dt-toggle-spacer {
  width: 18px;
  height: 18px;
  display: inline-block;
  flex: 0 0 auto;
}

.dt-caret {
  width: 8px;
  height: 8px;
  border-right: 2px solid rgba(0, 0, 0, 0.45);
  border-bottom: 2px solid rgba(0, 0, 0, 0.45);
  transform: rotate(-45deg);
  transition: transform 140ms ease, border-color 140ms ease;
}

.dt-toggle:hover .dt-caret {
  border-right-color: #1677ff;
  border-bottom-color: #1677ff;
}

.dt-caret.on {
  transform: rotate(45deg);
  border-right-color: #1677ff;
  border-bottom-color: #1677ff;
}

.dt-bullet {
  color: #1677ff;
  margin-right: 4px;
}

.dt-skills,
.dt-dl {
  font-variant-numeric: tabular-nums;
  color: rgba(0, 0, 0, 0.65);
  text-align: right;
  white-space: nowrap;
}

.dt-col-num {
  text-align: right;
  white-space: nowrap;
}

.org-bar-list {
  padding: 16px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.org-bar-row {
  display: grid;
  grid-template-columns: var(--org-bar-label-width, 108px) minmax(0, 1fr) 72px;
  gap: 10px;
  align-items: center;
}

@media (max-width: 600px) {
  .org-bar-row {
    grid-template-columns: minmax(72px, min(var(--org-bar-label-width, 88px), 128px)) minmax(0, 1fr) 64px;
  }
}

.org-bar-label {
  max-width: var(--org-bar-label-width, 108px);
  min-width: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.org-bar-track-wrap {
  min-width: 0;
}

.org-bar-track {
  height: 14px;
  background: #f5f5f5;
  border-radius: 4px;
  overflow: hidden;
}

.org-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6 0%, #3b82f6 100%);
  border-radius: 4px;
  min-width: 2px;
}

.org-bar-val {
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.88);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ops-top-section {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
}

.ops-top-section .ops-panel-hd {
  border-bottom: 1px solid #f0f0f0;
}

.ops-top-list {
  list-style: none;
  margin: 0;
  padding: 8px 0 16px;
}

.ops-top-row {
  display: grid;
  grid-template-columns: 40px 1fr 48px;
  gap: 12px;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #f5f5f5;
}

.ops-top-row:last-child {
  border-bottom: none;
}

.ops-top-rank {
  font-size: 16px;
  font-weight: 700;
  color: #1677ff;
  font-variant-numeric: tabular-nums;
}

.ops-top-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ops-top-name {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.88);
}

.ops-top-dept {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.ops-top-dl {
  font-size: 14px;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: rgba(0, 0, 0, 0.88);
}

.panel.tab-panel.ops {
  display: block;
  padding: 22px 0 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.btn-soft {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}

.ops-dashboard-card.ops-dashboard {
  width: 100%;
  display: grid;
  gap: 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 20px 24px 28px;
  box-sizing: border-box;
}

.ops-title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.ops-title h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: 0;
  color: #0f172a;
}

.ops-title p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.ops-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.ops-toggle.ops-system-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 9px;
  overflow: visible;
}

.ops-system-btn {
  min-height: 32px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 850;
  line-height: 1;
  padding: 0 10px;
  white-space: nowrap;
}

.ops-system-btn.active {
  background: #2563eb;
  color: #fff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
}

.ops-data-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #dbeafe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.ops-import-btn {
  min-height: 36px;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 800;
  box-shadow: none;
}

.ops-import-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ops-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.ops-kpi {
  position: relative;
  overflow: hidden;
  min-height: 104px;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #e6ebf2;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.ops-kpi::after {
  content: '';
  position: absolute;
  right: -20px;
  top: -20px;
  width: 74px;
  height: 74px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(124, 58, 237, 0.08));
}

.ops-kpi small {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
  margin-bottom: 8px;
}

.ops-kpi strong {
  display: block;
  font-size: 30px;
  line-height: 1;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.ops-kpi span {
  display: block;
  margin-top: 8px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.45;
}

.ops-main-grid {
  display: block;
}

.ops-board-rows {
  display: grid;
  gap: 16px;
}

.ops-pair-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

.ops-pair-row.dept-row > .ops-card,
.ops-pair-row.org-row > .ops-card {
  height: 400px;
  min-height: 400px;
}

.ops-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e6ebf2;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.ops-card-head {
  flex: 0 0 auto;
  min-height: 76px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #edf2f7;
}

.ops-card-head h3 {
  margin: 0;
  font-size: 17px;
  line-height: 1.25;
  letter-spacing: 0;
  color: #0f172a;
}

.ops-card-head p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.ops-card-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 16px 18px;
}

.ops-tree.board-org-tree {
  height: 100%;
  max-height: 100%;
  overflow: auto;
  padding: 16px 18px;
  display: grid;
  gap: 2px;
  align-content: start;
}

.ops-tree-item {
  display: grid;
  gap: 2px;
  align-content: start;
}

.ops-tree-node {
  width: 100%;
  min-height: 34px;
  border: 0;
  background: transparent;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 56px 78px;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  color: #334155;
  cursor: pointer;
  text-align: left;
  line-height: 1.25;
}

.ops-tree-node:hover {
  background: #f8fafc;
}

.ops-tree-node.active {
  background: linear-gradient(90deg, #eaf3ff, #f4f7ff);
  color: #1d4ed8;
  box-shadow: inset 3px 0 0 #2563eb;
}

.ops-caret-btn {
  width: 20px;
  height: 20px;
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ops-caret-btn:hover {
  background: #eef2ff;
  color: #2563eb;
}

.ops-caret-placeholder {
  width: 20px;
  text-align: center;
  color: #cbd5e1;
  font-size: 12px;
}

.ops-tree-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 800;
}

.ops-tree-count,
.ops-tree-download {
  white-space: nowrap;
  text-align: right;
  font-size: 12px;
  font-weight: 850;
  font-variant-numeric: tabular-nums;
}

.ops-tree-download {
  color: #64748b;
  font-weight: 750;
}

.ops-tree-node.active .ops-tree-count {
  color: #1d4ed8;
}

.ops-tree-node.lv1 {
  margin-left: 0;
}

.ops-tree-node.lv2 {
  margin-left: 16px;
  width: calc(100% - 16px);
}

.ops-tree-node.lv3 {
  margin-left: 32px;
  width: calc(100% - 32px);
}

.ops-tree-node.lv4 {
  margin-left: 48px;
  width: calc(100% - 48px);
}

.ops-tree-node.lv5 {
  margin-left: 64px;
  width: calc(100% - 64px);
}

.ops-tree-node.lv6 {
  margin-left: 80px;
  width: calc(100% - 80px);
}

.ops-org-bars {
  height: 100%;
  max-height: 100%;
  overflow: auto;
  display: grid;
  gap: 10px;
  padding-right: 6px;
  align-content: start;
}

.ops-org-bar {
  width: 100%;
  border: 1px solid #edf2f7;
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  display: grid;
  gap: 8px;
  text-align: left;
}

.ops-org-bar:hover {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.ops-org-bar.active {
  border-color: #93c5fd;
  background: linear-gradient(90deg, #eaf3ff, #f7fbff);
  box-shadow: inset 3px 0 0 #2563eb;
}

.ops-org-bar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.ops-org-bar-top b {
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops-org-bar-top span {
  color: #64748b;
  font-weight: 850;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ops-bar-track {
  height: 14px;
  background: #eef2f7;
  border-radius: 999px;
  overflow: hidden;
}

.ops-bar-fill {
  height: 100%;
  display: block;
  min-width: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, #2563eb, #7c3aed);
}

.ops-detail-table-card {
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  border-color: #dfe7f2;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
}

.ops-pair-row > .ops-detail-table-card .ops-card-body {
  padding: 10px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.ops-skill-table,
.ops-skill-table-wrap {
  height: 100%;
  max-height: 100%;
  min-height: 0;
}

.ops-skill-table-wrap {
  overflow: auto;
  border: 1px solid #e6edf6;
  border-radius: 10px;
  background: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.ops-detail-table.table {
  min-width: 1180px;
  width: 1180px;
  table-layout: fixed;
  border: 0;
  border-radius: 0;
  border-collapse: separate;
  border-spacing: 0;
  background: #fff;
}

.ops-detail-table th,
.ops-detail-table td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.ops-detail-table .col-name {
  width: 240px;
  min-width: 240px;
  max-width: 240px;
}

.ops-detail-table .col-desc {
  width: 610px;
  min-width: 610px;
  max-width: 610px;
}

.ops-detail-table .col-owner {
  width: 190px;
  min-width: 190px;
  max-width: 190px;
}

.ops-detail-table .col-download {
  width: 140px;
  min-width: 140px;
  max-width: 140px;
  text-align: left;
}

.ops-detail-table th.sticky-name,
.ops-detail-table td.sticky-name {
  position: sticky;
  left: 0;
  z-index: 8;
  background: #fff;
  box-shadow: 6px 0 12px -12px rgba(15, 23, 42, 0.35), 1px 0 0 #e5e7eb;
}

.ops-detail-table th.sticky-download,
.ops-detail-table td.sticky-download {
  position: sticky;
  right: 0;
  z-index: 8;
  background: #fff;
  box-shadow: -6px 0 12px -12px rgba(15, 23, 42, 0.35), -1px 0 0 #e5e7eb;
}

.ops-detail-table thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  height: 44px;
  padding: 0 14px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  color: #334155;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.02em;
  border-bottom: 1px solid #dce5f0;
  text-align: left;
}

.ops-detail-table thead th.sticky-name,
.ops-detail-table thead th.sticky-download {
  z-index: 12;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.ops-detail-table tbody td {
  height: 52px;
  padding: 0 14px;
  border-bottom: 1px solid #eef2f7;
  color: #334155;
  font-size: 13px;
  background: #fff;
}

.ops-detail-table tbody tr:last-child td {
  border-bottom: 0;
}

.ops-detail-table tbody tr:hover td,
.ops-detail-table tbody tr:hover td.sticky-name,
.ops-detail-table tbody tr:hover td.sticky-download {
  background: #f8fbff;
}

.cell-ellipsis {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.skill-row-dot {
  width: 22px;
  height: 22px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 900;
}

.desc-text {
  color: #64748b;
}

.owner-pill {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.download-pill {
  display: inline-flex;
  justify-content: center;
  min-width: 54px;
  height: 26px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  background: linear-gradient(135deg, #eff6ff, #eef2ff);
  color: #1d4ed8;
  border: 1px solid #dbeafe;
  font-size: 12px;
  font-weight: 900;
}

.ops-empty-detail {
  height: 96px;
  text-align: center;
  color: #94a3b8;
  background: #fff;
}

.ops-top-card {
  min-height: 260px;
}

.ops-top-card .ops-card-body {
  overflow: auto;
}

.ops-top-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
}

.ops-top-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #edf2f7;
  border-radius: 10px;
  background: #fff;
}

.ops-rank {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ops-top-item b {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 2px;
}

.ops-top-item small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #64748b;
  font-size: 12px;
}

.ops-download {
  color: #0f172a;
  font-weight: 850;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.ops-tree.board-org-tree::-webkit-scrollbar,
.ops-org-bars::-webkit-scrollbar,
.ops-skill-table-wrap::-webkit-scrollbar,
.ops-top-card .ops-card-body::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.ops-tree.board-org-tree::-webkit-scrollbar-thumb,
.ops-org-bars::-webkit-scrollbar-thumb,
.ops-skill-table-wrap::-webkit-scrollbar-thumb,
.ops-top-card .ops-card-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}

.ops-tree.board-org-tree::-webkit-scrollbar-track,
.ops-org-bars::-webkit-scrollbar-track,
.ops-skill-table-wrap::-webkit-scrollbar-track,
.ops-top-card .ops-card-body::-webkit-scrollbar-track {
  background: transparent;
}

@media (max-width: 1180px) {
  .ops-title {
    align-items: flex-start;
    flex-direction: column;
  }

  .ops-filter {
    justify-content: flex-start;
  }

  .ops-pair-row {
    grid-template-columns: 1fr;
  }

  .ops-pair-row.dept-row > .ops-card,
  .ops-pair-row.org-row > .ops-card {
    height: 360px;
    min-height: 360px;
  }
}

@media (max-width: 760px) {
  .ops-dashboard-card.ops-dashboard {
    padding: 16px;
  }

  .ops-kpis {
    grid-template-columns: 1fr;
  }

  .ops-tree-node {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .ops-tree-count,
  .ops-tree-download {
    display: none;
  }
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-title {
  margin: 0 0 6px;
  font-size: 18px;
  text-align: left;
}

.panel-help {
  margin: 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  text-align: left;
}

.overview-panel .panel-head {
  align-items: center;
  padding: 16px;
  margin-bottom: 14px;
  background: #fff;
  border: 1px solid #edf2f7;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(28, 72, 122, 0.05);
}

.overview-panel .panel-title {
  font-size: 20px;
  color: #10243e;
}

.overview-panel .panel-help {
  color: #667085;
}

.overview-panel .btn.primary.sm {
  height: 34px;
  padding: 0 14px;
  box-shadow: 0 6px 14px rgba(24, 144, 255, 0.18);
  white-space: nowrap;
}

.stats-strip {
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  flex-wrap: wrap;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 18px;
  gap: 0;
}

.overview-panel .stats-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  background: transparent;
  border: 0;
  padding: 0;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.stat-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  background-color: #fff;
  border: 1px solid #edf2f7;
  white-space: nowrap;
}

.overview-panel .stat-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-height: 76px;
  gap: 6px;
  padding: 14px 16px;
  background: #fff;
  border-color: #e7edf6;
  box-shadow: 0 4px 14px rgba(28, 72, 122, 0.05);
}

.stat-k {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
}

.overview-panel .stat-k {
  color: #667085;
}

.stat-v {
  font-size: 14px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.88);
  font-variant-numeric: tabular-nums;
}

.overview-panel .stat-v {
  font-size: 24px;
  line-height: 1;
  color: #10243e;
}

.stat-div {
  width: 1px;
  background: #e8e8e8;
  align-self: stretch;
  min-height: 48px;
  margin: 4px 0;
}

.overview-panel .stat-div {
  display: none;
}

@media (max-width: 720px) {
  .stat-div {
    display: none;
  }
}

.filter-block {
  margin-bottom: 20px;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px 12px 12px;
}

.overview-panel .filter-block {
  padding: 14px;
  border-color: #e7edf6;
  box-shadow: 0 4px 16px rgba(28, 72, 122, 0.04);
}

.quick-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.overview-panel .quick-row {
  align-items: center;
  margin-bottom: 12px;
}

.quick-label {
  font-size: 13px;
  color: #475467;
  font-weight: 600;
  padding-top: 0;
}

.quick-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}

.pill {
  border: 1px solid #d9d9d9;
  background: #fafafa;
  color: rgba(0, 0, 0, 0.65);
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  padding: 5px 12px;

}

.overview-panel .pill {
  background: #fff;
  border-color: #d8e1ec;
  border-radius: 999px;
  color: #344054;
}

.pill:hover {
  color: #1890ff;
  border-color: #1890ff;
}

.pill.active {
  background: #e6f7ff;
  border-color: #91d5ff;
  color: #1890ff;
  font-weight: 500;
}

.overview-panel .pill.active {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
  box-shadow: 0 5px 12px rgba(22, 119, 255, 0.18);
}

.filters {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(180px, 240px) minmax(160px, 220px);
  gap: 12px;
}

.overview-panel .filters {
  grid-template-columns: minmax(280px, 1fr) minmax(180px, 220px) minmax(160px, 200px);
  gap: 10px;
}

@media (max-width: 900px) {
  .filters {
    grid-template-columns: 1fr;
  }

  .overview-panel .filters {
    grid-template-columns: 1fr;
  }
}

.search,
.select {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 6px 11px;
  font-size: 14px;
  height: 34px;
}

.overview-panel .search,
.overview-panel .select {
  height: 38px;
  border-color: #d8e1ec;
  background-color: #fbfdff;
}

.overview-panel .search:focus,
.overview-panel .select:focus {
  border-color: #1677ff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.1);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.overview-panel .grid {
  gap: 14px;
}

.overview-panel :deep(.card) {
  min-height: 156px;
  padding: 16px;
  border-color: #e7edf6;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(28, 72, 122, 0.06);
}

.overview-panel :deep(.card:hover) {
  border-color: #b9d7ff;
  box-shadow: 0 10px 24px rgba(28, 72, 122, 0.1);
  transform: translateY(-1px);
}

.overview-panel :deep(.title) {
  font-size: 15px;
  color: #10243e;
}

.overview-panel :deep(.meta) {
  color: #667085;
}

.overview-panel :deep(.more) {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.overview-panel :deep(.more:hover) {
  background: #f2f7ff;
}

.overview-panel :deep(.tag) {
  border-radius: 999px;
  padding: 2px 9px;
}

.overview-panel :deep(.dl-btn) {
  color: #1677ff;
  background: #f2f7ff;
  border-radius: 999px;
  padding: 5px 9px;
}

@media (max-width: 820px) {
  .overview-panel .stats-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-panel .panel-head {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 560px) {
  .panel.tab-panel.overview-panel {
    padding: 14px;
  }

  .overview-panel .stats-strip {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1000px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.empty {
  padding: 24px;
  text-align: center;
  color: rgba(0, 0, 0, 0.45);
  font-size: 14px;
}

.muted-text {
  color: rgba(0, 0, 0, 0.45);
  font-size: 14px;
}

.ops-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

@media (max-width: 900px) {
  .ops-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
}

.ops-card {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 16px;
}

.ops-label {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
}

.ops-num {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 600;
  color: #1890ff;
}

.ops-dashboard .ops-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0;
  background: #fff;
  border: 1px solid #e6ebf2;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.ops-dashboard .ops-detail-table-card {
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  border-color: #dfe7f2;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
}

.subhead {
  margin: 16px 0 8px;
  font-size: 15px;
}

.rank {
  margin: 0;
  padding-left: 20px;
  color: rgba(0, 0, 0, 0.75);
  font-size: 14px;
  line-height: 1.9;
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.stat-cell {
  min-height: 76px;
  padding: 14px 16px;
  border: 1px solid #e7edf6;
  border-radius: 8px;
  background: #fff;
}

/* Ops dashboard visual polish */
.ops-dashboard-card.ops-dashboard {
  gap: 16px;
  padding: 18px;
  border-color: #dfe7f1;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.055);
}

.ops-dashboard .ops-title {
  align-items: center;
  padding: 2px 2px 8px;
  border-bottom: 1px solid #edf2f7;
}

.ops-dashboard .ops-title h2 {
  font-size: 22px;
  font-weight: 850;
  color: #10243e;
}

.ops-dashboard .ops-title p {
  max-width: 780px;
  color: #667085;
}

.ops-dashboard .ops-filter {
  gap: 8px;
}

.ops-dashboard .ops-toggle.ops-system-toggle {
  min-height: 38px;
  background: #edf4ff;
  border-color: #d5e3f6;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.ops-dashboard .ops-system-btn {
  min-width: 72px;
  color: #475569;
  font-size: 13px;
}

.ops-dashboard .ops-system-btn.active {
  color: #fff;
  background: #2563eb;
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.18);
}

.ops-dashboard .ops-data-note,
.ops-dashboard .ops-import-btn {
  min-height: 38px;
  border-radius: 9px;
}

.ops-dashboard .ops-data-note {
  background: #f7fbff;
  color: #2563eb;
  border-color: #d7e8ff;
}

.ops-dashboard .ops-import-btn {
  background: #fff;
  border-color: #cfe1ff;
}

.ops-dashboard .ops-kpis {
  gap: 12px;
}

.ops-dashboard .ops-kpi {
  min-height: 92px;
  padding: 14px 16px;
  border-radius: 10px;
  border-color: #e4ebf5;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
}

.ops-dashboard .ops-kpi::after {
  right: 10px;
  top: 12px;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(20, 184, 166, 0.08));
}

.ops-dashboard .ops-kpi small,
.ops-dashboard .ops-kpi span {
  color: #667085;
}

.ops-dashboard .ops-kpi strong {
  font-size: 28px;
  font-weight: 850;
  letter-spacing: 0;
}

.ops-dashboard .ops-card {
  border-color: #e0e8f2;
  border-radius: 10px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.045);
}

.ops-dashboard .ops-card-head {
  min-height: 0;
  padding: 10px 16px 9px;
  background: #fff;
}

.ops-dashboard .ops-card-head h3 {
  font-size: 15px;
  font-weight: 850;
  line-height: 1.25;
}

.ops-dashboard .ops-card-head p {
  margin-top: 2px;
  color: #667085;
  font-size: 12px;
  line-height: 1.4;
}

.ops-dashboard .ops-pair-row {
  gap: 14px;
}

.ops-dashboard .ops-pair-row.dept-row > .ops-card,
.ops-dashboard .ops-pair-row.org-row > .ops-card {
  height: 340px;
  min-height: 340px;
}

.ops-dashboard .ops-tree.board-org-tree {
  padding: 12px;
  gap: 4px;
}

.ops-dashboard .ops-tree-node {
  min-height: 32px;
  grid-template-columns: 22px minmax(0, 1fr) 46px 76px;
  gap: 7px;
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: 7px;
}

.ops-dashboard .ops-tree-node:hover {
  border-color: #e3ebf7;
  background: #f8fbff;
}

.ops-dashboard .ops-tree-node.active {
  border-color: #b8d4ff;
  background: #edf5ff;
  box-shadow: inset 3px 0 0 #2563eb;
}

.ops-dashboard .ops-tree-name {
  font-weight: 750;
}

.ops-dashboard .ops-tree-count,
.ops-dashboard .ops-tree-download {
  color: #475569;
  font-weight: 760;
}

.ops-dashboard .ops-caret-btn {
  background: #f6f9fd;
}

.ops-dashboard .ops-org-bars {
  gap: 8px;
  padding-right: 2px;
}

.ops-dashboard .ops-org-bar {
  gap: 7px;
  padding: 9px 10px;
  border-radius: 9px;
  border-color: #e5edf6;
  background: #fbfdff;
}

.ops-dashboard .ops-org-bar.active {
  border-color: #aacbff;
  background: #edf5ff;
  box-shadow: inset 3px 0 0 #2563eb;
}

.ops-dashboard .ops-org-bar-top b {
  font-weight: 800;
}

.ops-dashboard .ops-org-bar-top span {
  color: #475569;
  font-weight: 760;
}

.ops-dashboard .ops-bar-track {
  height: 10px;
  background: #edf2f7;
}

.ops-dashboard .ops-bar-fill {
  background: linear-gradient(90deg, #2563eb, #14b8a6);
}

.ops-dashboard .ops-pair-row > .ops-detail-table-card .ops-card-body {
  padding: 8px;
  background: #f8fbff;
}

.ops-dashboard .ops-skill-table-wrap {
  border-color: #e0e8f2;
  border-radius: 9px;
  box-shadow: none;
}

.ops-dashboard .ops-detail-table.table {
  width: 100%;
  min-width: 760px;
}

.ops-dashboard .ops-detail-table .col-name {
  width: 190px;
  min-width: 190px;
  max-width: 190px;
}

.ops-dashboard .ops-detail-table .col-desc {
  width: auto;
  min-width: 260px;
  max-width: none;
}

.ops-dashboard .ops-detail-table .col-owner {
  width: 130px;
  min-width: 130px;
  max-width: 130px;
}

.ops-dashboard .ops-detail-table .col-download {
  width: 110px;
  min-width: 110px;
  max-width: 110px;
}

.ops-dashboard .ops-detail-table thead th {
  height: 40px;
  padding: 0 12px;
  background: #f6f9fd;
  border-bottom-color: #e1e8f1;
}

.ops-dashboard .ops-detail-table tbody td {
  height: 48px;
  padding: 0 12px;
}

.ops-dashboard .ops-detail-table th.sticky-name,
.ops-dashboard .ops-detail-table td.sticky-name,
.ops-dashboard .ops-detail-table th.sticky-download,
.ops-dashboard .ops-detail-table td.sticky-download {
  box-shadow: none;
}

.ops-dashboard .skill-row-dot {
  width: 20px;
  height: 20px;
  border-radius: 7px;
}

.ops-dashboard .owner-pill,
.ops-dashboard .download-pill {
  height: 24px;
}

.ops-dashboard .download-pill {
  color: #1d4ed8;
  background: #eef5ff;
  border-color: #d7e8ff;
}

.ops-dashboard .ops-top-card {
  min-height: auto;
}

.ops-dashboard .ops-top-card .ops-card-body {
  padding: 12px;
}

.ops-dashboard .ops-top-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ops-dashboard .ops-top-item {
  padding: 9px 10px;
  border-radius: 9px;
  background: #fbfdff;
}

.ops-dashboard .ops-empty-state {
  min-height: 132px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px 16px;
  border: 1px dashed #cfe0f3;
  border-radius: 10px;
  background: #f8fbff;
  color: #667085;
  text-align: center;
}

.ops-dashboard .ops-empty-state strong {
  color: #334155;
  font-size: 14px;
  font-weight: 850;
}

.ops-dashboard .ops-empty-state span {
  max-width: 360px;
  font-size: 12px;
  line-height: 1.5;
}

.ops-dashboard .ops-top-empty {
  grid-column: 1 / -1;
}

.ops-dashboard .ops-detail-empty-state {
  height: 100%;
  min-height: 0;
}

.ops-dashboard .ops-empty-detail {
  height: 112px;
  color: #667085;
  background: #f8fbff;
  font-size: 13px;
}

.ops-dashboard .ops-rank {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}

@media (max-width: 1180px) {
  .ops-dashboard-card.ops-dashboard {
    padding: 16px;
  }

  .ops-dashboard .ops-title {
    align-items: flex-start;
  }

  .ops-dashboard .ops-pair-row.dept-row > .ops-card,
  .ops-dashboard .ops-pair-row.org-row > .ops-card {
    height: auto;
    min-height: 0;
  }

  .ops-dashboard .ops-tree.board-org-tree,
  .ops-dashboard .ops-org-bars,
  .ops-dashboard .ops-skill-table-wrap {
    max-height: 320px;
  }
}

@media (max-width: 820px) {
  .ops-dashboard .ops-kpis,
  .ops-dashboard .ops-top-list {
    grid-template-columns: 1fr;
  }

  .ops-dashboard .ops-filter {
    width: 100%;
    justify-content: flex-start;
  }

  .ops-dashboard .ops-data-note {
    flex: 1 1 220px;
  }

  .ops-dashboard .ops-detail-table.table {
    min-width: 640px;
  }

  .ops-dashboard .ops-detail-table .col-owner {
    display: none;
  }
}

.stat-cell span {
  display: block;
  color: #667085;
  font-size: 13px;
}

.stat-cell strong {
  display: block;
  margin-top: 8px;
  color: #10243e;
  font-size: 24px;
  line-height: 1;
}

.panel {
  margin-top: 16px;
  padding: 20px;
  border: 1px solid #e7edf6;
  border-radius: 8px;
  background: #fff;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

/* .filter-block {
  display: grid;
  grid-template-columns: 1fr minmax(240px, 360px);
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
} */

.quick-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill,
.mini {
  border: 1px solid #d8e1ec;
  background: #fff;
  color: #344054;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.pill {
  padding: 6px 12px;
}

.pill.active {
  color: #fff;
  background: #1677ff;
  border-color: #1677ff;
}

.search {
  width: 100%;
  height: 38px;
  box-sizing: border-box;
  border: 1px solid #d8e1ec;
  border-radius: 6px;
  padding: 0 12px;
  font-size: 14px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  color: #667085;
  font-size: 13px;
}

.pager-actions {
  display: flex;
  gap: 8px;
}

.mini {
  padding: 6px 10px;
}

.mini:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.empty {
  padding: 28px;
  text-align: center;
  color: #667085;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.plain-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.plain-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #edf2f7;
  border-radius: 8px;
}

.plain-list strong {
  color: #10243e;
}

.plain-list span {
  color: #667085;
  font-size: 13px;
  text-align: right;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 900;
  padding: 16px;
}

.detail-overlay {
  background: rgba(15, 23, 42, 0.48);
}

.skill-detail-dialog {
  width: min(1040px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.24);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 22px;
  border-bottom: 1px solid #e5e7eb;
}

.detail-head h2 {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  line-height: 1.25;
  font-weight: 800;
}

.detail-close,
.detail-btn {
  border: 1px solid #dbe4f0;
  background: #fff;
  color: #172033;
  border-radius: 7px;
  min-height: 34px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
}

.detail-close:hover,
.detail-btn.ghost:hover {
  color: #2563eb;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.detail-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 18px 22px 12px;
}

.detail-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.detail-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 4px 10px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e5eaf1;
  font-size: 12px;
  line-height: 1.2;
}

.detail-pill.pill-category,
.detail-pill.pill-id {
  background: #eff6ff;
  color: #2563eb;
  border-color: #dbeafe;
}

.detail-pill.scope-org {
  background: #dcfce7;
  color: #15803d;
  border-color: #bbf7d0;
  font-weight: 800;
}

.detail-pill.scope-personal {
  background: #f1f4f8;
  color: #3f5f7c;
  border-color: #edf1f5;
  font-weight: 800;
}

.detail-download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #1e293b;
  font-size: 13px;
}

.detail-download svg {
  width: 16px;
  height: 16px;
}

.detail-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.detail-btn.primary {
  color: #fff;
  background: #2563eb;
  border-color: #2563eb;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
}

.detail-btn.primary:hover {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.detail-main {
  display: grid;
  grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
  gap: 16px;
  padding: 0 22px 18px;
  overflow: hidden;
  min-height: 0;
}

.detail-file-panel,
.detail-md-panel {
  min-height: 0;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #fff;
  overflow: hidden;
}

.detail-panel-title {
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  color: #334155;
  font-size: 14px;
  font-weight: 800;
}

.detail-file-panel pre {
  margin: 0;
  padding: 16px;
  white-space: pre-wrap;
  color: #334155;
  font-size: 12px;
  line-height: 1.55;
  font-family: Consolas, 'Courier New', monospace;
}

.detail-md-panel {
  display: flex;
  flex-direction: column;
}

.detail-md-body {
  padding: 18px;
  overflow: auto;
  color: #334155;
  font-size: 13px;
  line-height: 1.58;
}

.detail-md-body h3 {
  margin: 0 0 8px;
  color: #334155;
  font-size: 22px;
  line-height: 1.2;
}

.detail-md-body h4 {
  margin: 16px 0 8px;
  color: #334155;
  font-size: 16px;
}

.detail-md-body p,
.detail-md-body ul {
  margin: 0 0 12px;
}

.detail-meta-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.detail-meta-table th,
.detail-meta-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  font-size: 13px;
}

.detail-meta-table tr:last-child th,
.detail-meta-table tr:last-child td {
  border-bottom: 0;
}

.detail-meta-table th {
  width: 132px;
  color: #475569;
  background: #f8fafc;
  font-weight: 800;
}

.detail-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 18px;
  border-top: 1px solid #e5e7eb;
}

.v-dialog {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px 20px;
}

.v-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.close-x {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.45);
}

.v-sub {
  margin: 0 0 12px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.55);
}

.v-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 280px;
  overflow: auto;
}

.v-list li {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
  font-size: 13px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.v-list .ver {
  font-weight: 600;
  color: #1890ff;
}

.v-list .time {
  color: rgba(0, 0, 0, 0.45);
}

.v-list .note {
  grid-column: 1 / -1;
  color: rgba(0, 0, 0, 0.65);
}

.v-dialog-wide {
  max-width: 520px;
}

.v-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.admin-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.admin-panel-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f8fbff;
  border: 1px solid #e3ebf7;
  font-size: 14px;
  color: #475569;
}

.summary-strip b {
  color: #10243e;
  font-weight: 800;
}

.admin-mini-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.mini-tabs {
  display: inline-flex;
  border: 1px solid #d8e1ec;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.mini-tab {
  border: none;
  background: transparent;
  padding: 8px 16px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
}

.mini-tab.active {
  background: #edf5ff;
  color: #2563eb;
  font-weight: 700;
}

.admin-table-wrap {
  overflow: auto;
}

.admin-table {
  min-width: 720px;
}

.admin-table .cell-admins {
  max-width: 280px;
  word-break: break-all;
  font-size: 13px;
  color: #475569;
}

.admin-table .cell-reason {
  max-width: 320px;
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
}

.reason-detail {
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.admin-loading {
  padding: 24px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}

.adm-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.adm-badge.on {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.adm-badge.off {
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
}

.adm-badge.ok {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.adm-badge.bad {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
}

.admin-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.admin-field.admin-check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.admin-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #d8e1ec;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.review-decision-row {
  display: flex;
  gap: 20px;
}

.admin-radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #334155;
  cursor: pointer;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  padding: 10px 18px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 1100;
  max-width: 90vw;
  text-align: center;
}

@media (max-width: 820px) {
  .hero,
  .panel-head,
  .pager {
    align-items: flex-start;
    flex-direction: column;
  }

  .stats-strip,
  .filter-block,
  .two-col {
    grid-template-columns: 1fr;
  }

  .skill-detail-dialog {
    width: calc(100vw - 24px);
  }

  .detail-toolbar,
  .detail-main {
    grid-template-columns: 1fr;
  }

  .detail-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .detail-actions,
  .detail-foot {
    width: 100%;
  }

  .detail-btn {
    flex: 1;
  }

  .detail-main {
    overflow: auto;
  }
}

/* User market visual refresh aligned to supplied prototype */
.panel.tab-panel.overview-panel,
.panel.tab-panel.my-release-panel {
  margin-top: 0;
  padding: 18px 20px 22px;
  border: 1px solid #e2e8f0;
  border-top: none;
  border-radius: 0 0 10px 10px;
  background: #fff;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.06);
}

.overview-panel .stats-strip,
.my-release-panel .my-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 12px;
  margin: 0 0 14px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 8px;
}

.overview-panel .stat-cell,
.my-release-panel .my-cell {
  flex: 0 0 auto;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  min-height: auto;
  padding: 5px 8px;
  border: 1px solid #edf2f7;
  border-radius: 6px;
  background: #fff;
  box-shadow: none;
  white-space: nowrap;
}

.overview-panel .stat-k,
.my-release-panel .my-k {
  color: #475569;
  font-size: 13px;
  font-weight: 500;
}

.overview-panel .stat-v,
.my-release-panel .my-v {
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.4;
}

.overview-panel .stat-div,
.my-release-panel .my-div {
  display: none;
}

.market-layout {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

.market-sidebar {
  position: sticky;
  top: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}

.overview-panel .market-sidebar {
  align-self: start;
  max-height: min(100%, calc(100vh - 200px));
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.side-nav {
  display: grid;
  gap: 4px;
}

.side-nav-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 9px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 760;
  cursor: pointer;
  text-align: left;
}

.side-nav-item:hover {
  background: #f8fafc;
}

.side-nav-item.active {
  color: #3158ff;
  background: linear-gradient(90deg, #eaf0ff, #f4f7ff);
}

.side-nav-icon {
  width: 18px;
  text-align: center;
  color: inherit;
}

.side-block {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #eef2f7;
}

.side-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 9px;
  color: #172033;
  font-size: 13px;
  font-weight: 850;
}

.tag-title {
  justify-content: space-between;
  gap: 10px;
}

.tag-title > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tag-clear {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  line-height: 1;
  padding: 2px 0;
  cursor: pointer;
}

.tag-clear:hover {
  color: #2563eb;
}

.side-help {
  width: 14px;
  height: 14px;
  border: 1px solid #94a3b8;
  color: #64748b;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
}

.side-tags-collapsible {
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.overview-panel .side-block--tags .side-tags-collapsible:not(.is-expanded) {
  max-height: 132px;
}

.overview-panel .side-block--tags .side-tags-collapsible.is-expanded {
  max-height: none;
  overflow: visible;
}

.side-tags-expand {
  margin-top: 8px;
  width: 100%;
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  padding: 6px 0 2px;
  cursor: pointer;
  text-align: left;
}

.side-tags-expand:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.side-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.side-tag {
  border: 1px solid #dce3ed;
  background: #fff;
  color: #64748b;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  line-height: 1.2;
}

.side-tag:hover,
.side-tag.active {
  color: #2563eb;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.side-empty {
  color: #94a3b8;
  font-size: 12px;
}

.market-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.market-chip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
}

.market-chip-main {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.market-chip {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #172033;
  border-radius: 8px;
  min-height: 34px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.market-chip.active {
  color: #fff;
  background: #2563eb;
  border-color: #2563eb;
}

.overview-panel .filters {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(120px, 200px) minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 14px;
  align-items: center;
  min-width: 0;
}

.overview-panel .filters > * {
  min-width: 0;
}

.overview-panel .search,
.overview-panel .select {
  height: 42px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background-color: #fff;
  color: #334155;
  font-size: 14px;
}

.overview-panel .search {
  padding: 0 14px;
}

.overview-panel .select {
  padding: 0 34px 0 14px;
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, #94a3b8 50%),
    linear-gradient(135deg, #94a3b8 50%, transparent 50%);
  background-position:
    calc(100% - 18px) calc(50% - 3px),
    calc(100% - 12px) calc(50% - 3px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
}

.overview-panel .select:disabled {
  color: #94a3b8;
  background-color: #f8fafc;
  cursor: not-allowed;
}

.market-dept-cascader {
  position: relative;
  min-width: 0;
}

.market-dept-cascader-trigger {
  width: 100%;
  min-height: 42px;
  padding: 0 34px 0 14px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background-color: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  position: relative;
  box-sizing: border-box;
}

.market-dept-cascader-trigger:hover {
  border-color: #c5d0e0;
}

.market-dept-cascader-trigger.is-open,
.market-dept-cascader-trigger:focus {
  border-color: #1677ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}

.market-dept-cascader-trigger-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.market-dept-cascader-caret {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: #94a3b8;
  pointer-events: none;
}

.market-dept-cascader-panel {
  display: flex;
  flex-direction: column;
  width: max-content;
  min-width: 200px;
  max-width: 720px;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.14);
  overflow: hidden;
}

.market-dept-cascader-empty {
  padding: 16px 14px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.market-dept-cascader-columns {
  display: flex;
  flex-wrap: nowrap;
  min-width: 0;
  width: 100%;
  max-height: 280px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.market-dept-cascader-col {
  flex: 0 0 auto;
  min-width: 140px;
  max-width: 220px;
  border-right: 1px solid #eef2f7;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.market-dept-cascader-col:last-of-type {
  border-right: 0;
}

.market-dept-cascader-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 9px 12px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
  text-align: left;
}

.market-dept-cascader-item:hover {
  background: #f8fafc;
}

.market-dept-cascader-item.is-active {
  background: #eaf2ff;
  color: #2563eb;
  font-weight: 750;
}

.market-dept-cascader-item-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.market-dept-cascader-item-chevron {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 14px;
  font-weight: 800;
}

.market-dept-cascader-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid #eef2f7;
  background: #fafbfc;
}

.market-dept-cascader-clear {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  padding: 6px 4px;
}

.market-dept-cascader-clear:hover {
  color: #2563eb;
}

.market-dept-cascader-done {
  border: 1px solid #dbe3ee;
  background: #fff;
  color: #172033;
  font-size: 13px;
  font-weight: 700;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}

.market-dept-cascader-done:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.overview-panel .grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

@media (min-width: 1920px) {
  .overview-panel .grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.overview-panel :deep(.card) {
  min-height: auto;
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.overview-panel :deep(.card:hover) {
  border-color: #cbd5e1;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}

.overview-panel :deep(.title) {
  color: #111827;
  font-size: 15px;
  font-weight: 750;
  letter-spacing: 0;
}

.overview-panel :deep(.meta) {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}

.overview-panel :deep(.tag) {
  min-height: 24px;
  border: 0;
  border-radius: 6px;
  background: #f3f6fb;
  color: #667085;
  padding: 3px 9px;
}

.overview-panel :deep(.tag-fn) {
  background: #eaf2ff;
  color: #2563eb;
}

.overview-panel :deep(.tag-org) {
  background: #e8f8ef;
  color: #12805c;
}

.overview-panel :deep(.dl-btn) {
  color: #172033;
  background: transparent;
  border-radius: 0;
  padding: 0;
  font-size: 12px;
}

.overview-panel .overview-list-footer {
  margin-top: auto;
  padding-top: 16px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.overview-panel .market-content {
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.overview-loading-hint {
  margin: 24px 0;
}

.my-release-panel .my-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.panel.tab-panel.my-release-panel {
  padding: 0;
  overflow: hidden;
}

.my-release-panel .my-release-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.my-release-panel .my-release-head h2 {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
  font-weight: 850;
  letter-spacing: 0;
}

.my-release-panel .my-upload-btn {
  min-height: 36px;
  padding: 0 14px;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.16);
}

.my-release-panel .my-release-body {
  padding: 18px 20px 22px;
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.my-release-panel .my-stats {
  margin-bottom: 14px;
}

.my-release-panel .my-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.my-release-panel .seg {
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #475569;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.my-release-panel .seg.on {
  color: #1d4ed8;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.my-release-panel .table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: auto;
}

.my-release-panel .table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.my-release-panel .table th,
.my-release-panel .table td {
  padding: 13px 14px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  font-size: 13px;
  vertical-align: top;
}

.my-release-panel .table th {
  color: #475569;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 700;
}

.my-release-panel .table tr:last-child td {
  border-bottom: 0;
}

.my-release-panel .table tbody tr:hover td {
  background: #f8fafc;
}

.my-release-panel .clickable-row {
  cursor: pointer;
}

.my-release-panel .col-skill {
  min-width: 230px;
}

.my-release-panel .col-level {
  min-width: 132px;
}

.my-release-panel .col-ver {
  min-width: 132px;
}

.my-release-panel .col-status {
  min-width: 116px;
}

.my-release-panel .col-dl {
  min-width: 92px;
}

.my-release-panel .col-action {
  min-width: 178px;
}

.my-release-panel .col-ops {
  min-width: 260px;
}

.my-release-panel .skill-name,
.my-release-panel .cell-main {
  color: #111827;
  font-weight: 700;
}

.my-release-panel .skill-sub,
.my-release-panel .cell-sub {
  color: #64748b;
  font-size: 12px;
  line-height: 1.55;
  margin-top: 4px;
}

.my-release-panel .st {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.my-release-panel .st-published {
  color: #15803d;
  background: #dcfce7;
}

.my-release-panel .st-reviewing-dev {
  color: #c2410c;
  background: #ffedd5;
}

.my-release-panel .st-rejected-pdu {
  color: #b91c1c;
  background: #fee2e2;
}

.my-release-panel .mini {
  border-color: #e5e7eb;
  border-radius: 6px;
  padding: 7px 10px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 760;
}

.my-release-panel .mini:hover {
  color: #1d4ed8;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.my-release-panel .ops {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.my-release-panel .num {
  color: #172033;
  font-weight: 800;
}

.my-release-panel .empty-row {
  padding: 32px 16px;
  text-align: center;
  color: #64748b;
}

@media (max-width: 1180px) {
  .overview-panel .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-panel .filters {
    grid-template-columns: 1fr 1fr;
  }

  .market-dept-cascader {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .panel.tab-panel.overview-panel,
  .panel.tab-panel.my-release-panel {
    padding: 14px;
  }

  .market-layout,
  .overview-panel .filters,
  .overview-panel .grid {
    grid-template-columns: 1fr;
  }

  .market-sidebar {
    position: static;
  }

  .market-dept-cascader-columns {
    flex-direction: column;
    max-height: min(60vh, 360px);
  }

  .market-dept-cascader-col {
    min-width: 100%;
    max-width: none;
    border-right: 0;
    border-bottom: 1px solid #eef2f7;
    max-height: 200px;
  }

  .market-dept-cascader-col:last-of-type {
    border-bottom: 0;
  }
}
</style>
