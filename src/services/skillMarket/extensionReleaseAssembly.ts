import PizZip from 'pizzip';

import type {
  ExtensionCapability,
  ExtensionCapabilityType,
} from './extensionPublishMock';

export type ExtensionReleaseTarget = 'codeagent' | 'testagent';
export type ExtensionPackageSource = 'system' | 'inherited' | 'uploaded' | 'component' | 'bypass';
export type ExtensionInheritanceKind = 'previous' | 'department';

export type ExtensionPackageNode = {
  name: string;
  type: 'folder' | 'file';
  source?: ExtensionPackageSource;
  size?: number;
  children?: ExtensionPackageNode[];
};

export type ExtensionAssemblyFile = {
  path: string;
  size?: number;
};

export type ExtensionInheritanceSource = {
  id: string;
  name: string;
  version: string;
  organization: string;
  kind: ExtensionInheritanceKind;
  description: string;
  files: ExtensionAssemblyFile[];
};

export type ExtensionUploadedPackage = {
  name: string;
  size: number;
  files: ExtensionAssemblyFile[];
  rejectedPaths: string[];
};

export type ExtensionAssemblyState = {
  target: ExtensionReleaseTarget;
  inheritanceSourceId: string;
  uploadedPackage: ExtensionUploadedPackage | null;
  convertAfterPublish: boolean;
  inheritBypass?: boolean;
};

export type BuildExtensionPackageTreeInput = {
  extensionName: string;
  target: ExtensionReleaseTarget;
  capabilities: Record<ExtensionCapabilityType, ExtensionCapability[]>;
  inheritedFiles: ExtensionAssemblyFile[];
  uploadedFiles: ExtensionAssemblyFile[];
};

export type SubmitExtensionAssemblyInput = {
  extensionName: string;
  target: ExtensionReleaseTarget;
  inheritanceSourceId: string;
  uploadedFiles: ExtensionAssemblyFile[];
  convertAfterPublish: boolean;
};

export type SubmitExtensionAssemblyResult = SubmitExtensionAssemblyInput & {
  taskId: string;
  convertTaskCreated: boolean;
};

const capabilityFolders: Record<ExtensionCapabilityType, string> = {
  skill: 'skills',
  command: 'commands',
  agent: 'agents',
};

const protectedRootDirectories = new Set(['skills', 'commands', 'agents']);
const protectedRootFiles = new Set(['plugin.json', 'codeagent-extension.json']);
const systemEntryOrder = new Map([
  ['.testagent/', 0],
  ['skills/', 1],
  ['commands/', 2],
  ['agents/', 3],
  ['plugin.json', 4],
  ['codeagent-extension.json', 5],
]);

function cleanSegment(segment: string): string {
  return segment.trim().replace(/[\\/]+/g, '-');
}

