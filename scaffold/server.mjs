/**
 * Concert Workbench Backend Server
 * Controls routes, code generation, folder sync, and live deployment streaming.
 */

import { buildReport } from './report.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawn, execFile } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';
import { sanitizeDashboard, exportJson, FILE_KIND, TILES, registerExtraTiles } from './public/designer-core.js';
import { buildPreview, previewStatus } from './preview.mjs';
import { readSettings, configTransform, configProblem } from './config.mjs';
import { analyze as splitAnalyze, transform as splitTransform, loadTS, setCatalogSource, MARKER as SPLIT_MARKER } from './split.mjs';
import { readCatalog } from './catalog.mjs';
import { createTopology } from './topology.mjs';
import { createGit } from './git.mjs';
import { createSnapshotStore, MAX_SNAPSHOT_BYTES } from './snapshot.mjs';
import { generateCustomComposedDashboard, generateCustomSCSS, generatePanelTS } from './templates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT_DIR, 'dashboard-extension');
const DEFAULT_BUNDLE = 'bundles/alerts-examples/files/alerts-examples-bundle.js';
/** A route with a panel but no bundlePath (and no regions) makes Concert Operate fail when the page is opened: give it the toolkit bundle. Returns how many were fixed. */
function fixRoutes(list) {
  let n = 0;
  (list || []).forEach(r => { if (r && typeof r === 'object' && r.panelId && !r.bundlePath && !r.regions && !r.aiopsPanel) { r.bundlePath = DEFAULT_BUNDLE; n++; } });
  return n;
}
function repairRoutesFile() {
  try {
    const f = path.join(EXT_DIR, 'config', 'routes.json');
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const n = fixRoutes(j.spec && j.spec.routes);
    if (n) { fs.writeFileSync(f, JSON.stringify(j, null, 2)); console.log(`Routes: added the missing bundlePath to ${n} route(s) in config/routes.json.`); }
    return n;
  } catch (e) { return 0; }
}
const DASHBOARDS_DIR = path.join(ROOT_DIR, 'dashboards');
const PORT = process.env.PORT || 4000;
let deploying = false;
const git = createGit({ rootDir: ROOT_DIR });
const snapshots = createSnapshotStore({ rootDir: ROOT_DIR });
const topology = createTopology({ rootDir: ROOT_DIR, runTool: (c, a) => runTool(c, a) });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Simple Router
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Read-only version check for deployed panels ("a new version is available"). Returns only a version string, so it is
  // the one route open to other origins (a Concert Operate page calling http://127.0.0.1). Everything else stays locked.
  const pv = /^\/api\/panel-version\/([a-z0-9-]+)$/.exec(url.pathname);
  if (pv && (req.method === 'GET' || req.method === 'OPTIONS')) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Methods': 'GET', 'Cache-Control': 'no-store' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let version = null;
    try { const m = /VERSION\s*=\s*'(v?\d+\.\d+\.\d+)'/.exec(fs.readFileSync(path.join(DASHBOARDS_DIR, pv[1], 'version.ts'), 'utf8')); version = m ? m[1] : null; } catch (e) { /* no such dashboard */ }
    res.writeHead(version ? 200 : 404, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ dashboard: pv[1], version }));
  }

  // Read-only topology proxy for dashboards running in Concert Operate. Open only to the origins listed in Studio (plus Studio itself);
  // GET only, and only an allow-list of paths. The topology credentials stay inside Studio.
  const tp = /^\/api\/topology(\/.*)$/.exec(url.pathname);
  if (tp && (req.method === 'GET' || req.method === 'OPTIONS')) {
    const reqOrigin = req.headers.origin, studioHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
    const hostOk = studioHosts.includes(String(req.headers.host || ''));
    const allowed = !reqOrigin || studioHosts.some(h => reqOrigin === `http://${h}`) || topology.cfg().origins.includes(reqOrigin);
    const cors = reqOrigin && allowed ? { 'Access-Control-Allow-Origin': reqOrigin, 'Vary': 'Origin', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Accept, X-TenantID' } : {};
    if (!hostOk || !allowed) { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Origin not allowed. Add it under Studio, Topology proxy, Allowed origins.' })); }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const r = await topology.get(tp[1], url.search);
    res.writeHead(r.status, { ...cors, 'Content-Type': r.type || 'application/json', 'Cache-Control': 'no-store' });
    return res.end(r.body);
  }

  // Only this page may talk to the server. The server can write files and run the deploy, so a page open in
  // another browser tab must not be able to call it (no wildcard CORS, and Host/Origin are checked).
  const host = String(req.headers.host || '');
  const origin = req.headers.origin;
  const okHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  if (!okHosts.includes(host) || (origin && !okHosts.some(h => origin === `http://${h}`))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  // 1. Static Files (Public)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end(html);
  }

  // 1b. The Layout Editor's scripts (an explicit allow-list, nothing else in public/ is served)
  if (req.method === 'GET' && (url.pathname === '/designer-core.js' || url.pathname === '/layout-editor.js' || url.pathname === '/settings-form.js' || url.pathname === '/preview-stub.js')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', url.pathname.slice(1))));
  }

  // 1c. Live preview of a dashboard tile (real component, sample data; see preview.mjs)
  if (url.pathname === '/api/preview/status' && req.method === 'GET') return sendJSON(res, 200, previewStatus(EXT_DIR));
  // Real data for Design (Setup): a data snapshot recorded in Concert Operate, served to the preview instead of sample data
  if (url.pathname === '/preview-snapshot.js' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(snapshots.script());
  }
  if (url.pathname === '/api/snapshot' && req.method === 'GET') return sendJSON(res, 200, snapshots.info());
  if (url.pathname === '/api/snapshot' && req.method === 'POST') {
    const body = await readJSONBody(req, MAX_SNAPSHOT_BYTES);
    try { return sendJSON(res, 200, snapshots.save(body)); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/snapshot/delete' && req.method === 'POST') return sendJSON(res, 200, snapshots.remove());
  const pvw = req.method === 'GET' && /^\/preview\/(_widget|_designer|[A-Za-z0-9][A-Za-z0-9._-]*)\.(html|js|css)$/.exec(url.pathname);
  if (pvw) {
    const fail = (code, msg) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(msg); };
    try {
      if (pvw[2] === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/preview/${pvw[1]}.css"><style>html,body{margin:0;height:100%;overflow:hidden;background:var(--cds-background,#f4f4f4)}#root{height:100%;overflow:auto}</style></head><body><div id="root"></div><script src="/preview-snapshot.js"></script><script src="/preview-stub.js"></script><script src="/preview/${pvw[1]}.js" onerror="parent.postMessage({type:\'fail\'},\'*\')"></script></body></html>`);
      }
      const out = pvw[1] === '_designer'
        ? await buildPreview({ extDir: EXT_DIR, dashboardsDir: DASHBOARDS_DIR, dir: DESIGNER_ID, file: 'DashboardBuilder.tsx', designer: true })
        : pvw[1] === '_widget'
        ? await buildPreview({ extDir: EXT_DIR, dashboardsDir: DASHBOARDS_DIR, dir: DESIGNER_ID, file: 'Widgets.tsx', widget: true })
        : await (async () => { const c = pickComponent(pvw[1]); return buildPreview({ extDir: EXT_DIR, dashboardsDir: DASHBOARDS_DIR, dir: c.dir, file: c.file, component: c.settings.component }); })();
      res.writeHead(200, { 'Content-Type': pvw[2] === 'js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(pvw[2] === 'js' ? out.js : out.css);
    } catch (e) { return fail(e.code === 'missing' ? 424 : 500, String(e.message || e)); }
  }

  // 2. Health & Cluster Status
  if (url.pathname === '/api/cluster/status' && req.method === 'GET') {
    const status = await checkClusterHealth();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(status));
  }

  // 3. Get Dashboards & Routes
  if (url.pathname === '/api/dashboards' && req.method === 'GET') {
    const routesConfig = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'config', 'routes.json'), 'utf8'));
    const localDashboards = fs.existsSync(DASHBOARDS_DIR) ? fs.readdirSync(DASHBOARDS_DIR) : [];
    const protectedList = readProtect();
    const panels = {};
    const held = readHeld();
    [...(routesConfig.spec.routes || []), ...held].forEach(r => {
      const pid = routePanelId(r), file = pid ? panelFileFor(pid) : null;
      panels[r.path] = { panelFile: file, protected: Boolean(file && protectedList.includes(file)) };
    });
    // Where a route opens in Concert Operate: only the public address and tenant id, never the credentials in target.json.
    const target = readTarget();
    const launch = target && target.url && target.tenantId ? { base: String(target.url).replace(/\/+$/, ''), tenantId: String(target.tenantId) } : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ routesConfig, localDashboards, panels, allPanels: scanPanels(), published: readPublished(), protectFile: 'deploy.protect', launch, held }));
  }

  // 4. Save Routes
  if (url.pathname === '/api/routes' && req.method === 'POST') {
    const body = await readJSONBody(req);
    if (!body || !body.spec) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid spec' }));
    }

    // `held` (routes kept in Studio but not deployed) is stored apart from routes.json, which is what the deploy scripts push.
    const { held, ...toDeploy } = body;
    fixRoutes(toDeploy.spec && toDeploy.spec.routes); if (Array.isArray(held)) fixRoutes(held);
    fs.writeFileSync(path.join(EXT_DIR, 'config', 'routes.json'), JSON.stringify(toDeploy, null, 2));
    if (Array.isArray(held)) writeHeld(held);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // 4b. Protect / unprotect a panel file (saved immediately; deploy-dashboards.sh reads deploy.protect)
  if (url.pathname === '/api/protect' && req.method === 'POST') {
    const body = await readJSONBody(req);
    if (!body || typeof body.panelFile !== 'string' || !PANEL_FILE_RE.test(body.panelFile) || typeof body.protected !== 'boolean') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Expected { panelFile: "<name>.panel.ts", protected: true|false }.' }));
    }
    try {
      const cur = readProtect().filter(f => f !== body.panelFile);
      writeProtect(body.protected ? [...cur, body.panelFile] : cur);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, protected: readProtect() }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 4b2. Rename a non-standard panel file (e.g. alerts-timeline-panel.ts) to <id>.panel.ts and fix its import in src/index.js
  if (url.pathname === '/api/panels/rename' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...renamePanelFile(body && body.panelFile) }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }

  // 4c. Layout Editor: saved layouts live in dashboards/layouts/<slug>.json (same file format the Designer exports)
  if (url.pathname === '/api/layouts' && req.method === 'GET') {
    return sendJSON(res, 200, { layouts: listLayouts(), defaultSlug: readDefaultSlug(), designerInstalled: designerSourceExists() });
  }
  if (url.pathname.startsWith('/api/layouts/') && req.method === 'GET') {
    const slug = decodeURIComponent(url.pathname.slice('/api/layouts/'.length));
    const d = readLayout(slug);
    return d ? sendJSON(res, 200, { slug, dashboard: d }) : sendJSON(res, 404, { error: 'No such layout.' });
  }
  if (url.pathname === '/api/layouts' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...saveLayout(body) }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/layouts/delete' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { deleteLayout(body.slug); return sendJSON(res, 200, { ok: true }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/layouts/publish' && req.method === 'POST') {
    const body = await readJSONBody(req);
    let out;
    try { out = publishLayout(body.slug); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
    // Setup > Git > "Commit when I publish": a failed commit never undoes the publish, it is only reported
    let gitCommit = null;
    if (git.readSettings().autoCommit) {
      try { const d = readLayout(body.slug); gitCommit = await git.commit(`Publish dashboard “${d ? d.name : body.slug}”`); }
      catch (e) { gitCommit = { committed: false, error: e.message }; }
    }
    return sendJSON(res, 200, { ok: true, ...out, git: gitCommit });
  }

  // 4d. Dashboard versions in git (Setup > Git, Design > Versions). Only dashboard files are ever committed: see git.mjs.
  if (url.pathname === '/api/git/status' && req.method === 'GET') {
    try { return sendJSON(res, 200, await git.status()); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname.startsWith('/api/git/') && req.method === 'POST') {
    const body = await readJSONBody(req);
    const op = url.pathname.slice('/api/git/'.length);
    try {
      if (op === 'settings') return sendJSON(res, 200, await git.saveSettings(body || {}));
      if (op === 'commit') return sendJSON(res, 200, await git.commit(body && body.message));
      if (op === 'push') return sendJSON(res, 200, await git.push());
      if (op === 'pull') return sendJSON(res, 200, await git.pull());
      if (op === 'history') return sendJSON(res, 200, { versions: await git.history(body && body.slug) });
      if (op === 'version') {
        const raw = await git.version(body && body.slug, body && body.sha);
        syncTiles();
        const v = sanitizeDashboard(raw && raw.kind === FILE_KIND ? raw.dashboard : raw);
        if (!v) throw new Error('That version is not a dashboard this Designer can read.');
        return sendJSON(res, 200, { dashboard: v.dashboard, dropped: v.dropped });
      }
      return sendJSON(res, 404, { error: 'Unknown git action.' });
    } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/layouts/unpublish' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { unpublishLayout(body.slug); return sendJSON(res, 200, { ok: true }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/image/convert' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...(await convertImageToPng(body)) }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  // Make hand-written dashboards splittable into tiles (see split.mjs)
  if (url.pathname === '/api/split/list' && req.method === 'GET') {
    try { return sendJSON(res, 200, splitList()); } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (url.pathname === '/api/split/report' && req.method === 'GET') {
    const d = url.searchParams.get('dir');
    try {
      if (!dirOk(d)) throw new Error('Unknown dashboard folder.');
      const ts = loadTS(EXT_DIR);
      if (!ts) throw new Error('TypeScript was not found in dashboard-extension/node_modules (run npm install there).');
      return sendJSON(res, 200, buildReport(path.join(DASHBOARDS_DIR, d), splitInspect(ts, d)));
    } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/contract' && req.method === 'GET') {
    try { res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'inline; filename="DASHBOARD-CONTRACT.md"' }); return res.end(fs.readFileSync(path.join(__dirname, 'DASHBOARD-CONTRACT.md'), 'utf8')); }
    catch (e) { return sendJSON(res, 404, { error: 'The contract file is missing.' }); }
  }
  if (url.pathname === '/api/split/parts' && req.method === 'GET') {
    return sendJSON(res, 200, splitParts());
  }
  if (url.pathname === '/api/split/apply' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...splitApply(body && body.dir) }); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/split/undo' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...splitUndo(body && body.dir) }); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  // Editable settings of a dashboard (props + hard-coded constants), read from its source (see config.mjs)
  if (url.pathname === '/api/settings' && req.method === 'GET') {
    try { return sendJSON(res, 200, settingsFor(url.searchParams.get('tile'))); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/config/apply' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...configApply(body && body.tile, body && body.names) }); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/config/undo' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...configUndo(body && body.tile) }); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/tiles' && req.method === 'GET') {
    syncTiles();
    // why a panel on disk is not offered as a tile, so the Layout Editor can say so instead of "not registered"
    let skipped = {};
    try {
      scanPanels().forEach(p => {
        if (TILES.some(t => t.id === p.id)) return;
        skipped[p.id] = !p.valid ? `the file name must look like name.panel.ts (it is ${p.panelFile})`
          : !p.registered ? `src/panels/${p.panelFile} exists but src/index.js has no import('./panels/${p.id}...') line for it. Register it from the Pages tab (or re-run Build & Deploy) first`
          : 'it is not eligible as a tile (reserved name)';
      });
    } catch (e) { skipped = {}; }
    return sendJSON(res, 200, { tiles: TILES, skipped });
  }
  if (url.pathname === '/api/topology-config' && req.method === 'GET') return sendJSON(res, 200, topology.publicConfig());
  if (url.pathname === '/api/topology-config' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, topology.save(body || {})); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/topology-config/from-oc' && req.method === 'POST') {
    try { return sendJSON(res, 200, await topology.fromOc()); } catch (e) { return sendJSON(res, 400, { error: `Could not read the secret with oc: ${e.message}` }); }
  }
  if (url.pathname === '/api/topology-config/test' && req.method === 'POST') return sendJSON(res, 200, await topology.test());
  if (url.pathname === '/api/bundled/list' && req.method === 'GET') return sendJSON(res, 200, { rows: bundledList() });
  if (url.pathname === '/api/bundled/install' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...bundledInstall(body && body.dir) }); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/panels/route' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...addRouteForPanel(body.panelFile) }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname === '/api/layouts/default' && req.method === 'POST') {
    const body = await readJSONBody(req);
    try { return sendJSON(res, 200, { ok: true, ...setDefaultLayout(body.slug) }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }

  // 5. Scaffold New Dashboard
  if (url.pathname === '/api/scaffold' && req.method === 'POST') {
    const config = await readJSONBody(req);
    const { id, title } = config;
    if (!id || !title) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing id or title' }));
    }
    if (Array.isArray(config.components) && config.components.some(c => c && typeof c.type === 'string' && c.type.startsWith('widget:')) && !designerSourceExists()) {
      return sendJSON(res, 400, { error: 'Designer widgets need the Dashboard Designer. Install it in the Setup tab first, then generate again.' });
    }
    // The id becomes a folder name, a file name and part of generated code, so it must be a plain slug.
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,48}$/.test(id) || typeof title !== 'string' || title.length > 120) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'The route slug must start with a letter and use only lowercase letters, digits and dashes (2-49 characters). The title must be under 120 characters.' }));
    }

    try {
      scaffoldDashboard(id, title, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 5b. Dashboard Designer: status and install
  if (url.pathname === '/api/designer/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(designerStatus()));
  }
  if (url.pathname === '/api/designer/install' && req.method === 'POST') {
    try {
      const r = installDesigner();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, ...r, status: designerStatus() }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 6. External Sync Folder
  if (url.pathname === '/api/sync' && req.method === 'POST') {
    const { sourcePath } = await readJSONBody(req);
    try {
      let count = 0;
      if (fs.existsSync(sourcePath)) {
        const dest = path.join(DASHBOARDS_DIR, 'telco-causal-gen2');
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        
        const files = fs.readdirSync(sourcePath);
        for (const file of files) {
          const srcFile = path.join(sourcePath, file);
          const stat = fs.statSync(srcFile);
          if (stat.isFile()) {
            fs.copyFileSync(srcFile, path.join(dest, file));
            count++;
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, filesSynced: count }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 7. Streaming Deploy SSE
  if (url.pathname === '/api/deploy/stream') {
    if (deploying) {
      res.writeHead(409, { 'Content-Type': 'text/plain' });
      return res.end('A deploy is already running.');
    }
    deploying = true;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    repairRoutesFile();
    const deployProc = spawn('bash', [path.join(ROOT_DIR, 'deploy-dashboards.sh')], {
      cwd: ROOT_DIR,
      env: process.env
    });

    deployProc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) res.write(`data: ${line}\n\n`);
      });
    });

    deployProc.stderr.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) res.write(`data: ${line}\n\n`);
      });
    });

    deployProc.on('error', (err) => {
      res.write(`data: Could not start deploy-dashboards.sh: ${err.message}\n\n`);
    });

    deployProc.on('close', (code) => {
      deploying = false;
      res.write(`data: [DEPLOY PROCESS EXITED WITH CODE ${code}]\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });

    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// ── Protected panel files (read by deploy-dashboards.sh from deploy.protect) ─────────────────────
const PROTECT_FILE = path.join(ROOT_DIR, 'deploy.protect');
const DEFAULT_PROTECT = ['incident-dashboard.panel.ts'];
const PANEL_FILE_RE = /^[a-z0-9][a-z0-9-]*\.panel\.ts$/;

// ── Routes kept in Studio but not deployed ───────────────────────────────────────────────────────
// They live in routes.held.json next to deploy.protect, not in config/routes.json, so no deploy script ever sees them.
const HELD_FILE = path.join(ROOT_DIR, 'routes.held.json');
function readHeld() {
  try {
    const j = JSON.parse(fs.readFileSync(HELD_FILE, 'utf8'));
    return (Array.isArray(j.routes) ? j.routes : []).filter(r => r && typeof r.path === 'string');
  } catch (e) { return []; }
}
function writeHeld(list) {
  const clean = list.filter(r => r && typeof r.path === 'string').map(r => ({
    path: r.path, bundlePath: r.bundlePath || (r.regions ? undefined : DEFAULT_BUNDLE), panelId: routePanelId(r), title: r.title, inSidebar: r.inSidebar !== false
  }));
  fs.writeFileSync(HELD_FILE, JSON.stringify({ note: 'Routes kept in Studio but not deployed to the cluster. Move one back with the Deployed switch.', routes: clean }, null, 2));
}

/** Same rule as the script: the file decides if it exists, otherwise the default list. */
function readProtect() {
  try {
    if (!fs.existsSync(PROTECT_FILE)) return DEFAULT_PROTECT.slice();
    return fs.readFileSync(PROTECT_FILE, 'utf8')
      .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && PANEL_FILE_RE.test(l));
  } catch (e) {
    return DEFAULT_PROTECT.slice();
  }
}

function writeProtect(list) {
  const uniq = Array.from(new Set(list)).sort();
  const body = '# Panel files that deploy-dashboards.sh must never overwrite in dashboard-extension/src/panels/.\n' +
    '# Managed by Concert Workbench (Pages > Protect). One file name per line.\n' +
    uniq.join('\n') + (uniq.length ? '\n' : '');
  fs.writeFileSync(PROTECT_FILE, body);
}

function isProtectedPanel(file) {
  return readProtect().includes(file);
}

/** route panelId -> panel module file name, read from src/index.js (registerCustomPanel + the import() in its export). */
/** The custom panel a route shows: its own panelId, or for a multi-region route (left/right, top/bottom) the first region that has one. */
function routePanelId(r) {
  if (!r) return null;
  if (r.panelId) return r.panelId;
  const regs = r.regions && typeof r.regions === 'object' ? r.regions : null;
  if (!regs) return null;
  const order = ['top', 'left', 'main', ...Object.keys(regs)];
  for (const k of order) if (regs[k] && regs[k].panelId) return regs[k].panelId;
  return null;
}
function panelFileFor(panelId) {
  try {
    const idx = fs.readFileSync(path.join(EXT_DIR, 'src', 'index.js'), 'utf8');
    const reg = new RegExp(`registerCustomPanel\\(\\s*['"]${panelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*,\\s*([A-Za-z0-9_$]+)\\s*\\)`).exec(idx);
    if (!reg) return null;
    const exp = new RegExp(`export\\s+const\\s+${reg[1]}\\s*=\\s*\\{[\\s\\S]*?import\\(\\s*['"]\\./panels/([A-Za-z0-9._-]+?)['"]\\s*\\)`).exec(idx);
    if (!exp) return null;
    const name = exp[1].endsWith('.ts') ? exp[1] : `${exp[1]}.ts`;
    return PANEL_FILE_RE.test(name) ? name : null;
  } catch (e) {
    return null;
  }
}


// ---------- Panels found on disk, extra tiles, publishing layouts as pages ----------
const PANELS_DIR = path.join(EXT_DIR, 'src', 'panels');
const BUILTIN_TILE_IDS = new Set(TILES.map(t => t.id)); // before any extra tile is registered
const PUBLISHED_FILE = path.join(DASHBOARDS_DIR, 'layouts', '.published.json');

function prettify(id) { return id.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()); }
function readIndexJs() { try { return fs.readFileSync(path.join(EXT_DIR, 'src', 'index.js'), 'utf8'); } catch (e) { return ''; } }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function readPublished() {
  try {
    const o = JSON.parse(fs.readFileSync(PUBLISHED_FILE, 'utf8'));
    const out = {};
    for (const [slug, v] of Object.entries(o || {})) {
      if (LAYOUT_SLUG_RE.test(slug) && v && typeof v.route === 'string' && typeof v.panelId === 'string') out[slug] = { route: v.route, panelId: v.panelId, title: String(v.title || slug) };
    }
    return out;
  } catch (e) { return {}; }
}
function writePublished(o) {
  fs.mkdirSync(LAYOUTS_DIR, { recursive: true });
  writeIfChanged(PUBLISHED_FILE, JSON.stringify(o, null, 2));
}

/** Every file in src/panels/, with whether it is registered in index.js, which routes use it, and whether it is protected. */
function scanPanels() {
  let files = [];
  try { files = fs.readdirSync(PANELS_DIR).filter(f => f.endsWith('.ts') && fs.statSync(path.join(PANELS_DIR, f)).isFile()).sort(); } catch (e) { return []; }
  const idx = readIndexJs();
  let routes = [];
  try { routes = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'config', 'routes.json'), 'utf8')).spec.routes || []; } catch (e) { /* none */ }
  const byFile = {};
  [...routes, ...readHeld()].forEach(r => { const pid = routePanelId(r), f = pid ? panelFileFor(pid) : null; if (f) (byFile[f] = byFile[f] || []).push({ path: r.path, title: r.title }); });
  const prot = readProtect();
  const published = readPublished();
  return files.map(file => {
    const valid = PANEL_FILE_RE.test(file);
    const id = valid ? file.replace(/\.panel\.ts$/, '') : file.replace(/\.ts$/, '');
    const registered = valid && new RegExp(`import\\(\\s*['"]\\./panels/${escRe(id)}(\\.panel)?(\\.ts)?['"]`).test(idx);
    const pub = Object.entries(published).find(([, v]) => `${v.panelId}.panel.ts` === file);
    return { panelFile: file, id, valid, registered, routes: byFile[file] || [], protected: prot.includes(file), published: pub ? pub[0] : null };
  });
}

