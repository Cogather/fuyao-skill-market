<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const props = withDefaults(
  defineProps<{
    skill: Record<string, unknown>;
    fileTreeText: string;
    skillMdText: string;
    /** 为 false 时不展示删除（如从市场卡片进入） */
    showDelete?: boolean;
    deletingSkillId?: string | null;
    /** 仅展示文件树与 SKILL.md，隐藏下载/调测/删除/版本管理等操作（如版本列表「查看」） */
    previewOnly?: boolean;
    /** 自进化审批模式：隐藏版本/作者等标签 */
    aiEvolution?: boolean;
    /** dialog: 弹窗；page: 独立页面内联展示 */
    displayMode?: 'dialog' | 'page';
    closeText?: string;
    showTrySkill?: boolean;
    showDownload?: boolean;
  }>(),
  {
    showDelete: true,
    deletingSkillId: null,
    previewOnly: false,
    aiEvolution: false,
    displayMode: 'dialog',
    closeText: '',
    showTrySkill: true,
    showDownload: true,
  },
);

const emit = defineEmits<{
  close: [];
  trySkill: [];
  download: [];
  deleteClick: [evt: MouseEvent];
  versionManage: [];
  updateSkillData: [id: string, currentVersion: string];
}>();

const detailMoreWrapRef = ref<HTMLElement | null>(null);
const detailMoreMenuOpen = ref(false);
let detailMoreMenuListenersBound = false;
const isPageMode = computed(() => props.displayMode === 'page');
const detailTitle = computed(() =>
  String(props.skill?.name ?? props.skill?.skill_id ?? 'Skill').trim(),
);
const detailIcon = computed(() => {
  const icon = String(props.skill?.icon ?? '').trim();
  const source = icon || detailTitle.value;
  return Array.from(source)[0]?.toUpperCase() || 'S';
});
const detailDescription = computed(() => String(props.skill?.description ?? '').trim());
const detailRating = computed(() => {
  const raw = Number(props.skill?.rating);
  if (!Number.isFinite(raw) || raw <= 0) {
    return '';
  }
  return raw.toFixed(1).replace(/\.0$/, '');
});
const detailTags = computed(() => {
  const raw = props.skill?.tags;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(raw ?? '')
    .split(/[,\n，、|]/)
    .map((item) => item.trim())
    .filter(Boolean);
});
const detailBadges = computed(() => {
  const raw = props.skill?.qualityBadges;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(raw ?? '')
    .split(/[,\n，、|]/)
    .map((item) => item.trim())
    .filter(Boolean);
});
const showPageActionCard = computed(
  () =>
    !props.previewOnly &&
    (props.showTrySkill ||
      props.showDownload ||
      props.showDelete ||
      !props.aiEvolution),
);

type DetailContentTab = 'detail' | 'versions';
type DetailVersionSubTab = 'list' | 'compare';
type DetailVersionRow = {
  key: string;
  version: string;
  updatedAt: string;
  updatedAtLabel: string;
  level: string;
  description: string;
  creator: string;
  department: string;
  skillMdContent: string;
  fileTreeText: string;
  timeValue: number;
  index: number;
};
type DetailCompareFileStatus = 'added' | 'deleted' | 'modified' | 'unchanged';
type DetailCompareFile = {
  key: string;
  path: string;
  name: string;
  status: DetailCompareFileStatus;
  content: string;
  oldContent: string;
};
type DetailCompareLine = {
  key: string;
  oldLineNumber: number | string;
  newLineNumber: number | string;
  text: string;
  status: DetailCompareFileStatus | 'normal';
};

const detailContentTab = ref<DetailContentTab>('detail');
const detailVersionSubTab = ref<DetailVersionSubTab>('list');
const detailVersionExpandedMap = ref<Record<string, boolean>>({});
const detailCompareVersionKey = ref('');
const detailCompareFileIndex = ref(0);
const detailCompareFileMenuOpen = ref(false);

function isDetailRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readDetailString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined) {
      const text = String(value).trim();
      if (text) {
        return text;
      }
    }
  }
  return '';
}

function detailVersionTimeValue(value: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value.replace(/-/g, '/'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDetailVersionDate(value: string): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value.replace(/-/g, '/'));
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function normalizeDetailFileTreeText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join('\n');
  }
  return String(value ?? '').trim();
}

const detailVersionRows = computed<DetailVersionRow[]>(() => {
  const candidates = [
    props.skill?.versions,
    props.skill?.versionHistory,
    props.skill?.versionList,
    props.skill?.versionDetails,
  ];
  const sourceList = candidates.find((item): item is unknown[] => Array.isArray(item)) ?? [];
  const skillLevel = readDetailString(props.skill, ['level', 'status']);
  const skillCreator = readDetailString(props.skill, ['createdBy', 'author', 'publisher']);

  return sourceList
    .map((item, index) => {
      const record = isDetailRecord(item) ? item : {};
      const updatedAt = readDetailString(record, [
        'updatedAt',
        'lastUpdatedAt',
        'createdAt',
        'publishTime',
        'releasedAt',
      ]);
      const version = readDetailString(record, ['version', 'currentVersion']);
      const description = readDetailString(record, [
        'description',
        'versionDescription',
        'releaseNote',
        'releaseNotes',
        'changeLog',
        'changelog',
        'remark',
        'summary',
        'note',
      ]);

      return {
        key: String(version || 'version') + '-' + String(updatedAt || index),
        version,
        updatedAt,
        updatedAtLabel: formatDetailVersionDate(updatedAt),
        level: readDetailString(record, ['level', 'status']) || skillLevel,
        description,
        creator:
          readDetailString(record, ['createdBy', 'creator', 'author', 'publisher']) || skillCreator,
        department: readDetailString(record, [
          'department',
          'deptName',
          'team',
          'orgName',
          'organization',
          'organizationName',
          'publishName',
          'publish_name',
        ]),
        skillMdContent: readDetailString(record, [
          'skillMdContent',
          'skillMdText',
          'skillMd',
          'markdown',
        ]),
        fileTreeText: normalizeDetailFileTreeText(
          record.fileTree ?? record.fileTreeText ?? record.fileTreePaths,
        ),
        timeValue: detailVersionTimeValue(updatedAt),
        index,
      };
    })
    .sort((a, b) => b.timeValue - a.timeValue || a.index - b.index);
});

