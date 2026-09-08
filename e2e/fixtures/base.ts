import { test as base, expect } from '@playwright/test';

/**
 * 全局测试扩展点。
 *
 * 设计：新增页面【无需】在这里注册任何东西——
 * 每个 spec 在自己的 beforeEach 里直接实例化 Page Object。
 * 这里只放全局能力（未来统一接入登录态 storageState、全局钩子等）。
 */
export const test = base;

export { expect };