/** Panels that can be embedded in a layout as tiles but are not in the Designer's built-in list. */
function extraTiles() {
  return scanPanels()
    .filter(p => p.valid && p.registered && !BUILTIN_TILE_IDS.has(p.id) && p.id !== DESIGNER_ID && p.id !== 'sample' && !p.id.startsWith('layout-') && /^[a-z0-9][a-z0-9-]*$/.test(p.id))
    .map(p => ({ id: p.id, label: (p.routes[0] && p.routes[0].title) || prettify(p.id), description: 'Panel found in src/panels/.', w: 12, h: 12 }));
}
function syncTiles() { try { registerExtraTiles(extraTiles()); } catch (e) { /* no panels dir yet */ } }

/**
 * Writes dashboards/dashboard-builder/settings-schema.ts: for every dashboard folder, the options (props) and, once it has
 * been made configurable, the values written in its code. The Designer reads it so people can edit them inside Concert
 * Operate (TileSettings.tsx); the TypeScript compiler is only needed here, at build time.
 */
const SCHEMA_HOST_PROPS = new Set(['alerts', 'incidents', 'loading', 'error', 'refetch', 'queryApi', 'part', 'settings', 'children', 'className', 'style']);
function writeSettingsSchema() {
  if (!designerSourceExists()) return;
  const out = {};
  let dirs = [];
  try { dirs = fs.readdirSync(DASHBOARDS_DIR).filter(d => dirOk(d) && d !== DESIGNER_ID && fs.statSync(path.join(DASHBOARDS_DIR, d)).isDirectory()); } catch (e) { return; }
  for (const d of dirs) {
    const tile = splitTileId(d);
    try {
      const s = settingsFor(tile);
      if (!s || s.ok === false) continue;
      const edit = (s.constants || []).filter(c => !c.derived);
      const slimC = c => ({ name: c.name, kind: c.kind, value: c.value, ...(c.doc ? { doc: c.doc } : {}), ...(c.shape ? { shape: c.shape } : {}), ...(c.of ? { of: c.of } : {}) });
      const slimP = p => ({ name: p.name, kind: p.kind, ...(p.type ? { type: String(p.type).slice(0, 80) } : {}), ...(p.doc ? { doc: p.doc } : {}), ...(p.default !== undefined ? { default: p.default } : {}), ...(p.options ? { options: p.options } : {}), ...(p.numeric ? { numeric: true } : {}) });
      out[tile] = {
        props: (s.props || []).filter(p => !SCHEMA_HOST_PROPS.has(p.name) && p.kind !== 'function' && p.kind !== 'node').map(slimP),
        constants: s.configurable ? edit.map(slimC) : [],
        configurable: !!s.configurable,
        stateKeys: s.stateKeys || [],
        hidden: s.configurable ? 0 : edit.length
      };
    } catch (e) { /* this dashboard cannot be read: it just has no settings form */ }
  }
  const body = `/**\n * Generated by Concert Workbench. Do not edit by hand.\n */\n\nimport type { TileSchema } from './TileSettings';\n\nexport const SCHEMAS: Record<string, TileSchema> = ${JSON.stringify(out, null, 2)};\n`;
  const f = path.join(DASHBOARDS_DIR, DESIGNER_ID, 'settings-schema.ts');
  try { if (fs.readFileSync(f, 'utf8') === body) return; } catch (e) { /* not written yet */ }
  fs.writeFileSync(f, body);
}