function changeDetailContentTab(tab: DetailContentTab): void {
  detailContentTab.value = tab;
}

function changeDetailVersionSubTab(tab: DetailVersionSubTab): void {
  detailVersionSubTab.value = tab;
}

function detailVersionOwnerText(row: DetailVersionRow): string {
  return [row.creator, row.department].filter(Boolean).join('    ') || '-';
}

function isDetailVersionExpanded(row: DetailVersionRow, index: number): boolean {
  return detailVersionExpandedMap.value[row.key] ?? index === 0;
}

function toggleDetailVersion(row: DetailVersionRow, index: number): void {
  detailVersionExpandedMap.value = {
    ...detailVersionExpandedMap.value,
    [row.key]: !isDetailVersionExpanded(row, index),
  };
}

type DetailFileTreeRow = {
  key: string;
  label: string;
  path: string;
  depth: number;
  isDirectory: boolean;
  displayText: string;
};

const selectedDetailFilePath = ref('');

function parseDetailFileTreeLine(
  line: string,
  index: number,
  stack: string[],
): DetailFileTreeRow | null {
  const raw = String(line ?? '');
  if (!raw.trim()) {
    return null;
  }

  let depth = 0;
  let offset = 0;
  while (raw.slice(offset, offset + 3) === '   ' || raw.slice(offset, offset + 3) === '│  ') {
    depth += 1;
    offset += 3;
  }

  const labelWithMarker = raw
    .slice(offset)
    .replace(/^[├└][─\s]*/u, '')
    .trim();
  const label = labelWithMarker || raw.trim();
  const isDirectory = label.endsWith('/');
  const segment = label.replace(/\/$/, '');

  stack.length = depth;
  stack[depth] = segment;
  const path = stack.slice(0, depth + 1).join('/');

  return {
    key: `${index}-${path}`,
    label,
    path,
    depth,
    isDirectory,
    displayText: raw.trim(),
  };
}

function detailRowsFromFileTreeText(text: string): DetailFileTreeRow[] {
  const stack: string[] = [];
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line, index) => parseDetailFileTreeLine(line, index, stack))
    .filter((row): row is DetailFileTreeRow => Boolean(row));
}

const detailFileRows = computed(() => detailRowsFromFileTreeText(props.fileTreeText));

const defaultDetailFileRow = computed(() => {
  return (
    detailFileRows.value.find(
      (row) => !row.isDirectory && row.label.replace(/\/$/, '').toLowerCase() === 'skill.md',
    ) ??
    detailFileRows.value.find((row) => !row.isDirectory) ??
    null
  );
});

const selectedDetailFileRow = computed(() => {
  return (
    detailFileRows.value.find(
      (row) => !row.isDirectory && row.path === selectedDetailFilePath.value,
    ) ?? defaultDetailFileRow.value
  );
});

const selectedDetailFileContent = computed(() => {
  const selectedName = selectedDetailFileRow.value?.label.replace(/\/$/, '').toLowerCase();
  return selectedName === 'skill.md' ? props.skillMdText : '';
});

function detailVersionFileTreeText(row: DetailVersionRow | null, isLatest: boolean): string {
  return row?.fileTreeText || (isLatest ? props.fileTreeText : props.fileTreeText);
}

function detailVersionSkillMdText(row: DetailVersionRow | null, isLatest: boolean): string {
  return row?.skillMdContent || (isLatest ? props.skillMdText : props.skillMdText);
}

function detailCompareFileName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) || path || '-';
}

function detailCompareFileStatusLabel(status: DetailCompareFileStatus): string {
  const labels: Record<DetailCompareFileStatus, string> = {
    added: '新增',
    deleted: '删除',
    modified: '修改',
    unchanged: '未变',
  };
  return labels[status];
}

const detailCompareLatestVersion = computed(() => detailVersionRows.value[0] ?? null);
const detailCompareHistoryVersions = computed(() => detailVersionRows.value.slice(1));
const selectedDetailCompareVersion = computed(() => {
  return (
    detailCompareHistoryVersions.value.find((row) => row.key === detailCompareVersionKey.value) ??
    detailCompareHistoryVersions.value[0] ??
    null
  );
});
const detailCompareLatestVersionLabel = computed(
  () => detailCompareLatestVersion.value?.version || '-',
);
const detailCompareHistoryVersionLabel = computed(
  () => selectedDetailCompareVersion.value?.version || '-',
);
const detailCompareRelationLabel = computed(
  () => `${detailCompareHistoryVersionLabel.value} = ${detailCompareLatestVersionLabel.value}`,
);

function makeDetailCompareFile(
  path: string,
  status: DetailCompareFileStatus,
  latestContent: string,
  previousContent: string,
): DetailCompareFile {
  const name = detailCompareFileName(path);
  const lowerName = name.toLowerCase();
  const content =
    lowerName === 'skill.md' ? (status === 'deleted' ? previousContent : latestContent) : '';
  const oldContent = lowerName === 'skill.md' ? previousContent : '';

  return {
    key: path,
    path,
    name,
    status,
    content,
    oldContent,
  };
}

const detailCompareFiles = computed<DetailCompareFile[]>(() => {
  const latest = detailCompareLatestVersion.value;
  const previous = selectedDetailCompareVersion.value;
  if (!latest || !previous) {
    return [];
  }

  const latestRows = detailRowsFromFileTreeText(detailVersionFileTreeText(latest, true)).filter(
    (row) => !row.isDirectory,
  );
  const previousRows = detailRowsFromFileTreeText(
    detailVersionFileTreeText(previous, false),
  ).filter((row) => !row.isDirectory);
  const latestPaths = new Set(latestRows.map((row) => row.path));
  const previousPaths = new Set(previousRows.map((row) => row.path));
  const allPaths = Array.from(new Set([...latestPaths, ...previousPaths]));
  const latestSkillMd = detailVersionSkillMdText(latest, true);
  const previousSkillMd = detailVersionSkillMdText(previous, false);

  return allPaths.map((path) => {
    const inLatest = latestPaths.has(path);
    const inPrevious = previousPaths.has(path);
    let status: DetailCompareFileStatus = 'unchanged';
    if (inLatest && !inPrevious) {
      status = 'added';
    } else if (!inLatest && inPrevious) {
      status = 'deleted';
    } else if (
      detailCompareFileName(path).toLowerCase() === 'skill.md' &&
      latestSkillMd &&
      previousSkillMd &&
      latestSkillMd !== previousSkillMd
    ) {
      status = 'modified';
    }
    return makeDetailCompareFile(path, status, latestSkillMd, previousSkillMd);
  });
});

