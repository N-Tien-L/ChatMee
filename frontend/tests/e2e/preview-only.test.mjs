import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
const runner = fileURLToPath(new URL('./run-preview.mjs', import.meta.url));
test('preview fixed metadata and override guards', () => {
  const clean = spawnSync(process.execPath, [runner, '--check'], { encoding: 'utf8' });
  assert.equal(clean.status, 0);
  assert.deepEqual(JSON.parse(clean.stdout), { ports: [3200, 3201, 8200, 9200], synthetic: true });
  for (const [args, env] of [[['--url=https://example.com'], process.env], [['--check'], { ...process.env, E2E_BASE_URL: 'https://example.com' }]]) {
    const result = spawnSync(process.execPath, [runner, ...args], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  }
});
test('preview preserves an occupied port', async () => {
  const sentinel = createServer((_, response) => response.end('sentinel'));
  await new Promise((done, reject) => { sentinel.once('error', reject); sentinel.listen(3200, '127.0.0.1', done); });
  try {
    const child = spawn(process.execPath, [runner], { stdio: 'ignore', windowsHide: true });
    const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); });
    assert.equal(code, 1);
    assert.equal(await (await fetch('http://127.0.0.1:3200')).text(), 'sentinel');
  } finally { await new Promise(done => sentinel.close(done)); }
});
