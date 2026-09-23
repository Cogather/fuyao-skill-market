import httpRequest from './request';
import {
  getSkillBehaviorEvaluationMock,
  getSkillBehaviorTrendMock,
} from './mock/skillBehaviorEvaluation';

export type SkillBehaviorEvaluationMode = 'TRIGGER' | 'QUALITY';
export type SkillBehaviorEvaluationState =
  'queuing' | 'executing' | 'pending' | 'running' | 'completed' | 'failed';

export interface SkillTriggerEvaluationResultDto {
  case_id: string;
  task: string;
  type: 'positive' | 'negative';
  expect_trigger: boolean;
  actual_trigger: boolean;
  passed: boolean;
}

export interface SkillTriggerEvaluationReportDto {
  agent_name: string;
  model: string;
  positive_trigger_rate: string;
  negative_false_trigger_rate: string;
  accuracy: string;
  total_cost_time: string;
  results: SkillTriggerEvaluationResultDto[];
}

export interface SkillQualityEvaluationResultDto {
  case_id: string;
  task: string;
  expect: string;
  output: string;
  score: number;
  cost_time: number;
  passed: boolean;
  reason: string;
}

export interface SkillQualityEvaluationReportDto {
  agent_name: string;
  model: string;
  pass_rate: string;
  total_cost_time: string;
  results: SkillQualityEvaluationResultDto[];
}

export type SkillBehaviorEvaluationReportDto =
  SkillTriggerEvaluationReportDto | SkillQualityEvaluationReportDto;

export interface SkillBehaviorEvaluationRecordDto {
  id: number | string;
  skillName: string;
  version: string;
  mode: SkillBehaviorEvaluationMode;
  creator: string;
  creatorName: string;
  taskId: string;
  state: SkillBehaviorEvaluationState;
  report: SkillBehaviorEvaluationReportDto | null;
  error: string | null;
  createTime: string;
  updateTime: string;
}

export interface TriggerSkillBehaviorEvaluationBody {
  skillName: string;
  version: string;
  mode: SkillBehaviorEvaluationMode;
  userId: string;
  userName: string;
}

export interface TriggerSkillBehaviorEvaluationResultDto {
  taskId: string;
  skillName: string;
  version: string;
  mode: SkillBehaviorEvaluationMode;
  state: 'queuing';
  needGenerate: boolean;
  existingCaseCount: number;
}

export interface SkillBehaviorTrendPointDto {
  version: string;
  value: number;
  evalTime: string;
}

export interface SkillBehaviorEvaluationTrendDto {
  quality: SkillBehaviorTrendPointDto[];
  trigger: SkillBehaviorTrendPointDto[];
}

type ResponseObject<T> = {
  code?: number;
  message?: string;
  meta?: { success?: boolean; message?: string };
  data?: T;
};

export class SkillBehaviorEvaluationNotFoundError extends Error {}

const ENDPOINT = '/v1/harness/skill-eval/behavior-eval';
const transportIsHttp =
  String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock').toLowerCase() === 'http';
const mockRecords = new Map<string, SkillBehaviorEvaluationRecordDto>();
const MOCK_UNEVALUATED_SKILL_NAME = '流水线失败诊断 Skill';

function mockKey(skillName: string, version: string, mode: SkillBehaviorEvaluationMode): string {
  return `${skillName}\u0000${version}\u0000${mode}`;
}

function isMockUnevaluatedSkill(skillName: string): boolean {
  return skillName === MOCK_UNEVALUATED_SKILL_NAME;
}

function responseMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const body = value as Record<string, unknown>;
  const direct = typeof body.message === 'string' ? body.message : '';
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : null;
  const metaMessage =
    meta && typeof (meta as Record<string, unknown>).message === 'string'
      ? String((meta as Record<string, unknown>).message)
      : '';
  const response = body.response && typeof body.response === 'object' ? body.response : null;
  const responseData = response ? (response as Record<string, unknown>).data : null;
  const responseDataMessage = responseMessage(responseData, '');
  return responseDataMessage || metaMessage.trim() || direct.trim() || fallback;
}