const detailCompareCurrentFileIndex = computed(() => {
  if (detailCompareFiles.value.length === 0) {
    return -1;
  }
  return Math.min(Math.max(detailCompareFileIndex.value, 0), detailCompareFiles.value.length - 1);
});
const detailCompareCurrentFile = computed(() => {
  const index = detailCompareCurrentFileIndex.value;
  return index >= 0 ? (detailCompareFiles.value[index] ?? null) : null;
});
const detailCompareFilePositionLabel = computed(() => {
  const total = detailCompareFiles.value.length;
  const index = detailCompareCurrentFileIndex.value;
  return total > 0 && index >= 0 ? `${index + 1} of ${total} files` : '0 of 0 files';
});
const detailCompareCanGoPrevious = computed(() => detailCompareCurrentFileIndex.value > 0);
const detailCompareCanGoNext = computed(
  () =>
    detailCompareCurrentFileIndex.value >= 0 &&
    detailCompareCurrentFileIndex.value < detailCompareFiles.value.length - 1,
);

const detailCompareStats = computed(() => {
  const files = detailCompareFiles.value;
  const count = (status: DetailCompareFileStatus) =>
    files.filter((file) => file.status === status).length;
  return [
    { key: 'added', label: '新增', count: count('added') },
    { key: 'deleted', label: '删除', count: count('deleted') },
    { key: 'modified', label: '修改', count: count('modified') },
    { key: 'unchanged', label: '未变', count: count('unchanged') },
  ];
});

const detailCompareCurrentFileLines = computed<DetailCompareLine[]>(() => {
  const file = detailCompareCurrentFile.value;
  if (!file) {
    return [];
  }

  const content = file.content || '暂无可预览内容';
  const oldLines = file.oldContent.split(/\r?\n/);
  return content.split(/\r?\n/).map((text, index) => {
    let status: DetailCompareLine['status'] = 'normal';
    if (file.status === 'added' || file.status === 'deleted') {
      status = file.status;
    } else if (file.status === 'modified' && oldLines[index] !== text) {
      status = 'modified';
    }
    return {
      key: `${file.key}-${index}`,
      oldLineNumber: file.status === 'added' ? '' : index + 1,
      newLineNumber: file.status === 'deleted' ? '' : index + 1,
      text,
      status,
    };
  });
});

function onDetailCompareVersionChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value ?? '';
  detailCompareVersionKey.value = value;
  detailCompareFileIndex.value = 0;
  detailCompareFileMenuOpen.value = false;
}

function changeDetailCompareFile(offset: number): void {
  const nextIndex = detailCompareCurrentFileIndex.value + offset;
  if (nextIndex < 0 || nextIndex >= detailCompareFiles.value.length) {
    return;
  }
  detailCompareFileIndex.value = nextIndex;
  detailCompareFileMenuOpen.value = false;
}

function toggleDetailCompareFileMenu(): void {
  if (detailCompareFiles.value.length === 0) {
    return;
  }
  detailCompareFileMenuOpen.value = !detailCompareFileMenuOpen.value;
}

function selectDetailCompareFile(index: number): void {
  detailCompareFileIndex.value = index;
  detailCompareFileMenuOpen.value = false;
}

function selectDetailFile(row: DetailFileTreeRow): void {
  if (row.isDirectory) {
    return;
  }
  selectedDetailFilePath.value = row.path;
}

function isDetailFileSelected(row: DetailFileTreeRow): boolean {
  return !row.isDirectory && selectedDetailFileRow.value?.path === row.path;
}

function skillScopeLabel(s: Record<string, unknown>): string {
  const level = String(s.publish_level ?? s.level ?? s.tagOrg ?? '').trim();
  if (level.includes('组织')) {
    const pn = String(s.publish_name ?? '').trim();
    return pn ? `组织级 · ${pn}` : '组织级';
  }
  if (level.includes('个人')) {
    return '个人级';
  }
  return level || '-';
}

function skillScopeClass(s: Record<string, unknown>): string {
  return skillScopeLabel(s).includes('组织') ? 'scope-org' : 'scope-personal';
}

function currentSkillId(): string {
  return String(props.skill?.id ?? props.skill?.skill_id ?? '');
}

function onDetailMoreDocDown(ev: MouseEvent): void {
  const wrap = detailMoreWrapRef.value;
  const t = ev.target as Node | null;
  if (!wrap || !t || wrap.contains(t)) {
    return;
  }
  closeDetailMoreMenu();
}

function removeDetailMoreMenuListeners(): void {
  if (!detailMoreMenuListenersBound) {
    return;
  }
  detailMoreMenuListenersBound = false;
  document.removeEventListener('mousedown', onDetailMoreDocDown, true);
}

function closeDetailMoreMenu(): void {
  detailMoreMenuOpen.value = false;
  removeDetailMoreMenuListeners();
}

function toggleDetailMoreMenu(): void {
  detailMoreMenuOpen.value = !detailMoreMenuOpen.value;
  if (detailMoreMenuOpen.value) {
    void nextTick(() => {
      if (!detailMoreMenuOpen.value || detailMoreMenuListenersBound) {
        return;
      }
      detailMoreMenuListenersBound = true;
      document.addEventListener('mousedown', onDetailMoreDocDown, true);
    });
  } else {
    removeDetailMoreMenuListeners();
  }
}

function onVersionMenuClick(): void {
  closeDetailMoreMenu();
  emit('versionManage');
}

