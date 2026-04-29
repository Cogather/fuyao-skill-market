import { computed, ref } from 'vue';
import { downloadSkillApi, listSkillsApi, uploadSkillApi, } from '../api/skillMarketMock';
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
