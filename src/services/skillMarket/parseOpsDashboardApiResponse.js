import { emptyOpsDashboardBundle } from './mock/opsDashboardUiDefaults';
/** 与 `src/mock/opsDashboard*.json`、Excel 导入结果一致的结构 */
export function isOpsDashboardBundle(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const o = value;
    return (typeof o.kpi === 'object' &&
        o.kpi !== null &&
        Array.isArray(o.deptTree) &&
        Array.isArray(o.orgBars) &&
        Array.isArray(o.topSkills));
}
/**
 * 解析运营看板 HTTP 响应：
 * - 支持标准壳：`{ code, message, data }` 且 `data` 为 OpsDashboardBundle
 * - 支持裸 JSON：根对象即为 OpsDashboardBundle（与本地 JSON 文件格式一致）
 */
export function parseOpsDashboardFetchResult(res, bodyText) {
    let parsed;
    try {
        parsed = bodyText ? JSON.parse(bodyText) : null;
    }
    catch {
        return {
            code: res.status || 500,
            message: '运营看板接口：响应体不是合法 JSON',
            data: emptyOpsDashboardBundle(),
        };
    }
    if (parsed && typeof parsed === 'object' && 'code' in parsed && 'data' in parsed) {
        const env = parsed;
        if (typeof env.code === 'number' && isOpsDashboardBundle(env.data)) {
            return {
                code: env.code,
                message: typeof env.message === 'string' ? env.message : '',
                data: env.data,
            };
        }
    }
    if (isOpsDashboardBundle(parsed)) {
        return { code: 0, message: 'success', data: parsed };
    }
    return {
        code: res.ok ? 500 : res.status || 500,
        message: '运营看板接口：未返回 OpsDashboardBundle（需含 kpi、deptTree、orgBars、topSkills，或与 Mock 下 JSON 文件同结构）',
        data: emptyOpsDashboardBundle(),
    };
}
