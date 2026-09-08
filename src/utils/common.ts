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
