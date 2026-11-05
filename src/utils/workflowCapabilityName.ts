export function workflowCapabilityPrefix(productName: string, productCode = ''): string {
  if (!productName) return '';
  const source = /^[a-z0-9-]+$/i.test(productName) ? productName : productCode || 'product';
  const prefix =
    source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'product';
  return `${prefix}-`;
}

/** Scene extension codes and capabilities created inside a Workflow share one naming rule. */
export function validateWorkflowCapabilityName(
  value: string,
  productName: string,
  productCode = '',
): string {
  const name = value.trim();
  const prefix = workflowCapabilityPrefix(productName, productCode);
  if (!name) return '请填写名称';
  if (name.length > 64) return '名称长度不能超过 64 个字符';
  if (name !== name.toLowerCase()) return '必须全部小写';
  if (!/^[a-z0-9-]+$/.test(name)) return '只能包含小写字母、数字和连字符';
  if (name.startsWith('-') || name.endsWith('-') || name.includes('--'))
    return '连字符不能在开头/结尾，也不能连续出现';
  if (prefix && !name.startsWith(prefix)) return `必须以产品名开头，例如：${prefix}xxx`;
  return '';
}
