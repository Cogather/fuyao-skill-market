<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MarketDeptCascader from '../../components/skill/MarketDeptCascader.vue';
import SkillCard from '../../components/skill/SkillCard.vue';
import SkillDetailDialog from '../../components/skill/SkillDetailDialog.vue';
import SkillVersionManageDialog from '../../components/skill/SkillVersionManageDialog.vue';
import UploadSkillModal from '../../components/skill/UploadSkillModal.vue';
import ReviewCenterPage from '../skill/ReviewCenterPage.vue';
import SkillPlanningPage from '../skill/SkillPlanningPage.vue';
import companyOpsDashboardJson from '/src/mock/opsDashboardCompanyDefault.json?raw';
import type {
  BusinessDimensionDto,
  CurrentUserRoleDto,
  OrganizationDto,
  SkillDetailDto,
  SkillFileTreeField,
  SkillListRecordDto,
  SkillVersionListItemDto,
  SyncApplicationListItemDto,
} from '../../services/skillMarket/apiTypes';
import type { MarketDeptForestNode } from '../../services/skillMarket/marketDeptTreeFromApi';
import {
  coerceDepartmentTreeFromUnknown,
  mapDepartmentTreeDtoToForest,
} from '../../services/skillMarket/marketDeptTreeFromApi';
import {
  marketRoleIsOrgAdmin,
  marketRoleIsSuperAdmin,
  marketRoleCanCreateOrganization,
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
import { skillBaseService } from '../../services/skillMarket/skillBaseService';

import { useSkillMarketStore } from '../../stores/skillMarketStore';
import { useProfileStore } from '../../stores/userStore';
const skillMarketStore = useSkillMarketStore();
const userStore = useProfileStore();

const currentUserRole = ref<CurrentUserRoleDto | null>(null);

/**
 * 与接口约定一致的操作者工号：父应用注入 > 角色接口 employeeNo > Profile w3Id。
 * skillBaseService 走 axios，不会自动带 userId，此处必须能尽早给出非空值（否则 query 里全是空字符串）。
 */
const userId = computed(() => {
  const fromStore = String(skillMarketStore.userId ?? '').trim();
  if (fromStore) {
    return fromStore;
  }
  const fromRole = String(currentUserRole.value?.employeeNo ?? '').trim();
  if (fromRole) {
    return fromRole;
  }
  return String(userStore.userInfo?.w3Id ?? '').trim();
});
const departmentList = computed(() => skillMarketStore.departmentList);

const skills = ref<any[]>([]);
const newSkills = ref<any[]>([]);
const myPublishedSkills = ref<any[]>([]);
const myReleaseTableWrapRef = ref<HTMLElement | null>(null);
const totalDownloads = ref<any>(0);
const totalSkills = ref(0);
const orgCount = ref(0);

const transportIsHttp = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http';
const route = useRoute();
const router = useRouter();

const hotMarketStatsByKey = ref<any>({
  skillCount: { key: 'skillCount', label: 'SKILL', value: '7.4万' },
  creatorCount: { key: 'creatorCount', label: '创作人数', value: '1.2万' },
  callCount: { key: 'callCount', label: '调用数', value: '230万' },
  downloadCount: { key: 'downloadCount', label: '下载数', value: '86万' },
});

const innerTabAliases: Record<string, UserInnerTab> = {
  hot: 'hot',
  热榜: 'hot',
  overview: 'overview',
  market: 'overview',
  all: 'overview',
  全部技能: 'overview',
  市场总览: 'overview',
  core: 'core',
  coreharness: 'core',
  releases: 'releases',
  publish: 'releases',
  我的发布: 'releases',
  ops: 'ops',
  operation: 'ops',
  dashboard: 'ops',
  运营管理: 'ops',
  org: 'org',
  组织管理: 'org',
  organization: 'org',
  approval: 'approval',
  审核中心: 'approval',
  review: 'review',
  评审中心: 'review',
  planning: 'planning',
  skillPlanning: 'planning',
  Skill规划: 'planning',
  'Skill 规划': 'planning',
  skill规划: 'planning',
};

function routeTabFromQuery(value: unknown): UserInnerTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return 'hot';
  }
  return innerTabAliases[raw] ?? innerTabAliases[raw.toLowerCase()] ?? 'hot';
}

const helpLink = () => {
  showToast('帮助说明暂未配置');
};

const innerTab = ref<UserInnerTab>(routeTabFromQuery(route.query.tab));
const uploadOpen = ref(false);
const search = ref('');
const hotSearch = ref('');
const hotSkills = ref<any[]>([]);
const hotSkillsLoading = ref(false);
/** Mock：组织展示名；HTTP：组织 id 字符串（对接 `orgId`） */
const levelFilter = ref('all');
/** 市场部门级联：路径各段对应 `departmentL1`～`departmentL6`（与设计文档 §3.3.3 一致，多字段 AND） */
const overviewMarketDeptSegments = ref<string[]>([]);
let overviewDimensionPanelCleanup: (() => void) | null = null;
let overviewDimensionResizeFrame = 0;
const categoryFilter = ref('all');
const categorySubFilter = ref('all');
const hoveredBusinessDimensionKey = ref('');
const businessDimensionPanelStyle = ref<CSSProperties>({});
let businessDimensionPanelCloseTimer: ReturnType<typeof window.setTimeout> | null = null;
const businessDimensions = ref<BusinessDimensionDto[]>([]);
const businessDimensionLoading = ref(false);
const selectedTags = ref<string[]>([]);
const quickFilter = ref<string>('all');
const overviewSort = ref<'time' | 'downloads' | 'rating'>('downloads');
const overviewAdvancedOpen = ref(false);
const overviewDimensionMoreOpen = ref(false);
const overviewDimensionOverflow = ref(false);
const overviewDimensionRowRef = ref<HTMLElement | null>(null);
const overviewDimensionInlineRef = ref<HTMLElement | null>(null);
const overviewDimensionDropdownRef = ref<HTMLElement | null>(null);
const overviewDimensionDropdownStyle = ref<CSSProperties>({});
const topbarGlass = ref(false);
let topbarScrollRaf = 0;
const tabPanelRef = ref<HTMLElement | null>(null);
const tabPanelMinHeight = ref(0);
const marketContentRef = ref<HTMLElement | null>(null);
const overviewGridRef = ref<HTMLElement | null>(null);
/** HTTP：当前页的接口列表（再经与 Mock 一致的排序） */

const pageNumValue = ref<number>(1);
const pageSizeValue = ref<number>(16);

const page = reactive<any>({
  total: 0,
  pageIndex: pageNumValue.value,
  pageSize: pageSizeValue.value,
  pageSizeOptions: [10, 20, 50, 100],
});

const overviewFilterObj = ref<any>({
  keyword: '',
  pageSize: page.pageSize,
  pageNum: page.pageIndex,
  status: '',
  tagList: '',
  category: '',
  sortBy: 'downloads',
  sortOrder: 'desc',
});
const overviewRemoteItems = ref<any[]>([]);
const overviewRemoteTotal = ref(0);
const overviewRemoteExhausted = ref(false);
const overviewRemoteLoading = ref(false);
let overviewScrollRaf = 0;
const toast = ref('');
const showAdminModules = computed(() => marketRoleShowsOrgManagement(currentUserRole.value));
const canCreateOrg = computed(() => marketRoleCanCreateOrganization(currentUserRole.value));

const adminOrganizations = ref<OrganizationDto[]>([]);
const orgListLoading = ref(false);
const orgModalOpen = ref(false);
const orgModalMode = ref<'create' | 'edit'>('create');
const orgForm = ref({
  id: 0 as number,
  orgName: '',
  orgCode: '',
  admins: '',
  enabled: 1,
});

const approvalSubTab = ref<'pending' | 'done'>('pending');
const syncPendingRows = ref<any[]>([]);
const syncDoneRows = ref<any[]>([]);
const syncListLoading = ref(false);

const reviewModalOpen = ref(false);
const reviewTarget = ref<any>(null);
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

const versionPanelSkill = ref<any>(null);
const versionPanelLoading = ref(false);
const versionUnpublishing = ref<string | null>(null);
/** 版本列表「查看」：该版本文件树 + SKILL.md 预览（叠在版本管理之上） */
const versionPreviewSkill = ref<any>(null);
/** 市场进入的版本管理不展示「操作」列；与详情是否展示删除同源（我的发布为 true） */
const versionManageShowOperations = ref(true);
const deletingMySkillId = ref<string | null>(null);
const deleteConfirmRow = ref<SkillListRecordDto | null>(null);
const deleteConfirmStyle = ref<CSSProperties>({});
let deleteConfirmListenersBound = false;
const detailPanelSkill = ref<any>(null);
/** 市场卡片进入的详情不展示删除；我的发布等入口为 true */
const detailShowDelete = ref(true);
const detailDeleteConfirmOpen = ref(false);
const detailDeleteConfirmStyle = ref<CSSProperties>({});
const detailDeletePendingId = ref<string | null>(null);
const detailDeletePendingTitle = ref('');
let detailDeleteConfirmListenersBound = false;

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

type MarketDeptNode = MarketDeptForestNode;

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
  return (skill.tagFunctional ?? skill.categoryGroupName ?? skill.category ?? '').trim();
}

function matchesCategoryFilter(skill: Skill): boolean {
  if (categoryFilter.value === 'all') {
    return true;
  }
  const values = [skill.tagFunctional, skill.categoryGroupName, skill.category]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  const target = categorySubFilter.value === 'all' ? categoryFilter.value : categorySubFilter.value;
  return values.includes(target) || values.includes(categoryFilter.value);
}

function skillTags(skill: any): string[] {
  return (skill.tags?.split(',')?.map((iter: any) => iter.trim()) ?? [])
    ?.map((tag: any) => tag.trim())
    .filter(Boolean);
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
  return matchesPrimaryFiltersSansDept(skill, q, scope) && matchesOverviewDeptCascade(skill);
}

function sortOverviewSkills(list: Skill[]): Skill[] {
  const sorted = [...list];
  if (overviewSort.value === 'downloads') {
    return sorted.sort(
      (a, b) => (b.download_count ?? b.downloads ?? 0) - (a.download_count ?? a.downloads ?? 0),
    );
  }
  if (overviewSort.value === 'rating') {
    return sorted.sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.download_count ?? b.downloads ?? 0) - (a.download_count ?? a.downloads ?? 0),
    );
  }
  return sorted.sort((a, b) =>
    String(b.latestPublishTime ?? b.skill_id ?? b.id ?? '').localeCompare(
      String(a.latestPublishTime ?? a.skill_id ?? a.id ?? ''),
    ),
  );
}

const OVERVIEW_PREFETCH_MIN_DISTANCE = 480;
const OVERVIEW_PREFETCH_VIEWPORT_RATIO = 0.6;
const OVERVIEW_POST_RENDER_CHECK_DELAY = 80;
let overviewPostRenderCheckTimer: ReturnType<typeof window.setTimeout> | null = null;
let overviewSuppressNextScrollLoad = false;

type OverviewFetchOptions = {
  resetScroll?: boolean;
  suppressPostRenderCheck?: boolean;
};

function resetOverviewScrollState(): void {
  if (overviewScrollRaf) {
    window.cancelAnimationFrame(overviewScrollRaf);
    overviewScrollRaf = 0;
  }
  if (overviewPostRenderCheckTimer) {
    window.clearTimeout(overviewPostRenderCheckTimer);
    overviewPostRenderCheckTimer = null;
  }
}

function resetOverviewListScrollPosition(): void {
  const el = marketContentRef.value;
  if (el) {
    el.scrollTop = 0;
  }
}

function overviewHasMoreRemoteItems(): boolean {
  return !overviewRemoteExhausted.value && newSkills.value.length < page.total;
}

function overviewRemainingScrollDistance(): number {
  const el = marketContentRef.value;
  if (!el) {
    return Number.POSITIVE_INFINITY;
  }
  return el.scrollHeight - el.clientHeight - el.scrollTop;
}

function overviewNearBottom(): boolean {
  const el = marketContentRef.value;
  if (!el) {
    return false;
  }
  const prefetchDistance = Math.max(
    OVERVIEW_PREFETCH_MIN_DISTANCE,
    Math.floor(el.clientHeight * OVERVIEW_PREFETCH_VIEWPORT_RATIO),
  );
  return overviewRemainingScrollDistance() <= prefetchDistance;
}

async function loadNextOverviewRemotePageIfNeeded(): Promise<void> {
  if (overviewSuppressNextScrollLoad) {
    return;
  }
  if (
    innerTab.value !== 'overview' ||
    overviewRemoteLoading.value ||
    !overviewHasMoreRemoteItems() ||
    !overviewNearBottom()
  ) {
    return;
  }
  const nextPage = page.pageIndex + 1;
  page.pageIndex = nextPage;
  overviewFilterObj.value.pageNum = nextPage;
  await startOverviewRemoteFetch(true);
}

function scheduleOverviewLoadMoreCheck(): void {
  if (overviewScrollRaf) {
    return;
  }
  overviewScrollRaf = window.requestAnimationFrame(() => {
    overviewScrollRaf = 0;
    void loadNextOverviewRemotePageIfNeeded();
  });
}

const handleScroll = () => {
  scheduleOverviewLoadMoreCheck();
};

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
    .filter((o) => o.enabled === 1)
    .sort((a, b) => a.orgName.localeCompare(b.orgName, 'zh-Hans-CN')),
);

