import type { Page } from '@playwright/test';

import type { SkillPlanningUserOption } from '../../src/services/skillMarket/skillPlanningService';
import { expect, test } from '../fixtures/base';

type UserRecord = {
  id: string;
  sAMAccountName: string;
  chName: string;
  deptName: string;
};
type PersonPickerProbe = {
  calls: { info: string }[];
  selected: SkillPlanningUserOption | null;
  updates: (SkillPlanningUserOption | null)[];
  escaped: number;
  resolve: (index: number, users: UserRecord[]) => void;
  reject: (index: number, message: string) => void;
};

function user(id: string, chName = '测试用户'): UserRecord {
  return { id, sAMAccountName: id, chName, deptName: '研发' };
}

function normalized(record: UserRecord): SkillPlanningUserOption {
  return {
    ...record,
    label: `${record.chName} ${record.id}`,
    raw: record,
  };
}

async function mountPicker(
  page: Page,
  initialSelection: SkillPlanningUserOption | null = null,
): Promise<void> {
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.goto('/skill-market/harness-management');
  await page.evaluate(async (initialSelection) => {
    const vuePath = '/skill-market/node_modules/.vite/deps/vue.js';
    const componentPath = '/skill-market/src/components/skill/WorkflowPersonPicker.vue';
    const servicePath = '/skill-market/src/services/skillMarket/skillBaseService.ts';
    const { createApp, h, ref } = await import(vuePath);
    const { default: Picker } = await import(componentPath);
    const { skillBaseService } = await import(servicePath);
    const appElement = document.getElementById('app');
    if (appElement) {
      appElement.style.display = 'none';
    }
    const host = document.createElement('div');
    host.id = 'workflow-person-picker-test';
    host.style.cssText = 'width:420px;margin:40px auto;background:white;padding:24px;';
    document.body.append(host);
    const selected = ref(initialSelection);
    const pending: ((response: { code: number; data: UserRecord[] }) => void)[] = [];
    const failures: ((reason: Error) => void)[] = [];
    const probe: PersonPickerProbe = {
      calls: [],
      selected: initialSelection,
      updates: [],
      escaped: 0,
      resolve(index, users) {
        pending[index]!({ code: 200, data: users });
      },
      reject(index, message) {
        failures[index]!(new Error(message));
      },
    };
    (window as unknown as { personPickerProbe: PersonPickerProbe }).personPickerProbe = probe;
    // Keep querySkillPlanningUsers and its normalization real. The local service mock
    // handles this endpoint before HTTP, so control the service boundary instead.
    skillBaseService.getUserDepartment = (params: { info: string }) => {
      probe.calls.push({ ...params });
      return new Promise<{ code: number; data: UserRecord[] }>((resolve, reject) => {
        pending.push(resolve);
        failures.push(reject);
      });
    };
    createApp({
      setup() {
        return () =>
          h(
            'section',
            {
              onKeydown(event: KeyboardEvent) {
                if (event.key === 'Escape') {
                  probe.escaped += 1;
                }
              },
            },
            [
              h(Picker, {
                label: '开发责任人',
                modelValue: selected.value,
                'onUpdate:modelValue'(value: SkillPlanningUserOption | null) {
                  probe.selected = value;
                  probe.updates.push(value);
                  selected.value = value;
                },
              }),
              h('button', { type: 'button', style: 'margin-top:260px' }, '移开焦点'),
            ],
          );
      },
    }).mount(host);
  }, initialSelection);
  await expect(page.locator('#workflow-person-picker-test').getByRole('combobox')).toBeVisible();
  await page.clock.install({ time: new Date('2026-09-07T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-07T00:00:01Z'));
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as { personPickerProbe: PersonPickerProbe }).personPickerProbe;
    return {
      calls: probe.calls,
      selected: probe.selected,
      updates: probe.updates,
      escaped: probe.escaped,
    };
  });
}

async function resolveQuery(page: Page, index: number, users: UserRecord[]): Promise<void> {
  await page.evaluate(
    ({ index, users }) =>
      (window as unknown as { personPickerProbe: PersonPickerProbe }).personPickerProbe.resolve(
        index,
        users,
      ),
    { index, users },
  );
}

