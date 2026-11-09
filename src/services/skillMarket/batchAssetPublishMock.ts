import type {
  HarnessAtomicAssetApiType,
  HarnessAtomicPublishHistoryRecord,
  HarnessAtomicPublishItem,
} from './atomicAssetPublishHttp';
import {
  batchPublishItemKey,
  type HarnessBatchPublishInput,
  type HarnessBatchPublishQuery,
} from './batchAssetPublishTypes';

const NAMES: Record<HarnessAtomicAssetApiType, string[]> = {
  AGENT: [
    '交付协同',
    '失败根因分析',
    '发布门禁决策',
    '日志关联分析',
    '智能回滚编排',
    '流水线异常分析',
    '发布风险评估',
    '测试用例评审',
    '缺陷根因分析',
    '代码审查',
    '需求澄清',
    '文档审阅',
    '运维巡检',
    '容量分析',
  ],
  SKILL: [
    '流水线失败诊断',
    '日志异常定位',
    '接口契约检查',
    '代码质量检查',
    '发布风险分析',
    '回滚方案生成',
    '测试覆盖分析',
    '缺陷复盘',
    '知识库检索',
    '数据清洗',
    '文本摘要',
    '报告生成',
    '运维巡检',
    '趋势预测',
  ],
  COMMAND: [
    '接口契约检查',
    '流水线重试',
    '发布检查',
    '日志查询',
    '服务回滚',
    '测试执行',
    '构建诊断',
    '环境检查',
    '创建工单',
    '发送通知',
    '更新配置',
    '导出报告',
    '运维巡检',
    '清理缓存',
  ],
};
const LABELS = { AGENT: 'Agent', SKILL: 'Skill', COMMAND: 'Command' };
const ORGANIZATIONS = [
  { orgCode: 'org-fuyao', orgName: '扶摇组织', deptName: '研发部' },
  { orgCode: 'org-yunshan', orgName: '云山组织', deptName: '平台工具组' },
  { orgCode: 'org-haichuan', orgName: '海川组织', deptName: '持续交付组' },
];
type MockAsset = HarnessAtomicPublishItem & { targetOrgId: string; failFirstAttempt: boolean };
type MockTask = {
  batchId: string;
  startedAt: number;
  retried: boolean;
  failFirstAttempt: boolean;
  record: HarnessAtomicPublishHistoryRecord;
};
const assets = new Map<string, MockAsset>();
const tasks = new Map<string, MockTask>();
const latestTaskByAsset = new Map<string, MockTask>();
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 180));
const ok = (data: unknown) => ({ meta: { success: true, message: 'OK' }, data });
const dateTime = () => new Date(Date.now()).toISOString().replace('T', ' ').slice(0, 19);
let sequence = 0;
const nextId = (prefix: string) => `mock-${prefix}-${Date.now()}-${++sequence}`;

function settle(task: MockTask): void {
  if (task.record.publishStatus !== '进行中' || Date.now() - task.startedAt < 1500) return;
  const failed = task.failFirstAttempt && !task.retried;
  task.record.publishStatus = failed ? '发布失败' : '发布成功';
  task.record.errorMessage = failed ? '目标服务暂时不可用，请重试' : '';
  task.record.updatedAt = dateTime();
}

