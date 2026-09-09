<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import HarnessCatalogCreateScope from './HarnessCatalogCreateScope.vue';
import { getHarnessCapabilityPlanningApi } from '../../services/skillMarket/harnessCapabilityPlanningService';
import { usesHttpHarnessAssetApi } from '../../services/skillMarket/assetManagementService';
import { getDepartmentNodeCode } from '../../services/skillMarket/marketDeptTreeFromApi';
import { skillBaseService } from '../../services/skillMarket/skillBaseService';
import {
  normalizeSkillImportResponse,
  normalizeSkillTransferParams,
  openSkillExportResponse,
  skillImportErrorMessage,
} from '../../services/skillMarket/skillTransferService';
import type { ProductPlanningOption } from '../../services/skillMarket/skillPlanningShared';
import type { HarnessScopeSnapshot } from '../../types/harnessFilterMemory';

type DepartmentNode = { id?: string; deptCode?: string; name: string; children?: DepartmentNode[] };
type ImportResult = { successCount: number; failCount: number; errors: string[] };

const props = defineProps<{
  assetType: 'Agent' | 'Skill' | 'Command';
  userId: string;
  departmentTree: DepartmentNode[];
  initialScope: HarnessScopeSnapshot;
  allowedDepartmentPaths: string[][];
  restrictToAllowedDepartments: boolean;
}>();
const emit = defineEmits<{ close: []; imported: [] }>();
const api = getHarnessCapabilityPlanningApi(
  props.assetType === 'Agent' ? 'agent' : props.assetType === 'Command' ? 'command' : 'skill',
);
const level = ref(props.initialScope.level);
const departmentPath = ref([...props.initialScope.departmentPath]);
const productName = ref('');
const products = ref<ProductPlanningOption[]>([]);
const productsLoading = ref(false);
const productError = ref('');
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const submitting = ref(false);
const downloading = ref(false);
const downloadMessage = ref('');
const dragging = ref(false);
const error = ref('');
const result = ref<ImportResult | null>(null);
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
const busy = computed(() => submitting.value || downloading.value);
const locked = computed(() => busy.value || Boolean(result.value));
const canDownload = computed(() => !scopeError.value && !productsLoading.value && !busy.value);
const canSubmit = computed(
  () => Boolean(file.value) && !scopeError.value && !productsLoading.value && !locked.value,
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

function chooseFiles(files: FileList | null | undefined): void {
  if (locked.value || !files?.length) return;
  file.value = null;
  error.value = '';
  if (files.length !== 1) {
    error.value = '请一次选择一个 Excel 文件';
  } else if (!/\.(xlsx|xls)$/i.test(files[0]!.name)) {
    error.value = '仅支持 .xlsx 或 .xls 格式的 Excel 文件';
  } else if (files[0]!.size === 0) {
    error.value = '文件为空，请重新选择';
  } else {
    file.value = files[0]!;
  }
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  chooseFiles(input.files);
  input.value = '';
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  chooseFiles(event.dataTransfer?.files);
}

function close(): void {
  if (!busy.value) emit('close');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // The department popup handles its own Escape key first.
    if (document.querySelector('.market-dept-cascader-panel')) return;
    event.preventDefault();
    close();
  }
  if (event.key !== 'Tab') return;
  const elements = Array.from(
    dialogRef.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled), input:not([hidden]):not(:disabled), [tabindex="0"]',
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
    error.value = cause instanceof Error ? cause.message : '下载已有数据失败，请重试';
  } finally {
    downloading.value = false;
  }
}

