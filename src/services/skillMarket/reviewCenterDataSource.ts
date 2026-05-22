import type {
  ComputeChannelRow,
  MedalLeaderboardRow,
  ReviewDimensionDetail,
  ReviewHistoryRecord,
  ReviewRankingCard,
  ReviewTaskCard,
} from './mock/reviewCenterData';

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

function createEmptyReviewCenterData(): ReviewCenterData {
  return {
    rankingCards: [],
    taskCards: [],
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

async function loadHttpReviewCenterData(): Promise<ReviewCenterData> {
  // TODO: 后端接口确定后，在 skillBaseService 中补齐评审页查询方法，并在这里组装真实响应数据。
  return createEmptyReviewCenterData();
}

async function loadMockReviewCenterData(): Promise<ReviewCenterData> {
  const mockData = await import('./mock/reviewCenterData');
  return createMockReviewCenterData(mockData);
}

export async function loadReviewCenterData(): Promise<ReviewCenterData> {
  const transport = String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock')
    .trim()
    .toLowerCase();

  if (transport === 'http') {
    return loadHttpReviewCenterData();
  }

  return loadMockReviewCenterData();
}
