<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SkillCard from '../../components/skill/SkillCard.vue';
import UploadSkillModal from '../../components/skill/UploadSkillModal.vue';
import { useSkillMarketStore } from '../../stores/skillMarketStore';
import type {
  OverviewQuickFilter,
  Skill,
  SkillMarketScope,
  SkillUploadPayload,
  UserInnerTab,
} from '../../types/skill';
import type { OpsDashboardBundle } from '../../utils/opsExcelImport';
import { buildOpsDashboardBundle, parseOpsExcelBuffer } from '../../utils/opsExcelImport';

const store = useSkillMarketStore();
const { skills, totalDownloads, totalSkills, downloadsLast30Days, orgCount } = store;
const route = useRoute();
const router = useRouter();

const OVERVIEW_DEFAULT_VISIBLE_ROWS = 3;
const OVERVIEW_MAX_PAGE_SIZE = 48;

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
const levelFilter = ref('all'); // publish_name（筛选组织）
const sceneFilter = ref('all'); // dept_name 层级（级联筛选：1~6）
const deptFilter = ref('all'); // 当前层级下的具体部门
const categoryFilter = ref('all');
const selectedTags = ref<string[]>([]);
const quickFilter = ref<OverviewQuickFilter>('all');
const tabPanelRef = ref<HTMLElement | null>(null);
const tabPanelMinHeight = ref(0);
const marketContentRef = ref<HTMLElement | null>(null);
const overviewGridRef = ref<HTMLElement | null>(null);
const page = ref(1);
const pageSize = ref(initialOverviewPageSize());
const toast = ref('');
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

function deptSegments(raw: string): string[] {
  return raw
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);
}

function deptAtLevel(skill: Skill, level: string): string {
  const n = Number(level);
  if (!Number.isFinite(n) || n <= 0) {
    return '';
  }
  const segs = deptSegments(skill.dept_name ?? '');
  return segs[n - 1] ?? '';
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
  return levelFilter.value === 'all' || (skill.publish_name ?? '').trim() === levelFilter.value;
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
  return selectedTags.value.every((tag) => tags.includes(tag));
}

function matchesDeptLevelFilter(skill: Skill): boolean {
  if (sceneFilter.value === 'all') {
    return true;
  }
  return Boolean(deptAtLevel(skill, sceneFilter.value));
}

function matchesSpecificDeptFilter(skill: Skill): boolean {
  return deptFilter.value === 'all' || deptAtLevel(skill, sceneFilter.value) === deptFilter.value;
}

