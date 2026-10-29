import { skillBaseService } from './skillBaseService';

export type ExtensionLayoutMode = 'standard' | 'testagent';

export interface ExtensionBypassIdentity {
  userId: string;
  /** Scene identity (scene_extension_code), never the publish package name. */
  extensionName: string;
}

export interface ExtensionLayoutInput extends ExtensionBypassIdentity {
  layout: ExtensionLayoutMode;
}

export interface ExtensionBypassEntry {
  path: string;
  size: number;
  reason?: string;
}

export interface ExtensionBypassResult {
  layoutMode: ExtensionLayoutMode;
  acceptedEntries: ExtensionBypassEntry[];
  ignoredEntries: ExtensionBypassEntry[];
}

export interface ExtensionStructureComponent {
  componentType: 'SKILL' | 'COMMAND' | 'AGENT';
  componentName: string;
  componentVersion?: string;
}

export interface ExtensionStructureEntry {
  path: string;
  type: 'file' | 'dir';
  size: number | null;
  source: 'COMPONENT' | 'FILE' | 'SYSTEM';
}

export interface ExtensionStructureResult {
  layoutMode: ExtensionLayoutMode;
  entries: ExtensionStructureEntry[];
}

export interface ExtensionBypassInheritInput {
  userId: string;
  sourceExtensionName: string;
  targetExtensionName: string;
}

export interface ExtensionInheritanceSource {
  extensionName: string;
  description: string;
  layoutMode: ExtensionLayoutMode;
  hasBypass: boolean;
  entryCount: number;
  latestVersion: string;
  sourceDimName: string;
}

export interface ExtensionInheritanceQuery {
  userId: string;
  keyword?: string;
  pageNo: number;
  pageSize: number;
}

