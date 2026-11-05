import PizZip from 'pizzip';

import { expect, test } from '../fixtures/base';
import { HarnessManagementPage } from '../pages/harnessManagement.page';

test('工作流 Extension 发布可切换 CodeAgent 与 TestAgent 并保留公共数据', async ({ page }) => {
  const harness = new HarnessManagementPage(page);
  await harness.goto();
  await harness.switchToWorkflows();
  await harness.workflowStatusButton('待发布').click();

  const row = harness.workflowInventoryRow('构建诊断流程');
  await row.getByRole('button', { name: '发布', exact: true }).click();

  const assembly = page.getByRole('region', { name: 'Extension 发布组装' });
  await expect(assembly).toBeVisible();
  const inheritanceSection = assembly.getByRole('button', { name: /继承与目录结构/ });
  const uploadSection = assembly.getByRole('button', { name: /自定义附加文件/ });
  await expect(inheritanceSection).toHaveAttribute('aria-expanded', 'false');
  await expect(uploadSection).toHaveAttribute('aria-expanded', 'false');
  await inheritanceSection.click();
  await uploadSection.click();
  await expect(assembly.getByRole('button', { name: 'CodeAgent（标准）' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const description = page.getByLabel('Extension 描述', { exact: true });
  await description.fill('切换发布目标后仍需保留的描述');

  const zip = new PizZip();
  zip.file('docs/readme.md', 'hello');
  zip.file('skills/blocked/SKILL.md', 'blocked');
  await assembly.locator('input[type="file"]').setInputFiles({
    name: 'custom.zip',
    mimeType: 'application/zip',
    buffer: zip.generate({ type: 'nodebuffer' }),
  });
  await expect(assembly.getByText('custom.zip', { exact: true })).toBeVisible();
  await expect(assembly.getByText('已过滤 1 个受保护文件', { exact: true })).toBeVisible();

  await assembly.getByRole('button', { name: 'TestAgent', exact: true }).click();
  await expect(assembly.getByRole('button', { name: 'TestAgent', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(assembly.getByText('.testagent/', { exact: true })).toBeVisible();
  await expect(assembly.getByText('custom.zip', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Extension 描述', { exact: true })).toHaveValue(
    '切换发布目标后仍需保留的描述',
  );
  await assembly.getByRole('button', { name: '更换继承', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '选择继承源' });
  await dialog.getByRole('radio', { name: /QA 通用测试 Extension/ }).check();
  await dialog.getByRole('button', { name: '确认继承', exact: true }).click();
  await expect(assembly.getByText('QA 通用测试 Extension', { exact: true })).toBeVisible();

  await assembly.getByRole('button', { name: 'CodeAgent（标准）' }).click();
  await expect(assembly.getByText('custom.zip', { exact: true })).toBeVisible();
  await assembly.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('heading', { name: '发布历史', exact: true })).toBeVisible();
});

