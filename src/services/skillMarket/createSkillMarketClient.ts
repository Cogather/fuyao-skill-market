import type { Ref } from 'vue';
import type { Skill } from '../../types/skill';
import type { SkillMarketClient } from './skillMarketClient.types';
import { createSkillMarketHttpClient } from './skillMarketHttpClient';
import { createSkillMarketMockClient } from './skillMarketMockClient';

export type SkillMarketTransport = 'mock' | 'http';

/**
 * 根据环境变量选择 Mock（内存）或 HTTP（真实后端）实现。
 *
 * **正式接口（`VITE_SKILL_MARKET_TRANSPORT=http`）** 时只会走 `createSkillMarketHttpClient`，
 * **不会**加载或执行 `skillMarketMockClient`，因此 `VITE_SKILL_MARKET_MOCK_ROLE`、
 * `VITE_SKILL_MARKET_MOCK_MANAGED_ORG_IDS` 无论是否在 `.env` 中配置，都对角色与菜单**无任何影响**；
 * 角色仅以服务端 `fetchCurrentUserRole` 响应为准。
 *
 * @see ImportMetaEnv — `VITE_SKILL_MARKET_TRANSPORT`、`VITE_SKILL_MARKET_API_BASE`、
 *   `VITE_SKILL_MARKET_MOCK_ROLE`、`VITE_SKILL_MARKET_MOCK_MANAGED_ORG_IDS`（后两者仅 mock 模块读取）
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
