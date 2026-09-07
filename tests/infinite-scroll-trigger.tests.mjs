import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { mergeUniquePage, shouldLoadNextPage } = await server.ssrLoadModule(
    '/src/utils/infiniteScroll.ts',
  );

  const base = {
    previousScrollTop: 200,
    scrollTop: 750,
    scrollHeight: 1200,
    clientHeight: 400,
    threshold: 80,
    loading: false,
    hasMore: true,
  };

  assert.equal(shouldLoadNextPage(base), true, 'downward near-bottom scroll loads');
  assert.equal(
    shouldLoadNextPage({ ...base, previousScrollTop: 800, scrollTop: 750 }),
    false,
    'upward scroll never loads',
  );
  assert.equal(
    shouldLoadNextPage({ ...base, scrollTop: 500 }),
    false,
    'scrolling down away from the bottom does not load',
  );
  assert.equal(shouldLoadNextPage({ ...base, loading: true }), false, 'in-flight request blocks');
  assert.equal(shouldLoadNextPage({ ...base, hasMore: false }), false, 'exhausted list blocks');
  assert.equal(
    shouldLoadNextPage({
      ...base,
      previousScrollTop: 0,
      scrollTop: 0,
      scrollHeight: 300,
      clientHeight: 400,
    }),
    false,
    'initial layout without a downward scroll does not trigger pagination',
  );

  assert.deepEqual(
    mergeUniquePage(
      [
        { id: 'Agent:a', value: 'first' },
        { id: 'Skill:b', value: 'second' },
      ],
      [
        { id: 'Skill:b', value: 'duplicate' },
        { id: 'Command:c', value: 'third' },
      ],
      (item) => item.id,
    ),
    [
      { id: 'Agent:a', value: 'first' },
      { id: 'Skill:b', value: 'second' },
      { id: 'Command:c', value: 'third' },
    ],
    'new pages append in order without duplicating existing rows',
  );

  console.log('PASS infinite-scroll direction, threshold and page merge rules');
} finally {
  await server.close();
}
