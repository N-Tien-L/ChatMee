import { spawn, spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdirSync, readdirSync, writeFileSync, readFileSync, cpSync, existsSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, delimiter } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertLocalTarget } from './local-only.mjs';

assertLocalTarget();
if (process.argv.slice(2).some(arg => arg !== '--check') || process.argv.length > 3)
  throw new Error('Preview accepts only --check; no target overrides');
if (process.argv[2] === '--check') {
  process.stdout.write(JSON.stringify({ ports: [3200, 3201, 8200, 9200], synthetic: true }) + '\n');
  process.exit(0);
}
const frontend = fileURLToPath(new URL('../../', import.meta.url));
const backend = resolve(frontend, '../backend');
for (const directory of [frontend, backend]) {
  if (readdirSync(directory).some(name => name.startsWith('.env') && !name.endsWith('.example')))
    throw new Error('E2E requires a checkout without .env files; no file contents were read');
}
const repository = resolve(frontend, '..');
const sourceRevision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', windowsHide: true }).stdout?.trim();
if (!/^[a-f0-9]{40}$/.test(sourceRevision ?? '')) throw new Error('Cannot identify preview source revision');
const runtime = resolve(repository, '.local-preview', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
const snapshot = resolve(runtime, 'frontend');
const diagnostics = runtime;
mkdirSync(diagnostics, { recursive: true });
// Only platform/tool resolution survives. No inherited application/service credentials.
const env = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT',
  'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'JAVA_HOME', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  DOCKER_HOST: process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock',
  NEXT_PUBLIC_WS_URL: 'ws://127.0.0.1:8200/ws' });
