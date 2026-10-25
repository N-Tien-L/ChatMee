import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertLocalTarget } from './local-only.mjs';

assertLocalTarget();
const frontend = fileURLToPath(new URL('../../', import.meta.url));
const backend = resolve(frontend, '../backend');
for (const directory of [frontend, backend]) {
  if (readdirSync(directory).some(name => name.startsWith('.env') && !name.endsWith('.example')))
    throw new Error('E2E requires a checkout without .env files; no file contents were read');
}
// Only platform/tool resolution variables survive. No inherited application/service credentials.
const env = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT',
  'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'JAVA_HOME', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  DOCKER_HOST: process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock',
  NEXT_PUBLIC_WS_URL: 'ws://127.0.0.1:8100/ws' });
const children = [];
let stopping = false;
let proxy;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  proxy?.closeAllConnections();
  proxy?.close();
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      await new Promise(resolve => spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'],
        { windowsHide: true, stdio: 'ignore' }).once('exit', resolve));
    } else {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}
function launch(command, args, cwd, visible = false) {
  const child = spawn(command, args, { cwd, env, windowsHide: true,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    stdio: visible ? 'inherit' : 'ignore' });
  children.push(child);
  child.on('error', () => { process.stderr.write('E2E child failed to start\n'); void stop(1); });
  return child;
}
async function completed(child, label) {
  const code = await new Promise(resolve => child.once('exit', resolve));
  if (code !== 0) throw new Error(label + ' failed; run the documented command directly for diagnostics');
}
async function ready(url, child) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('E2E service exited before readiness');
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
    } catch { /* bounded readiness polling */ }
    await delay(500);
  }
  throw new Error('E2E service readiness timed out');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void stop(0));
try {
  // Refuse occupied ports, rather than reusing a potentially non-test stack.
  for (const port of [3100, 3101, 8100, 9100]) {
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => probe.close(resolve));
    });
  }
  await completed(launch('docker', ['info', '--format', '{{.ServerVersion}}'], frontend), 'Local Docker daemon check');
  const java = launch(process.platform === 'win32' ? 'mvnw.cmd' : './mvnw',
    ['spring-boot:test-run', '-Dspring-boot.run.main-class=com.lnt.chatmee.e2e.E2eApplication'], backend);
  await ready('http://127.0.0.1:8100/actuator/health', java);
  process.stdout.write('E2E isolated backend ready\n');
  await completed(launch(process.execPath, ['node_modules/next/dist/bin/next', 'build'], frontend, true), 'Frontend build');
  await completed(launch(process.execPath, ['tests/e2e/check-artifact.mjs'], frontend, true), 'Frontend artifact check');
  const next = launch(process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3101'], frontend);
  await ready('http://127.0.0.1:3101/login', next);
  proxy = createServer((incoming, outgoing) => {
    const path = new URL(incoming.url, 'http://127.0.0.1:3100').pathname;
    const isBackend = path.startsWith('/api/') || path.startsWith('/oauth2/')
      || path.startsWith('/login/oauth2/') || path === '/logout';
    const upstream = request({
      hostname: '127.0.0.1', port: isBackend ? 8100 : 3101,
      path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, host: '127.0.0.1:3100' },
    }, response => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => { outgoing.writeHead(502); outgoing.end('Local upstream unavailable'); });
    incoming.pipe(upstream);
  });
  proxy.listen(3100, '127.0.0.1');
  for (const child of [java, next]) child.once('exit', () => { if (!stopping) void stop(1); });
} catch (error) {
  process.stderr.write(String(error) + '\n');
  await stop(1);
}