/** Writes dashboards/dashboard-builder/tiles-extra.ts so the Designer bundle can embed those panels. */
function writeTilesExtra() {
  if (!designerSourceExists()) return;
  const list = extraTiles();
  const body = `/**\n * Generated by Concert Workbench. Do not edit by hand.\n */\n\nexport interface ExtraTile {\n  id: string;\n  label: string;\n  description: string;\n  w: number;\n  h: number;\n}\n\n` +
    `export const EXTRA_TILES: ExtraTile[] = ${JSON.stringify(list, null, 2)};\n\n` +
    `export const EXTRA_LOADERS: Record<string, () => Promise<{ default: any }>> = {\n` +
    list.map(t => `  '${t.id}': () => import('../../panels/${t.id}.panel')`).join(',\n') + (list.length ? '\n' : '') + `};\n`;
  writeIfChanged(path.join(DASHBOARDS_DIR, DESIGNER_ID, 'tiles-extra.ts'), body);
  writeSettingsSchema();
}

function panelIdForFile(file) {
  const idx = readIndexJs();
  for (const m of idx.matchAll(/registerCustomPanel\(\s*['"]([^'"]+)['"]\s*,/g)) if (panelFileFor(m[1]) === file) return m[1];
  return null;
}

/** alerts-timeline-panel.ts -> alerts-timeline.panel.ts, and ./panels/alerts-timeline-panel -> ./panels/alerts-timeline.panel in index.js (backup kept). */
function renamePanelFile(file) {
  if (typeof file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.ts$/.test(file) || PANEL_FILE_RE.test(file)) throw new Error('Not a non-standard panel file name.');
  const oldBase = file.replace(/\.ts$/, '');
  const id = oldBase.replace(/[._-]panel$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!id) throw new Error('Cannot derive a panel id from that file name.');
  const newFile = `${id}.panel.ts`;
  if (!fs.existsSync(path.join(PANELS_DIR, file))) throw new Error('That panel file does not exist.');
  if (fs.existsSync(path.join(PANELS_DIR, newFile))) throw new Error(`${newFile} already exists.`);
  const indexPath = path.join(EXT_DIR, 'src', 'index.js');
  let idx = readIndexJs(), changed = false;
  const re = new RegExp(`(['"])\\./panels/${escRe(oldBase)}(\\.ts)?\\1`, 'g');
  if (re.test(idx)) {
    fs.copyFileSync(indexPath, `${indexPath}.bak-${Date.now()}`);
    idx = idx.replace(re, (_, q) => `${q}./panels/${id}.panel${q}`);
    fs.writeFileSync(indexPath, idx); changed = true;
  }
  fs.renameSync(path.join(PANELS_DIR, file), path.join(PANELS_DIR, newFile));
  syncTiles();
  return { from: file, to: newFile, indexUpdated: changed };
}

// ---------- Make a hand-written dashboard splittable ----------
const CONFIG_MARKER = '// scaffold-config:v1';
const SPLIT_SKIP = new Set(['layouts', 'dashboard-builder']);
const dirOk = d => typeof d === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(d) && !SPLIT_SKIP.has(d) && fs.existsSync(path.join(DASHBOARDS_DIR, d));
const splitManifest = d => path.join(DASHBOARDS_DIR, d, 'split.json');

function splitTileId(d) {
  const f = fs.readdirSync(path.join(DASHBOARDS_DIR, d)).find(n => /\.panel\.ts$/.test(n));
  return f ? f.replace(/\.panel\.ts$/, '') : null;
}

/** The component file of a dashboard folder: the .tsx (not a test) that analyzes best. */
function splitInspect(ts, d) {
  const dir = path.join(DASHBOARDS_DIR, d);
  const files = fs.readdirSync(dir).filter(n => /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) && n !== 'split-runtime.tsx');
  let best = null;
  for (const f of files) {
    const a = splitAnalyze(ts, path.join(dir, f));
    if (a.ok) { if (!best || a.sections.length > best.a.sections.length) best = { f, a }; }
    else if (a.status === 'split' || a.status === 'native') return { f, a };
    else if (!best) best = best || { f, a, bad: true };
  }
  return best;
}

