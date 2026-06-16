import type {
  ComputeChannelRow,
  MedalLeaderboardRow,
  ReviewDimensionDetail,
  ReviewHistoryRecord,
  ReviewRankingCard,
  ReviewTaskCard,
} from './mock/reviewCenterData';
import { skillBaseService } from './skillBaseService';

export type {
  ComputeChannelRow,
  MedalLeaderboardRow,
  ReviewDimensionDetail,
  ReviewHistoryRecord,
  ReviewRankingCard,
  ReviewTaskCard,
} from './mock/reviewCenterData';

type ReviewCenterMockModule = typeof import('./mock/reviewCenterData');

export type ReviewCenterData = {
  rankingCards: ReviewRankingCard[];
  taskCards: ReviewTaskCard[];
  scoreTabs: string[];
  computeChannels: ComputeChannelRow[];
  computeChannelTypes: string[];
  medalRows: MedalLeaderboardRow[];
  medalAwardTypes: string[];
  reviewDimensionDetails: Record<string, ReviewDimensionDetail>;
  medalOptions: string[];
  greenChannelOptions: string[];
  overallReviewDimension: string;
  reviewHistoryRecords: ReviewHistoryRecord[];
};

function cloneReviewDimensionDetails(details: Record<string, ReviewDimensionDetail>) {
  return Object.entries(details).reduce<Record<string, ReviewDimensionDetail>>(
    (clonedDetails, [dimension, detail]) => {
      clonedDetails[dimension] = { ...detail, checks: [...detail.checks] };
      return clonedDetails;
    },
    {},
  );
}

function cloneReviewHistoryRecords(records: ReviewHistoryRecord[]) {
  return records.map((record) => ({
    ...record,
    medals: [...record.medals],
    scores: record.scores.map((score) => ({ ...score })),
  }));
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function filterMockTaskCards(taskCards: ReviewTaskCard[], listParams: any): ReviewTaskCard[] {
  let filtered = taskCards.map((task) => ({ ...task }));

  const categoryId = String(listParams?.categoryId ?? '').trim();
  if (categoryId) {
    filtered = filtered.filter(
      (task) => task.dimensionId === categoryId || task.categoryId === categoryId,
    );
  }

  const reviewStatus = String(listParams?.reviewStatus ?? '')
    .trim()
    .toUpperCase();
  if (reviewStatus === 'PENDING') {
    filtered = filtered.filter((task) => !task.hasReviewed);
  } else if (reviewStatus === 'REVIEWED') {
    filtered = filtered.filter((task) => task.hasReviewed);
  }

  const sortBy = String(listParams?.sortBy ?? '').trim();
  if (sortBy === 'downloads') {
    filtered.sort((left, right) => toNumber(right.downloads) - toNumber(left.downloads));
  } else if (sortBy === 'aiScore') {
    filtered.sort((left, right) => {
      const scoreDiff = toNumber(right.overallScore) - toNumber(left.overallScore);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return toNumber(right.downloads) - toNumber(left.downloads);
    });
  }

  return filtered;
}

function createMockReviewCenterData(
  mockData: ReviewCenterMockModule,
  listParams?: any,
): ReviewCenterData {
  return {
    rankingCards: mockData.mockReviewRankingCards.map((card) => ({
      ...card,
      columns: [...card.columns],
      rows: card.rows.map((row) => [...row]),
    })),
    taskCards: filterMockTaskCards(mockData.mockReviewTaskCards, listParams),
    scoreTabs: [...mockData.mockReviewScoreTabs],
    computeChannels: mockData.mockReviewComputeChannels.map((channel) => ({ ...channel })),
    computeChannelTypes: [...mockData.mockReviewComputeChannelTypes],
    medalRows: mockData.mockReviewMedalRows.map((row) => ({ ...row, medals: [...row.medals] })),
    medalAwardTypes: [...mockData.mockReviewMedalAwardTypes],
    reviewDimensionDetails: cloneReviewDimensionDetails(mockData.mockReviewDimensionDetails),
    medalOptions: [...mockData.mockReviewMedalOptions],
    greenChannelOptions: [...mockData.mockReviewGreenChannelOptions],
    overallReviewDimension: mockData.mockOverallReviewDimension,
    reviewHistoryRecords: cloneReviewHistoryRecords(mockData.mockReviewHistoryRecords),
  };
}

async function loadHttpReviewCenterData(listParams: any): Promise<ReviewCenterData> {
  // 评审列表
  let reviewList = [];
  const reviewRes = await skillBaseService.getSkillReviewList(listParams);
  if (reviewRes?.meta?.success && reviewRes?.data) {
    reviewList = reviewRes.data?.list;
  }
  // TODO: 后端接口确定后，在 skillBaseService 中补齐评审页查询方法，并在这里组装真实响应数据。
  return {
    rankingCards: [],
    taskCards: [...reviewList],
    scoreTabs: [],
    computeChannels: [],
    computeChannelTypes: [],
    medalRows: [],
    medalAwardTypes: [],
    reviewDimensionDetails: {},
    medalOptions: [],
    greenChannelOptions: [],
    overallReviewDimension: '',
    reviewHistoryRecords: [],
  };
}

async function loadMockReviewCenterData(listParams: any): Promise<ReviewCenterData> {
  const mockData = await import('./mock/reviewCenterData');
  return createMockReviewCenterData(mockData, listParams);
}

export async function loadReviewCenterData(
  listParams: any,
  isExperReviewer: boolean,
): Promise<ReviewCenterData> {
  const transport = String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock')
    .trim()
    .toLowerCase();

  if (transport === 'http') {
    return isExperReviewer ? loadHttpReviewCenterData(listParams) : loadMockReviewCenterData(listParams);
  }

  return loadMockReviewCenterData(listParams);
}
