import type {
  ExtensionCapability,
  ExtensionCapabilityType,
  ExtensionProduct,
  ExtensionRelease,
  ExtensionReleaseItem,
  ExtensionScene,
} from './extensionPublishMock';
import { skillBaseService } from './skillBaseService';
import { getProductPlanning, querySkillPlanningSceneOptionGroups } from './skillPlanningService';
import type { SkillPlanningOptionGroup } from './skillPlanningShared';

export type ExtensionScope = {
  dimType: '产品级' | '部门级';
  dimCode: string;
  dimName: string;
  productId: string;
  departmentPath: string[];
};

export type PublishableOrganization = {
  id: string;
  name: string;
  deptId: string;
  deptName: string;
};

export type PublishExtensionInput = {
  userId: string;
  operatorName: string;
  scope: ExtensionScope;
  scene: ExtensionScene;
  extensionName: string;
  description: string;
  channel: ExtensionRelease['channel'];
  organization: PublishableOrganization;
};

type HttpExtensionRelease = ExtensionRelease & {
  firstScene: string;
  secondScene: string;
};

type RecordValue = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}

function readText(record: RecordValue, keys: string[]): string {
  for (const key of keys) {
    const text = normalizeText(record[key]);
    if (text && !/^(undefined|null)$/i.test(text)) return text;
  }
  return '';
}