async function submit(): Promise<void> {
  if (!canSubmit.value || !file.value) return;
  submitting.value = true;
  error.value = '';
  downloadMessage.value = '';
  try {
    const scope = buildTransferParams();
    if (props.assetType === 'Skill') {
      const formData = new FormData();
      formData.append('file', file.value);
      const imported = normalizeSkillImportResponse(
        await skillBaseService.importSkillMasterManagement(formData, scope),
      );
      result.value = {
        successCount: imported.successCount,
        failCount: imported.failCount,
        errors: imported.errorList.map((item) => `第 ${item.rowNum} 行：${item.errMsg}`),
      };
    } else {
      result.value = await api.importCatalog(file.value, scope);
    }
    emit('imported');
  } catch (cause) {
    error.value = skillImportErrorMessage(cause, `${props.assetType} 导入失败，请重试`);
  } finally {
    submitting.value = false;
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
    <div class="catalog-import-mask" @click.self="close" @dragover.prevent @drop.prevent>
      <section
        ref="dialogRef"
        class="catalog-import-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="`导入 ${assetType}`"
        :aria-busy="busy"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header>
          <div>
            <span class="catalog-import-eyebrow">IMPORT</span>
            <h2>导入 {{ assetType }}</h2>
          </div>
          <div class="catalog-import-header-actions">
            <button
              type="button"
              class="catalog-import-button"
              :disabled="!canDownload"
              :title="scopeError || '下载当前归属下的已有数据'"
              @click="downloadExistingData"
            >
              {{ downloading ? '下载中…' : '下载已有数据' }}
            </button>
            <button
              type="button"
              class="catalog-import-close"
              aria-label="关闭导入窗口"
              :disabled="busy"
              @click="close"
            >
              ×
            </button>
          </div>
        </header>
        <p class="catalog-import-description">选择资产归属并上传 Excel 文件，确认后开始导入。</p>
        <div class="catalog-import-body">
          <HarnessCatalogCreateScope
            :level="level"
            :department-path="departmentPath"
            :department-tree="departmentTree"
            :product-name="productName"
            :products="products"
            :products-loading="productsLoading"
            :disabled="locked"
            :allowed-department-paths="allowedDepartmentPaths"
            scope-label="导入资产归属"
            department-aria-label="导入资产部门"
            @level-change="level = $event"
            @department-change="departmentPath = $event"
            @product-change="productName = $event"
          />
          <p v-if="productError" class="catalog-import-error" role="alert">
            {{ productError }}
            <button type="button" :disabled="locked" @click="loadProducts()">重试</button>
          </p>
          <div
            class="catalog-import-dropzone"
            :class="{ 'is-dragging': dragging && !locked, 'is-locked': locked }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <span class="catalog-import-file-icon" aria-hidden="true">↑</span>
            <strong>{{ file ? file.name : '将文件拖拽到此处' }}</strong>
            <span>{{
              file
                ? `${Math.max(1, Math.ceil(file.size / 1024))} KB`
                : '支持 .xlsx、.xls 格式，每次导入一个文件'
            }}</span>
            <input
              ref="fileInput"
              type="file"
              accept=".xlsx,.xls"
              hidden
              :disabled="locked"
              @change="onFileChange"
            />
            <button
              type="button"
              class="catalog-import-button is-primary"
              :disabled="locked"
              @click="fileInput?.click()"
            >
              {{ file ? '重新选择文件' : '选择文件' }}
            </button>
          </div>
          <p v-if="scopeError" class="catalog-import-description">{{ scopeError }}</p>
          <p v-if="error" class="catalog-import-error" role="alert">{{ error }}</p>
          <p v-if="downloadMessage" class="catalog-import-description" role="status">
            {{ downloadMessage }}
          </p>
          <div v-if="result" class="catalog-import-result">
            <p role="status">
              导入完成：成功 {{ result.successCount }} 条，失败 {{ result.failCount }} 条
            </p>
            <ul v-if="result.errors.length">
              <li v-for="(message, index) in result.errors" :key="index">{{ message }}</li>
            </ul>
          </div>
        </div>
        <footer>
          <button
            v-if="!result"
            type="button"
            class="catalog-import-button"
            :disabled="busy"
            @click="close"
          >
            取消
          </button>
          <button
            v-if="!result"
            type="button"
            class="catalog-import-button is-primary"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ submitting ? '导入中…' : '开始导入' }}
          </button>
          <button
            v-else
            type="button"
            class="catalog-import-button is-primary"
            :disabled="busy"
            @click="close"
          >
            完成
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.catalog-import-mask {
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
.catalog-import-dialog {
  display: flex;
  flex-direction: column;
  width: 804px;
  max-width: 100%;
  max-height: calc(100dvh - 48px);
  min-height: 0;
  box-sizing: border-box;
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  color: #354463;
  box-shadow: 0 24px 70px rgba(20, 29, 49, 0.22);
  outline: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}
.catalog-import-dialog header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.catalog-import-header-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
}
.catalog-import-dialog h2 {
  margin: 10px 0 0;
  font-size: 22px;
}
.catalog-import-eyebrow {
  color: #5a66ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
}
.catalog-import-close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: #f1f4f9;
  color: #71809a;
  font-size: 22px;
  cursor: pointer;
}
.catalog-import-description {
  margin: 10px 0;
  color: #7a879e;
  font-size: 12px;
}
.catalog-import-body {
  min-height: 0;
  overflow-y: auto;
}
.catalog-import-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 16px;
  border: 1px dashed #bccaf0;
  border-radius: 10px;
  background: #fafbff;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.catalog-import-dropzone.is-dragging {
  border-color: #3563e9;
  background: #edf3ff;
}
.catalog-import-dropzone strong {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 14px;
}
.catalog-import-dropzone > span {
  color: #8491a8;
  font-size: 12px;
}
.catalog-import-dropzone .catalog-import-file-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #eaf0ff;
  color: #3563e9;
  font-size: 28px;
}
.catalog-import-dialog footer {
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 22px;
}
.catalog-import-button {
  padding: 8px 14px;
  border: 1px solid #d5dff0;
  border-radius: 6px;
  background: #fff;
  color: #354463;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.catalog-import-button.is-primary {
  border-color: #3563e9;
  background: #3563e9;
  color: #fff;
}
.catalog-import-button.is-primary:hover:not(:disabled) {
  background: #284fc7;
}
.catalog-import-dialog button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.catalog-import-error {
  color: #c64a54;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.catalog-import-result {
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  background: #f1f5ff;
  font-size: 13px;
}
.catalog-import-result p {
  margin: 0;
}
.catalog-import-result ul {
  margin-bottom: 0;
  padding-left: 20px;
  color: #c64a54;
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .catalog-import-mask {
    padding: 12px;
  }
  .catalog-import-dialog {
    padding: 16px;
    max-height: calc(100dvh - 24px);
  }
}
</style>