const children = [];
let stopping = false;
let proxy;
let stage = 'ports';
function record(status, exitCode = null, cleanupComplete = false) {
  // Allowlisted metadata only. Never child output, HTTP headers/bodies, env or browser storage.
  writeFileSync(resolve(diagnostics, 'startup.json'), JSON.stringify({
    version: 1, sourceRevision, snapshot: true, timestamp: new Date().toISOString(), stage, status, exitCode, cleanupComplete,
    children: children.map(({ child, label }) => ({ label, pid: child.pid ?? null, exitCode: child.exitCode })),
  }, null, 2));
}
function phase(value) { stage = value; record('starting'); }
async function terminate(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    if (child.exitCode !== null) return;
    await new Promise((done, reject) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'],
        { windowsHide: true, stdio: 'ignore' });
      killer.once('error', reject);
      killer.once('exit', code => code === 0 ? done() : reject(new Error('Owned process termination failed')));
    });
    return;
  }
  // Each Unix child leads a NEW process group created below. Never signal by name/port.
  const signalGroup = signal => {
    try { process.kill(-child.pid, signal); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  if (!signalGroup('SIGTERM')) return;
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (!signalGroup(0)) return;
    await delay(100); // bounded shutdown polling, never a browser success assertion
  }
  signalGroup('SIGKILL');
}
async function stop(code) {
  if (stopping) return;
  stopping = true;
  proxy?.closeAllConnections();
  proxy?.close();
  let cleanupComplete = true;
  for (const { child } of [...children].reverse()) {
    try { await terminate(child); } catch { cleanupComplete = false; }
  }
  if (!cleanupComplete && code === 0) code = 1;
  record(code === 0 ? 'stopped' : 'failed', code, cleanupComplete);
  process.exit(code);
}
function launch(command, args, cwd, visible = false) {
  const child = spawn(command, args, { cwd, env, windowsHide: true,
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    stdio: visible ? 'inherit' : 'ignore' });
  children.push({ child, label: stage });
  record('starting');
  child.once('error', () => { process.stderr.write('E2E child failed to start at ' + stage + '\n'); void stop(1); });
  return child;
}
async function completed(child, timeout = 180_000) {
  let timer;
  try {
    const code = child.exitCode ?? await new Promise((done, reject) => {
      child.once('exit', done);
      timer = setTimeout(() => reject(new Error('Command deadline exceeded')), timeout);
    });
    if (code !== 0) throw new Error('Child command failed');
  } finally { clearTimeout(timer); }
}
async function ready(url, child) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Service exited before readiness');
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
    } catch { /* readiness bounded by request and service deadlines */ }
    await delay(500);
  }
  throw new Error('Service readiness timed out');
}
process.on('SIGINT', () => void stop(130));
process.on('SIGTERM', () => void stop(0)); // normal Playwright webServer teardown
try {
  phase('ports');
  for (const port of [3200, 3201, 8200, 9200]) {
    await new Promise((done, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => probe.close(done));
    });
  }
  phase('docker');
  await completed(launch('docker', ['info', '--format', '{{.ServerVersion}}'], frontend), 15_000);
  phase('backend');
  await completed(launch(process.platform === 'win32' ? 'mvnw.cmd' : './mvnw',
    ['-q', 'test-compile', 'dependency:build-classpath', '-Dmdep.includeScope=test',
      '-Dmdep.outputFile=' + resolve(runtime, 'classpath.txt')], backend));
  for (const directory of ['classes', 'test-classes'])
    cpSync(resolve(backend, 'target', directory), resolve(runtime, directory), { recursive: true });
  const classpath = ['classes', 'test-classes'].map(name => resolve(runtime, name))
    .concat(readFileSync(resolve(runtime, 'classpath.txt'), 'utf8').trim()).join(delimiter);
  const java = launch('java', ['-cp', classpath, 'com.lnt.chatmee.e2e.E2eApplication', '--preview'], runtime);
  java.once('exit', () => { if (!stopping) void stop(1); });
  await ready('http://127.0.0.1:8200/actuator/health', java);
  phase('snapshot');
  mkdirSync(snapshot, { recursive: true });
  for (const name of ['app', 'components', 'hooks', 'lib', 'public', 'package.json', 'package-lock.json',
    'next.config.ts', 'next-env.d.ts', 'vitest.setup.ts', 'tsconfig.json', 'postcss.config.mjs', 'tailwind.config.ts', 'proxy.ts']) {
    if (existsSync(resolve(frontend, name))) cpSync(resolve(frontend, name), resolve(snapshot, name), { recursive: true });
  }
  symlinkSync(resolve(frontend, 'node_modules'), resolve(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const config = resolve(snapshot, 'next.config.ts');
  writeFileSync(config, readFileSync(config, 'utf8').replace('export default nextConfig;',
    'nextConfig.turbopack = { ...nextConfig.turbopack, root: ' + JSON.stringify(repository) + ' };\nexport default nextConfig;'));
  if (existsSync(resolve(frontend, '.next/cache')))
    cpSync(resolve(frontend, '.next/cache'), resolve(snapshot, '.next/cache'), { recursive: true });
  phase('build');
  await completed(launch(process.execPath, [resolve(frontend, 'node_modules/next/dist/bin/next'), 'build'], snapshot, true));
  phase('artifact');
  await completed(launch(process.execPath, [resolve(frontend, 'tests/e2e/check-artifact.mjs')], snapshot, true), 30_000);
  phase('frontend');
  const next = launch(process.execPath,
    [resolve(frontend, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3201'], snapshot);
  next.once('exit', () => { if (!stopping) void stop(1); });
  await ready('http://127.0.0.1:3201/login', next);
  phase('proxy');
  proxy = createServer((incoming, outgoing) => {
    const path = new URL(incoming.url, 'http://127.0.0.1:3200').pathname;
    const isBackend = path.startsWith('/api/') || path.startsWith('/oauth2/')
      || path.startsWith('/login/oauth2/') || path === '/logout';
    const upstream = request({ hostname: '127.0.0.1', port: isBackend ? 8200 : 3201,
      path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, host: '127.0.0.1:3200' },
    }, response => { outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing); });
    upstream.on('error', () => { outgoing.writeHead(502); outgoing.end('Local upstream unavailable'); });
    incoming.pipe(upstream);
  });
  await new Promise((done, reject) => { proxy.once('error', reject); proxy.listen(3200, '127.0.0.1', done); });
  stage = 'ready';
  record('ready');
  process.stdout.write('Synthetic preview ready: http://127.0.0.1:3200\nSource base: ' + sourceRevision + ' (plus current CM-106 fixture changes)\nSnapshot: ' + runtime + '\n');
} catch {
  process.stderr.write('Preview startup failed at ' + stage + '; metadata: ' + diagnostics + '/startup.json\n');
  await stop(1);
}
