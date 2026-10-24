#!/usr/bin/env node
/**
 * Checks the Dashboard Designer (../scaffold/designer, the master copy): unit tests, type check and lint.
 *
 * The Designer imports from the toolkit (../constants, @carbon/*), so it is checked where it is built: a temporary
 * copy in src/components/__designer_check__, removed afterwards whatever happens. The type check and lint report only
 * on that copy, so problems elsewhere in the toolkit do not count against it.
 *
 *   npm run test:designer      (from dashboard-extension/)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const master = path.resolve(ext, '../scaffold/designer');
const tmpName = '__designer_check__';
const tmp = path.join(ext, 'src/components', tmpName);
const bin = name => path.join(ext, 'node_modules/.bin', name);

if (!fs.existsSync(master)) { console.error(`No Designer at ${master}`); process.exit(1); }

let failed = 0;
const step = (title, fn) => {
  process.stdout.write(`\n▶ ${title}\n`);
  try { const ok = fn(); if (ok === false) { failed++; console.log(`✗ ${title}`); } else console.log(`✓ ${title}`); } catch (e) { failed++; console.log(`✗ ${title}: ${e.message}`); }
};

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
try {
  // the panel file belongs in src/panels/ and imports the toolkit's app shell, so it is not part of this check
  for (const f of fs.readdirSync(master)) {
    const src = path.join(master, f);
    if (fs.statSync(src).isFile() && !f.endsWith('.panel.ts')) fs.copyFileSync(src, path.join(tmp, f));
  }

  step('Unit tests', () => {
    const r = spawnSync(bin('jest'), [`src/components/${tmpName}`, '--colors'], { cwd: ext, stdio: 'inherit', env: { ...process.env, TZ: 'utc' } });
    return r.status === 0;
  });

  step('Type check', () => {
    let out = '';
    try { out = execFileSync(bin('tsc'), ['--noEmit', '--rootDir', '.', '-p', '.'], { cwd: ext, encoding: 'utf8' }); } catch (e) { out = `${e.stdout || ''}${e.stderr || ''}`; }
    // Embedded dashboards are imported from ../../panels/<id>.panel, files that deploy-dashboards.sh puts there; a
    // checkout without them is not a fault in the Designer.
    const mine = out.split('\n').filter(l => l.includes(`${tmpName}/`) && !/TS2307: Cannot find module '\.\.\/\.\.\/panels\//.test(l));
    mine.forEach(l => console.log(l));
    return mine.length === 0;
  });

  step('Lint', () => {
    const r = spawnSync(bin('eslint'), [`src/components/${tmpName}`], { cwd: ext, stdio: 'inherit' });
    return r.status === 0;
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n✗ ${failed} check(s) failed` : '\n✓ Designer checks passed');
process.exit(failed ? 1 : 0);
