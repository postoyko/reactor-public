/**
 * Dashboard versions in git, for the Workbench (Setup > Git, Design > Versions).
 *
 * Only dashboard files are ever staged or committed (DASHBOARD_PATHS): the layouts, their published copies and the
 * small files Publish writes to put a page in the sidebar. Code is never touched. There is no force, rebase, reset,
 * branch switch or history rewrite: commit, push, pull (stopping on a conflict) and reading old versions only.
 *
 * git runs in the repository with the user's own git login; nothing is stored here but two settings in
 * .studio/git.json: the branches Studio may commit to, and whether Publish commits by itself.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

/** What Publish and Save write. Everything else in the repository is out of bounds. */
export const DASHBOARD_PATHS = [
  'dashboards/layouts',
  'dashboards/dashboard-builder/published',
  'dashboards/dashboard-builder/default-layout.ts',
  'dashboards/dashboard-builder/tiles-extra.ts',
  'dashboard-extension/src/panels/layout-*.panel.ts',
  'dashboard-extension/src/index.js',
  'dashboard-extension/config/routes.json',
  'routes.held.json'
];

const SHA_RE = /^[0-9a-f]{7,40}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const BRANCH_RE = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,100}(?<![./])$/;

/** Is this repository path one Studio may commit? (glob only for the generated panel files) */
export function isDashboardPath(p) {
  return DASHBOARD_PATHS.some(s => {
    if (s.includes('*')) {
      const [pre, post] = s.split('*');
      return p.startsWith(pre) && p.endsWith(post) && !p.slice(pre.length, p.length - post.length).includes('/');
    }
    return p === s || p.startsWith(s + '/');
  });
}

/** Parses `git status --porcelain=v1 -z`: [{ path, code }] (renames report the new path). */
export function parseStatus(z) {
  const out = [];
  const parts = String(z || '').split('\0');
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const code = e.slice(0, 2);
    out.push({ path: e.slice(3), code });
    if (code[0] === 'R' || code[0] === 'C') i++; // the original path follows
  }
  return out;
}

const describe = code => (code === '??' ? 'new' : code.includes('D') ? 'deleted' : code.includes('A') ? 'new' : code.includes('R') ? 'renamed' : 'changed');

/** The layout a changed file belongs to, for display. */
export function slugOf(p) {
  const m = /^dashboards\/layouts\/([a-z0-9][a-z0-9-]*)\.json$/.exec(p) || /^dashboards\/dashboard-builder\/published\/([a-z0-9][a-z0-9-]*)\.ts$/.exec(p);
  return m ? m[1] : null;
}

/** Parses the log format used by history(): sha, ISO date, author, subject, separated by \x1f, one per line. */
export function parseLog(text) {
  return String(text || '').split('\n').filter(Boolean).map(l => {
    const [sha, date, author, subject] = l.split('\x1f');
    return { sha, date, author, subject };
  });
}

