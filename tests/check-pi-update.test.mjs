import test from 'node:test';
import assert from 'node:assert/strict';
import { selectUpdate } from '../scripts/check-pi-update.mjs';

test('automatic Pi selection accepts only strictly newer stable releases', () => {
  assert.equal(selectUpdate('0.85.1', '0.85.2'), '0.85.2');
  assert.equal(selectUpdate('0.85.9', '0.85.10'), '0.85.10');
  assert.equal(selectUpdate('0.85.1', '0.86.0'), '0.86.0');
  assert.equal(selectUpdate('0.85.1', '1.0.0'), '1.0.0');
  assert.equal(selectUpdate('0.85.1', '0.85.1'), null);
  assert.equal(selectUpdate('0.85.1', '0.84.9'), null);
  assert.equal(selectUpdate('1.0.0', '0.99.9'), null);
  for (const invalid of ['0.86.0-rc.1', '0.86.0+build', '^0.86.0', 'latest', 'v0.86.0', '00.86.0', '', null, ['0.86.0'], '0.86.0\nINJECT=value']) {
    assert.throws(() => selectUpdate('0.85.1', invalid), /exact stable version/);
  }
  assert.throws(() => selectUpdate('^0.85.1', '0.86.0'), /exact stable version/);
});
