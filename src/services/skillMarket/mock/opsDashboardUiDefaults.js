import companyOpsDashboardJson from '../../../mock/opsDashboardCompanyDefault.json?raw';
import fuyaoOpsDashboardJson from '../../../mock/opsDashboardDefault.json?raw';
/**
 * 从 `src/mock/*.json` 打包进来的原文解析运营看板数据。
 * **公司系统** 始终通过本函数读 `opsDashboardCompanyDefault.json`（替换文件后需重新 dev/build）。
 * 扶摇默认走 `overview` 映射；`fuyao` 分支 JSON 仅作对照或测试。
 */
export function readOpsDashboardBundleFromJson(system) {
    const raw = system === 'company' ? companyOpsDashboardJson : fuyaoOpsDashboardJson;
    return JSON.parse(raw);
}
export function emptyOpsDashboardBundle() {
    return {
        kpi: {
            totalSkills: '0',
            activeSkills: '0',
            personalSkills: '0',
            totalDownloads: '0',
            companyDownloads: '0',
            deptCount: '0',
            orgCount: '0',
        },
        deptTree: [],
        orgBars: [],
        topSkills: [],
    };
}
