<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import {
  loadReviewCenterData,
  type ComputeChannelRow,
  type MedalLeaderboardRow,
  type ReviewCenterData,
  type ReviewDimensionDetail,
  type ReviewHistoryRecord,
  type ReviewRankingCard,
  type ReviewTaskCard,
} from '../../services/skillMarket/reviewCenterDataSource';

const rankingCards = ref<ReviewRankingCard[]>([]);
const taskCards = reactive<ReviewTaskCard[]>([]);

const selectedTaskId = ref(taskCards[0]?.id ?? '');

const scoreTabs = ref<string[]>([]);
const computeChannels = reactive<ComputeChannelRow[]>([]);
const computeChannelTypes = ref<string[]>([]);
const isComputeChannelModalOpen = ref(false);
const computeSkillSearchQuery = ref('');
const selectedComputeSkillId = ref('');
const selectedComputeChannelType = ref('');
const computeChannelReason = ref('');

const medalRows = reactive<MedalLeaderboardRow[]>([]);
const medalAwardTypes = ref<string[]>([]);
const isMedalAwardModalOpen = ref(false);
const skillSearchQuery = ref('');
const selectedAwardSkillId = ref('');
const selectedAwardMedalTypes = ref<string[]>([]);
const awardMedalReason = ref('');

const reviewDimensionDetails = reactive<Record<string, ReviewDimensionDetail>>({});

const medalOptions = ref<string[]>([]);
const selectedPersonalMedals = ref<string[]>([]);
const isMedalSelectOpen = ref(false);
const isHistoryDrawerOpen = ref(false);
const greenChannelOptions = ref<string[]>([]);
const selectedGreenChannel = ref(greenChannelOptions.value[0] ?? '');
const isGreenChannelSelectOpen = ref(false);
const expertScoreTab = computed(() => scoreTabs.value[scoreTabs.value.length - 1] ?? '');
const activeScoreTab = ref('');
const overallReviewDimension = ref('');
const scoreInputText = ref('');
const isScoreEditing = ref(false);
const scoreInputRef = ref<HTMLInputElement | null>(null);
const reviewHistoryRecords = ref<ReviewHistoryRecord[]>([]);

function replaceReactiveArray<T>(target: T[], source: T[]) {
  target.splice(0, target.length, ...source);
}

function replaceReviewDimensionDetails(source: Record<string, ReviewDimensionDetail>) {
  Object.keys(reviewDimensionDetails).forEach((dimension) => {
    delete reviewDimensionDetails[dimension];
  });
  Object.entries(source).forEach(([dimension, detail]) => {
    reviewDimensionDetails[dimension] = detail;
  });
}

function applyReviewCenterData(data: ReviewCenterData) {
  rankingCards.value = data.rankingCards;
  replaceReactiveArray(taskCards, data.taskCards);
  selectedTaskId.value = taskCards[0]?.id ?? '';

  scoreTabs.value = data.scoreTabs;
  activeScoreTab.value = scoreTabs.value[0] ?? '';

  replaceReactiveArray(computeChannels, data.computeChannels);
  computeChannelTypes.value = data.computeChannelTypes;

  replaceReactiveArray(medalRows, data.medalRows);
  medalAwardTypes.value = data.medalAwardTypes;

  replaceReviewDimensionDetails(data.reviewDimensionDetails);
  medalOptions.value = data.medalOptions;
  selectedPersonalMedals.value = [];

  greenChannelOptions.value = data.greenChannelOptions;
  selectedGreenChannel.value = greenChannelOptions.value[0] ?? '';

  overallReviewDimension.value = data.overallReviewDimension;
  reviewHistoryRecords.value = data.reviewHistoryRecords;

  if (taskCards[0]) {
    syncScoreInputFromTask(taskCards[0]);
  } else {
    scoreInputText.value = '';
  }
}
const activeTask = computed(
  () => taskCards.find((task) => task.id === selectedTaskId.value) ?? taskCards[0],
);
const isCurrentTaskReviewed = computed(() => activeTask.value?.hasReviewed === true);
const activeMetrics = computed(() => {
  const task = activeTask.value;
  if (!task) {
    return [];
  }

  return [
    { label: '使用量', value: task.usage, tone: 'blue' },
    { label: '下载量', value: task.downloads, tone: 'cyan' },
    {
      label: '专家评审得分',
      value: task.expertScore,
      tone: task.hasReviewed ? 'green' : 'indigo',
    },
  ];
});

function formatOverallScore(score: number): string {
  const rounded = Math.round(score * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function sanitizeScoreInput(raw: string): string {
  let value = raw.replace(/[^\d.]/g, '');
  const dotIndex = value.indexOf('.');
  if (dotIndex !== -1) {
    const integerPart = value.slice(0, dotIndex);
    const decimalPart = value.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
    value = `${integerPart}.${decimalPart}`;
  }

  return value;
}

function parseOverallScore(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const clamped = Math.min(100, Math.max(0, parsed));
  return Math.round(clamped * 100) / 100;
}

const scoreDisplayText = computed(() => {
  const text = scoreInputText.value.trim();
  if (text) {
    return text;
  }

  if (isCurrentTaskReviewed.value) {
    return '0';
  }

  return '待评';
});

function syncScoreInputFromTask(task: ReviewTaskCard) {
  if (task.overallScore != null) {
    scoreInputText.value = formatOverallScore(task.overallScore);
    const detail = reviewDimensionDetails[overallReviewDimension.value];
    if (detail) {
      detail.score = task.overallScore;
    }
  } else {
    scoreInputText.value = '';
  }
}

function commitOverallScore(raw: string) {
  const task = activeTask.value;
  if (!task) {
    return;
  }

  const parsedScore = parseOverallScore(raw);
  if (parsedScore == null) {
    task.overallScore = null;
    task.hasReviewed = false;
    task.expertScore = '待评';
    scoreInputText.value = '';
    return;
  }

  task.overallScore = parsedScore;
  task.hasReviewed = true;
  task.expertScore = formatOverallScore(parsedScore);
  scoreInputText.value = formatOverallScore(parsedScore);

  const detail = reviewDimensionDetails[overallReviewDimension.value];
  if (detail) {
    detail.score = parsedScore;
  }
}

function onScoreInput(event: Event) {
  const target = event.target as HTMLInputElement;
  scoreInputText.value = sanitizeScoreInput(target.value);
}

function finishScoreEditing(raw?: string) {
  commitOverallScore(raw ?? scoreInputText.value);
  isScoreEditing.value = false;
}

function onScoreBlur(event: Event) {
  const target = event.target as HTMLInputElement;
  finishScoreEditing(target.value);
}

function onScoreKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    (event.target as HTMLInputElement).blur();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    const task = activeTask.value;
    if (task) {
      syncScoreInputFromTask(task);
    }
    isScoreEditing.value = false;
  }
}

