<script setup lang="ts">
import { computed, useId } from 'vue';
import type { SkillQualityAssertionDto } from '../../services/skillMarket/skillBehaviorEvaluationService';

const props = defineProps<{ assertions: SkillQualityAssertionDto[]; caseId: string }>();
const headingId = `${useId()}-assertions-heading`;
const passedCount = computed(
  () => props.assertions.filter((item) => item.verdict === 'pass').length,
);
const failedCount = computed(
  () => props.assertions.filter((item) => item.verdict === 'fail').length,
);
const otherCount = computed(() => props.assertions.length - passedCount.value - failedCount.value);

function fieldText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '—';
}

function confidenceText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? `${Number((value * 100).toFixed(2))}%`
    : '—';
}
</script>

<template>
  <section class="quality-assertions" :aria-label="`用例 ${caseId} 的诊断明细`">
    <header class="quality-assertions__heading">
      <h4 :id="headingId">诊断明细</h4>
      <span class="quality-assertions__summary">
        共 {{ assertions.length }} 项 · pass {{ passedCount }} · fail {{ failedCount }}
        <template v-if="otherCount"> · 其他 {{ otherCount }}</template>
      </span>
    </header>
    <ol class="quality-assertions__list" :aria-labelledby="headingId">
      <li v-for="(assertion, index) in assertions" :key="index" class="quality-assertions__item">
        <div class="quality-assertions__content">
          <div class="quality-assertions__meta">
            <span class="quality-assertions__number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span
              class="quality-assertions__badge"
              :class="{ 'is-must': assertion.priority === 'must' }"
              :aria-label="`优先级 ${fieldText(assertion.priority)}`"
              >{{ fieldText(assertion.priority) }}</span
            >
          </div>
          <p class="quality-assertions__check-point" :title="fieldText(assertion.check_point)">
            {{ fieldText(assertion.check_point) }}
          </p>
          <p class="quality-assertions__reason" :title="fieldText(assertion.reason)">
            <span>判断理由</span>{{ fieldText(assertion.reason) }}
          </p>
        </div>
        <span class="quality-assertions__confidence"
          >置信度 {{ confidenceText(assertion.confidence) }}</span
        >
        <span
          class="quality-assertions__badge quality-assertions__verdict"
          :class="{
            'is-pass': assertion.verdict === 'pass',
            'is-fail': assertion.verdict === 'fail',
          }"
          :aria-label="`判定结果 ${fieldText(assertion.verdict)}`"
          >{{ fieldText(assertion.verdict) }}</span
        >
      </li>
    </ol>
  </section>
</template>

<style scoped>
.quality-assertions {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #dfe6f1;
}
.quality-assertions__heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.quality-assertions__heading {
  justify-content: space-between;
  margin-bottom: 12px;
}
.quality-assertions__heading h4 {
  margin: 0;
  color: #334155;
  font-size: 12.5px;
  font-weight: 600;
}
.quality-assertions__summary,
.quality-assertions__number,
.quality-assertions__confidence {
  color: #64748b;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.quality-assertions__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content fit-content(160px);
  gap: 10px 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.quality-assertions__item {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: start;
  min-width: 0;
  padding: 14px;
  border: 1px solid #dfe6f1;
  border-radius: 8px;
  background: #fff;
  overflow-wrap: anywhere;
}
.quality-assertions__content {
  min-width: 0;
}
.quality-assertions__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
}
.quality-assertions__verdict {
  justify-self: start;
}
.quality-assertions__badge {
  max-width: 100%;
  padding: 3px 8px;
  border-radius: 5px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11.5px;
  white-space: pre-wrap;
}
.quality-assertions__badge.is-must {
  background: #fff7e6;
  color: #a9580d;
}
.quality-assertions__badge.is-pass {
  background: #e6f7ef;
  color: #117a47;
}
.quality-assertions__badge.is-fail {
  background: #fef2f2;
  color: #c52222;
}
.quality-assertions__confidence {
  padding-top: 3px;
  text-align: left;
  white-space: nowrap;
}
.quality-assertions__check-point,
.quality-assertions__reason {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quality-assertions__check-point {
  color: #334155;
  font-weight: 600;
}
.quality-assertions__reason {
  margin-top: 7px;
  color: #475569;
}
.quality-assertions__reason > span {
  margin-right: 8px;
  color: #64748b;
}
</style>
