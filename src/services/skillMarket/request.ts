import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { maybeHandleSkillBaseMockRequest } from './skillBaseServiceMock';

const fuyao = import.meta.env.VITE_FUYAO_API_BASE || '/fuyaoDomain';

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

const createAxiosConfig = {
  baseURL: '',
  timeout: 50000,
};

const axiosRequest = axios.create(createAxiosConfig);

axiosRequest.interceptors.response.use(
  (response) => {
    // 如果响应是二进制流，直接返回，用于下载文件
    if (response.config.responseType === 'blob') {
      return response;
    }
    if (isSuccessStatus(response.status)) {
      return response.data;
    }
    return Promise.reject(response.data);
  },
  (error) => {
    return Promise.reject(error);
  },
);

function normalizeEnvBase(): string {
  return String(import.meta.env.VITE_SKILL_MARKET_API_BASE ?? '').replace(/\/+$/, '');
}

function normalizePath(path: unknown): string {
  const raw = String(path ?? '');
  if (!raw) {
    return '';
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function buildBaseUrl(prefix: '/api' | '/api/skills' | '/api/skill-drafts'): string {
  const base = normalizeEnvBase();
  if (!base) {
    return prefix;
  }
  if (base.endsWith(prefix)) {
    return base;
  }
  if (prefix === '/api/skills' && base.endsWith('/api')) {
    return `${base}/skills`;
  }
  if (prefix === '/api/skill-drafts' && base.endsWith('/api')) {
    return `${base}/skill-drafts`;
  }
  return `${base}${prefix}`;
}

function buildOtherBaseUrl(otherUrl: string): string {
  return otherUrl.replace(/\/+$/, '');
}

function stripPrefix(url: unknown, prefix: string): string {
  const path = normalizePath(url);
  if (!path) {
    return '';
  }
  if (path === prefix) {
    return '';
  }
  if (path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
    return path.slice(prefix.length);
  }
  return path;
}

function tryMockThenAxios<T>(channel: string, requestConfig: AxiosRequestConfig): Promise<T> {
  const mock = maybeHandleSkillBaseMockRequest<T>(channel, requestConfig);
  if (mock) {
    return mock;
  }
  return axiosRequest.request<T, T>({
    ...requestConfig,
  });
}

// 请求方法
const httpRequest = {
  api: <T = null>(config: AxiosRequestConfig): Promise<T> => {
    const requestConfig = {
      ...config,
      baseURL: buildBaseUrl('/api'),
      url: stripPrefix(config.url, '/api'),
    };
    return tryMockThenAxios<T>('api', requestConfig);
  },
  skill: <T = null>(config: AxiosRequestConfig): Promise<T> => {
    const requestConfig = {
      ...config,
      baseURL: buildBaseUrl('/api/skills'),
      url: stripPrefix(config.url, '/api/skills'),
    };
    return tryMockThenAxios<T>('skill', requestConfig);
  },
  skillDraft: <T = null>(config: AxiosRequestConfig): Promise<T> => {
    const requestConfig = {
      ...config,
      baseURL: buildBaseUrl('/api/skill-drafts'),
      url: stripPrefix(config.url, '/api/skill-drafts'),
    };
    return tryMockThenAxios<T>('skillDraft', requestConfig);
  },
  fuyao: <T = null>(config: AxiosRequestConfig): Promise<T> => {
    const requestConfig = {
      ...config,
      baseURL: buildOtherBaseUrl(fuyao),
      url: stripPrefix(config.url, ''),
    };
    return tryMockThenAxios<T>('fuyao', requestConfig);
  },
  direct: <T = null>(config: AxiosRequestConfig): Promise<T> => {
    const requestConfig = {
      ...config,
      baseURL: '/',
      url: stripPrefix(config.url, '/'),
    };
    return tryMockThenAxios<T>('direct', requestConfig);
  },
};

export default httpRequest;
