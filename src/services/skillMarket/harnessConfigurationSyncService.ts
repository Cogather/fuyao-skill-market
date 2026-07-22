import { readonly, ref, shallowRef } from 'vue';

export type HarnessConfigurationKind = 'scene' | 'activity' | 'permission';

export interface HarnessConfigurationChange {
  kind: HarnessConfigurationKind;
  departmentName: string;
  changedAt: string;
}

const revision = ref(0);
const lastChange = shallowRef<HarnessConfigurationChange | null>(null);

/**
 * Shared revision for planning pages that consume Harness configuration.
 * Consumers can watch this value and reload their scene/activity/permission options.
 */
export const harnessConfigurationRevision = readonly(revision);
export const lastHarnessConfigurationChange = readonly(lastChange);

export function notifyHarnessConfigurationChanged(
  kind: HarnessConfigurationKind,
  departmentName = '',
): void {
  lastChange.value = {
    kind,
    departmentName: departmentName.trim(),
    changedAt: new Date().toISOString(),
  };
  revision.value += 1;
}
