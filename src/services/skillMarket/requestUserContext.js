let skillMarketRequestUserId = '';
export function normalizeSkillMarketRequestUserId(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).trim();
}
export function setSkillMarketRequestUserId(value) {
    skillMarketRequestUserId = normalizeSkillMarketRequestUserId(value);
}
export function getSkillMarketRequestUserId() {
    return skillMarketRequestUserId;
}