const marketOverviewDeptTree = computed((): MarketDeptNode[] => {
  const coerced = coerceDepartmentTreeFromUnknown(departmentList.value);
  return mapDepartmentTreeDtoToForest(coerced);
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

const overviewDeptCascaderLabel = computed(() => {
  const s = overviewMarketDeptSegments.value;
  if (s.length === 0) {
    return '全部部门';
  }
  return s.join(' / ');
});

function resetOverviewDeptFilterFields(): void {
  for (let level = 3; level <= 8; level += 1) {
    overviewFilterObj.value[`departmentL${level}`] = '';
  }
}

const clearOverviewDeptCascader = async () => {
  resetOverviewDeptFilterFields();
  overviewFilterObj.value.pageNum = 1;
  page.pageIndex = 1;
  overviewMarketDeptSegments.value = [];
  await reloadOverviewFirstPageFromUserInput();
};

const deptFilterOnChange = async () => {
  resetOverviewDeptFilterFields();
  overviewMarketDeptSegments.value.slice(0, 6).forEach((segment, index) => {
    overviewFilterObj.value[`departmentL${index + 3}`] = segment;
  });
  overviewFilterObj.value.pageNum = 1;
  page.pageIndex = 1;
  await reloadOverviewFirstPageFromUserInput();
};

watch(overviewDimensionMoreOpen, (open) => {
  if (overviewDimensionPanelCleanup) {
    overviewDimensionPanelCleanup();
    overviewDimensionPanelCleanup = null;
  }
  if (open) {
    void nextTick(() => {
      updateOverviewDimensionDropdownLayout();
    });
    const onScroll = (): void => {
      updateOverviewDimensionDropdownLayout();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    overviewDimensionPanelCleanup = (): void => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  } else {
    overviewDimensionDropdownStyle.value = {};
  }
});

const businessDimensionOptions = computed(() => [...businessDimensions.value]);

const categoryOptions = computed(() =>
  businessDimensionOptions.value.flatMap((item) => [
    item.categoryName,
    ...businessDimensionChildren(item).map((child) => child.categoryName),
  ]),
);

function businessDimensionKey(dimension: BusinessDimensionDto): string {
  return String(dimension.categoryId || dimension.categoryName);
}

function businessDimensionChildren(dimension: BusinessDimensionDto): BusinessDimensionDto[] {
  return [...(dimension.children ?? [])];
}

function businessDimensionHasChildren(dimension: BusinessDimensionDto): boolean {
  return businessDimensionChildren(dimension).length > 0;
}

function businessDimensionSelectedLabel(dimension: BusinessDimensionDto): string {
  if (categoryFilter.value !== dimension.categoryName || categorySubFilter.value === 'all') {
    return dimension.categoryName;
  }
  return `${dimension.categoryName} / ${categorySubFilter.value}`;
}

function updateBusinessDimensionPanelStyle(target: EventTarget | null): void {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) {
    businessDimensionPanelStyle.value = {};
    return;
  }
  const rect = el.getBoundingClientRect();
  const margin = 16;
  const width = Math.min(760, Math.max(520, window.innerWidth - margin * 2));
  const left = Math.min(
    Math.max(margin, rect.left),
    Math.max(margin, window.innerWidth - width - margin),
  );
  businessDimensionPanelStyle.value = {
    left: `${Math.floor(left)}px`,
    top: `${Math.floor(rect.bottom + 8)}px`,
    width: `${Math.floor(width)}px`,
  };
}

function showBusinessDimensionPanel(dimension: BusinessDimensionDto, ev?: MouseEvent): void {
  if (businessDimensionPanelCloseTimer) {
    window.clearTimeout(businessDimensionPanelCloseTimer);
    businessDimensionPanelCloseTimer = null;
  }
  updateBusinessDimensionPanelStyle(ev?.currentTarget ?? null);
  hoveredBusinessDimensionKey.value = businessDimensionKey(dimension);
}

function closeBusinessDimensionPanel(): void {
  if (businessDimensionPanelCloseTimer) {
    window.clearTimeout(businessDimensionPanelCloseTimer);
  }
  businessDimensionPanelCloseTimer = window.setTimeout(() => {
    hoveredBusinessDimensionKey.value = '';
    businessDimensionPanelStyle.value = {};
    businessDimensionPanelCloseTimer = null;
  }, 160);
}

function keepBusinessDimensionPanelOpen(): void {
  if (businessDimensionPanelCloseTimer) {
    window.clearTimeout(businessDimensionPanelCloseTimer);
    businessDimensionPanelCloseTimer = null;
  }
}

function closeBusinessDimensionPanelNow(): void {
  if (businessDimensionPanelCloseTimer) {
    window.clearTimeout(businessDimensionPanelCloseTimer);
    businessDimensionPanelCloseTimer = null;
  }
  hoveredBusinessDimensionKey.value = '';
  businessDimensionPanelStyle.value = {};
}

function businessDimensionPanelOpen(dimension: BusinessDimensionDto): boolean {
  return hoveredBusinessDimensionKey.value === businessDimensionKey(dimension);
}

async function onBusinessDimensionPrimaryClick(
  dimension: BusinessDimensionDto,
  ev?: MouseEvent,
): Promise<void> {
  if (categoryFilter.value === dimension.categoryName && categorySubFilter.value !== 'all') {
    showBusinessDimensionPanel(dimension, ev);
    return;
  }
  await setCategoryFilter(dimension.categoryName, 'all', String(dimension.categoryId));
}

function scheduleOverviewDimensionOverflowCheck(): void {
  if (overviewDimensionResizeFrame) {
    window.cancelAnimationFrame(overviewDimensionResizeFrame);
  }
  overviewDimensionResizeFrame = window.requestAnimationFrame(() => {
    overviewDimensionResizeFrame = 0;
    const inline = overviewDimensionInlineRef.value;
    if (!inline) {
      overviewDimensionOverflow.value = false;
      overviewDimensionMoreOpen.value = false;
      return;
    }
    const hasOverflow = inline.scrollWidth > inline.clientWidth + 2;
    overviewDimensionOverflow.value = hasOverflow;
    if (!hasOverflow) {
      overviewDimensionMoreOpen.value = false;
    }
    if (overviewDimensionMoreOpen.value) {
      updateOverviewDimensionDropdownLayout();
    }
  });
}

function updateOverviewDimensionDropdownLayout(): void {
  const row = overviewDimensionRowRef.value;
  if (!row) {
    overviewDimensionDropdownStyle.value = {};
    return;
  }
  const rect = row.getBoundingClientRect();
  const margin = 16;
  const left = Math.max(margin, Math.floor(rect.left));
  const width = Math.max(320, Math.floor(window.innerWidth - left - margin));
  const top = rect.bottom + 8;
  overviewDimensionDropdownStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: `${Math.floor(Math.max(margin, top))}px`,
    width: `${width}px`,
    zIndex: 3600,
  };
}

function toggleOverviewDimensionMore(): void {
  overviewDimensionMoreOpen.value = !overviewDimensionMoreOpen.value;
  if (overviewDimensionMoreOpen.value) {
    void nextTick(() => {
      updateOverviewDimensionDropdownLayout();
    });
  }
}

function closeOverviewDimensionMore(): void {
  overviewDimensionMoreOpen.value = false;
}

function onOverviewDimensionDocDown(ev: MouseEvent): void {
  if (!overviewDimensionMoreOpen.value) {
    return;
  }
  const t = ev.target as Node;
  if (
    overviewDimensionRowRef.value?.contains(t) ||
    overviewDimensionDropdownRef.value?.contains(t)
  ) {
    return;
  }
  closeOverviewDimensionMore();
}

function onOverviewDimensionKeydown(ev: KeyboardEvent): void {
  if (overviewDimensionMoreOpen.value && ev.key === 'Escape') {
    closeOverviewDimensionMore();
  }
}

watch([businessDimensionOptions, innerTab], () => {
  void nextTick(() => {
    scheduleOverviewDimensionOverflowCheck();
    scheduleTopbarGlassUpdate();
  });
});

const tagOptions = computed(() => {
  let opts = new Set<string>();
  for (const s of newSkills.value) {
    for (const tag of skillTags(s)) {
      opts.add(tag);
    }
  }
  return [...opts].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});

function toggleOverviewAdvancedPanel(): void {
  overviewAdvancedOpen.value = !overviewAdvancedOpen.value;
}

function updateTopbarGlass(): void {
  const doc = document.documentElement;
  const body = document.body;
  const scrollHeight = Math.max(doc.scrollHeight, body?.scrollHeight ?? 0);
  const viewportHeight = window.innerHeight || doc.clientHeight;
  const hasPageScrollbar = scrollHeight > viewportHeight + 1;
  topbarGlass.value = hasPageScrollbar && window.scrollY > 0;
}

function scheduleTopbarGlassUpdate(): void {
  if (topbarScrollRaf) {
    return;
  }
  topbarScrollRaf = window.requestAnimationFrame(() => {
    topbarScrollRaf = 0;
    updateTopbarGlass();
  });
}

const tabPanelFillStyle = computed(() => {
  const h = tabPanelMinHeight.value > 0 ? `${tabPanelMinHeight.value}px` : undefined;
  const capOverview = innerTab.value === 'overview';
  return {
    minHeight: h,
    height: capOverview ? h : undefined,
    maxHeight: capOverview ? h : undefined,
    overflow: capOverview ? 'hidden' : undefined,
  };
});

// 等待 userId 和 departmentList 加载完成
function waitUserIdAndDepartmentList(timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (userId.value && departmentList.value.length > 0) {
      resolve();
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      if (userId.value && departmentList.value.length > 0) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

function readServiceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function serviceSucceeded(value: unknown): boolean {
  const record = readServiceRecord(value);
  const meta = readServiceRecord(record.meta);
  if (typeof meta.success === 'boolean') {
    return meta.success;
  }
  const code = record.code;
  return code === undefined || code === 0 || code === 200 || code === '0' || code === '200';
}

function serviceMessage(value: unknown, fallback: string): string {
  const record = readServiceRecord(value);
  const meta = readServiceRecord(record.meta);
  const message = meta.message ?? record.message ?? record.msg;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function formatHotStatNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '';
  }
  if (value >= 10000) {
    const wan = value / 10000;
    const text = Number.isInteger(wan) ? String(wan) : wan.toFixed(1).replace(/\.0$/, '');
    return `${text}万`;
  }
  return Math.round(value).toLocaleString('zh-CN');
}

async function loadBusinessDimensions(params: any = { format: 'tree' }): Promise<void> {
  businessDimensionLoading.value = true;
  try {
    const res = await skillBaseService.queryBusinessDimensions(params);
    if (res?.meta?.success && res?.data) {
      businessDimensions.value = res.data;
      return;
    }
    showToast(serviceMessage(res.meta?.message, '业务维度加载失败'));
  } catch (e) {
    if (transportIsHttp) {
      showToast(e instanceof Error ? e.message : '业务维度加载失败');
    }
  } finally {
    businessDimensionLoading.value = false;
  }
}

async function loadCurrentUserRole(): Promise<void> {
  // 始终调用 queryCurrentUserRole：HTTP 走 axios 真实后端；Mock 走 skillBaseServiceMock（与 VITE_SKILL_MARKET_TRANSPORT / VITE_SKILL_BASE_SERVICE_MOCK 一致）
  try {
    const r = await skillBaseService.queryCurrentUserRole({ userId: userId.value });
    if (r.meta.success && r.data) {
      currentUserRole.value = r.data;
      const sid = String(skillMarketStore.userId ?? '').trim();
      if (!sid) {
        const emp = String(r.data.employeeNo ?? '').trim();
        // 父级未透传时，用工号/角色接口返回的 employeeNo 回填（HTTP 与 Mock 均为接口数据）
        if (emp) {
          skillMarketStore.updateUserId(emp);
        }
      }
    }
  } catch (e) {
    if (transportIsHttp) {
      showToast(e instanceof Error ? e.message : '当前用户角色加载失败');
    }
  }
}

/** 工号：与 `userId` 计算属性同源（保留函数便于与旧调用对齐） */
function effectiveSkillUserId(): string {
  return userId.value?.trim() || '';
}

const debounce = (fn: any, delay: number): any => {
  let timer: any;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn();
    }, delay);
  };
};

const debounceScroll = handleScroll;

onMounted(async () => {
  if (transportIsHttp) {
    await waitUserIdAndDepartmentList();
  }
  console.log('userId', userId.value);
  console.log('departmentList', departmentList.value);
  await loadBusinessDimensions();
  // HTTP 与 Mock 均保留一次角色拉取；抢先调用仅见 loadMyPublishedSkills / executeDelete 内对 Mock 的分支
  await loadCurrentUserRole();
  // 预拉自进化待审批草稿，保证「自进化审批」入口的角标数量准确
  await loadAiEvolutionSkills();
  if (transportIsHttp) {
    await loadAdminOrganizations();
    // await startOverviewRemoteFetch();
    // await loadOpsDashboardOverview();
  }
  document.addEventListener('mousedown', onOverviewDimensionDocDown);
  document.addEventListener('keydown', onOverviewDimensionKeydown);
  window.addEventListener('resize', scheduleOverviewDimensionOverflowCheck);
  window.addEventListener('scroll', scheduleTopbarGlassUpdate, { passive: true });
  window.addEventListener('resize', scheduleTopbarGlassUpdate);
  void nextTick(() => {
    scheduleOverviewDimensionOverflowCheck();
    scheduleTopbarGlassUpdate();
  });
});

onBeforeUnmount(() => {
  closeDeleteConfirm();
  closeDetailDeleteConfirm();
  overviewDimensionPanelCleanup?.();
  overviewDimensionPanelCleanup = null;
  if (businessDimensionPanelCloseTimer) {
    window.clearTimeout(businessDimensionPanelCloseTimer);
    businessDimensionPanelCloseTimer = null;
  }
  document.removeEventListener('mousedown', onOverviewDimensionDocDown);
  document.removeEventListener('keydown', onOverviewDimensionKeydown);
  window.removeEventListener('resize', scheduleOverviewDimensionOverflowCheck);
  window.removeEventListener('scroll', scheduleTopbarGlassUpdate);
  window.removeEventListener('resize', scheduleTopbarGlassUpdate);
  if (overviewScrollRaf) {
    window.cancelAnimationFrame(overviewScrollRaf);
    overviewScrollRaf = 0;
  }
  if (topbarScrollRaf) {
    window.cancelAnimationFrame(topbarScrollRaf);
    topbarScrollRaf = 0;
  }
  if (overviewPostRenderCheckTimer) {
    window.clearTimeout(overviewPostRenderCheckTimer);
    overviewPostRenderCheckTimer = null;
  }
  if (overviewDimensionResizeFrame) {
    window.cancelAnimationFrame(overviewDimensionResizeFrame);
  }
  stopOpsDimensionResize();
});

/** 本地（Mock）全量筛选结果，用于渐进展示 */
const overviewFilteredAll = computed(() => {
  const q = search.value.trim().toLowerCase();
  const scope = toListScope(quickFilter.value);
  let list = [...skills.value].filter((s) => matchesPrimaryFilters(s, q, scope));
  list = list.filter((s) => matchesSelectedTags(s));
  return sortOverviewSkills(list);
});

async function startOverviewRemoteFetch(
  isPageOver?: boolean,
  options: OverviewFetchOptions = {},
): Promise<void> {
  if (overviewRemoteLoading.value) {
    return;
  }
  if (!isPageOver) {
    resetOverviewScrollState();
    if (options.resetScroll) {
      overviewSuppressNextScrollLoad = true;
      resetOverviewListScrollPosition();
    }
    page.pageIndex = 1;
    overviewFilterObj.value.pageNum = 1;
    overviewRemoteExhausted.value = false;
  }
  overviewRemoteLoading.value = true;
  try {
    const env = await skillBaseService.querySkillList(overviewFilterObj.value);
    if (env.meta.success && env.data) {
      const pageItems = Array.isArray(env.data) ? env.data : [];
      const nextItems = isPageOver
        ? [...newSkills.value, ...pageItems].filter(
            (item, index, arr) =>
              arr.findIndex((candidate) => skillKey(candidate) === skillKey(item)) === index,
          )
        : [...pageItems];
      newSkills.value = nextItems;
      overviewRemoteItems.value = nextItems;
      overviewRemoteTotal.value = env.meta.number;
      page.total = env.meta.number;
      overviewRemoteExhausted.value =
        pageItems.length === 0 || newSkills.value.length >= overviewRemoteTotal.value;
      totalDownloads.value = newSkills.value.reduce(
        (acc, curr) => acc + parseInt(curr.downloads ?? 0),
        0,
      );
    }
  } finally {
    overviewRemoteLoading.value = false;
    await nextTick();
    if (!isPageOver && options.resetScroll) {
      resetOverviewListScrollPosition();
    }
    if (options.suppressPostRenderCheck) {
      window.setTimeout(() => {
        overviewSuppressNextScrollLoad = false;
      }, OVERVIEW_POST_RENDER_CHECK_DELAY);
      return;
    }
    if (overviewPostRenderCheckTimer) {
      window.clearTimeout(overviewPostRenderCheckTimer);
    }
    overviewPostRenderCheckTimer = window.setTimeout(() => {
      overviewPostRenderCheckTimer = null;
      overviewSuppressNextScrollLoad = false;
      scheduleOverviewLoadMoreCheck();
    }, OVERVIEW_POST_RENDER_CHECK_DELAY);
  }
}

async function reloadOverviewFirstPageFromUserInput(): Promise<void> {
  await startOverviewRemoteFetch(false, {
    resetScroll: true,
    suppressPostRenderCheck: true,
  });
}

const changeOverviewTab = async (tabName: string) => {
  quickFilter.value = tabName;
  if (tabName !== 'devDept') {
    levelFilter.value = 'all';
    overviewFilterObj.value.orgId = undefined;
  }
  if (tabName === 'all') {
    overviewFilterObj.value.status = '';
  } else if (tabName === 'personal') {
    overviewFilterObj.value.status = '个人级';
  } else if (tabName === 'devDept') {
    overviewFilterObj.value.status = '组织级';
  }
  overviewFilterObj.value.pageNum = 1;
  page.pageIndex = 1;
  await reloadOverviewFirstPageFromUserInput();
};

const onSearchKeyWord = async (event: Event) => {
  const query = (event.target as HTMLInputElement).value;
  overviewFilterObj.value.keyword = query;
  await reloadOverviewFirstPageFromUserInput();
};

async function onOverviewOrgFilterChange(): Promise<void> {
  overviewMarketDeptSegments.value = [];
  overviewFilterObj.value.pageNum = 1;
  page.pageIndex = 1;
  if (transportIsHttp) {
    const id = Number(levelFilter.value);
    overviewFilterObj.value.orgId =
      levelFilter.value === 'all' || !Number.isFinite(id) ? undefined : id;
    await reloadOverviewFirstPageFromUserInput();
  }
}

async function onOverviewLevelFilterChange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value;
  await changeOverviewTab(value);
}

const overviewHasMore = computed(() => {
  if (overviewRemoteLoading.value) {
    return false;
  }
  if (overviewRemoteExhausted.value) {
    return false;
  }
  return overviewRemoteItems.value.length < overviewRemoteTotal.value;
});

const overviewListFooterHint = computed(() => {
  const shown = newSkills.value.length;
  const total = overviewRemoteTotal.value;
  if (overviewRemoteLoading.value) {
    return `加载中…（已展示 ${shown} 条，合计 ${total} 条）`;
  }
  if (!overviewHasMore.value) {
    return `已加载全部 ${shown} 条（合计 ${total} 条）`;
  }
  return `已展示 ${shown} 条 · 合计 ${total} 条 · 继续下拉加载更多`;
});

function overviewQuickFilterLabel(value: string): string {
  if (value === 'personal') return '个人级';
  if (value === 'devDept') return '组织级';
  return '全部';
}

function overviewSortLabel(value: typeof overviewSort.value): string {
  if (value === 'downloads') return '最多使用';
  if (value === 'rating') return '最高评分';
  return '最新上架';
}

const selectedOrganizationFilterLabel = computed(() => {
  if (levelFilter.value === 'all') {
    return '';
  }
  if (transportIsHttp) {
    const id = Number(levelFilter.value);
    const org = marketOrgSelectOptions.value.find((item) => item.id === id);
    return org?.orgName ?? '';
  }
  return levelFilter.value;
});

