import request from './request';
import type { WorkflowSceneSearchQuery } from './businessScenarioDesignService';
import type { ExtensionPackageNode, ExtensionPackageSource } from './extensionReleaseAssembly';
import {
  clearExtensionBypass,
  getExtensionBypassDownload,
  inheritExtensionBypass,
  queryExtensionInheritancePage,
  queryExtensionStructureTree,
  updateExtensionLayout,
  uploadExtensionBypass,
} from './extensionBypassService';

export type ExtensionLayout = 'standard' | 'testagent';
export type BypassEntry = { path: string; size?: number | null; reason?: string };
export type ExtensionAssemblyDetail = {
  layoutMode?: ExtensionLayout;
  hasBypass?: boolean;
  bypassEntries?: BypassEntry[];
};
export type BypassResult = {
  layoutMode: ExtensionLayout;
  acceptedEntries: BypassEntry[];
  ignoredEntries: BypassEntry[];
};
export type ExtensionSearchItem = {
  extensionName: string;
  description: string;
  layoutMode: ExtensionLayout;
  hasBypass: boolean;
  entryCount: number;
  latestVersion: string;
  sourceDimName: string;
};
export type SceneSearchItem = {
  sourceDimType: string;
  sourceDimCode: string;
  sourceDimName: string;
  firstScene: string;
  secondScene: string;
  sceneExtensionCode: string;
  flowName: string;
  activityCount: number;
};
export type SceneCopyRequest = {
  sourceDimType?: string;
  sourceDimCode: string;
  targetDimType: string;
  targetDimCode: string;
  firstScene: string;
  secondScene: string;
};
export type StructureComponent = {
  componentType: 'skill' | 'command' | 'agent';
  componentName: string;
  componentVersion?: string;
};
export type StructureEntry = {
  path: string;
  type: 'file' | 'dir';
  size?: number | null;
  source: 'COMPONENT' | 'FILE' | 'SYSTEM';
};
export type StructureResult = { layoutMode: ExtensionLayout; entries: StructureEntry[] };
type Identity = { userId: string; extensionName: string };
type Search = { userId: string; keyword: string; pageNum: number; pageSize: number };

/** Both the existing meta envelope and the new code envelope are supported. */
export function extensionResponseData<T>(response: unknown, fallback: string): T {
  const record = response as {
    code?: number | string;
    success?: boolean;
    message?: string;
    data?: T;
    meta?: { success?: boolean; message?: string };
  } | null;
  if (
    !record ||
    record.success === false ||
    record.meta?.success === false ||
    (record.code != null && ![0, 200].includes(Number(record.code)))
  ) {
    throw new Error(record?.message || record?.meta?.message || fallback);
  }
  return record.data as T;
}

async function call<T>(
  url: string,
  method: 'GET' | 'POST',
  params: object | undefined,
  data: unknown,
  fallback: string,
): Promise<T> {
  const response = await request.harnessApi({
    url,
    method,
    ...(params ? { params } : {}),
    ...(data === undefined ? {} : { data }),
  });
  return extensionResponseData<T>(response, fallback);
}

function identityParams(input: Identity): Identity {
  if (!input.userId.trim()) throw new Error('尚未获取当前用户工号');
  if (!input.extensionName.trim()) throw new Error('缺少 Extension 场景编码');
  return { userId: input.userId.trim(), extensionName: input.extensionName.trim() };
}

function requireLayout(value: ExtensionLayout): ExtensionLayout {
  if (value !== 'standard' && value !== 'testagent') throw new Error('布局响应格式不正确');
  return value;
}

function bypassResult(value: BypassResult): BypassResult {
  if (!value || !Array.isArray(value.acceptedEntries) || !Array.isArray(value.ignoredEntries))
    throw new Error('旁路响应格式不正确');
  requireLayout(value.layoutMode);
  return value;
}