export function createGit({ rootDir }) {
  const settingsFile = path.join(rootDir, '.studio', 'git.json');

  const run = (args, opts = {}) => new Promise(resolve => {
    execFile('git', args, { cwd: rootDir, maxBuffer: 32 * 1024 * 1024, timeout: opts.timeout || 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') });
    });
  });
  const must = async (args, opts) => {
    const r = await run(args, opts);
    if (!r.ok) throw new Error((r.err || r.out).trim().split('\n').slice(-6).join('\n') || `git ${args[0]} failed`);
    return r.out;
  };

  function readSettings() {
    try { const o = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); return { allowedBranches: Array.isArray(o.allowedBranches) ? o.allowedBranches.filter(b => BRANCH_RE.test(b)) : null, autoCommit: o.autoCommit === true }; }
    catch (e) { return { allowedBranches: null, autoCommit: false }; }
  }
  function writeSettings(s) {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2));
  }

  async function isRepo() { const r = await run(['rev-parse', '--is-inside-work-tree']); return r.ok && r.out.trim() === 'true'; }
  async function branch() { const r = await run(['symbolic-ref', '--quiet', '--short', 'HEAD']); return r.ok ? r.out.trim() : null; }
  /** A merge, rebase or cherry-pick left half done: Studio does nothing until it is finished in a terminal. */
  async function busy() {
    const gitDir = (await must(['rev-parse', '--absolute-git-dir'])).trim();
    return ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply'].find(f => fs.existsSync(path.join(gitDir, f))) || null;
  }
  /** The branches Studio may commit to. Until someone sets them, the branch checked out the first time Git is used. */
  async function allowed(settings, b) {
    if (settings.allowedBranches === null) {
      settings.allowedBranches = b ? [b] : [];
      writeSettings(settings);
    }
    return Boolean(b) && settings.allowedBranches.includes(b);
  }

  async function changes() {
    const out = await must(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...DASHBOARD_PATHS]);
    return parseStatus(out).filter(x => isDashboardPath(x.path)).map(x => ({ path: x.path, change: describe(x.code), slug: slugOf(x.path) }));
  }

  async function status() {
    if (!(await isRepo())) return { repo: false };
    const settings = readSettings();
    const b = await branch();
    const ok = await allowed(settings, b);
    const remote = (await run(['remote', 'get-url', 'origin'])).out.trim() || null;
    const upstream = (await run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).out.trim() || null;
    let ahead = 0, behind = 0;
    if (upstream) {
      const r = await run(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
      if (r.ok) [ahead, behind] = r.out.trim().split(/\s+/).map(Number);
    }
    return {
      repo: true, root: rootDir, branch: b, remote, upstream, ahead, behind,
      author: { name: (await run(['config', 'user.name'])).out.trim(), email: (await run(['config', 'user.email'])).out.trim() },
      settings, branchAllowed: ok, busy: await busy(), changes: await changes()
    };
  }

  async function saveSettings(body) {
    const s = readSettings();
    if (Array.isArray(body.allowedBranches)) {
      const bad = body.allowedBranches.filter(b => !BRANCH_RE.test(b));
      if (bad.length) throw new Error(`Not a branch name: ${bad.join(', ')}`);
      s.allowedBranches = body.allowedBranches.slice(0, 20);
    }
    if (typeof body.autoCommit === 'boolean') s.autoCommit = body.autoCommit;
    writeSettings(s);
    // the author is git's own setting, for this repository only
    if (typeof body.name === 'string' && body.name.trim()) await must(['config', 'user.name', body.name.trim().slice(0, 100)]);
    if (typeof body.email === 'string' && body.email.trim()) {
      if (!/^[^\s@]+@[^\s@]+$/.test(body.email.trim())) throw new Error('That is not an email address.');
      await must(['config', 'user.email', body.email.trim().slice(0, 200)]);
    }
    return status();
  }

  async function guard() {
    if (!(await isRepo())) throw new Error('This folder is not a git repository.');
    const why = await busy();
    if (why) throw new Error(`git is in the middle of a ${/REBASE|rebase/.test(why) ? 'rebase' : /CHERRY/.test(why) ? 'cherry-pick' : 'merge'}. Finish or abort it in a terminal first.`);
    const b = await branch();
    if (!b) throw new Error('No branch is checked out (detached HEAD). Check out a branch in a terminal first.');
    if (!(await allowed(readSettings(), b))) throw new Error(`Studio may not commit to “${b}”. Add it under Setup > Git > Allowed branches, or check out an allowed branch.`);
    return b;
  }

  /** Commits the dashboard files that changed, and nothing else (files staged by hand elsewhere stay staged, uncommitted). */
  async function commit(message) {
    const msg = String(message || '').trim().slice(0, 500);
    if (!msg) throw new Error('Write a message that says what changed.');
    const b = await guard();
    const list = await changes();
    if (!list.length) return { committed: false, branch: b, files: [] };
    const files = list.map(x => x.path);
    await must(['add', '-A', '--', ...files]);
    await must(['commit', '--only', '-m', msg, '--', ...files]);
    const sha = (await must(['rev-parse', '--short', 'HEAD'])).trim();
    return { committed: true, sha, branch: b, files };
  }

  async function push() {
    const b = await guard();
    const upstream = (await run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).out.trim();
    await must(upstream ? ['push', 'origin', `HEAD:${b}`] : ['push', '-u', 'origin', b], { timeout: 120000 });
    return { pushed: true, branch: b };
  }

  /** Brings in the remote branch: fast-forward when possible, else a merge commit; on a conflict, undoes the merge and says which files. */
  async function pull() {
    const b = await guard();
    await must(['fetch', 'origin', b], { timeout: 120000 });
    const ff = await run(['merge', '--ff-only', `origin/${b}`]);
    if (ff.ok) return { pulled: true, merged: false, branch: b, note: ff.out.includes('Already up to date') ? 'Already up to date.' : 'Up to date with the remote.' };
    const m = await run(['merge', '--no-edit', `origin/${b}`]);
    if (m.ok) return { pulled: true, merged: true, branch: b, note: 'Merged the remote changes.' };
    const conflicts = (await run(['diff', '--name-only', '--diff-filter=U'])).out.trim().split('\n').filter(Boolean);
    await run(['merge', '--abort']);
    if (conflicts.length) throw new Error(`Not pulled: the remote changed the same files (${conflicts.join(', ')}). Nothing was changed here. Resolve it in a terminal (git pull), or ask whoever changed them.`);
    throw new Error(`Not pulled: ${(m.err || ff.err).trim().split('\n').slice(-4).join(' ')}`);
  }

  async function history(slug, limit = 50) {
    if (!SLUG_RE.test(String(slug || ''))) throw new Error('Bad dashboard name.');
    if (!(await isRepo())) return [];
    const out = await must(['log', `-n${Math.min(Math.max(limit, 1), 200)}`, '--follow', '--format=%h%x1f%aI%x1f%an%x1f%s', '--', `dashboards/layouts/${slug}.json`]);
    return parseLog(out);
  }

  /** The layout file as it was in one commit (the caller sanitizes it before anyone sees it). */
  async function version(slug, sha) {
    if (!SLUG_RE.test(String(slug || ''))) throw new Error('Bad dashboard name.');
    if (!SHA_RE.test(String(sha || ''))) throw new Error('Bad version id.');
    const r = await run(['show', `${sha}:dashboards/layouts/${slug}.json`]);
    if (!r.ok) throw new Error('That version of the dashboard is not in this repository.');
    return JSON.parse(r.out);
  }

  return { status, saveSettings, commit, push, pull, history, version, readSettings, changes };
}
