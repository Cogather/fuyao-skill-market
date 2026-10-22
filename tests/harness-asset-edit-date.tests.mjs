import assert from 'node:assert/strict';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

function currentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

try {
  const { default: HarnessAssetEditDialog } = await server.ssrLoadModule(
    '/src/components/skill/HarnessAssetEditDialog.vue',
  );
  const context = {};
  await renderToString(
    createSSRApp(HarnessAssetEditDialog, {
      assetType: 'Agent',
      name: 'delivery-agent',
      description: 'Tracks delivery work',
      people: { owner: null, developer: null },
      plannedCompleteDate: '2000-01-01',
      submitting: false,
      error: '',
    }),
    context,
  );
  const html = context.teleports?.body ?? '';
  const dateInput = html.match(/<input(?=[^>]*type="date")[^>]*>/)?.[0];
  assert.ok(dateInput, 'the edit dialog renders its planned completion date input');
  assert.match(dateInput, /value="2000-01-01"/, 'the expired original date remains visible');
  assert.match(
    dateInput,
    new RegExp(`min="${currentLocalDate()}"`),
    'the date picker only offers today or a future date',
  );

  const submitButton = html.match(/<button(?=[^>]*type="submit")[^>]*>/)?.[0];
  assert.ok(submitButton, 'the edit dialog renders its save button');
  assert.match(
    submitButton,
    /formnovalidate(?:="")?/,
    'an unchanged expired date must not block the edit submission before business validation',
  );

  console.log(
    'PASS expired unchanged asset dates remain submittable while the picker stays bounded',
  );
} finally {
  await server.close();
}
