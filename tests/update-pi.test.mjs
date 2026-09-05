import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Exercise the real updater in a disposable Git repo with a fake package
// manager. No network, dependency installation, or real checkout mutation.
test('updater preserves dirty work through preview, apply, failure, and dependency-only rollback', () => {
  const home = mkdtempSync(join(tmpdir(), 'carl-updater-test-'));
  try {
    const root = join(home, 'repo');
    const bin = join(home, 'bin');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(bin);
    copyFileSync(new URL('../scripts/update-pi.mjs', import.meta.url), join(root, 'scripts/update-pi.mjs'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: {
      '@earendil-works/pi-coding-agent': '0.84.4', '@earendil-works/pi-tui': '0.84.4',
    } }) + '\n');
    writeFileSync(join(root, 'bun.lock'), 'previous lock\n');
    writeFileSync(join(bin, 'bun'), `#!/bin/sh\nif [ "$1" = install ] && [ "$2" != --frozen-lockfile ]; then echo candidate > bun.lock; fi\nif [ "$1" = run ] && [ "$PWD" = "$FAIL_APPLY_ROOT" ]; then exit 1; fi\nexit 0\n`, { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: home };
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    };
    git('init');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    // Uncommitted infrastructure must survive both upgrade and rollback.
    const dirtyManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    dirtyManifest.scripts = { 'update-pi': 'node scripts/update-pi.mjs' };
    writeFileSync(join(root, 'package.json'), JSON.stringify(dirtyManifest) + '\n');
    writeFileSync(join(root, 'uncommitted-work.txt'), 'keep me\n');
    const original = readFileSync(join(root, 'package.json'), 'utf8');
    const run = (args, extra = {}) => spawnSync(process.execPath, ['scripts/update-pi.mjs', ...args], {
      cwd: root, env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(run(['latest']).status, 1);
    let result = run(['0.85.0']);
    assert.match(result.stdout, /NOT APPLIED/);
    assert.match(result.stdout, /No rollback needed/);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), original);
    result = run(['0.85.0', '--apply'], { FAIL_APPLY_ROOT: realpathSync(root) });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Restored previous manifest/);
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), original);
    assert.equal(readFileSync(join(root, 'bun.lock'), 'utf8'), 'previous lock\n');
    result = run(['0.85.0', '--apply']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies['@earendil-works/pi-tui'], '0.85.0');
    const applied = readFileSync(join(root, 'package.json'), 'utf8');
    writeFileSync(join(root, 'package.json'), applied + ' ');
    result = run(['--rollback']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing to overwrite/);
    writeFileSync(join(root, 'package.json'), applied);
    result = run(['--rollback']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), original);
    assert.equal(readFileSync(join(root, 'bun.lock'), 'utf8'), 'previous lock\n');
    assert.equal(readFileSync(join(root, 'uncommitted-work.txt'), 'utf8'), 'keep me\n');
    assert.equal(run(['--rollback']).status, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