/** The dashboard folder and component file behind a tile id (the panel file name without .panel.ts). */
function pickComponent(tile) {
  if (typeof tile !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tile)) throw new Error('Bad tile id.');
  const ts = loadTS(EXT_DIR);
  if (!ts) throw new Error('TypeScript was not found in dashboard-extension/node_modules (run npm install there).');
  const dir = fs.readdirSync(DASHBOARDS_DIR).filter(d => dirOk(d) && fs.statSync(path.join(DASHBOARDS_DIR, d)).isDirectory()).find(d => splitTileId(d) === tile);
  if (!dir) throw new Error('No dashboard folder for that tile.');
  const root = path.join(DASHBOARDS_DIR, dir);
  let main = null;
  try { const m = /from\s+['"]\.\.\/components\/[^/'"]+\/([^'"]+)['"]/.exec(fs.readFileSync(path.join(root, `${tile}.panel.ts`), 'utf8')); if (m) main = m[1].replace(/\.tsx?$/, '') + '.tsx'; } catch (e) { /* no panel file */ }
  const files = fs.readdirSync(root).filter(n => /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) && n !== 'split-runtime.tsx');
  let pick = main && files.includes(main) ? main : null;
  let best = null;
  for (const f of pick ? [pick] : files) {
    const r = readSettings(ts, path.join(root, f));
    const score = r.props.length * 2 + r.constants.length;
    if (!best || score > best.score) best = { f, r, score };
  }
  if (!best) throw new Error('No component file (.tsx) found.');
  return { ts, dir, root, file: best.f, settings: best.r };
}

