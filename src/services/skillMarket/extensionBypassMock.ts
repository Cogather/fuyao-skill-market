import PizZip from 'pizzip';

import type {
  ExtensionBypassEntry,
  ExtensionBypassIdentity,
  ExtensionBypassInheritInput,
  ExtensionBypassResult,
  ExtensionInheritancePage,
  ExtensionInheritanceQuery,
  ExtensionLayoutInput,
  ExtensionLayoutMode,
  ExtensionStructureComponent,
  ExtensionStructureEntry,
  ExtensionStructureResult,
} from './extensionBypassService';
import {
  getSharedMockExtensionScenes,
  MOCK_EXTENSION_PRODUCTS,
  type ExtensionCapabilityType,
  type ExtensionScene,
} from './extensionPublishMock';

const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const SYSTEM_FILES = new Set(['codeagent-extension.json', '.cac-plugin/plugin.json']);
const COMPONENT_FOLDERS: Record<ExtensionCapabilityType, string> = {
  skill: 'skills',
  command: 'commands',
  agent: 'agents',
};

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Extension 缺少有效的 ${field}`);
  }
  return value.trim();
}

function requestLayout(value: unknown): ExtensionLayoutMode {
  if (value !== 'standard' && value !== 'testagent') {
    throw new Error('Extension 布局必须为 standard 或 testagent');
  }
  return value;
}

function identity(input: ExtensionBypassIdentity): ExtensionBypassIdentity {
  return {
    userId: requiredText(input.userId, 'userId'),
    extensionName: requiredText(input.extensionName, 'scene_extension_code'),
  };
}

function sceneCode(scene: ExtensionScene): string {
  return String(scene.sceneExtensionCode ?? '').trim();
}

function sceneFor(extensionName: string): ExtensionScene {
  const scene = getSharedMockExtensionScenes().find((item) => sceneCode(item) === extensionName);
  if (!scene) throw new Error(`未找到 Extension 场景：${extensionName}`);
  return scene;
}

function cloneEntries(entries: ExtensionBypassEntry[] | undefined): ExtensionBypassEntry[] {
  return (entries ?? []).map((entry) => ({ ...entry }));
}

function normalizePath(value: string): string {
  const parts: string[] = [];
  for (const segment of value.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) throw new Error('旁路 zip 包含越界路径，已拒绝整包');
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  if (parts.length === 0) throw new Error('旁路 zip 包含空路径，已拒绝整包');
  return parts.join('/');
}

function safeName(value: string): string {
  return value.trim().replace(/[\\/]+/g, '-');
}

function layoutPrefix(layout: ExtensionLayoutMode): string {
  return layout === 'testagent' ? '.testagent/' : '';
}

function protectedFiles(scene: ExtensionScene, layout: ExtensionLayoutMode): Set<string> {
  const files = new Set(SYSTEM_FILES);
  const prefix = layoutPrefix(layout);
  (Object.keys(COMPONENT_FOLDERS) as ExtensionCapabilityType[]).forEach((type) => {
    const folder = COMPONENT_FOLDERS[type];
    scene.capabilities[type].forEach((capability) => {
      const componentName = safeName(capability.name);
      capability.files.forEach((file) => {
        files.add(`${prefix}${folder}/${componentName}/${normalizePath(file.name)}`);
      });
      const directName = componentName.toLowerCase().endsWith('.md')
        ? componentName
        : `${componentName}.md`;
      files.add(`${prefix}${folder}/${directName}`);
    });
  });
  return files;
}

function protectedRoots(layout: ExtensionLayoutMode): string[] {
  const prefix = layoutPrefix(layout);
  return [
    `${prefix}skills/`,
    `${prefix}commands/`,
    `${prefix}agents/`,
    '.cac-plugin/',
  ];
}

function underProtectedRoot(
  path: string,
  layout: ExtensionLayoutMode,
  directory = false,
): boolean {
  const lowerPath = path.toLowerCase();
  const [skillsRoot, commandsRoot, agentsRoot, pluginRoot] = protectedRoots(layout).map((root) =>
    root.toLowerCase(),
  );
  const inRoot = (root: string) => lowerPath.startsWith(root);
  if (inRoot(skillsRoot) || inRoot(pluginRoot)) return true;
  return [commandsRoot, agentsRoot].some((root) => {
    if (!inRoot(root)) return false;
    return directory || lowerPath.slice(root.length).includes('/');
  });
}

function mutationResult(
  scene: ExtensionScene,
  ignoredEntries: ExtensionBypassEntry[] = [],
): ExtensionBypassResult {
  return {
    layoutMode: scene.layoutMode ?? 'standard',
    acceptedEntries: cloneEntries(scene.bypassEntries),
    ignoredEntries: cloneEntries(ignoredEntries),
  };
}

export async function uploadExtensionBypassMock(
  input: ExtensionLayoutInput & { file: File },
): Promise<ExtensionBypassResult> {
  const scope = identity(input);
  const layout = requestLayout(input.layout);
  const file = input.file;
  if (!(file instanceof Blob) || typeof file.name !== 'string' || !/\.zip$/i.test(file.name)) {
    throw new Error('请选择单个 .zip 文件');
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_ZIP_BYTES) {
    throw new Error('旁路 zip 文件不得超过 50MB');
  }
  const scene = sceneFor(scope.extensionName);
  let archive: PizZip;
  try {
    archive = new PizZip(await file.arrayBuffer());
  } catch {
    throw new Error('旁路 zip 文件无法解析');
  }
  const knownProtectedFiles = new Set(
    [...protectedFiles(scene, layout)].map((path) => path.toLowerCase()),
  );
  const accepted = new Map<string, ExtensionBypassEntry>();
  const ignored: ExtensionBypassEntry[] = [];
  const rows = Object.values(
    archive.files as Record<string, { name: string; dir: boolean; asUint8Array(): Uint8Array }>,
  );
  for (const row of rows) {
    const path = normalizePath(row.name);
    if (row.dir) {
      if (underProtectedRoot(path, layout, true)) {
        throw new Error(`旁路 zip 试图变更保护区目录结构：${path}，已拒绝整包`);
      }
      continue;
    }
    const size = row.asUint8Array().byteLength;
    if (knownProtectedFiles.has(path.toLowerCase()) || SYSTEM_FILES.has(path.toLowerCase())) {
      ignored.push({ path, size, reason: '系统或组件保护文件，已忽略' });
      continue;
    }
    if (underProtectedRoot(path, layout)) {
      throw new Error(`旁路 zip 试图变更保护区目录结构：${path}，已拒绝整包`);
    }
    accepted.set(path, { path, size });
  }
  scene.layoutMode = layout;
  scene.bypassEntries = [...accepted.values()].map((entry) => ({ ...entry }));
  scene.hasBypass = scene.bypassEntries.length > 0;
  return mutationResult(scene, ignored);
}

export async function clearExtensionBypassMock(input: ExtensionBypassIdentity): Promise<void> {
  const scope = identity(input);
  const scene = sceneFor(scope.extensionName);
  scene.hasBypass = false;
  scene.bypassEntries = [];
}

export async function updateExtensionLayoutMock(
  input: ExtensionLayoutInput,
): Promise<{ layoutMode: ExtensionLayoutMode }> {
  const scope = identity(input);
  const scene = sceneFor(scope.extensionName);
  scene.layoutMode = requestLayout(input.layout);
  return { layoutMode: scene.layoutMode };
}

function componentPath(
  layout: ExtensionLayoutMode,
  component: ExtensionStructureComponent,
): string {
  const folder = `${component.componentType.toLowerCase()}s`;
  const name = safeName(requiredText(component.componentName, 'componentName'));
  const relative =
    component.componentType === 'skill'
      ? `${folder}/${name}/SKILL.md`
      : `${folder}/${name}.md`;
  return `${layoutPrefix(layout)}${relative}`;
}

function addTreeFile(
  entries: Map<string, ExtensionStructureEntry>,
  root: string,
  relativePath: string,
  source: ExtensionStructureEntry['source'],
  size: number | null,
): void {
  const segments = relativePath.split('/').filter(Boolean);
  let parent = root;
  if (!entries.has(root)) entries.set(root, { path: root, type: 'dir', size: null, source: 'SYSTEM' });
  for (const segment of segments.slice(0, -1)) {
    parent = `${parent}/${segment}`;
    if (!entries.has(parent)) entries.set(parent, { path: parent, type: 'dir', size: null, source });
  }
  entries.set(`${root}/${relativePath}`, {
    path: `${root}/${relativePath}`,
    type: 'file',
    size,
    source,
  });
}

export async function queryExtensionStructureTreeMock(
  input: ExtensionLayoutInput & { components: ExtensionStructureComponent[] },
): Promise<ExtensionStructureResult> {
  const scope = identity(input);
  const layout = requestLayout(input.layout);
  if (!Array.isArray(input.components)) throw new Error('Extension 组件列表无效');
  const scene = sceneFor(scope.extensionName);
  const entries = new Map<string, ExtensionStructureEntry>();
  addTreeFile(entries, scope.extensionName, 'codeagent-extension.json', 'SYSTEM', null);
  addTreeFile(entries, scope.extensionName, '.cac-plugin/plugin.json', 'SYSTEM', null);
  input.components.forEach((component) => {
    if (!['skill', 'command', 'agent'].includes(component.componentType)) {
      throw new Error('Extension 组件类型无效');
    }
    addTreeFile(entries, scope.extensionName, componentPath(layout, component), 'COMPONENT', null);
  });
  cloneEntries(scene.bypassEntries).forEach((entry) => {
    addTreeFile(entries, scope.extensionName, normalizePath(entry.path), 'FILE', entry.size);
  });
  return {
    layoutMode: layout,
    entries: [...entries.values()].sort((left, right) => {
      if (left.path === scope.extensionName) return -1;
      if (right.path === scope.extensionName) return 1;
      return left.path.localeCompare(right.path);
    }),
  };
}

export async function getExtensionBypassDownloadMock(
  input: ExtensionBypassIdentity,
): Promise<{ downloadUrl: string; expireSeconds: number }> {
  const scope = identity(input);
  const scene = sceneFor(scope.extensionName);
  const published =
    Boolean(scene.extension.version?.trim()) ||
    scene.releases.some((release) => release.status === '成功');
  if (!published && !scene.hasBypass) {
    throw new Error('当前 Extension 暂无可下载的发布包或旁路文件');
  }
  const file = published ? 'package.zip' : 'bypass.zip';
  return {
    downloadUrl: `https://mock.invalid/extensions/${encodeURIComponent(scope.extensionName)}/${file}?expires=3600`,
    expireSeconds: 3600,
  };
}

