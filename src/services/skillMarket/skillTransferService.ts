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

function parseContentDisposition(value: string): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="?([^";]+)"?/i.exec(value)?.[1]?.trim() ?? '';
}

function responseFilename(response: unknown): string {
  const record = asRecord(response);
  const headers = record.headers as
    | { get?: (name: string) => unknown; [key: string]: unknown }
    | undefined;
  const disposition = textValue(
    headers?.get?.('content-disposition') ??
      headers?.['content-disposition'] ??
      headers?.['Content-Disposition'],
  );
  return parseContentDisposition(disposition);
}

function triggerUrlDownload(url: string, filename = ''): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  if (filename) anchor.download = filename;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  triggerUrlDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function decodeBase64(content: string, mimeType: string): Blob {
  const cleaned = content.replace(/^data:[^;]+;base64,/, '');
  const binary = window.atob(cleaned);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function parseJsonBlob(blob: Blob): Promise<unknown | null> {
  if (!/json|text/i.test(blob.type)) return null;
  try {
    return JSON.parse(await blob.text());
  } catch {
    return null;
  }
}

async function downloadValue(
  value: unknown,
  fallbackFilename: string,
  inheritedFilename = '',
): Promise<boolean> {
  if (value instanceof Blob) {
    const json = await parseJsonBlob(value);
    if (json !== null) return downloadValue(json, fallbackFilename, inheritedFilename);
    triggerBlobDownload(value, inheritedFilename || fallbackFilename);
    return true;
  }

  if (value instanceof ArrayBuffer) {
    triggerBlobDownload(new Blob([value]), inheritedFilename || fallbackFilename);
    return true;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return false;
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        return downloadValue(JSON.parse(text), fallbackFilename, inheritedFilename);
      } catch {
        // Treat non-JSON text as a download URL below.
      }
    }
    triggerUrlDownload(text, inheritedFilename);
    return true;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) return false;
  assertTransferSuccess(record, '导出失败，请稍后重试');

  const filename =
    textValue(firstValue(record, ['fileName', 'filename', 'name'])) || inheritedFilename;
  const url = textValue(firstValue(record, ['downloadUrl', 'fileUrl', 'url', 'link', 'href']));
  if (url) {
    triggerUrlDownload(url, filename);
    return true;
  }

  const base64 = textValue(firstValue(record, ['base64', 'fileContent', 'content']));
  if (base64) {
    const mimeType =
      textValue(firstValue(record, ['contentType', 'mimeType'])) ||
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    triggerBlobDownload(decodeBase64(base64, mimeType), filename || fallbackFilename);
    return true;
  }

  if (record.data !== undefined && record.data !== value) {
    return downloadValue(record.data, fallbackFilename, filename);
  }
  if (record.result !== undefined && record.result !== value) {
    return downloadValue(record.result, fallbackFilename, filename);
  }
  return false;
}

export async function downloadSkillExportResponse(
  response: unknown,
  fallbackFilename: string,
): Promise<boolean> {
  assertTransferSuccess(response, '导出失败，请稍后重试');
  return downloadValue(response, fallbackFilename, responseFilename(response));
}
