import type {
  ExtensionCapability,
  ExtensionCapabilityType,
  ExtensionProduct,
  ExtensionRelease,
  ExtensionReleaseItem,
  ExtensionScene,
} from './extensionPublishMock';
import { skillBaseService } from './skillBaseService';
import { harnessWorkflowService } from './businessScenarioDesignService';
import { getProductPlanning, querySkillPlanningSceneOptionGroups } from './skillPlanningService';
import type { SkillPlanningOptionGroup } from './skillPlanningShared';
import {
  getProductCatalogItemNamePrefix,
  isCatalogItemNameValid,
} from '../../utils/catalogItemName';

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

export type ExtensionPublishChannel = 'beta' | 'product';

export type ExtensionReleaseContext = {
  scope: ExtensionScope;
  scene: ExtensionScene;
  productName: string;
};

export type PublishExtensionInput = {
  userId: string;
  operatorName: string;
  scope: ExtensionScope;
  scene: ExtensionScene;
  extensionName: string;
  description: string;
  channel: ExtensionPublishChannel;
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
  if (/未配置|不完备|未就绪|未完成|不可发布|incomplete|not.ready|unready/.test(status))
    return false;
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
    failReason: readText(record, ['errorMessage']),
    firstScene: readText(record, ['firstScene', 'primaryScene']),
    secondScene: readText(record, ['secondScene', 'secondaryScene']),
  };
}

