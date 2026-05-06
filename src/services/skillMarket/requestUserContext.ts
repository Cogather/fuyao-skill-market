let skillMarketRequestUserId = '';

export function normalizeSkillMarketRequestUserId(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

export function setSkillMarketRequestUserId(value: unknown): void {
  skillMarketRequestUserId = normalizeSkillMarketRequestUserId(value);
}

export function getSkillMarketRequestUserId(): string {
  return skillMarketRequestUserId;
}
