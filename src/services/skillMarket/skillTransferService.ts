import type { SkillTransferParams } from './apiTypes';
import type { SkillPlanningImportResult } from './skillPlanningShared';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function textValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(textValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstValue(record: UnknownRecord, keys: string[]): unknown {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
}

export function normalizeSkillTransferParams(params: SkillTransferParams): SkillTransferParams {
  const normalized = {
    userId: textValue(params.userId),
    dimType: textValue(params.dimType),
    dimCode: textValue(params.dimCode),
    dimName: textValue(params.dimName),
  };
  const missing = Object.entries(normalized)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`导入导出缺少必填参数: ${missing.join(', ')}`);
  }
  return normalized;
}

function assertTransferSuccess(response: unknown, fallbackMessage: string): void {
  const record = asRecord(response);
  const meta = asRecord(record.meta);
  if (
    meta.success === false ||
    record.success === false ||
    (typeof record.code === 'number' && record.code >= 400)
  ) {
    throw new Error(
      textValue(meta.message) ||
        textValue(record.message) ||
        textValue(record.msg) ||
        fallbackMessage,
    );
  }
}

function unwrapImportData(response: unknown): unknown {
  let value = response;
  for (let depth = 0; depth < 3; depth += 1) {
    const record = asRecord(value);
    const next = record.data ?? record.result;
    if (next === undefined || next === value) break;
    value = next;
  }
  return value;
}

export function normalizeSkillImportResponse(response: unknown): SkillPlanningImportResult {
  assertTransferSuccess(response, '导入失败，请稍后重试');
  const data = asRecord(unwrapImportData(response));
  const rawErrors = firstValue(data, ['errorList', 'errors', 'failedList', 'failList']);
  const errorList = (Array.isArray(rawErrors) ? rawErrors : []).map((item, index) => {
    const record = asRecord(item);
    return {
      rowNum: numberValue(
        firstValue(record, ['rowNum', 'rowNumber', 'row', 'line', 'lineNumber']),
        index + 1,
      ),
      errMsg:
        textValue(firstValue(record, ['errMsg', 'message', 'error', 'reason', 'msg'])) ||
        '导入失败',
    };
  });
  const successCount = numberValue(
    firstValue(data, ['successCount', 'successNum', 'importedCount', 'created']),
  );
  const failCount = numberValue(
    firstValue(data, ['failCount', 'failedCount', 'failNum', 'errorCount']),
    errorList.length,
  );
  const totalCount = numberValue(
    firstValue(data, ['totalCount', 'total', 'totalNum', 'importTotal']),
    successCount + failCount,
  );
  const missingFields = firstValue(data, ['missingFields', 'missingHeaders']);

  return {
    created: numberValue(data.created, successCount),
    missingFields: Array.isArray(missingFields) ? missingFields.map(textValue).filter(Boolean) : [],
    totalCount,
    successCount,
    failCount,
    errorList,
  };
}

export function openSkillExportResponse(response: unknown): void {
  assertTransferSuccess(response, '导出失败，请稍后重试');
  const url = textValue(asRecord(response).data);
  if (!url) {
    throw new Error('导出成功，但未获取到下载链接');
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
