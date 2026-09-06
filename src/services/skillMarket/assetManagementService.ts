import { createHttpHarnessAssetApi } from './assetManagementHttp';
import { createMockHarnessAssetApi } from './assetManagementMock';
import type { HarnessAssetApi } from './assetManagementTypes';

const transportIsHttp =
  String(import.meta.env.VITE_SKILL_MARKET_TRANSPORT ?? 'mock').toLowerCase() === 'http';

let api: HarnessAssetApi | null = null;

export function getHarnessAssetApi(): HarnessAssetApi {
  if (!api) api = transportIsHttp ? createHttpHarnessAssetApi() : createMockHarnessAssetApi();
  return api;
}

export function usesHttpHarnessAssetApi(): boolean {
  return transportIsHttp;
}