/** Props and constants of the dashboard behind a tile id. */
function settingsFor(tile) {
  const p = pickComponent(tile);
  const text = fs.readFileSync(path.join(p.root, p.file), 'utf8');
  // once configurable, only the constants Studio actually wired up (the names in makeConfig({...})) can be edited
  const wired = text.includes(CONFIG_MARKER) ? new Set([...text.matchAll(/^\s*"([A-Za-z_]\w*)":\s*\{\s*get:/gm)].map(m => m[1])) : null;
  const settings = wired ? { ...p.settings, constants: p.settings.constants.filter(c => wired.has(c.name)) } : p.settings;
  return { dir: p.dir, file: p.file, ...settings, configurable: text.includes(CONFIG_MARKER), problem: text.includes(CONFIG_MARKER) ? '' : configProblem(p.ts, path.join(p.root, p.file)) };
}

/** "Make configurable": the chosen constants become editable through the `settings` prop. A backup is made first. */
function configApply(tile, names) {
  const p = pickComponent(tile);
  const file = path.join(p.root, p.file);
  const bad = configProblem(p.ts, file);
  if (bad) throw new Error(bad);
  const valid = new Set(p.settings.constants.filter(c => !c.derived).map(c => c.name));
  const chosen = (Array.isArray(names) ? names : []).filter(n => valid.has(n));
  if (!chosen.length) throw new Error('Choose at least one constant that can be edited.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bk = path.join(ROOT_DIR, '.backups', `config-${p.dir}-${stamp}`);
  fs.mkdirSync(bk, { recursive: true });
  fs.copyFileSync(file, path.join(bk, p.file));
  fs.writeFileSync(path.join(bk, 'WHICH'), p.file);
  const next = configTransform(p.ts, file, chosen);
  const probe = p.ts.transpileModule(next, { reportDiagnostics: true, fileName: p.file, compilerOptions: { jsx: p.ts.JsxEmit.Preserve, target: p.ts.ScriptTarget.ES2020 } });
  const errs = (probe.diagnostics || []).filter(x => x.category === p.ts.DiagnosticCategory.Error);
  if (errs.length) throw new Error('The change would not parse (' + p.ts.flattenDiagnosticMessageText(errs[0].messageText, ' ') + '). Nothing was written.');
  fs.writeFileSync(file, next);
  fs.copyFileSync(path.join(__dirname, 'config-runtime.ts'), path.join(p.root, 'config-runtime.ts'));
  try { writeSettingsSchema(); } catch (e) { /* schema is rebuilt at the next build */ }
  return { dir: p.dir, tile, file: p.file, constants: chosen, backup: path.relative(ROOT_DIR, bk) };
}

function configUndo(tile) {
  const p = pickComponent(tile);
  const base = path.join(ROOT_DIR, '.backups');
  const found = fs.existsSync(base) ? fs.readdirSync(base).filter(n => n.startsWith(`config-${p.dir}-`)).sort() : [];
  if (!found.length) throw new Error('No backup found for this dashboard.');
  const bk = path.join(base, found[found.length - 1]);
  const which = fs.readFileSync(path.join(bk, 'WHICH'), 'utf8').trim();
  fs.copyFileSync(path.join(bk, which), path.join(p.root, which));
  try { fs.unlinkSync(path.join(p.root, 'config-runtime.ts')); } catch (e) { /* gone */ }
  try { writeSettingsSchema(); } catch (e) { /* schema is rebuilt at the next build */ }
  return { dir: p.dir, restored: which };
}

function splitList() {
  const ts = loadTS(EXT_DIR);
  const out = [];
  for (const d of fs.readdirSync(DASHBOARDS_DIR).filter(dirOk)) {
    if (!fs.statSync(path.join(DASHBOARDS_DIR, d)).isDirectory()) continue;
    const row = { dir: d, tile: splitTileId(d), status: 'unsupported', reason: '', sections: [], component: '' };
    if (!ts) { row.reason = 'TypeScript was not found in dashboard-extension/node_modules (run npm install there).'; out.push(row); continue; }
    try {
      const r = splitInspect(ts, d);
      if (!r) { row.reason = 'No component file (.tsx) found.'; }
      else {
        row.component = r.f;
        row.status = r.a.ok ? 'candidate' : r.a.status;
        row.reason = r.a.ok ? '' : r.a.reason;
        if (r.a.ok) row.sections = r.a.sections.map(x => ({ id: x.id, label: x.label }));
        if (r.a.status === 'split' && fs.existsSync(splitManifest(d))) row.sections = (JSON.parse(fs.readFileSync(splitManifest(d), 'utf8')).parts || []).map(([id, label]) => ({ id, label }));
      }
    } catch (e) { row.reason = 'Could not read it: ' + e.message; }
    out.push(row);
  }
  return { rows: out, typescript: Boolean(ts) };
}

function splitParts() {
  const res = {}, sug = {};
  for (const d of fs.readdirSync(DASHBOARDS_DIR).filter(dirOk)) {
    try {
      const m = JSON.parse(fs.readFileSync(splitManifest(d), 'utf8'));
      if (m && m.tile && Array.isArray(m.parts)) { res[m.tile] = m.parts; if (m.suggest) sug[m.tile] = m.suggest; }
    } catch (e) { /* not split */ }
  }
  return { parts: res, suggest: sug };
}

function splitApply(d) {
  if (!dirOk(d)) throw new Error('Unknown dashboard folder.');
  const ts = loadTS(EXT_DIR);
  if (!ts) throw new Error('TypeScript was not found in dashboard-extension/node_modules (run npm install there first).');
  const tile = splitTileId(d);
  if (!tile) throw new Error('This folder has no *.panel.ts, so Studio cannot tell which panel shows it.');
  const r = splitInspect(ts, d);
  if (!r || !r.a.ok) throw new Error(r ? r.a.reason : 'No component file found.');
  const dir = path.join(DASHBOARDS_DIR, d);
  const file = path.join(dir, r.f);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bk = path.join(ROOT_DIR, '.backups', `split-${d}-${stamp}`);
  fs.mkdirSync(bk, { recursive: true });
  fs.copyFileSync(file, path.join(bk, r.f));
  fs.writeFileSync(path.join(bk, 'WHICH'), r.f);
  const next = splitTransform(ts, r.a, file);
  // The result must still parse; otherwise nothing is written.
  const probe = ts.transpileModule(next, { reportDiagnostics: true, fileName: r.f, compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2020 } });
  const bad = (probe.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error);
  if (bad.length) throw new Error('The change would not parse (' + ts.flattenDiagnosticMessageText(bad[0].messageText, ' ') + '). Nothing was written.');
  fs.writeFileSync(file, next);
  fs.copyFileSync(path.join(__dirname, 'split-runtime.tsx'), path.join(dir, 'split-runtime.tsx'));
  fs.writeFileSync(splitManifest(d), JSON.stringify({ tile, component: r.f, parts: r.a.sections.map(x => [x.id, x.label]), suggest: Object.fromEntries(r.a.sections.filter(x => x.suggest).map(x => [x.id, x.suggest])) }, null, 2));
  try { writeSettingsSchema(); } catch (e) { /* schema is rebuilt at the next build */ }
  return { dir: d, tile, sections: r.a.sections.map(x => ({ id: x.id, label: x.label })), backup: path.relative(ROOT_DIR, bk) };
}

function splitUndo(d) {
  if (!dirOk(d)) throw new Error('Unknown dashboard folder.');
  const base = path.join(ROOT_DIR, '.backups');
  const found = fs.existsSync(base) ? fs.readdirSync(base).filter(n => n.startsWith(`split-${d}-`)).sort() : [];
  if (!found.length) throw new Error('No backup found for this dashboard.');
  const bk = path.join(base, found[found.length - 1]);
  const which = fs.readFileSync(path.join(bk, 'WHICH'), 'utf8').trim();
  fs.copyFileSync(path.join(bk, which), path.join(DASHBOARDS_DIR, d, which));
  for (const f of ['split-runtime.tsx', 'split.json']) { try { fs.unlinkSync(path.join(DASHBOARDS_DIR, d, f)); } catch (e) { /* gone */ } }
  try { writeSettingsSchema(); } catch (e) { /* schema is rebuilt at the next build */ }
  return { dir: d, restored: which };
}

/** Every folder in dashboards/ that has a panel file, and whether it is already in the extension. Does not depend on deploy-dashboards.sh. */
/** True when any file Studio would copy from `src` is missing from, or different in, `dst`. */
function dirDiffers(src, dst) {
  let diff = false;
  const walk = (d, rel) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    if (diff) return;
    const r = path.join(rel, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(path.join(d, e.name), r); return; }
    if (/\.test\.tsx?$/.test(e.name) || e.name.endsWith('.panel.ts') || e.name === '.DS_Store') return;
    const t = path.join(dst, r);
    try { if (!fs.existsSync(t) || !fs.readFileSync(path.join(d, e.name)).equals(fs.readFileSync(t))) diff = true; } catch (err) { diff = true; }
  });
  try { walk(src, ''); } catch (e) { return false; }
  return diff;
}
/** Dashboards that ship inside Studio (scaffold/bundled/<dir>/), so updating scaffold/ alone is enough to get a newer one. */
const BUNDLED_SRC = path.join(__dirname, 'bundled');
const readVer = base => { try { const m = /VERSION\s*=\s*'(v?\d+\.\d+\.\d+)'/.exec(fs.readFileSync(path.join(base, 'version.ts'), 'utf8')); return m ? m[1] : null; } catch (e) { return null; } };
const verNum = v => (/(\d+)\.(\d+)\.(\d+)/.exec(v || '') || [0, 0, 0, 0]).slice(1).map(Number);
const verNewer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
function copyTree(src, dst) {
  let n = 0;
  const walk = (d, rel) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(path.join(d, e.name), r); return; }
    if (e.name === '.DS_Store') return;
    fs.mkdirSync(path.dirname(path.join(dst, r)), { recursive: true }); fs.copyFileSync(path.join(d, e.name), path.join(dst, r)); n++;
  });
  walk(src, ''); return n;
}
/** Is the copy shipped with Studio newer than (or missing from) dashboards/<dir>? */
function shippedNewer(dir) {
  const sh = path.join(BUNDLED_SRC, dir); if (!fs.existsSync(sh)) return false;
  const cur = path.join(DASHBOARDS_DIR, dir); if (!fs.existsSync(cur)) return true;
  return verNewer(readVer(sh), readVer(cur));
}
function bundledList() {
  const known = {};
  try {
    const sh = fs.readFileSync(path.join(ROOT_DIR, 'deploy-dashboards.sh'), 'utf8');
    for (const m of sh.matchAll(/^sync_dashboard\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"/gm)) known[m[1]] = { comp: m[2], panel: m[3] };
  } catch (e) { /* no script */ }
  let dirs = [];
  try { dirs = fs.readdirSync(DASHBOARDS_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== DESIGNER_ID && d.name !== 'layouts' && !d.name.startsWith('.')).map(d => d.name); } catch (e) { /* no dashboards/ yet */ }
  try { fs.readdirSync(BUNDLED_SRC, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).forEach(d => { if (!dirs.includes(d.name)) dirs.push(d.name); }); } catch (e) { /* nothing shipped */ }
  dirs.sort();
  const rows = [];
  dirs.forEach(dir => {
    const stale = shippedNewer(dir), base = stale ? path.join(BUNDLED_SRC, dir) : path.join(DASHBOARDS_DIR, dir);
    let panel = known[dir] && known[dir].panel !== '-' ? known[dir].panel : null;
    if (!panel) { try { panel = fs.readdirSync(base).find(f => PANEL_FILE_RE.test(f)) || null; } catch (e) { /* skip */ } }
    if (!panel || !fs.existsSync(path.join(base, panel))) return;
    let comp = known[dir] ? known[dir].comp : null;
    if (!comp) { try { const m = /components\/([^/'"]+)\//.exec(fs.readFileSync(path.join(base, panel), 'utf8')); comp = m ? m[1] : dir; } catch (e) { comp = dir; } }
    const installed = fs.existsSync(path.join(PANELS_DIR, panel)) && fs.existsSync(path.join(EXT_DIR, 'src', 'components', comp));
    const row = { dir, comp, panel, installed, title: prettify(panel.replace(/\.panel\.ts$/, '')) };
    if (installed) {
      const dst = path.join(EXT_DIR, 'src', 'components', comp);
      row.srcVersion = readVer(base); row.instVersion = readVer(dst);
      row.changed = stale || dirDiffers(base, dst);
      if (stale) row.fromStudio = true;
    }
    rows.push(row);
  });
  return rows;
}
/** Copies one bundled dashboard into the extension (same rules as deploy-dashboards.sh), then registers it and adds its route. */
function bundledInstall(dir) {
  const row = bundledList().find(r => r.dir === dir);
  if (!row) throw new Error('Not a bundled dashboard.');
  if (!fs.existsSync(path.join(EXT_DIR, 'src'))) throw new Error('dashboard-extension/src was not found.');
  let backup = null;
  if (shippedNewer(dir)) { // Studio carries a newer copy than dashboards/<dir>: bring it in first (the old one is backed up)
    const cur = path.join(DASHBOARDS_DIR, dir);
    if (fs.existsSync(cur)) { backup = path.join(ROOT_DIR, '.backups', `bundled-${dir}-${new Date().toISOString().replace(/[:.]/g, '-')}`); copyTree(cur, backup); }
    copyTree(path.join(BUNDLED_SRC, dir), cur);
  }
  const src = path.join(DASHBOARDS_DIR, dir), dst = path.join(EXT_DIR, 'src', 'components', row.comp);
  if (!fs.existsSync(path.join(src, row.panel))) throw new Error(`${row.panel} is missing from dashboards/${dir}/.`);
  let n = 0;
  const walk = (d, rel) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(path.join(d, e.name), r); return; }
    if (/\.test\.tsx?$/.test(e.name) || e.name.endsWith('.panel.ts') || e.name === '.DS_Store') return;
    fs.mkdirSync(path.dirname(path.join(dst, r)), { recursive: true });
    fs.copyFileSync(path.join(d, e.name), path.join(dst, r)); n++;
  });
  walk(src, '');
  fs.mkdirSync(PANELS_DIR, { recursive: true });
  if (!fs.existsSync(path.join(PANELS_DIR, row.panel))) fs.copyFileSync(path.join(src, row.panel), path.join(PANELS_DIR, row.panel));
  if (row.installed) return { files: n, panel: row.panel, route: 'unchanged', updated: true, backup: backup ? path.relative(ROOT_DIR, backup) : null };
  const r = addRouteForPanel(row.panel);
  return { files: n, panel: row.panel, ...r };
}

/** A second route that stacks the panel over Concert Operate's own alertViewer; selections in the panel filter that viewer. Never overwrites an existing route. */
function ensureViewerRoute(panelId, routePath, title) {
  try {
    const routesPath = path.join(EXT_DIR, 'config', 'routes.json');
    const rd = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    const have = rd.spec.routes.find(r => r.path === routePath);
    if (have) { // routes made by v1.27.9 had no state: add it so the panel stops filling the window
      if (have.regions && have.regions.top && !have.regions.top.state) { have.regions.top.state = { fillWindow: false }; fs.writeFileSync(routesPath, JSON.stringify(rd, null, 2)); }
      return;
    }
    rd.spec.routes.push({ path: routePath, title, regions: { top: { bundlePath: 'bundles/alerts-examples/files/alerts-examples-bundle.js', panelId, state: { fillWindow: false } }, bottom: { aiopsPanel: 'alertViewer' } } });
    if (rd.spec.menuRoutes && rd.spec.menuRoutes[0] && !rd.spec.menuRoutes[0].routes.includes(routePath)) rd.spec.menuRoutes[0].routes.push(routePath);
    fs.writeFileSync(routesPath, JSON.stringify(rd, null, 2));
  } catch (e) { /* the plain route still works */ }
}

/** Gives an unrouted panel a sidebar route (and registers it when index.js does not know it yet). */
function addRouteForPanel(panelFile) {
  if (typeof panelFile !== 'string' || !PANEL_FILE_RE.test(panelFile)) throw new Error('Bad panel file name.');
  if (!fs.existsSync(path.join(PANELS_DIR, panelFile))) throw new Error('That panel file does not exist in src/panels/.');
  const id = panelFile.replace(/\.panel\.ts$/, '');
  const routes = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'config', 'routes.json'), 'utf8')).spec.routes || [];
  const taken = [...routes, ...readHeld()].find(r => r.path === `/${id}`);
  if (taken && routePanelId(taken) && panelFileFor(routePanelId(taken)) !== panelFile) throw new Error(`The route /${id} is already used by another panel.`);
  const panelId = panelIdForFile(panelFile) || id;
  registerPanel({ id, panelId, title: prettify(id), exportName: toPascalCase(id) + 'Panel' });
  return { route: `/${id}`, panelId };
}

