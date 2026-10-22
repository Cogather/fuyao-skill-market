export type HarnessScopeLevel = '产品级' | '部门级';

export type HarnessScopeSnapshot = {
  level: HarnessScopeLevel;
  departmentPath: string[];
  offeringId: string;
  offeringName: string;
};

export type HarnessDepartmentSnapshot = {
  departmentPath: string[];
};

export type HarnessCatalogAssetType = 'Agent' | 'Skill' | 'Command';
export type HarnessCatalogAction = 'create' | 'import' | 'export';

export type HarnessCatalogScopeSnapshots = Partial<
  Record<HarnessCatalogAssetType, Partial<Record<HarnessCatalogAction, HarnessScopeSnapshot>>>
>;

export type HarnessCatalogScopeChange = {
  assetType: HarnessCatalogAssetType;
  action: HarnessCatalogAction;
  snapshot: HarnessScopeSnapshot;
};