const overviewFilterSummary = computed(() => {
  const parts: string[] = [];
  const scope = overviewQuickFilterLabel(quickFilter.value);
  if (scope !== '全部') {
    parts.push(scope);
  }
  if (selectedOrganizationFilterLabel.value) {
    parts.push(selectedOrganizationFilterLabel.value);
  }
  if (overviewMarketDeptSegments.value.length > 0) {
    parts.push(
      overviewMarketDeptSegments.value[overviewMarketDeptSegments.value.length - 1] ??
        overviewDeptCascaderLabel.value,
    );
  }
  if (categoryFilter.value !== 'all') {
    parts.push(
      categorySubFilter.value === 'all'
        ? categoryFilter.value
        : `${categoryFilter.value} / ${categorySubFilter.value}`,
    );
  }
  if (selectedTags.value.length > 0) {
    parts.push(selectedTags.value.map((tag) => `#${tag}`).join(' + '));
  }
  parts.push(overviewSortLabel(overviewSort.value));
  const total = transportIsHttp
    ? overviewRemoteTotal.value || newSkills.value.length
    : overviewFilteredAll.value.length;
  return `当前筛选：${parts.length > 0 ? parts.join(' / ') : '全部'} (${total})`;
});

const changeSort = async (type: 'time' | 'downloads' | 'rating') => {
  if (overviewSort.value === type) {
    return;
  }
  overviewSort.value = type;
  overviewFilterObj.value.pageNum = 1;
  page.pageIndex = 1;
  overviewFilterObj.value.sortBy = type;
  overviewFilterObj.value.sortOrder = 'desc';
  await reloadOverviewFirstPageFromUserInput();
};

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

watch(categoryOptions, (options) => {
  if (categoryFilter.value !== 'all' && !options.includes(categoryFilter.value)) {
    categoryFilter.value = 'all';
    categorySubFilter.value = 'all';
    return;
  }
  if (categorySubFilter.value !== 'all' && !options.includes(categorySubFilter.value)) {
    categorySubFilter.value = 'all';
  }
});

async function setCategoryFilter(
  value: string,
  subValue = 'all',
  categoryParam?: string,
): Promise<void> {
  categoryFilter.value = value;
  categorySubFilter.value = value === 'all' ? 'all' : subValue;
  if (transportIsHttp && innerTab.value === 'overview') {
    overviewFilterObj.value.pageNum = 1;
    page.pageIndex = 1;
    if (value === 'all') {
      delete overviewFilterObj.value.category;
    } else {
      overviewFilterObj.value.category = categoryParam ?? '';
    }
    await reloadOverviewFirstPageFromUserInput();
  }
}

async function setCategoryFilterFromDropdown(value: string): Promise<void> {
  await setCategoryFilter(value, 'all');
  closeOverviewDimensionMore();
}

async function selectBusinessDimensionChild(
  dimension: BusinessDimensionDto,
  child: BusinessDimensionDto | 'all',
): Promise<void> {
  if (child === 'all') {
    await setCategoryFilter(dimension.categoryName, 'all', String(dimension.categoryId));
  } else {
    await setCategoryFilter(dimension.categoryName, child.categoryName, String(child.categoryId));
  }
  closeBusinessDimensionPanelNow();
  closeOverviewDimensionMore();
}

async function toggleTagFilter(tag: string): void {
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter((item) => item !== tag)
    : [...selectedTags.value, tag];
  overviewFilterObj.value.tagList = [...selectedTags.value].join(',');
  overviewFilterObj.value.pageNum = 1;
  page.pageIndex = 1;
  await reloadOverviewFirstPageFromUserInput();
}

async function clearTagFilters(): Promise<void> {
  selectedTags.value = [];
  overviewFilterObj.value.tagList = '';
  overviewFilterObj.value.pageNum = 1;
  page.pageIndex = 1;
  await reloadOverviewFirstPageFromUserInput();
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
  if (marketRoleIsSuperAdmin(role)) {
    return true;
  }
  if (marketRoleIsOrgAdmin(role)) {
    return role.managedOrgIds.includes(org.id);
  }
  return false;
}

async function loadAdminOrganizations(): Promise<void> {
  if (transportIsHttp) {
    await waitUserIdAndDepartmentList();
  }
  orgListLoading.value = true;
  try {
    const r = await skillBaseService.queryOrganizationList({ userId: userId.value });
    // const r = await marketClient.fetchOrganizations();
    if (r.meta.success && Array.isArray(r.data)) {
      adminOrganizations.value = r.data;
      // orgCount.value = r.data.length;
    }
  } finally {
    orgListLoading.value = false;
  }
}

async function loadSyncApplicationRows(): Promise<void> {
  syncListLoading.value = true;
  try {
    const [p, d] = await Promise.all([
      skillBaseService.querySyncApplicationList({ tab: 'pending', pageNo: 1, pageSize: 100 }),
      skillBaseService.querySyncApplicationList({ tab: 'done', pageNo: 1, pageSize: 100 }),
    ]);
    if (p.meta.success && p.data) {
      syncPendingRows.value = p.data.map((row: unknown) => normalizeSyncRecord(row));
    }
    if (d.meta.success && d.data) {
      syncDoneRows.value = d.data.map((row: unknown) => normalizeSyncRecord(row));
    }
  } finally {
    syncListLoading.value = false;
  }
}

const loadHotSkillNums = async () => {
  await skillBaseService.getHotSkillNums().then((res: any) => {
    if (res.meta.success && res.data) {
      Object.keys(res.data).map((key) => {
        hotMarketStatsByKey.value[key].value = res.data[key].toString();
      });
    }
  });
};

async function loadHotSkillCards(): Promise<void> {
  hotSkillsLoading.value = true;
  try {
    const res = await skillBaseService.querySkillList({
      pageNum: 1,
      pageSize: 6,
      sortBy: 'downloads',
      sortOrder: 'desc',
      keyword: hotSearch.value,
    });
    if (res?.meta?.success && res?.data) {
      hotSkills.value = [...res.data];
    }
  } catch (e) {
    if (transportIsHttp) {
      showToast(e instanceof Error ? e.message : '热门 Skill 加载失败');
    }
  } finally {
    hotSkillsLoading.value = false;
  }
}

const onSearchHot = async (e: Event | KeyboardEvent) => {
  const value = (e.target as HTMLInputElement).value;
  hotSearch.value = value;
  await loadHotSkillCards();
};

const myReleasePageNumValue = ref<number>(1);
const myReleasePageSizeValue = ref<number>(16);

const myReleasePage = reactive<any>({
  total: 0,
  pageIndex: myReleasePageNumValue.value,
  pageSize: myReleasePageSizeValue.value,
  pageSizeOptions: [10, 20, 50, 100],
});

const myReleaseFilterObj = ref<any>({
  pageNo: myReleasePage.pageIndex,
  pageSize: myReleasePage.pageSize,
});

let myReleaseLastScrollTop = 0; // 上一次的滚动位置
const myReleaseHandleScroll = async () => {
  const el = myReleaseTableWrapRef.value;
  if (!el) {
    return;
  }
  const scrollTop = el.scrollTop;
  if (scrollTop <= myReleaseLastScrollTop - 100) {
    // 正在向上滚动
    myReleaseLastScrollTop = scrollTop;
    return;
  }
  const windowHeight = el.clientHeight;
  const documentHeight = el.scrollHeight;
  // 判断是否滚动到底部
  if (scrollTop + windowHeight >= documentHeight) {
    // 如果还有更多数据，加载下一页
    if (myReleasePage.pageIndex * myReleasePage.pageSize < myReleasePage.total) {
      myReleasePage.pageIndex += 1;
      myReleaseFilterObj.value.pageNo += 1;
      await loadMyPublishedSkills(true);
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 0);
    }
  }
  myReleaseLastScrollTop = scrollTop;
};

const debounceMyReleaseScroll = debounce(myReleaseHandleScroll, 200);

async function loadMyPublishedSkills(isPageOver?: boolean): Promise<void> {
  // 抢先拉角色仅用于本地 Mock：避免在真实 HTTP 下多打 /users/current/role 或干扰父级透传时序
  if (!transportIsHttp && !effectiveSkillUserId()) {
    await loadCurrentUserRole();
  }
  if (transportIsHttp) {
    await waitUserIdAndDepartmentList();
  }
  myReleaseFilterObj.value.userId = effectiveSkillUserId();
  const res = await skillBaseService.queryMySkills(myReleaseFilterObj.value);
  if (!res.meta.success || !res.data) {
    showToast(res.message || '我的发布加载失败');
    return;
  }
  myReleasePage.total = res.meta.number;
  myPublishedSkills.value = isPageOver ? [...myPublishedSkills.value, ...res.data] : [...res.data];
}

function myPublishCurrentLayerText(row: SkillListRecordDto): string {
  const lvl = `${row.level ?? ''}`.trim();
  if (lvl.includes('组织级')) {
    return '组织级';
  }
  if (lvl.includes('个人级')) {
    return '个人级';
  }
  return lvl || '—';
}

function myPublishStatusPill(row: SkillListRecordDto): { label: string; cls: string } {
  const st = `${row.status ?? ''}`.trim();
  if (
    st.includes('组织已驳回') ||
    st.includes('已驳回') ||
    (st.includes('驳回') && !st.includes('审核'))
  ) {
    return {
      label: st.includes('组织已驳回') ? '组织已驳回' : st || '组织已驳回',
      cls: 'st-rejected-pdu',
    };
  }
  if (st.includes('组织审核中') || (st.includes('审核中') && !st.includes('驳回'))) {
    return { label: st.includes('组织审核中') ? '组织审核中' : '审核中', cls: 'st-reviewing-dev' };
  }
  if (st.includes('组织级')) {
    return { label: '组织级', cls: 'st-published' };
  }
  if (st.includes('个人级')) {
    return { label: '个人级', cls: 'st-personal' };
  }
  const lg = myPublishCurrentLayerText(row);
  if (lg === '组织级') {
    return { label: '组织级', cls: 'st-published' };
  }
  if (lg === '个人级') {
    return { label: '个人级', cls: 'st-personal' };
  }
  return { label: st || lg || '—', cls: 'st-neutral' };
}

const myReleaseStatusStats = computed(() => {
  const stats = {
    personal: 0,
    reviewing: 0,
    organization: 0,
  };
  for (const row of myPublishedSkills.value as SkillListRecordDto[]) {
    const pill = myPublishStatusPill(row);
    if (pill.cls === 'st-personal') {
      stats.personal += 1;
    } else if (pill.cls === 'st-reviewing-dev') {
      stats.reviewing += 1;
    } else if (pill.cls === 'st-published') {
      stats.organization += 1;
    }
  }
  return stats;
});

function myPublishReleaseOp(row: SkillListRecordDto): 'upgraded' | 'upgrade' | 'upgrading' {
  const st = `${row.status ?? ''}`;
  if (st.includes('组织审核中') || (st.includes('审核中') && !st.includes('驳回'))) {
    return 'upgrading';
  }
  const lv = `${row.level ?? ''}`;
  if (lv.includes('组织级') || st.includes('组织级')) {
    return 'upgraded';
  }
  return 'upgrade';
}

const releaseToOrganization = async (row: any) => {
  let orgObj = {
    pluginType: 4,
    pluginId: '',
    publishLevel: 1,
    publisherId: '',
  };
  await skillBaseService.queryOrganizationList({ userId: userId.value }).then((res: any) => {
    if (res.meta.success && Array.isArray(res.data) && res.data.length) {
      const obj = res.data[0];
      orgObj.publisherId = obj?.orgCode || '';
      orgObj.pluginId = obj?.id || '';
    }
  });
  await skillBaseService.syncSkillToAgentCenter(
    {
      reason: '测试',
      targetOrgId: 13,
    },
    row.id,
  );
};

async function openMyReleaseVersions(row: SkillListRecordDto, syncRoute: boolean): Promise<void> {
  versionManageShowOperations.value = true;
  if (syncRoute) {
    await router.push({
      name: 'skill-market',
      query: {
        ...route.query,
        tab: 'releases',
        releaseSkillId: String(row.id),
        releaseView: 'versions',
      },
    });
  }
  versionPanelLoading.value = true;
  versionPanelSkill.value = {
    name: row.name,
    skill_id: String(row.id),
    id: String(row.id),
    version: row.version,
    versions: [],
  };
  try {
    const res = await skillBaseService.querySkillVersions(String(row.id));
    if (res.meta.success && res.data) {
      const list = Array.isArray(res.data) ? (res.data as SkillVersionListItemDto[]) : [];
      versionPanelSkill.value = {
        ...versionPanelSkill.value,
        version: pickCurrentVersionFromRows(
          list,
          String(versionPanelSkill.value.version ?? row.version),
        ),
        versions: list,
      };
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '版本列表加载失败');
  } finally {
    versionPanelLoading.value = false;
  }
}

function removeDeleteConfirmListeners(): void {
  if (!deleteConfirmListenersBound) {
    return;
  }
  deleteConfirmListenersBound = false;
  document.removeEventListener('mousedown', onDeleteConfirmDocDown, true);
  window.removeEventListener('scroll', closeDeleteConfirm, true);
  window.removeEventListener('resize', closeDeleteConfirm);
}

function closeDeleteConfirm(): void {
  deleteConfirmRow.value = null;
  deleteConfirmStyle.value = {};
  removeDeleteConfirmListeners();
}

function removeDetailDeleteConfirmListeners(): void {
  if (!detailDeleteConfirmListenersBound) {
    return;
  }
  detailDeleteConfirmListenersBound = false;
  document.removeEventListener('mousedown', onDetailDeleteConfirmDocDown, true);
  window.removeEventListener('scroll', closeDetailDeleteConfirm, true);
  window.removeEventListener('resize', closeDetailDeleteConfirm);
}

function closeDetailDeleteConfirm(): void {
  detailDeleteConfirmOpen.value = false;
  detailDeleteConfirmStyle.value = {};
  detailDeletePendingId.value = null;
  detailDeletePendingTitle.value = '';
  removeDetailDeleteConfirmListeners();
}

function onDetailDeleteConfirmDocDown(e: MouseEvent): void {
  for (const n of e.composedPath()) {
    if (!(n instanceof HTMLElement)) {
      continue;
    }
    if (n.classList.contains('my-delete-popconfirm')) {
      return;
    }
    if (n.classList.contains('detail-delete-trigger')) {
      return;
    }
  }
  closeDetailDeleteConfirm();
}

function openDetailDeleteConfirm(evt: MouseEvent): void {
  evt.stopPropagation();
  closeDeleteConfirm();
  const skill = detailPanelSkill.value;
  if (!skill) {
    return;
  }
  const id = String(skill.id ?? skill.skill_id ?? '').trim();
  if (!id) {
    showToast('无法识别 Skill ID');
    return;
  }
  if (detailDeleteConfirmOpen.value && detailDeletePendingId.value === id) {
    closeDetailDeleteConfirm();
    return;
  }
  detailDeletePendingId.value = id;
  detailDeletePendingTitle.value = skillTitle(skill as Skill);
  detailDeleteConfirmOpen.value = true;
  const el = evt.currentTarget as HTMLElement | null;
  if (el) {
    const rect = el.getBoundingClientRect();
    const panelW = 232;
    const idealLeft = rect.left + rect.width / 2 - panelW / 2;
    const left = Math.max(8, Math.min(idealLeft, window.innerWidth - panelW - 8));
    detailDeleteConfirmStyle.value = {
      position: 'fixed',
      top: `${Math.round(rect.bottom + 6)}px`,
      left: `${Math.round(left)}px`,
      width: `${panelW}px`,
      zIndex: 5000,
    };
  }
  void nextTick(() => {
    setTimeout(() => {
      if (!detailDeleteConfirmOpen.value) {
        return;
      }
      removeDetailDeleteConfirmListeners();
      document.addEventListener('mousedown', onDetailDeleteConfirmDocDown, true);
      window.addEventListener('scroll', closeDetailDeleteConfirm, true);
      window.addEventListener('resize', closeDetailDeleteConfirm);
      detailDeleteConfirmListenersBound = true;
    }, 0);
  });
}

async function executeDetailDeleteSkill(): Promise<void> {
  const id = detailDeletePendingId.value;
  if (!id) {
    return;
  }
  if (!transportIsHttp && !effectiveSkillUserId()) {
    await loadCurrentUserRole();
  }
  const uid = effectiveSkillUserId();
  if (!uid) {
    showToast('请先配置用户工号');
    return;
  }
  closeDetailDeleteConfirm();
  deletingMySkillId.value = id;
  try {
    const r = await skillBaseService.deleteSkillAll(id, { userId: uid });
    if (!serviceSucceeded(r)) {
      showToast(serviceMessage(r, '删除失败'));
      return;
    }
    showToast('已删除');
    const panelId = String(versionPanelSkill.value?.id ?? versionPanelSkill.value?.skill_id ?? '');
    if (panelId && panelId === id) {
      closeVersionPanel();
    }
    closeDetailPanel();
    await loadMyPublishedSkills();
    await startOverviewRemoteFetch();
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败');
  } finally {
    deletingMySkillId.value = null;
  }
}

function onDeleteConfirmDocDown(e: MouseEvent): void {
  for (const n of e.composedPath()) {
    if (!(n instanceof HTMLElement)) {
      continue;
    }
    if (n.classList.contains('my-delete-popconfirm')) {
      return;
    }
    if (n.classList.contains('my-rel-delete-trigger')) {
      return;
    }
  }
  closeDeleteConfirm();
}

