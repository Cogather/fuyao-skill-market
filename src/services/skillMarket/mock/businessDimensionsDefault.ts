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

function dimension(
  id: number,
  dimensionCode: string,
  dimensionName: string,
  sortNo: number,
  children: BusinessDimensionDto[] = [],
): BusinessDimensionDto {
  return {
    id,
    dimensionCode,
    dimensionName,
    name: dimensionName,
    nameEn: dimensionCode,
    level: 0,
    sortNo,
    enabled: 1,
    createdAt: stamp,
    updatedAt: stamp,
    children,
  };
}

const MOCK_BUSINESS_DIMENSIONS: BusinessDimensionDto[] = [
  dimension(1, 'COMMON', '公共能力', 1, [
    child(101, 'COMMON_TEMPLATE', '通用模板', 1),
    child(102, 'COMMON_ASSISTANT', '效率助手', 2),
    child(103, 'COMMON_KNOWLEDGE', '知识问答', 3),
    child(104, 'COMMON_REPORT', '报告撰写', 4),
    child(105, 'COMMON_MEETING', '会议纪要', 5),
    child(106, 'COMMON_TRANSLATION', '翻译润色', 6),
    child(107, 'COMMON_SEARCH', '资料检索', 7),
  ]),
  dimension(2, 'DESIGN', '设计', 2, [
    child(201, 'DESIGN_REQUIREMENT', '需求分析', 1),
    child(202, 'DESIGN_ARCHITECTURE', '架构设计', 2),
    child(203, 'DESIGN_INTERFACE', '接口设计', 3),
    child(204, 'DESIGN_REVIEW', '设计评审', 4),
    child(205, 'DESIGN_PROTOTYPE', '原型生成', 5),
    child(206, 'DESIGN_DOC', '设计文档', 6),
  ]),
  dimension(3, 'DEVELOPMENT', '开发', 3, [
    child(301, 'DEV_CODE_REVIEW', '代码评审', 1),
    child(302, 'DEV_API', '接口开发', 2),
    child(303, 'DEV_CICD', 'CI/CD', 3),
    child(304, 'DEV_REFACTOR', '代码重构', 4),
    child(305, 'DEV_DEBUG', '问题定位', 5),
    child(306, 'DEV_SCRIPT', '脚本生成', 6),
    child(307, 'DEV_DEPENDENCY', '依赖治理', 7),
  ]),
  dimension(4, 'TEST', '测试', 4, [
    child(401, 'TEST_CASE', '用例生成', 1),
    child(402, 'TEST_DATA', '测试数据', 2),
    child(403, 'TEST_AUTOMATION', '自动化测试', 3),
    child(404, 'TEST_REGRESSION', '回归分析', 4),
    child(405, 'TEST_DEFECT', '缺陷归因', 5),
    child(406, 'TEST_REPORT', '测试报告', 6),
  ]),
  dimension(5, 'OPERATIONS', '运维', 5, [
    child(501, 'OPS_LOG', '日志分析', 1),
    child(502, 'OPS_ALERT', '告警处理', 2),
    child(503, 'OPS_MONITOR', '监控巡检', 3),
    child(504, 'OPS_CAPACITY', '容量评估', 4),
    child(505, 'OPS_INCIDENT', '故障复盘', 5),
    child(506, 'OPS_RUNBOOK', '运行手册', 6),
  ]),
  dimension(6, 'MAINTENANCE', '维护', 6, [
    child(601, 'MAINTENANCE_SQL', 'SQL 治理', 1),
    child(602, 'MAINTENANCE_RELEASE', '发布维护', 2),
    child(603, 'MAINTENANCE_IMPACT', '影响分析', 3),
    child(604, 'MAINTENANCE_CONFIG', '配置核对', 4),
    child(605, 'MAINTENANCE_CLEANUP', '资产清理', 5),
  ]),
  dimension(7, 'RESEARCH', '研究', 7, [
    child(701, 'RESEARCH_TECH', '技术调研', 1),
    child(702, 'RESEARCH_PAPER', '论文解读', 2),
    child(703, 'RESEARCH_BENCHMARK', '竞品分析', 3),
    child(704, 'RESEARCH_EXPERIMENT', '实验设计', 4),
  ]),
  dimension(8, 'PROJECT_MANAGEMENT', '项目管理', 8, [
    child(801, 'PM_DAILY', '日报周报', 1),
    child(802, 'PM_RISK', '风险跟踪', 2),
    child(803, 'PM_DELIVERY', '交付管理', 3),
    child(804, 'PM_PLAN', '计划排期', 4),
    child(805, 'PM_REVIEW', '里程碑复盘', 5),
  ]),
  dimension(9, 'DEVELOPMENT', '数据分析', 9, [
    child(901, 'DATA_DASHBOARD', '看板分析', 1),
    child(902, 'DATA_SQL', 'SQL 生成', 2),
    child(903, 'DATA_QUALITY', '数据质量', 3),
    child(904, 'DATA_METRIC', '指标口径', 4),
    child(905, 'DATA_ANOMALY', '异常识别', 5),
    child(906, 'DATA_FORECAST', '趋势预测', 6),
  ]),
  dimension(10, 'PROJECT_MANAGEMENT', '经营管理', 10, [
    child(1001, 'BIZ_STRATEGY', '经营复盘', 1),
    child(1002, 'BIZ_TARGET', '目标拆解', 2),
    child(1003, 'BIZ_BUDGET', '预算跟踪', 3),
    child(1004, 'BIZ_MEETING', '经营会议', 4),
    child(1005, 'BIZ_DECISION', '决策建议', 5),
  ]),
  dimension(11, 'COMMON', '客户运营', 11, [
    child(1101, 'CUSTOMER_PROFILE', '客户画像', 1),
    child(1102, 'CUSTOMER_VISIT', '拜访纪要', 2),
    child(1103, 'CUSTOMER_FEEDBACK', '反馈归因', 3),
    child(1104, 'CUSTOMER_SUCCESS', '成功方案', 4),
    child(1105, 'CUSTOMER_SCRIPT', '沟通话术', 5),
  ]),
  dimension(12, 'OPERATIONS', '供应链协同', 12, [
    child(1201, 'SCM_DEMAND', '需求协同', 1),
    child(1202, 'SCM_INVENTORY', '库存分析', 2),
    child(1203, 'SCM_SUPPLIER', '供应商管理', 3),
    child(1204, 'SCM_DELIVERY', '交付跟踪', 4),
    child(1205, 'SCM_RISK', '供应风险', 5),
  ]),
  dimension(13, 'COMMON', '财务管理', 13, [
    child(1301, 'FIN_RECONCILE', '账务核对', 1),
    child(1302, 'FIN_INVOICE', '发票处理', 2),
    child(1303, 'FIN_COST', '成本分析', 3),
    child(1304, 'FIN_AUDIT', '审计材料', 4),
    child(1305, 'FIN_FORECAST', '财务预测', 5),
  ]),
  dimension(14, 'TEST', '安全合规', 14, [
    child(1401, 'SEC_POLICY', '制度解读', 1),
    child(1402, 'SEC_AUDIT', '合规检查', 2),
    child(1403, 'SEC_PRIVACY', '隐私评估', 3),
    child(1404, 'SEC_RISK', '安全风险', 4),
    child(1405, 'SEC_RESPONSE', '应急响应', 5),
  ]),
  dimension(15, 'COMMON', '人力行政', 15, [
    child(1501, 'HR_RECRUIT', '招聘筛选', 1),
    child(1502, 'HR_ONBOARD', '入职指引', 2),
    child(1503, 'HR_POLICY', '制度问答', 3),
    child(1504, 'HR_TRAINING', '培训计划', 4),
    child(1505, 'HR_SUMMARY', '行政总结', 5),
  ]),
  dimension(16, 'RESEARCH', '知识管理', 16, [
    child(1601, 'KM_CLASSIFY', '知识分类', 1),
    child(1602, 'KM_EXTRACT', '要点抽取', 2),
    child(1603, 'KM_QA', '知识问答', 3),
    child(1604, 'KM_UPDATE', '知识更新', 4),
    child(1605, 'KM_RECOMMEND', '知识推荐', 5),
  ]),
  dimension(17, 'PROJECT_MANAGEMENT', '交付实施', 17, [
    child(1701, 'DELIVERY_PLAN', '实施计划', 1),
    child(1702, 'DELIVERY_ACCEPTANCE', '验收材料', 2),
    child(1703, 'DELIVERY_TRAINING', '交付培训', 3),
    child(1704, 'DELIVERY_ISSUE', '问题跟进', 4),
    child(1705, 'DELIVERY_SUMMARY', '交付总结', 5),
  ]),
  dimension(18, 'DEVELOPMENT', 'AI 应用', 18, [
    child(1801, 'AI_PROMPT', '提示词工程', 1),
    child(1802, 'AI_AGENT', 'Agent 编排', 2),
    child(1803, 'AI_EVAL', '效果评测', 3),
    child(1804, 'AI_RAG', '知识增强', 4),
    child(1805, 'AI_TOOL', '工具调用', 5),
    child(1806, 'AI_GUARDRAIL', '安全护栏', 6),
  ]),
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
