import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  buildHttpExtensionTree,
  extensionAssemblyHttp,
  type BypassEntry,
  type BypassResult,
  type ExtensionAssemblyDetail,
  type ExtensionLayout,
  type ExtensionSearchItem,
  type StructureComponent,
  type StructureEntry,
} from '../services/skillMarket/extensionAssemblyHttp';
import type {
  ExtensionAssemblyState,
  ExtensionReleaseTarget,
} from '../services/skillMarket/extensionReleaseAssembly';

export type ExtensionHttpAssemblyContext = ExtensionAssemblyDetail & {
  userId: string;
  extensionName: string;
  components: StructureComponent[];
  hasPublishedPackage: boolean;
};

function message(error: unknown): string {
  const response = (
    error as { response?: { data?: { message?: string; meta?: { message?: string } } } }
  )?.response?.data;
  return (
    response?.message ||
    response?.meta?.message ||
    (error instanceof Error ? error.message : '操作失败，请重试')
  );
}

/** HTTP edit state is persisted by each mutation; inheritBypass is a publish-only choice. */
export function useExtensionHttpAssembly(
  context: () => ExtensionHttpAssemblyContext | undefined,
  model: () => ExtensionAssemblyState,
  update: (patch: Partial<ExtensionAssemblyState>) => void,
  snapshot: (detail: ExtensionAssemblyDetail) => void,
) {
  const layout = ref<ExtensionLayout>('standard');
  const currentEntries = ref<BypassEntry[]>([]);
  const hasBypass = ref(false);
  const sourceName = ref('');
  const ignoredEntries = ref<BypassEntry[]>([]);
  const treeEntries = ref<StructureEntry[]>([]);
  const treeLoading = ref(false);
  const mutating = ref(false);
  const error = ref('');
  const treeError = ref('');
  const searchError = ref('');
  const searchLoading = ref(false);
  const searchResults = ref<ExtensionSearchItem[]>([]);
  let generation = 0;
  let treeSequence = 0;
  let searchSequence = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const busy = computed(() => mutating.value || treeLoading.value);
  const blocked = computed(() => Boolean(context()) && (busy.value || Boolean(treeError.value)));
  const tree = computed(() =>
    buildHttpExtensionTree(
      context()?.extensionName || 'extension',
      treeEntries.value,
      model().inheritBypass !== false,
    ),
  );
  const identity = () => ({
    userId: context()?.userId ?? '',
    extensionName: context()?.extensionName ?? '',
  });
  function publishSnapshot(): void {
    snapshot({
      layoutMode: layout.value,
      hasBypass: hasBypass.value,
      bypassEntries: [...currentEntries.value],
    });
  }

  async function refreshTree(): Promise<void> {
    const current = context();
    if (!current) return;
    const sequence = ++treeSequence;
    const epoch = generation;
    treeLoading.value = true;
    treeError.value = '';
    treeEntries.value = [];
    try {
      const result = await extensionAssemblyHttp.tree({
        ...identity(),
        layout: layout.value,
        components: current.components,
      });
      if (epoch === generation && sequence === treeSequence) treeEntries.value = result.entries;
    } catch (cause) {
      if (epoch === generation && sequence === treeSequence) treeError.value = message(cause);
    } finally {
      if (epoch === generation && sequence === treeSequence) treeLoading.value = false;
    }
  }

  async function mutate<T>(
    request: () => Promise<T>,
    apply: (result: T) => void,
  ): Promise<boolean> {
    if (!context() || mutating.value) return false;
    const epoch = generation;
    mutating.value = true;
    error.value = '';
    try {
      const result = await request();
      if (epoch !== generation) return false;
      apply(result);
      publishSnapshot();
      await refreshTree();
      return true;
    } catch (cause) {
      if (epoch === generation) error.value = message(cause);
      return false;
    } finally {
      if (epoch === generation) mutating.value = false;
    }
  }

  function applyBypass(
    result: BypassResult,
    uploadedPackage: ExtensionAssemblyState['uploadedPackage'] = null,
  ): void {
    layout.value = result.layoutMode;
    currentEntries.value = result.acceptedEntries;
    hasBypass.value = result.acceptedEntries.length > 0;
    ignoredEntries.value = result.ignoredEntries;
    update({
      target: result.layoutMode === 'testagent' ? 'testagent' : 'codeagent',
      inheritBypass: true,
      uploadedPackage,
    });
  }

  async function selectTarget(target: ExtensionReleaseTarget): Promise<boolean> {
    const next = target === 'testagent' ? 'testagent' : 'standard';
    if (next === layout.value) return true;
    return mutate(
      () => extensionAssemblyHttp.setLayout({ ...identity(), layout: next }),
      (result) => {
        layout.value = result.layoutMode;
        update({
          target: result.layoutMode === 'testagent' ? 'testagent' : 'codeagent',
        });
      },
    );
  }

  async function upload(file: File): Promise<boolean> {
    return mutate(
      () => extensionAssemblyHttp.upload({ ...identity(), layout: layout.value, file }),
      (result) => {
        sourceName.value = '';
        applyBypass(result, {
          name: file.name,
          size: file.size,
          files: result.acceptedEntries.map((entry) => ({
            path: entry.path,
            size: entry.size ?? undefined,
          })),
          rejectedPaths: result.ignoredEntries.map((entry) => entry.path),
        });
      },
    );
  }

  async function clear(): Promise<boolean> {
    return mutate(
      () => extensionAssemblyHttp.clear(identity()),
      () => {
        currentEntries.value = [];
        hasBypass.value = false;
        ignoredEntries.value = [];
        sourceName.value = '';
        update({ uploadedPackage: null, inheritBypass: true });
      },
    );
  }

  async function inherit(extensionName: string): Promise<boolean> {
    return mutate(
      () =>
        extensionAssemblyHttp.inherit(identity().userId, {
          sourceExtensionName: extensionName,
          targetExtensionName: identity().extensionName,
        }),
      (result) => {
        applyBypass(result);
        sourceName.value = extensionName;
      },
    );
  }

  async function download(): Promise<boolean> {
    if (!context() || mutating.value) return false;
    const epoch = generation;
    mutating.value = true;
    error.value = '';
    try {
      const result = await extensionAssemblyHttp.download(identity());
      if (epoch !== generation) return false;
      window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
      return true;
    } catch (cause) {
      if (epoch === generation) error.value = message(cause);
      return false;
    } finally {
      if (epoch === generation) mutating.value = false;
    }
  }

  function search(keyword: string): void {
    const sequence = ++searchSequence;
    clearTimeout(searchTimer);
    searchResults.value = [];
    searchError.value = '';
    searchLoading.value = Boolean(keyword.trim());
    if (!keyword.trim() || !context()) return;
    const epoch = generation;
    searchTimer = setTimeout(async () => {
      try {
        const results = await extensionAssemblyHttp.searchExtensions({
          userId: identity().userId,
          keyword: keyword.trim(),
          limit: 20,
        });
        if (epoch === generation && sequence === searchSequence)
          searchResults.value = results.filter(
            (result) => result.extensionName !== identity().extensionName,
          );
      } catch (cause) {
        if (epoch === generation && sequence === searchSequence) searchError.value = message(cause);
      } finally {
        if (epoch === generation && sequence === searchSequence) searchLoading.value = false;
      }
    }, 300);
  }

  watch(
    () => (context() ? JSON.stringify([context()!.userId, context()!.extensionName]) : ''),
    () => {
      generation += 1;
      treeSequence += 1;
      search('');
      mutating.value = false;
      treeLoading.value = false;
      error.value = '';
      treeError.value = '';
      treeEntries.value = [];
      sourceName.value = '';
      ignoredEntries.value = [];
      const current = context();
      if (!current) return;
      layout.value = current.layoutMode === 'testagent' ? 'testagent' : 'standard';
      hasBypass.value = current.hasBypass === true;
      currentEntries.value = hasBypass.value ? (current.bypassEntries ?? []) : [];
      update({
        target: layout.value === 'testagent' ? 'testagent' : 'codeagent',
        inheritBypass: true,
        uploadedPackage: null,
      });
      void refreshTree();
    },
    { immediate: true },
  );

  watch(
    () => JSON.stringify(context()?.components ?? []),
    () => {
      if (context()) void refreshTree();
    },
  );
  onBeforeUnmount(() => {
    generation += 1;
    searchSequence += 1;
    clearTimeout(searchTimer);
  });
  return {
    layout,
    currentEntries,
    hasBypass,
    sourceName,
    ignoredEntries,
    tree,
    busy,
    mutating,
    blocked,
    error,
    treeError,
    treeLoading,
    searchError,
    searchLoading,
    searchResults,
    refreshTree,
    selectTarget,
    upload,
    clear,
    inherit,
    download,
    search,
  };
}
