import type { BusinessDimensionDto } from '../apiTypes';

const stamp = '2026-05-13 00:00:00';

function child(
  id: number,
  dimensionCode: string,
  dimensionName: string,
  sortNo: number,
): BusinessDimensionDto {
  return {
    id,
    dimensionCode,
    dimensionName,
    name: dimensionName,
    nameEn: dimensionCode,
    level: 1,
    sortNo,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const MOCK_BUSINESS_DIMENSIONS: BusinessDimensionDto[] = [
  {
    id: 1,
    dimensionCode: 'COMMON',
    dimensionName: '公共',
    name: '公共',
    nameEn: 'Common',
    level: 0,
    sortNo: 1,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
    children: [
      child(101, 'COMMON_TEMPLATE', '通用模板', 1),
      child(102, 'COMMON_ASSISTANT', '效率助手', 2),
      child(103, 'COMMON_KNOWLEDGE', '知识问答', 3),
    ],
  },
  {
    id: 2,
    dimensionCode: 'DESIGN',
    dimensionName: '设计',
    name: '设计',
    nameEn: 'Design',
    level: 0,
    sortNo: 2,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
    children: [
      child(201, 'DESIGN_REQUIREMENT', '需求分析', 1),
      child(202, 'DESIGN_ARCHITECTURE', '架构设计', 2),
      child(203, 'DESIGN_INTERFACE', '接口设计', 3),
      child(204, 'DESIGN_REVIEW', '设计评审', 4),
    ],
  },
  {
    id: 3,
    dimensionCode: 'DEVELOPMENT',
    dimensionName: '开发',
    name: '开发',
    nameEn: 'Development',
    level: 0,
    sortNo: 3,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
    children: [
      child(301, 'DEV_CODE_REVIEW', '代码评审', 1),
      child(302, 'DEV_API', '接口开发', 2),
      child(303, 'DEV_CICD', 'CI/CD', 3),
      child(304, 'DEV_REFACTOR', '代码重构', 4),
      child(305, 'DEV_DEBUG', '问题定位', 5),
    ],
  },
  {
    id: 4,
    dimensionCode: 'TEST',
    dimensionName: '测试',
    name: '测试',
    nameEn: 'Test',
    level: 0,
    sortNo: 4,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
    children: [
      child(401, 'TEST_CASE', '用例生成', 1),
      child(402, 'TEST_DATA', '测试数据', 2),
      child(403, 'TEST_AUTOMATION', '自动化测试', 3),
      child(404, 'TEST_REGRESSION', '回归分析', 4),
    ],
  },
  {
    id: 5,
    dimensionCode: 'OPERATIONS',
    dimensionName: '运维',
    name: '运维',
    nameEn: 'Operations',
    level: 0,
    sortNo: 5,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
    children: [
      child(501, 'OPS_LOG', '日志分析', 1),
      child(502, 'OPS_ALERT', '告警处理', 2),
      child(503, 'OPS_MONITOR', '监控巡检', 3),
    ],
  },
  {
    id: 6,
    dimensionCode: 'MAINTENANCE',
    dimensionName: '维护',
    name: '维护',
    nameEn: 'Maintenance',
    level: 0,
    sortNo: 6,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
    children: [
      child(601, 'MAINTENANCE_SQL', 'SQL治理', 1),
      child(602, 'MAINTENANCE_RELEASE', '发布维护', 2),
      child(603, 'MAINTENANCE_IMPACT', '影响分析', 3),
    ],
  },
  {
    id: 7,
    dimensionCode: 'RESEARCH',
    dimensionName: '研究',
    name: '研究',
    nameEn: 'Research',
    level: 0,
    sortNo: 7,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: 8,
    dimensionCode: 'PROJECT_MANAGEMENT',
    dimensionName: '项目管理',
    name: '项目管理',
    nameEn: 'ProjectManagement',
    level: 0,
    sortNo: 8,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
    children: [
      child(801, 'PM_DAILY', '日报周报', 1),
      child(802, 'PM_RISK', '风险跟踪', 2),
      child(803, 'PM_DELIVERY', '交付管理', 3),
    ],
  },
];

function cloneDimension(item: BusinessDimensionDto): BusinessDimensionDto {
  return {
    ...item,
    children: item.children?.map(cloneDimension),
  };
}

export function getMockBusinessDimensions(): BusinessDimensionDto[] {
  return MOCK_BUSINESS_DIMENSIONS.map(cloneDimension);
}