export async function inheritExtensionBypassMock(
  input: ExtensionBypassInheritInput,
): Promise<ExtensionBypassResult> {
  requiredText(input.userId, 'userId');
  const sourceName = requiredText(input.sourceExtensionName, 'sourceExtensionName');
  const targetName = requiredText(input.targetExtensionName, 'targetExtensionName');
  if (sourceName === targetName) throw new Error('不能从当前 Extension 继承旁路');
  const source = sceneFor(sourceName);
  const target = sceneFor(targetName);
  const layout = source.layoutMode ?? 'standard';
  const knownProtectedFiles = new Set(
    [...protectedFiles(target, layout)].map((path) => path.toLowerCase()),
  );
  const accepted: ExtensionBypassEntry[] = [];
  const ignored: ExtensionBypassEntry[] = [];
  cloneEntries(source.bypassEntries).forEach((entry) => {
    const normalizedPath = entry.path.toLowerCase();
    if (
      knownProtectedFiles.has(normalizedPath) ||
      SYSTEM_FILES.has(normalizedPath) ||
      underProtectedRoot(entry.path, layout)
    ) {
      ignored.push({ ...entry, reason: '命中目标组件保护区，已剥离' });
    } else {
      accepted.push({ path: entry.path, size: entry.size });
    }
  });
  target.layoutMode = layout;
  target.bypassEntries = accepted.map((entry) => ({ ...entry }));
  target.hasBypass = target.bypassEntries.length > 0;
  return mutationResult(target, ignored);
}