function onShellClick(): void {
  if (!isPageMode.value) {
    emit('close');
  }
}
// 调测
const goToDebugPage = (skill) => {
  router.push({
    name: 'skill-debug',
    query: { id: currentSkillId(), skillName: skill.name },
  });
};
const updateSkill = async (skill) => {
  try {
    await emit('updateSkillData', skill.id, skill.currentVersion);
    goToDebugPage(skill);
  } catch (err) {
    console.error(err);
  }
};
onBeforeUnmount(() => {
  removeDetailMoreMenuListeners();
});
</script>

<template>
  <Teleport to="body" :disabled="isPageMode">
    <div
      :class="[
        isPageMode ? 'detail-page-shell' : 'overlay detail-overlay',
        { 'detail-overlay--stacked': previewOnly && !isPageMode },
      ]"
      :role="isPageMode ? undefined : 'presentation'"
      @click.self="onShellClick"
    >
      <section
        class="skill-detail-dialog"
        :class="{ 'skill-detail-dialog--page': isPageMode }"
        :role="isPageMode ? 'region' : 'dialog'"
        :aria-modal="isPageMode ? undefined : 'true'"
        aria-labelledby="skill-detail-title"
      >
        <header class="detail-head">
          <nav v-if="isPageMode" class="detail-breadcrumb" aria-label="Skill 返回导航">
            <button type="button" class="detail-breadcrumb-back" @click="emit('close')">
              <span class="detail-breadcrumb-arrow" aria-hidden="true">←</span>
              <span>技能</span>
            </button>
            <span class="detail-breadcrumb-separator" aria-hidden="true">/</span>
            <span class="detail-breadcrumb-current">{{ detailTitle }}</span>
          </nav>
          <div class="detail-title-wrap">
            <div v-if="isPageMode" class="detail-hero-icon" aria-hidden="true">
              {{ detailIcon }}
            </div>
            <div class="detail-title-copy">
              <h2 id="skill-detail-title">
                {{
                  isPageMode ? detailTitle : previewOnly ? 'Skill 详情 · 版本预览' : 'Skill 详情'
                }}
              </h2>
              <p v-if="isPageMode && detailDescription" class="detail-description">
                {{ detailDescription }}
              </p>
            </div>
          </div>
          <button v-if="!isPageMode" type="button" class="detail-close" @click="emit('close')">
            {{ closeText || '关闭' }}
          </button>
        </header>

        <div class="detail-toolbar">
          <div class="detail-tags">
            <span v-if="!previewOnly" class="detail-pill pill-category">{{
              skill.categoryGroupName
            }}</span>
            <span v-if="isPageMode && detailRating" class="detail-pill"
              >{{ detailRating }} 评分</span
            >
            <template v-if="isPageMode">
              <span v-for="badge in detailBadges" :key="`badge-${badge}`" class="detail-pill">
                {{ badge }}
              </span>
              <span v-for="tag in detailTags" :key="`tag-${tag}`" class="detail-pill">
                {{ tag }}
              </span>
            </template>

            <span v-if="!isPageMode" class="detail-pill pill-id">{{ skill.name }}</span>
            <span v-if="!aiEvolution" class="detail-pill"
              >版本 {{ skill.currentVersion ?? skill.version }}</span
            >
            <span v-if="!previewOnly && !aiEvolution" class="detail-pill"
              >作者 {{ skill.author }}</span
            >
            <span v-if="!previewOnly" class="detail-pill" :class="skillScopeClass(skill)">
              {{ skill.level }}
            </span>
            <span v-if="!previewOnly" class="detail-download">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 4v12m0 0 4-4m-4 4-4-4M5 20h14"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              {{ skill.totalDownloads }}
            </span>
          </div>
          <div v-if="isPageMode ? showPageActionCard : !previewOnly" class="detail-actions">
            <button
              v-if="showTrySkill"
              type="button"
              class="detail-btn ghost"
              @click="updateSkill(skill)"
            >
              在线调测
            </button>
            <button
              v-if="showDownload"
              type="button"
              class="detail-btn primary"
              @click="emit('download')"
            >
              下载到本地
            </button>
            <button
              v-if="showDelete"
              type="button"
              class="detail-btn danger detail-delete-trigger"
              :disabled="deletingSkillId !== null && deletingSkillId === currentSkillId()"
              @click="emit('deleteClick', $event)"
            >
              {{ deletingSkillId === currentSkillId() ? '删除中…' : '删除' }}
            </button>
            <div
              v-if="!aiEvolution"
              ref="detailMoreWrapRef"
              class="detail-more-wrap"
            >
              <button
                type="button"
                class="detail-btn detail-more-trigger"
                aria-haspopup="menu"
                :aria-expanded="detailMoreMenuOpen"
                aria-label="更多操作"
                @click.stop="toggleDetailMoreMenu"
              >
                <span class="detail-more-dots" aria-hidden="true">···</span>
              </button>
              <div v-show="detailMoreMenuOpen" class="detail-more-menu" role="menu" @click.stop>
                <button
                  type="button"
                  class="detail-more-item"
                  role="menuitem"
                  @click="onVersionMenuClick"
                >
                  版本管理
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="isPageMode"
          class="detail-page-tabs"
          role="tablist"
          aria-label="Skill detail sections"
        >
          <button
            type="button"
            class="detail-page-tab"
            :class="{ active: detailContentTab === 'detail' }"
            role="tab"
            :aria-selected="detailContentTab === 'detail'"
            @click="changeDetailContentTab('detail')"
          >
            详情
          </button>
          <button
            type="button"
            class="detail-page-tab"
            :class="{ active: detailContentTab === 'versions' }"
            role="tab"
            :aria-selected="detailContentTab === 'versions'"
            @click="changeDetailContentTab('versions')"
          >
            版本
          </button>
        </div>

        <div class="detail-main">
          <section
            v-if="isPageMode && detailContentTab === 'detail'"
            class="detail-file-panel detail-file-panel--browser"
          >
            <div class="detail-panel-title">文件结构</div>
            <div class="detail-file-browser">
              <div class="detail-file-tree-pane" aria-label="文件树">
                <div v-if="detailFileRows.length === 0" class="detail-file-tree-empty">
                  暂无文件结构
                </div>
                <div
                  v-for="row in detailFileRows"
                  :key="row.key"
                  class="detail-file-tree-row"
                  :class="{
                    'is-directory': row.isDirectory,
                    'is-file': !row.isDirectory,
                    'is-selected': isDetailFileSelected(row),
                  }"
                  :style="{ paddingLeft: `${16 + row.depth * 18}px` }"
                  @click="selectDetailFile(row)"
                >
                  {{ row.displayText }}
                </div>
              </div>
              <article class="detail-file-content-pane">
                <pre v-if="selectedDetailFileContent">{{ selectedDetailFileContent }}</pre>
                <div v-else class="detail-file-content-empty">暂无可预览内容</div>
              </article>
            </div>
          </section>
          <section v-else-if="isPageMode" class="detail-version-panel">
            <div class="detail-version-subtabs" role="tablist" aria-label="版本内容">
              <button
                type="button"
                class="detail-version-subtab"
                :class="{ active: detailVersionSubTab === 'list' }"
                role="tab"
                :aria-selected="detailVersionSubTab === 'list'"
                @click="changeDetailVersionSubTab('list')"
              >
                版本列表
              </button>
              <button
                type="button"
                class="detail-version-subtab"
                :class="{ active: detailVersionSubTab === 'compare' }"
                role="tab"
                :aria-selected="detailVersionSubTab === 'compare'"
                @click="changeDetailVersionSubTab('compare')"
              >
                版本对比
              </button>
            </div>

            <template v-if="detailVersionSubTab === 'list'">
              <div v-if="detailVersionRows.length === 0" class="detail-version-empty">
                暂无版本历史
              </div>
              <ol v-else class="detail-version-timeline">
                <li
                  v-for="(versionItem, versionIndex) in detailVersionRows"
                  :key="versionItem.key"
                  class="detail-version-timeline-item"
                  :class="{
                    'is-latest': versionIndex === 0,
                    'is-expanded': isDetailVersionExpanded(versionItem, versionIndex),
                  }"
                >
                  <span class="detail-version-marker" aria-hidden="true"></span>
                  <article class="detail-version-node">
                    <div class="detail-version-row">
                      <div class="detail-version-content">
                        <div class="detail-version-title-row">
                          <strong class="detail-version-number">{{
                            versionItem.version || '-'
                          }}</strong>
                          <span v-if="versionIndex === 0" class="detail-version-latest">最新</span>
                          <span class="detail-version-level">{{ versionItem.level || '-' }}</span>
                        </div>
                        <div
                          v-if="isDetailVersionExpanded(versionItem, versionIndex)"
                          class="detail-version-extra"
                        >
                          <p class="detail-version-desc">{{ versionItem.description || '-' }}</p>
                          <p class="detail-version-owner">
                            {{ detailVersionOwnerText(versionItem) }}
                          </p>
                        </div>
                      </div>
                      <div class="detail-version-side">
                        <time class="detail-version-date">{{
                          versionItem.updatedAtLabel || versionItem.updatedAt || '-'
                        }}</time>
                        <button
                          type="button"
                          class="detail-version-toggle"
                          :aria-expanded="isDetailVersionExpanded(versionItem, versionIndex)"
                          @click="toggleDetailVersion(versionItem, versionIndex)"
                        >
                          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path
                              d="m4 6 4 4 4-4"
                              stroke="currentColor"
                              stroke-width="1.6"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </article>
                </li>
              </ol>
            </template>
            <div v-else class="detail-compare-panel">
              <div class="detail-compare-version-row">
                <div class="detail-compare-version-field">
                  <span class="detail-compare-version-label">最新版本</span>
                  <strong class="detail-compare-version-value">
                    {{ detailCompareLatestVersionLabel }}
                  </strong>
                </div>
                <label class="detail-compare-version-field">
                  <span class="detail-compare-version-label">往期版本</span>
                  <span class="detail-compare-select-wrap">
                    <select
                      class="detail-compare-version-select"
                      :value="selectedDetailCompareVersion?.key || ''"
                      @change="onDetailCompareVersionChange"
                    >
                      <option v-if="detailCompareHistoryVersions.length === 0" value="">
                        暂无历史版本
                      </option>
                      <option
                        v-for="versionItem in detailCompareHistoryVersions"
                        :key="versionItem.key"
                        :value="versionItem.key"
                      >
                        {{ versionItem.version || '-' }}
                      </option>
                    </select>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="m4 6 4 4 4-4"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </span>
                </label>
              </div>

              <div class="detail-compare-stats">
                <article
                  v-for="stat in detailCompareStats"
                  :key="stat.key"
                  class="detail-compare-stat"
                  :class="'is-' + stat.key"
                >
                  <strong>{{ stat.count }}</strong>
                  <span>{{ stat.label }}</span>
                </article>
              </div>

              <div class="detail-compare-file-switch">
                <button
                  type="button"
                  class="detail-compare-file-arrow"
                  :disabled="!detailCompareCanGoPrevious"
                  aria-label="Previous file"
                  @click="changeDetailCompareFile(-1)"
                >
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="m10 4-4 4 4 4"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <div class="detail-compare-file-picker" @click.stop>
                  <button
                    type="button"
                    class="detail-compare-file-current"
                    :disabled="detailCompareFiles.length === 0"
                    @click="toggleDetailCompareFileMenu"
                  >
                    <span
                      v-if="detailCompareCurrentFile"
                      class="detail-compare-file-status"
                      :class="'is-' + detailCompareCurrentFile.status"
                    >
                      {{ detailCompareFileStatusLabel(detailCompareCurrentFile.status) }}
                    </span>
                    <span class="detail-compare-file-name">
                      {{ detailCompareCurrentFile?.name || '-' }}
                    </span>
                    <span class="detail-compare-file-count">
                      {{ detailCompareFilePositionLabel }}
                    </span>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="m4 6 4 4 4-4"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                  <div v-if="detailCompareFileMenuOpen" class="detail-compare-file-menu">
                    <button
                      v-for="(fileItem, fileIndex) in detailCompareFiles"
                      :key="fileItem.key"
                      type="button"
                      class="detail-compare-file-option"
                      :class="{ active: fileIndex === detailCompareCurrentFileIndex }"
                      @click="selectDetailCompareFile(fileIndex)"
                    >
                      <span class="detail-compare-file-status" :class="'is-' + fileItem.status">
                        {{ detailCompareFileStatusLabel(fileItem.status) }}
                      </span>
                      <span>{{ fileItem.name }}</span>
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  class="detail-compare-file-arrow"
                  :disabled="!detailCompareCanGoNext"
                  aria-label="Next file"
                  @click="changeDetailCompareFile(1)"
                >
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="m6 4 4 4-4 4"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <section class="detail-compare-content">
                <header class="detail-compare-content-head">
                  <strong>文件内容</strong>
                  <span>{{ detailCompareRelationLabel }}</span>
                </header>
                <div class="detail-compare-code-wrap">
                  <div v-if="!detailCompareCurrentFile" class="detail-version-empty">
                    暂无可对比文件
                  </div>
                  <div v-else class="detail-compare-code">
                    <div
                      v-for="line in detailCompareCurrentFileLines"
                      :key="line.key"
                      class="detail-compare-code-line"
                      :class="'is-' + line.status"
                    >
                      <span class="detail-compare-line-number">{{ line.oldLineNumber }}</span>
                      <span class="detail-compare-line-number">{{ line.newLineNumber }}</span>
                      <code>{{ line.text || ' ' }}</code>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </section>
          <template v-else>
            <aside class="detail-file-panel">
              <div class="detail-panel-title">文件结构</div>
              <pre>{{ fileTreeText }}</pre>
            </aside>
            <article class="detail-md-panel">
              <div class="detail-panel-title">SKILL.md</div>
              <div class="detail-md-body">
                <h3>{{ skill.name }} Skill</h3>
                <pre>{{ skillMdText }}</pre>
              </div>
            </article>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
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

