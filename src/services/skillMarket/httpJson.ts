import type { ApiEnvelope } from './apiTypes';

export async function readJsonEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`接口返回非 JSON：HTTP ${response.status}`);
  }
  if (typeof body !== 'object' || body === null) {
    throw new Error('接口返回格式异常');
  }
  const o = body as Record<string, unknown>;
  if (typeof o.code !== 'number' || typeof o.message !== 'string' || !('data' in o)) {
    throw new Error('接口未返回标准 ApiEnvelope');
  }
  return body as ApiEnvelope<T>;
}

export function joinBaseUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!b) {
    return p;
  }
  return `${b}${p}`;
}
