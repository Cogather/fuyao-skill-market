import { computed, ref } from 'vue';
import { createSkillMarketClient } from '../services/skillMarket';
import { apiMyRecordToSkill } from '../services/skillMarket/mappers';
export function createSkillMarketStore() {
    const client = createSkillMarketClient();
    const skills = client.skills;
    const myPublishedSkills = ref([]);
    async function refreshMyPublishedSkills() {
        const r = await client.fetchMySkills({ pageNo: 1, pageSize: 200 });
        if (r.code === 0 && r.data?.records) {
            myPublishedSkills.value = r.data.records.map(apiMyRecordToSkill);
        }
    }
    void refreshMyPublishedSkills();
    const orgCount = ref(16);
    void client.fetchOrganizations().then((r) => {
        if (r.code === 0 && Array.isArray(r.data)) {
            orgCount.value = r.data.length;
        }
    });
    const totalSkills = computed(() => skills.value.length);
    const totalDownloads = computed(() => skills.value.reduce((sum, skill) => sum + (skill.download_count ?? skill.downloads ?? 0), 0));
    const downloadsLast30Days = computed(() => Math.floor(totalDownloads.value * 0.1));
    const currentUserRole = ref(null);
    async function refreshCurrentUserRole() {
        const r = await client.fetchCurrentUserRole();
        if (r.code === 0) {
            currentUserRole.value = r.data;
        }
        else {
            currentUserRole.value = null;
        }
    }
    void refreshCurrentUserRole();
    function findByName(name) {
        const normalizedName = name.trim();
        return skills.value.find((skill) => (skill.name ?? skill.skill_id) === normalizedName);
    }
    async function uploadSkill(payload) {
        return client.uploadSkill(payload);
    }
    async function listSkills(query) {
        return client.listSkills(query);
    }
    async function downloadSkill(skillId, options) {
        return client.downloadSkill(skillId, options);
    }
    return {
        skills,
        myPublishedSkills,
        refreshMyPublishedSkills,
        marketClient: client,
        currentUserRole,
        refreshCurrentUserRole,
        orgCount,
        totalSkills,
        totalDownloads,
        downloadsLast30Days,
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