.detail-overlay.detail-overlay--stacked {
  z-index: 960;
}

.skill-detail-dialog {
  width: min(67%, calc(100vw - 48px));
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

.detail-btn.ghost {
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

.detail-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  pointer-events: auto;
}

.detail-btn.ghost:disabled:hover {
  color: #2563eb;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.detail-close:hover,
.detail-btn.ghost:hover:not(:disabled) {
  color: #1d4ed8;
  border-color: #93c5fd;
  background: #dbeafe;
}

.detail-btn.danger {
  background: #fff;
  color: #dc2626;
  border-color: #fecaca;
}

.detail-btn.danger:hover {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.detail-more-wrap {
  position: relative;
  flex-shrink: 0;
}

.detail-more-trigger {
  min-width: 38px;
  padding: 0 10px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.detail-more-dots {
  display: inline-block;
  transform: translateY(-1px);
  font-size: 15px;
  line-height: 1;
}

.detail-more-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 132px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
  z-index: 20;
}

.detail-more-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 6px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 650;
  color: #0f172a;
  background: #f8fafc;
  cursor: pointer;
}

.detail-more-item:hover {
  background: #f1f5f9;
  color: #0f172a;
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
  color: #2f7df6;
  background: #eef6ff;
  border-color: #d8eaff;
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
  overflow: auto;
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

@media (max-width: 820px) {
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

  .detail-actions {
    width: 100%;
  }

  .detail-more-wrap {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .detail-btn {
    flex: 1;
  }

  .detail-main {
    overflow: auto;
  }
}

/* Prototype-aligned dialog polish */
.overlay,
.detail-overlay {
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(8px);
}

.skill-detail-dialog {
  border: 1px solid rgba(232, 236, 245, 0.92);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(251, 252, 255, 0.98)), #ffffff;
  box-shadow: 0 28px 70px rgba(22, 34, 51, 0.18);
}

.detail-head {
  padding: 18px 24px;
  border-bottom-color: #e9edf3;
  background: linear-gradient(180deg, rgba(120, 98, 255, 0.08), rgba(255, 255, 255, 0));
}

.detail-head h2 {
  color: #15171d;
  font-weight: 900;
  letter-spacing: 0;
}

.detail-close,
.detail-btn {
  min-height: 38px;
  border-color: #e9edf3;
  border-radius: 999px;
  background: #ffffff;
  color: #373b45;
  font-weight: 850;
  box-shadow: 0 8px 18px rgba(12, 20, 35, 0.05);
}

.detail-close:hover,
.detail-btn.ghost:hover:not(:disabled) {
  color: #2f7df6;
  border-color: #cfd7e6;
  background: #fbfcff;
}

.detail-btn.ghost {
  color: #2f7df6;
  background: #eef6ff;
  border-color: #d8eaff;
}

.detail-btn.primary {
  background: #1d1d1f;
  border-color: #1d1d1f;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
}

.detail-btn.primary:hover {
  background: #111111;
  border-color: #111111;
  transform: translateY(-1px);
}

.detail-btn.danger {
  color: #c33d3d;
  background: #fff2f2;
  border-color: #ffd8d8;
}

.detail-more-menu {
  border-color: #e9edf3;
  border-radius: 8px;
  box-shadow: 0 16px 42px rgba(22, 34, 51, 0.14);
}

.detail-more-item {
  border-radius: 8px;
  background: #ffffff;
  font-weight: 800;
}

.detail-more-item:hover {
  color: #2f7df6;
  background: #eef6ff;
}

.detail-toolbar {
  padding: 18px 24px 14px;
}

.detail-pill {
  min-height: 26px;
  border-radius: 999px;
  background: #f5f7fb;
  border-color: #edf0f5;
  color: #6b7280;
  font-weight: 800;
}

.detail-pill.pill-category,
.detail-pill.pill-id {
  color: #2f7df6;
  background: #eef6ff;
  border-color: #d8eaff;
}

.detail-pill.scope-org {
  color: #19905b;
  background: #effaf4;
  border-color: #d8f0e3;
}

.detail-pill.scope-personal {
  color: #2f7df6;
  background: #eef6ff;
  border-color: #d8eaff;
}

.detail-file-panel,
.detail-md-panel {
  border-color: #e9edf3;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 24px rgba(22, 34, 51, 0.05);
}

.detail-panel-title {
  background: #f8fafc;
  border-bottom-color: #e9edf3;
  color: #475569;
  font-weight: 900;
}

.detail-md-body h3 {
  color: #15171d;
  font-weight: 900;
  letter-spacing: 0;
}
.detail-page-shell {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  box-sizing: border-box;
}

.detail-page-shell .skill-detail-dialog {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: none;
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.skill-detail-dialog--page {
  border-radius: 0;
}

.skill-detail-dialog--page .detail-main {
  flex: 1;
  min-height: 0;
  padding-bottom: 24px;
}

.detail-breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.4;
}

.detail-breadcrumb-back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}

.detail-breadcrumb-arrow {
  line-height: 1;
}

.detail-breadcrumb-separator {
  color: inherit;
}

.detail-breadcrumb-current {
  min-width: 0;
  color: #64748b;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.detail-title-copy {
  min-width: 0;
}

.detail-description {
  margin: 10px 0 0;
  max-width: 760px;
  color: #475569;
  font-size: 13px;
  line-height: 1.65;
  font-weight: 500;
}

.skill-detail-dialog--page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  align-content: stretch;
  align-items: start;
  column-gap: clamp(32px, 4vw, 72px);
  row-gap: 0;
  padding: 36px clamp(24px, 4vw, 80px) 24px;
  overflow: auto;
  background: #ffffff;
}

.skill-detail-dialog--page .detail-head {
  grid-column: 1;
  grid-row: 1;
  flex-direction: column;
  justify-content: flex-start;
  gap: 22px;
  padding: 0;
  border-bottom: 0;
  background: transparent;
  align-items: flex-start;
}

.skill-detail-dialog--page .detail-title-wrap {
  align-items: flex-start;
  gap: 20px;
}

.detail-hero-icon {
  width: 60px;
  height: 60px;
  padding: 10px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #eef6ff;
  color: #2f7df6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
}

.skill-detail-dialog--page .detail-toolbar {
  display: contents;
  padding: 0;
}

.skill-detail-dialog--page .detail-tags {
  grid-column: 1;
  grid-row: 2;
  align-items: center;
  margin-top: 14px;
}

.skill-detail-dialog--page .detail-actions {
  grid-column: 2;
  grid-row: 1 / span 2;
  justify-self: end;
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.skill-detail-dialog--page .detail-actions .detail-btn {
  width: auto;
  min-width: 160px;
  justify-content: center;
  padding-inline: 28px;
}

.skill-detail-dialog--page .detail-actions .detail-more-wrap,
.skill-detail-dialog--page .detail-actions .detail-more-trigger {
  width: auto;
}

.detail-page-tabs {
  grid-column: 1 / -1;
  grid-row: 3;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 56px;
  margin-top: 54px;
  border-bottom: 1px solid #e5e7eb;
}

.detail-page-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #475569;
  font-family: inherit;
  font-size: 14px;
  font-weight: 850;
  cursor: pointer;
}

.detail-page-tab.active {
  color: #15171d;
}

.detail-page-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  border-radius: 999px;
  background: #15171d;
}

