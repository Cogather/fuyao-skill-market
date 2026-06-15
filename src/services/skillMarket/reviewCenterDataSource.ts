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

function createMockReviewCenterData(mockData: ReviewCenterMockModule): ReviewCenterData {
  return {
    rankingCards: mockData.mockReviewRankingCards.map((card) => ({
      ...card,
      columns: [...card.columns],
      rows: card.rows.map((row) => [...row]),
    })),
    taskCards: mockData.mockReviewTaskCards.map((task) => ({ ...task, tags: [...task.tags] })),
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

async function loadMockReviewCenterData(): Promise<ReviewCenterData> {
  const mockData = await import('./mock/reviewCenterData');
  return createMockReviewCenterData(mockData);
}

export async function loadReviewCenterData(
  listParams: any,
  isExperReviewer: boolean,
): Promise<ReviewCenterData> {
  const transport = String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock')
    .trim()
    .toLowerCase();

  if (transport === 'http') {
    return isExperReviewer ? loadHttpReviewCenterData(listParams) : loadMockReviewCenterData();
  }

  return loadMockReviewCenterData();
}
