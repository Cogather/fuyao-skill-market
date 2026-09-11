import { getProductCatalogItemNamePrefix } from './catalogItemName';
import { validateWorkflowCapabilityName } from './workflowCapabilityName';

export function validateScenarioCreationCode(value: string, productName: string): string {
  const formatError = validateWorkflowCapabilityName(value, '');
  if (formatError) return formatError;
  const prefix = getProductCatalogItemNamePrefix('产品级', productName);
  if (prefix && !value.trim().startsWith(prefix)) return `必须以产品名开头，例如：${prefix}xxx`;
  return '';
}
