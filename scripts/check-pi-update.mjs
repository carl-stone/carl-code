#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function stableParts(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected an exact stable version, got ${JSON.stringify(version)}`);
  }
  return version.split('.').map(BigInt);
}

export function selectUpdate(current, latest) {
  const oldParts = stableParts(current);
  const newParts = stableParts(latest);
  for (let i = 0; i < 3; i++) {
    if (newParts[i] > oldParts[i]) return latest;
    if (newParts[i] < oldParts[i]) return null;
  }
  return null;
}

function npmVersion(spec) {
  const result = spawnSync('npm', ['view', spec, 'version', '--json', '--registry=https://registry.npmjs.org'], {
    encoding: 'utf8', timeout: 60_000,
  });
  if (result.error || result.status !== 0) throw new Error(`npm lookup failed for ${spec}: ${result.error?.message ?? result.stderr}`);
  return JSON.parse(result.stdout);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { dependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const current = dependencies['@earendil-works/pi-coding-agent'];
    if (dependencies['@earendil-works/pi-tui'] !== current) throw new Error('Current Pi pins are not synchronized');
    const version = selectUpdate(current, npmVersion('@earendil-works/pi-coding-agent@latest'));
    // Confirm the matching TUI package exists; don't require its dist-tag to have
    // moved yet, since the two packages can be published at different moments.
    if (version && npmVersion(`@earendil-works/pi-tui@${version}`) !== version) {
      throw new Error(`Matching pi-tui ${version} is not available yet`);
    }
    const output = `available=${Boolean(version)}\ncurrent=${current}\nversion=${version ?? ''}\n`;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
    console.log(version ? `New stable Pi: ${current} → ${version}` : `No newer stable Pi release (current: ${current}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
