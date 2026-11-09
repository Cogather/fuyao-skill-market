import { ref, watch, type Ref } from 'vue';
import type {
  HarnessDepartmentSnapshot,
  HarnessListFilterSnapshot,
  HarnessScopeSnapshot,
  HarnessWorkspaceFilterSnapshot,
} from '../types/harnessFilterMemory';

type Validator<T> = (value: unknown) => value is T;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSnapshotRecord<T>(validate: Validator<T>): Validator<Record<string, T>> {
  return (value): value is Record<string, T> =>
    isObject(value) && Object.values(value).every(validate);
}

export const isDepartmentSnapshot: Validator<HarnessDepartmentSnapshot> = (
  value,
): value is HarnessDepartmentSnapshot =>
  isObject(value) &&
  Array.isArray(value.departmentPath) &&
  value.departmentPath.every((segment) => typeof segment === 'string');

export const isScopeSnapshot: Validator<HarnessScopeSnapshot> = (
  value,
): value is HarnessScopeSnapshot =>
  isDepartmentSnapshot(value) &&
  'level' in value &&
  (value.level === '产品级' || value.level === '部门级') &&
  'offeringId' in value &&
  typeof value.offeringId === 'string' &&
  'offeringName' in value &&
  typeof value.offeringName === 'string';

export const isListFilterSnapshot: Validator<HarnessListFilterSnapshot> = (
  value,
): value is HarnessListFilterSnapshot =>
  isObject(value) && typeof value.departmentId === 'string' && typeof value.productId === 'string';

export const isWorkspaceFilterSnapshot: Validator<HarnessWorkspaceFilterSnapshot> = (
  value,
): value is HarnessWorkspaceFilterSnapshot =>
  isObject(value) &&
  (value.level === '产品级' || value.level === '部门级') &&
  typeof value.departmentId === 'string' &&
  (value.product === null ||
    (isObject(value.product) &&
      typeof value.product.offeringId === 'string' &&
      typeof value.product.offeringName === 'string'));

function storageKey(userId: string, key: string): string {
  const transport = import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http' ? 'http' : 'mock';
  return `harness-filter-memory-v1:${transport}:${encodeURIComponent(userId)}:${key}`;
}

export function readHarnessFilterMemory<T>(
  userId: string,
  key: string,
  validate: Validator<T>,
): T | undefined {
  if (!userId || typeof window === 'undefined') return undefined;
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(storageKey(userId, key)) || 'null',
    );
    return validate(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writeHarnessFilterMemory(userId: string, key: string, value: unknown): void {
  if (!userId || typeof window === 'undefined' || value === undefined) return;
  try {
    window.localStorage.setItem(storageKey(userId, key), JSON.stringify(value));
  } catch {
    // Storage may be unavailable in an embedded page; retain the current in-memory selection.
  }
}

/** Persist only selection snapshots; each user and entry point has its own storage key. */
export function useHarnessFilterMemory<T>(
  userId: () => string,
  key: string,
  validate: Validator<T>,
  createDefault: () => T,
): Ref<T> {
  const snapshot = ref(createDefault()) as Ref<T>;
  let restoring = false;
  let currentUserId = '';
  watch(
    userId,
    (value) => {
      restoring = true;
      currentUserId = value;
      snapshot.value = readHarnessFilterMemory(value, key, validate) ?? createDefault();
      restoring = false;
    },
    { immediate: true, flush: 'sync' },
  );
  watch(
    snapshot,
    (value) => {
      if (!restoring) writeHarnessFilterMemory(currentUserId, key, value);
    },
    { deep: true, flush: 'sync' },
  );
  return snapshot;
}
