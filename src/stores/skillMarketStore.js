import { computed, ref } from 'vue';
import { downloadSkillApi, listSkillsApi, uploadSkillApi, } from '../api/skillMarketMock';
const EXTRA_MOCK_SKILL_SEEDS = [
    {
        name: '日志分析 Skill',
        description: '自动解析运行日志并输出异常摘要',
        publishName: 'SRE团队',
        publishLevel: '组织级',
        deptName: '部门1/SRE产品线/平台稳定部/日志工具组',
        downloads: 128,
        category: '工具类',
        icon: 'LA',
        version: '1.0.0',
        tags: ['log', 'ops'],
        ownedByUser: true,
    },
    {
        name: '接口 Mock 生成 Skill',
        description: '根据接口文档生成 Mock 数据和联调样例',
        publishName: 'xxx_个人发布商',
        publishLevel: '个人级',
        deptName: '部门1/API产品线/联调工具部',
        downloads: 236,
        category: '作业类',
        icon: 'MO',
        version: '1.1.0',
        tags: ['mock', 'api'],
        ownedByUser: true,
    },
    {
        name: '测试用例评审 Skill',
        description: '检查测试用例覆盖范围并给出评审建议',
        publishName: '质量工具组',
        publishLevel: '组织级',
        deptName: '部门1/质量产品线/质量工具组/评审小组',
        downloads: 86,
        category: '业务类',
        icon: 'QA',
        version: '1.0.2',
        tags: ['review', 'test'],
    },
    {
        name: '日报生成 Skill',
        description: '汇总项目进展并生成团队日报',
        publishName: 'xxx_个人发布商',
        publishLevel: '个人级',
        deptName: '部门1/项目产品线/项目管理部',
        downloads: 64,
        category: '作业类',
        icon: 'DR',
        version: '0.9.0',
        tags: ['report'],
        ownedByUser: true,
    },
    {
        name: 'CI/CD 发布检查 Skill',
        description: '发布前检查流水线、镜像和配置项风险',
        publishName: 'DevOps组',
        publishLevel: '组织级',
        deptName: '部门1/平台产品线/DevOps部/发布工具组',
        downloads: 312,
        category: '工具类',
        icon: 'CI',
        version: '1.3.1',
        tags: ['cicd', 'release'],
        ownedByUser: true,
    },
    {
        name: '需求拆解 Skill',
        description: '辅助将业务需求拆解为研发任务清单',
        publishName: '业务运营组',
        publishLevel: '组织级',
        deptName: '部门1/业务产品线/业务运营部/需求分析组',
        downloads: 53,
        category: '业务类',
        icon: 'RD',
        version: '1.0.1',
        tags: ['design', 'requirement'],
    },
    {
        name: 'SQL 巡检 Skill',
        description: '扫描 SQL 风险并给出优化建议',
        publishName: '数据库运营',
        publishLevel: '组织级',
        deptName: '部门1/数据产品线/数据库运营部/SQL治理组',
        downloads: 97,
        category: '工具类',
        icon: 'SQL',
        version: '2.1.0',
        tags: ['sql', 'ops'],
    },
    {
        name: '交互文案检查 Skill',
        description: '检查页面文案一致性和可读性',
        publishName: 'xxx_个人发布商',
        publishLevel: '个人级',
        deptName: '部门1/设计产品线/体验设计部',
        downloads: 41,
        category: '业务类',
        icon: 'UX',
        version: '0.8.5',
        tags: ['design'],
        ownedByUser: true,
    },
    {
        name: '变更影响分析 Skill',
        description: '根据变更内容推断影响系统和回归范围',
        publishName: '平台工具组',
        publishLevel: '组织级',
        deptName: '部门1/平台产品线/平台工具组/变更分析组',
        downloads: 174,
        category: '作业类',
        icon: 'CH',
        version: '1.2.3',
        tags: ['impact', 'release'],
    },
];
function createExtraMockSkill(seed, index) {
    const seq = index + 4;
    const publishTime = `2024-05-${String(20 - index).padStart(2, '0')} ${String(10 + index).padStart(2, '0')}:30`;
    return {
        skill_id: `mock${seq}`,
        description: seed.description,
        publish_name: seed.publishName,
        publish_level: seed.publishLevel,
        owner_list: JSON.stringify([{ lastName: seed.publishName, Account: `mock${seq}` }]),
        download_count: seed.downloads,
        dept_name: seed.deptName,
        id: String(seq),
        name: seed.name,
        icon: seed.icon,
        publisher: seed.publishName,
        latestPublishTime: publishTime,
        level: seed.publishLevel,
        downloads: seed.downloads,
        rating: 4.3 + (index % 5) * 0.1,
        version: seed.version,
        versions: [
            {
                version: seed.version,
                publishTime,
                note: 'Mock 分页验证数据',
                packageFileName: `mock${seq}-v${seed.version}.zip`,
                packageSize: 120000 + index * 18000,
            },
        ],
        ownedByUser: seed.ownedByUser,
        tagFunctional: seed.category,
        tagOrg: seed.publishLevel,
        tags: seed.tags,
    };
}
const MOCK_SKILLS = [
    {
        skill_id: 'test1',
        description: '生成测试时使用',
        publish_name: 'xxx_个人发布者',
        publish_level: '个人级',
        owner_list: '[{\"lastName\":\"xxx\",\"Account\":\"x123456\"}]',
        download_count: 2,
        dept_name: '部门1/test2产品线/xxx部门/test5部门/test5部门/12345组',
        id: '1',
        name: 'test1',
        icon: '💡',
        publisher: 'xxx_个人发布者',
        latestPublishTime: '2024-04-22 14:30',
        level: '个人级',
        downloads: 2,
        rating: 4.8,
        version: '1.2.0',
        versions: [
            {
                version: '1.2.0',
                publishTime: '2024-04-22 14:30',
                note: '初始上架',
                packageFileName: 'test1-v1.2.0.zip',
                packageSize: 164000,
            },
        ],
        tagFunctional: '作业类',
        tagOrg: '个人级',
        tags: ['review', 'report'],
    },
    {
        skill_id: 'test2',
        description: '生成个性化使用',
        publish_name: '平台工具部',
        publish_level: '组织级',
        owner_list: '[{\"lastName\":\"xxx\",\"Account\":\"f23442265\"}]',
        download_count: 18888,
        dept_name: '部门1/test3产品线/xxx部门/测试部门/平台一部/平台工具部',
        id: '2',
        name: 'test2',
        icon: '🔧',
        publisher: '平台工具部',
        latestPublishTime: '2024-04-21 10:12',
        level: '组织级',
        downloads: 18888,
        rating: 4.6,
        version: '2.0.1',
        versions: [
            {
                version: '2.0.1',
                publishTime: '2024-04-21 10:12',
                packageFileName: 'test2-v2.0.1.zip',
                packageSize: 216000,
            },
        ],
        tagFunctional: '工具类',
        tagOrg: '组织级',
        tags: ['cicd', 'log'],
    },
    {
        skill_id: 'test3',
        description: 'xxxxxxxxxxxx',
        publish_name: 'xxx_个人发布者',
        publish_level: '个人级',
        owner_list: '[{\"lastName\":\"xxx\",\"Account\":\"xxxxxxxx\"}]',
        download_count: 2,
        dept_name: '部门1/test2产品线/xxx部门/test5部门/小部门',
        id: '3',
        name: 'test3',
        icon: '📋',
        publisher: 'xxx_个人发布者',
        latestPublishTime: '2024-04-20 09:00',
        level: '个人级',
        downloads: 2,
        rating: 4.9,
        version: '1.0.3',
        versions: [
            {
                version: '1.0.3',
                publishTime: '2024-04-20 09:00',
                packageFileName: 'test3-v1.0.3.zip',
                packageSize: 122000,
            },
        ],
        tagFunctional: '业务类',
        tagOrg: '个人级',
        tags: [],
    },
    ...EXTRA_MOCK_SKILL_SEEDS.map(createExtraMockSkill),
];
export function createSkillMarketStore() {
    const skills = ref([...MOCK_SKILLS]);
    const totalSkills = computed(() => skills.value.length);
    const totalDownloads = computed(() => skills.value.reduce((sum, skill) => sum + (skill.download_count ?? skill.downloads ?? 0), 0));
    const downloadsLast30Days = computed(() => Math.floor(totalDownloads.value * 0.1));
    const orgCount = computed(() => 16);
    function findByName(name) {
        const normalizedName = name.trim();
        return skills.value.find((skill) => (skill.name ?? skill.skill_id) === normalizedName);
    }
    function uploadSkill(payload) {
        return uploadSkillApi(skills.value, payload);
    }
    function listSkills(query) {
        return listSkillsApi(skills.value, query);
    }
    function downloadSkill(skillId) {
        return downloadSkillApi(skills.value, skillId);
    }
    return {
        skills,
        totalSkills,
        totalDownloads,
        downloadsLast30Days,
        orgCount,
        uploadSkill,
        listSkills,
        downloadSkill,
        findByName,
    };
}
let singleton = null;
export function useSkillMarketStore() {
    if (!singleton) {
        singleton = createSkillMarketStore();
    }
    return singleton;
}
