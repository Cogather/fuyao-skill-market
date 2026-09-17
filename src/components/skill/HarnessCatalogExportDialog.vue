<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import HarnessCatalogCreateScope from './HarnessCatalogCreateScope.vue';
import { getHarnessCapabilityPlanningApi } from '../../services/skillMarket/harnessCapabilityPlanningService';
import { usesHttpHarnessAssetApi } from '../../services/skillMarket/assetManagementService';
import { getDepartmentNodeCode } from '../../services/skillMarket/marketDeptTreeFromApi';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';
import {
  normalizeSkillTransferParams,
  openSkillExportResponse,
} from '../../services/skillMarket/skillTransferService';
import type { ProductPlanningOption } from '../../services/skillMarket/skillPlanningShared';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';

type DepartmentNode = { id?: string; deptCode?: string; name: string; children?: DepartmentNode[] };

const props = defineProps<{
  assetType: 'Agent' | 'Skill' | 'Command';
  userId: string;
  departmentTree: DepartmentNode[];
  initialScope: HarnessScopeSnapshot;
  allowedDepartmentPaths: string[][];
  restrictToAllowedDepartments: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const api = getHarnessCapabilityPlanningApi(
  props.assetType === 'Agent' ? 'agent' : props.assetType === 'Command' ? 'command' : 'skill',
);
const level = ref(props.initialScope.level);
const departmentPath = ref([...props.initialScope.departmentPath]);
const productName = ref('');
const products = ref<ProductPlanningOption[]>([]);
const productsLoading = ref(false);
const productError = ref('');
const dialogRef = ref<HTMLElement | null>(null);
const downloading = ref(false);
const downloadMessage = ref('');
const error = ref('');
let productSequence = 0;
const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

const selectedDepartment = computed(() => {
  let nodes = props.departmentTree;
  let selected: DepartmentNode | undefined;
  for (const name of departmentPath.value) {
    selected = nodes.find((node) => node.name === name);
    if (!selected) return undefined;
    nodes = selected.children ?? [];
  }
  return selected;
});
const selectedProduct = computed(() =>
  products.value.find((item) => item.offeringName === productName.value),
);
const scopeError = computed(() => {
  if (!props.userId.trim()) return '尚未获取当前用户工号';
  if (!selectedDepartment.value) return '请选择部门';
  if (
    props.restrictToAllowedDepartments &&
    !props.allowedDepartmentPaths.some(
      (path) =>
        path.length > 0 &&
        path.length <= departmentPath.value.length &&
        path.every((name, index) => name === departmentPath.value[index]),
    )
  )
    return '请选择有权限的部门或其下级部门';
  if (!getDepartmentNodeCode(selectedDepartment.value)) return '所选部门缺少部门编码';
  if (level.value === '产品级' && !selectedProduct.value?.offeringId) return '请选择产品';
  return '';
});
const canDownload = computed(
  () => !scopeError.value && !productsLoading.value && !downloading.value,
);

async function loadProducts(preferredId = ''): Promise<void> {
  const sequence = ++productSequence;
  products.value = [];
  productName.value = '';
  productError.value = '';
  productsLoading.value = false;
  if (level.value !== '产品级' || !selectedDepartment.value) return;
  const code = getDepartmentNodeCode(selectedDepartment.value);
  if (!code) return;
  productsLoading.value = true;
  try {
    const options = await api.getProducts('', selectedDepartment.value.name, code);
    if (sequence !== productSequence) return;
    products.value = options;
    productName.value =
      (preferredId ? options.find((item) => item.offeringId === preferredId) : options[0])
        ?.offeringName ?? '';
  } catch (cause) {
    if (sequence === productSequence)
      productError.value = cause instanceof Error ? cause.message : '产品列表加载失败';
  } finally {
    if (sequence === productSequence) productsLoading.value = false;
  }
}

watch([level, departmentPath], () => {
  void loadProducts();
});
watch([level, departmentPath, productName], () => {
  error.value = '';
  downloadMessage.value = '';
});

function close(): void {
  if (!downloading.value) emit('close');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const elements = Array.from(
    dialogRef.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled), [tabindex="0"]',
    ) ?? [],
  ).filter((element) => element.getClientRects().length > 0);
  const target = event.shiftKey ? elements.at(-1) : elements[0];
  if (
    target &&
    (document.activeElement === (event.shiftKey ? elements[0] : elements.at(-1)) ||
      document.activeElement === dialogRef.value)
  ) {
    event.preventDefault();
    target.focus();
  }
}

