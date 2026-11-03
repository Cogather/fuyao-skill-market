/** HTTP department scopes follow every level in the supplied tree; other scopes keep their limit. */
export function getHarnessDepartmentMaxLevel(level: string): number {
  return import.meta.env.VITE_SKILL_MARKET_TRANSPORT === 'http' && level === '部门级'
    ? Number.POSITIVE_INFINITY
    : 6;
}