async function startScoreEditing() {
  isScoreEditing.value = true;
  await nextTick();
  scoreInputRef.value?.focus();
  scoreInputRef.value?.select();
}

function selectTask(taskId: string) {
  isScoreEditing.value = false;
  selectedTaskId.value = taskId;
  const task = taskCards.find((item) => item.id === taskId);
  if (task) {
    syncScoreInputFromTask(task);
  }
}

const isExpertScoreTab = computed(() => activeScoreTab.value === expertScoreTab.value);
const overallReviewDimensionDetail = computed(
  () => reviewDimensionDetails[overallReviewDimension.value],
);
const selectedPersonalMedalText = computed(() =>
  selectedPersonalMedals.value.length
    ? selectedPersonalMedals.value.join('、')
    : '不授予个人勋章',
);

function filterTaskCardsByKeyword(keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return taskCards;
  }

  return taskCards.filter((task) => {
    return (
      task.name.toLowerCase().includes(normalized) ||
      task.owner.toLowerCase().includes(normalized) ||
      task.id.toLowerCase().includes(normalized)
    );
  });
}

const filteredSkillOptions = computed(() => filterTaskCardsByKeyword(skillSearchQuery.value));

const filteredComputeSkillOptions = computed(() =>
  filterTaskCardsByKeyword(computeSkillSearchQuery.value),
);

const isMedalAwardFormValid = computed(() => {
  return (
    Boolean(selectedAwardSkillId.value) &&
    selectedAwardMedalTypes.value.length > 0 &&
    awardMedalReason.value.trim().length > 0
  );
});

function openMedalAwardModal() {
  skillSearchQuery.value = '';
  selectedAwardSkillId.value = selectedTaskId.value || taskCards[0]?.id || '';
  selectedAwardMedalTypes.value = [];
  awardMedalReason.value = '';
  isMedalAwardModalOpen.value = true;
}

function closeMedalAwardModal() {
  isMedalAwardModalOpen.value = false;
}

function submitMedalAward() {
  if (!isMedalAwardFormValid.value) {
    return;
  }

  const task = taskCards.find((item) => item.id === selectedAwardSkillId.value);
  if (!task) {
    return;
  }

  const existingRow = medalRows.find((row) => row.name === task.name);
  if (existingRow) {
    selectedAwardMedalTypes.value.forEach((medalType) => {
      if (!existingRow.medals.includes(medalType)) {
        existingRow.medals.push(medalType);
      }
    });
    existingRow.count = existingRow.medals.length;
    existingRow.owner = task.owner;
  } else {
    medalRows.push({
      name: task.name,
      owner: task.owner,
      count: selectedAwardMedalTypes.value.length,
      medals: [...selectedAwardMedalTypes.value],
    });
  }

  closeMedalAwardModal();
}

const isComputeChannelFormValid = computed(() => {
  return (
    Boolean(selectedComputeSkillId.value) &&
    Boolean(selectedComputeChannelType.value) &&
    computeChannelReason.value.trim().length > 0
  );
});

function openComputeChannelModal() {
  computeSkillSearchQuery.value = '';
  selectedComputeSkillId.value = selectedTaskId.value || taskCards[0]?.id || '';
  selectedComputeChannelType.value = computeChannelTypes.value[0] ?? '';
  computeChannelReason.value = '';
  isComputeChannelModalOpen.value = true;
}

function closeComputeChannelModal() {
  isComputeChannelModalOpen.value = false;
}

function submitComputeChannel() {
  if (!isComputeChannelFormValid.value) {
    return;
  }

  const task = taskCards.find((item) => item.id === selectedComputeSkillId.value);
  if (!task) {
    return;
  }

  const existingChannel = computeChannels.find((channel) => channel.id === task.id);
  if (existingChannel) {
    existingChannel.name = task.owner;
    existingChannel.type = selectedComputeChannelType.value;
    existingChannel.status = '启用';
  } else {
    computeChannels.push({
      name: task.owner,
      id: task.id,
      type: selectedComputeChannelType.value,
      status: '启用',
    });
  }

  closeComputeChannelModal();
}

onMounted(async () => {
  applyReviewCenterData(await loadReviewCenterData());
});
</script>

