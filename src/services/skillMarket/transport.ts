export type SkillMarketTransport = 'mock' | 'http' | 'https';

export function normalizeSkillMarketTransport(
  value: unknown = import.meta.env.VITE_SKILL_MARKET_TRANSPORT,
): SkillMarketTransport {
  const mode = String(value ?? 'mock').trim().toLowerCase();
  if (mode === 'http' || mode === 'https' || mode === 'mock') {
    return mode;
  }
  return 'mock';
}

export function isSkillMarketApiTransport(
  value: unknown = import.meta.env.VITE_SKILL_MARKET_TRANSPORT,
): boolean {
  const mode = normalizeSkillMarketTransport(value);
  return mode === 'http' || mode === 'https';
}