test('人员列表默认悬浮，查询和多条结果均不改变表单高度与按钮位置', async ({ page }) => {
  await mountPicker(page);
  const host = page.locator('#workflow-person-picker-test');
  const input = host.getByRole('combobox');
  const button = host.getByRole('button', { name: '移开焦点' });
  const bounds = await host.boundingBox();
  const buttonBounds = await button.boundingBox();
  await input.fill('用户');
  await expect(page.getByRole('status')).toBeVisible();
  expect(await host.boundingBox()).toEqual(bounds);
  expect(await button.boundingBox()).toEqual(buttonBounds);
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(1);
  await resolveQuery(
    page,
    0,
    Array.from({ length: 12 }, (_, index) => user(`w${index}`, `用户${index}`)),
  );
  await expect(page.getByRole('option')).toHaveCount(12);
  expect(await host.boundingBox()).toEqual(bounds);
  expect(await button.boundingBox()).toEqual(buttonBounds);
  await page.getByRole('option').last().click();
  await expect(input).toHaveValue('用户11 w11');
  expect(await host.boundingBox()).toEqual(bounds);
});

test('页面滚动后浮层跟随输入框，进行中的人员查询仍可返回并选择', async ({ page }) => {
  await mountPicker(page);
  const input = page.getByRole('combobox', { name: '开发责任人', exact: true });
  await input.fill('用户');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(1);
  await page.evaluate(() => {
    document.body.style.minHeight = '1600px';
    window.scrollTo(0, 20);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(20);
  await page.clock.runFor(50);
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await resolveQuery(page, 0, [user('w123')]);
  await expect(page.getByRole('option')).toBeVisible();
  const inputBounds = (await input.boundingBox())!;
  const popupBounds = (await page.locator('.workflow-person-picker__popup').boundingBox())!;
  expect(popupBounds.y).toBeGreaterThanOrEqual(inputBounds.y + inputBounds.height);
  expect(popupBounds.y).toBeLessThan(inputBounds.y + inputBounds.height + 16);
  await page.getByRole('option').click();
  await expect(input).toHaveValue('测试用户 w123');
});

test('姓名和工号查询均以最新 info 防抖，并提交真实服务规范化的人员', async ({ page }) => {
  await mountPicker(page);
  const picker = page.locator('#workflow-person-picker-test');
  const search = picker.getByRole('combobox', { name: '开发责任人', exact: true });
  await search.focus();
  await page.clock.fastForward(500);
  expect((await snapshot(page)).calls).toEqual([]);

  await search.fill('测');
  await page.clock.fastForward(150);
  await search.fill('  测试用户  ');
  await page.clock.fastForward(249);
  expect((await snapshot(page)).calls).toEqual([]);
  await page.clock.fastForward(1);
  await expect.poll(async () => (await snapshot(page)).calls).toEqual([{ info: '测试用户' }]);
  await resolveQuery(page, 0, [user('w123')]);
  const person = page.getByRole('option');
  await expect(person).toHaveCount(1);
  await expect(person).toContainText('测试用户');
  await expect(person).toContainText('w123');
  await expect(person).toContainText('研发');
  expect((await snapshot(page)).selected).toBeNull();
  await person.click();
  expect((await snapshot(page)).selected).toEqual(normalized(user('w123')));
  await expect(search).toHaveValue(/测试用户.*w123/);
  await expect(page.getByRole('listbox')).toBeHidden();

  await picker.getByRole('button', { name: /清空/ }).click();
  await expect(search).toHaveValue('');
  expect((await snapshot(page)).selected).toBeNull();
  await page.clock.fastForward(500);
  expect((await snapshot(page)).calls).toEqual([{ info: '测试用户' }]);

  await search.fill('w1');
  await page.clock.fastForward(100);
  await search.fill('w123');
  await page.clock.fastForward(249);
  expect((await snapshot(page)).calls).toHaveLength(1);
  await page.clock.fastForward(1);
  await expect
    .poll(async () => (await snapshot(page)).calls)
    .toEqual([{ info: '测试用户' }, { info: 'w123' }]);
  await resolveQuery(page, 1, [user('w123')]);
  await page.getByRole('option').click();
  expect((await snapshot(page)).updates).toEqual([
    normalized(user('w123')),
    null,
    normalized(user('w123')),
  ]);
});

test('已选人员清空后可更换，输入和失焦不会把自由文本提交为人员', async ({ page }) => {
  await mountPicker(page, normalized(user('w123')));
  const picker = page.locator('#workflow-person-picker-test');
  const search = picker.getByRole('combobox');
  await expect(search).toHaveValue('测试用户 w123');
  await expect(search).toHaveAttribute('readonly', '');
  await picker.getByRole('button', { name: /清空/ }).click();
  await expect(search).toBeEditable();
  await search.fill('没有选择的自由文本');
  expect((await snapshot(page)).selected).toBeNull();
  await search.press('Enter');
  await picker.getByRole('button', { name: '移开焦点' }).click();
  expect((await snapshot(page)).updates).toEqual([null]);
  await page.clock.fastForward(500);
  expect((await snapshot(page)).selected).toBeNull();
});

test('改词后的防抖窗口和清空操作都会立即使在途请求失效', async ({ page }) => {
  await mountPicker(page);
  const picker = page.locator('#workflow-person-picker-test');
  const search = picker.getByRole('combobox');
  await search.fill('first');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toEqual([{ info: 'first' }]);

  await search.fill('second');
  await resolveQuery(page, 0, [user('w-old-first', '旧查询人员')]);
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.clock.fastForward(249);
  expect((await snapshot(page)).calls).toHaveLength(1);
  await page.clock.fastForward(1);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(2);
  await picker.getByRole('button', { name: /清空/ }).click();
  await resolveQuery(page, 1, [user('w-old-second', '清空前人员')]);
  await expect(search).toHaveValue('');
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.clock.fastForward(500);
  expect((await snapshot(page)).calls).toEqual([{ info: 'first' }, { info: 'second' }]);
  expect((await snapshot(page)).selected).toBeNull();

  await search.fill('third');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(3);
  await search.fill('latest');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(4);
  await resolveQuery(page, 3, [user('w-latest', '最新人员')]);
  await expect(page.getByRole('option')).toContainText('最新人员');
  await resolveQuery(page, 2, [user('w-old-third', '更迟返回的旧人员')]);
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText('最新人员');
});

test('空结果和请求错误有反馈，重试仍使用同一查询并能恢复选择', async ({ page }) => {
  await mountPicker(page);
  const picker = page.locator('#workflow-person-picker-test');
  const search = picker.getByRole('combobox');
  await search.fill('nobody');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(1);
  await resolveQuery(page, 0, []);
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(page.getByText(/未找到|无匹配|暂无.*人员/)).toBeVisible();

  await search.fill('测试用户');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(2);
  await page.evaluate(() =>
    (window as unknown as { personPickerProbe: PersonPickerProbe }).personPickerProbe.reject(
      1,
      '人员服务暂不可用',
    ),
  );
  await expect(page.getByRole('status')).toContainText('人员服务暂不可用');
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.getByRole('button', { name: '重试', exact: true }).press('Enter');
  await expect
    .poll(async () => (await snapshot(page)).calls)
    .toEqual([{ info: 'nobody' }, { info: '测试用户' }, { info: '测试用户' }]);
  await resolveQuery(page, 2, [user('w123')]);
  await expect(page.getByText('人员服务暂不可用', { exact: true })).toHaveCount(0);
  await page.getByRole('option').click();
  expect((await snapshot(page)).selected).toEqual(normalized(user('w123')));
});

test('键盘可选择候选，Esc 关闭下拉且不会冒泡关闭父级界面', async ({ page }) => {
  await mountPicker(page);
  const picker = page.locator('#workflow-person-picker-test');
  const search = picker.getByRole('combobox');
  await search.fill('用户');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(1);
  await resolveQuery(page, 0, [user('w123', '第一用户'), user('w456', '第二用户')]);
  await expect(page.getByRole('option')).toHaveCount(2);
  await search.press('ArrowDown');
  await search.press('Enter');
  expect((await snapshot(page)).selected).toEqual(normalized(user('w123', '第一用户')));
  await expect(page.getByRole('listbox')).toBeHidden();

  await picker.getByRole('button', { name: /清空/ }).click();
  await search.fill('用户');
  await page.clock.fastForward(250);
  await expect.poll(async () => (await snapshot(page)).calls).toHaveLength(2);
  await resolveQuery(page, 1, [user('w456', '第二用户')]);
  await expect(page.getByRole('listbox')).toBeVisible();
  await search.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(search).toBeFocused();
  expect((await snapshot(page)).escaped).toBe(0);
  expect((await snapshot(page)).selected).toBeNull();
});

test('中文输入法组词期间不发送请求，组合结束后仅查询完整文字', async ({ page }) => {
  await mountPicker(page);
  const picker = page.locator('#workflow-person-picker-test');
  const search = picker.getByRole('combobox');
  await search.focus();
  await search.dispatchEvent('compositionstart', { data: '' });
  await search.fill('ce');
  await page.clock.fastForward(500);
  expect((await snapshot(page)).calls).toEqual([]);
  await search.fill('测试用户');
  await page.clock.fastForward(500);
  expect((await snapshot(page)).calls).toEqual([]);
  await search.dispatchEvent('compositionend', { data: '测试用户' });
  await page.clock.fastForward(249);
  expect((await snapshot(page)).calls).toEqual([]);
  await page.clock.fastForward(1);
  await expect.poll(async () => (await snapshot(page)).calls).toEqual([{ info: '测试用户' }]);
  await resolveQuery(page, 0, [user('w123')]);
  await expect(page.getByRole('option')).toContainText('测试用户');
  expect((await snapshot(page)).selected).toBeNull();
});