function unwrap<T>(response: ResponseObject<T>, fallback: string): T {
  const success =
    response.meta?.success ??
    (response.code === 0 ||
      (typeof response.code === 'number' && response.code >= 200 && response.code < 300));
  if (!success) {
    const message = response.meta?.message || response.message || fallback;
    if (message.includes('未找到该版本的评测记录')) {
      throw new SkillBehaviorEvaluationNotFoundError(message);
    }
    throw new Error(message);
  }
  if (response.data === undefined || response.data === null) throw new Error(fallback);
  return response.data;
}

function percent(passed: number, total: number): string {
  return `${total ? ((passed / total) * 100).toFixed(2) : '0.00'}%`;
}

function mockRecord(
  skillName: string,
  version: string,
  mode: SkillBehaviorEvaluationMode,
): SkillBehaviorEvaluationRecordDto | null {
  const overridden = mockRecords.get(mockKey(skillName, version, mode));
  if (overridden) return structuredClone(overridden);
  if (isMockUnevaluatedSkill(skillName)) return null;
  const evaluation = getSkillBehaviorEvaluationMock({ version });
  if (!evaluation) return null;
  const report: SkillBehaviorEvaluationReportDto =
    mode === 'TRIGGER'
      ? {
          agent_name: 'CodeAgent',
          model: evaluation.model,
          positive_trigger_rate: `${evaluation.triggerCases.filter((item) => item.type === '正向' && item.actual).length}/${evaluation.triggerCases.filter((item) => item.type === '正向').length}`,
          negative_false_trigger_rate: `${evaluation.triggerCases.filter((item) => item.type === '反向' && item.actual).length}/${evaluation.triggerCases.filter((item) => item.type === '反向').length}`,
          accuracy: percent(
            evaluation.triggerCases.filter((item) => item.passed).length,
            evaluation.triggerCases.length,
          ),
          total_cost_time: `${evaluation.summaries.trigger.durationSeconds.toFixed(2)}s`,
          results: evaluation.triggerCases.map((item) => ({
            case_id: item.id,
            task: item.task,
            type: item.type === '正向' ? 'positive' : 'negative',
            expect_trigger: item.expected,
            actual_trigger: item.actual,
            passed: item.passed,
          })),
        }
      : {
          agent_name: 'CodeAgent',
          model: evaluation.model,
          pass_rate: percent(
            evaluation.qualityCases.filter((item) => item.passed).length,
            evaluation.qualityCases.length,
          ),
          total_cost_time: `${evaluation.summaries.quality.durationSeconds.toFixed(2)}s`,
          results: evaluation.qualityCases.map((item) => ({
            case_id: item.id,
            task: item.task,
            expect: item.details[0]?.content ?? '',
            output: item.details[1]?.content ?? '',
            score: item.score,
            cost_time: Number.parseFloat(item.duration) || 0,
            passed: item.passed,
            reason: item.details[2]?.content ?? '',
          })),
        };
  return {
    id: `${mode}-${version}`,
    skillName,
    version,
    mode,
    creator: evaluation.triggeredById,
    creatorName: evaluation.triggeredBy,
    taskId: `mock-${mode.toLowerCase()}-${version}`,
    state: 'completed',
    report,
    error: null,
    createTime: `${evaluation.triggeredAt}:00`.replace(/:00:00$/, ':00'),
    updateTime: `${evaluation.triggeredAt}:00`.replace(/:00:00$/, ':00'),
  };
}

function completedMockRecord(
  body: TriggerSkillBehaviorEvaluationBody,
  taskId: string,
): SkillBehaviorEvaluationRecordDto {
  const seeded = mockRecord('__mock_behavior_seed__', '1.10.0', body.mode);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return {
    ...(seeded as SkillBehaviorEvaluationRecordDto),
    id: `mock-${Date.now()}`,
    skillName: body.skillName,
    version: body.version,
    mode: body.mode,
    creator: body.userId,
    creatorName: body.userName,
    taskId,
    state: 'completed',
    error: null,
    createTime: now,
    updateTime: now,
  };
}

export function isSkillBehaviorEvaluationInProgress(
  state: SkillBehaviorEvaluationState | undefined,
): boolean {
  return Boolean(state && state !== 'completed' && state !== 'failed');
}

