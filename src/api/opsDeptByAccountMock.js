/**
 * Mock：根据账号查询用户所属部门（用于个人级 Skill 归属统计）
 */
const ACCOUNT_DEPT_MAP = {
    x12345565: '智能数据产品部',
    f23442265: '平台工具组',
    a99887766: '业务运营组',
    b11223344: '质量工具组',
};
export async function fetchDepartmentByAccountMock(account) {
    const key = account.trim();
    if (!key) {
        return '未关联部门';
    }
    await new Promise((resolve) => {
        setTimeout(resolve, 80);
    });
    const dept = ACCOUNT_DEPT_MAP[key];
    if (dept) {
        return dept;
    }
    const suffix = key.slice(-4) || key;
    return `示例部门-${suffix}`;
}
