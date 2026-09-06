import httpRequest from './request';
import {
  queryHttpExtensionProducts,
  queryHttpPublishableOrganizations,
} from './extensionPublishHttp';
import type {
  HarnessAsset,
  HarnessAssetApi,
  HarnessAssetDetail,
  HarnessAssetFile,
  HarnessAssetFilter,
  HarnessAssetOrganization,
  HarnessAssetQualityReport,
  HarnessAssetRelease,
  HarnessAssetReleaseStatus,
  HarnessAssetScope,
  HarnessAssetType,
  PublishHarnessAssetInput,
} from './assetManagementTypes';
import {
  harnessAssetPublishVersion,
  normalizeHarnessAssetVersion,
} from './assetManagementTypes';

/**
 * 统一资产接口尚待后端确认。联调时只需要在这里替换路径或字段映射，页面不感知。
 * baseURL 由 `httpRequest.harnessApi` 统一补为 `/api/harness`。
 */
export const harnessAssetHttpEndpoints = {
  list: '/assets',
  detail: (type: HarnessAssetType, id: string) =>
    `/assets/${encodeURIComponent(type.toLowerCase())}/${encodeURIComponent(id)}`,
  qualityReport: (type: HarnessAssetType, id: string) =>
    `/assets/${encodeURIComponent(type.toLowerCase())}/${encodeURIComponent(id)}/quality-report`,
  releases: (type: HarnessAssetType, id: string) =>
    `/assets/${encodeURIComponent(type.toLowerCase())}/${encodeURIComponent(id)}/releases`,
} as const;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return /^(undefined|null)$/i.test(normalized) ? '' : normalized;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unwrapData(response: unknown): unknown {
  const responseRecord = asRecord(response);
  const meta = asRecord(responseRecord.meta);
  const code = Number(responseRecord.code ?? 0);
  if (
    meta.success === false ||
    responseRecord.success === false ||
    (Number.isFinite(code) && code >= 400)
  ) {
    throw new Error(
      text(meta.message) || text(responseRecord.message) || text(responseRecord.error) || '请求失败',
    );
  }
  return responseRecord.data ?? responseRecord.result ?? response;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))];
}

function versionArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((item) => normalizeHarnessAssetVersion(text(item))).filter(Boolean)),
  ];
}

function normalizeAssetType(value: unknown): HarnessAssetType {
  const normalized = text(value).toLowerCase();
  if (normalized === 'skill') return 'Skill';
  if (normalized === 'command') return 'Command';
  if (normalized === 'extension') return 'Extension';
  return 'Agent';
}

function normalizeReleaseStatus(value: unknown): HarnessAssetReleaseStatus {
  const status = text(value).toLowerCase();
  if (/失败|fail|error|reject/.test(status)) return '失败';
  if (/进行|publishing|pending|processing/.test(status)) return '进行中';
  if (/成功|success|published|completed|complete|done/.test(status)) return '成功';
  return '进行中';
}

function normalizeOrganization(value: unknown): HarnessAssetOrganization {
  if (typeof value === 'string') return { id: value, name: value };
  const record = asRecord(value);
  const name = text(record.name ?? record.orgName ?? record.organizationName);
  return {
    id: text(record.id ?? record.orgCode ?? record.organizationCode) || name,
    name,
  };
}

function normalizeRelease(value: unknown): HarnessAssetRelease {
  const record = asRecord(value);
  return {
    id: text(record.id ?? record.releaseId) || undefined,
    version: normalizeHarnessAssetVersion(text(record.version)),
    publishedAt: text(record.publishedAt ?? record.date ?? record.createTime),
    organization: normalizeOrganization(
      record.organization ?? {
        id: record.targetOrgCode ?? record.organizationCode,
        name: record.targetOrgName ?? record.organizationName,
      },
    ),
    notes: text(record.notes ?? record.description) || undefined,
    publisher: text(record.publisher ?? record.operatorName) || undefined,
    status: normalizeReleaseStatus(record.status),
    extensionName: text(record.extensionName) || undefined,
  };
}

function normalizeAsset(value: unknown): HarnessAsset {
  const record = asRecord(value);
  const marketplace = asRecord(record.marketplace ?? record.metrics);
  const currentVersion = normalizeHarnessAssetVersion(
    text(record.currentVersion ?? record.version ?? record.latestVersion),
  );
  const nextPublishVersion = normalizeHarnessAssetVersion(
    text(record.nextPublishVersion ?? record.publishVersion),
  );
  const versions = versionArray(record.versions);
  const releases = Array.isArray(record.releases) ? record.releases.map(normalizeRelease) : [];
  return {
    id: text(record.id),
    name: text(record.name),
    description: text(record.description),
    assetType: normalizeAssetType(record.assetType ?? record.type),
    currentVersion,
    nextPublishVersion: nextPublishVersion || undefined,
    versions: versions.length > 0 ? versions : currentVersion ? [currentVersion] : [],
    owner: text(record.owner),
    departmentName: text(record.departmentName),
    departmentPath: stringArray(record.departmentPath),
    productId: text(record.productId),
    productName: text(record.productName),
    auto: record.auto === true,
    marketplace: {
      rating: numberValue(marketplace.rating),
      downloads: numberValue(marketplace.downloads),
      calls: numberValue(marketplace.calls ?? marketplace.totalAccess),
    },
    releases,
    publishable: record.publishable !== false && Boolean(currentVersion),
  };
}

