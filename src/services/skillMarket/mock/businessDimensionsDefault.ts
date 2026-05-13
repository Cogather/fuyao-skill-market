import type { BusinessDimensionDto } from '../apiTypes';

const MOCK_BUSINESS_DIMENSIONS: BusinessDimensionDto[] = [
  {
    id: 1,
    dimensionCode: 'COMMON',
    dimensionName: '公共',
    sortNo: 1,
    enabled: 1,
    createdAt: '2026-05-13 00:00:00',
    updatedAt: '2026-05-13 00:00:00',
  },
  {
    id: 2,
    dimensionCode: 'DESIGN',
    dimensionName: '设计',
    sortNo: 2,
    enabled: 1,
    createdAt: '2026-05-13 00:00:00',
    updatedAt: '2026-05-13 00:00:00',
  },
  {
    id: 3,
    dimensionCode: 'DEVELOPMENT',
    dimensionName: '开发',
    sortNo: 3,
    enabled: 1,
    createdAt: '2026-05-13 00:00:00',
    updatedAt: '2026-05-13 00:00:00',
  },
  {
    id: 4,
    dimensionCode: 'TEST',
    dimensionName: '测试',
    sortNo: 4,
    enabled: 1,
    createdAt: '2026-05-13 00:00:00',
    updatedAt: '2026-05-13 00:00:00',
  },
  {
    id: 5,
    dimensionCode: 'OPERATIONS',
    dimensionName: '运维',
    sortNo: 5,
    enabled: 1,
    createdAt: '2026-05-13 00:00:00',
    updatedAt: '2026-05-13 00:00:00',
  },
  {
    id: 6,
    dimensionCode: 'MAINTENANCE',
    dimensionName: '维护',
    sortNo: 6,
    enabled: 1,
    createdAt: '2026-05-13 00:00:00',
    updatedAt: '2026-05-13 00:00:00',
  },
  {
    id: 7,
    dimensionCode: 'RESEARCH',
    dimensionName: '研究',
    sortNo: 7,
    enabled: 1,
    createdAt: '2026-05-13 00:00:00',
    updatedAt: '2026-05-13 00:00:00',
  },
  {
    id: 8,
    dimensionCode: 'PROJECT_MANAGEMENT',
    dimensionName: '项目管理',
    sortNo: 8,
    enabled: 1,
    createdAt: '2026-05-13 00:00:00',
    updatedAt: '2026-05-13 00:00:00',
  },
];

export function getMockBusinessDimensions(): BusinessDimensionDto[] {
  return MOCK_BUSINESS_DIMENSIONS.map((item) => ({ ...item }));
}
