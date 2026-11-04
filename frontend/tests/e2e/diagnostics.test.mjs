import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Deliberate startup failure: this check owns the sentinel; the launcher does not.
test('ci_occupiedPort_failsWithSanitizedDiagnosticsAndPreservesExistingServer', { timeout: 30_000 }, async () => {
  const sentinel = createServer((_request, response) => response.end('synthetic sentinel'));
  await new Promise((done, reject) => { sentinel.once('error', reject); sentinel.listen(3100, '127.0.0.1', done); });
  try {
    const result = await new Promise((done, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./run-local.mjs', import.meta.url))],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], timeout: 20_000 });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.once('exit', code => done({ code, stderr }));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /E2E startup failed at ports/);
    const manifest = JSON.parse(readFileSync(new URL('../../e2e-diagnostics/startup.json', import.meta.url), 'utf8'));
    assert.equal(manifest.stage, 'ports');
    assert.equal(manifest.status, 'failed');
    assert.equal(manifest.exitCode, 1);
    assert.equal(manifest.cleanupComplete, true);
    assert.deepEqual(manifest.children, []);
    assert.deepEqual(Object.keys(manifest).sort(), ['children', 'cleanupComplete', 'exitCode', 'stage', 'status', 'timestamp', 'version']);
    const response = await fetch('http://127.0.0.1:3100', { signal: AbortSignal.timeout(2000) });
    assert.equal(await response.text(), 'synthetic sentinel');
    writeFileSync(new URL('../../e2e-diagnostics/failure-check.json', import.meta.url), JSON.stringify({
      check: 'occupied-port', childExitCode: result.code, existingServerSurvived: true, ownedChildren: 0,
    }, null, 2));
  } finally { sentinel.closeAllConnections(); await new Promise(done => sentinel.close(done)); }
});