function readArray(record: RecordValue, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function unwrapResponseData(response: unknown): unknown {
  let value = response;
  for (let depth = 0; depth < 3; depth += 1) {
    const record = asRecord(value);
    const next = record.data ?? record.result;
    if (next === undefined || next === value) break;
    value = next;
  }
  return value;
}

function responseMessage(response: unknown, fallback: string): string {
  const record = asRecord(response);
  const meta = asRecord(record.meta);
  return readText(meta, ['message', 'msg']) || readText(record, ['message', 'msg']) || fallback;
}

function assertHttpSuccess(response: unknown, fallback: string): void {
  const record = asRecord(response);
  const meta = asRecord(record.meta);
  const code = Number(record.code ?? 0);
  if (
    meta.success === false ||
    record.success === false ||
    (Number.isFinite(code) && code >= 400)
  ) {
    throw new Error(responseMessage(response, fallback));
  }
}

function requiredText(value: unknown, message: string): string {
  const text = normalizeText(value);
  if (!text || /^(undefined|null)$/i.test(text)) throw new Error(message);
  return text;
}

function normalizedVersion(value: unknown): string {
  return normalizeText(value);
}

function normalizeDate(value: unknown): string {
  if (Array.isArray(value) && value.length >= 3) {
    const [year = 0, month = 0, day = 0, hour = 0, minute = 0] = value.map(Number);
    if ([year, month, day, hour, minute].every(Number.isFinite)) {
      const pad = (item: number) => String(item).padStart(2, '0');
      return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
    }
  }
  return normalizeText(value)
    .replace('T', ' ')
    .replace(/:\d{2}(?:\.\d+)?Z?$/, '');
}

function normalizeReleaseStatus(value: unknown): ExtensionRelease['status'] {
  const status = normalizeText(value).toLowerCase();
  if (/失败|fail|error|rejected/.test(status)) return '失败';
  if (/进行|发布中|pending|processing|running|progress/.test(status)) return '进行中';
  return '成功';
}

function normalizeReleaseChannel(value: unknown): ExtensionRelease['channel'] {
  const channel = normalizeText(value).toLowerCase();
  return /product|prod|正式/.test(channel) ? 'Product' : 'Beta';
}

function normalizeReady(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const status = normalizeText(value).toLowerCase();
  if (!status) return null;
  if (/不完备|未就绪|未完成|不可发布|incomplete|not.ready|unready/.test(status)) return false;
  if (/已就绪|就绪|已完成|可发布|ready|complete|publishable/.test(status)) return true;
  return null;
}

function stableId(parts: string[]): string {
  return parts
    .join('-')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-');
}

function mapReleaseItems(record: RecordValue): ExtensionReleaseItem[] {
  const sources: Array<{ type: ExtensionCapabilityType; keys: string[] }> = [
    { type: 'skill', keys: ['skills', 'skillList'] },
    { type: 'command', keys: ['commands', 'commandList'] },
    { type: 'agent', keys: ['agents', 'agentList'] },
  ];
  return sources.flatMap(({ type, keys }) =>
    readArray(record, keys).flatMap((value) => {
      const item = asRecord(value);
      const name = readText(item, ['name', 'componentName', `${type}Name`]);
      if (!name) return [];
      return [{ type, name, version: normalizedVersion(item.version) }];
    }),
  );
}

function mapHistoryRelease(value: unknown): HttpExtensionRelease {
  const outer = asRecord(value);
  const nested = asRecord(outer.extensionEntity ?? outer.extension ?? outer.entity);
  const record = Object.keys(nested).length ? { ...outer, ...nested } : outer;
  return {
    id: readText(record, ['id', 'extensionId', 'publishId', 'releaseId']),
    version: normalizedVersion(
      record.version ?? record.releaseVersion ?? record.extensionVersion ?? record.versionNo,
    ),
    extensionName: readText(record, ['extensionName', 'name']),
    description: readText(record, ['description', 'extensionDescription']),
    channel: normalizeReleaseChannel(record.releaseType ?? record.channel),
    operator: {
      no: readText(record, ['operatorId', 'operatorNo', 'userId', 'creatorId', 'createdBy']),
      name: readText(record, ['operatorName', 'userName', 'creatorName']) || '—',
    },
    publishedAt: normalizeDate(
      record.publishedAt ?? record.publishAt ?? record.updatedAt ?? record.createdAt,
    ),
    status: normalizeReleaseStatus(record.publishStatus ?? record.status),
    organization: readText(record, ['targetOrgName', 'organizationName', 'orgName']),
    items: mapReleaseItems(record),
    failReason: readText(record, ['failReason', 'failureReason', 'errorMessage', 'message']),
    firstScene: readText(record, ['firstScene', 'primaryScene']),
    secondScene: readText(record, ['secondScene', 'secondaryScene']),
  };
}

function historyRows(response: unknown): unknown[] {
  const data = unwrapResponseData(response);
  if (Array.isArray(data)) return data;
  return readArray(asRecord(data), ['list', 'records', 'items', 'rows', 'content']);
}

function historyTotal(response: unknown, fallback: number): number {
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  const data = asRecord(unwrapResponseData(response));
  for (const value of [data.total, data.number, meta.number, responseRecord.total]) {
    const total = Number(value);
    if (Number.isFinite(total) && total >= 0) return total;
  }
  return fallback;
}

async function queryAllHistory(scope: ExtensionScope): Promise<HttpExtensionRelease[]> {
  const pageSize = 100;
  const body = {
    dimType: scope.dimType,
    dimCode: scope.dimCode,
    dimName: scope.dimName,
    keyword: '',
    publishStatus: '',
    releaseType: '',
    pageNum: 1,
    pageSize,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  };
  const firstResponse = await skillBaseService.queryPublishedHistoryList(body);
  assertHttpSuccess(firstResponse, '发布历史加载失败');
  const firstRows = historyRows(firstResponse);
  const rows = [...firstRows];
  const pageCount = Math.min(100, Math.ceil(historyTotal(firstResponse, rows.length) / pageSize));
  for (let pageNum = 2; pageNum <= pageCount; pageNum += 1) {
    const response = await skillBaseService.queryPublishedHistoryList({ ...body, pageNum });
    assertHttpSuccess(response, '发布历史加载失败');
    rows.push(...historyRows(response));
  }
  return rows
    .map(mapHistoryRelease)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function componentRows(record: RecordValue, type: ExtensionCapabilityType): unknown[] {
  const components = asRecord(record.components);
  return readArray(components, [type === 'skill' ? 'skills' : `${type}s`]);
}

function mapCapability(
  value: unknown,
  type: ExtensionCapabilityType,
  sceneKey: string,
  index: number,
): ExtensionCapability {
  const record = asRecord(value);
  const name = readText(record, ['name', 'componentName', `${type}Name`]);
  const version = normalizedVersion(record.version);
  const explicitReady = normalizeReady(record.ready ?? record.status ?? record.publishStatus);
  return {
    id:
      readText(record, ['id', 'componentId', 'packageId']) ||
      stableId([sceneKey, type, name || String(index)]),
    name,
    version,
    publishDate: normalizeDate(record.uploadAt ?? record.updatedAt ?? record.publishedAt).slice(
      0,
      10,
    ),
    ready: explicitReady ?? Boolean(name && version),
    files: [],
  };
}

function sameScene(
  release: HttpExtensionRelease,
  firstScene: string,
  secondScene: string,
): boolean {
  return release.firstScene === firstScene && release.secondScene === secondScene;
}

function mapBindingScenes(
  response: unknown,
  scope: ExtensionScope,
  releases: HttpExtensionRelease[],
): ExtensionScene[] {
  assertHttpSuccess(response, '场景及绑定规划件加载失败');
  const data = unwrapResponseData(response);
  const firstSceneRows = Array.isArray(data)
    ? data
    : readArray(asRecord(data), ['scenes', 'list', 'records', 'items']);
  return firstSceneRows.flatMap((firstValue, firstIndex) => {
    const firstRecord = asRecord(firstValue);
    const firstScene = readText(firstRecord, ['firstScene', 'name', 'sceneName']);
    return readArray(firstRecord, ['secondScenes', 'children', 'subScenes']).map(
      (secondValue, secondIndex): ExtensionScene => {
        const secondRecord = asRecord(secondValue);
        const secondScene = readText(secondRecord, ['secondScene', 'name', 'sceneName']);
        const sceneKey = stableId([
          scope.productId || scope.dimCode,
          firstScene || String(firstIndex),
          secondScene || String(secondIndex),
        ]);
        const capabilities = {
          skill: componentRows(secondRecord, 'skill').map((item, index) =>
            mapCapability(item, 'skill', sceneKey, index),
          ),
          command: componentRows(secondRecord, 'command').map((item, index) =>
            mapCapability(item, 'command', sceneKey, index),
          ),
          agent: componentRows(secondRecord, 'agent').map((item, index) =>
            mapCapability(item, 'agent', sceneKey, index),
          ),
        };
        const sceneReleases = releases.filter((release) =>
          sameScene(release, firstScene, secondScene),
        );
        const publishing = sceneReleases.find((release) => release.status === '进行中') ?? null;
        const completedReleases = sceneReleases.filter((release) => release.status !== '进行中');
        const latestRelease = sceneReleases[0];
        const capabilityList = Object.values(capabilities).flat();
        const explicitReady = normalizeReady(
          secondRecord.publishable ??
            secondRecord.ready ??
            secondRecord.status ??
            secondRecord.subScenes,
        );
        return {
          id: sceneKey,
          productId: scope.productId || scope.dimCode,
          primary: firstScene,
          name: secondScene,
          publishable:
            explicitReady ??
            (capabilityList.length > 0 && capabilityList.every((capability) => capability.ready)),
          extension: {
            name: latestRelease?.extensionName ?? '',
            description: latestRelease?.description ?? '',
          },
          capabilities,
          releases: completedReleases,
          publishing,
        };
      },
    );
  });
}

function mapSceneOptionGroups(
  groups: SkillPlanningOptionGroup[],
  scope: ExtensionScope,
): ExtensionScene[] {
  return groups.flatMap((group, firstIndex) =>
    group.children.map((secondScene, secondIndex) => {
      const firstScene = group.value;
      const sceneKey = stableId([
        scope.productId || scope.dimCode,
        firstScene || String(firstIndex),
        secondScene || String(secondIndex),
      ]);
      return {
        id: sceneKey,
        productId: scope.productId || scope.dimCode,
        primary: firstScene,
        name: secondScene,
        publishable: false,
        extension: { name: '', description: '' },
        capabilities: { skill: [], command: [], agent: [] },
        releases: [],
        publishing: null,
      };
    }),
  );
}

export async function queryHttpExtensionProducts(
  departmentCode: string,
  departmentName: string,
  departmentPath: string[],
): Promise<ExtensionProduct[]> {
  const options = await getProductPlanning(
    '',
    departmentName,
    requiredText(departmentCode, '所选部门缺少编码'),
  );
  return options.map((option) => ({
    id: option.offeringId || option.offeringName,
    name: option.offeringName,
    departmentPath: [...departmentPath],
  }));
}

export async function queryHttpPublishableOrganizations(
  userId: string,
): Promise<PublishableOrganization[]> {
  const response = await skillBaseService.queryUserPublishableOrgs({
    userId: requiredText(userId, '尚未获取当前用户工号'),
  });
  assertHttpSuccess(response, '可发布组织加载失败');
  const data = unwrapResponseData(response);
  const rows = Array.isArray(data)
    ? data
    : readArray(asRecord(data), ['list', 'records', 'items', 'rows']);
  const result = rows.flatMap((value) => {
    const record = asRecord(value);
    const id = readText(record, ['orgCode', 'organizationCode', 'id']);
    const name = readText(record, ['orgName', 'organizationName', 'name']);
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        deptId: readText(record, ['deptId', 'departmentId']),
        deptName: readText(record, ['deptName', 'departmentName']),
      },
    ];
  });
  return [...new Map(result.map((item) => [item.id, item])).values()];
}