<template>
  <div class="review-center-page">
    <div class="review-shell">
      <section class="review-board" aria-label="评审任务">
        <div class="board-toolbar">
          <div>
            <h2>评审任务</h2>
            <p>按状态、月份和评分维度筛选专家待办。</p>
          </div>
          <div class="toolbar-controls">
            <label class="toolbar-filter">
              <span class="toolbar-filter__label">评审状态</span>
              <select aria-label="评审状态">
                <option>待评审</option>
                <option>已评审</option>
                <option>全部</option>
              </select>
            </label>
            <label class="toolbar-filter">
              <span class="toolbar-filter__label">月度</span>
              <select aria-label="月度">
                <option>2026年05月</option>
                <option>2026年06月</option>
                <option>全部</option>
              </select>
            </label>
            <label class="toolbar-filter">
              <span class="toolbar-filter__label">业务维度</span>
              <select aria-label="业务维度">
                <option>公共</option>
                <option>设计</option>
                <option>开发</option>
                <option>测试</option>
                <option>运维</option>
                <option>维护</option>
                <option>研究</option>
                <option>项目管理</option>
                <option>全部</option>
              </select>
            </label>
            <label class="toolbar-filter">
              <span class="toolbar-filter__label">部门</span>
              <select aria-label="部门">
                <option>xx部门</option>
                <option>yy部门</option>
                <option>zz部门</option>
              </select>
            </label>
            <label class="toolbar-filter">
              <span class="toolbar-filter__label">排序</span>
              <select aria-label="排序">
                <option>按季度得分情况排序</option>
                <option>按本月得分情况排序</option>
                <option>按本周得分情况排序</option>
                <option>按今天得分情况排序</option>
              </select>
            </label>
          </div>
        </div>

        <div class="board-layout">
          <aside class="task-list" aria-label="任务列表">
            <article
              v-for="task in taskCards"
              :key="task.id"
              class="task-card"
              :class="{ 'is-active': selectedTaskId === task.id }"
              role="button"
              tabindex="0"
              :aria-pressed="selectedTaskId === task.id"
              @click="selectTask(task.id)"
              @keydown.enter.prevent="selectTask(task.id)"
              @keydown.space.prevent="selectTask(task.id)"
            >
              <div class="task-card__title">{{ task.name }}</div>
              <div class="task-card__meta">{{ task.owner }} {{ task.id }} · {{ task.team }}</div>
              <div class="task-card__tags">
                <span v-for="tag in task.tags" :key="tag">{{ tag }}</span>
              </div>
            </article>
          </aside>

          <section class="skill-detail" aria-label="Skill 详情">
            <div class="metric-row">
              <span
                v-for="metric in activeMetrics"
                :key="metric.label"
                :class="['metric-chip', `is-${metric.tone}`]"
              >
                {{ metric.label }} {{ metric.value }}
              </span>
            </div>

            <div class="score-tabs" role="tablist" aria-label="评分类型">
              <!-- <button
                v-for="tab in scoreTabs"
                :key="tab"
                :class="{ 'is-active': activeScoreTab === tab }"
                type="button"
                @click="activeScoreTab = tab"
              >
                {{ tab }}
              </button> -->
            </div>

            <div v-if="false && !isExpertScoreTab" class="score-tab-pane">
              <div class="skill-preview">
                <div class="file-tree">
                  <strong>文件结构</strong>
                  <ul>
                    <li>test2-skill/</li>
                    <li class="is-selected">SKILL.md</li>
                    <li>deploy/</li>
                    <li>values.yaml</li>
                    <li>chart.yaml</li>
                    <li>ci/Jenkinsfile</li>
                  </ul>
                </div>
                <div class="readme-preview">
                  <strong>SKILL.md</strong>
                  <h3>test2 Skill</h3>
                  <p>多版本历史 + deploy / ci 目录，正文用于与 test1 区分效果。</p>
                  <p>当前版本覆盖批处理、交付模板和常见异常处理流程。</p>
                </div>
              </div>

              <div class="structure-panel">
                <div class="section-heading">
                  <h3>{{ activeScoreTab }}打分情况</h3>
                  <span>专家评分维度：完整性、清晰度、可复用性</span>
                </div>
                <div class="score-composer">
                  <div class="score-scale">
                    <span>0</span>
                    <div class="score-scale__bar"><span style="width: 84%"></span></div>
                    <span>100</span>
                  </div>
                  <textarea
                    aria-label="结构打分情况"
                    placeholder="记录评审意见、扣分点和改进建议"
                  ></textarea>
                </div>
              </div>
            </div>

            <section
              class="expert-review expert-review--inline"
              aria-labelledby="expert-title"
            >
              <div class="expert-review__header">
                <div>
                  <p class="review-hero__eyebrow">Expert Score Detail</p>
                  <h2 id="expert-title">专家评审打分详情</h2>
                </div>
                <button type="button" @click="isHistoryDrawerOpen = true">历史评审记录</button>
              </div>

              <div class="expert-editor">
                <div class="expert-dimension-summary">
                  <div
                    class="score-input-panel"
                    :class="{ 'is-pending': !isCurrentTaskReviewed }"
                  >
                    <span class="score-input-panel__caption">专家评分</span>
                    <div class="score-input-panel__field">
                      <template v-if="isScoreEditing">
                        <label class="score-input-panel__input-wrap">
                          <span class="visually-hidden">总体评价分数，满分 100</span>
                          <input
                            ref="scoreInputRef"
                            :value="scoreInputText"
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            spellcheck="false"
                            :placeholder="isCurrentTaskReviewed ? '0' : '待评'"
                            aria-describedby="score-input-hint"
                            @input="onScoreInput"
                            @blur="onScoreBlur"
                            @keydown="onScoreKeydown"
                          />
                        </label>
                        <span class="score-input-panel__unit">分</span>
                      </template>
                      <template v-else>
                        <span
                          class="score-input-panel__display"
                          :class="{ 'is-empty': !isCurrentTaskReviewed }"
                        >
                          {{ scoreDisplayText }}
                        </span>
                        <span class="score-input-panel__unit">分</span>
                        <button
                          type="button"
                          class="score-input-panel__edit-btn"
                          aria-label="编辑分数"
                          @click="startScoreEditing"
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
                            />
                          </svg>
                        </button>
                      </template>
                    </div>
                    <span class="score-input-panel__range">满分 100 · 支持两位小数</span>
                    <p id="score-input-hint" class="score-input-panel__hint">
                      <template v-if="!isCurrentTaskReviewed">
                        该 Skill 尚未评审，点击编辑图标输入 0–100 分
                      </template>
                      <template v-else>
                        点击编辑图标修改分数，输入完成后点击空白处保存
                      </template>
                    </p>
                  </div>
                </div>

                <div class="expert-editor__controls">
                    <div class="medal-select">
                      <span class="medal-select__label">是否授予个人勋章</span>
                      <div class="medal-select__control">
                        <button
                          class="medal-select__button"
                          type="button"
                          :aria-expanded="isMedalSelectOpen"
                          aria-haspopup="true"
                          @click="isMedalSelectOpen = !isMedalSelectOpen"
                        >
                          {{ selectedPersonalMedalText }}
                        </button>
                        <div
                          v-if="isMedalSelectOpen"
                          class="medal-select__menu"
                          role="group"
                          aria-label="个人勋章"
                        >
                          <label
                            v-for="option in medalOptions"
                            :key="option"
                            class="medal-select__option"
                          >
                            <input
                              v-model="selectedPersonalMedals"
                              type="checkbox"
                              :value="option"
                            />
                            <span>{{ option }}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                    <div class="green-channel-select">
                      <span class="green-channel-select__label">是否开通绿色通道</span>
                      <div class="green-channel-select__control">
                        <button
                          class="green-channel-select__button"
                          type="button"
                          :aria-expanded="isGreenChannelSelectOpen"
                          aria-haspopup="listbox"
                          @click="isGreenChannelSelectOpen = !isGreenChannelSelectOpen"
                        >
                          {{ selectedGreenChannel }}
                        </button>
                        <div
                          v-if="isGreenChannelSelectOpen"
                          class="green-channel-select__menu"
                          role="listbox"
                          aria-label="绿色通道选择"
                        >
                          <button
                            v-for="option in greenChannelOptions"
                            :key="option"
                            type="button"
                            class="green-channel-select__option"
                            :class="{ 'is-selected': selectedGreenChannel === option }"
                            role="option"
                            :aria-selected="selectedGreenChannel === option"
                            @click="
                              selectedGreenChannel = option;
                              isGreenChannelSelectOpen = false;
                            "
                          >
                            {{ option }}
                          </button>
                        </div>
                      </div>
                    </div>
                </div>
                <label class="review-textarea">
                  <span>{{ overallReviewDimension }}详情</span>
                  <textarea :placeholder="overallReviewDimensionDetail?.placeholder"></textarea>
                </label>
              </div>
            </section>
          </section>

          <aside class="support-column" aria-label="资源与榜单">
            <section class="side-panel">
              <div class="side-panel__header">
                <h2>算力 / Token 绿色通道</h2>
                <button
                  type="button"
                  aria-label="增加算力"
                  @click="openComputeChannelModal"
                >
                  +
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>人员</th>
                    <th>开通类型</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="channel in computeChannels" :key="channel.id">
                    <td>
                      {{ channel.name }}<span>{{ channel.id }}</span>
                    </td>
                    <td>{{ channel.type }}</td>
                    <td>{{ channel.status }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="side-panel">
              <div class="side-panel__header">
                <h2>勋章榜单</h2>
                <button
                  type="button"
                  aria-label="发放勋章"
                  @click="openMedalAwardModal"
                >
                  +
                </button>
              </div>
              <div class="medal-list">
                <article v-for="row in medalRows" :key="row.name" class="medal-row">
                  <div>
                    <strong>{{ row.name }}</strong>
                    <span>{{ row.owner }} · 获得 {{ row.count }} 枚</span>
                  </div>
                  <div class="medal-icons">
                    <span v-for="medal in row.medals" :key="medal">{{ medal.slice(0, 1) }}</span>
                  </div>
                </article>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="isComputeChannelModalOpen"
        class="medal-award-overlay"
        role="presentation"
        @click.self="closeComputeChannelModal"
      >
        <div
          class="medal-award-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compute-channel-title"
        >
          <header class="medal-award-dialog__header">
            <div>
              <h2 id="compute-channel-title">为 Skill 增加算力</h2>
              <p>选择 Skill、算力通道类型并填写增加原因</p>
            </div>
            <button
              type="button"
              class="medal-award-dialog__close"
              aria-label="关闭"
              @click="closeComputeChannelModal"
            >
              关闭
            </button>
          </header>

          <form class="medal-award-form" @submit.prevent="submitComputeChannel">
            <fieldset class="medal-award-field">
              <legend>选择 Skill <span class="medal-award-field__required">*</span></legend>
              <input
                v-model="computeSkillSearchQuery"
                class="medal-award-search"
                type="search"
                placeholder="搜索 Skill 名称或工号"
                autocomplete="off"
              />
              <p v-if="!filteredComputeSkillOptions.length" class="medal-award-empty">
                未找到匹配的 Skill
              </p>
              <ul v-else class="medal-award-skill-list" role="radiogroup" aria-label="Skill 列表">
                <li v-for="skill in filteredComputeSkillOptions" :key="skill.id">
                  <label
                    class="medal-award-skill-option"
                    :class="{ 'is-selected': selectedComputeSkillId === skill.id }"
                  >
                    <input
                      v-model="selectedComputeSkillId"
                      type="radio"
                      name="compute-skill"
                      :value="skill.id"
                    />
                    <span class="medal-award-skill-option__main">
                      <strong>{{ skill.name }}</strong>
                      <span>{{ skill.owner }} · {{ skill.id }} · {{ skill.team }}</span>
                    </span>
                  </label>
                </li>
              </ul>
            </fieldset>

            <fieldset class="medal-award-field">
              <legend>算力通道 <span class="medal-award-field__required">*</span></legend>
              <div class="medal-award-type-list medal-award-type-list--radio">
                <label
                  v-for="channelType in computeChannelTypes"
                  :key="channelType"
                  class="medal-award-type-option"
                >
                  <input
                    v-model="selectedComputeChannelType"
                    type="radio"
                    name="compute-channel-type"
                    :value="channelType"
                  />
                  <span>{{ channelType }}</span>
                </label>
              </div>
            </fieldset>

            <label class="medal-award-field medal-award-field--textarea">
              <span>增加算力原因 <span class="medal-award-field__required">*</span></span>
              <textarea
                v-model="computeChannelReason"
                rows="4"
                placeholder="请填写为该 Skill 增加算力的原因与说明"
              ></textarea>
            </label>

            <div class="medal-award-form__actions">
              <button
                type="button"
                class="medal-award-btn medal-award-btn--ghost"
                @click="closeComputeChannelModal"
              >
                取消
              </button>
              <button
                type="submit"
                class="medal-award-btn medal-award-btn--primary"
                :disabled="!isComputeChannelFormValid"
              >
                确认增加
              </button>
            </div>
          </form>
        </div>
      </div>

      <div
        v-if="isMedalAwardModalOpen"
        class="medal-award-overlay"
        role="presentation"
        @click.self="closeMedalAwardModal"
      >
        <div
          class="medal-award-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="medal-award-title"
        >
          <header class="medal-award-dialog__header">
            <div>
              <h2 id="medal-award-title">为 Skill 发放勋章</h2>
              <p>选择 Skill、勋章类型并填写发放理由</p>
            </div>
            <button
              type="button"
              class="medal-award-dialog__close"
              aria-label="关闭"
              @click="closeMedalAwardModal"
            >
              关闭
            </button>
          </header>

          <form class="medal-award-form" @submit.prevent="submitMedalAward">
            <fieldset class="medal-award-field">
              <legend>选择 Skill <span class="medal-award-field__required">*</span></legend>
              <input
                v-model="skillSearchQuery"
                class="medal-award-search"
                type="search"
                placeholder="搜索 Skill 名称或工号"
                autocomplete="off"
              />
              <p v-if="!filteredSkillOptions.length" class="medal-award-empty">未找到匹配的 Skill</p>
              <ul v-else class="medal-award-skill-list" role="radiogroup" aria-label="Skill 列表">
                <li v-for="skill in filteredSkillOptions" :key="skill.id">
                  <label
                    class="medal-award-skill-option"
                    :class="{ 'is-selected': selectedAwardSkillId === skill.id }"
                  >
                    <input
                      v-model="selectedAwardSkillId"
                      type="radio"
                      name="award-skill"
                      :value="skill.id"
                    />
                    <span class="medal-award-skill-option__main">
                      <strong>{{ skill.name }}</strong>
                      <span>{{ skill.owner }} · {{ skill.id }} · {{ skill.team }}</span>
                    </span>
                  </label>
                </li>
              </ul>
            </fieldset>

            <fieldset class="medal-award-field">
              <legend>勋章类型 <span class="medal-award-field__required">*</span></legend>
              <div class="medal-award-type-list">
                <label
                  v-for="medalType in medalAwardTypes"
                  :key="medalType"
                  class="medal-award-type-option"
                >
                  <input
                    v-model="selectedAwardMedalTypes"
                    type="checkbox"
                    :value="medalType"
                  />
                  <span>{{ medalType }}</span>
                </label>
              </div>
            </fieldset>

            <label class="medal-award-field medal-award-field--textarea">
              <span>发勋章理由 <span class="medal-award-field__required">*</span></span>
              <textarea
                v-model="awardMedalReason"
                rows="4"
                placeholder="请填写发放该勋章的理由与依据"
              ></textarea>
            </label>

            <div class="medal-award-form__actions">
              <button type="button" class="medal-award-btn medal-award-btn--ghost" @click="closeMedalAwardModal">
                取消
              </button>
              <button
                type="submit"
                class="medal-award-btn medal-award-btn--primary"
                :disabled="!isMedalAwardFormValid"
              >
                确认发放
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <div
      v-if="isHistoryDrawerOpen"
      class="history-drawer-backdrop"
      @click="isHistoryDrawerOpen = false"
    ></div>
    <aside
      v-if="isHistoryDrawerOpen"
      class="history-drawer"
      aria-label="历史评审记录"
    >
      <header class="history-drawer__header">
        <div>
          <p>历史评审记录</p>
          <h2>{{ activeTask.name }}</h2>
        </div>
        <button
          class="history-drawer__close"
          type="button"
          aria-label="关闭历史评审记录"
          @click="isHistoryDrawerOpen = false"
        >
          关闭
        </button>
      </header>

      <div class="history-drawer__body">
        <article
          v-for="record in reviewHistoryRecords"
          :key="record.id"
          class="history-record"
        >
          <div class="history-record__topline">
            <strong>{{ record.reviewer }}</strong>
            <span>{{ record.reviewedAt }}</span>
          </div>
          <p>{{ record.summary }}</p>
          <div class="history-score-list">
            <div
              v-for="score in record.scores"
              :key="score.dimension"
              class="history-score-item"
            >
              <div>
                <span>{{ score.dimension }}</span>
                <strong>{{ score.score }}分</strong>
              </div>
              <button
                class="history-suggestion"
                type="button"
                :title="score.suggestion"
              >
                优化建议
                <span class="history-suggestion__tip">{{ score.suggestion }}</span>
              </button>
            </div>
          </div>
          <div class="history-record__medals">
            <span>个人勋章</span>
            <strong>{{ record.medals.length ? record.medals.join('、') : '未授予' }}</strong>
          </div>
        </article>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.review-center-page {
  min-height: 100vh;
  background: #f4f7fb;
  color: #17233d;
  font-size: 14px;
  font-family: Inter, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
}

.review-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto auto minmax(260px, 1fr) auto;
  align-items: center;
  gap: 24px;
  height: 70px;
  padding: 0 28px;
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 4px rgba(25, 43, 75, 0.06);
  backdrop-filter: blur(10px);
}