.skill-detail-dialog--page .detail-main {
  grid-column: 1 / -1;
  grid-row: 4;
  align-self: stretch;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 0;
  margin-top: 34px;
  padding: 0;
  overflow: visible;
}

.skill-detail-dialog--page .detail-md-panel {
  order: 1;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.skill-detail-dialog--page .detail-file-panel {
  order: initial;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.detail-file-panel--browser {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 340px);
  min-height: 0;
}

.detail-file-browser {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.detail-file-tree-pane {
  min-height: 0;
  padding: 14px 0;
  border-right: 1px solid #e9edf3;
  overflow: auto;
}

.detail-file-tree-row {
  min-height: 26px;
  display: flex;
  align-items: center;
  padding: 4px 14px;
  color: #334155;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
}

.detail-file-tree-row.is-file {
  cursor: pointer;
}

.detail-file-tree-row.is-file:hover {
  background: #f8fafc;
}

.detail-file-tree-row.is-selected {
  background: #eef6ff;
  color: #1d4ed8;
  box-shadow: inset 3px 0 0 #2f7df6;
}

.detail-file-content-pane {
  min-width: 0;
  min-height: 0;
  padding: 16px 18px;
  overflow: auto;
  color: #334155;
  font-size: 13px;
  line-height: 1.58;
}

.detail-file-content-pane pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: inherit;
  font: inherit;
}

.detail-file-tree-empty,
.detail-file-content-empty {
  padding: 14px 16px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.5;
}

.skill-detail-dialog--page .detail-md-panel > .detail-panel-title {
  display: none;
}

.skill-detail-dialog--page .detail-md-body {
  padding: 0;
  overflow: visible;
}

.skill-detail-dialog--page .detail-md-body h3 {
  margin-bottom: 22px;
}

.skill-detail-dialog--page .detail-md-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: inherit;
  font: inherit;
}

