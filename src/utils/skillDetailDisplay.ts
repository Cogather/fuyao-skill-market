import type { SkillFileTreeField } from '../services/skillMarket/apiTypes';

type FileTreeNode = Record<string, FileTreeNode | null>;

function formatDirectoryStructure(structure: FileTreeNode, indent = ''): string[] {
  const entries = Object.entries(structure).filter(([key]) => Boolean(key));
  return entries.flatMap(([key, value], index) => {
    const isLast = index === entries.length - 1;
    const marker = isLast ? '└─ ' : '├─ ';
    const line = `${indent}${marker}${key}${value ? '/' : ''}`;
    if (!value) {
      return [line];
    }
    const childIndent = indent + (isLast ? '   ' : '│  ');
    return [line, ...formatDirectoryStructure(value, childIndent)];
  });
}

function fileTreePathsToNested(paths: string[]): FileTreeNode {
  const structure: FileTreeNode = {};

  for (const raw of paths) {
    const relativePath = String(raw ?? '')
      .replace(/\\/g, '/')
      .trim();
    if (!relativePath) {
      continue;
    }

    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let currentLevel = structure;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index] as string;
      const next = currentLevel[part];
      if (!next) {
        currentLevel[part] = {};
      }
      currentLevel = currentLevel[part] as FileTreeNode;
    }
    currentLevel[parts[parts.length - 1] as string] = null;
  }

  return structure;
}

export function formatFileTreeTextFromPaths(paths: string[]): string {
  const structure = fileTreePathsToNested(paths);
  if (Object.keys(structure).length === 0) {
    return '';
  }
  return formatDirectoryStructure(structure).join('\n');
}

export function fileTreePayloadIsPresent(raw: unknown): boolean {
  if (raw == null) {
    return false;
  }
  if (typeof raw === 'string') {
    return raw.trim().length > 0;
  }
  if (Array.isArray(raw)) {
    return raw.some((item) => String(item ?? '').trim().length > 0);
  }
  return false;
}

export function normalizeDetailFileTreeToDisplay(raw: unknown): string {
  if (raw == null) {
    return '';
  }

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) {
      return '';
    }
    if (/[├└│┌]/.test(text)) {
      return text;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        const paths = parsed.map((item) => String(item)).filter(Boolean);
        return paths.length > 0 ? formatFileTreeTextFromPaths(paths) : '';
      }
    } catch {
      // Treat non-JSON strings as newline-delimited paths.
    }
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length > 0 ? formatFileTreeTextFromPaths(lines) : '';
  }

  if (Array.isArray(raw)) {
    const paths = raw.map((item) => String(item)).filter(Boolean);
    return paths.length > 0 ? formatFileTreeTextFromPaths(paths) : '';
  }

  return '';
}

export function fileTreeFromDetailDto(raw: unknown): SkillFileTreeField {
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  return '';
}