function openDeleteConfirm(row: SkillListRecordDto, evt: MouseEvent): void {
  evt.stopPropagation();
  closeDetailDeleteConfirm();
  if (deleteConfirmRow.value && String(deleteConfirmRow.value.id) === String(row.id)) {
    closeDeleteConfirm();
    return;
  }
  deleteConfirmRow.value = row;
  const el = evt.currentTarget as HTMLElement | null;
  if (el) {
    const rect = el.getBoundingClientRect();
    const panelW = 232;
    const idealLeft = rect.left + rect.width / 2 - panelW / 2;
    const left = Math.max(8, Math.min(idealLeft, window.innerWidth - panelW - 8));
    deleteConfirmStyle.value = {
      position: 'fixed',
      top: `${Math.round(rect.bottom + 6)}px`,
      left: `${Math.round(left)}px`,
      width: `${panelW}px`,
      zIndex: 5000,
    };
  }
  void nextTick(() => {
    setTimeout(() => {
      if (!deleteConfirmRow.value) {
        return;
      }
      removeDeleteConfirmListeners();
      document.addEventListener('mousedown', onDeleteConfirmDocDown, true);
      window.addEventListener('scroll', closeDeleteConfirm, true);
      window.addEventListener('resize', closeDeleteConfirm);
      deleteConfirmListenersBound = true;
    }, 0);
  });
}

async function executeDeleteMyReleaseSkill(): Promise<void> {
  const row = deleteConfirmRow.value;
  if (!row) {
    return;
  }
  if (!transportIsHttp && !effectiveSkillUserId()) {
    await loadCurrentUserRole();
  }
  const uid = effectiveSkillUserId();
  if (!uid) {
    showToast('请先配置用户工号');
    return;
  }
  closeDeleteConfirm();
  deletingMySkillId.value = String(row.id);
  try {
    const r = await skillBaseService.deleteSkillAll(String(row.id), { userId: uid });
    if (!serviceSucceeded(r)) {
      showToast(serviceMessage(r, '删除失败'));
      return;
    }
    showToast('已删除');
    const panelId = String(versionPanelSkill.value?.id ?? versionPanelSkill.value?.skill_id ?? '');
    if (panelId && panelId === String(row.id)) {
      closeVersionPanel();
    }
    await loadMyPublishedSkills();
    await startOverviewRemoteFetch();
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败');
  } finally {
    deletingMySkillId.value = null;
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
  async (tab) => {
    closeDeleteConfirm();
    if (tab === 'hot') {
      await Promise.all([loadHotSkillNums(), loadHotSkillCards()]);
    }
    if (tab === 'overview') {
      await startOverviewRemoteFetch();
    }
    if (tab === 'releases') {
      await loadMyPublishedSkills();
      const myReleaseEl = myReleaseTableWrapRef.value;
      if (myReleaseEl) {
        myReleaseEl.addEventListener('scroll', debounceMyReleaseScroll);
      }
    }
    if (tab === 'ops') {
      selectedDeptIndex.value = 0;
      await loadOpsDashboardOverview();
    }
  },
  { immediate: true },
);

watch(
  () =>
    [
      innerTab.value,
      route.query.releaseSkillId,
      route.query.releaseView,
      myPublishedSkills.value.length,
    ] as const,
  async () => {
    if (innerTab.value !== 'releases') {
      return;
    }
    if (route.query.releaseView !== 'versions') {
      return;
    }
    const sid = String(route.query.releaseSkillId ?? '').trim();
    if (!sid) {
      return;
    }
    const rec = myPublishedSkills.value.find((r) => String(r.id) === sid);
    if (rec) {
      await openMyReleaseVersions(rec, false);
    }
  },
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
    enabled: 1,
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
  // if (!f.orgName.trim() || !f.orgCode.trim()) {
  //   showToast('请填写组织名称与组织 ID');
  //   return;
  // }
  const body = {
    orgName: f.orgName.trim(),
    orgCode: f.orgCode.trim(),
    admins: f.admins.trim(),
    enabled: f.enabled,
  };
  if (orgModalMode.value === 'create') {
    // const r = await marketClient.postOrganization(body);
    const r = await skillBaseService.createOrganization(body, { userId: userId.value });
    if (!serviceSucceeded(r)) {
      showToast(serviceMessage(r, '新建失败'));
      return;
    }
    showToast('已新建组织');
  } else {
    // const r = await marketClient.putOrganization(f.id, body);
    const r = await skillBaseService.updateOrganization(
      body,
      { userId: userId.value },
      f.id.toString(),
    );
    if (!serviceSucceeded(r)) {
      showToast(serviceMessage(r, '保存失败'));
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
    const body = {
      decision: reviewDecision.value,
      comment: reviewComment.value.trim(),
    };
    const r = await skillBaseService.reviewSyncApplication(body, row.id.toString());
    if (!serviceSucceeded(r)) {
      showToast(serviceMessage(r, '提交失败'));
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

function semverNumsForVersions(v: string): number[] {
  return String(v)
    .split('.')
    .map((p) => Number.parseInt(p, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function compareSemverDescVersions(a: string, b: string): number {
  const pa = semverNumsForVersions(a);
  const pb = semverNumsForVersions(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
}

function isVersionRowDeleted(row: SkillVersionListItemDto): boolean {
  return Number(row.deleted) === 1;
}

function pickCurrentVersionFromRows(list: SkillVersionListItemDto[], fallback: string): string {
  const active = list.filter((r) => !isVersionRowDeleted(r));
  if (active.length === 0) {
    return fallback;
  }
  return [...active].sort((a, b) => compareSemverDescVersions(a.version, b.version))[0]!.version;
}

async function reloadVersionPanelList(): Promise<void> {
  const vs = versionPanelSkill.value;
  if (!vs) {
    return;
  }
  const id = String(vs.id ?? vs.skill_id ?? '').trim();
  if (!id) {
    return;
  }
  versionPanelLoading.value = true;
  try {
    const res = await skillBaseService.querySkillVersions(id);
    if (res.meta.success && res.data) {
      const list = Array.isArray(res.data) ? (res.data as SkillVersionListItemDto[]) : [];
      const nextCurrent = pickCurrentVersionFromRows(list, String(vs.version ?? ''));
      versionPanelSkill.value = {
        ...vs,
        version: nextCurrent,
        versions: list,
      };
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '版本列表刷新失败');
  } finally {
    versionPanelLoading.value = false;
  }
}

function formatDirectoryStructure(structure: any, indent = '', i = -1): any[] {
  let lines: any[] = [];
  for (const key in structure) {
    i++;
    if (!key) {
      continue;
    }
    const value = structure[key];
    const isLast = i === structure.length - 1;
    if (!value) {
      lines.push(`${indent}${isLast ? '└─ ' : '├─ '} ${key}/`);
    } else if (typeof value === 'object') {
      const prefix = indent + (isLast ? '   ' : '│  ');
      lines.push(`${indent}${isLast ? '└─ ' : '├─ '} ${key}/`);
      lines.push(...formatDirectoryStructure(value, prefix, i));
    }
  }
  return lines;
}

/** 将详情接口 `fileTree` 路径列表还原为与 ZIP 扫描一致的结构，再走 `formatDirectoryStructure` */
function fileTreePathsToNested(structure: Record<string, unknown>, paths: string[]): void {
  for (const raw of paths) {
    const relativePath = String(raw ?? '')
      .replace(/\\/g, '/')
      .trim();
    if (!relativePath) {
      continue;
    }
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    let currentLevel: any = structure;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] as string;
      if (!currentLevel[part]) {
        currentLevel[part] = {};
      }
      currentLevel = currentLevel[part];
    }
    currentLevel[parts[parts.length - 1] as string] = null;
  }
}

function formatFileTreeTextFromPaths(paths: string[]): string {
  const structure: Record<string, unknown> = {};
  fileTreePathsToNested(structure, paths);
  if (Object.keys(structure).length === 0) {
    return '';
  }
  return formatDirectoryStructure(structure).join('\n');
}

function fileTreePayloadIsPresent(raw: unknown): boolean {
  if (raw == null) {
    return false;
  }
  if (typeof raw === 'string') {
    return raw.trim().length > 0;
  }
  if (Array.isArray(raw)) {
    return raw.some((x) => String(x ?? '').trim().length > 0);
  }
  return false;
}

/** 将接口 `fileTree`（路径数组、已排版树文本、JSON 数组字符串、换行路径）转为详情左侧展示文本 */
function normalizeDetailFileTreeToDisplay(raw: unknown): string {
  if (raw == null) {
    return '';
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) {
      return '';
    }
    if (/[├└│┌]/.test(t)) {
      return t;
    }
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed)) {
        const paths = parsed.map((x) => String(x)).filter(Boolean);
        return paths.length > 0 ? formatFileTreeTextFromPaths(paths) : '';
      }
    } catch {
      /* 非 JSON，按行视为路径 */
    }
    const lines = t
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return lines.length > 0 ? formatFileTreeTextFromPaths(lines) : '';
  }
  if (Array.isArray(raw)) {
    const paths = raw.map((x) => String(x)).filter((p) => p.length > 0);
    return paths.length > 0 ? formatFileTreeTextFromPaths(paths) : '';
  }
  return '';
}

function fileTreeFromDetailDto(raw: unknown): SkillFileTreeField {
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x));
  }
  return '';
}

const fileTreeObj = ref<any>({});
const skillMdFile = ref<any>({});

function detailFileTree(skill: any): void {
  const idKey = String(skill.id ?? skill.skill_id ?? '');
  fileTreeObj.value[idKey] = normalizeDetailFileTreeToDisplay(skill.fileTree);

  skillMdFile.value[idKey] = typeof skill.skillMdContent === 'string' ? skill.skillMdContent : '';
}

async function parseSkillArchiveForUpload(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const env = await skillBaseService.parseSkillPackage(formData, { userId: userId.value });
  if (!env.meta.success || !env.data) {
    console.error('上传时解析skill失败');
    return;
  }
  return env.data;
}

type UploadSubmitPayload = SkillUploadPayload & {
  version?: string;
  versionUpgrade?: boolean;
  existingVersion?: string;
};

async function onUploadSubmit(payload: UploadSubmitPayload): Promise<void> {
  const versionText = payload.version ? ` v${payload.version}` : '';
  const message =
    payload.versionUpgrade && payload.existingVersion
      ? `已上传「${payload.name}」${versionText}，原版本 v${payload.existingVersion} 已保留`
      : `已上传新 Skill「${payload.name}」${versionText}`;
  try {
    await loadMyPublishedSkills();
    await startOverviewRemoteFetch();
    showToast(message, 4000);
  } catch (e) {
    showToast(
      e instanceof Error
        ? `上传成功，但我的发布刷新失败：${e.message}`
        : '上传成功，但我的发布刷新失败',
      4000,
    );
  }
}

async function onDownload(id: string, version?: string): Promise<void> {
  try {
    let params: any = {
      userId: userId.value,
    };
    if (version) {
      params.version = version;
    }
    const env = await skillBaseService.downloadSkill(params, id);
    if (!env.meta.success || !env.data) {
      throw new Error(env.message || '下载失败');
    }
    const d = env.data;
    window.open(d);

    let index = newSkills.value.findIndex((item) => skillKey(item) === id);
    if (index >= 0) {
      newSkills.value[index].downloads += 1;
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '下载失败');
  }
}

// skill调测用
const agentId = import.meta.env.VITE_SKILL_DEV_AGENT_ID;
/**
 * 下载 SKILL 并存入 FormData, key为file
 * @param id skill id
 * @param version 可选版本号
 * @returns 包含下载文件的 FormData, 失败返回 null
 */
async function onDownloadToFormData(id: string, version?: string): Promise<FormData | null> {
  try {
    let params: any = {
      userId: userId.value,
    };
    if (version) {
      params.version = version;
    }
    const env = await skillBaseService.downloadSkill(params, id);
    if (!env.meta.success || !env.data) {
      throw new Error(env.message || '下载失败');
    }
    const d = env.data;

    // 获取 blob 数据
    const response = await fetch(d);
    const blob = await response.blob();

    // 创建 FormData 并存入 file
    const formData = new FormData();
    formData.append('file', blob, `skill-${id}.zip`);

    return formData;
  } catch (e) {
    showToast(e instanceof Error ? e.message : '下载失败');
    return null;
  }
}
const updateSkillData = async (id: string, currentVersion: string) => {
  const formData = await onDownloadToFormData(id, currentVersion);
  if (formData) {
    const res = await skillBaseService.clearAndUploadWorkspace(formData, userId.value, agentId);
    console.log(res);
  }
};

function onViewVersions(id: string): void {
  void openVersionPanelFromMarketSkill(id);
}

async function openVersionPanelFromMarketSkill(id: string): Promise<void> {
  versionManageShowOperations.value = false;
  const skill = skills.value.find((item) => skillKey(item) === id);
  if (!skill) {
    return;
  }
  const sid = String(skill.id ?? skill.skill_id ?? id);
  const cur = String(skill.currentVersion ?? skill.version ?? '').trim();
  versionPanelLoading.value = true;
  versionPanelSkill.value = {
    ...skill,
    id: sid,
    skill_id: sid,
    name: skill.name ?? skill.skill_id,
    version: cur,
    versions: [],
  };
  try {
    const res = await skillBaseService.querySkillVersions(sid);
    if (res.meta.success && res.data) {
      const list = Array.isArray(res.data) ? (res.data as SkillVersionListItemDto[]) : [];
      versionPanelSkill.value = {
        ...versionPanelSkill.value,
        version: pickCurrentVersionFromRows(list, String(versionPanelSkill.value.version ?? cur)),
        versions: list,
      };
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '版本列表加载失败');
  } finally {
    versionPanelLoading.value = false;
  }
}

const handleDetailItem = async (skill: any, id: any) => {
  const hasTree = fileTreePayloadIsPresent(skill.fileTree);
  const hasMd = typeof skill.skillMdContent === 'string' && skill.skillMdContent.length > 0;
  if (!hasTree || !hasMd) {
    const { skillMdContent, fileTree } = await fetchSkillDetailExtras(String(id));
    if (!hasTree && fileTreePayloadIsPresent(fileTree)) {
      skill.fileTree = fileTree;
    }
    if (!hasMd && typeof skillMdContent === 'string') {
      skill.skillMdContent = skillMdContent;
    }
  }
  detailFileTree(skill);
  detailPanelSkill.value = skill;
  detailShowDelete.value = false;
};

async function openDetailPanel(id: any): Promise<void> {
  const skill = newSkills.value.find((item) => skillKey(item) === id);
  if (!skill) {
    return;
  }
  await handleDetailItem(skill, id);
}

async function openHotSkillDetail(skill: any): Promise<void> {
  const id = String(skill?.id ?? '').trim();
  if (!id) {
    return;
  }
  await handleDetailItem(skill, id);
}

async function fetchSkillDetailExtras(
  skillId: string,
): Promise<{ skillMdContent: string; fileTree: SkillFileTreeField }> {
  const id = String(skillId ?? '').trim();
  if (!id) {
    return { skillMdContent: '', fileTree: '' };
  }
  try {
    const res = await skillBaseService.querySkillDetail(id);
    if (res.meta.success && res.data) {
      const d = res.data as SkillDetailDto;
      return {
        skillMdContent: typeof d.skillMdContent === 'string' ? d.skillMdContent : '',
        fileTree: fileTreeFromDetailDto(d.fileTree),
      };
    }
  } catch {}
  return { skillMdContent: '', fileTree: '' };
}

async function openDetailFromMyRelease(row: SkillListRecordDto): Promise<void> {
  await handleDetailItem(row, row.id);
  detailPanelSkill.value = row;
  detailShowDelete.value = true;
}

function closeDetailPanel(): void {
  closeDetailDeleteConfirm();
  detailPanelSkill.value = null;
  detailShowDelete.value = true;
}

async function onDetailVersionManage(): Promise<void> {
  const skill = detailPanelSkill.value;
  if (!skill) {
    return;
  }
  const rowId = String(skill.id ?? skill.skill_id ?? '').trim();
  if (!rowId) {
    showToast('无法识别 Skill ID');
    return;
  }
  const showOperations = detailShowDelete.value;
  closeDetailPanel();
  versionManageShowOperations.value = showOperations;
  versionPanelLoading.value = true;
  versionPanelSkill.value = {
    name: skill.name,
    skill_id: rowId,
    id: rowId,
    version: skill.currentVersion ?? skill.version,
    versions: [],
  };
  try {
    const res = await skillBaseService.querySkillVersions(rowId);
    if (res.meta.success && res.data) {
      const list = Array.isArray(res.data) ? (res.data as SkillVersionListItemDto[]) : [];
      versionPanelSkill.value = {
        ...versionPanelSkill.value,
        version: pickCurrentVersionFromRows(
          list,
          String(versionPanelSkill.value.version ?? skill.currentVersion ?? skill.version ?? ''),
        ),
        versions: list,
      };
    } else if (transportIsHttp) {
      showToast(res.message || '版本列表加载失败');
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '版本列表加载失败');
  } finally {
    versionPanelLoading.value = false;
  }
}

