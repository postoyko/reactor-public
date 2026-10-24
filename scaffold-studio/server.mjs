/**
 * Scaffold Studio Backend Server
 * Controls routes, code generation, folder sync, and live deployment streaming.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { generateCustomComposedDashboard, generateCustomSCSS, generatePanelTS } from './templates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT_DIR, 'dashboard-extension');
const DASHBOARDS_DIR = path.join(ROOT_DIR, 'dashboards');
const PORT = process.env.PORT || 4000;
let deploying = false;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Simple Router
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

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
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ routesConfig, localDashboards }));
  }

  // 4. Save Routes
  if (url.pathname === '/api/routes' && req.method === 'POST') {
    const body = await readJSONBody(req);
    if (!body || !body.spec) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid spec' }));
    }

    fs.writeFileSync(path.join(EXT_DIR, 'config', 'routes.json'), JSON.stringify(body, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // 5. Scaffold New Dashboard
  if (url.pathname === '/api/scaffold' && req.method === 'POST') {
    const config = await readJSONBody(req);
    const { id, title } = config;
    if (!id || !title) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing id or title' }));
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

// Helpers
function readJSONBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
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
  const routePath = `/${id}`;

  // Generate code based on visual component composition and API bindings
  const tsxCode = generateCustomComposedDashboard(id, title, config);
  const scssCode = generateCustomSCSS(id);
  const panelCode = generatePanelTS(id);

  // 1. Write Standalone Dashboard Files in dashboards/<id>/
  const standDir = path.join(DASHBOARDS_DIR, id);
  if (!fs.existsSync(standDir)) fs.mkdirSync(standDir, { recursive: true });

  fs.writeFileSync(path.join(standDir, `${compName}.tsx`), tsxCode);
  fs.writeFileSync(path.join(standDir, `${id}.scss`), scssCode);
  fs.writeFileSync(path.join(standDir, `${id}.panel.ts`), panelCode);
  fs.writeFileSync(path.join(standDir, `README.md`), `# ${title}\n\nGenerated by Scaffold Studio.\n`);

  // 2. Write Component Files in dashboard-extension/src/components/<id>/
  const extCompDir = path.join(EXT_DIR, 'src', 'components', id);
  if (!fs.existsSync(extCompDir)) fs.mkdirSync(extCompDir, { recursive: true });

  fs.writeFileSync(path.join(extCompDir, `${compName}.tsx`), tsxCode);
  fs.writeFileSync(path.join(extCompDir, `${id}.scss`), scssCode);

  // 3. Write Panel in dashboard-extension/src/panels/<id>.panel.ts
  fs.writeFileSync(path.join(EXT_DIR, 'src', 'panels', `${id}.panel.ts`), generatePanelTS(id));

  // 4. Register in dashboard-extension/src/index.js
  const indexPath = path.join(EXT_DIR, 'src', 'index.js');
  let indexContent = fs.readFileSync(indexPath, 'utf8');

  const panelExportName = toPascalCase(id) + 'Panel';
  if (!indexContent.includes(`window.registerCustomPanel('${panelId}'`)) {
    const exportCode = `
export const ${panelExportName} = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/${id}.panel')
  }
};
`;
    const regCode = `window.registerCustomPanel('${panelId}', ${panelExportName});\n`;
    indexContent += exportCode + regCode;
    fs.writeFileSync(indexPath, indexContent);
  }

  // 5. Add Route to routes.json
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`⚡ Scaffold Studio running at: http://127.0.0.1:${PORT}`);
  console.log(`======================================================\n`);
});
