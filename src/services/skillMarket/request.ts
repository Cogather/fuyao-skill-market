import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

const fuyao = import.meta.env.VITE_FUYAO_API_BASE || '/fuyaoDomain'

function isSuccessStatus(status: number): boolean {
    return status >= 200 && status < 300;
}

const createAxiosConfig = {
    baseURL: '',
    timeout: 50000
}

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
    }
)

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

function buildBaseUrl(prefix: '/api' | '/api/skills'): string {
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
    return `${base}${prefix}`;
}

function buildFuyaoBaseUrl(): string {
    return fuyao.replace(/\/+$/, '');
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

// 请求方法
const httpRequest = {
    api: <T = null>(config: AxiosRequestConfig): Promise<T> => {
        return axiosRequest.request<T, T>({
            ...config,
            baseURL: buildBaseUrl('/api'),
            url: stripPrefix(config.url, '/api'),
        })
    },
    skill: <T = null>(config: AxiosRequestConfig): Promise<T> => {
        return axiosRequest.request<T, T>({
            ...config,
            baseURL: buildBaseUrl('/api/skills'),
            url: stripPrefix(config.url, '/api/skills'),
        })
    },
    fuyao: <T = null>(config: AxiosRequestConfig): Promise<T> => {
        return axiosRequest.request<T, T>({
            ...config,
            baseURL: buildFuyaoBaseUrl(),
            url: stripPrefix(config.url, ''),
        })
    },
    direct: <T = null>(config: AxiosRequestConfig): Promise<T> => {
        return axiosRequest.request<T, T>({
            ...config,
            baseURL: '/',
            url: stripPrefix(config.url, '/'),
        })
    }
}

export default httpRequest;