function panelTS(slug) {
  return `/**\n * Generated by Concert Workbench (Design > Publish). Edit the layout in Studio, then publish again.\n */\n\n` +
    `import React from 'react';\nimport createPanel from '../app/createPanel';\nimport DashboardBuilder from '../components/${DESIGNER_ID}/DashboardBuilder';\n` +
    `import { LAYOUT } from '../components/${DESIGNER_ID}/published/${slug}';\n\n` +
    `export default createPanel((props: any) => React.createElement(DashboardBuilder, { ...props, layout: LAYOUT }));\n`;
}
/** Writes a generated file only when its text changed, so publishing again leaves unchanged files (and git) alone. */
function writeIfChanged(file, text) {
  try { if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false; } catch (e) { /* write it */ }
  fs.writeFileSync(file, text);
  return true;
}
function writePublishedData(slug, dashboard) {
  const dir = path.join(DASHBOARDS_DIR, DESIGNER_ID, 'published');
  fs.mkdirSync(dir, { recursive: true });
  writeIfChanged(path.join(dir, `${slug}.ts`),
    `/**\n * Generated by Concert Workbench from dashboards/layouts/${slug}.json. Do not edit by hand.\n */\n\nexport const LAYOUT: unknown = ${JSON.stringify(JSON.parse(exportJson({ ...dashboard, updated: 0 })), null, 2)};\n`);
}

/** Publishes a saved layout as its own sidebar page: /layout-<slug>. The original dashboards are not touched. */
function publishLayout(slug) {
  if (!designerSourceExists()) throw new Error('Install the Dashboard Designer first (Setup tab), then publish.');
  syncTiles();
  const d = readLayout(slug);
  if (!d) throw new Error('No such layout.');
  if (!d.widgets.length) throw new Error('That layout is empty.');
  const id = `layout-${slug}`.slice(0, 60).replace(/-+$/, '');
  const pub = readPublished();
  const panelFile = path.join(PANELS_DIR, `${id}.panel.ts`);
  if (fs.existsSync(panelFile) && !(pub[slug] && pub[slug].panelId === id)) throw new Error(`${id}.panel.ts already exists in src/panels/ and was not made by Studio. Rename the layout.`);
  let routeTitle = d.name;
  try {
    const ex = [...JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'config', 'routes.json'), 'utf8')).spec.routes, ...readHeld()].find(r => r.path === `/${id}`);
    if (ex && ex.title) routeTitle = ex.title; // keep a title the user edited on the Pages tab
  } catch (e) { /* first publish */ }
  writePublishedData(slug, d);
  writeTilesExtra();
  fs.mkdirSync(PANELS_DIR, { recursive: true });
  writeIfChanged(panelFile, panelTS(slug));
  registerPanel({ id, panelId: id, title: routeTitle, exportName: toPascalCase(id) + 'Panel' });
  pub[slug] = { route: `/${id}`, panelId: id, title: routeTitle };
  writePublished(pub);
  return { route: `/${id}`, panelId: id };
}

function unpublishLayout(slug) {
  const pub = readPublished();
  const e = pub[slug];
  if (!e) throw new Error('That layout is not published.');
  const id = e.panelId;
  const exportName = toPascalCase(id) + 'Panel';
  const indexPath = path.join(EXT_DIR, 'src', 'index.js');
  let idx = readIndexJs();
  const exportCode = `\nexport const ${exportName} = {\n  renderer: ReactRenderer,\n  state: {\n    component: () => import('./panels/${id}.panel')\n  }\n};\n`;
  const regCode = `window.registerCustomPanel('${id}', ${exportName});\n`;
  if (idx.includes(exportCode) && idx.includes(regCode)) {
    idx = idx.replace(exportCode, '').replace(regCode, '');
    fs.writeFileSync(indexPath, idx);
  } else if (idx.includes(`registerCustomPanel('${id}'`)) {
    throw new Error(`src/index.js was edited by hand around ${id}. Remove its export and registerCustomPanel line yourself, then unpublish again.`);
  }
  const routesPath = path.join(EXT_DIR, 'config', 'routes.json');
  const rd = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  rd.spec.routes = rd.spec.routes.filter(r => r.path !== e.route);
  rd.spec.menuRoutes.forEach(m => { m.routes = (m.routes || []).filter(p => p !== e.route); });
  fs.writeFileSync(routesPath, JSON.stringify(rd, null, 2));
  writeHeld(readHeld().filter(r => r.path !== e.route));
  for (const f of [path.join(PANELS_DIR, `${id}.panel.ts`), path.join(DASHBOARDS_DIR, DESIGNER_ID, 'published', `${slug}.ts`), path.join(EXT_DIR, 'src', 'components', DESIGNER_ID, 'published', `${slug}.ts`)]) {
    try { fs.unlinkSync(f); } catch (err) { /* already gone */ }
  }
  delete pub[slug];
  writePublished(pub);
  writeTilesExtra();
}