.detail-version-panel {
  width: 100%;
}

.detail-version-subtabs {
  display: flex;
  align-items: center;
  gap: 40px;
  margin-bottom: 28px;
}

.detail-version-subtab {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #64748b;
  font-family: inherit;
  font-size: 14px;
  font-weight: 850;
  cursor: pointer;
}

.detail-version-subtab.active {
  color: #15171d;
}

.detail-version-subtab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 999px;
  background: #15171d;
}

.detail-version-timeline {
  position: relative;
  width: calc(100vw - 160px);
  margin: 0;
  padding: 0 0 0 34px;
  list-style: none;
}

.detail-version-timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 14px;
  bottom: 30px;
  width: 1px;
  background: #e5e7eb;
}

.detail-version-timeline-item {
  position: relative;
  min-width: 0;
  padding-bottom: 32px;
}

.detail-version-timeline-item:last-child {
  padding-bottom: 0;
}

.detail-version-marker {
  position: absolute;
  left: -34px;
  top: 7px;
  z-index: 1;
  width: 10px;
  height: 10px;
  border: 2px solid #d1d5db;
  border-radius: 999px;
  background: #ffffff;
}

.detail-version-timeline-item.is-latest .detail-version-marker {
  border-color: #1f1f23;
  background: #1f1f23;
}

.detail-version-node {
  min-width: 0;
}

.detail-version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 24px;
}

.detail-version-content {
  min-width: 0;
}

.detail-version-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 24px;
}

.detail-version-number {
  color: #15171d;
  font-weight: 900;
}

.detail-version-latest {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  background: #1f1f23;
  color: #ffffff;
  font-size: 12px;
  font-weight: 850;
}

