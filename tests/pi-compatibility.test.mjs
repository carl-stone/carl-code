import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const home = mkdtempSync(join(tmpdir(), 'carl-compat-'));
// Set before importing Pi: no real credentials, settings, sessions, or global skills.
for (const key of Object.keys(process.env)) {
  if (/^(PI_|CARL_|XDG_)/.test(key) || /(?:API_KEY|TOKEN|SECRET|PASSWORD)$/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  HOME: home, CARL_CODE_HOME: join(home, 'carl'),
  PI_CODING_AGENT_DIR: join(home, 'carl', 'agent'),
  PI_CODING_AGENT_SESSION_DIR: join(home, 'carl', 'sessions'),
  PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1',
});
const cwd = join(home, 'project');
mkdirSync(cwd, { recursive: true });
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = manifest.dependencies['@earendil-works/pi-coding-agent'];

test.after(() => rmSync(home, { recursive: true, force: true }));

test('Pi dependencies remain exact and synchronized', () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.dependencies['@earendil-works/pi-tui'], version);
});

function cli(...args) {
  const result = spawnSync(process.execPath, [join(root, 'bin/carl.mjs'), ...args], {
    cwd, env: process.env, encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(result.error);
  return result;
}

test('actual launcher imports, --version, and --help', () => {
  const result = cli('--version');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(version), result.stdout);
  const help = cli('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--version/);
});

test('runtime self-update cannot bypass the controlled upgrade path', () => {
  for (const args of [[], ['--self'], ['--all'], ['--self', '--extensions']]) {
    const result = cli('update', ...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /runtime self-update is disabled/);
  }
});

test('all harness extensions load and reload with identity and tools intact', async () => {
  const { DefaultResourceLoader, SettingsManager, VERSION } = await import('@earendil-works/pi-coding-agent');
  assert.equal(VERSION, version);
  const extensionsDir = join(root, 'packages/harness/extensions');
  const paths = readdirSync(extensionsDir).filter(name => /\.(ts|js)$/.test(name) && !name.endsWith('.d.ts')).map(name => join(extensionsDir, name));
  const loader = new DefaultResourceLoader({
    cwd, agentDir: process.env.PI_CODING_AGENT_DIR,
    settingsManager: SettingsManager.inMemory(), additionalExtensionPaths: paths,
  });
  for (let pass = 0; pass < 2; pass++) {
    await loader.reload();
    const loaded = loader.getExtensions();
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, paths.length);
    const identity = loaded.extensions.find(extension => extension.path.endsWith('carl-identity.ts'));
    assert.ok(identity);
    assert.ok(identity.commands.has('system-prompt'));
    const handlers = identity.handlers.get('before_agent_start');
    assert.equal(handlers.length, 1);
    const tail = '\n\nAvailable tools:\nread: fixture\n\nProject context: fixture';
    const result = await handlers[0]({ systemPrompt: 'Generic coding identity' + tail, systemPromptOptions: { customPrompt: false } }, {});
    assert.match(result.systemPrompt, /^You are Carl Code/);
    assert.ok(result.systemPrompt.endsWith(tail));
    const names = loaded.extensions.flatMap(extension => [...extension.tools.keys()]);
    assert.ok(names.includes('edit'), names.join(', '));
    assert.ok(names.includes('paperclip'), names.join(', '));
  }
});