function onDetailDownload(): void {
  const skill = detailPanelSkill.value;
  if (!skill) {
    return;
  }
  if (skill.isAiEvolution) {
    void onDownloadAiEvolution(String(skill.id ?? ''));
    return;
  }
  void onDownload(skill.id, skill.currentVersion);
}

async function onDownloadAiEvolution(id: string): Promise<void> {
  if (!id) {
    return;
  }
  try {
    const env = await skillBaseService.downloadSkillDraft(id, { userId: userId.value });
    if (!serviceSucceeded(env) || !env?.data) {
      throw new Error(serviceMessage(env, '下载失败'));
    }
    window.open(String(env.data));
  } catch (e) {
    showToast(e instanceof Error ? e.message : '下载失败');
  }
}

function onTrySkill(): void {
  if (!detailPanelSkill.value) {
    return;
  }
  showToast(`已进入在线调测（演示）：${skillTitle(detailPanelSkill.value)}`);
}

function closeVersionPanel(): void {
  versionPreviewSkill.value = null;
  versionPanelSkill.value = null;
  versionUnpublishing.value = null;
  versionManageShowOperations.value = true;
  const q: Record<string, unknown> = { ...route.query };
  if (q.releaseSkillId != null || q.releaseView != null) {
    delete q.releaseSkillId;
    delete q.releaseView;
    void router.replace({ name: 'skill-market', query: q as Record<string, string | string[]> });
  }
}

async function onVersionManageBack(): Promise<void> {
  const vs = versionPanelSkill.value;
  if (!vs) {
    return;
  }
  const snapshot = {
    sid: String(vs.id ?? vs.skill_id ?? ''),
    name: String(vs.name ?? ''),
    version: String(vs.version ?? ''),
  };
  closeVersionPanel();
  const marketSkill = newSkills.value.find((item) => skillKey(item) === snapshot.sid);
  if (marketSkill) {
    await openDetailPanel(snapshot.sid);
    return;
  }
  const { skillMdContent, fileTree } = await fetchSkillDetailExtras(snapshot.sid);
  const shim: Record<string, unknown> = {
    id: snapshot.sid,
    name: snapshot.name,
    currentVersion: snapshot.version,
    categoryGroupName: '',
    author: '',
    level: '',
    downloads: 0,
    skillMdContent,
    fileTree,
    publish_level: '',
  };
  detailFileTree(shim);
  detailPanelSkill.value = shim;
  detailShowDelete.value = true;
}

function onVersionRowDownload(version: string): void {
  const vs = versionPanelSkill.value;
  if (!vs) {
    return;
  }
  const row = (vs.versions ?? []).find(
    (r: SkillVersionListItemDto) => String(r.version) === String(version),
  );
  if (row && isVersionRowDeleted(row)) {
    showToast('该版本已下架，无法下载');
    return;
  }
  const id = String(vs.id ?? vs.skill_id ?? '').trim();
  if (!id) {
    return;
  }
  void onDownload(id, version);
}

function versionPreviewStorageKey(sid: string, ver: string): string {
  return `__vprev__${sid}__${ver}`;
}

function onVersionViewDetail(row: SkillVersionListItemDto): void {
  const vs = versionPanelSkill.value;
  if (!vs) {
    return;
  }
  const sid = String(vs.id ?? vs.skill_id ?? '').trim();
  if (!sid) {
    return;
  }
  const vk = versionPreviewStorageKey(sid, String(row.version));
  const shim: Record<string, unknown> = {
    id: vk,
    name: String(vs.name ?? vs.skill_id ?? sid),
    skill_id: sid,
    currentVersion: row.version,
    version: row.version,
    author: String(vs.author ?? vs.publisher ?? vs.publish_name ?? ''),
    categoryGroupName: String(vs.categoryGroupName ?? vs.tagFunctional ?? ''),
    level: String(vs.level ?? vs.publish_level ?? ''),
    publish_level: String(vs.publish_level ?? vs.level ?? ''),
    downloads: vs.downloads ?? vs.download_count ?? 0,
    fileTree: row.fileTree,
    skillMdContent: row.skillMdContent,
  };
  detailFileTree(shim);
  versionPreviewSkill.value = shim;
}

function closeVersionDetailPreview(): void {
  versionPreviewSkill.value = null;
}

async function onVersionRowUnpublish(version: string): Promise<void> {
  const vs = versionPanelSkill.value;
  if (!vs) {
    return;
  }
  const id = String(vs.id ?? vs.skill_id ?? '').trim();
  if (!id) {
    return;
  }
  if (!transportIsHttp && !effectiveSkillUserId()) {
    await loadCurrentUserRole();
  }
  const uid = effectiveSkillUserId();
  if (!uid) {
    showToast('请先配置用户工号');
    return;
  }
  versionUnpublishing.value = version;
  try {
    const r = await skillBaseService.unpublishSkillVersion(id, { version, userId: uid });
    if (!serviceSucceeded(r)) {
      showToast(serviceMessage(r, '下架失败'));
      return;
    }
    showToast('已下架该版本');
    await reloadVersionPanelList();
    await startOverviewRemoteFetch();
  } catch (e) {
    showToast(e instanceof Error ? e.message : '下架失败');
  } finally {
    versionUnpublishing.value = null;
  }
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
  | 'aiEvolution'
  | 'coreApply';

const releaseFilter = ref<ReleaseFilterKey>('all');

const releaseFilters: { key: ReleaseFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'personal', label: '个人级' },
  { key: 'published', label: '组织级' },
  { key: 'reviewing', label: '组织审核中' },
  { key: 'rejected', label: '组织已驳回' },
  { key: 'aiEvolution', label: '自进化审批' },
];

type AiEvolutionStatus = 'pending' | 'approved' | 'rejected';

type AiEvolutionSkillRow = {
  id: string;
  name: string;
  description: string;
  sessionId: string;
  summary: string;
  ide: string;
  sessionTime: string;
  generatedAt: string;
  firstMessage: string;
  codeRepo: string;
  status: AiEvolutionStatus;
  version: string;
  skillMdContent: string;
  fileTree: string;
};

const aiEvolutionSkills = ref<AiEvolutionSkillRow[]>([]);
const aiEvolutionLoading = ref(false);

/** 文件树字段统一为换行文本：兼容后端字符串或路径数组 */
function normalizeDraftFileTree(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join('\n');
  }
  return '';
}

/** SkillDraft → 自进化审批列表行 */
function mapSkillDraftToRow(dto: any): AiEvolutionSkillRow {
  const status = String(dto?.skillStatus ?? '')
    .trim()
    .toUpperCase();
  const statusKey: AiEvolutionStatus =
    status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'rejected' : 'pending';
  return {
    id: String(dto?.skillId ?? ''),
    name: String(dto?.skillName ?? ''),
    description: String(dto?.description ?? ''),
    sessionId: String(dto?.sessionId ?? ''),
    summary: String(dto?.description ?? ''),
    ide: String(dto?.ide ?? ''),
    sessionTime: String(dto?.sessionCreateTime ?? ''),
    generatedAt: String(dto?.skillGenerateTime ?? ''),
    firstMessage: String(dto?.firstMessage ?? ''),
    codeRepo: String(dto?.codeRepo ?? ''),
    status: statusKey,
    version: String(dto?.version ?? ''),
    skillMdContent: String(dto?.skillMdContent ?? ''),
    fileTree: normalizeDraftFileTree(dto?.fileTree),
  };
}

async function loadAiEvolutionSkills(): Promise<void> {
  if (!transportIsHttp && !effectiveSkillUserId()) {
    await loadCurrentUserRole();
  }
  if (transportIsHttp) {
    await waitUserIdAndDepartmentList();
  }
  aiEvolutionLoading.value = true;
  try {
    const params = {
      userId: effectiveSkillUserId(),
      skillStatus: 'PENDING',
      pageNo: 1,
      pageSize: 100,
    };
    const res = await skillBaseService.querySkillDraftList(params);
    if (!serviceSucceeded(res)) {
      showToast(serviceMessage(res, '自进化审批列表加载失败'));
      return;
    }
    const list = Array.isArray(res?.data) ? res.data : [];
    aiEvolutionSkills.value = list.map(mapSkillDraftToRow);
  } catch (e) {
    if (transportIsHttp) {
      showToast(e instanceof Error ? e.message : '自进化审批列表加载失败');
    }
  } finally {
    aiEvolutionLoading.value = false;
  }
}

const aiEvolutionPendingCount = computed(
  () => aiEvolutionSkills.value.filter((s) => s.status === 'pending').length,
);

const processingAiEvolutionId = ref<string>('');

type AiEvolutionDecision = 'approve' | 'reject';
const aiEvolutionConfirm = ref<{ row: AiEvolutionSkillRow; decision: AiEvolutionDecision } | null>(
  null,
);

function requestAiEvolutionDecision(row: AiEvolutionSkillRow, decision: AiEvolutionDecision): void {
  if (row.status !== 'pending' || processingAiEvolutionId.value) {
    return;
  }
  aiEvolutionConfirm.value = { row, decision };
}

function approveAiEvolutionSkill(row: AiEvolutionSkillRow): void {
  requestAiEvolutionDecision(row, 'approve');
}

function rejectAiEvolutionSkill(row: AiEvolutionSkillRow): void {
  requestAiEvolutionDecision(row, 'reject');
}

function closeAiEvolutionConfirm(): void {
  if (processingAiEvolutionId.value) {
    return;
  }
  aiEvolutionConfirm.value = null;
}

async function confirmAiEvolutionDecision(): Promise<void> {
  const pending = aiEvolutionConfirm.value;
  if (!pending || processingAiEvolutionId.value) {
    return;
  }
  const { row, decision } = pending;
  if (!transportIsHttp && !effectiveSkillUserId()) {
    await loadCurrentUserRole();
  }
  const uid = effectiveSkillUserId();
  if (!uid) {
    showToast('请先配置用户工号');
    return;
  }
  const failFallback = decision === 'approve' ? '审批失败' : '拒绝失败';
  processingAiEvolutionId.value = row.id;
  try {
    const res =
      decision === 'approve'
        ? await skillBaseService.approveSkillDraft(row.id, { userId: uid })
        : await skillBaseService.rejectSkillDraft(row.id, { userId: uid });
    if (!serviceSucceeded(res)) {
      showToast(serviceMessage(res, failFallback));
      return;
    }
    aiEvolutionSkills.value = aiEvolutionSkills.value.filter((s) => s.id !== row.id);
    aiEvolutionConfirm.value = null;
    showToast(
      decision === 'approve'
        ? `已通过「${row.name}」，将发布为个人级 Skill`
        : `已拒绝「${row.name}」的自进化审批`,
    );
    if (decision === 'approve') {
      // 审批通过后落成个人级 Skill，刷新我的发布列表
      await loadMyPublishedSkills();
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : failFallback);
  } finally {
    processingAiEvolutionId.value = '';
  }
}

async function openAiEvolutionDetail(row: AiEvolutionSkillRow): Promise<void> {
  let skillMdContent = row.skillMdContent;
  let fileTree = row.fileTree;
  // 列表场景如使用轻量 VO，可能缺少正文/文件树，按需拉详情补全
  if (!skillMdContent || !fileTree) {
    try {
      const res = await skillBaseService.querySkillDraftDetail(row.id);
      if (serviceSucceeded(res) && res?.data) {
        if (!skillMdContent) {
          skillMdContent = String(res.data.skillMdContent ?? '');
        }
        if (!fileTree) {
          fileTree = normalizeDraftFileTree(res.data.fileTree);
        }
      }
    } catch {
      // 拉取失败时沿用列表已有内容
    }
  }
  const skill = {
    id: row.id,
    name: row.name,
    description: row.description,
    currentVersion: row.version,
    version: row.version,
    categoryGroupName: '自进化',
    author: 'AI 自进化',
    level: '自进化候选',
    totalDownloads: 0,
    publish_level: '',
    fileTree,
    skillMdContent,
    isAiEvolution: true,
    ide: row.ide,
    sessionId: row.sessionId,
    sessionTime: row.sessionTime,
    generatedAt: row.generatedAt,
    firstMessage: row.firstMessage,
    codeRepo: row.codeRepo,
  };
  detailFileTree(skill);
  detailPanelSkill.value = skill;
  detailShowDelete.value = false;
}

type ReleaseStatusKey = 'personal-live' | 'published' | 'reviewing-dev' | 'rejected-pdu';

function releaseSyncActionText(row: {
  skill: Skill;
  statusKey: ReleaseStatusKey;
  personal: boolean;
}): string {
  if (row.statusKey === 'published' && !row.personal) {
    return '更新同步';
  }
  return '同步至公司组织';
}

const onClickFilterRelease = async (key: any) => {
  releaseFilter.value = key;
  if (key === 'aiEvolution') {
    await loadAiEvolutionSkills();
    return;
  }
  if (key === 'all' && 'status' in myReleaseFilterObj.value) {
    delete myReleaseFilterObj.value.status;
  } else if (key === 'personal') {
    myReleaseFilterObj.value.status = '个人级';
  } else if (key === 'published') {
    myReleaseFilterObj.value.status = '组织级';
  } else if (key === 'reviewing') {
    myReleaseFilterObj.value.status = '组织审核中';
  } else if (key === 'rejected') {
    myReleaseFilterObj.value.status = '组织已驳回';
  }
  myReleasePage.pageIndex = 1;
  myReleaseFilterObj.value.pageNo = myReleasePage.pageIndex;
  await loadMyPublishedSkills();
};

const opsImportedBundle = ref<OpsDashboardBundle | null>(null);
const opsImporting = ref(false);
const opsExcelInputRef = ref<HTMLInputElement | null>(null);

const opsBoardSystem = ref<'fuyao' | 'company'>('fuyao');
const changeSystem = async (value: 'fuyao' | 'company') => {
  opsBoardSystem.value = value;
  selectedOpsDeptPath.value = '';
  selectedDeptIndex.value = 0;
  await nextTick();
  await refreshOpsDeptDimensionDerivedData(0);
};
/** 公司运营管理「Excel 导入」仅管理员可用；扶摇看板不提供导入 */
const showOpsExcelImport = computed(() => {
  return opsBoardSystem.value === 'company' && currentUserRole.value?.role === 'SUPER_ADMIN';
});
const selectedOpsDeptPath = ref('');
const selectedOpsOrgName = ref('');
const selectedOpsBusinessDimension = ref<{
  id: string;
  name: string;
  parentName?: string;
} | null>(null);
type OpsDeptMetric = { skills: number; downloads: number };
const opsDeptDimensionStats = ref<Map<string, OpsDeptMetric>>(new Map());
const opsDeptDimensionStatsLoading = ref(false);
const opsDeptSkillRowsLoading = ref(false);
let opsDeptDimensionStatsRequestSeq = 0;
let opsDeptSkillRowsRequestSeq = 0;
const OPS_DIMENSION_DEFAULT_HEIGHT = 190;
const OPS_DIMENSION_MIN_HEIGHT = 150;
const OPS_DIMENSION_MAX_HEIGHT = 560;
const opsDimensionHeight = ref(OPS_DIMENSION_DEFAULT_HEIGHT);
const opsDimensionResizing = ref(false);
let opsDimensionResizeStartY = 0;
let opsDimensionResizeStartHeight = OPS_DIMENSION_DEFAULT_HEIGHT;
let opsDimensionPreviousUserSelect = '';
let opsDimensionPreviousCursor = '';

const opsDimensionScrollStyle = computed((): CSSProperties => {
  return {
    height: `${opsDimensionHeight.value}px`,
  };
});

function clampOpsDimensionHeight(value: number): number {
  return Math.min(OPS_DIMENSION_MAX_HEIGHT, Math.max(OPS_DIMENSION_MIN_HEIGHT, value));
}

function onOpsDimensionResizeMove(event: PointerEvent): void {
  if (!opsDimensionResizing.value) {
    return;
  }
  const delta = event.clientY - opsDimensionResizeStartY;
  opsDimensionHeight.value = clampOpsDimensionHeight(opsDimensionResizeStartHeight + delta);
}

function stopOpsDimensionResize(): void {
  if (!opsDimensionResizing.value) {
    return;
  }
  opsDimensionResizing.value = false;
  window.removeEventListener('pointermove', onOpsDimensionResizeMove);
  window.removeEventListener('pointerup', stopOpsDimensionResize);
  window.removeEventListener('pointercancel', stopOpsDimensionResize);
  document.body.style.userSelect = opsDimensionPreviousUserSelect;
  document.body.style.cursor = opsDimensionPreviousCursor;
}

function startOpsDimensionResize(event: PointerEvent): void {
  event.preventDefault();
  opsDimensionResizing.value = true;
  opsDimensionResizeStartY = event.clientY;
  opsDimensionResizeStartHeight = opsDimensionHeight.value;
  opsDimensionPreviousUserSelect = document.body.style.userSelect;
  opsDimensionPreviousCursor = document.body.style.cursor;
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'ns-resize';
  window.addEventListener('pointermove', onOpsDimensionResizeMove);
  window.addEventListener('pointerup', stopOpsDimensionResize);
  window.addEventListener('pointercancel', stopOpsDimensionResize);
}

