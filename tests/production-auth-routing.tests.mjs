import assert from 'node:assert/strict';
import { build } from 'vite';

function javascriptChunks(result) {
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((output) => output.output).filter((item) => item.type === 'chunk');
}

for (const mode of ['production', 'development']) {
  const result = await build({
    mode,
    logLevel: 'silent',
    build: { write: false },
  });
  const code = javascriptChunks(result)
    .map((chunk) => chunk.code)
    .join('\n');

  assert.ok(
    code.includes('/dataengineering/auth-manager/login'),
    `${mode} 构建应包含 auth-manager 登录请求`,
  );
  assert.ok(
    !code.includes('/fuyaoDomain'),
    `${mode} 构建不能包含仅供 Vite 开发服务器使用的 /fuyaoDomain`,
  );
}

console.log('PASS deployable builds use the same-origin auth gateway');