// ---------- Layout Editor storage ----------
const LAYOUTS_DIR = path.join(DASHBOARDS_DIR, 'layouts');
const LAYOUT_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const DEFAULT_LAYOUT_FILE = path.join(LAYOUTS_DIR, '.default');
const MAX_LAYOUT_BYTES = 24 * 1024 * 1024; // layouts can carry pictures (data URIs)

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function slugify(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'layout';
}
function layoutPath(slug) {
  if (typeof slug !== 'string' || !LAYOUT_SLUG_RE.test(slug)) throw new Error('Bad layout name.');
  return path.join(LAYOUTS_DIR, `${slug}.json`);
}
function readLayout(slug) {
  syncTiles();
  try {
    const raw = JSON.parse(fs.readFileSync(layoutPath(slug), 'utf8'));
    const s = sanitizeDashboard(raw && raw.kind === FILE_KIND ? raw.dashboard : raw);
    return s ? s.dashboard : null;
  } catch (e) { return null; }
}
function readDefaultSlug() {
  try { const s = fs.readFileSync(DEFAULT_LAYOUT_FILE, 'utf8').trim(); return LAYOUT_SLUG_RE.test(s) && fs.existsSync(layoutPath(s)) ? s : null; }
  catch (e) { return null; }
}
function listLayouts() {
  if (!fs.existsSync(LAYOUTS_DIR)) return [];
  return fs.readdirSync(LAYOUTS_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
    .filter(s => LAYOUT_SLUG_RE.test(s))
    .map(slug => {
      const d = readLayout(slug);
      const mtime = fs.statSync(layoutPath(slug)).mtimeMs;
      return d ? { slug, name: d.name, widgets: d.widgets.length, updated: mtime, published: (readPublished()[slug] || {}).route || null } : null;
    }).filter(Boolean).sort((a, b) => b.updated - a.updated);
}
/** body: { slug?, dashboard }. Validated and clamped by the Designer's own code before anything is written. */
function saveLayout(body) {
  if (!body || typeof body !== 'object') throw new Error('Nothing to save.');
  syncTiles();
  if (JSON.stringify(body).length > MAX_LAYOUT_BYTES) throw new Error('Layout is too large.');
  const s = sanitizeDashboard(body.dashboard);
  if (!s) throw new Error('That is not a dashboard layout.');
  let slug = typeof body.slug === 'string' && body.slug ? body.slug : null;
  if (!slug) {
    const base = slugify(s.dashboard.name);
    slug = base;
    for (let i = 2; fs.existsSync(layoutPath(slug)); i++) slug = `${base}-${i}`.slice(0, 60);
  }
  const file = layoutPath(slug);
  fs.mkdirSync(LAYOUTS_DIR, { recursive: true });
  // Write only when something other than the timestamp changed, so saving an identical layout leaves the file (and git) alone.
  const same = (a, b) => { try { const x = JSON.parse(a), y = JSON.parse(b); x.dashboard.updated = 0; y.dashboard.updated = 0; return JSON.stringify(x) === JSON.stringify(y); } catch (e) { return false; } };
  const next = exportJson({ ...s.dashboard, updated: Date.now() });
  let unchanged = false;
  try { unchanged = fs.existsSync(file) && same(fs.readFileSync(file, 'utf8'), next); } catch (e) { unchanged = false; }
  if (!unchanged) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, next);
    fs.renameSync(tmp, file);
  }
  // Keep the shipped default in step when the default layout itself is edited.
  let defaultUpdated = false;
  if (readDefaultSlug() === slug && designerSourceExists()) { writeDefaultLayoutTS(s.dashboard); writeTilesExtra(); defaultUpdated = true; }
  let publishedUpdated = false;
  if (readPublished()[slug] && designerSourceExists()) { writePublishedData(slug, s.dashboard); writeTilesExtra(); publishedUpdated = true; }
  return { slug, dropped: s.dropped, defaultUpdated, publishedUpdated };
}
function deleteLayout(slug) {
  const file = layoutPath(slug);
  if (!fs.existsSync(file)) throw new Error('No such layout.');
  if (readDefaultSlug() === slug) throw new Error('This is the default layout. Clear the default first, then delete it.');
  if (readPublished()[slug]) throw new Error('This layout is published as a page. Unpublish it first, then delete it.');
  fs.unlinkSync(file);
}
function designerSourceExists() {
  return fs.existsSync(path.join(DASHBOARDS_DIR, DESIGNER_ID, 'DashboardBuilder.tsx'));
}
function writeDefaultLayoutTS(dashboard) {
  const dir = path.join(DASHBOARDS_DIR, DESIGNER_ID);
  const body = dashboard
    ? `export const DEFAULT_LAYOUT: unknown = ${JSON.stringify(JSON.parse(exportJson(dashboard)), null, 2)};\n`
    : 'export const DEFAULT_LAYOUT: unknown = null;\n';
  const head = `/**\n * Written by Concert Workbench (Design > Make default). Edit layouts there, not here.\n * null = no shared layout.\n */\n\n`;
  fs.writeFileSync(path.join(dir, 'default-layout.ts'), head + body);
}
/** slug = a saved layout, or null to clear the default. Takes effect in Concert Operate on the next Build & Deploy. */
function setDefaultLayout(slug) {
  if (!designerSourceExists()) throw new Error('Install the Dashboard Designer first (Setup tab), then set a default layout.');
  fs.mkdirSync(LAYOUTS_DIR, { recursive: true });
  if (slug === null || slug === undefined) {
    writeDefaultLayoutTS(null);
    try { fs.unlinkSync(DEFAULT_LAYOUT_FILE); } catch (e) { /* none set */ }
    return { defaultSlug: null };
  }
  const d = readLayout(slug);
  if (!d) throw new Error('No such layout.');
  if (d.widgets.length === 0) throw new Error('That layout is empty.');
  writeDefaultLayoutTS(d);
  writeTilesExtra();
  fs.writeFileSync(DEFAULT_LAYOUT_FILE, slug + '\n');
  return { defaultSlug: slug };
}

// ---------- Image conversion (TIFF cannot be shown by a browser, so it becomes PNG) ----------
function runTool(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000, windowsHide: true }, (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr })));
  });
}

/** body: { name, data } with data = base64 of a .tif / .tiff file. Tries macOS sips, then ImageMagick, then Python Pillow. */
async function convertImageToPng(body) {
  const name = body && typeof body.name === 'string' ? body.name : '';
  const data = body && typeof body.data === 'string' ? body.data : '';
  if (!/\.tiff?$/i.test(name)) throw new Error('Only .tif / .tiff files need converting. PNG, JPEG, GIF, WebP, SVG and BMP are used as they are.');
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('No file data received.');
  const raw = Buffer.from(data, 'base64');
  if (raw.length < 8 || raw.length > 18 * 1024 * 1024) throw new Error('The TIFF must be between 8 bytes and 18 MB.');
  const magic = raw.subarray(0, 4).toString('hex');
  if (magic !== '49492a00' && magic !== '4d4d002a' && magic !== '49492b00' && magic !== '4d4d002b') throw new Error('That file is not a TIFF.');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-img-'));
  const inFile = path.join(dir, 'in.tif');
  const outFile = path.join(dir, 'out.png');
  fs.writeFileSync(inFile, raw);
  const attempts = [
    ['sips', ['-s', 'format', 'png', inFile, '--out', outFile]],
    ['magick', [inFile + '[0]', outFile]],
    ['convert', [inFile + '[0]', outFile]],
    ['python3', ['-I', '-c', 'import sys; from PIL import Image; im=Image.open(sys.argv[1]); im.seek(0); im.convert("RGBA").save(sys.argv[2], "PNG")', inFile, outFile]]
  ];
  let ok = false;
  const notes = [];
  try {
    for (const [cmd, args] of attempts) {
      try { await runTool(cmd, args); if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) { ok = true; break; } }
      catch (e) { notes.push(`${cmd}: ${e.code === 'ENOENT' ? 'not installed' : 'failed'}`); }
    }
    if (!ok) throw new Error('No TIFF converter worked (' + notes.join(', ') + '). On a Mac, "sips" is built in; otherwise install ImageMagick, or convert the file to PNG yourself.');
    const png = fs.readFileSync(outFile);
    if (png.length > 3 * 1024 * 1024) throw new Error(`The converted PNG is ${(png.length / 1048576).toFixed(1)} MB, over the 3 MB limit. Make the TIFF smaller first.`);
    return { mime: 'image/png', data: png.toString('base64'), bytes: png.length };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Helpers
function readJSONBody(req, maxBytes = 26 * 1024 * 1024) {
  return new Promise((resolve) => {
    let body = '';
    let size = 0;
    let tooBig = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { tooBig = true; return; }
      body += chunk;
    });
    req.on('end', () => {
      if (tooBig) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
  });
}

function toPascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, (chr) => chr.toUpperCase());
}

function scaffoldDashboard(id, title, config) {
  const compName = toPascalCase(id) + 'Dashboard';
  const panelId = `${id}-dashboard`;

  // Generate code based on visual component composition and API bindings
  const tsxCode = generateCustomComposedDashboard(id, title, config);
  const scssCode = generateCustomSCSS(id);
  const panelCode = generatePanelTS(id);

  // 1. Write Standalone Dashboard Files in dashboards/<id>/
  const standDir = path.join(DASHBOARDS_DIR, id);
  if (!fs.existsSync(standDir)) fs.mkdirSync(standDir, { recursive: true });

  fs.writeFileSync(path.join(standDir, `${compName}.tsx`), tsxCode);
  fs.writeFileSync(path.join(standDir, `${id}.scss`), scssCode);
  const panelFile = `${id}.panel.ts`;
  const keepPanel = isProtectedPanel(panelFile) && fs.existsSync(path.join(EXT_DIR, 'src', 'panels', panelFile));
  if (!keepPanel) fs.writeFileSync(path.join(standDir, panelFile), panelCode);
  fs.writeFileSync(path.join(standDir, `README.md`), `# ${title}\n\nGenerated by Concert Workbench.\n`);

  // 2. Write Component Files in dashboard-extension/src/components/<id>/
  const extCompDir = path.join(EXT_DIR, 'src', 'components', id);
  if (!fs.existsSync(extCompDir)) fs.mkdirSync(extCompDir, { recursive: true });

  fs.writeFileSync(path.join(extCompDir, `${compName}.tsx`), tsxCode);
  fs.writeFileSync(path.join(extCompDir, `${id}.scss`), scssCode);

  // 3. Write Panel in dashboard-extension/src/panels/<id>.panel.ts
  if (!keepPanel) fs.writeFileSync(path.join(EXT_DIR, 'src', 'panels', panelFile), generatePanelTS(id));

  // 4 + 5. Register the panel in index.js and add the route.
  registerPanel({ id, panelId, title, exportName: toPascalCase(id) + 'Panel' });
}