function normalizeArchivePath(path: string): string | null {
  const segments: string[] = [];
  for (const segment of String(path).replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/') || null;
}

function isProtectedArchivePath(path: string): boolean {
  const parts = path.toLowerCase().split('/');
  return protectedRootDirectories.has(parts[0] ?? '') || protectedRootFiles.has(path.toLowerCase());
}

export function filterExtensionArchivePaths(paths: string[]): {
  accepted: string[];
  rejected: string[];
} {
  const accepted: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  paths.forEach((originalPath) => {
    const normalized = normalizeArchivePath(originalPath);
    if (!normalized || isProtectedArchivePath(normalized)) {
      rejected.push(originalPath);
      return;
    }
    if (!seen.has(normalized)) {
      accepted.push(normalized);
      seen.add(normalized);
    }
  });

  return { accepted, rejected };
}

export function readExtensionArchive(
  input: ArrayBuffer | Uint8Array,
  fileName: string,
  packageSize?: number,
): ExtensionUploadedPackage {
  const zip = new PizZip(input);
  const entries = Object.values(zip.files as Record<string, { name: string; dir: boolean }>).filter(
    (entry) => !entry.dir,
  );
  const filtered = filterExtensionArchivePaths(entries.map((entry) => entry.name));
  const accepted = new Set(filtered.accepted);
  const files = entries.flatMap((entry) => {
    const path = normalizeArchivePath(entry.name);
    if (!path || !accepted.has(path)) return [];
    const zipEntry = zip.file(entry.name);
    const size = zipEntry ? zipEntry.asUint8Array().byteLength : 0;
    return [{ path, size }];
  });

  return {
    name: fileName,
    size: packageSize ?? files.reduce((total, file) => total + (file.size ?? 0), 0),
    files,
    rejectedPaths: filtered.rejected,
  };
}

export function createMockInheritanceSources(options: {
  extensionName: string;
  previousVersion?: string;
  organization?: string;
}): ExtensionInheritanceSource[] {
  const name = options.extensionName.trim() || '当前 Extension';
  const version = options.previousVersion?.trim() || '0.1';
  const organization = options.organization?.trim() || '扶摇组织';
  return [
    {
      id: 'previous',
      name,
      version,
      organization,
      kind: 'previous',
      description: '沿用当前 Extension 上一次发布中的旁路配置与工具文件。',
      files: [
        { path: 'config/shared.yaml', size: 384 },
        { path: 'prompts/system.md', size: 672 },
        { path: 'tools/checker.py', size: 1024 },
      ],
    },
    {
      id: 'department-qa',
      name: 'QA 通用测试 Extension',
      version: '1.4',
      organization: '质量产品线',
      kind: 'department',
      description: '部门统一维护的环境配置、发布检查清单和 QA 脚本。',
      files: [
        { path: 'env/global.yaml', size: 416 },
        { path: 'checklists/release.yaml', size: 598 },
        { path: 'scripts/qa-runner.py', size: 1340 },
      ],
    },
    {
      id: 'department-devops',
      name: 'DevOps 测试基线 Extension',
      version: '0.8',
      organization: '平台产品线',
      kind: 'department',
      description: 'DevOps 平台统一维护的报告模板与公共工具库。',
      files: [
        { path: 'templates/report.md', size: 826 },
        { path: 'lib/utils.py', size: 912 },
      ],
    },
  ];
}

export async function queryExtensionInheritanceSourcesMock(options: {
  extensionName: string;
  previousVersion?: string;
  organization?: string;
}): Promise<ExtensionInheritanceSource[]> {
  return createMockInheritanceSources(options);
}

function defaultInheritanceSourceId(sources: ExtensionInheritanceSource[]): string {
  return sources.find((source) => source.kind === 'previous')?.id ?? sources[0]?.id ?? '';
}

export function createAssemblyState(
  sources: ExtensionInheritanceSource[] = [],
): ExtensionAssemblyState {
  return {
    target: 'codeagent',
    inheritanceSourceId: defaultInheritanceSourceId(sources),
    uploadedPackage: null,
    convertAfterPublish: false,
  };
}

export function switchAssemblyTarget(
  state: ExtensionAssemblyState,
  target: ExtensionReleaseTarget,
  sources: ExtensionInheritanceSource[],
): ExtensionAssemblyState {
  if (state.target === target) return state;
  return {
    ...state,
    target,
    inheritanceSourceId: defaultInheritanceSourceId(sources),
    convertAfterPublish: target === 'codeagent' ? state.convertAfterPublish : false,
  };
}

function defaultCapabilityFile(type: ExtensionCapabilityType, capability: ExtensionCapability) {
  if (type === 'skill') return 'SKILL.md';
  const stem = cleanSegment(capability.name).replace(/\s+(Command|Agent)$/i, '');
  return `${stem || type}.md`;
}

function capabilityFilePaths(
  type: ExtensionCapabilityType,
  capability: ExtensionCapability,
): string[] {
  const files = capability.files.length
    ? capability.files.map((file) => normalizeArchivePath(file.name)).filter(Boolean)
    : [defaultCapabilityFile(type, capability)];
  const capabilityName = cleanSegment(capability.name) || capability.id;
  return files.map((file) => `${capabilityFolders[type]}/${capabilityName}/${file}`);
}

function upsertFile(
  files: Map<string, { source: ExtensionPackageSource; size?: number }>,
  path: string,
  source: ExtensionPackageSource,
  size?: number,
): void {
  const normalized = normalizeArchivePath(path);
  if (!normalized) return;
  files.set(normalized, { source, size });
}

function sourcePriority(source?: ExtensionPackageSource): number {
  return source === 'system' ? 0 : source === 'inherited' ? 1 : 2;
}

function sortNodes(nodes: ExtensionPackageNode[]): ExtensionPackageNode[] {
  return nodes
    .map((node) => ({
      ...node,
      ...(node.children ? { children: sortNodes(node.children) } : {}),
    }))
    .sort((left, right) => {
      const sourceDifference = sourcePriority(left.source) - sourcePriority(right.source);
      if (sourceDifference) return sourceDifference;
      if (left.source === 'system' && right.source === 'system') {
        const orderDifference =
          (systemEntryOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
          (systemEntryOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER);
        if (orderDifference) return orderDifference;
      }
      if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
      return left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
}

function fileMapToNodes(
  files: Map<string, { source: ExtensionPackageSource; size?: number }>,
): ExtensionPackageNode[] {
  const root: ExtensionPackageNode[] = [];
  files.forEach((metadata, path) => {
    const parts = path.split('/').filter(Boolean);
    let nodes = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const displayName = isFile ? part : `${part}/`;
      let node = nodes.find((candidate) => candidate.name === displayName);
      if (!node) {
        node = {
          name: displayName,
          type: isFile ? 'file' : 'folder',
          source: metadata.source,
          ...(isFile && metadata.size !== undefined ? { size: metadata.size } : {}),
          ...(!isFile ? { children: [] } : {}),
        };
        nodes.push(node);
      } else if (sourcePriority(metadata.source) > sourcePriority(node.source)) {
        node.source = metadata.source;
      }
      nodes = node.children ?? [];
    });
  });
  return sortNodes(root);
}

export function buildExtensionPackageTree(
  input: BuildExtensionPackageTreeInput,
): ExtensionPackageNode {
  const files = new Map<string, { source: ExtensionPackageSource; size?: number }>();
  const systemPrefix = input.target === 'testagent' ? '.testagent/' : '';

  (Object.keys(capabilityFolders) as ExtensionCapabilityType[]).forEach((type) => {
    input.capabilities[type].forEach((capability) => {
      capabilityFilePaths(type, capability).forEach((path) =>
        upsertFile(files, `${systemPrefix}${path}`, 'system'),
      );
    });
  });
  upsertFile(files, 'plugin.json', 'system');
  upsertFile(files, 'codeagent-extension.json', 'system');

  input.inheritedFiles.forEach((file) =>
    upsertFile(files, `${systemPrefix}${file.path}`, 'inherited', file.size),
  );
  input.uploadedFiles.forEach((file) => upsertFile(files, file.path, 'uploaded', file.size));

  return {
    name: `${input.extensionName.trim() || 'extension'}/`,
    type: 'folder',
    source: 'system',
    children: fileMapToNodes(files),
  };
}

export function countPackageFiles(node: ExtensionPackageNode): number {
  if (node.type === 'file') return 1;
  return (node.children ?? []).reduce((total, child) => total + countPackageFiles(child), 0);
}

export async function submitExtensionAssemblyMock(
  input: SubmitExtensionAssemblyInput,
): Promise<SubmitExtensionAssemblyResult> {
  if (!input.extensionName.trim()) throw new Error('Extension 名称不能为空');
  const sequence = Math.random().toString(36).slice(2, 9);
  return {
    ...input,
    convertAfterPublish: input.target === 'codeagent' && input.convertAfterPublish,
    taskId: `mock-extension-assembly-${Date.now()}-${sequence}`,
    convertTaskCreated: input.target === 'codeagent' && input.convertAfterPublish,
  };
}

