// Removes panels whose component no longer exists, so a deleted dashboard cannot break the build.
// Usage: node prune-orphan-panels.mjs <dashboard-extension dir> <lithium root dir>
//
// A panel file in src/panels/ is an ORPHAN when one of its relative imports does not resolve to a file.
// For every orphan this script:
//   1. moves the panel file to <root>/.stray-panels/orphans/<name>.stray   (nothing is deleted)
//   2. removes its registration from src/index.js and its route / menu entry from config/routes.json
//   3. removes it from tiles-extra.ts (both copies) so the Dashboard Designer no longer tries to embed it
// index.js, routes.json and tiles-extra.ts are copied to <root>/.stray-panels/backup-<time>/ before they change.
import fs from 'node:fs';
import path from 'node:path';

const [extDir, rootDir] = process.argv.slice(2);
if (!extDir || !rootDir) { console.error('usage: node prune-orphan-panels.mjs <dashboard-extension> <root>'); process.exit(2); }

const panelsDir = path.join(extDir, 'src', 'panels');
if (!fs.existsSync(panelsDir)) process.exit(0);

const exists = base0 => { const base = base0.replace(/\.(m?js|jsx)$/, ''); return exists0(base0) || exists0(base); };
const exists0 = base => ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.scss', '/index.ts', '/index.tsx', '/index.js'].some(x => {
  try { return fs.statSync(base + x).isFile(); } catch { return false; }
});

const orphans = []; // { file, name, missing }
for (const f of fs.readdirSync(panelsDir).filter(n => n.endsWith('.panel.ts'))) {
  const src = fs.readFileSync(path.join(panelsDir, f), 'utf8');
  const missing = [];
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    if (!exists(path.resolve(panelsDir, m[1]))) missing.push(m[1]);
  }
  if (missing.length) orphans.push({ file: f, name: f.replace(/\.panel\.ts$/, ''), missing });
}
if (!orphans.length) process.exit(0);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(rootDir, '.stray-panels', 'backup-' + stamp);
let saves = 0;
const save = p => { if (fs.existsSync(p)) { fs.mkdirSync(backup, { recursive: true }); fs.copyFileSync(p, path.join(backup, path.basename(p) + '.' + (++saves) + '.bak')); } };

console.log('   Panels whose component no longer exists (moved out of the build, nothing deleted):');
fs.mkdirSync(path.join(rootDir, '.stray-panels', 'orphans'), { recursive: true });
for (const o of orphans) {
  fs.renameSync(path.join(panelsDir, o.file), path.join(rootDir, '.stray-panels', 'orphans', o.file + '.stray'));
  console.log(`      - src/panels/${o.file}   (missing ${o.missing[0]})`);
}

// 2a. src/index.js: drop each registration block and its registerCustomPanel line(s)
const indexPath = path.join(extDir, 'src', 'index.js');
const removedIds = new Set();
if (fs.existsSync(indexPath)) {
  let js = fs.readFileSync(indexPath, 'utf8'); const before = js;
  for (const o of orphans) {
    const esc = o.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = new RegExp(`(?:export\\s+)?const\\s+(\\w+)\\s*=\\s*\\{[^{}]*\\{[^{}]*import\\(\\s*['"]\\./panels/${esc}\\.panel['"]\\s*\\)[^{}]*\\}[^{}]*\\};?[ \\t]*\\r?\\n?`, 'g');
    const vars = [];
    js = js.replace(block, (_, v) => { vars.push(v); return ''; });
    for (const v of vars) {
      js = js.replace(new RegExp(`window\\.registerCustomPanel\\(\\s*['"]([^'"]+)['"]\\s*,\\s*${v}\\s*\\);?[ \\t]*\\r?\\n?`, 'g'), (_, id) => { removedIds.add(id); return ''; });
    }
    // a plain import line, if the panel was registered the other way
    js = js.replace(new RegExp(`^.*import\\(\\s*['"]\\./panels/${esc}\\.panel['"]\\s*\\).*\\r?\\n`, 'gm'), '');
  }
  if (js !== before) { save(indexPath); fs.writeFileSync(indexPath, js); console.log('      src/index.js: removed ' + [...removedIds].join(', ')); }
}

// 2b. config/routes.json: drop routes and menu entries that point at a removed panel
const routesPath = path.join(extDir, 'config', 'routes.json');
if (fs.existsSync(routesPath) && removedIds.size) {
  try {
    const r = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    const spec = r.spec || r;
    const gone = new Set((spec.routes || []).filter(x => removedIds.has(x.panelId)).map(x => x.path));
    if (gone.size) {
      save(routesPath);
      spec.routes = spec.routes.filter(x => !gone.has(x.path));
      for (const cat of spec.menuRoutes || []) if (Array.isArray(cat.routes)) cat.routes = cat.routes.filter(p => !gone.has(p));
      spec.menuRoutes = (spec.menuRoutes || []).filter(c => !Array.isArray(c.routes) || c.routes.length || c.type !== 'category');
      fs.writeFileSync(routesPath, JSON.stringify(r, null, 2) + '\n');
      console.log('      config/routes.json: removed ' + [...gone].join(', '));
    }
  } catch (e) { console.log('      (routes.json left unchanged: ' + e.message + ')'); }
}

// 3. tiles-extra.ts (source and generated copy): drop tiles whose panel file is gone
const gonePanel = new Set(orphans.map(o => o.name));
for (const p of [path.join(rootDir, 'dashboards', 'dashboard-builder', 'tiles-extra.ts'), path.join(extDir, 'src', 'components', 'dashboard-builder', 'tiles-extra.ts')]) {
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, 'utf8');
  const lines = s.split('\n');
  const dropIds = new Set();
  const keep = lines.filter(l => {
    const m = l.match(/^\s*'([^']+)':\s*\(\)\s*=>\s*import\('\.\.\/\.\.\/panels\/([^']+)\.panel'\)/);
    if (m && gonePanel.has(m[2])) { dropIds.add(m[1]); return false; }
    return true;
  });
  if (!dropIds.size) continue;
  let out = keep.join('\n');
  // fix the trailing comma of the last loader and remove the matching EXTRA_TILES objects
  out = out.replace(/,(\s*\n\};)/, '$1');
  out = out.replace(/(export const EXTRA_TILES: ExtraTile\[\] = )(\[[\s\S]*?\n?\]);/, (all, head, arr) => {
    try { return head + JSON.stringify(JSON.parse(arr).filter(t => !dropIds.has(t.id)), null, 2) + ';'; } catch { return all; }
  });
  save(p); fs.writeFileSync(p, out);
  console.log('      ' + path.relative(rootDir, p) + ': removed ' + [...dropIds].join(', '));
}
console.log('      Backups of changed files: ' + backup);