.detail-version-level {
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #e4d7ff;
  border-radius: 999px;
  color: #7c3aed;
  background: #f5f0ff;
  font-weight: 750;
}

.detail-version-extra {
  margin-top: 12px;
}

.detail-version-desc,
.detail-version-owner {
  margin: 0;
  line-height: 1.58;
}

.detail-version-desc {
  font-size: 14px;
  color: #94a3b8;
}

.detail-version-owner {
  margin-top: 4px;
  font-size: 16px;
  color: #64748b;
}

.detail-version-side {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #a1a1aa;
  white-space: nowrap;
}

.detail-version-date {
  font-size: 14px;
  color: #a1a1aa;
}

.detail-version-toggle {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #a1a1aa;
  cursor: pointer;
}

.detail-version-toggle:hover {
  color: #15171d;
  background: #f8fafc;
}

.detail-version-toggle svg {
  width: 14px;
  height: 14px;
  transition: transform 0.16s ease;
}

.detail-version-timeline-item.is-expanded .detail-version-toggle svg {
  transform: rotate(180deg);
}

.detail-compare-panel {
  display: grid;
  gap: 24px;
}

.detail-compare-version-row {
  display: flex;
  align-items: center;
  gap: 56px;
}

.detail-compare-version-field {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.detail-compare-version-label {
  color: #94a3b8;
  font-weight: 750;
}

.detail-compare-version-value {
  color: #334155;
  font-weight: 900;
}

.detail-compare-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.detail-compare-select-wrap svg {
  position: absolute;
  right: 14px;
  width: 14px;
  height: 14px;
  color: #94a3b8;
  pointer-events: none;
}

.detail-compare-version-select {
  min-width: 108px;
  height: 44px;
  padding: 0 38px 0 18px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-weight: 750;
  appearance: none;
  cursor: pointer;
}

.detail-compare-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.detail-compare-stat {
  min-height: 76px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #ffffff;
}

.detail-compare-stat strong {
  font-size: 22px;
  line-height: 1;
  font-weight: 900;
}

.detail-compare-stat span {
  color: #94a3b8;
}

.detail-compare-stat.is-added strong {
  color: #059669;
}

.detail-compare-stat.is-deleted strong {
  color: #dc2626;
}

.detail-compare-stat.is-modified strong {
  color: #d97706;
}

.detail-compare-stat.is-unchanged strong {
  color: #64748b;
}

.detail-compare-file-switch {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 10px;
}

.detail-compare-file-arrow {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
}

.detail-compare-file-arrow:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
}

.detail-compare-file-arrow svg {
  width: 18px;
  height: 18px;
}

.detail-compare-file-picker {
  position: relative;
  min-width: 0;
}

.detail-compare-file-current {
  width: 100%;
  min-height: 44px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  cursor: pointer;
}

.detail-compare-file-current:disabled {
  cursor: not-allowed;
}

.detail-compare-file-current > svg {
  width: 16px;
  height: 16px;
  color: #94a3b8;
}

.detail-compare-file-status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 850;
}

.detail-compare-file-status.is-added {
  color: #047857;
  background: #ecfdf5;
}

.detail-compare-file-status.is-deleted {
  color: #b91c1c;
  background: #fef2f2;
}

.detail-compare-file-status.is-modified {
  color: #b45309;
  background: #fffbeb;
}

.detail-compare-file-status.is-unchanged {
  color: #64748b;
  background: #f1f5f9;
}

.detail-compare-file-name {
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-compare-file-count {
  color: #94a3b8;
  white-space: nowrap;
}

.detail-compare-file-menu {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  z-index: 10;
  display: grid;
  gap: 4px;
  max-height: 240px;
  padding: 8px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
}

.detail-compare-file-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 6px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #334155;
  font: inherit;
  cursor: pointer;
}

.detail-compare-file-option:hover,
.detail-compare-file-option.active {
  background: #f8fafc;
}

.detail-compare-content {
  min-height: 360px;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #ffffff;
  overflow: hidden;
}

.detail-compare-content-head {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 18px;
  border-bottom: 1px solid #eef2f7;
  color: #334155;
}

.detail-compare-content-head span {
  color: #a1a1aa;
  font-weight: 750;
}

.detail-compare-code-wrap {
  max-height: 520px;
  overflow: auto;
}

.detail-compare-code {
  min-width: 760px;
  padding: 8px 0;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.65;
}

.detail-compare-code-line {
  display: grid;
  grid-template-columns: 44px 44px minmax(0, 1fr);
  min-height: 24px;
}

.detail-compare-code-line.is-added {
  background: #ecfdf5;
}

.detail-compare-code-line.is-deleted {
  background: #fef2f2;
}

.detail-compare-code-line.is-modified {
  background: #fffbeb;
}

.detail-compare-line-number {
  color: #a1a1aa;
  text-align: right;
  padding: 0 10px;
  user-select: none;
}

.detail-compare-code-line code {
  min-width: 0;
  padding: 0 18px;
  color: #111827;
  white-space: pre;
}

.detail-version-empty {
  padding: 18px;
  border: 1px solid #e9edf3;
  border-radius: 8px;
  background: #ffffff;
  color: #94a3b8;
  box-shadow: 0 8px 24px rgba(22, 34, 51, 0.05);
}

@media (max-width: 1100px) {
  .skill-detail-dialog--page {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto auto minmax(0, 1fr);
    row-gap: 0;
    padding: 24px;
  }

  .skill-detail-dialog--page .detail-actions {
    grid-column: 1;
    grid-row: 3;
    position: static;
    margin-top: 24px;
  }

  .detail-page-tabs {
    grid-row: 4;
    margin-top: 32px;
  }

  .skill-detail-dialog--page .detail-main {
    grid-row: 5;
  }
}

@media (max-width: 640px) {
  .skill-detail-dialog--page .detail-head {
    flex-direction: column;
  }

  .skill-detail-dialog--page .detail-title-wrap {
    gap: 14px;
  }

  .detail-hero-icon {
    width: 48px;
    height: 48px;
    font-size: 22px;
  }

  .detail-page-tabs {
    gap: 28px;
  }
}
</style>
