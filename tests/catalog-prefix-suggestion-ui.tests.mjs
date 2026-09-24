import assert from 'node:assert/strict';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});

function teleportedHtml(context) {
  return Object.values(context.teleports ?? {}).join('\n');
}

async function renderCapabilityDialog(capabilityType, productName, createOnly = true) {
  const { default: Component } = await server.ssrLoadModule(
    '/src/components/skill/HarnessCapabilityCatalogPanel.vue',
  );
  const originalSetup = Component.setup;
  let state;
  Component.setup = (props, context) => {
    state = originalSetup(props, context);
    state.filterForm.level = '产品级';
    state.filterForm.product = productName;
    if (createOnly) state.openCreate();
    return state;
  };
  try {
    const context = {};
    await renderToString(
      createSSRApp({
        render: () => h(Component, { capabilityType, createOnly, userId: 'mock-user' }),
      }),
      context,
    );
    return { html: teleportedHtml(context), state };
  } finally {
    Component.setup = originalSetup;
  }
}

async function renderSkillDialog(productName, createOnly = true) {
  const { default: Component } = await server.ssrLoadModule(
    '/src/components/skill/SkillMasterManagementPanelV2.vue',
  );
  const originalSetup = Component.setup;
  let state;
  Component.setup = (props, context) => {
    state = originalSetup(props, context);
    state.masterScopeForm.level = '产品级';
    state.masterScopeForm.offeringName = productName;
    if (createOnly) state.openCreate();
    return state;
  };
  try {
    const context = {};
    await renderToString(
      createSSRApp({
        render: () => h(Component, { createOnly, userId: 'mock-user' }),
      }),
      context,
    );
    return { html: teleportedHtml(context), state };
  } finally {
    Component.setup = originalSetup;
  }
}

async function renderAssetEditDialog(assetType) {
  const { default: Component } = await server.ssrLoadModule(
    '/src/components/skill/HarnessAssetEditDialog.vue',
  );
  const context = {};
  const name = `existing-${assetType.toLowerCase()}`;
  await renderToString(
    createSSRApp(Component, {
      assetType,
      name,
      description: '原资产说明',
      people: { owner: null, developer: null },
      plannedCompleteDate: '',
      submitting: false,
      error: '',
      suggestedNamePrefix: 'agent-',
    }),
    context,
  );
  return { html: teleportedHtml(context), name };
}

try {
  for (const capabilityType of ['agent', 'command']) {
    const { html, state } = await renderCapabilityDialog(
      capabilityType,
      '智能交付 Agent 平台',
    );
    assert.equal(state.editor.name, '', `${capabilityType} 不应自动填入建议前缀`);
    assert.match(
      html,
      /建议使用“agent-”作为名称前缀，仅使用小写字母、数字和连字符。/,
      `${capabilityType} 弹窗应在名称框下方显示建议`,
    );
    assert.doesNotMatch(html, /产品名称不符合命名规范/);
  }

  const pureChineseAgent = await renderCapabilityDialog('agent', '发布风险分析中心');
  assert.equal(pureChineseAgent.state.editor.name, '');
  assert.match(
    pureChineseAgent.html,
    /建议使用“product-e65546-”作为名称前缀，仅使用小写字母、数字和连字符。/,
  );

  const skill = await renderSkillDialog('Harness 流水线平台');
  assert.equal(skill.state.editor.name, '', 'Skill 不应自动填入建议前缀');
  assert.match(
    skill.html,
    /建议使用“harness-”作为名称前缀，仅使用小写字母、数字和连字符。/,
  );
  assert.doesNotMatch(skill.html, /产品名称不符合命名规范/);

  for (const createOnly of [true, false]) {
    const capability = await renderCapabilityDialog(
      'agent',
      '智能交付 Agent 平台',
      createOnly,
    );
    assert.equal(capability.state.suggestedCapabilityNamePrefix.value, 'agent-');
    const skillState = await renderSkillDialog('Harness 流水线平台', createOnly);
    assert.equal(skillState.state.suggestedSkillNamePrefix.value, 'harness-');
  }

  for (const assetType of ['Agent', 'Command', 'Skill']) {
    const editDialog = await renderAssetEditDialog(assetType);
    const nameInput = editDialog.html.match(/<input(?=[^>]*aria-label="名称")[^>]*>/)?.[0] ?? '';
    assert.match(
      nameInput,
      new RegExp(`value="${editDialog.name}"`),
      `编辑 ${assetType} 时不应改写已有名称`,
    );
    assert.match(
      editDialog.html,
      /建议使用“agent-”作为名称前缀，仅使用小写字母、数字和连字符。/,
      `编辑 ${assetType} 弹窗应显示同样的前缀建议`,
    );
  }

  console.log(
    'PASS Agent, Command and Skill create/edit dialogs render invalid-product suggestions without autofill',
  );
} finally {
  await server.close();
}