function resetOpsDimensionHeight(): void {
  opsDimensionHeight.value = OPS_DIMENSION_DEFAULT_HEIGHT;
}

const opsOverviewFilterObj = ref<any>({
  system: 'company',
});
const overviewData = ref<OpsDashboardBundle | null>(null);
const getOverviewData = async () => {
  if (selectedOpsBusinessDimension.value?.categoryId) {
    opsOverviewFilterObj.value.category = selectedOpsBusinessDimension.value.categoryId;
  } else {
    delete opsOverviewFilterObj.value.category;
  }
  if (opsDeptSkillLevelFilter.value !== 'all') {
    opsOverviewFilterObj.value.level =
      opsDeptSkillLevelFilter.value === 'personal' ? '个人级' : '组织级';
  } else {
    delete opsOverviewFilterObj.value.level;
  }
  const res = await skillBaseService.queryDashboardOverview(opsOverviewFilterObj.value);
  if (res.meta.success && res.data) {
    overviewData.value = res.data;
    totalSkills.value = res.data.kpis.totalSkills;
    // 暂时 组织数，要重新从接口拿
    orgCount.value = res.data.rankings?.length ?? orgCount.value;
  }
};

async function loadOpsDashboardOverview(): Promise<void> {
  await getOverviewData();
  await nextTick();
  await refreshOpsDeptDimensionDerivedData(selectedDeptIndex.value);
}

