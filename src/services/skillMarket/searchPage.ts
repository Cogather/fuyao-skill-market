const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Call only after the endpoint's business-success envelope has been checked. */
export function readSearchPage<T = unknown>(
  response: unknown,
  data: unknown,
  label: string,
): { list: T[]; total: number } {
  const envelope = record(response);
  const payload = record(data);
  const meta = record(envelope.meta);
  const list = Array.isArray(data) ? data : payload.list;
  if (!Array.isArray(list)) throw new Error(`${label}响应缺少有效的列表`);

  // /scenes/search returns an array in data and its total in meta.number.
  const value = payload.total ?? meta.number ?? meta.total ?? envelope.total;
  const total =
    typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`${label}响应缺少有效的总数量`);
  return { list: list as T[], total };
}
