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
  if ('meta' in o && typeof o.meta === 'object' && o.meta !== null && 'data' in o) {
    const meta = o.meta as Record<string, unknown>;
    const success = meta.success === true;
    const message =
      typeof meta.message === 'string' && meta.message.trim()
        ? meta.message
        : success
          ? 'OK'
          : '接口返回失败';
    return {
      ...(o as Record<string, unknown>),
      code: success ? 0 : -1,
      message,
      meta: {
        number: typeof meta.number === 'number' ? meta.number : undefined,
        message,
        success,
      },
      data: o.data as T,
    } as ApiEnvelope<T>;
  }
  if (typeof o.code !== 'number' || typeof o.message !== 'string' || !('data' in o)) {
    throw new Error('接口未返回标准 ApiEnvelope');
  }
  return {
    ...(body as ApiEnvelope<T>),
    meta: {
      number: Array.isArray((body as ApiEnvelope<T>).data) ? ((body as ApiEnvelope<T>).data as unknown[]).length : undefined,
      message: (body as ApiEnvelope<T>).message,
      success: (body as ApiEnvelope<T>).code === 0,
    },
  };
}

export function joinBaseUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!b) {
    return p;
  }
  return `${b}${p}`;
}
