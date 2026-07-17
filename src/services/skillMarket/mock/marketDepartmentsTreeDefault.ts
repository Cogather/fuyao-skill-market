import type { DepartmentTreeNodeDto } from '../apiTypes';

/**
 * 与 `builtInSkills` 种子及 HTTP Mock 列表中的部门路径对齐，保证级联选项覆盖演示数据。
 */
const MOCK_DEPT_FULL_PATHS: string[] = [
  '部门1/SRE产品线/平台稳定部/日志工具组',
  '部门1/API产品线/联调工具部',
  '部门1/质量产品线/质量工具组/评审小组',
  '部门1/项目产品线/项目管理部',
  '部门1/平台产品线/DevOps部/发布工具组',
  '部门1/业务产品线/业务运营部/需求分析组',
  '部门1/数据产品线/数据库运营部/SQL治理组',
  '部门1/设计产品线/体验设计部',
  '部门1/平台产品线/平台工具组/变更分析组',
  '部门1/平台产品线/平台工具组/DevOps部',
  '部门1/test2产品线/xxx部门/test5部门/test5部门/12345组',
  '部门1/test3产品线/xxx部门/测试部门/平台一部/平台工具部',
  '部门1/test2产品线/xxx部门/test5部门/小部门',
  '云核装备经营管理部/智能终端产品部/云服务组/SRE团队',
];

type MutableNode = {
  name: string;
  path: string;
  level: number;
  children: Map<string, MutableNode>;
};

function nestPathsToDepartmentDtos(paths: string[]): DepartmentTreeNodeDto[] {
  const root: MutableNode = { name: '', path: '', level: 0, children: new Map() };
  for (const line of paths) {
    const segs = line
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    let node = root;
    for (let i = 0; i < segs.length; i++) {
      const name = segs[i];
      if (!node.children.has(name)) {
        node.children.set(name, {
          name,
          path: node.path ? `${node.path}/${name}` : name,
          level: i + 1,
          children: new Map(),
        });
      }
      node = node.children.get(name)!;
    }
  }

  function finalize(m: MutableNode): DepartmentTreeNodeDto | null {
    if (!m.name) {
      return null;
    }
    const childList = [...m.children.values()]
      .map((c) => finalize(c))
      .filter((x): x is DepartmentTreeNodeDto => x != null)
      .sort((a, b) => a.deptName.localeCompare(b.deptName, 'zh-Hans-CN'));
    const dto: DepartmentTreeNodeDto = {
      deptId: m.path,
      deptName: m.name,
      deptLevel: m.level,
    };
    if (childList.length > 0) {
      dto.children = childList;
    }
    return dto;
  }

  return [...root.children.values()]
    .map((c) => finalize(c)!)
    .sort((a, b) => a.deptName.localeCompare(b.deptName, 'zh-Hans-CN'));
}

/** `fetchDepartmentsTree` 的 Mock 数据（与本地 Skill 演示路径一致） */
export function getMockMarketDepartmentsTree(): DepartmentTreeNodeDto[] {
  return nestPathsToDepartmentDtos(MOCK_DEPT_FULL_PATHS);
}