function scopeParams(scope: HarnessAssetScope): Record<string, string> {
  const product = scope.product;
  const params: Record<string, string> = {
    userId: scope.userId,
    dimType: product ? '产品级' : '部门级',
    dimCode: product?.id || scope.department.code || scope.department.id,
    dimName: product?.name || scope.department.name,
    departmentCode: scope.department.code || scope.department.id,
    departmentName: scope.department.name,
    departmentPath: scope.department.path.join('/'),
  };
  if (product) params.productId = product.id;
  if (scope.assetType && scope.assetType !== 'all') params.assetType = scope.assetType;
  return params;
}

function normalizeFile(value: unknown): HarnessAssetFile {
  const record = asRecord(value);
  const category = text(record.category).toLowerCase();
  return {
    path: text(record.path ?? record.filePath ?? record.name),
    content: text(record.content),
    ...(category === 'skill' || category === 'command' || category === 'agent' || category === 'root'
      ? { category }
      : {}),
  };
}

function normalizeQualityReport(value: unknown): HarnessAssetQualityReport | null {
  if (!value) return null;
  const record = asRecord(value);
  const items = Array.isArray(record.items)
    ? record.items.map((item) => {
        const row = asRecord(item);
        return {
          name: text(row.name),
          value: text(row.value),
          pass: row.pass !== false,
        };
      })
    : [];
  return {
    overallScore: numberValue(record.overallScore ?? record.percent ?? record.score),
    grade: text(record.grade) || undefined,
    summary: text(record.summary),
    items,
  };
}

export function createHttpHarnessAssetApi(): HarnessAssetApi {
  return {
    async queryProducts(scope) {
      const products = await queryHttpExtensionProducts(
        scope.department.code || scope.department.id,
        scope.department.name,
        scope.department.path,
        scope.userName,
      );
      return products.map((product) => ({
        id: product.id,
        name: product.name,
        departmentPath: [...product.departmentPath],
      }));
    },

    async queryAssets(scope) {
      const response = await httpRequest.harnessApi<unknown>({
        url: harnessAssetHttpEndpoints.list,
        method: 'get',
        params: scopeParams(scope),
      });
      const data = unwrapData(response);
      const dataRecord = asRecord(data);
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(dataRecord.list)
          ? dataRecord.list
          : [];
      const list = rows.map(normalizeAsset).filter((asset) => Boolean(asset.id && asset.name));
      const total = Number(dataRecord.total);
      return { list, total: Number.isFinite(total) ? total : list.length };
    },

    async queryDetail(scope, asset, version = asset.currentVersion) {
      const response = await httpRequest.harnessApi<unknown>({
        url: harnessAssetHttpEndpoints.detail(asset.assetType, asset.id),
        method: 'get',
        params: { ...scopeParams(scope), version },
      });
      const data = asRecord(unwrapData(response));
      return {
        versions: versionArray(data.versions).length
          ? versionArray(data.versions)
          : [...asset.versions],
        files: (Array.isArray(data.files) ? data.files : [])
          .map(normalizeFile)
          .filter((file) => Boolean(file.path)),
      };
    },

    async queryQualityReport(scope, asset, version) {
      if (asset.assetType !== 'Skill' || !version) return null;
      const response = await httpRequest.harnessApi<unknown>({
        url: harnessAssetHttpEndpoints.qualityReport(asset.assetType, asset.id),
        method: 'get',
        params: { ...scopeParams(scope), version },
      });
      return normalizeQualityReport(unwrapData(response));
    },

    async queryOrganizations(scope) {
      const organizations = await queryHttpPublishableOrganizations(scope.userId, {
        dimType: scope.product ? '产品级' : '部门级',
        dimCode:
          scope.product?.id || scope.department.code || scope.department.id,
      });
      return organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
      }));
    },

    async queryReleases(scope, asset) {
      const response = await httpRequest.harnessApi<unknown>({
        url: harnessAssetHttpEndpoints.releases(asset.assetType, asset.id),
        method: 'get',
        params: scopeParams(scope),
      });
      const data = unwrapData(response);
      const record = asRecord(data);
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(record.list)
          ? record.list
          : [];
      return rows.map(normalizeRelease);
    },

    async publish(input: PublishHarnessAssetInput) {
      const { asset, organization, scope } = input;
      const response = await httpRequest.harnessApi<unknown>({
        url: harnessAssetHttpEndpoints.releases(asset.assetType, asset.id),
        method: 'post',
        params: scopeParams(scope),
        data: {
          userId: scope.userId,
          operatorName: scope.userName,
          version: harnessAssetPublishVersion(asset),
          channel: input.channel ?? 'product',
          targetOrganization: organization,
          description: asset.description,
        },
      });
      return normalizeRelease(unwrapData(response));
    },
  };
}

export function isHarnessAssetHttpFilter(value: unknown): value is HarnessAssetFilter {
  return ['all', 'Agent', 'Skill', 'Command', 'Extension'].includes(String(value));
}
