import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

test('Mock 完整包在无旁路、上传后、移除后均可下载', async ({ page }) => {
  test.skip(process.env.VITE_SKILL_MARKET_TRANSPORT === 'http', '需要 Mock 模式');
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();
  await harness.workflowStatusButton('待发布').click();
  await harness
    .workflowInventoryRow('构建诊断流程')
    .getByRole('button', { name: '发布', exact: true })
    .click();
  const assembly = page.getByRole('region', { name: 'Extension 发布组装' });
  await assembly.getByRole('button', { name: /继承与目录结构/ }).click();
  const button = assembly.getByRole('button', { name: '下载完整包', exact: true });
  const downloadPackage = async () => {
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    const pending = page.waitForEvent('download');
    await button.click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    return new PizZip(await readFile((await download.path())!));
  };
  const initial = await downloadPackage();
  const paths = (zip: PizZip) =>
    Object.values(zip.files)
      .filter((file) => !file.dir)
      .map((file) => file.name);
  expect(paths(initial).some((path) => path.endsWith('/codeagent-extension.json'))).toBe(true);
  expect(paths(initial).some((path) => path.includes('/commands/'))).toBe(true);
  await assembly.getByRole('button', { name: /自定义附加文件/ }).click();
  const bypass = new PizZip();
  bypass.file('docs/custom.md', 'uploaded content');
  await assembly.locator('input[type=file]').setInputFiles({
    name: 'custom.zip',
    mimeType: 'application/zip',
    buffer: bypass.generate({ type: 'nodebuffer' }),
  });
  await expect(
    assembly.getByRole('list', { name: '最终目录结构' }).getByText('custom.md', { exact: true }),
  ).toBeVisible();
  const uploaded = await downloadPackage();
  const bypassPath = paths(uploaded).find((path) => path.endsWith('/docs/custom.md'))!;
  expect(uploaded.file(bypassPath)?.asText()).toBe('uploaded content');
  await assembly.getByRole('button', { name: '移除旁路', exact: true }).click();
  await expect(
    assembly.getByRole('list', { name: '最终目录结构' }).getByText('custom.md', { exact: true }),
  ).toHaveCount(0);
  await assembly.getByRole('button', { name: '最终目录结构预览', exact: true }).click();
  const cleared = await downloadPackage();
  expect(cleared.file(bypassPath)).toBeNull();
  expect(paths(cleared).sort()).toEqual(paths(initial).sort());
  await assembly.getByRole('button', { name: 'TestAgent', exact: true }).click();
  const testagent = await downloadPackage();
  expect(paths(testagent).some((path) => path.includes('/.testagent/commands/'))).toBe(true);
  expect(paths(testagent).some((path) => path.endsWith('/.cac-plugin/plugin.json'))).toBe(true);
});
