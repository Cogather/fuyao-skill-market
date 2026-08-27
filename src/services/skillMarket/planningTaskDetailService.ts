import { queryHttpPlanningItemContent, queryHttpPlanningItemFiles } from './extensionPublishHttp';
import type { ExtensionCapability, ExtensionCapabilityType } from './extensionPublishMock';
import {
  usesRemotePlanningTasks,
  type PlanningTaskCapabilityType,
  type SkillPlanningTask,
} from './skillPlanningTaskService';

export type PlanningTaskDetailIdentity = {
  userId: string;
  capabilityType: PlanningTaskCapabilityType;
  capabilityName: string;
  version: string;
  filePath?: string;
};

function normalizedVersion(value: unknown): string {
  const version = String(value ?? '').trim();
  if (!version) return '';
  return /^v/i.test(version) ? version : `v${version}`;
}

function versionParts(version: string): number[] {
  return normalizedVersion(version)
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number(part) || 0);
}

function compareVersionsDescending(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return right.localeCompare(left);
}

export function planningTaskDetailVersions(
  task: SkillPlanningTask,
  tasks: SkillPlanningTask[],
): string[] {
  const versions = tasks
    .filter((item) => item.name === task.name)
    .flatMap((item) => [item.version, ...(item.versions ?? [])])
    .map(normalizedVersion)
    .filter(Boolean);

  if (!usesRemotePlanningTasks()) {
    versions.push('v0.0.1', 'v0.0.2', 'v0.0.3');
  }

  const uniqueVersions = [
    ...new Set([normalizedVersion(task.version), ...versions].filter(Boolean)),
  ];
  return usesRemotePlanningTasks()
    ? uniqueVersions
    : uniqueVersions.sort(compareVersionsDescending);
}

function extensionCapability(identity: PlanningTaskDetailIdentity): ExtensionCapability {
  return {
    id: `${identity.capabilityType}:${identity.capabilityName}:${identity.version}`,
    name: identity.capabilityName,
    version: normalizedVersion(identity.version).replace(/^v/i, ''),
    publishDate: '',
    ready: true,
    files: [],
  };
}

export function planningTaskDetailDirectFilePath(
  capabilityName: string,
  capabilityType: Exclude<PlanningTaskCapabilityType, 'skill'>,
): string {
  const fallback = capabilityType === 'command' ? 'COMMAND.md' : 'AGENT.md';
  const name = capabilityName.trim();
  return name ? `${name}.md` : fallback;
}

function mockSkillFilePaths(): string[] {
  return ['SKILL.md', 'references/usage.md', 'scripts/run.sh', 'templates/config.json'];
}

function capabilityLabel(type: PlanningTaskCapabilityType): 'Command' | 'Skill' | 'Agent' {
  if (type === 'command') return 'Command';
  if (type === 'agent') return 'Agent';
  return 'Skill';
}

function mockFileContent(identity: PlanningTaskDetailIdentity, filePath: string): string {
  const label = capabilityLabel(identity.capabilityType);
  const version = normalizedVersion(identity.version);
  const title = identity.capabilityName || `未命名 ${label}`;

  if (identity.capabilityType === 'command') {
    return `# ${title}\n\n版本：${version}\n\n用于执行 ${title} 对应的标准化操作。\n\n## 参数\n- input: 输入内容\n- mode: default\n\n## 输出\n- result: 执行结果`;
  }

  if (identity.capabilityType === 'agent') {
    return `# ${title}\n\n版本：${version}\n\n基于任务上下文调用工具并完成 ${title}。\n\n## 输入\n- context: 任务上下文\n\n## 输出\n- summary: 处理摘要\n- artifacts: 产物列表`;
  }

  if (filePath === 'SKILL.md') {
    return `# ${title}\n\n版本：${version}\n\n自动检查输入信息与上下游约束，形成可执行的分析结果。\n\n## 调用\n\`\`\`yaml\ncapability: ${title}\nversion: ${version.replace(/^v/i, '')}\n\`\`\``;
  }
  if (filePath === 'references/usage.md') {
    return `# 使用说明\n\n当前版本：${version}\n\n1. 准备任务上下文。\n2. 调用 ${title}。\n3. 校验并保存输出结果。`;
  }
  if (filePath === 'scripts/run.sh') {
    return `#!/usr/bin/env bash\n\n# ${title} ${version}\necho "running ${title}"`;
  }
  return `{\n  "name": "${title}",\n  "version": "${version.replace(/^v/i, '')}",\n  "enabled": true\n}`;
}

export async function queryPlanningTaskDetailFilePaths(
  identity: PlanningTaskDetailIdentity,
): Promise<string[]> {
  if (!usesRemotePlanningTasks()) {
    return identity.capabilityType === 'skill'
      ? mockSkillFilePaths()
      : [
          identity.filePath ||
            planningTaskDetailDirectFilePath(
              identity.capabilityName,
              identity.capabilityType as Exclude<PlanningTaskCapabilityType, 'skill'>,
            ),
        ];
  }

  if (identity.capabilityType !== 'skill') {
    return [
      identity.filePath ||
        planningTaskDetailDirectFilePath(
          identity.capabilityName,
          identity.capabilityType as Exclude<PlanningTaskCapabilityType, 'skill'>,
        ),
    ];
  }

  return queryHttpPlanningItemFiles(
    identity.userId,
    identity.capabilityType as ExtensionCapabilityType,
    extensionCapability(identity),
  );
}

export async function queryPlanningTaskDetailFileContent(
  identity: PlanningTaskDetailIdentity,
  filePath: string,
): Promise<string> {
  if (!usesRemotePlanningTasks()) return mockFileContent(identity, filePath);

  return queryHttpPlanningItemContent(
    identity.userId,
    identity.capabilityType as ExtensionCapabilityType,
    extensionCapability(identity),
    filePath,
  );
}
