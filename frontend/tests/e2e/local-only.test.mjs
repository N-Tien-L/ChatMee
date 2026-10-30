import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalTarget } from './local-only.mjs';

test('e2e_nonLocalTarget_refusesStart', () => {
  for (const target of ['https://example.com', 'http://localhost.evil:3100',
    'http://127.0.0.1:3100@evil.test', 'http://192.168.1.2:3100', 'http://localhost:3000']) {
    assert.throws(() => assertLocalTarget(target), /refuses target/);
  }
  assert.equal(assertLocalTarget('http://127.0.0.1:3100'), 'http://127.0.0.1:3100');
});
test('e2e_nonLocalTarget_launcherRefusesBeforeServices', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-local.mjs', import.meta.url))], {
    env: { ...process.env, E2E_BASE_URL: 'https://example.com' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /refuses target overrides/);
});