.review-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #2563eb;
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

.review-brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: #ffffff;
  font-size: 18px;
  background: linear-gradient(135deg, #2563eb, #4f46e5);
}

.review-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.review-nav__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  height: 42px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #1f2f4a;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.review-nav__item.is-active {
  border-color: #0f172a;
  background: #eef4ff;
  color: #1d4ed8;
}

.review-search {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: stretch;
  height: 46px;
  min-width: 260px;
  padding: 0 18px;
  border-radius: 24px;
  background: #eef2f7;
  color: #8aa0bd;
}

.review-search__icon {
  width: 14px;
  height: 14px;
  border: 2px solid #9aaaca;
  border-radius: 50%;
  position: relative;
  flex: 0 0 auto;
}

.review-search__icon::after {
  position: absolute;
  right: -6px;
  bottom: -5px;
  width: 7px;
  height: 2px;
  background: #9aaaca;
  border-radius: 999px;
  content: '';
  transform: rotate(45deg);
}

.review-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #263854;
  font: inherit;
}

.review-help {
  width: 32px;
  height: 32px;
  border: 2px solid #0f172a;
  border-radius: 50%;
  background: #ffffff;
  color: #0f172a;
  font-weight: 800;
}

.review-shell {
  display: block;
  min-height: calc(100vh - 70px);
}

