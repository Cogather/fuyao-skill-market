// http状态码
export const enum ResponseStatusEnum {
  SUCCESS = 200,
  LOGIN_INVALID = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
}

export interface SearchPersonInfoRes {
  dept: string;
  ucn: string;
  w3Account: string;
  lastName: string;
}

export interface SearchPersonInfoReq {
  searchType: number;
  searchValue?: string;
}