export interface ExtensionInheritancePage {
  list: ExtensionInheritanceSource[];
  total: number;
  pageNo: number;
  pageSize: number;
  hasMore: boolean;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Extension 响应格式无效');
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Extension 缺少有效的 ${field}`);
  }
  return value.trim();
}

function responsePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Extension 缺少有效的 path');
  }
  return value;
}

function optionalText(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new Error('Extension 文本字段无效');
  }
  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Extension 数量或字节大小无效');
  }
  return value;
}

function data(response: unknown): unknown {
  const envelope = record(response);
  const meta = record(envelope.meta);
  const success = meta.success ?? meta.isSuccess;
  if (success !== true && !(success == null && meta.message === 'OK')) {
    throw new Error(optionalText(meta.message ?? envelope.message) || 'Extension 请求失败');
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, 'data') || envelope.data === undefined) {
    throw new Error('Extension 响应缺少 data');
  }
  return envelope.data;
}

function identity(input: ExtensionBypassIdentity): ExtensionBypassIdentity {
  return {
    userId: requiredText(input.userId, 'userId'),
    extensionName: requiredText(input.extensionName, 'scene_extension_code'),
  };
}

function requestLayout(value: unknown): ExtensionLayoutMode {
  if (value !== 'standard' && value !== 'testagent') {
    throw new Error('Extension 布局必须为 standard 或 testagent');
  }
  return value;
}

/** Unknown server layouts have a safe display default; request layouts stay strict. */
export function normalizeExtensionLayout(value: unknown): ExtensionLayoutMode {
  return value === 'testagent' ? 'testagent' : 'standard';
}

export function normalizeExtensionBypassEntries(value: unknown): ExtensionBypassEntry[] {
  if (!Array.isArray(value)) {
    throw new Error('Extension 旁路文件列表无效');
  }
  return value.map((item) => {
    const row = record(item);
    return {
      path: responsePath(row.path),
      size: nonNegativeInteger(row.size),
      ...(row.reason == null ? {} : { reason: optionalText(row.reason) }),
    };
  });
}

function mutationResult(response: unknown): ExtensionBypassResult {
  const row = record(data(response));
  return {
    layoutMode: normalizeExtensionLayout(row.layoutMode),
    acceptedEntries: normalizeExtensionBypassEntries(row.acceptedEntries),
    ignoredEntries: normalizeExtensionBypassEntries(row.ignoredEntries),
  };
}

export async function uploadExtensionBypass(
  input: ExtensionLayoutInput & { file: File },
): Promise<ExtensionBypassResult> {
  const scope = identity(input);
  const layout = requestLayout(input.layout);
  const file = input.file;
  if (!(file instanceof Blob) || typeof file.name !== 'string' || !/\.zip$/i.test(file.name)) {
    throw new Error('请选择单个 .zip 文件');
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 50 * 1024 * 1024) {
    throw new Error('旁路 zip 文件不得超过 50MB');
  }
  const form = new FormData();
  form.append('userId', scope.userId);
  form.append('extensionName', scope.extensionName);
  form.append('layout', layout);
  form.append('file', file, file.name);
  return mutationResult(await skillBaseService.uploadExtensionBypass(form));
}

export async function clearExtensionBypass(input: ExtensionBypassIdentity): Promise<void> {
  data(await skillBaseService.clearExtensionBypass(identity(input)));
}

export async function updateExtensionLayout(
  input: ExtensionLayoutInput,
): Promise<{ layoutMode: ExtensionLayoutMode }> {
  const params = { ...identity(input), layout: requestLayout(input.layout) };
  const row = record(data(await skillBaseService.updateExtensionLayout(params)));
  return { layoutMode: normalizeExtensionLayout(row.layoutMode) };
}

function normalizeComponent(component: ExtensionStructureComponent): ExtensionStructureComponent {
  if (!component || !['SKILL', 'COMMAND', 'AGENT'].includes(component.componentType)) {
    throw new Error('Extension 组件类型无效');
  }
  return {
    componentType: component.componentType,
    componentName: requiredText(component.componentName, 'componentName'),
    ...(component.componentVersion === undefined
      ? {}
      : { componentVersion: requiredText(component.componentVersion, 'componentVersion') }),
  };
}

export async function queryExtensionStructureTree(
  input: ExtensionLayoutInput & { components: ExtensionStructureComponent[] },
): Promise<ExtensionStructureResult> {
  const scope = identity(input);
  const layout = requestLayout(input.layout);
  if (!Array.isArray(input.components)) {
    throw new Error('Extension 组件列表无效');
  }
  const row = record(
    data(
      await skillBaseService.queryExtensionStructureTree({
        ...scope,
        layout,
        components: JSON.stringify(input.components.map(normalizeComponent)),
      }),
    ),
  );
  if (!Array.isArray(row.entries)) {
    throw new Error('Extension 目录列表无效');
  }
  const entries = row.entries.map((value): ExtensionStructureEntry => {
    const entry = record(value);
    if (entry.type !== 'file' && entry.type !== 'dir') {
      throw new Error('Extension 目录条目类型无效');
    }
    if (entry.source !== 'COMPONENT' && entry.source !== 'FILE' && entry.source !== 'SYSTEM') {
      throw new Error('Extension 目录来源无效');
    }
    return {
      path: responsePath(entry.path),
      type: entry.type,
      size: entry.type === 'dir' && entry.size == null ? null : nonNegativeInteger(entry.size),
      source: entry.source,
    };
  });
  return { layoutMode: normalizeExtensionLayout(row.layoutMode), entries };
}

export async function getExtensionBypassDownload(
  input: ExtensionBypassIdentity,
): Promise<{ downloadUrl: string; expireSeconds: number }> {
  const row = record(data(await skillBaseService.getExtensionBypassDownload(identity(input))));
  const downloadUrl = requiredText(row.downloadUrl, 'downloadUrl');
  let parsed: URL;
  try {
    parsed = new URL(downloadUrl);
  } catch {
    throw new Error('Extension 下载地址无效');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Extension 下载地址仅支持 HTTP(S)');
  }
  return { downloadUrl, expireSeconds: nonNegativeInteger(row.expireSeconds) };
}

export async function inheritExtensionBypass(
  input: ExtensionBypassInheritInput,
): Promise<ExtensionBypassResult> {
  const userId = requiredText(input.userId, 'userId');
  const body = {
    sourceExtensionName: requiredText(input.sourceExtensionName, 'sourceExtensionName'),
    targetExtensionName: requiredText(input.targetExtensionName, 'targetExtensionName'),
  };
  return mutationResult(await skillBaseService.inheritExtensionBypass({ userId }, body));
}

export async function queryExtensionInheritancePage(
  input: ExtensionInheritanceQuery,
): Promise<ExtensionInheritancePage> {
  const userId = requiredText(input.userId, 'userId');
  const { pageNo, pageSize } = input;
  if (
    !Number.isSafeInteger(pageNo) ||
    pageNo < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1
  ) {
    throw new Error('Extension 分页参数无效');
  }
  const keyword = optionalText(input.keyword).trim();
  const limit = Math.min(pageNo * pageSize, 100);
  const result = data(await skillBaseService.searchExtensions({ userId, keyword, limit }));
  if (!Array.isArray(result)) {
    throw new Error('Extension 搜索列表无效');
  }
  const rows = result
    .map((value): ExtensionInheritanceSource => {
      const row = record(value);
      if (typeof row.hasBypass !== 'boolean') {
        throw new Error('Extension 搜索旁路状态无效');
      }
      return {
        extensionName: requiredText(row.extensionName, 'extensionName'),
        description: optionalText(row.description),
        layoutMode: normalizeExtensionLayout(row.layoutMode),
        hasBypass: row.hasBypass,
        entryCount: nonNegativeInteger(row.entryCount),
        latestVersion: optionalText(row.latestVersion),
        sourceDimName: optionalText(row.sourceDimName),
      };
    })
    .slice(0, limit);
  const uniqueRows = [...new Map(rows.map((row) => [row.extensionName, row])).values()];
  return {
    list: uniqueRows,
    total: uniqueRows.length,
    pageNo,
    pageSize,
    hasMore: result.length >= limit && limit < 100,
  };
}