.review-sidebar {
  display: none;
  padding: 24px 18px;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.filter-section {
  margin-bottom: 24px;
}

.filter-section h2 {
  margin: 0 0 12px;
  color: #65748f;
  font-size: 15px;
  font-weight: 800;
}

.filter-pill,
.dimension-grid button {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d8e1ef;
  border-radius: 8px;
  background: #ffffff;
  color: #253857;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.filter-pill {
  display: block;
  margin-bottom: 10px;
  text-align: left;
  padding: 0 16px;
}

.filter-pill.is-active {
  border-color: #bfdbfe;
  background: #eaf2ff;
  color: #2563eb;
}

.dimension-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.medal-filter-list {
  display: grid;
  gap: 8px;
}

.medal-filter-list span {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  background: #ffffff;
  color: #52657f;
  font-weight: 700;
}

.review-main {
  padding: 24px 24px 40px;
  overflow: hidden;
}

.review-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 168px;
  padding: 30px 42px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 88% 18%, rgba(255, 255, 255, 0.2), transparent 22%),
    linear-gradient(115deg, #2f6bed 0%, #3553e7 54%, #4424b9 100%);
  color: #ffffff;
  box-shadow: 0 18px 36px rgba(47, 83, 226, 0.22);
}

.review-hero__eyebrow {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.review-hero h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.25;
  letter-spacing: 0;
}

.review-hero p:not(.review-hero__eyebrow) {
  max-width: 760px;
  margin: 12px 0 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  line-height: 1.8;
}

.primary-action,
.expert-review__header button {
  min-width: 160px;
  height: 46px;
  border: 0;
  border-radius: 8px;
  background: #ffffff;
  color: #1d4ed8;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.12);
}

.ranking-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(210px, 1fr));
  gap: 18px;
  margin-top: 22px;
}

.ranking-card,
.review-board,
.side-panel,
.expert-review {
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(25, 43, 75, 0.06);
}

.ranking-card {
  padding: 16px 16px 14px;
}

.ranking-card__header,
.board-toolbar,
.side-panel__header,
.expert-review__header,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.ranking-card h2,
.board-toolbar h2,
.side-panel h2,
.expert-review h2 {
  margin: 0;
  color: #101828;
  font-size: 16px;
  line-height: 1.35;
}

