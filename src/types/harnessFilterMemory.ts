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
