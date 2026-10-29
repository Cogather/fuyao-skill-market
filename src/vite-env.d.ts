/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 市场接口：`mock` 内存 Mock；`http` 请求真实后端（同设计文档路径） */
  readonly VITE_SKILL_MARKET_TRANSPORT?: 'mock' | 'http';
  /** 后端根地址，例如 `https://api.example.com` 或空字符串表示同源 */
  readonly VITE_SKILL_MARKET_API_BASE?: string;
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** 父页面初始化上下文：由入口桥接脚本提前捕获，并在当前标签页内恢复。 */
  __SKILL_MARKET_PARENT_CONTEXT__?: Record<string, unknown>;
}