export async function queryHttpExtensionScenes(
  userId: string,
  scope: ExtensionScope,
): Promise<ExtensionScene[]> {
  const groups = await querySkillPlanningSceneOptionGroups({
    userId: requiredText(userId, '尚未获取当前用户工号'),
    dimType: scope.dimType,
    dimCode: scope.dimCode,
    dimName: scope.dimName,
  });
  return mapSceneOptionGroups(groups, scope);
}

export async function queryHttpExtensionBindings(
  userId: string,
  scope: ExtensionScope,
  scene: ExtensionScene,
): Promise<ExtensionScene> {
  const [bindingResponse, releases] = await Promise.all([
    skillBaseService.querySceneAndBindingPlanningItems(
      { userId: requiredText(userId, '尚未获取当前用户工号') },
      {
        dimType: scope.dimType,
        dimCode: scope.dimCode,
        dimName: scope.dimName,
      },
    ),
    queryAllHistory(scope),
  ]);
  const bindingScenes = mapBindingScenes(bindingResponse, scope, releases);
  return (
    bindingScenes.find((item) => item.primary === scene.primary && item.name === scene.name) ??
    scene
  );
}

function componentBody(
  scene: ExtensionScene,
  type: ExtensionCapabilityType,
): Array<{ name: string; version: string }> {
  return scene.capabilities[type].map((item) => ({ name: item.name, version: item.version }));
}