const opsDashboardBundle = computed(() => {
  return overviewData.value ?? emptyOpsDashboardBundle();
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
  skillRows: OpsSkillDetailRow[];
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

type OpsDeptSkillLevelFilter = 'all' | 'personal' | 'org';

const opsDeptSkillLevelFilter = ref<OpsDeptSkillLevelFilter>('all');

const opsDeptSkillLevelTabs: { key: OpsDeptSkillLevelFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'personal', label: '个人级' },
  { key: 'org', label: '组织级' },
];

const changeSkillLevel = async (value: 'all' | 'personal' | 'org') => {
  let params: any = { format: 'tree' };
  if (value && value !== 'all') {
    params['level'] = value === 'personal' ? '个人级' : '组织级';
  }
  await loadBusinessDimensions(params);
  opsDeptSkillLevelFilter.value = value;
  await loadOpsDashboardOverview();
};

const selectedOpsBusinessDimensionLabel = computed(() => {
  const current = selectedOpsBusinessDimension.value;
  let str = '已选择：';
  if (!current) {
    return str + '全部业务维度';
  }
  return current.parentName
    ? str + `${current.parentName} / ${current.categoryName}`
    : str + current.categoryName;
});

function opsBusinessDimensionNodeId(dimension: BusinessDimensionDto): string {
  return String(dimension.categoryId);
}

function isOpsBusinessDimensionSelected(dimension: BusinessDimensionDto): boolean {
  return selectedOpsBusinessDimension.value?.categoryId === opsBusinessDimensionNodeId(dimension);
}

async function selectOpsBusinessDimension(
  dimension: BusinessDimensionDto,
  parent?: BusinessDimensionDto,
): Promise<void> {
  selectedOpsBusinessDimension.value = {
    categoryId: opsBusinessDimensionNodeId(dimension),
    categoryName: dimension.categoryName,
    parentName: parent?.categoryName,
  };
  await loadOpsDashboardOverview();
}

async function clearOpsBusinessDimension(): Promise<void> {
  selectedOpsBusinessDimension.value = null;
  opsDeptDimensionStatsRequestSeq += 1;
  opsDeptDimensionStatsLoading.value = false;
  opsDeptDimensionStats.value = new Map();
  selectedDeptIndex.value = 0;

  await loadOpsDashboardOverview();
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

function toggleDeptExpand(path: string): void {
  const next = new Set(expandedDeptPaths.value);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  expandedDeptPaths.value = next;
  void filterOpsDept(selectedDeptIndex.value);
}

const selectedDeptSkillRows = ref<OpsSkillDetailRow[]>([]);
const selectedDeptIndex = ref(0);

async function refreshOpsDeptDimensionDerivedData(index = selectedDeptIndex.value): Promise<void> {
  if (!selectedOpsBusinessDimension.value) {
    opsDeptDimensionStatsRequestSeq += 1;
    opsDeptDimensionStats.value = new Map();
    opsDeptDimensionStatsLoading.value = false;
    await filterOpsDept(index);
    return;
  }

  await filterOpsDept(index);
}

async function filterOpsDept(index: number): Promise<void> {
  selectedDeptIndex.value = index;
  opsDeptSkillRowsRequestSeq += 1;
  opsDeptSkillRowsLoading.value = false;
  selectedDeptSkillRows.value = uiDeptFlat.value?.[index]?.skillRows ?? [];
}

async function selectOpsDept(path: string, index: number): Promise<void> {
  selectedOpsDeptPath.value = path;
  await filterOpsDept(index);
}

function selectOpsOrg(name: string): void {
  selectedOpsOrgName.value = name;
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
      skillRows: [...n.skillRows],
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

const selectedOrgBar = computed(
  () => uiOrgBars.value.find((row) => row.name === selectedOpsOrgName.value) ?? uiOrgBars.value[0],
);

const selectedOrgSkillRows = computed(() => selectedOrgBar.value?.skillRows ?? []);

const opsKpiCards = computed<OpsKpiCard[]>(() => {
  const kpi = opsDashboardBundle.value.kpis;
  const systemName = opsBoardSystem.value === 'company' ? '公司系统' : '扶摇系统';
  return [
    {
      label: 'Skill 总数',
      value: kpi.totalSkills,
      desc: `个人级和组织级 Skill 总量`,
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
  opsBoardSystem.value === 'company' ? '暂无系统运营管理数据' : '暂无系统运营管理数据',
);

const opsOrgBarsHelpText = computed(
  () => '与已同步至公司组织维度的组织级 Skill 一致，按发布组织聚合；点击条目查看右侧明细。',
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
      selectedOpsDeptPath.value = '';
      selectedDeptIndex.value = 0;
      await nextTick();
      await refreshOpsDeptDimensionDerivedData(0);
      downloadOpsDashboardExportJson(file.name, bundle);
      showToast(
        `已导入 ${rows.length} 条 Skill，当前页为预览；请用已下载 JSON 手动替换 src/mock/opsDashboardCompanyDefault.json 后重新运行 dev 以生效`,
      );
    } else {
      downloadOpsDashboardExportJson(file.name, bundle);
      showToast(
        `已解析 ${rows.length} 条并下载 JSON；扶摇运营管理仅展示接口数据，导入不会更新该页`,
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
  <div>
    <UploadSkillModal
      v-model="uploadOpen"
      :operator-user-id="userId"
      :parse-skill-archive="parseSkillArchiveForUpload"
      @submit="onUploadSubmit"
    />

    <SkillDetailDialog
      v-if="detailPanelSkill"
      :skill="detailPanelSkill"
      :file-tree-text="String(fileTreeObj[detailPanelSkill.id] ?? '')"
      :skill-md-text="String(skillMdFile[detailPanelSkill.id] ?? '')"
      :show-delete="detailShowDelete"
      :deleting-skill-id="deletingMySkillId"
      :ai-evolution="!!detailPanelSkill.isAiEvolution"
      @close="closeDetailPanel"
      @try-skill="onTrySkill"
      @download="onDetailDownload"
      @delete-click="openDetailDeleteConfirm"
      @version-manage="onDetailVersionManage"
      @update-skill-data="updateSkillData"
    />

    <SkillVersionManageDialog
      v-if="versionPanelSkill"
      :skill="versionPanelSkill"
      :loading="versionPanelLoading"
      :unpublishing-version="versionUnpublishing"
      :show-operations-column="versionManageShowOperations"
      @close="closeVersionPanel"
      @back="onVersionManageBack"
      @download="onVersionRowDownload"
      @unpublish="onVersionRowUnpublish"
      @view-detail="onVersionViewDetail"
    />

    <SkillDetailDialog
      v-if="versionPreviewSkill"
      preview-only
      :skill="versionPreviewSkill"
      :file-tree-text="String(fileTreeObj[versionPreviewSkill.id] ?? '')"
      :skill-md-text="String(skillMdFile[versionPreviewSkill.id] ?? '')"
      @close="closeVersionDetailPreview"
    />

    <Teleport to="body">
      <div
        v-if="deleteConfirmRow"
        class="my-delete-popconfirm"
        :style="deleteConfirmStyle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-delete-pop-title"
        @click.stop
      >
        <p id="my-delete-pop-title" class="my-delete-pop-title">
          确定删除「{{
            deleteConfirmRow.name ?? deleteConfirmRow.id
          }}」及<strong>全部版本</strong>？
        </p>
        <p class="my-delete-pop-hint">此操作不可恢复。</p>
        <div class="my-delete-pop-actions">
          <button type="button" class="mini" @click="closeDeleteConfirm">取消</button>
          <button type="button" class="mini my-rel-delete-btn" @click="executeDeleteMyReleaseSkill">
            确定删除
          </button>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="detailDeleteConfirmOpen"
        class="my-delete-popconfirm"
        :style="detailDeleteConfirmStyle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-delete-pop-title"
        @click.stop
      >
        <p id="detail-delete-pop-title" class="my-delete-pop-title">
          确定删除「{{ detailDeletePendingTitle }}」及<strong>全部版本</strong>？
        </p>
        <p class="my-delete-pop-hint">此操作不可恢复。</p>
        <div class="my-delete-pop-actions">
          <button type="button" class="mini" @click="closeDetailDeleteConfirm">取消</button>
          <button type="button" class="mini my-rel-delete-btn" @click="executeDetailDeleteSkill">
            确定删除
          </button>
        </div>
      </div>
    </Teleport>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
  <div
    class="user-shell skill-market-shell"
    :class="{
      'is-hot-tab': innerTab === 'hot',
      'is-overview-tab': innerTab === 'overview',
      'is-topbar-glass': topbarGlass,
    }"
  >
    <header class="market-topbar">
      <nav
        class="sub-tabs"
        :class="{
          'ops-tabs':
            innerTab === 'ops' ||
            innerTab === 'org' ||
            innerTab === 'approval' ||
            innerTab === 'review' ||
            innerTab === 'planning',
        }"
        aria-label="市场分区"
      >
        <button
          type="button"
          class="sub-tab"
          :class="{ on: innerTab === 'hot' }"
          @click="goTab('hot')"
        >
          热榜
        </button>
        <button
          type="button"
          class="sub-tab"
          :class="{ on: innerTab === 'overview' }"
          @click="goTab('overview')"
        >
          全部技能
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
          type="button"
          class="sub-tab"
          :class="{ on: innerTab === 'ops' }"
          @click="goTab('ops')"
        >
          运营管理
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
          v-if="false && showAdminModules"
          type="button"
          class="sub-tab"
          :class="{ on: innerTab === 'approval' }"
          @click="goTab('approval')"
        >
          审核中心
        </button>
        <button
          v-if="showAdminModules"
          type="button"
          class="sub-tab"
          :class="{ on: innerTab === 'review' }"
          @click="goTab('review')"
        >
          评审中心
        </button>
        <button
          type="button"
          class="sub-tab"
          :class="{ on: innerTab === 'planning' }"
          @click="goTab('planning')"
        >
          Skill 规划
        </button>
      </nav>

      <!-- <span class="header-search header-search--placeholder" aria-hidden="true" /> -->
      <button type="button" class="top-publish-btn" style="margin-left: auto" @click="openUpload">
        <span class="top-publish-plus" aria-hidden="true">+</span>
        发布 Skill
      </button>
      <img
        src="/public/help.svg"
        alt="help"
        style="width: 20px; color: inherit; cursor: pointer"
        title="查看skill市场使用指导"
        @click="helpLink"
      />
    </header>

    <section v-if="innerTab === 'core'" class="hero">
      <div class="hero-inner">
        <h1 class="hero-title">探索原子能力，加速业务交付</h1>
        <p class="hero-desc">在 Skill 市场发现、共享和复用高质量工程资产，全面提升组织效能。</p>
      </div>
    </section>

    <div
      v-if="innerTab === 'hot'"
      ref="tabPanelRef"
      class="tabs-panel hot-panel"
      :style="tabPanelFillStyle"
    >
      <section class="hot-hero-simple">
        <h1>发现高价值 <span class="grad-text">Agent Skills</span>，让优秀能力被复用</h1>
        <p class="hero-desc">
          汇聚创作者打造的优秀 Skill，发现高人气、高质量、值得复用的 Top 能力作品。
        </p>
        <div class="market-stats-row" aria-label="热榜概览指标">
          <div class="market-stat-card">
            <div class="market-stat-icon skills" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 6.5h10M7 12h10M7 17.5h6"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                />
                <rect
                  x="4"
                  y="4"
                  width="16"
                  height="16"
                  rx="4"
                  stroke="currentColor"
                  stroke-width="1.8"
                  opacity=".28"
                />
              </svg>
            </div>
            <div class="market-stat-meta">
              <div class="market-stat-label">SKILL</div>
              <div class="market-stat-value">{{ hotMarketStatsByKey.skillCount.value }}</div>
            </div>
          </div>
          <div class="market-stat-card">
            <div class="market-stat-icon creators" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                  fill="currentColor"
                  opacity=".94"
                />
                <path
                  d="M4.5 18.2c0-2.4 2.2-4.2 5-4.2s5 1.8 5 4.2M13.5 18.2c.2-1.7 1.8-3.1 4-3.1 1 0 1.9.3 2.6.8"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <div class="market-stat-meta">
              <div class="market-stat-label">创作人数</div>
              <div class="market-stat-value">{{ hotMarketStatsByKey.creatorCount.value }}</div>
            </div>
          </div>
          <div class="market-stat-card">
            <div class="market-stat-icon calls" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 16.5h2.8l2-7 3.2 10 2.1-6H19"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="market-stat-meta">
              <div class="market-stat-label">调用数</div>
              <div class="market-stat-value">{{ hotMarketStatsByKey.callCount.value }}</div>
            </div>
          </div>
          <div class="market-stat-card">
            <div class="market-stat-icon downloads" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5.5v8.5M8.5 11.5 12 15l3.5-3.5M6 18.5h12"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="market-stat-meta">
              <div class="market-stat-label">下载数</div>
              <div class="market-stat-value">{{ hotMarketStatsByKey.downloadCount.value }}</div>
            </div>
          </div>
        </div>
      </section>

      <div class="hot-search-row" role="search">
        <label class="hot-search-box" aria-label="搜索热门 Skill">
          <span class="hot-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="10.8" cy="10.8" r="6.2" stroke="currentColor" stroke-width="2" />
              <path
                d="m15.4 15.4 4 4"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <input
            v-model="hotSearch"
            type="search"
            placeholder="搜索热门 Skill / 创建者 / 描述"
            @keydown.enter="onSearchHot"
            @input="onSearchHot"
          />
        </label>
        <button type="button" class="hot-search-more" @click="goTab('overview')">
          探索全部技能 <span aria-hidden="true">→</span>
        </button>
      </div>

      <section class="hot-skill-section" aria-label="热门 Skill">
        <div class="hot-section-title">
          <div>
            <h2>
              <span class="hot-title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 15.5 9.2 11l3 3L19 6.8"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M15.5 6.8H19v3.5"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <p>热门 Skill</p>
            </h2>
          </div>
          <span v-if="hotSkillsLoading" class="hot-loading">加载中…</span>
        </div>

        <div v-if="hotSkills.length > 0" class="hot-skill-grid">
          <SkillCard
            v-for="(s, index) in hotSkills"
            :key="s.id"
            :skill="s"
            class="market-skill-card"
            menu-mode="download-only"
            layout="overviewMarket"
            @download="onDownload(s.id, s.currentVersion)"
            @open-detail="openHotSkillDetail(s)"
            @update-skill-data="updateSkillData"
          />
        </div>
        <p v-else class="empty hot-empty">
          {{ hotSkillsLoading ? '热门 Skill 加载中…' : '暂无匹配的热门 Skill' }}
        </p>
      </section>
    </div>

    <div
      v-else-if="innerTab === 'overview'"
      ref="tabPanelRef"
      class="tabs-panel overview-panel"
      :style="tabPanelFillStyle"
    >
      <section>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div class="all-header-copy">
            <h1 class="all-title">全部技能</h1>
            <p class="all-desc">按部门、组织、业务维度和标签快速发现可复用 Skill</p>
          </div>
          <div class="all-header-art" aria-hidden="true">
            <span class="all-art-card all-art-card-blue">
              <i />
            </span>
            <span class="all-art-card all-art-card-yellow">
              <i />
              <i />
            </span>
          </div>
        </div>
      </section>

      <section class="all-dimension-strip" aria-label="业务维度筛选">
        <div ref="overviewDimensionRowRef" class="all-dimension-row">
          <div ref="overviewDimensionInlineRef" class="all-dimension-inline">
            <button
              type="button"
              class="all-category-chip"
              :class="{ active: categoryFilter === 'all' }"
              @click="setCategoryFilter('all')"
            >
              全部
            </button>
            <div
              v-for="dimension in businessDimensionOptions"
              :key="dimension.categoryId"
              class="all-dimension-item"
              @mouseenter="showBusinessDimensionPanel(dimension, $event)"
              @mouseleave="closeBusinessDimensionPanel"
            >
              <button
                type="button"
                class="all-category-chip"
                :class="{ active: categoryFilter === dimension.categoryName }"
                @click="onBusinessDimensionPrimaryClick(dimension, $event)"
              >
                {{ businessDimensionSelectedLabel(dimension) }}
                <span v-if="businessDimensionHasChildren(dimension)" class="all-category-arrow">
                  ▾
                </span>
              </button>
              <Teleport to="body">
                <div
                  v-if="businessDimensionPanelOpen(dimension)"
                  class="all-sub-dimension-panel"
                  :style="businessDimensionPanelStyle"
                  @mousedown.stop
                  @mouseenter="keepBusinessDimensionPanelOpen"
                  @mouseleave="closeBusinessDimensionPanel"
                >
                  <div class="all-sub-dimension-title">{{ dimension.categoryName }}</div>
                  <div class="all-sub-dimension-options">
                    <button
                      type="button"
                      class="all-sub-dimension-chip"
                      :class="{
                        active:
                          categoryFilter === dimension.categoryName && categorySubFilter === 'all',
                      }"
                      @click="selectBusinessDimensionChild(dimension, 'all')"
                    >
                      全部
                    </button>
                    <button
                      v-for="child in businessDimensionChildren(dimension)"
                      :key="`dimension-child-${dimension.categoryId}-${child.categoryId}`"
                      type="button"
                      class="all-sub-dimension-chip"
                      :class="{
                        active:
                          categoryFilter === dimension.categoryName &&
                          categorySubFilter === child.categoryName,
                      }"
                      @click="selectBusinessDimensionChild(dimension, child)"
                    >
                      {{ child.categoryName }}
                    </button>
                  </div>
                </div>
              </Teleport>
            </div>
            <span
              v-if="businessDimensionLoading && businessDimensionOptions.length === 0"
              class="side-empty"
            >
              加载中…
            </span>
          </div>
          <button
            v-if="overviewDimensionOverflow"
            type="button"
            class="all-dimension-more"
            :class="{ active: overviewDimensionMoreOpen }"
            aria-haspopup="true"
            :aria-expanded="overviewDimensionMoreOpen"
            @click.stop="toggleOverviewDimensionMore"
          >
            更多 <span aria-hidden="true">▾</span>
          </button>
        </div>

        <Teleport to="body">
          <div
            v-if="overviewDimensionMoreOpen"
            ref="overviewDimensionDropdownRef"
            class="all-dimension-dropdown"
            :style="overviewDimensionDropdownStyle"
            role="menu"
            aria-label="全部业务维度"
            @mousedown.stop
          >
            <button
              type="button"
              class="all-category-chip"
              :class="{ active: categoryFilter === 'all' }"
              role="menuitem"
              @click="setCategoryFilterFromDropdown('all')"
            >
              全部
            </button>
            <div
              v-for="dimension in businessDimensionOptions"
              :key="`dimension-menu-${dimension.categoryId}`"
              role="menuitem"
              class="all-dimension-item"
              @mouseenter="showBusinessDimensionPanel(dimension, $event)"
              @mouseleave="closeBusinessDimensionPanel"
            >
              <button
                type="button"
                class="all-category-chip"
                :class="{ active: categoryFilter === dimension.categoryName }"
                @click="onBusinessDimensionPrimaryClick(dimension, $event)"
              >
                {{ businessDimensionSelectedLabel(dimension) }}
                <span v-if="businessDimensionHasChildren(dimension)" class="all-category-arrow">
                  ▾
                </span>
              </button>
              <Teleport to="body">
                <div
                  v-if="businessDimensionPanelOpen(dimension)"
                  class="all-sub-dimension-panel all-sub-dimension-panel-menu"
                  :style="businessDimensionPanelStyle"
                  @mousedown.stop
                  @mouseenter="keepBusinessDimensionPanelOpen"
                  @mouseleave="closeBusinessDimensionPanel"
                >
                  <div class="all-sub-dimension-title">{{ dimension.categoryName }}</div>
                  <div class="all-sub-dimension-options">
                    <button
                      type="button"
                      class="all-sub-dimension-chip"
                      :class="{
                        active:
                          categoryFilter === dimension.categoryName && categorySubFilter === 'all',
                      }"
                      @click="selectBusinessDimensionChild(dimension, 'all')"
                    >
                      全部
                    </button>
                    <button
                      v-for="child in businessDimensionChildren(dimension)"
                      :key="`dimension-menu-child-${dimension.categoryId}-${child.categoryId}`"
                      type="button"
                      class="all-sub-dimension-chip"
                      :class="{
                        active:
                          categoryFilter === dimension.categoryName &&
                          categorySubFilter === child.categoryName,
                      }"
                      @click="selectBusinessDimensionChild(dimension, child)"
                    >
                      {{ child.categoryName }}
                    </button>
                  </div>
                </div>
              </Teleport>
            </div>
          </div>
        </Teleport>
      </section>

      <div class="all-search-strip all-header-controls">
        <label class="all-search-box" aria-label="搜索 Skill、作者、组织或业务">
          <span class="all-search-icon" aria-hidden="true">⌕</span>
          <input
            id="all-skill-search"
            v-model="search"
            type="search"
            placeholder="搜索名称 / 描述 / 创建者工号"
            @keydown.enter="onSearchKeyWord"
            @input="onSearchKeyWord"
          />
        </label>

        <section
          class="all-toolbar all-inline-toolbar"
          :class="{ 'has-org-filter': quickFilter === 'devDept' }"
          aria-label="全部技能筛选"
        >
          <div class="toolbar-group toolbar-dept-group">
            <span v-if="false" class="toolbar-label">部门</span>
            <MarketDeptCascader
              v-model="overviewMarketDeptSegments"
              class="all-dept-cascader"
              :tree="marketOverviewDeptTree"
              aria-label="部门级联筛选（departmentL1～L6）"
              @clear="clearOverviewDeptCascader"
              @done="deptFilterOnChange"
            />
          </div>

          <label class="toolbar-group toolbar-level-group">
            <span v-if="false" class="toolbar-label">Skill 级别</span>
            <select
              :value="quickFilter"
              class="all-select"
              aria-label="筛选 Skill 级别"
              @change="onOverviewLevelFilterChange"
            >
              <option value="all">全部级别</option>
              <option value="personal">个人级</option>
              <option value="devDept">组织级</option>
            </select>
          </label>

          <label v-if="false && quickFilter === 'devDept'" class="toolbar-group toolbar-org-group">
            <span class="toolbar-label">组织</span>
            <select
              v-model="levelFilter"
              class="all-select all-org-select"
              aria-label="筛选组织"
              @change="onOverviewOrgFilterChange"
            >
              <option value="all">全部组织</option>
              <template v-if="transportIsHttp">
                <option v-for="o in marketOrgSelectOptions" :key="o.id" :value="String(o.id)">
                  {{ o.orgName }}
                </option>
              </template>
              <template v-else>
                <option v-for="org in orgOptions" :key="org" :value="org">{{ org }}</option>
              </template>
            </select>
          </label>
        </section>

        <button
          type="button"
          class="all-advanced-toggle all-advanced-trigger"
          :class="{ active: overviewAdvancedOpen }"
          :aria-expanded="overviewAdvancedOpen"
          aria-controls="all-filter-panel"
          @click="toggleOverviewAdvancedPanel"
        >
          高级筛选 <span aria-hidden="true">⚙</span>
        </button>
      </div>

      <section
        v-if="overviewAdvancedOpen"
        id="all-filter-panel"
        class="all-filter-panel"
        aria-label="高级筛选面板"
      >
        <div class="all-filter-panel-head">
          <h2 class="all-filter-panel-title">高级筛选</h2>
          <button type="button" class="all-filter-panel-close" @click="toggleOverviewAdvancedPanel">
            关闭
          </button>
        </div>

        <section class="all-advanced open" aria-label="标签筛选">
          <div class="filter-line">
            <span class="filter-label">标签筛选</span>
            <div class="chips chips-tags is-expanded">
              <button
                v-for="tag in tagOptions"
                :key="tag"
                type="button"
                class="chip"
                :class="{ active: selectedTags.includes(tag) }"
                @click="toggleTagFilter(tag)"
              >
                {{ tag }}
              </button>
              <span v-if="tagOptions.length === 0" class="side-empty">暂无标签</span>
            </div>
            <div class="all-filter-actions">
              <button
                v-if="selectedTags.length > 0"
                type="button"
                class="tag-clear"
                @click="clearTagFilters"
              >
                清除标签
              </button>
            </div>
          </div>
        </section>
      </section>

      <section class="all-results market-content" aria-label="Skill 市场内容">
        <div class="market-sort-bar">
          <span class="market-filter-summary">{{ overviewFilterSummary }}</span>
          <div class="market-sort-actions" aria-label="市场排序">
            <button
              type="button"
              class="market-sort-btn"
              :class="{ active: overviewSort === 'time' }"
              @click="changeSort('time')"
            >
              最新上架
            </button>
            <button
              type="button"
              class="market-sort-btn"
              :class="{ active: overviewSort === 'downloads' }"
              @click="changeSort('downloads')"
            >
              最多使用
            </button>
            <button
              type="button"
              class="market-sort-btn"
              :class="{ active: overviewSort === 'rating' }"
              @click="changeSort('rating')"
            >
              最高评分
            </button>
          </div>
        </div>

        <div class="overview-list-footer" role="status">
          <span>{{ overviewListFooterHint }}</span>
        </div>
        <div ref="marketContentRef" class="market-list-scroll" @scroll="debounceScroll">
          <p
            v-if="transportIsHttp && overviewRemoteLoading && overviewRemoteItems.length === 0"
            class="empty overview-loading-hint"
          >
            正在从接口加载市场列表…
          </p>
          <template v-else-if="newSkills.length > 0">
            <div ref="overviewGridRef" class="grid">
              <SkillCard
                v-for="s in newSkills"
                :key="s.id"
                class="market-skill-card"
                :skill="s"
                menu-mode="download-only"
                layout="overviewMarket"
                @download="onDownload(s.id, s.currentVersion)"
                @open-detail="openDetailPanel"
                @view-versions="onViewVersions"
              />
            </div>
          </template>
          <p v-else class="empty">没有匹配的 Skill，可调整筛选条件。</p>
        </div>
      </section>
    </div>

    <div v-else-if="innerTab === 'core'" class="tabs-panel overview-panel core">
      <div class="core-alert" role="note" aria-label="CoreHarness 提示">
        <strong>CoreHarness</strong> 是独立资产产线，区分开发部级 / PDU /
        产品线三个层级。用户不能直接发布 CoreHarness，只能申请把自己的 Skill 转为
        CoreHarness；申请将到哪一级，就由哪一级管理员审核，审核通过后自动发布。
      </div>

      <div class="core-head">
        <div>
          <h2 class="panel-title">CoreHarness 列表</h2>
          <p class="panel-help">
            采用与市场总览一致的卡片形式展示，点击卡片可查看组成、来源 Skill 和发布说明。
          </p>
        </div>
        <button type="button" class="btn outline sm" @click="onApplyCoreHarness">
          申请转为 CoreHarness
        </button>
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
          @download="onDownload(s.id, s.currentVersion)"
          @view-versions="onViewVersions"
        />
      </div>
    </div>

    <div
      v-else-if="innerTab === 'releases'"
      ref="tabPanelRef"
      class="tabs-panel overview-panel my-release-panel"
      style="padding-top: 108px !important"
      :style="tabPanelFillStyle"
    >
      <section class="my-release-top">
        <div class="section-title mine-section-title">
          <div>
            <h1 style="font-size: 42px">我的发布</h1>
            <p class="all-desc">管理自己上传的 Skill，默认发布为个人级；可发起发布到组织级申请。</p>
          </div>
        </div>

        <div class="mine-top">
          <div class="soft-card mine-status-overview">
            <div class="section-title mine-card-head">
              <h3>发布状态概览</h3>
            </div>
            <div class="stat-grid">
              <div class="metric-card">
                <div class="metric-label">个人级</div>
                <div class="metric-value">
                  {{ myReleaseStatusStats.personal.toLocaleString('zh-CN') }}
                </div>
                <div class="metric-sub">无需审核，立即可用</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">组织审核中</div>
                <div class="metric-value">
                  {{ myReleaseStatusStats.reviewing.toLocaleString('zh-CN') }}
                </div>
                <div class="metric-sub">等待目标组织管理员处理</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">组织级</div>
                <div class="metric-value">
                  {{ myReleaseStatusStats.organization.toLocaleString('zh-CN') }}
                </div>
                <div class="metric-sub">已成为组织资产</div>
              </div>
            </div>
          </div>

          <div class="soft-card mine-flow-card">
            <h3>发布到组织级流程</h3>
            <div class="status-flow">
              <span class="flow-dot done">个人级发布</span>
              <span class="flow-arrow">→</span>
              <span class="flow-dot now">选择目标组织</span>
              <span class="flow-arrow">→</span>
              <span class="flow-dot">组织审核</span>
              <span class="flow-arrow">→</span>
              <span class="flow-dot">成为组织级 Skill</span>
            </div>
            <p class="muted mine-flow-note">被驳回时会在卡片中展示驳回原因，可修改后重新提交。</p>
          </div>
        </div>
      </section>

      <div class="my-release-body">
        <div class="my-toolbar">
          <div class="my-filters" role="tablist" aria-label="我的发布筛选">
            <button
              v-for="f in releaseFilters"
              :key="f.key"
              type="button"
              class="seg"
              :class="{ on: releaseFilter === f.key, 'seg-ai-evolution': f.key === 'aiEvolution' }"
              @click="onClickFilterRelease(f.key)"
            >
              {{ f.label }}
              <span
                v-if="f.key === 'aiEvolution' && aiEvolutionPendingCount > 0"
                class="seg-badge"
                >{{ aiEvolutionPendingCount }}</span
              >
            </button>
          </div>
        </div>

        <div v-if="releaseFilter === 'aiEvolution'" class="ai-evolution-intro" role="note">
          <div class="ai-evolution-intro-title">
            <span class="ai-evolution-tag">AI 自进化</span>
            <strong>后台自动生成的 Skill 版本，等待你的审批</strong>
          </div>
          <p class="ai-evolution-intro-desc">
            系统会基于运行数据自动产出 Skill 的优化版本。审批通过后将发布为个人级
            Skill，可在个人级页面查看；拒绝后将丢弃该候选版本。
          </p>
        </div>

        <div
          v-if="releaseFilter === 'aiEvolution'"
          class="table-wrap my-table-wrap ai-evolution-table-wrap"
        >
          <table class="table my-table ai-evolution-table">
            <thead>
              <tr>
                <th class="col-skill">Skill</th>
                <th class="col-session">Session ID</th>
                <th class="col-time">时间</th>
                <th>简介</th>
                <th class="col-ops ai-evo-col-ops">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in aiEvolutionSkills"
                :key="row.id"
                class="ai-evolution-row clickable-row"
                role="button"
                tabindex="0"
                @click="openAiEvolutionDetail(row)"
                @keydown.enter.prevent="openAiEvolutionDetail(row)"
              >
                <td>
                  <div class="skill-main">
                    <strong class="skill-name skill-name-link">{{ row.name }}</strong>
                  </div>
                </td>
                <td>
                  <div class="cell-main cell-main-plain ai-evolution-session">
                    {{ row.sessionId }}
                  </div>
                </td>
                <td>
                  <div class="cell-main cell-main-plain ai-evolution-time">
                    {{ row.generatedAt }}
                  </div>
                </td>
                <td>
                  <div class="ai-evolution-reason">{{ row.summary }}</div>
                </td>
                <td class="col-ops-td" @click.stop>
                  <div class="ops ai-evolution-ops">
                    <button
                      type="button"
                      class="ai-evo-btn ai-evo-approve-btn"
                      :disabled="row.status !== 'pending' || processingAiEvolutionId === row.id"
                      @click="approveAiEvolutionSkill(row)"
                    >
                      {{
                        row.status === 'approved'
                          ? '已通过'
                          : processingAiEvolutionId === row.id
                            ? '处理中…'
                            : '通过'
                      }}
                    </button>
                    <button
                      type="button"
                      class="ai-evo-btn ai-evo-reject-btn"
                      :disabled="row.status !== 'pending' || processingAiEvolutionId === row.id"
                      @click="rejectAiEvolutionSkill(row)"
                    >
                      {{ row.status === 'rejected' ? '已拒绝' : '拒绝' }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="aiEvolutionSkills.length === 0">
                <td colspan="5" class="empty-row">暂无待审批的自进化 Skill</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="table-wrap my-table-wrap" ref="myReleaseTableWrapRef">
          <table class="table my-table">
            <thead>
              <tr>
                <th class="col-skill">Skill</th>
                <th class="col-level">当前层级</th>
                <th class="col-ver">当前版本</th>
                <th class="col-status">状态</th>
                <th class="col-dl">下载量</th>
                <th class="col-ops">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in myPublishedSkills"
                :key="`${row.id}-${index}`"
                class="clickable-row my-release-data-row"
                role="button"
                tabindex="0"
                @click="openDetailFromMyRelease(row)"
                @keydown.enter.prevent="openDetailFromMyRelease(row)"
              >
                <td>
                  <div class="skill-main">
                    <strong class="skill-name skill-name-link">{{ row.name }}</strong>
                  </div>
                </td>
                <td>
                  <div class="cell-main cell-main-plain">{{ row.level }}</div>
                </td>
                <td>
                  <div class="cell-main cell-main-plain">{{ row.currentVersion }}</div>
                </td>
                <td>
                  <span class="st" :class="myPublishStatusPill(row).cls">{{
                    myPublishStatusPill(row).label
                  }}</span>
                </td>
                <td class="num">
                  {{ (row.totalDownloads ?? 0).toLocaleString('zh-CN') }}
                </td>
                <td class="col-ops-td" @click.stop>
                  <div class="ops my-release-ops">
                    <div class="my-rel-primary-wrap">
                      <span v-if="myPublishReleaseOp(row) === 'upgraded'" class="my-rel-upgraded"
                        >已升级</span
                      >
                      <button
                        v-else-if="myPublishReleaseOp(row) === 'upgrade'"
                        type="button"
                        class="btn primary sm my-rel-upgrade-btn"
                        disabled
                        title="建设中"
                      >
                        升级为组织级
                      </button>
                      <button v-else type="button" class="mini my-rel-pending-btn" disabled>
                        升级中
                      </button>
                    </div>
                    <button
                      type="button"
                      class="mini my-rel-delete-btn my-rel-delete-trigger"
                      :disabled="deletingMySkillId === String(row.id)"
                      @click.stop="openDeleteConfirm(row, $event)"
                    >
                      {{ deletingMySkillId === String(row.id) ? '删除中…' : '删除' }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="myPublishedSkills.length === 0">
                <td colspan="6" class="empty-row">暂无符合条件的数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      v-else-if="innerTab === 'org'"
      ref="tabPanelRef"
      class="tabs-panel overview-panel admin-org-panel"
      :style="tabPanelFillStyle"
      style="padding-top: 108px !important"
    >
      <header class="admin-panel-head management-panel-head">
        <div>
          <h2 class="panel-title" style="font-size: 42px">组织管理</h2>
          <p class="all-desc">
            配置组织名称、组织 ID 与组织管理员。配置在组织管理员名单内的用户，即拥有本 Skill
            市场的管理员角色。
          </p>
        </div>
        <button v-if="canCreateOrg" type="button" class="btn primary" @click="openOrgCreateModal">
          新建组织
        </button>
      </header>
      <div class="admin-panel-body">
        <div class="summary-strip admin-summary" role="group" aria-label="组织摘要">
          <span class="summary-item"
            >组织 <b>{{ adminOrganizations.length }}</b></span
          >
          <span class="summary-item"
            >组织管理员账号 <b>{{ orgDistinctAdminCount }}</b></span
          >
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
                  <span class="adm-badge" :class="org.enabled === 1 ? 'on' : 'off'">{{
                    org.enabled === 1 ? '启用' : '停用'
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
      v-else-if="false && innerTab === 'approval'"
      ref="tabPanelRef"
      class="tabs-panel overview-panel admin-approval-panel"
      style="padding-top: 108px !important"
      :style="tabPanelFillStyle"
    >
      <header class="admin-panel-head management-panel-head">
        <div>
          <h2 class="panel-title" style="font-size: 42px">审核中心</h2>
          <p class="all-desc">
            个人级同步到组织级时，由目标组织的组织管理员审核。审核中心区分待审核和已完成。
          </p>
        </div>
      </header>
      <div class="admin-panel-body">
        <div class="summary-strip approval-summary" role="group" aria-label="审核摘要">
          <span class="summary-item"
            >待审核 <b>{{ syncPendingRows.length }}</b></span
          >
          <span class="summary-item"
            >已完成 <b>{{ syncDoneRows.length }}</b></span
          >
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
                    :class="
                      row.reviewResult === '通过'
                        ? 'ok'
                        : row.reviewResult === '不通过'
                          ? 'bad'
                          : ''
                    "
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
      <header class="ops-title management-panel-head">
        <div>
          <h2 style="font-size: 42px">运营管理</h2>
          <p class="all-desc">
            围绕作业流 Skill 运行数据，持续沉淀个人级优秀 Skill, 识别并孵化组织级高价值 Skill
          </p>
        </div>
        <div class="ops-filter">
          <div
            v-if="false"
            class="ops-toggle ops-system-toggle"
            role="tablist"
            aria-label="运营管理系统切换"
          >
            <button
              type="button"
              class="ops-system-btn"
              data-system="fuyao"
              role="tab"
              :class="{ active: opsBoardSystem === 'fuyao' }"
              :aria-selected="opsBoardSystem === 'fuyao'"
              @click="changeSystem('fuyao')"
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
              @click="changeSystem('company')"
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
              aria-label="选择运营管理 Excel 文件"
              @change="onOpsExcelFileChange"
            />
            <button
              v-if="false"
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

      <section class="ops-dashboard-card ops-dashboard" aria-label="Skill 运营管理">
        <div class="ops-kpis" role="group" aria-label="运营管理指标">
          <div v-for="card in opsKpiCards" :key="card.label" class="ops-kpi">
            <small>{{ card.label }}</small>
            <strong>{{ formatOpsNumber(card.value) }}</strong>
            <span>{{ card.desc }}</span>
          </div>
        </div>

        <section class="ops-dimension-filter" aria-label="业务维度筛选">
          <div class="ops-dimension-filter-head">
            <div>
              <h3>业务场景</h3>
              <p>{{ selectedOpsBusinessDimensionLabel }}</p>
            </div>
            <div class="ops-dimension-head-actions">
              <div class="ops-dept-level-tabs" role="tablist" aria-label="部门 Skill 级别筛选">
                <button
                  v-for="tab in opsDeptSkillLevelTabs"
                  :key="tab.key"
                  type="button"
                  class="ops-dept-level-tab"
                  role="tab"
                  :class="{ active: opsDeptSkillLevelFilter === tab.key }"
                  :aria-selected="opsDeptSkillLevelFilter === tab.key"
                  @click="changeSkillLevel(tab.key)"
                >
                  {{ tab.label }}
                </button>
              </div>
              <button
                v-if="selectedOpsBusinessDimension"
                type="button"
                class="ops-dimension-clear"
                @click="clearOpsBusinessDimension"
              >
                清空
              </button>
            </div>
          </div>
          <div class="ops-dimension-scroll" :style="opsDimensionScrollStyle">
            <div v-if="businessDimensionLoading" class="ops-dimension-loading">业务维度加载中…</div>
            <div v-else class="ops-dimension-forest">
              <div
                v-for="dimension in businessDimensionOptions"
                :key="businessDimensionKey(dimension)"
                class="ops-dimension-branch"
              >
                <button
                  type="button"
                  class="ops-dimension-node ops-dimension-node-root"
                  :class="{ active: isOpsBusinessDimensionSelected(dimension) }"
                  :title="dimension.categoryName"
                  @click="selectOpsBusinessDimension(dimension)"
                >
                  {{ dimension.categoryName }}
                  <span style="font-size: 12px; font-weight: normal"
                    >({{ dimension.totalCount ?? 0 }})</span
                  >
                </button>
                <div
                  v-if="businessDimensionChildren(dimension).length"
                  class="ops-dimension-children"
                >
                  <div
                    v-for="child in businessDimensionChildren(dimension)"
                    :key="businessDimensionKey(child)"
                    class="ops-dimension-child"
                  >
                    <button
                      type="button"
                      class="ops-dimension-node"
                      :class="{ active: isOpsBusinessDimensionSelected(child) }"
                      :title="`${dimension.categoryName} / ${child.categoryName}`"
                      @click="selectOpsBusinessDimension(child, dimension)"
                    >
                      {{ child.categoryName }}
                      <span style="font-size: 12px; font-weight: normal"
                        >({{ child.totalCount ?? 0 }})</span
                      >
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="ops-dimension-resize-handle"
            :class="{ active: opsDimensionResizing }"
            aria-label="拖拽调整业务场景树高度，双击恢复默认高度"
            title="拖拽调整高度，双击恢复默认高度"
            @pointerdown="startOpsDimensionResize"
            @dblclick="resetOpsDimensionHeight"
          >
            <span aria-hidden="true" />
          </button>
        </section>

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
                  <div v-for="(row, index) in uiDeptFlat" :key="row.path" class="ops-tree-item">
                    <button
                      type="button"
                      class="ops-tree-node"
                      :class="[
                        { active: selectedOpsDeptPath === row.path },
                        'lv' + (row.levelNo > 6 ? 6 : row.levelNo),
                      ]"
                      :aria-pressed="selectedOpsDeptPath === row.path"
                      @click="selectOpsDept(row.path, index)"
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
                      <span class="ops-tree-download"
                        >{{ formatOpsNumber(row.downloads) }}下载</span
                      >
                    </button>
                  </div>
                </div>
              </section>

              <section class="ops-card ops-detail-table-card">
                <div class="ops-skill-table ops-dept-skill-table">
                  <div
                    v-if="opsDeptSkillRowsLoading"
                    class="ops-empty-state ops-detail-empty-state"
                  >
                    <strong>Skill 明细加载中…</strong>
                    <span>{{ selectedOpsBusinessDimensionLabel }}</span>
                  </div>
                  <div
                    v-else-if="!selectedDeptSkillRows?.length"
                    class="ops-empty-state ops-detail-empty-state"
                  >
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
                          <th class="col-desc">
                            <span class="cell-ellipsis" title="描述">描述</span>
                          </th>
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
                              <span
                                v-if="idx < 3"
                                class="dept-rank-flame"
                                :class="`rank-${idx + 1}`"
                                aria-hidden="true"
                              >
                                <span class="dept-rank-flame-core" />
                              </span>
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
              </section>
            </div>

            <div
              v-if="false && uiOrgBarsSorted.length"
              class="ops-pair-row org-row"
              :class="{ 'org-row-empty': uiOrgBarsSorted.length === 0 }"
            >
              <section class="ops-card">
                <div class="ops-card-head">
                  <div>
                    <h3>组织级 Skill 分布详情</h3>
                    <p>{{ opsOrgBarsHelpText }}</p>
                  </div>
                </div>
                <div v-if="uiOrgBarsSorted.length === 0" class="ops-org-empty-panel">
                  <strong>暂无组织级应用</strong>
                </div>
                <div v-else class="ops-card-body">
                  <div class="ops-org-bars" role="list" aria-label="组织级 Skill 分布">
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

              <section v-if="uiOrgBarsSorted.length > 0" class="ops-card ops-detail-table-card">
                <div class="ops-skill-table ops-org-skill-table">
                  <div
                    v-if="selectedOrgSkillRows.length === 0"
                    class="ops-empty-state ops-detail-empty-state"
                  >
                    <strong>暂无组织级 Skill 明细</strong>
                    <span>选择有数据的组织条目后，将展示该组织级 Skill 列表。</span>
                  </div>
                  <div v-else class="ops-skill-table-wrap" style="height: 393px">
                    <table class="table ops-detail-table">
                      <thead>
                        <tr>
                          <th class="col-name sticky-name">
                            <span class="cell-ellipsis" title="Skill 名称">Skill 名称</span>
                          </th>
                          <th class="col-desc">
                            <span class="cell-ellipsis" title="描述">描述</span>
                          </th>
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
                              <span
                                v-if="idx < 3"
                                class="dept-rank-flame"
                                :class="`rank-${idx + 1}`"
                                aria-hidden="true"
                              >
                                <span class="dept-rank-flame-core" />
                              </span>
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
              </section>
            </div>

            <section class="ops-card ops-top-card">
              <div class="ops-card-head">
                <div>
                  <h3>{{ opsTopTitle }}</h3>
                  <p>{{ opsTopSubTitle }}</p>
                </div>
              </div>
              <div class="ops-top-list" role="list">
                <div v-if="uiTopSkillsByDl.length === 0" class="ops-empty-state ops-top-empty">
                  <strong>{{ opsEmptyText }}</strong>
                  <span>暂无下载排行数据。</span>
                </div>
                <div
                  v-for="(item, idx) in uiTopSkillsByDl"
                  :key="`${item.rank}-${item.name}-${item.downloads}`"
                  class="ops-top-item"
                  role="listitem"
                >
                  <div class="ops-rank-wrap">
                    <span
                      v-if="idx < 3"
                      class="dept-rank-flame"
                      :class="`rank-${idx + 1}`"
                      aria-hidden="true"
                    >
                      <span class="dept-rank-flame-core" />
                    </span>
                    <div class="ops-rank">{{ item.rank }}</div>
                  </div>
                  <div>
                    <b>{{ item.name }}</b>
                    <small :title="item.dept">{{ opsSkillOwner(item) }} · {{ item.dept }}</small>
                  </div>
                  <div class="ops-download">{{ formatOpsNumber(item.downloads) }}</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="innerTab === 'review'" class="tabs-panel overview-panel review-panel">
      <ReviewCenterPage :userId="userId" :department-tree="marketOverviewDeptTree" />
    </div>

    <div
      v-else-if="innerTab === 'planning'"
      ref="tabPanelRef"
      class="panel tab-panel planning-panel"
      :style="tabPanelFillStyle"
    >
      <SkillPlanningPage :department-tree="marketOverviewDeptTree" />
    </div>

    <Teleport to="body">
      <div v-if="orgModalOpen" class="overlay" role="presentation" @click.self="closeOrgModal">
        <div
          class="v-dialog v-dialog-wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="org-modal-title"
        >
          <div class="v-head">
            <strong id="org-modal-title">{{
              orgModalMode === 'create' ? '新建组织' : '配置组织'
            }}</strong>
            <button type="button" class="close-x" aria-label="关闭" @click="closeOrgModal">
              ×
            </button>
          </div>
          <div class="admin-form">
            <label class="admin-field">
              <span>组织名称</span>
              <input
                v-model="orgForm.orgName"
                type="text"
                :disabled="orgModalMode === 'edit'"
                class="search"
                placeholder="例如：IT装备部"
              />
            </label>
            <label class="admin-field">
              <span>组织 ID</span>
              <input
                v-model="orgForm.orgCode"
                type="text"
                :disabled="orgModalMode === 'edit'"
                class="search"
                placeholder="例如：ORG-IT-001"
              />
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
      <div
        v-if="reviewModalOpen"
        class="overlay"
        role="presentation"
        @click.self="closeReviewModal"
      >
        <div
          class="v-dialog v-dialog-wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
        >
          <div class="v-head">
            <strong id="review-modal-title">审核同步申请</strong>
            <button type="button" class="close-x" aria-label="关闭" @click="closeReviewModal">
              ×
            </button>
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
            <button
              type="button"
              class="btn outline sm"
              :disabled="reviewSubmitting"
              @click="closeReviewModal"
            >
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

    <Teleport to="body">
      <div
        v-if="aiEvolutionConfirm"
        class="overlay"
        role="presentation"
        @click.self="closeAiEvolutionConfirm"
      >
        <div
          class="v-dialog ai-evo-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-evo-confirm-title"
        >
          <div class="v-head">
            <strong id="ai-evo-confirm-title">
              {{
                aiEvolutionConfirm.decision === 'approve'
                  ? '确认通过自进化审批'
                  : '确认拒绝自进化审批'
              }}
            </strong>
            <button
              type="button"
              class="close-x"
              aria-label="关闭"
              :disabled="!!processingAiEvolutionId"
              @click="closeAiEvolutionConfirm"
            >
              ×
            </button>
          </div>
          <p class="v-sub ai-evo-confirm-sub">
            {{ aiEvolutionConfirm.decision === 'approve' ? '通过后' : '拒绝后' }}
            「{{ aiEvolutionConfirm.row.name }}」
            <template v-if="aiEvolutionConfirm.decision === 'approve'">
              将发布为个人级 Skill，可在个人级页面查看，是否确认通过？
            </template>
            <template v-else> 的本次自进化候选版本将被丢弃，是否确认拒绝？ </template>
          </p>
          <div class="v-actions">
            <button
              type="button"
              class="btn outline sm"
              :disabled="!!processingAiEvolutionId"
              @click="closeAiEvolutionConfirm"
            >
              取消
            </button>
            <button
              type="button"
              class="btn sm"
              :class="aiEvolutionConfirm.decision === 'approve' ? 'primary' : 'danger'"
              :disabled="!!processingAiEvolutionId"
              @click="confirmAiEvolutionDecision"
            >
              {{
                processingAiEvolutionId
                  ? '处理中…'
                  : aiEvolutionConfirm.decision === 'approve'
                    ? '确认通过'
                    : '确认拒绝'
              }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped lang="scss">
@use '@/style/UserMarketShell.scss';
</style>
