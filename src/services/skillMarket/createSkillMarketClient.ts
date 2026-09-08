import type { Ref } from 'vue';
import type { Skill } from '../../types/skill';
import type { SkillMarketClient } from './skillMarketClient.types';
import { createSkillMarketHttpClient } from './skillMarketHttpClient';
import { createSkillMarketMockClient } from './skillMarketMockClient';

export type SkillMarketTransport = 'mock' | 'http';

/**
 * 根据环境变量选择 Mock（内存）或 HTTP（真实后端）实现。
 * @param initialSkills 仅 Mock 模式有效；不传则使用内置种子数据
 */
export function createSkillMarketClient(
  initialSkills?: Skill[],
  currentUserId?: Ref<string>,
): SkillMarketClient {
  const mode = (import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock') as SkillMarketTransport;
  const baseUrl = import.meta.env.VITE_SKILL_MARKET_API_BASE ?? '';
  if (mode === 'http') {
    return createSkillMarketHttpClient(baseUrl, currentUserId);
  }
  return createSkillMarketMockClient(initialSkills);
}