export const extensionAssemblyHttp = {
  async searchScenes(params: WorkflowSceneSearchQuery) {
    const result = await call<{ list: SceneSearchItem[]; total: number }>(
      '/scenes/search',
      'GET',
      params,
      undefined,
      '场景流搜索失败',
    );
    if (
      !result ||
      !Array.isArray(result.list) ||
      !Number.isSafeInteger(result.total) ||
      result.total < 0
    )
      throw new Error('场景流搜索响应格式不正确');
    return result;
  },
  copyScene(userId: string, body: SceneCopyRequest): Promise<string> {
    return call('/scene/copy', 'POST', { userId }, body, '场景流继承失败');
  },
  async upload(input: Identity & { layout: ExtensionLayout; file: File }): Promise<BypassResult> {
    return bypassResult(
      await uploadExtensionBypass({
        ...identityParams(input),
        layout: requireLayout(input.layout),
        file: input.file,
      }),
    );
  },
  async clear(input: Identity): Promise<null> {
    await clearExtensionBypass(identityParams(input));
    return null;
  },
  async setLayout(
    input: Identity & { layout: ExtensionLayout },
  ): Promise<{ layoutMode: ExtensionLayout }> {
    const result = await updateExtensionLayout({
      ...identityParams(input),
      layout: requireLayout(input.layout),
    });
    requireLayout(result?.layoutMode);
    return result;
  },
  async tree(
    input: Identity & { layout: ExtensionLayout; components: StructureComponent[] },
  ): Promise<StructureResult> {
    const result = await queryExtensionStructureTree({
      ...identityParams(input),
      layout: requireLayout(input.layout),
      components: input.components,
    });
    if (!result || !Array.isArray(result.entries)) throw new Error('目录响应格式不正确');
    requireLayout(result.layoutMode);
    return result;
  },
  download(input: Identity): Promise<{ downloadUrl: string; expireSeconds: number }> {
    return getExtensionBypassDownload(identityParams(input));
  },
  async inherit(
    userId: string,
    body: { sourceExtensionName: string; targetExtensionName: string },
  ): Promise<BypassResult> {
    return bypassResult(await inheritExtensionBypass({ userId, ...body }));
  },
  searchExtensions(params: Search) {
    return queryExtensionInheritancePage({
      userId: params.userId,
      keyword: params.keyword,
      pageNo: params.pageNum,
      pageSize: params.pageSize,
    });
  },
};

/** Preserve server paths, including .cac-plugin and explicit empty directories. */
export function buildHttpExtensionTree(
  extensionName: string,
  entries: StructureEntry[],
  inheritBypass: boolean,
): ExtensionPackageNode {
  const root: ExtensionPackageNode = { name: `${extensionName}/`, type: 'folder', children: [] };
  const sourceMap: Record<StructureEntry['source'], ExtensionPackageSource> = {
    COMPONENT: 'component',
    FILE: 'bypass',
    SYSTEM: 'system',
  };
  const priority = (source?: ExtensionPackageSource) =>
    source === 'component' ? 0 : source === 'system' ? 1 : 2;
  for (const entry of entries) {
    if (!inheritBypass && entry.source === 'FILE') continue;
    const parts = entry.path.split('/').filter(Boolean);
    if (parts[0] === extensionName) parts.shift();
    if (!parts.length || parts.some((part) => part === '.' || part === '..')) continue;
    let parent = root;
    parts.forEach((part, index) => {
      const folder = index < parts.length - 1 || entry.type === 'dir';
      const name = folder ? `${part}/` : part;
      const source = sourceMap[entry.source];
      let node = parent.children!.find((child) => child.name === name);
      if (!node) {
        node = {
          name,
          type: folder ? 'folder' : 'file',
          source,
          ...(folder ? { children: [] } : entry.size == null ? {} : { size: entry.size }),
        };
        parent.children!.push(node);
      } else if (priority(source) < priority(node.source)) node.source = source;
      parent = node;
    });
  }
  const order = [
    '.testagent/',
    'skills/',
    'commands/',
    'agents/',
    '.cac-plugin/',
    'plugin.json',
    'codeagent-extension.json',
  ];
  function sort(node: ExtensionPackageNode): void {
    node.children?.sort((a, b) => {
      const rank = (child: ExtensionPackageNode) =>
        priority(child.source) < 2 && order.includes(child.name) ? order.indexOf(child.name) : 100;
      return (
        rank(a) - rank(b) ||
        priority(a.source) - priority(b.source) ||
        (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1)
      );
    });
    node.children?.forEach(sort);
  }
  sort(root);
  return root;
}