/**
 * Registers a panel in dashboard-extension/src/index.js and adds its route + menu entry to config/routes.json.
 * Safe to run twice: nothing is duplicated, an existing route is updated in place.
 */
function registerPanel({ id, panelId, title, exportName }) {
  const routePath = `/${id}`;
  const indexPath = path.join(EXT_DIR, 'src', 'index.js');
  let indexContent = fs.readFileSync(indexPath, 'utf8');

  if (!indexContent.includes(`window.registerCustomPanel('${panelId}'`)) {
    const exportCode = `
export const ${exportName} = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/${id}.panel')
  }
};
`;
    const regCode = `window.registerCustomPanel('${panelId}', ${exportName});\n`;
    indexContent += exportCode + regCode;
    fs.writeFileSync(indexPath, indexContent);
  }

  // A route you chose not to deploy stays that way when its layout is published again.
  const heldList = readHeld();
  const heldIdx = heldList.findIndex(r => r.path === routePath);
  if (heldIdx >= 0) {
    heldList[heldIdx] = { ...heldList[heldIdx], panelId, title: heldList[heldIdx].title || title };
    writeHeld(heldList);
    return;
  }

  const routesPath = path.join(EXT_DIR, 'config', 'routes.json');
  const routesData = JSON.parse(fs.readFileSync(routesPath, 'utf8'));

  if (!routesData.spec.menuRoutes[0].routes.includes(routePath)) {
    routesData.spec.menuRoutes[0].routes.push(routePath);
  }

  const existingRouteIdx = routesData.spec.routes.findIndex(r => r.path === routePath);
  const routeObj = {
    path: routePath,
    bundlePath: "bundles/alerts-examples/files/alerts-examples-bundle.js",
    panelId: panelId,
    title: title
  };

  if (existingRouteIdx >= 0) {
    routesData.spec.routes[existingRouteIdx] = routeObj;
  } else {
    routesData.spec.routes.push(routeObj);
  }

  fs.writeFileSync(routesPath, JSON.stringify(routesData, null, 2));
}

// ── Dashboard Designer (the end-user builder that runs inside Concert Operate) ───────────────────
const DESIGNER_SRC = path.join(__dirname, 'designer');
const DESIGNER_ID = 'dashboard-builder';
// the converter reads field names from the Designer's own rows.ts (installed copy first) and the toolkit's constants.ts
setCatalogSource(ts => readCatalog(ts, fs.existsSync(path.join(DASHBOARDS_DIR, DESIGNER_ID, 'rows.ts')) ? path.join(DASHBOARDS_DIR, DESIGNER_ID) : path.join(__dirname, 'designer'), EXT_DIR));

function versionOf(file) {
  try {
    const m = /VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(file, 'utf8'));
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

/** Panels the Designer can embed as tiles (read from its own Tiles.tsx), so a missing one is reported before the build fails. */
function designerTilePanels() {
  try {
    const src = fs.readFileSync(path.join(DESIGNER_SRC, 'Tiles.tsx'), 'utf8');
    return Array.from(src.matchAll(/panels\/([a-z0-9-]+)\.panel/g)).map(m => m[1]);
  } catch (e) {
    return [];
  }
}

function designerStatus() {
  const compDir = path.join(EXT_DIR, 'src', 'components', DESIGNER_ID);
  const indexJs = fs.existsSync(path.join(EXT_DIR, 'src', 'index.js')) ? fs.readFileSync(path.join(EXT_DIR, 'src', 'index.js'), 'utf8') : '';
  let routed = false;
  try {
    const r = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'config', 'routes.json'), 'utf8'));
    routed = r.spec.routes.some(x => x.path === `/${DESIGNER_ID}`);
  } catch (e) { /* not routed */ }
  const missingPanels = designerTilePanels().filter(p => !fs.existsSync(path.join(EXT_DIR, 'src', 'panels', `${p}.panel.ts`)));
  return {
    bundled: fs.existsSync(path.join(DESIGNER_SRC, 'DashboardBuilder.tsx')),
    bundledVersion: versionOf(path.join(DESIGNER_SRC, 'version.ts')),
    installed: fs.existsSync(path.join(compDir, 'DashboardBuilder.tsx')) && fs.existsSync(path.join(EXT_DIR, 'src', 'panels', `${DESIGNER_ID}.panel.ts`)),
    installedVersion: versionOf(path.join(compDir, 'version.ts')),
    registered: indexJs.includes(`window.registerCustomPanel('${DESIGNER_ID}'`),
    routed,
    missingPanels
  };
}

function installDesigner() {
  const st = designerStatus();
  if (!st.bundled) throw new Error('The Designer files are missing from scaffold/designer/. Re-copy the scaffold-studio folder.');
  if (st.missingPanels.length) {
    throw new Error(`These panels are used as tiles but do not exist in dashboard-extension/src/panels/: ${st.missingPanels.join(', ')}. Add them, or remove their lines from scaffold/designer/Tiles.tsx and registry.ts (TILES).`);
  }
  const srcDir = path.join(DASHBOARDS_DIR, DESIGNER_ID);
  const compDir = path.join(EXT_DIR, 'src', 'components', DESIGNER_ID);
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(compDir, { recursive: true });
  fs.mkdirSync(path.join(EXT_DIR, 'src', 'panels'), { recursive: true });

  let files = 0;
  for (const f of fs.readdirSync(DESIGNER_SRC)) {
    const from = path.join(DESIGNER_SRC, f);
    if (!fs.statSync(from).isFile()) continue;
    // The shared default layout belongs to the user (written by the Layout Editor): the bundled file is only a stub.
    if (f === 'tiles-extra.ts') { files++; continue; } // generated below from the panels that exist
    if (f === 'default-layout.ts' && fs.existsSync(path.join(srcDir, f))) {
      if (!fs.existsSync(path.join(compDir, f))) fs.copyFileSync(path.join(srcDir, f), path.join(compDir, f));
      files++;
      continue;
    }
    // dashboards/<id>/ is the source of truth and keeps everything (including the panel file and tests);
    // the build copy gets only what webpack needs.
    fs.copyFileSync(from, path.join(srcDir, f));
    if (!/\.test\.tsx?$/.test(f) && !/\.panel\.ts$/.test(f)) fs.copyFileSync(from, path.join(compDir, f));
    files++;
  }
  writeTilesExtra();
  fs.copyFileSync(path.join(srcDir, 'tiles-extra.ts'), path.join(compDir, 'tiles-extra.ts'));
  const designerPanel = `${DESIGNER_ID}.panel.ts`;
  const designerPanelPath = path.join(EXT_DIR, 'src', 'panels', designerPanel);
  if (!(isProtectedPanel(designerPanel) && fs.existsSync(designerPanelPath))) fs.writeFileSync(designerPanelPath, designerPanelTS());
  registerPanel({ id: DESIGNER_ID, panelId: DESIGNER_ID, title: 'Dashboard Designer', exportName: 'DashboardBuilderPanel' });
  return { files, version: versionOf(path.join(compDir, 'version.ts')) };
}

function designerPanelTS() {
  return fs.readFileSync(path.join(DESIGNER_SRC, 'dashboard-builder.panel.ts'), 'utf8');
}


function readTarget() {
  try {
    return JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'target.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function probe(url, method, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, rejectUnauthorized: false, headers }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.setTimeout(2500, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function checkClusterHealth() {
  const result = { openshift: false, bundleLive: false };
  // Everything comes from dashboard-extension/target.json (url, username, apiKey, tenantId, bundleName),
  // the same file fast-deploy.mjs uses. Nothing secret lives in this source file.
  const t = readTarget();
  if (!t || !t.url) return result;
  const base = String(t.url).replace(/\/+$/, '');

  // 1. OpenShift OAuth ping (host derived from the Cloud Pak URL: cpd-aiops.<domain> -> oauth-openshift.<domain>)
  try {
    const m = /^https:\/\/[^.]+\.(.+)$/.exec(base);
    if (m) {
      const code = await probe(`https://oauth-openshift.${m[1]}/oauth/authorize?client_id=openshift-challenging-client`, 'GET', {});
      result.openshift = (code === 401 || code === 302 || code === 200);
    }
  } catch (e) { /* reported as not connected */ }

  // 2. Bundle URL ping
  try {
    if (t.username && t.apiKey && t.tenantId) {
      const auth = `ZenApiKey ${Buffer.from(`${t.username}:${t.apiKey}`).toString('base64')}`;
      const code = await probe(`${base}/aiops/${t.tenantId}/bundles/${t.bundleName || 'alerts-examples'}/files/${t.bundleName || 'alerts-examples'}-bundle.js`, 'HEAD', { Authorization: auth });
      result.bundleLive = (code === 200);
    }
  } catch (e) { /* reported as offline */ }

  return result;
}

repairRoutesFile();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  let studioVersion = '';
  try { studioVersion = ' v' + JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version; } catch (e) { /* no package.json */ }
  console.log(`⚡ Concert Workbench${studioVersion} running at: http://127.0.0.1:${PORT}`);
  console.log(`======================================================\n`);
});