export async function publishHttpExtension(input: PublishExtensionInput): Promise<void> {
  const params = {
    userId: requiredText(input.userId, '尚未获取当前用户工号'),
    operatorName: requiredText(input.operatorName || input.userId, '尚未获取当前用户名称'),
    dimType: input.scope.dimType,
    dimCode: input.scope.dimCode,
    dimName: input.scope.dimName,
  };
  const body = {
    extensionName: requiredText(input.extensionName, '请输入 Extension 名称'),
    description: requiredText(input.description, '请输入 Extension 描述'),
    releaseType: input.channel.toLowerCase(),
    firstScene: input.scene.primary,
    secondScene: input.scene.name,
    targeteOrgCode: input.organization.id,
    targetOrgName: input.organization.name,
    agents: componentBody(input.scene, 'agent'),
    skills: componentBody(input.scene, 'skill'),
    commands: componentBody(input.scene, 'command'),
  };
  const response = await skillBaseService.saveExtension(params, body);
  assertHttpSuccess(response, 'Extension 发布失败');
}

export async function retryHttpExtension(
  releaseId: string,
  userId: string,
  operatorName: string,
): Promise<void> {
  const response = await skillBaseService.retryPublishExtension(
    requiredText(releaseId, '该发布记录缺少 id，无法重试'),
    {
      userId: requiredText(userId, '尚未获取当前用户工号'),
      operatorName: requiredText(operatorName || userId, '尚未获取当前用户名称'),
    },
  );
  assertHttpSuccess(response, 'Extension 重试发布失败');
}

export async function queryHttpPlanningItemFiles(
  userId: string,
  type: ExtensionCapabilityType,
  capability: ExtensionCapability,
): Promise<string[]> {
  const response = await skillBaseService.queryPlanningItemTree({
    userId: requiredText(userId, '尚未获取当前用户工号'),
    componentType: type,
    componentName: capability.name,
    componentVersion: capability.version,
  });
  assertHttpSuccess(response, '规划件目录加载失败');
  const data = unwrapResponseData(response);
  const rows = Array.isArray(data)
    ? data
    : readArray(asRecord(data), ['files', 'tree', 'list', 'items']);
  return [
    ...new Set(
      rows
        .map((value) =>
          typeof value === 'string'
            ? normalizeText(value)
            : readText(asRecord(value), ['filePath', 'path', 'name']),
        )
        .filter(Boolean),
    ),
  ];
}

export async function queryHttpPlanningItemContent(
  userId: string,
  type: ExtensionCapabilityType,
  capability: ExtensionCapability,
  filePath: string,
): Promise<string> {
  const response = await skillBaseService.queryPlanningItemContent({
    userId: requiredText(userId, '尚未获取当前用户工号'),
    componentType: type,
    componentName: capability.name,
    componentVersion: capability.version,
    filePath: requiredText(filePath, '缺少文件路径'),
  });
  assertHttpSuccess(response, '规划件文件内容加载失败');
  const data = unwrapResponseData(response);
  return typeof data === 'string' ? data : normalizeText(asRecord(data).content);
}