function latestVersion(scene: ExtensionScene): string {
  return (
    [...scene.releases]
      .filter((release) => release.status === '成功')
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0]?.version ??
    scene.extension.version ??
    ''
  );
}

export async function queryExtensionInheritancePageMock(
  input: ExtensionInheritanceQuery,
): Promise<ExtensionInheritancePage> {
  requiredText(input.userId, 'userId');
  if (
    !Number.isSafeInteger(input.pageNo) ||
    input.pageNo < 1 ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1
  ) {
    throw new Error('Extension 分页参数无效');
  }
  const keyword = String(input.keyword ?? '').trim().toLowerCase();
  const products = new Map(MOCK_EXTENSION_PRODUCTS.map((product) => [product.id, product]));
  const rows = getSharedMockExtensionScenes()
    .filter((scene) => {
      if (!keyword) return true;
      return [sceneCode(scene), scene.extension.name, scene.extension.description, scene.primary, scene.name]
        .join('\n')
        .toLowerCase()
        .includes(keyword);
    })
    .map((scene) => ({
      extensionName: sceneCode(scene),
      description: scene.extension.description,
      layoutMode: scene.layoutMode ?? 'standard',
      hasBypass: scene.hasBypass === true,
      entryCount: scene.bypassEntries?.length ?? 0,
      latestVersion: latestVersion(scene),
      sourceDimName: products.get(scene.productId)?.departmentPath.at(-1) ?? '',
    }))
    .sort((left, right) => left.extensionName.localeCompare(right.extensionName));
  const limit = Math.min(input.pageNo * input.pageSize, 100);
  return {
    list: rows.slice(0, limit),
    total: rows.length,
    pageNo: input.pageNo,
    pageSize: input.pageSize,
    hasMore: limit < rows.length && limit < 100,
  };
}

export const extensionBypassMockAdapter = {
  uploadExtensionBypass: uploadExtensionBypassMock,
  clearExtensionBypass: clearExtensionBypassMock,
  updateExtensionLayout: updateExtensionLayoutMock,
  queryExtensionStructureTree: queryExtensionStructureTreeMock,
  getExtensionBypassDownload: getExtensionBypassDownloadMock,
  inheritExtensionBypass: inheritExtensionBypassMock,
  queryExtensionInheritancePage: queryExtensionInheritancePageMock,
};
