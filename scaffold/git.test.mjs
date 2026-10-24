// Tests for git.mjs against throwaway repositories (run: node --test scaffold/). No network: the "remote" is a bare
// repository on disk.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createGit, isDashboardPath, parseStatus, slugOf } from './git.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const layout = (name, n = 1) => JSON.stringify({ kind: 'concert-dashboard', dashboard: { id: 'd1', name, widgets: Array.from({ length: n }, (_, i) => ({ id: `w${i}` })) } });

/** A repository with one commit, cloned from a bare "origin", on branch main. */
function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-git-'));
  const origin = path.join(base, 'origin.git');
  sh(base, 'init', '--bare', '-b', 'main', origin);
  const make = name => {
    const dir = path.join(base, name);
    sh(base, 'clone', '-q', origin, dir);
    sh(dir, 'config', 'user.name', name); sh(dir, 'config', 'user.email', `${name}@example.com`);
    sh(dir, 'checkout', '-q', '-B', 'main');
    return dir;
  };
  const a = make('a');
  write(a, 'README.md', 'x\n'); write(a, '.gitignore', '.studio/\n'); write(a, 'dashboards/layouts/ops.json', layout('Ops'));
  sh(a, 'add', '-A'); sh(a, 'commit', '-qm', 'start'); sh(a, 'push', '-q', '-u', 'origin', 'main');
  return { base, origin, a, make };
}

test('only dashboard files count', () => {
  assert.ok(isDashboardPath('dashboards/layouts/ops.json'));
  assert.ok(isDashboardPath('dashboards/layouts/.published.json'));
  assert.ok(isDashboardPath('dashboards/dashboard-builder/published/ops.ts'));
  assert.ok(isDashboardPath('dashboard-extension/src/panels/layout-ops.panel.ts'));
  assert.ok(isDashboardPath('dashboard-extension/config/routes.json'));
  assert.ok(!isDashboardPath('dashboard-extension/src/panels/incident.panel.ts'));
  assert.ok(!isDashboardPath('dashboard-extension/src/panels/sub/layout-x.panel.ts'));
  assert.ok(!isDashboardPath('dashboards/dashboard-builder/DashboardBuilder.tsx'));
  assert.ok(!isDashboardPath('dashboards/layouts-old/x.json'));
  assert.ok(!isDashboardPath('scaffold/server.mjs'));
  assert.equal(slugOf('dashboards/layouts/ops-2.json'), 'ops-2');
  assert.equal(slugOf('dashboards/dashboard-builder/published/ops.ts'), 'ops');
  assert.deepEqual(parseStatus(' M a.json\0R  new.json\0old.json\0?? b.json\0'), [{ path: 'a.json', code: ' M' }, { path: 'new.json', code: 'R ' }, { path: 'b.json', code: '??' }]);
});

test('commit takes the dashboard files and leaves code alone, even code staged by hand', async () => {
  const { a } = setup();
  const git = createGit({ rootDir: a });
  write(a, 'dashboards/layouts/ops.json', layout('Ops', 2));
  write(a, 'dashboards/layouts/new.json', layout('New'));
  write(a, 'dashboard-extension/src/panels/layout-new.panel.ts', 'x');
  write(a, 'README.md', 'changed\n'); sh(a, 'add', 'README.md');
  write(a, 'scaffold/server.mjs', 'code');
  const st = await git.status();
  assert.equal(st.branch, 'main');
  assert.equal(st.branchAllowed, true, 'the first branch seen becomes the allowed one');
  assert.deepEqual(st.changes.map(c => c.path).sort(), ['dashboard-extension/src/panels/layout-new.panel.ts', 'dashboards/layouts/new.json', 'dashboards/layouts/ops.json']);
  const r = await git.commit('Update ops');
  assert.equal(r.committed, true);
  assert.deepEqual(sh(a, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort(), ['dashboard-extension/src/panels/layout-new.panel.ts', 'dashboards/layouts/new.json', 'dashboards/layouts/ops.json']);
  assert.match(sh(a, 'status', '--porcelain'), /^M {2}README\.md$/m, 'the hand-staged file is still staged and not committed');
  assert.match(sh(a, 'status', '--porcelain'), /\?\? scaffold\//);
  assert.deepEqual((await git.commit('again')).committed, false);
  await assert.rejects(git.commit('  '), /message/);
});

test('commit refuses a branch that is not allowed, and a merge in progress', async () => {
  const { a } = setup();
  const git = createGit({ rootDir: a });
  await git.status(); // allows main
  sh(a, 'checkout', '-q', '-b', 'experiment');
  write(a, 'dashboards/layouts/ops.json', layout('Ops', 3));
  await assert.rejects(git.commit('x'), /may not commit to “experiment”/);
  await git.saveSettings({ allowedBranches: ['main', 'experiment'] });
  assert.equal((await git.commit('x')).committed, true);
  await assert.rejects(git.saveSettings({ allowedBranches: ['bad..name'] }), /Not a branch name/);
  fs.writeFileSync(path.join(a, '.git', 'MERGE_HEAD'), sh(a, 'rev-parse', 'HEAD'));
  write(a, 'dashboards/layouts/ops.json', layout('Ops', 4));
  await assert.rejects(git.commit('y'), /middle of a merge/);
});

test('push, then pull fast-forwards another copy; a conflicting pull changes nothing', async () => {
  const { a, make } = setup();
  const b = make('b');
  const ga = createGit({ rootDir: a }), gb = createGit({ rootDir: b });
  write(a, 'dashboards/layouts/ops.json', layout('Ops from a', 2));
  await ga.commit('a edits'); await ga.push();
  const p = await gb.pull();
  assert.equal(p.pulled, true);
  assert.match(fs.readFileSync(path.join(b, 'dashboards/layouts/ops.json'), 'utf8'), /Ops from a/);
  // both change the same dashboard
  write(a, 'dashboards/layouts/ops.json', layout('Ops a2')); await ga.commit('a2'); await ga.push();
  write(b, 'dashboards/layouts/ops.json', layout('Ops b2')); await gb.commit('b2');
  const before = sh(b, 'rev-parse', 'HEAD');
  await assert.rejects(gb.pull(), /changed the same files \(dashboards\/layouts\/ops\.json\)/);
  assert.equal(sh(b, 'rev-parse', 'HEAD'), before);
  assert.equal(sh(b, 'status', '--porcelain'), '');
  assert.match(fs.readFileSync(path.join(b, 'dashboards/layouts/ops.json'), 'utf8'), /Ops b2/);
});

test('history lists versions and an old version can be read back', async () => {
  const { a } = setup();
  const git = createGit({ rootDir: a });
  write(a, 'dashboards/layouts/ops.json', layout('Ops v2', 2)); await git.commit('second');
  const h = await git.history('ops');
  assert.deepEqual(h.map(v => v.subject), ['second', 'start']);
  assert.equal((await git.version('ops', h[1].sha)).dashboard.name, 'Ops');
  await assert.rejects(git.version('ops', 'HEAD~1'), /Bad version id/);
  await assert.rejects(git.version('../x', h[0].sha), /Bad dashboard name/);
  await assert.rejects(git.history('Ops; rm -rf /'), /Bad dashboard name/);
});

test('outside a repository it says so and does nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-nogit-'));
  const git = createGit({ rootDir: dir });
  assert.deepEqual(await git.status(), { repo: false });
  await assert.rejects(git.commit('x'), /not a git repository/);
});