function buildTransferParams() {
  return normalizeSkillTransferParams({
    userId: props.userId,
    dimType: level.value,
    dimCode:
      level.value === '产品级'
        ? selectedProduct.value!.offeringId
        : getDepartmentNodeCode(selectedDepartment.value),
    dimName:
      level.value === '产品级'
        ? selectedProduct.value!.offeringName
        : selectedDepartment.value!.name,
  });
}

async function downloadExistingData(): Promise<void> {
  if (!canDownload.value) return;
  downloading.value = true;
  error.value = '';
  downloadMessage.value = '';
  try {
    const scope = buildTransferParams();
    if (props.assetType === 'Skill') {
      openSkillExportResponse(await skillBaseService.exportSkillMasterManagement(scope));
    } else {
      const records = usesHttpHarnessAssetApi()
        ? []
        : await api.queryCatalog({
            level: scope.dimType,
            departmentName: scope.dimType === '部门级' ? scope.dimName : '',
            product: scope.dimType === '产品级' ? scope.dimName : '',
          });
      await api.exportCatalog(records, scope);
    }
    downloadMessage.value = `已开始下载 ${props.assetType} 清单`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '下载失败，请重试';
  } finally {
    downloading.value = false;
  }
}

onMounted(() => {
  dialogRef.value?.focus();
  void loadProducts(props.initialScope.offeringId);
});
onBeforeUnmount(() => {
  productSequence++;
  returnFocus?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div class="catalog-export-mask harness-workspace-overlay">
      <section
        ref="dialogRef"
        class="catalog-export-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="`导出 ${assetType}`"
        :aria-busy="downloading"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header>
          <h2>导出 {{ assetType }}</h2>
          <button
            type="button"
            class="catalog-export-close"
            aria-label="关闭导出窗口"
            :disabled="downloading"
            @click="close"
          >
            ×
          </button>
        </header>
        <p class="catalog-export-description">选择资产归属，下载当前范围内的 Excel 数据。</p>
        <HarnessCatalogCreateScope
          :level="level"
          :department-path="departmentPath"
          :department-tree="departmentTree"
          :product-name="productName"
          :products="products"
          :products-loading="productsLoading"
          :disabled="downloading"
          :allowed-department-paths="allowedDepartmentPaths"
          scope-label="导出资产归属"
          department-aria-label="导出资产部门"
          @level-change="level = $event"
          @department-change="departmentPath = $event"
          @product-change="productName = $event"
        />
        <p v-if="productError" class="catalog-export-error" role="alert">
          {{ productError }}
          <button type="button" :disabled="downloading" @click="loadProducts()">重试</button>
        </p>
        <p v-if="scopeError" class="catalog-export-description">{{ scopeError }}</p>
        <p v-if="error" class="catalog-export-error" role="alert">{{ error }}</p>
        <p v-if="downloadMessage" class="catalog-export-description" role="status">
          {{ downloadMessage }}
        </p>
        <footer>
          <button
            type="button"
            class="catalog-import-button catalog-export-button"
            :disabled="downloading"
            @click="close"
          >
            取消
          </button>
          <button
            type="button"
            class="catalog-import-button catalog-export-button is-primary"
            :disabled="!canDownload"
            :title="scopeError || '下载当前归属下的已有数据'"
            @click="downloadExistingData"
          >
            {{ downloading ? '下载中…' : '下载' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.catalog-export-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 29, 49, 0.42);
  backdrop-filter: blur(4px);
}
.catalog-export-dialog {
  width: min(1206px, calc(100vw - 48px));
  max-width: 100%;
  box-sizing: border-box;
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  color: #354463;
  box-shadow: 0 24px 70px rgba(20, 29, 49, 0.22);
  outline: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}
.catalog-export-dialog > :deep(.catalog-create-scope) {
  grid-template-columns: 174px minmax(0, 1fr) minmax(140px, 220px);
}
.catalog-export-dialog header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.catalog-export-dialog h2 {
  margin: 10px 0 0;
  font-size: 22px;
}
.catalog-export-close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f1f4f9;
  color: #71809a;
  font-size: 22px;
  cursor: pointer;
}
.catalog-export-description {
  margin: 10px 0;
  color: #7a879e;
  font-size: 12px;
}
.catalog-export-button {
  padding: 8px 14px;
  border: 1px solid #d5dff0;
  border-radius: 6px;
  background: #fff;
  color: #354463;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.catalog-export-dialog button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.catalog-export-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 22px;
}
.catalog-export-error {
  color: #c64a54;
  font-size: 12px;
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .catalog-export-mask {
    padding: 12px;
  }
  .catalog-export-dialog {
    padding: 16px;
  }
  .catalog-export-dialog > header {
    flex-wrap: wrap;
  }
}
</style>
