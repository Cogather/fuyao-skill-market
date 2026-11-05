import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';

const previousDocument = globalThis.document;
const previousHTMLElement = globalThis.HTMLElement;
globalThis.HTMLElement = class HTMLElement {};
globalThis.document = { activeElement: null };

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { default: HarnessCatalogImportDialog } = await server.ssrLoadModule(
    '/src/components/skill/HarnessCatalogImportDialog.vue',
  );
  let bindings;
  const TestHost = {
    setup() {
      bindings = HarnessCatalogImportDialog.setup(
        {
          assetType: 'Command',
          userId: 'import-user',
          departmentTree: [],
          initialScope: {
            level: '部门级',
            departmentPath: [],
            offeringId: '',
            offeringName: '',
          },
          allowedDepartmentPaths: [],
          restrictToAllowedDepartments: false,
        },
        { expose() {}, emit() {} },
      );
      return () => h('div');
    },
  };
  await renderToString(createSSRApp(TestHost));

  bindings.submitting.value = true;
  assert.equal(bindings.locked.value, true, 'an active import keeps file selection locked');
  bindings.submitting.value = false;
  bindings.result.value = {
    successCount: 1,
    failCount: 1,
    errors: ['第 2 行：数据不合法'],
  };

  assert.equal(bindings.locked.value, false, 'a completed result must not lock file selection');
  const replacement = new File(['replacement workbook'], 'replacement.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  bindings.chooseFiles([replacement]);

  assert.equal(bindings.file.value, replacement);
  assert.equal(bindings.result.value, null, 'selecting another file resets the previous result');
  assert.equal(bindings.error.value, '');
  console.log('PASS import panels allow file reselection after a completed result');
} finally {
  await server.close();
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = previousHTMLElement;
}