.ranking-card__header button,
.side-panel__header button {
  width: 30px;
  height: 30px;
  border: 1px solid #d9e3f1;
  border-radius: 8px;
  background: #f8fbff;
  color: #5b6b84;
  font-weight: 800;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

th,
td {
  padding: 9px 6px;
  border-bottom: 1px solid #edf1f7;
  color: #40516d;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

th {
  color: #6a7890;
  font-weight: 800;
}

.review-board {
  padding: 18px;
}

.board-toolbar {
  align-items: flex-start;
  margin-bottom: 18px;
}

.board-toolbar p {
  margin: 5px 0 0;
  color: #697890;
  font-size: 13px;
}

.toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: flex-end;
  gap: 12px;
}

.toolbar-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toolbar-filter__label {
  color: #65748f;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.toolbar-controls select,
.toolbar-controls button,
.expert-editor select {
  height: 38px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background: #ffffff;
  color: #233752;
  font: inherit;
  font-weight: 700;
}

.toolbar-controls select {
  min-width: 150px;
  padding: 0 10px;
}

.toolbar-controls button {
  min-width: 200px;
  padding: 0 14px;
}

.board-layout {
  --review-workspace-h: 460px;
  display: grid;
  grid-template-columns: 220px minmax(420px, 1fr) 280px;
  gap: 18px;
  align-items: start;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* max-height: var(--review-workspace-h); */
  height: 700px;
  padding-right: 8px;
  border-right: 1px solid #e2e8f0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.task-list::-webkit-scrollbar {
  width: 8px;
}

.task-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #cbd5e1;
}

.task-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.task-card {
  flex: 0 0 auto;
  padding: 14px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.task-card:hover {
  border-color: #93c5fd;
}

.task-card.is-active {
  border-color: #60a5fa;
  box-shadow: inset 4px 0 0 #3b82f6;
}

.task-card__title {
  color: #101828;
  font-size: 15px;
  font-weight: 800;
}

.task-card__meta {
  margin-top: 10px;
  color: #5e6d84;
  font-size: 13px;
}

.task-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.task-card__tags span {
  padding: 4px 8px;
  border-radius: 7px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.skill-detail {
  min-width: 0;
}

.metric-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.metric-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid;
  border-radius: 8px;
  font-weight: 800;
}

.metric-chip.is-blue {
  border-color: #7dd3fc;
  background: #e0f2fe;
  color: #0369a1;
}

.metric-chip.is-cyan {
  border-color: #67e8f9;
  background: #ecfeff;
  color: #0e7490;
}

.metric-chip.is-indigo {
  border-color: #a5b4fc;
  background: #eef2ff;
  color: #4338ca;
}

.metric-chip.is-green {
  border-color: #86efac;
  background: #ecfdf5;
  color: #047857;
}

.score-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-top: 12px;
}

.score-tabs button {
  min-width: 116px;
  height: 34px;
  border: 1px solid #0f172a;
  background: #f8fafc;
  color: #253857;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.score-tabs button:first-child {
  border-radius: 8px 0 0 8px;
}

.score-tabs button:last-child {
  border-radius: 0 8px 8px 0;
}

.score-tabs button.is-active {
  background: #97d9ff;
  color: #0f3a6b;
}

.skill-preview {
  display: grid;
  grid-template-columns: minmax(180px, 0.9fr) minmax(240px, 1.1fr);
  gap: 12px;
  margin-top: 12px;
}

.file-tree,
.readme-preview {
  min-height: 146px;
  padding: 14px;
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #fbfdff;
}

.file-tree strong,
.readme-preview strong {
  display: block;
  margin-bottom: 12px;
  color: #334155;
  font-size: 12px;
}

.file-tree ul {
  margin: 0;
  padding: 0;
  list-style: none;
  color: #53647d;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.8;
}

.file-tree li {
  padding-left: 16px;
  border-left: 2px solid #cbd5e1;
}

.file-tree li.is-selected {
  border-radius: 6px;
  background: #dbeafe;
  color: #1d4ed8;
}

.readme-preview h3 {
  margin: 0 0 12px;
  color: #1e293b;
  font-size: 20px;
}

.readme-preview p {
  margin: 0 0 10px;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.structure-panel {
  margin-top: 20px;
}

.section-heading h3 {
  margin: 0;
  color: #101828;
  font-size: 17px;
}

.section-heading span {
  color: #708096;
  font-size: 13px;
}

.score-composer {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid #d9e3f1;
  border-radius: 8px;
  background: #fbfdff;
}

.score-scale {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  color: #64748b;
  font-weight: 800;
}

.score-scale__bar {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.score-scale__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #38bdf8, #22c55e);
}

textarea {
  width: 100%;
  min-height: 104px;
  resize: vertical;
  border: 1px solid #cfd9e8;
  border-radius: 8px;
  padding: 14px;
  color: #24364f;
  font: inherit;
  line-height: 1.7;
  outline: 0;
}

textarea:focus,
select:focus,
button:focus-visible,
input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

.support-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.side-panel {
  padding: 16px;
}

.side-panel table span {
  display: block;
  margin-top: 4px;
  color: #7b8aa0;
  font-size: 12px;
}

.medal-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.medal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #fbfdff;
}

.medal-row strong,
.medal-row span {
  display: block;
}

.medal-row strong {
  color: #17233d;
  font-size: 14px;
}

.medal-row span {
  margin-top: 4px;
  color: #697890;
  font-size: 12px;
}

.medal-icons {
  display: flex;
  gap: 6px;
}

.medal-icons span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fff7ed;
  color: #c2410c;
  font-size: 13px;
  font-weight: 900;
}

.expert-review {
  max-width: 960px;
  margin: 28px auto 0;
  padding: 22px;
}

.expert-review--inline {
  max-width: none;
  min-width: 0;
  margin: 12px 0 0;
  padding: 16px 18px 18px;
  border-color: #e8eef5;
  box-shadow: none;
  box-sizing: border-box;
  overflow: hidden;
}

.expert-review--inline .expert-review__header {
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}