function historyRows(response: unknown): unknown[] {
  const data = unwrapResponseData(response);
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  for (const key of ['list', 'records', 'items', 'rows', 'content']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  throw new Error('发布历史响应格式不正确');
}

function historyTotal(response: unknown, fallback: number): number {
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  const data = asRecord(unwrapResponseData(response));
  for (const value of [data.total, data.number, meta.number, responseRecord.total]) {
    if (value == null || value === '') continue;
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
  const directFilePath =
    type === 'skill'
      ? ''
      : readText(record, ['filePath', 'path', 'fileName']) || (name ? `${name}.md` : '');
  return {
    id:
      readText(record, ['id', 'componentId', 'packageId']) ||
      stableId([sceneKey, type, name || String(index)]),
    name,
    version,
    publishDate: normalizeDate(
      record.uploadedAt ?? record.uploadAt ?? record.updatedAt ?? record.publishedAt,
    ).slice(0, 10),
    ready: explicitReady ?? Boolean(name && version),
    files: directFilePath ? [{ name: directFilePath, content: '' }] : [],
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
        const publishedExtension = asRecord(secondRecord.publishedExtension);
        const capabilityList = Object.values(capabilities).flat();
        const explicitReady = normalizeReady(
          secondRecord.readyStatus ??
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
            name:
              readText(publishedExtension, ['extensionName']) || latestRelease?.extensionName || '',
            description:
              readText(publishedExtension, ['description']) || latestRelease?.description || '',
            version: readText(publishedExtension, ['version']),
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
  userName: string,
): Promise<ExtensionProduct[]> {
  const options = await getProductPlanning(
    '',
    departmentName,
    requiredText(departmentCode, '所选部门缺少编码'),
    userName,
  );
  return options.map((option) => ({
    id: option.offeringId || option.offeringName,
    name: option.offeringName,
    departmentPath: [...departmentPath],
  }));
}

export async function queryHttpPublishableOrganizations(
  userId: string,
  scope: Pick<ExtensionScope, 'dimType' | 'dimCode'>,
): Promise<PublishableOrganization[]> {
  const response = await skillBaseService.queryUserPublishableOrgs({
    userId: requiredText(userId, '尚未获取当前用户工号'),
    dimType: scope.dimType,
    dimCode: scope.dimCode,
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

/**
 * Load every Extension scene in the selected scope together with its bound
 * capabilities and release history. Asset aggregation uses this bulk entry so
 * bindings and history are fetched once per scope instead of once per scene.
 */
export async function queryHttpHydratedExtensionScenes(
  userId: string,
  scope: ExtensionScope,
): Promise<ExtensionScene[]> {
  const normalizedUserId = requiredText(userId, '尚未获取当前用户工号');
  const [bindingResponse, releases] = await Promise.all([
    skillBaseService.querySceneAndBindingPlanningItems(
      { userId: normalizedUserId },
      {
        dimType: scope.dimType,
        dimCode: scope.dimCode,
        dimName: scope.dimName,
      },
    ),
    queryAllHistory(scope),
  ]);
  return mapBindingScenes(bindingResponse, scope, releases);
}

export async function queryHttpExtensionBindings(
  userId: string,
  scope: ExtensionScope,
  scene: ExtensionScene,
): Promise<ExtensionScene> {
  return queryHttpExtensionDetail(userId, scope, {
    extensionName: scene.extension.name,
    firstScene: scene.primary,
    secondScene: scene.name,
  });
}

/** 资产内容按所选 Extension 版本读取绑定，只保留卡片自身的一、二级场景。 */
export async function queryHttpExtensionVersionCapabilities(
  userId: string,
  scope: ExtensionScope,
  identity: { firstScene?: string | null; secondScene?: string | null },
  version: string,
): Promise<ExtensionScene['capabilities']> {
  const firstScene = requiredText(identity.firstScene, 'Extension 缺少一级场景，无法查看内容');
  const secondScene = requiredText(identity.secondScene, 'Extension 缺少二级场景，无法查看内容');
  const response = await skillBaseService.querySceneAndBindingPlanningItems(
    { userId: requiredText(userId, '尚未获取当前用户工号') },
    {
      dimType: scope.dimType,
      dimCode: scope.dimCode,
      dimName: scope.dimName,
      version: requiredText(version, '请选择 Extension 版本'),
    },
  );
  const scene = mapBindingScenes(response, scope, []).find(
    (item) => item.primary === firstScene && item.name === secondScene,
  );
  return scene?.capabilities ?? { skill: [], command: [], agent: [] };
}

/** 发布准备查询：有编码优先按编码查，否则直接按一、二级场景名查。 */
export async function queryHttpExtensionDetail(
  userId: string,
  scope: ExtensionScope,
  identity: { extensionName?: string; firstScene?: string; secondScene?: string },
): Promise<ExtensionScene> {
  const extensionName = normalizeText(identity.extensionName);
  const lookup = extensionName
    ? {
        extensionName,
        ...(normalizeText(identity.firstScene) ? { firstScene: identity.firstScene } : {}),
        ...(normalizeText(identity.secondScene) ? { secondScene: identity.secondScene } : {}),
      }
    : {
        firstScene: requiredText(identity.firstScene, '请选择一级场景'),
        secondScene: requiredText(identity.secondScene, '请选择二级场景'),
      };
  const response = await harnessWorkflowService.queryExtensionSceneDetail(
    { userId: requiredText(userId, '尚未获取当前用户工号') },
    { dimType: scope.dimType, dimCode: scope.dimCode, dimName: scope.dimName, ...lookup },
  );
  assertHttpSuccess(response, 'Extension 发布详情加载失败');
  const data = asRecord(unwrapResponseData(response));
  const unconfigured = normalizeText(data.readyStatus) === '未配置';
  const firstScene = readText(data, ['firstScene']) || normalizeText(identity.firstScene);
  const secondScene = readText(data, ['secondScene']) || normalizeText(identity.secondScene);
  if (!unconfigured) {
    requiredText(firstScene, 'Extension 详情缺少一级场景');
    requiredText(secondScene, 'Extension 详情缺少二级场景');
  }
  const publishedExtension = asRecord(data.publishedExtension);
  const summary = mapHistoryRelease({ ...publishedExtension, firstScene, secondScene });
  // 发布准备只使用详情中的发布摘要；完整历史仅由历史入口查询。
  const releases = summary.extensionName && summary.version ? [summary] : [];
  const detail = mapBindingScenes(
    { data: [{ firstScene, secondScenes: [{ ...data, secondScene }] }] },
    scope,
    releases,
  )[0]!;
  detail.extension.name ||= extensionName;
  return detail;
}

export async function queryHttpExtensionHistory(
  scope: ExtensionScope,
  scene: ExtensionScene,
): Promise<ExtensionScene> {
  const firstScene = normalizeText(scene.primary);
  const secondScene = normalizeText(scene.name);
  const extensionName = normalizeText(scene.extension.name);
  const hasSceneIdentity = Boolean(firstScene && secondScene);
  if (!hasSceneIdentity && !extensionName) {
    throw new Error('缺少 Extension 名称或完整场景信息，无法查询发布历史');
  }
  const sceneReleases = (await queryAllHistory(scope)).filter((release) =>
    hasSceneIdentity
      ? sameScene(release, firstScene, secondScene)
      : release.extensionName === extensionName,
  );
  const latestRelease = sceneReleases[0];
  return {
    ...scene,
    extension: {
      ...scene.extension,
      name: latestRelease?.extensionName ?? scene.extension.name,
      description: latestRelease?.description ?? scene.extension.description,
    },
    releases: sceneReleases.filter((release) => release.status !== '进行中'),
    publishing: sceneReleases.find((release) => release.status === '进行中') ?? null,
  };
}

function componentBody(
  scene: ExtensionScene,
  type: ExtensionCapabilityType,
): Array<{ name: string; version: string }> {
  return scene.capabilities[type].map((item) => ({ name: item.name, version: item.version }));
}

export async function publishHttpExtension(input: PublishExtensionInput): Promise<void> {
  const extensionName = requiredText(input.extensionName, '请输入 Extension 名称');
  if (!isCatalogItemNameValid(extensionName)) {
    throw new Error('Extension 名称仅允许小写字母、数字、连字符，最长 64 字符');
  }
  const requiredPrefix = getProductCatalogItemNamePrefix(input.scope.dimType, input.scope.dimName);
  if (requiredPrefix && !extensionName.startsWith(requiredPrefix)) {
    throw new Error(`Extension 名称需以产品名称的小写形式“${requiredPrefix}”开头`);
  }
  const params = {
    userId: requiredText(input.userId, '尚未获取当前用户工号'),
    operatorName: requiredText(input.operatorName, '尚未获取当前用户姓名'),
    dimType: input.scope.dimType,
    dimCode: input.scope.dimCode,
    dimName: input.scope.dimName,
  };
  const body = {
    extensionName,
    description: requiredText(input.description, '请输入 Extension 描述'),
    releaseType: input.channel,
    firstScene: input.scene.primary,
    secondScene: input.scene.name,
    targetOrgCode: input.organization.id,
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
      operatorName: requiredText(operatorName, '尚未获取当前用户姓名'),
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
