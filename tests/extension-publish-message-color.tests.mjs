import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postcss from 'postcss';
import * as sass from 'sass';
import { parse } from '@vue/compiler-sfc';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDir, '..');
const publishPagePath = path.join(workspaceRoot, 'src/views/skill/ExtensionPublishPage.vue');
const workspaceStylesPath = path.join(workspaceRoot, 'src/style/skill/HarnessWorkspace.scss');

const publishPageSource = await readFile(publishPagePath, 'utf8');
const { descriptor } = parse(publishPageSource, { filename: publishPagePath });
const publishStyles = descriptor.styles.map((style) => style.content).join('\n');
const publishStyleRoot = postcss.parse(publishStyles);

function colorsForSelector(root, selector) {
  const colors = [];
  root.walkRules((rule) => {
    if (rule.selector !== selector) return;
    rule.walkDecls('color', (declaration) => colors.push(declaration.value));
  });
  return colors;
}

assert.deepEqual(
  colorsForSelector(publishStyleRoot, '.extension-follow-publish-note.is-success'),
  ['#15803d'],
  'a publishable API message is green',
);
assert.deepEqual(
  colorsForSelector(publishStyleRoot, '.extension-follow-publish-note.is-error'),
  ['#dc2626'],
  'a blocked API message is red',
);

const workspaceStyles = sass.compile(workspaceStylesPath).css;
const workspaceStyleRoot = postcss.parse(workspaceStyles);
const sharedMessageColors = [];
workspaceStyleRoot.walkRules((rule) => {
  if (!rule.selector.includes('.extension-follow-publish-note')) return;
  rule.walkDecls('color', (declaration) => sharedMessageColors.push(declaration.value));
});

assert.deepEqual(
  sharedMessageColors,
  [],
  'the shared workspace adapter must not override the API message status color',
);

console.log('PASS Extension publish messages retain their red/green status colors');
