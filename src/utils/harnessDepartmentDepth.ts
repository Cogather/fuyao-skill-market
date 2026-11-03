/** Scoped Harness pickers: HTTP products use four levels, departments use the full tree. */
export function getHarnessDepartmentMaxLevel(level: string): number {
  if (import.meta.env.VITE_SKILL_MARKET_TRANSPORT !== 'http') return 6;
  return level === '部门级' ? Number.POSITIVE_INFINITY : 4;
}
