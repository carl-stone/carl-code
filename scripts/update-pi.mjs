#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = ['package.json', 'bun.lock'];
const packages = ['@earendil-works/pi-coding-agent', '@earendil-works/pi-tui'];
const backupRoot = join(root, '.upgrade-backups');
const pointer = join(backupRoot, 'latest.json');
const args = process.argv.slice(2);
const rollback = args.length === 1 && args[0] === '--rollback';
const [version, ...flags] = args;
if (!rollback && (!/^\d+\.\d+\.\d+$/.test(version ?? '') || flags.some(f => f !== '--apply') || flags.length > 1)) {
  console.error('Usage:\n  bun run update-pi <version>          Preview only; active Pi is unchanged\n  bun run update-pi <version> --apply  Test and install in this checkout\n  bun run update-pi --rollback         Undo the last dependency upgrade only');
  process.exit(1);
}
const apply = flags.includes('--apply');
const scratch = mkdtempSync(join(tmpdir(), 'carl-pi-upgrade-'));
const logPath = join(scratch, 'checks.log');
let log = '';
function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8', timeout: 600_000, maxBuffer: 20 * 1024 * 1024 });
  log += `\n$ ${command} ${commandArgs.join(' ')} (cwd: ${cwd})\n${result.stdout ?? ''}${result.stderr ?? ''}`;
  writeFileSync(logPath, log);
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed. ${result.error?.message ?? ''}\n${log.split('\n').slice(-45).join('\n')}\nFull log: ${logPath}`);
  }
}
function snapshot(directory) {
  return new Map(files.map(name => [name, readFileSync(join(directory, name))]));
}
function save(directory, state) {
  mkdirSync(directory, { recursive: true });
  for (const [name, bytes] of state) writeFileSync(join(directory, name), bytes);
}
function assertUnchanged(expected) {
  for (const [name, bytes] of expected) {
    if (!readFileSync(join(root, name)).equals(bytes)) {
      throw new Error(`${name} changed since the snapshot. Refusing to overwrite it. Your work is untouched; rerun after reviewing the change.`);
    }
  }
}
function installWithRecovery(target, previous) {
  save(root, target);
  try {
    run('bun', ['install', '--frozen-lockfile'], root);
    run('bun', ['run', 'test'], root);
  } catch (error) {
    // Do not clobber an edit made by another process while installation ran.
    assertUnchanged(target);
    save(root, previous);
    console.error('Restored previous manifest and lockfile; restoring dependencies. No Git files were reset.');
    try {
      run('bun', ['install', '--frozen-lockfile'], root);
    } catch (restoreError) {
      throw new Error(`${error.message}\nDependency reinstall also failed; files are restored. Run bun install --frozen-lockfile to repair.\n${restoreError.message}`);
    }
    throw error;
  }
}
try {
  const originals = snapshot(root);
  const current = JSON.parse(originals.get('package.json')).dependencies[packages[0]];
  if (rollback) {
    if (!existsSync(pointer)) throw new Error('No applied upgrade to roll back. Preview runs do not need rollback.');
    const record = JSON.parse(readFileSync(pointer, 'utf8'));
    const backup = join(backupRoot, record.directory);
    const previous = snapshot(join(backup, 'before'));
    assertUnchanged(snapshot(join(backup, 'after')));
    const oldVersion = JSON.parse(previous.get('package.json')).dependencies[packages[0]];
    console.log(`ROLLBACK: Pi ${current} → ${oldVersion}. Restoring only package.json, bun.lock, and installed dependencies—not Git history or source files.`);
    installWithRecovery(previous, originals);
    // Keep the pointer: a second rollback will safely refuse rather than lose history.
    console.log(`Pi ${oldVersion} restored. Source changes and update tools are untouched. Restart Carl Code.\nLog: ${logPath}`);
  } else {
    console.log(`${apply ? 'APPLY' : 'PREVIEW ONLY'}: Pi ${current} → ${version}`);
    console.log(apply ? 'Testing a temporary copy first. Uncommitted work will be preserved.' : `The active checkout will stay on Pi ${current}. Nothing is installed into it.`);
    console.log(`Testing temporary candidate… (details: ${logPath})`);
    const stage = join(scratch, 'candidate');
    cpSync(root, stage, { recursive: true, filter: source => {
      const relative = source.slice(root.length).split(/[\\/]/);
      return !relative.some(part => ['node_modules', '.git', '.pi', '.carl-code', '.upgrade-backups'].includes(part));
    } });
    const manifest = JSON.parse(originals.get('package.json'));
    for (const name of packages) manifest.dependencies[name] = version;
    writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    run('bun', ['install'], stage);
    run('bun', ['install', '--frozen-lockfile'], stage);
    run('bun', ['run', 'test'], stage);
    const candidate = snapshot(stage);
    for (const name of files) {
      const diff = spawnSync('git', ['diff', '--no-index', '--', join(root, name), join(stage, name)], { encoding: 'utf8' });
      if (diff.error || ![0, 1].includes(diff.status)) throw new Error('Could not write candidate diff');
      writeFileSync(join(scratch, `${name}.diff`), diff.stdout);
    }
    console.log(`Candidate checks passed. Dependency diffs and logs: ${scratch}`);
    if (!apply) {
      console.log(`\nNOT APPLIED. Active Pi is still ${current}. No rollback needed.\nTo install: bun run update-pi ${version} --apply\nOptional manual canary: ${stage} (see README.md)`);
    } else {
      assertUnchanged(originals);
      mkdirSync(backupRoot, { recursive: true });
      const backup = mkdtempSync(join(backupRoot, 'upgrade-'));
      save(join(backup, 'before'), originals);
      save(join(backup, 'after'), candidate);
      console.log(`Installing tested Pi ${version} in ${root}…\nDependency backup: ${backup}`);
      installWithRecovery(candidate, originals);
      writeFileSync(pointer, JSON.stringify({ directory: backup.slice(backupRoot.length + 1) }) + '\n');
      console.log(`\nAPPLIED: Pi ${version}. No commits or Git resets. Restart Carl Code to use it.\nUndo this upgrade: bun run update-pi --rollback\nInteractive/provider checks remain a manual canary (README.md).`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
