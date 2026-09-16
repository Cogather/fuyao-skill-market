/** 新开一个浏览器tab, 打开外部链接 */
export const openLink = (link: string): void => {
  window.open(link, '_blank', 'noopener,noreferrer');
};

/** 判断是否是JSON格式的字符串 */
export function isJsonString(str: unknown): boolean {
  if (typeof str !== 'string') {
    return false;
  }
  try {
    const data = JSON.parse(str);
    return data instanceof Object;
  } catch {
    return false;
  }
}

/** 判断是否是URL链接 */
export function isUrl(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/** 返回第一个非空白文本，并移除首尾空白。 */
export function firstNonBlankText(values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

/** 将接口常见日期时间格式统一为 YYYY-MM-DD HH:mm:ss。 */
export function formatCompactDateTime(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  const matched = text.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?/);
  return matched ? `${matched[1]} ${matched[2]}:${matched[3] ?? '00'}` : text;
}
