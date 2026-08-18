export type HarnessDepartmentTraceLevel = 'info' | 'warn' | 'error';

type UnknownRecord = Record<string, unknown>;

const TRACE_PREFIX = '[HarnessDeptTrace]';
const TRACE_ID = `dept-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const NAME_KEYS = ['deptName', 'name', 'label', 'departmentName', 'title'] as const;
const CHILD_KEYS = [
  'children',
  'childrenList',
  'childList',
  'childDepartments',
  'childDepartmentList',
  'childDeptList',
  'subDepartments',
] as const;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readNodeName(record: UnknownRecord): string {
  for (const key of NAME_KEYS) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return '';
}

function readChildren(record: UnknownRecord): { key: string; value: unknown[] } | null {
  for (const key of CHILD_KEYS) {
    const value = record[key];
    if (Array.isArray(value)) return { key, value };
  }
  return null;
}

export type DepartmentTreeDiagnosticSummary = {
  inputType: string;
  rootCount: number;
  nodeCount: number;
  namedNodeCount: number;
  leafCount: number;
  maxDepth: number;
  invalidNodeCount: number;
  rootNames: string[];
  leafPathSamples: string[][];
  childKeys: string[];
  invalidNodeSamples: Array<{ depth: number; type: string; keys?: string[] }>;
};

/**
 * Summarizes both the parent application's raw department tree and the normalized UI tree.
 * Samples are intentionally bounded so an accidental malformed payload cannot flood DevTools.
 */
export function summarizeDepartmentTree(value: unknown): DepartmentTreeDiagnosticSummary {
  const summary: DepartmentTreeDiagnosticSummary = {
    inputType: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
    rootCount: Array.isArray(value) ? value.length : 0,
    nodeCount: 0,
    namedNodeCount: 0,
    leafCount: 0,
    maxDepth: 0,
    invalidNodeCount: 0,
    rootNames: [],
    leafPathSamples: [],
    childKeys: [],
    invalidNodeSamples: [],
  };
  if (!Array.isArray(value)) return summary;

  const childKeys = new Set<string>();
  const visit = (nodes: unknown[], depth: number, parentPath: string[]): void => {
    nodes.forEach((node) => {
      summary.nodeCount += 1;
      summary.maxDepth = Math.max(summary.maxDepth, depth);
      const record = asRecord(node);
      if (!record) {
        summary.invalidNodeCount += 1;
        if (summary.invalidNodeSamples.length < 5) {
          summary.invalidNodeSamples.push({
            depth,
            type: node === null ? 'null' : Array.isArray(node) ? 'array' : typeof node,
          });
        }
        return;
      }

      const name = readNodeName(record);
      const currentPath = name ? [...parentPath, name] : [...parentPath];
      if (name) {
        summary.namedNodeCount += 1;
        if (depth === 1 && summary.rootNames.length < 20) summary.rootNames.push(name);
      } else {
        summary.invalidNodeCount += 1;
        if (summary.invalidNodeSamples.length < 5) {
          summary.invalidNodeSamples.push({
            depth,
            type: 'object-without-name',
            keys: Object.keys(record).slice(0, 20),
          });
        }
      }

      const children = readChildren(record);
      if (children) childKeys.add(children.key);
      if (children?.value.length) {
        visit(children.value, depth + 1, currentPath);
      } else {
        summary.leafCount += 1;
        if (currentPath.length > 0 && summary.leafPathSamples.length < 10) {
          summary.leafPathSamples.push(currentPath);
        }
      }
    });
  };

  visit(value, 1, []);
  summary.childKeys = [...childKeys];
  return summary;
}

export function describeHarnessDepartmentError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: unknown;
      response?: { status?: unknown; data?: unknown };
      config?: { baseURL?: unknown; url?: unknown; method?: unknown };
    };
    return {
      name: error.name,
      message: error.message,
      code: candidate.code,
      status: candidate.response?.status,
      responseData: candidate.response?.data,
      request: candidate.config
        ? {
            method: candidate.config.method,
            baseURL: candidate.config.baseURL,
            url: candidate.config.url,
          }
        : undefined,
      stack: error.stack,
    };
  }
  return { value: error };
}

export function harnessDepartmentTrace(
  stage: string,
  details: Record<string, unknown> = {},
  level: HarnessDepartmentTraceLevel = 'info',
): void {
  const payload = {
    traceId: TRACE_ID,
    timestamp: new Date().toISOString(),
    stage,
    ...details,
  };
  const label = `${TRACE_PREFIX} ${stage}`;
  if (level === 'error') {
    console.error(label, payload);
    return;
  }
  if (level === 'warn') {
    console.warn(label, payload);
    return;
  }
  console.info(label, payload);
}