function matchesPrimaryFilters(skill: Skill, q: string, scope: SkillMarketScope): boolean {
  return (
    matchesScopeFilter(skill, scope) &&
    matchesKeyword(skill, q) &&
    matchesOrgFilter(skill) &&
    matchesCategoryFilter(skill) &&
    matchesDeptLevelFilter(skill)
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
      const pagerHeight = content.querySelector<HTMLElement>('.pager')?.offsetHeight ?? 0;
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
        plannedContentHeight - filtersHeight - filtersMarginBottom - pagerHeight,
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
  const opts = new Set<string>();
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
  } else {
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

watch(
  () => filteredSkills.value.length,
  () => {
    syncOverviewPageSize();
  },
  { flush: 'post' },
);

watch(
  () => listResponse.value.totalPages,
  (totalPages) => {
    if (page.value > totalPages) {
      page.value = totalPages;
    }
  },
);

watch(
  () => skills.value.length,
  () => {
    syncOverviewPageSize();
  },
);

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

watch(
  () => route.query.tab,
  (tab) => {
    const nextTab = routeTabFromQuery(tab);
    if (nextTab !== innerTab.value) {
      innerTab.value = nextTab;
    }
  },
);

watch(innerTab, () => {
  syncTabPanelMinHeight();
});

function showToast(message: string, ms = 3000): void {
  toast.value = message;
  setTimeout(() => {
    toast.value = '';
  }, ms);
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
  const deptParts = deptSegments(skill.dept_name ?? '');
  return [skill.tagFunctional, skill.skill_id, deptParts[deptParts.length - 1]]
    .filter(Boolean)
    .join(' ');
}

function onUploadSubmit(payload: SkillUploadPayload): void {
  try {
    const result = store.uploadSkill(payload);
    page.value = 1;
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

function onDownload(id: string): void {
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
  onDownload(skillKey(detailPanelSkill.value));
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

function prevPage(): void {
  page.value = Math.max(1, page.value - 1);
}

function nextPage(): void {
  page.value = Math.min(listResponse.value.totalPages, page.value + 1);
}

// 为贴近 UI 设计稿：我的发布指标按稿面数值
const uiMyStats = {
  maintained: '8',
  reviewing: '3',
  rejected: '1',
  myTotalDownloads: '1,278',
  my30DaysDownloads: '326',
} as const;

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

type ReleaseStatusKey = 'published' | 'reviewing-dev' | 'rejected-pdu';

function statusOf(skill: Skill): ReleaseStatusKey {
  if (skill.id === '2') {
    return 'rejected-pdu';
  }
  if (skill.id === '4') {
    return 'reviewing-dev';
  }
  return 'published';
}

function statusText(st: ReleaseStatusKey): string {
  if (st === 'published') {
    return '组织级';
  }
  if (st === 'reviewing-dev') {
    return '组织审核中';
  }
  return '组织已驳回';
}

function lastActionText(st: ReleaseStatusKey): string {
  if (st === 'published') {
    return '已同步至公司组织';
  }
  if (st === 'reviewing-dev') {
    return '等待目标组织管理员审核';
  }
  return '需补充复现数据和说明文档';
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

const myReleaseRows = computed(() => {
  const list = myReleases.value.length > 0 ? myReleases.value : skills.value.slice(0, 4);
  return list.map((s) => {
    const st = statusOf(s);
    const isPersonal =
      (s.publish_level ?? s.level ?? '').includes('个人') || (s.dept_name ?? s.tagOrg ?? '').includes('个人');
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

const uiOpsKpiDesc = {
  totalSkills: '部门 Skill 分布总量',
  activeSkills: '公司市场组织级 Skill 数量',
  personalSkills: '个人发布的 Skill 数量',
  totalDownloads: '部门维度累计下载 Skill 数量',
} as const;

type DeptTreeNode = {
  name: string;
  skills: number;
  downloads: number;
  children?: DeptTreeNode[];
};

const defaultUiDeptTree: DeptTreeNode[] = [
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

type OrgBarRow = { name: string; skills: number; downloads: number };

type DeptMetricRow = OrgBarRow & { label: string; parent: string };

function collectDeptMetricRows(
  nodes: DeptTreeNode[],
  parentPath = '',
  out: DeptMetricRow[] = [],
): DeptMetricRow[] {
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

function buildDefaultOpsKpi(nodes: DeptTreeNode[]): OpsDashboardBundle['kpi'] {
  const totalSkills = nodes.reduce((sum, node) => sum + node.skills, 0);
  const totalDownloads = nodes.reduce((sum, node) => sum + node.downloads, 0);
  return {
    totalSkills: String(totalSkills),
    activeSkills: String(totalSkills),
    personalSkills: '0',
    totalDownloads: String(totalDownloads),
  };
}

function buildDefaultOrgBars(nodes: DeptTreeNode[]): OrgBarRow[] {
  return collectDeptMetricRows(nodes).map(({ name, skills, downloads }) => ({
    name,
    skills,
    downloads,
  }));
}

function buildDefaultTopDeptRows(nodes: DeptTreeNode[]): OpsDashboardBundle['topSkills'] {
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

const opsBarMode = ref<'skills' | 'downloads'>('skills');
const opsBoardSystem = ref<'fuyao' | 'company'>('company');

const uiDeptTree = computed(() =>
  opsImportedBundle.value ? opsImportedBundle.value.deptTree : defaultUiDeptTree,
);

const uiOpsKpi = computed(() =>
  opsImportedBundle.value ? opsImportedBundle.value.kpi : defaultOpsKpi,
);

const uiOrgBars = computed(() =>
  opsImportedBundle.value ? opsImportedBundle.value.orgBars : defaultUiOrgBars,
);

const uiOrgBarsSorted = computed(() => {
  const list = [...uiOrgBars.value];
  if (opsBarMode.value === 'skills') {
    return list.sort((a, b) => b.skills - a.skills || b.downloads - a.downloads);
  }
  return list.sort((a, b) => b.downloads - a.downloads || b.skills - a.skills);
});

const visibleOrgBars = computed(() => uiOrgBarsSorted.value.slice(0, 8));

function orgBarLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  const parts = trimmed.split('/');
  return parts[parts.length - 1]?.trim() || trimmed;
}

function estimateOrgBarLabelWidth(label: string): number {
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

function minDeptLabel(name: string): string {
  return orgBarLabel(name);
}

const uiOrgBarsMax = computed(() => {
  const list = uiOrgBarsSorted.value.map((x: OrgBarRow) =>
    opsBarMode.value === 'skills' ? x.skills : x.downloads,
  );
  return Math.max(1, ...list);
});

const uiTopSkillsByDl = computed(() =>
  opsImportedBundle.value
    ? opsImportedBundle.value.topSkills
    : defaultUiTopDeptRows,
);

const opsTopTitle = computed(() =>
  opsImportedBundle.value ? 'TOP Skill（按下载量）' : 'TOP 部门（按下载量）',
);

const opsTopSubTitle = computed(() =>
  opsImportedBundle.value
    ? '展示当前查询范围内下载量最高的Skill'
    : '展示默认部门树中下载量最高的部门节点',
);

type FlatDeptRow = { name: string; skills: number; downloads: number; depth: number };

type FlatDeptRowV2 = FlatDeptRow & { path: string; hasChildren: boolean; expanded: boolean };

const expandedDeptPaths = ref<Set<string>>(new Set());

function collectExpandableDeptPaths(
  nodes: DeptTreeNode[],
  parentPath = '',
  out = new Set<string>(),
): Set<string> {
  for (const n of nodes) {
    const path = parentPath ? `${parentPath}/${n.name}` : n.name;
    if (n.children && n.children.length > 0) {
      out.add(path);
      collectExpandableDeptPaths(n.children, path, out);
    }
  }
  return out;
}

watch(
  uiDeptTree,
  (tree) => {
    expandedDeptPaths.value = collectExpandableDeptPaths(tree);
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

function flattenDeptTreeVisible(
  nodes: DeptTreeNode[],
  depth = 0,
  parentPath = '',
): FlatDeptRowV2[] {
  const out: FlatDeptRowV2[] = [];
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
      out.push(...flattenDeptTreeVisible(n.children!, depth + 1, path));
    }
  }
  return out;
}

const uiDeptFlat = computed(() => flattenDeptTreeVisible(uiDeptTree.value));

function buildOpsDeptTreeJsonFileName(sourceName: string): string {
  const baseName = sourceName.replace(/\.[^.]+$/, '').trim() || 'ops-dept-tree';
  return `${baseName}-dept-tree.json`;
}

function downloadOpsDeptTreeJson(sourceName: string, deptTree: DeptTreeNode[]): void {
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
    opsImportedBundle.value = bundle;
    downloadOpsDeptTreeJson(file.name, bundle.deptTree);
    showToast(`已导入 ${rows.length} 条 Skill，运营看板已更新，部门树 JSON 已下载`);
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
<!-- 
    <section class="panel two-col">
      <div>
        <h2>我的发布</h2>
        <p v-if="myReleases.length === 0" class="muted">上传后会出现在这里。</p>
        <ul v-else class="plain-list">
          <li v-for="skill in myReleases" :key="skill.id">
            <strong>{{ skill.name }}</strong>
            <span>v{{ skill.version }} · {{ skill.latestPublishTime }}</span>
          </li>
        </ul>
      </div>
      <div>
        <h2>TOP 使用 Skill</h2>
        <ul class="plain-list">
          <li v-for="skill in topSkills" :key="skill.id">
            <strong>{{ skill.name ?? skill.skill_id }}</strong>
            <span>{{ (skill.download_count ?? skill.downloads ?? 0).toLocaleString('zh-CN') }} 次下载</span>
          </li>
        </ul>
      </div>
    </section> -->

    <UploadSkillModal v-model="uploadOpen" @submit="onUploadSubmit" />

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
        <h1 class="hero-title">把你的日常作业经验沉淀成可复用的 Skill</h1>
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

    <nav class="sub-tabs" :class="{ 'ops-tabs': innerTab === 'ops' }" aria-label="市场分区">
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
          <div class="side-block">
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
        </aside>

        <div ref="marketContentRef" class="market-content">
          <div class="filters">
            <input
              v-model="search"
              class="search"
              type="search"
              placeholder="搜索 Skill 名称"
            />
            <select v-model="levelFilter" class="select">
              <option value="all">筛选组织</option>
              <option v-for="org in orgOptions" :key="org" :value="org">{{ org }}</option>
            </select>
            <div class="cascade-selects" aria-label="部门级联筛选">
              <select v-model="sceneFilter" class="select cascade-level">
                <option value="all">分层筛选部门</option>
                <option value="1">一级部门</option>
                <option value="2">二级部门</option>
                <option value="3">三级部门</option>
                <option value="4">四级部门</option>
                <option value="5">五级部门</option>
                <option value="6">六级部门</option>
              </select>
              <span class="cascade-arrow" aria-hidden="true">›</span>
              <select
                v-model="deptFilter"
                class="select cascade-dept"
                :disabled="sceneFilter === 'all' || deptOptions.length === 0"
              >
                <option value="all">
                  {{ sceneFilter === 'all' ? '先选择部门层级' : '选择具体部门' }}
                </option>
                <option v-for="d in deptOptions" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>
          </div>

          <div v-if="filteredSkills.length > 0" ref="overviewGridRef" class="grid">
            <SkillCard
              v-for="s in filteredSkills"
              :key="s.id ?? s.skill_id"
              class="market-skill-card"
              :skill="s"
              menu-mode="download-only"
              @download="onDownload"
              @open-detail="openDetailPanel"
              @view-versions="onViewVersions"
            />
          </div>
          <p v-else class="empty">没有匹配的 Skill，可调整筛选条件。</p>

          <div class="pager">
            <span>
              共 {{ listResponse.total }} 个 Skill · 第 {{ listResponse.page }} /
              {{ listResponse.totalPages }} 页
            </span>
            <div class="pager-actions">
              <button type="button" class="mini" :disabled="page <= 1" @click="prevPage">上一页</button>
              <button
                type="button"
                class="mini"
                :disabled="page >= listResponse.totalPages"
                @click="nextPage"
              >
                下一页
              </button>
            </div>
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
          @download="onDownload"
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
            <tr v-for="row in filteredMyReleaseRows" :key="row.skill.id">
              <td>
                <div class="skill-main">
                  <strong class="skill-name">{{ row.skill.name }}</strong>
                  <div class="skill-sub">
                    <span>维护方：{{ row.skill.publisher }}</span>
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
              <td class="num">{{ (row.skill.download_count ?? row.skill.downloads ?? 0).toLocaleString('zh-CN') }}</td>
              <td class="cell-sub">{{ row.lastAction }}</td>
              <td>
                <div class="ops">
                  <button type="button" class="mini" @click="toastAction('新版本（演示）：打开上传弹窗并追加版本')">
                    新版本
                  </button>
                  <button type="button" class="mini" @click="toastAction('升级（演示）：提交层级升级申请')">
                    同步至公司组织
                  </button>
                  <button type="button" class="mini" @click="toastAction('记录（演示）：打开操作记录面板')">
                    记录
                  </button>
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

    <div v-else class="panel tab-panel ops">
      <section class="ops-dashboard-card" aria-label="Skill 运营看板">
        <header class="ops-dash-top">
          <div class="ops-dash-heading">
            <h2 class="ops-dash-title">Skill 运营看板</h2>
            <p class="ops-dash-desc">
              扶摇系统侧关注个人级沉淀、快速验证和产线验证；公司系统侧关注目标系统统一管理的组织级 Skill。
            </p>
          </div>
          <div class="ops-dash-meta">
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
            <span class="ops-dash-note" :title="`统计至：${opsAsOfText}`">
              数据口径：T+1（统计数据延迟 1 天）
            </span>
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
              class="btn outline sm ops-import-btn"
              :disabled="opsImporting"
              @click="triggerOpsExcelImport"
            >
              {{ opsImporting ? '导入中…' : 'Excel 导入' }}
            </button>
          </div>
        </header>

        <div class="ops-kpi-grid" role="group" aria-label="运营看板指标">
          <div class="ops-kpi-card">
            <div class="ops-kpi-label">总 Skill 数</div>
            <div class="ops-kpi-value">{{ uiOpsKpi.totalSkills }}</div>
            <div class="ops-kpi-desc">{{ uiOpsKpiDesc.totalSkills }}</div>
          </div>
          <div class="ops-kpi-card">
            <div class="ops-kpi-label">组织级 Skill</div>
            <div class="ops-kpi-value">{{ uiOpsKpi.activeSkills }}</div>
            <div class="ops-kpi-desc">{{ uiOpsKpiDesc.activeSkills }}</div>
          </div>
          <div class="ops-kpi-card">
            <div class="ops-kpi-label">个人级 Skill</div>
            <div class="ops-kpi-value">{{ uiOpsKpi.personalSkills }}</div>
            <div class="ops-kpi-desc">{{ uiOpsKpiDesc.personalSkills }}</div>
          </div>
          <div class="ops-kpi-card">
            <div class="ops-kpi-label">累计下载量</div>
            <div class="ops-kpi-value">{{ uiOpsKpi.totalDownloads }}</div>
            <div class="ops-kpi-desc">{{ uiOpsKpiDesc.totalDownloads }}</div>
          </div>
        </div>

        <div class="ops-mid-2col">
          <section class="ops-panel-block">
            <div class="ops-panel-hd">
              <h3 class="ops-panel-title">部门 Skill 分布详情</h3>
              <p class="ops-panel-sub">展示了主要部门及各子部门在该平台上的 Skill 情况</p>
            </div>
            <div class="dept-tree-wrap">
              <div class="dept-tree-head">
                <span class="dt-col-name">部门名称</span>
                <span class="dt-col-num">Skill 数量</span>
                <span class="dt-col-num">下载次数</span>
              </div>
              <div class="dept-tree-body" role="list">
                <div
                  v-for="row in uiDeptFlat"
                  :key="row.path"
                  class="dept-tree-row"
                  :class="{ child: row.depth > 0 }"
                  role="listitem"
                  :style="{ paddingLeft: `${12 + row.depth * 20}px` }"
                >
                  <span class="dt-name">
                    <button
                      v-if="row.hasChildren"
                      type="button"
                      class="dt-toggle"
                      :aria-label="row.expanded ? '收起' : '展开'"
                      @click.stop="toggleDeptExpand(row.path)"
                    >
                      <span class="dt-caret" :class="{ on: row.expanded }" aria-hidden="true" />
                    </button>
                    <span v-else class="dt-toggle-spacer" aria-hidden="true" />
                    <span v-if="row.depth > 0" class="dt-bullet" aria-hidden="true">·</span>
                    {{ row.name }}
                  </span>
                  <span class="dt-skills">{{ row.skills }}个</span>
                  <span class="dt-dl">{{ row.downloads }}下载</span>
                </div>
              </div>
            </div>
          </section>

          <section class="ops-panel-block">
            <div class="ops-panel-hd ops-panel-hd-row">
              <div>
                <h3 class="ops-panel-title">组织级 Skill 分布详情</h3>
                <p class="ops-panel-sub">
                  {{
                    opsBarMode === 'skills'
                      ? '按 Skill 数量倒序展示公司市场组织级 Skill'
                      : '按下载量倒序展示公司市场组织级 Skill'
                  }}
                </p>
              </div>
              <div class="ops-toggle" role="group" aria-label="图表度量切换">
                <button
                  type="button"
                  class="ops-toggle-btn"
                  :class="{ on: opsBarMode === 'skills' }"
                  @click="opsBarMode = 'skills'"
                >
                  按数量
                </button>
                <button
                  type="button"
                  class="ops-toggle-btn"
                  :class="{ on: opsBarMode === 'downloads' }"
                  @click="opsBarMode = 'downloads'"
                >
                  按下载量
                </button>
              </div>
            </div>
            <div
              class="org-bar-list"
              role="list"
              aria-label="组织架构分布条形图"
              :style="{ '--org-bar-label-width': `${orgBarLabelColumnWidth}px` }"
            >
              <div v-for="row in visibleOrgBars" :key="row.name" class="org-bar-row" role="listitem">
                <div class="org-bar-label" :title="row.name">{{ orgBarLabel(row.name) }}</div>
                <div class="org-bar-track-wrap">
                  <div class="org-bar-track" aria-hidden="true">
                    <div
                      class="org-bar-fill"
                      :style="{
                        width: `${
                          ((opsBarMode === 'skills' ? row.skills : row.downloads) /
                            uiOrgBarsMax) *
                          100
                        }%`,
                      }"
                    />
                  </div>
                </div>
                <div class="org-bar-val">
                  {{
                    opsBarMode === 'skills'
                      ? `${row.skills}个`
                      : `${row.downloads}下载`
                  }}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section class="ops-top-section">
          <div class="ops-panel-hd">
            <h3 class="ops-panel-title">{{ opsTopTitle }}</h3>
            <p class="ops-panel-sub">{{ opsTopSubTitle }}</p>
          </div>
          <ul class="ops-top-list" role="list">
            <li
              v-for="item in uiTopSkillsByDl"
              :key="`${item.rank}-${item.name}-${item.downloads}`"
              class="ops-top-row"
              role="listitem"
            >
              <span class="ops-top-rank">{{ item.rank }}</span>
              <div class="ops-top-main">
                <strong class="ops-top-name">{{ item.name }}</strong>
                <span class="ops-top-dept" :title="item.dept">{{ minDeptLabel(item.dept) }}</span>
              </div>
              <span class="ops-top-dl">{{ item.downloads }}</span>
            </li>
          </ul>
        </section>
      </section>
    </div>

    <UploadSkillModal v-model="uploadOpen" @submit="onUploadSubmit" />

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
  grid-template-columns: minmax(300px, 1.25fr) 200px minmax(380px, 0.95fr);
  gap: 12px;
  margin-bottom: 14px;
  align-items: center;
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

.cascade-selects {
  display: grid;
  grid-template-columns: minmax(144px, 1fr) 24px minmax(160px, 1.1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
}

.cascade-selects .select {
  width: 100%;
  min-width: 0;
  height: 42px;
  border-color: #dbe3ee;
  background-color: #fff;
}

.cascade-selects .select:focus {
  border-color: #1677ff;
}

.cascade-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #eaf2ff;
  color: #2563eb;
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
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

.overview-panel .pager {
  margin-top: auto;
  padding-top: 16px;
}

.my-release-panel .my-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
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

.my-release-panel .skill-name,
.my-release-panel .cell-main {
  color: #111827;
  font-weight: 700;
}

.my-release-panel .skill-sub,
.my-release-panel .cell-sub {
  color: #64748b;
}

.my-release-panel .st {
  border-radius: 6px;
  padding: 4px 8px;
  font-weight: 800;
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
}

@media (max-width: 1180px) {
  .overview-panel .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-panel .filters {
    grid-template-columns: 1fr 1fr;
  }

  .cascade-selects {
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

  .cascade-selects {
    grid-template-columns: 1fr;
  }

  .cascade-arrow {
    display: none;
  }
}
</style>
