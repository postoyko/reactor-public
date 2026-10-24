// Tests for snapshot.mjs (run: node --test scaffold/). No network.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSnapshotStore, validateSnapshot } from './snapshot.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const good = () => ({ kind: 'reactor-data-snapshot', version: 1, taken: '2026-10-24T10:00:00.000Z', designer: 'v1.62.0', calls: [
  { fn: 'getStories', key: '[]', data: { tenant: { stories: { stories: [{ id: 'inc-1' }] } } } },
  { fn: 'getAlerts', key: '[["storyId","inc-1"]]', data: { tenant: { alerts: { columns: [], rows: [] } } } }
] });

test('only snapshots of reads are accepted', () => {
  assert.equal(validateSnapshot(good()).calls.length, 2);
  assert.throws(() => validateSnapshot({ kind: 'x' }), /not a data snapshot/);
  assert.throws(() => validateSnapshot({ ...good(), version: 2 }), /version 1/);
  assert.throws(() => validateSnapshot({ ...good(), calls: [] }), /no recorded answers/);
  assert.throws(() => validateSnapshot({ ...good(), calls: [{ fn: 'activatePolicy', key: '[]', data: {} }] }), /not a read/);
  assert.throws(() => validateSnapshot({ ...good(), calls: [{ fn: 'getX; rm', key: '[]' }] }), /not a read/);
});

test('the store saves privately, describes, serves as a script and removes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-snap-'));
  const store = createSnapshotStore({ rootDir: dir });
  assert.deepEqual(store.info(), { present: false });
  assert.equal(store.script(), 'window.__reactorSnapshot = null;\n');
  const info = store.save(good());
  assert.equal(info.answers, 2);
  assert.deepEqual(info.functions, { getStories: 1, getAlerts: 1 });
  const file = path.join(dir, '.studio', 'data-snapshot.json');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o077, 0, 'only the owner can read it');
  const sandbox = {};
  new Function('window', store.script())(sandbox);
  assert.equal(sandbox.__reactorSnapshot.calls[1].key, '[["storyId","inc-1"]]');
  assert.throws(() => store.save({ kind: 'nope' }), /not a data snapshot/);
  assert.equal(store.info().present, true, 'a bad upload leaves the saved snapshot alone');
  store.remove();
  assert.deepEqual(store.info(), { present: false });
});

test('the Designer and the preview pick answers by the same parameters', () => {
  const list = text => JSON.parse(text.replace(/'/g, '"'));
  const designer = /export const IGNORED = (\[[^\]]*\])/.exec(fs.readFileSync(path.join(here, 'designer/snapshot.ts'), 'utf8'));
  const stub = /var IGNORED = (\[[^\]]*\])/.exec(fs.readFileSync(path.join(here, 'public/preview-stub.js'), 'utf8'));
  assert.ok(designer && stub);
  assert.deepEqual(list(stub[1]), list(designer[1]));
});