export function isSkillBehaviorEvaluationNotFound(error: unknown): boolean {
  return (
    error instanceof SkillBehaviorEvaluationNotFoundError ||
    responseMessage(error, '').includes('未找到该版本的评测记录')
  );
}

export async function querySkillBehaviorEvaluation(input: {
  skillName: string;
  version: string;
  mode: SkillBehaviorEvaluationMode;
}): Promise<SkillBehaviorEvaluationRecordDto | null> {
  if (!transportIsHttp) return mockRecord(input.skillName, input.version, input.mode);
  try {
    const response = await httpRequest.api<ResponseObject<SkillBehaviorEvaluationRecordDto>>({
      url: ENDPOINT,
      method: 'get',
      params: input,
    });
    return unwrap(response, '评测记录加载失败');
  } catch (error) {
    if (isSkillBehaviorEvaluationNotFound(error)) return null;
    throw new Error(responseMessage(error, '评测记录加载失败'));
  }
}

export async function triggerSkillBehaviorEvaluation(
  body: TriggerSkillBehaviorEvaluationBody,
): Promise<TriggerSkillBehaviorEvaluationResultDto> {
  if (!transportIsHttp) {
    body = {
      ...body,
      userId: body.userId.trim() || 'mock-user',
      userName: body.userName.trim() || '模拟用户',
    };
    const current = mockRecord(body.skillName, body.version, body.mode);
    if (isSkillBehaviorEvaluationInProgress(current?.state)) {
      throw new Error('该版本已有进行中的评测任务');
    }
    const taskId = `mock-${Date.now()}-${body.mode.toLowerCase()}`;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    mockRecords.set(mockKey(body.skillName, body.version, body.mode), {
      id: taskId,
      skillName: body.skillName,
      version: body.version,
      mode: body.mode,
      creator: body.userId,
      creatorName: body.userName,
      taskId,
      state: 'queuing',
      report: null,
      error: null,
      createTime: now,
      updateTime: now,
    });
    window.setTimeout(() => {
      mockRecords.set(
        mockKey(body.skillName, body.version, body.mode),
        completedMockRecord(body, taskId),
      );
    }, 1_200);
    return {
      taskId,
      skillName: body.skillName,
      version: body.version,
      mode: body.mode,
      state: 'queuing',
      needGenerate: !current,
      existingCaseCount: current?.report
        ? 'results' in current.report
          ? current.report.results.length
          : 0
        : 0,
    };
  }
  if (!body.skillName.trim() || !body.version.trim()) throw new Error('Skill 名称和版本不能为空');
  if (!body.userId.trim() || !body.userName.trim()) throw new Error('当前登录用户信息不完整');
  try {
    const response = await httpRequest.api<ResponseObject<TriggerSkillBehaviorEvaluationResultDto>>(
      {
        url: ENDPOINT,
        method: 'post',
        data: body,
      },
    );
    return unwrap(response, '发起评测失败');
  } catch (error) {
    throw new Error(responseMessage(error, '发起评测失败'));
  }
}

export async function querySkillBehaviorEvaluationTrend(
  skillName: string,
  mockVersions: string[] = [],
): Promise<SkillBehaviorEvaluationTrendDto> {
  if (!transportIsHttp) {
    const availableVersions = isMockUnevaluatedSkill(skillName) ? [] : mockVersions;
    const merged = getSkillBehaviorTrendMock(availableVersions);
    return {
      quality: merged.map((point) => ({
        version: point.version,
        value: point.qualityRate,
        evalTime: '',
      })),
      trigger: merged.map((point) => ({
        version: point.version,
        value: point.triggerRate,
        evalTime: '',
      })),
    };
  }
  try {
    const response = await httpRequest.api<ResponseObject<SkillBehaviorEvaluationTrendDto>>({
      url: `${ENDPOINT}/trend`,
      method: 'get',
      params: { skillName },
    });
    const data = unwrap(response, '版本趋势加载失败');
    return {
      quality: Array.isArray(data.quality) ? data.quality : [],
      trigger: Array.isArray(data.trigger) ? data.trigger : [],
    };
  } catch (error) {
    throw new Error(responseMessage(error, '版本趋势加载失败'));
  }
}