.expert-review--inline .expert-review__header .review-hero__eyebrow {
  margin: 0 0 4px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.expert-review--inline .expert-review__header h2 {
  font-size: 15px;
  font-weight: 700;
}

.expert-review--inline .expert-review__header button {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  box-shadow: none;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.expert-review--inline .expert-review__header button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.expert-review--inline .expert-editor {
  margin-top: 0;
  min-width: 0;
  max-width: 100%;
  padding: 16px;
  border: 1px solid #e8eef5;
  border-radius: 10px;
  background: #fbfcfe;
  box-sizing: border-box;
  overflow: hidden;
}

.expert-review--inline .expert-dimension-summary {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #e8eef5;
  border-radius: 8px;
  background: #ffffff;
}

.expert-review--inline .score-input-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 18px 24px;
  border: 1px dashed #bfdbfe;
  border-radius: 8px;
  background: #f8fbff;
  text-align: center;
  box-sizing: border-box;
}

.expert-review--inline .score-input-panel.is-pending {
  border-color: #fcd34d;
  background: #fffbeb;
}

.expert-review--inline .score-input-panel__caption {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.expert-review--inline .score-input-panel__field {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
}

.expert-review--inline .score-input-panel__input-wrap {
  display: inline-flex;
  margin: 0;
}

.expert-review--inline .score-input-panel__display {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  height: 56px;
  padding: 0 10px;
  color: #1d4ed8;
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  text-align: center;
}

.expert-review--inline .score-input-panel__display.is-empty {
  color: #94a3b8;
  font-size: 28px;
  font-weight: 600;
}

.expert-review--inline .score-input-panel.is-pending .score-input-panel__display.is-empty {
  color: #b45309;
}

.expert-review--inline .score-input-panel__edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.expert-review--inline .score-input-panel__edit-btn:hover {
  border-color: #93c5fd;
  background: #f0f7ff;
  color: #2563eb;
}

.expert-review--inline .score-input-panel__edit-btn:focus-visible {
  outline: 0;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
}

.expert-review--inline .score-input-panel__field input {
  width: 120px;
  height: 56px;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  background: #ffffff;
  color: #1d4ed8;
  font: inherit;
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
  text-align: center;
  outline: 0;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.expert-review--inline .score-input-panel.is-pending .score-input-panel__field input {
  border-color: #fbbf24;
  color: #b45309;
}

.expert-review--inline .score-input-panel__field input::placeholder {
  color: #94a3b8;
  font-size: 24px;
  font-weight: 600;
}

.expert-review--inline .score-input-panel__field input:hover {
  border-color: #60a5fa;
}

.expert-review--inline .score-input-panel__field input:focus {
  border-color: #2563eb;
  box-shadow:
    inset 0 1px 2px rgba(15, 23, 42, 0.04),
    0 0 0 3px rgba(37, 99, 235, 0.16);
}

.expert-review--inline .score-input-panel__unit {
  color: #64748b;
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
}

.expert-review--inline .score-input-panel__range {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
}

.expert-review--inline .score-input-panel__hint {
  margin: 0;
  color: #64748b;
  font-size: 11px;
  line-height: 1.4;
}

.expert-review--inline .score-input-panel.is-pending .score-input-panel__hint {
  color: #b45309;
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

.expert-review--inline .expert-editor__controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  width: 100%;
  margin: 0 0 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}

.expert-review--inline .expert-editor__controls .medal-select,
.expert-review--inline .expert-editor__controls .green-channel-select {
  display: grid;
  grid-template-columns: minmax(108px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
  width: 100%;
}

.expert-review--inline .medal-select__label,
.expert-review--inline .green-channel-select__label {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.expert-review--inline .medal-select__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.expert-review--inline .medal-select__button {
  position: relative;
  width: 100%;
  height: 32px;
  overflow: hidden;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 30px 0 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.expert-review--inline .medal-select__button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.expert-review--inline .medal-select__button::after {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  content: '';
  transform: translateY(-65%) rotate(45deg);
}

.expert-review--inline .medal-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 30;
  display: grid;
  gap: 2px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
}

.expert-review--inline .medal-select__option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 4px;
  color: #334155;
  font-size: 13px;
  cursor: pointer;
}

.expert-review--inline .medal-select__option:hover {
  background: #f1f5f9;
}

.expert-review--inline .green-channel-select__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.expert-review--inline .green-channel-select__button {
  position: relative;
  width: 100%;
  height: 32px;
  overflow: hidden;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 30px 0 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.expert-review--inline .green-channel-select__button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.expert-review--inline .green-channel-select__button::after {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  content: '';
  transform: translateY(-65%) rotate(45deg);
}

.expert-review--inline .green-channel-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 30;
  display: grid;
  gap: 2px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
}

.expert-review--inline .green-channel-select__option {
  display: block;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #334155;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.expert-review--inline .green-channel-select__option:hover,
.expert-review--inline .green-channel-select__option.is-selected {
  background: #f1f5f9;
}

.expert-review--inline .green-channel-select__option.is-selected {
  color: #1d4ed8;
  font-weight: 600;
}

.expert-review--inline .review-textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.expert-review--inline .review-textarea span {
  display: block;
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.expert-review--inline .review-textarea textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 215px;
  padding: 10px 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
  box-sizing: border-box;
  resize: vertical;
}

.expert-review--inline .review-textarea textarea::placeholder {
  color: #94a3b8;
}

.expert-editor {
  margin-top: 0;
  min-width: 0;
  max-width: 100%;
  padding: 18px;
  border: 1px solid #e8eef5;
  border-radius: 10px;
  background: #fbfcfe;
  box-sizing: border-box;
  overflow: auto;
}

.expert-dimension-summary {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #fbfdff;
}

.dimension-score {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #eaf2ff;
  color: #1d4ed8;
}

.dimension-score--editable {
  border: 1px solid transparent;
}

.dimension-score--editable:focus-within {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18);
}

.dimension-score strong {
  font-size: 20px;
  line-height: 1;
}

.dimension-score input {
  width: 46px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1d4ed8;
  font: inherit;
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
  text-align: center;
}

.dimension-score span {
  margin-top: 4px;
  color: #53709b;
  font-size: 12px;
  font-weight: 800;
}

.expert-dimension-summary h3 {
  margin: 0;
  color: #17233d;
  font-size: 16px;
}

.expert-dimension-summary p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.dimension-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.dimension-checks span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 12px;
  font-weight: 800;
}

.expert-editor__controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  width: 100%;
  margin: 0 0 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}

.expert-editor__controls label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #334155;
  font-weight: 800;
}

.expert-editor__controls input {
  width: 20px;
  height: 20px;
  accent-color: #2563eb;
}

.medal-select {
  display: grid;
  grid-template-columns: minmax(108px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
  width: 100%;
}

.medal-select__label {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.medal-select__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.medal-select__button {
  position: relative;
  width: 100%;
  height: 32px;
  overflow: hidden;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 30px 0 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.medal-select__button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.medal-select__button::after {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  content: '';
  transform: translateY(-65%) rotate(45deg);
}

.medal-select__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: grid;
  width: 100%;
  gap: 4px;
  padding: 8px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.16);
}

.medal-select__option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 0 8px;
  border-radius: 7px;
  color: #253857;
  cursor: pointer;
}

.medal-select__option:hover {
  background: #eff6ff;
}

.green-channel-select {
  display: grid;
  grid-template-columns: minmax(108px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
  width: 100%;
}

.green-channel-select__label {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.green-channel-select__control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.green-channel-select__button {
  position: relative;
  width: 100%;
  height: 32px;
  overflow: hidden;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0 30px 0 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.green-channel-select__button:hover {
  border-color: #b8c5d6;
  background: #f8fafc;
}

.green-channel-select__button::after {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #94a3b8;
  border-bottom: 1.5px solid #94a3b8;
  content: '';
  transform: translateY(-65%) rotate(45deg);
}

.green-channel-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 30;
  display: grid;
  gap: 2px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
}

.green-channel-select__option {
  display: block;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #334155;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.green-channel-select__option:hover,
.green-channel-select__option.is-selected {
  background: #f1f5f9;
}

.green-channel-select__option.is-selected {
  color: #1d4ed8;
  font-weight: 600;
}

.expert-editor select {
  min-width: 260px;
  padding: 0 12px;
}

.review-textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.review-textarea span {
  display: block;
  margin-bottom: 10px;
  color: #334155;
  font-weight: 800;
}

.review-textarea textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 118px;
  box-sizing: border-box;
}

.medal-award-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
}

.medal-award-dialog {
  width: min(520px, 100%);
  max-height: min(88vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.medal-award-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid #eef2f7;
}

.medal-award-dialog__header h2 {
  margin: 0;
  color: #101828;
  font-size: 17px;
  font-weight: 700;
}

.medal-award-dialog__header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.medal-award-dialog__close {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.medal-award-dialog__close:hover {
  background: #f8fafc;
}

.medal-award-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px 20px;
  overflow-y: auto;
}

.medal-award-field {
  margin: 0;
  padding: 0;
  border: 0;
}

.medal-award-field legend,
.medal-award-field > span {
  display: block;
  margin-bottom: 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.medal-award-field__required {
  color: #dc2626;
}

.medal-award-search {
  width: 100%;
  height: 36px;
  margin-bottom: 10px;
  padding: 0 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  box-sizing: border-box;
}

.medal-award-search:focus {
  border-color: #3b82f6;
  outline: 0;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

.medal-award-empty {
  margin: 0;
  padding: 12px;
  border: 1px dashed #e2e8f0;
  border-radius: 6px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}

.medal-award-skill-list {
  display: grid;
  gap: 8px;
  max-height: 200px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.medal-award-skill-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.medal-award-skill-option:hover {
  border-color: #93c5fd;
  background: #f0f7ff;
}

.medal-award-skill-option.is-selected {
  border-color: #60a5fa;
  background: #eff6ff;
}

.medal-award-skill-option input {
  margin-top: 3px;
  accent-color: #2563eb;
}

.medal-award-skill-option__main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.medal-award-skill-option__main strong {
  color: #101828;
  font-size: 14px;
}

.medal-award-skill-option__main span {
  color: #64748b;
  font-size: 12px;
}

.medal-award-type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.medal-award-type-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.medal-award-type-option:has(input:checked) {
  border-color: #60a5fa;
  background: #eff6ff;
  color: #1d4ed8;
}

.medal-award-type-option input {
  accent-color: #2563eb;
}

.medal-award-type-list--radio .medal-award-type-option {
  min-width: 120px;
  justify-content: center;
}

.medal-award-field--textarea textarea {
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  border: 1px solid #d7e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
}

.medal-award-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

.medal-award-btn {
  min-width: 88px;
  height: 36px;
  padding: 0 14px;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.medal-award-btn--ghost {
  border: 1px solid #d7e0ec;
  background: #ffffff;
  color: #475569;
}

.medal-award-btn--ghost:hover {
  background: #f8fafc;
}

.medal-award-btn--primary {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.medal-award-btn--primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.medal-award-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.history-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(15, 23, 42, 0.24);
}

.history-drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  width: min(430px, calc(100vw - 28px));
  background: #ffffff;
  border-right: 1px solid #d9e3f1;
  box-shadow: 18px 0 42px rgba(15, 23, 42, 0.18);
}

.history-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 20px;
  border-bottom: 1px solid #e5edf7;
}

.history-drawer__header p {
  margin: 0 0 8px;
  color: #5d78a5;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.history-drawer__header h2 {
  margin: 0;
  color: #101828;
  font-size: 20px;
  line-height: 1.35;
}

.history-drawer__close {
  min-width: 64px;
  height: 34px;
  border: 1px solid #cad6e5;
  border-radius: 8px;
  background: #f8fbff;
  color: #253857;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.history-drawer__body {
  display: grid;
  gap: 14px;
  padding: 16px;
  overflow-y: auto;
}

.history-record {
  padding: 14px;
  border: 1px solid #dfe7f2;
  border-radius: 8px;
  background: #fbfdff;
}

.history-record__topline,
.history-score-item,
.history-record__medals {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.history-record__topline strong {
  color: #17233d;
  font-size: 15px;
}

.history-record__topline span {
  color: #718096;
  font-size: 12px;
  white-space: nowrap;
}

.history-record p {
  margin: 10px 0 12px;
  color: #52647d;
  line-height: 1.7;
}

.history-score-list {
  display: grid;
  gap: 8px;
}

.history-score-item {
  padding: 10px;
  border-radius: 8px;
  background: #ffffff;
}

.history-score-item span,
.history-record__medals span {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.history-score-item strong,
.history-record__medals strong {
  display: block;
  margin-top: 4px;
  color: #1d4ed8;
  font-size: 14px;
}

.history-suggestion {
  position: relative;
  flex: 0 0 auto;
  height: 30px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  padding: 0 10px;
  cursor: pointer;
}

.history-suggestion__tip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 90;
  width: 240px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
  opacity: 0;
  pointer-events: none;
  text-align: left;
  transform: translateY(-4px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.history-suggestion:hover .history-suggestion__tip,
.history-suggestion:focus .history-suggestion__tip {
  opacity: 1;
  transform: translateY(0);
}

.history-record__medals {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #edf1f7;
}

@media (max-width: 1440px) {
  .ranking-grid {
    grid-template-columns: repeat(2, minmax(260px, 1fr));
  }

  .board-layout {
    grid-template-columns: 220px minmax(360px, 1fr);
  }

  .support-column {
    flex-direction: row;
    flex-wrap: wrap;
    grid-column: 1 / -1;
    height: auto;
  }

  .support-column .side-panel {
    flex: 1 1 260px;
  }
}

@media (max-width: 1120px) {
  .review-topbar {
    grid-template-columns: 1fr auto;
    height: auto;
    padding: 16px 20px;
  }

  .review-nav,
  .review-search {
    grid-column: 1 / -1;
  }

  .review-search {
    min-width: 0;
  }

  .review-shell {
    grid-template-columns: 1fr;
  }

  .review-sidebar {
    border-right: 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .review-main {
    padding: 22px 18px 36px;
  }

  .review-hero {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 820px) {
  .review-nav {
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .ranking-grid,
  .support-column,
  .skill-preview,
  .board-layout {
    grid-template-columns: 1fr;
  }

  .board-layout {
    --review-workspace-h: 360px;
  }

  .task-list {
    max-height: var(--review-workspace-h);
    padding-right: 0;
    border-right: 0;
  }

  .board-toolbar,
  .expert-review__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-controls,
  .toolbar-filter,
  .toolbar-controls select,
  .toolbar-controls button,
  .primary-action,
  .expert-review__header button {
    width: 100%;
  }

  .review-hero {
    padding: 28px;
  }

  .review-hero h1 {
    font-size: 32px;
  }

  .medal-select,
  .medal-select__control,
  .green-channel-select,
  .green-channel-select__control {
    width: 100%;
  }

  .expert-editor__controls,
  .expert-review--inline .expert-editor__controls {
    grid-template-columns: 1fr;
  }

  .expert-editor__controls .medal-select,
  .expert-editor__controls .green-channel-select,
  .expert-review--inline .expert-editor__controls .medal-select,
  .expert-review--inline .expert-editor__controls .green-channel-select {
    grid-template-columns: 1fr;
  }

  .expert-review--inline .expert-editor__controls {
    grid-template-columns: 1fr;
  }

  .expert-review--inline .expert-editor__controls .medal-select,
  .expert-review--inline .expert-editor__controls .green-channel-select {
    grid-template-columns: 1fr;
  }

  .history-score-item,
  .history-record__medals {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