export const batchAssetPublishMock = {
  // 与卡片内的发布历史共用这些任务，关闭批量弹窗后仍可查看和重试。
  assetHistory(
    assetType: HarnessAtomicAssetApiType,
    assetName: string,
    userId: string,
  ): HarnessAtomicPublishHistoryRecord[] {
    return [...tasks.values()]
      .filter(
        (task) =>
          task.record.assetType === assetType &&
          task.record.assetName === assetName &&
          task.record.operatorId === userId,
      )
      .reverse()
      .map((task) => {
        settle(task);
        return { ...task.record };
      });
  },
  hasTask(taskId: string): boolean {
    return tasks.has(taskId);
  },
  async queryPending(query: HarnessBatchPublishQuery) {
    await wait();
    const groups = ORGANIZATIONS.map((organization, index) => ({
      ...organization,
      deptCode: index === 0 ? query.deptCode : `${query.deptCode}-child-${index}`,
      assets: [] as Array<
        HarnessAtomicPublishItem & {
          description: string;
          dimType: string;
          dimCode: string;
          dimName: string;
          developOwnerName: string;
          developOwnerId: string;
          updatedAt: string;
        }
      >,
    }));
    NAMES[query.assetType].forEach((name, index) => {
      // 一个资产仅在一个组织分组中；第一个组织保留 12 项用于检查数量上限。
      const group = groups[index < 12 ? 0 : index - 11]!;
      const item = {
        assetType: query.assetType,
        assetName: `${name} ${LABELS[query.assetType]}`,
        assetVersion: `${index % 3}.1.${index % 5}`,
      };
      const key = batchPublishItemKey(item);
      assets.set(key, { ...item, targetOrgId: group.orgCode, failFirstAttempt: index === 1 });
      const task = latestTaskByAsset.get(key);
      if (task) {
        settle(task);
        if (task.record.publishStatus !== '发布失败') return;
      }
      const product = index % 2 === 1;
      group.assets.push({
        ...item,
        description: `${name}能力，用于分析任务上下文并输出处理结果。`,
        dimType: product ? '产品级' : '部门级',
        dimCode: product ? `${group.deptCode}-product` : group.deptCode,
        dimName: product ? 'Harness 流水线平台' : group.deptName,
        developOwnerName: index % 2 ? '李明' : '陈七',
        developOwnerId: index % 2 ? 'w30000006' : 'w30000008',
        updatedAt: '2026-11-01 10:00:00',
      });
    });
    return ok(groups.filter((group) => group.assets.length));
  },
  async submit(input: HarnessBatchPublishInput) {
    await wait();
    const organization = ORGANIZATIONS.find((org) => org.orgCode === input.targetOrgId);
    if (!organization) return { meta: { success: false, message: '目标组织不存在' }, data: null };
    const batchId = nextId('batch');
    const accepted: Array<HarnessAtomicPublishItem & { taskId: string }> = [];
    const rejected: Array<HarnessAtomicPublishItem & { reason: string }> = [];
    for (const item of input.items) {
      const key = batchPublishItemKey(item);
      const asset = assets.get(key);
      const previous = latestTaskByAsset.get(key);
      if (previous) settle(previous);
      const reason = !asset
        ? '该资产的版本包不存在'
        : asset.targetOrgId !== input.targetOrgId
          ? '目标组织与该维度的绑定关系不一致，请刷新后重试'
          : previous?.record.publishStatus === '进行中'
            ? '该资产正在发布中，请稍候'
            : previous?.record.publishStatus === '发布成功'
              ? '该版本已发布，无需重复发布'
              : '';
      if (reason) {
        rejected.push({ ...item, reason });
        continue;
      }
      const taskId = nextId('task');
      const task: MockTask = {
        batchId,
        startedAt: Date.now(),
        retried: false,
        failFirstAttempt: asset!.failFirstAttempt,
        record: {
          ...item,
          id: taskId,
          publishStatus: '进行中',
          errorMessage: '',
          source: '独立发布',
          targetOrgCode: input.targetOrgId,
          targetOrgName: organization.orgName,
          operatorId: input.userId,
          operatorName: input.userName,
          createdAt: dateTime(),
          updatedAt: dateTime(),
        },
      };
      tasks.set(taskId, task);
      latestTaskByAsset.set(key, task);
      accepted.push({ ...item, taskId });
    }
    return {
      meta: {
        success: rejected.length === 0,
        message: rejected.length ? '部分资产未受理，请查看明细' : 'OK',
      },
      data: { batchId: accepted.length ? batchId : '', accepted, rejected },
    };
  },
  async queryHistory(batchId: string, userId: string) {
    await wait();
    const records = [...tasks.values()]
      .filter((task) => task.batchId === batchId && task.record.operatorId === userId)
      .map((task) => {
        settle(task);
        return { ...task.record };
      });
    return ok({ records, total: records.length, pageNum: 1, pageSize: 10 });
  },
  async retry(taskId: string, userId: string) {
    await wait();
    const task = tasks.get(taskId);
    if (task) settle(task);
    if (
      !task ||
      task.record.operatorId !== userId ||
      task.record.publishStatus !== '发布失败' ||
      latestTaskByAsset.get(batchPublishItemKey(task.record)) !== task
    ) {
      return { meta: { success: false, message: '该发布任务不可重试，请刷新进度' }, data: null };
    }
    task.retried = true;
    task.startedAt = Date.now();
    task.record.publishStatus = '进行中';
    task.record.errorMessage = '';
    task.record.updatedAt = dateTime();
    return ok(null);
  },
};
