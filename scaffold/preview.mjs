/**
 * Live preview for the Layout Editor: bundles a dashboard's real component with the esbuild that already lives in
 * dashboard-extension/node_modules (nothing is added to Studio itself) and returns JS + CSS for a preview frame.
 *
 * Imports that only resolve inside the extension (../constants, ../../helpers/useQuery ...) are looked up under
 * dashboard-extension/src/components/<dashboard>/ when the dashboards/ copy has no such file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const cache = new Map();

function tryRequire(extDir, name) {
  try { return createRequire(path.join(extDir, 'package.json'))(name); } catch (e) { return null; }
}

/** What the preview needs, and what is missing. */
export function previewStatus(extDir) {
  const missing = ['esbuild', 'react', 'react-dom/client', 'sass'].filter(n => !tryRequire(extDir, n));
  return { available: missing.length === 0, missing };
}

function stamp(root) {
  try { return fs.readdirSync(root).map(n => { const s = fs.statSync(path.join(root, n)); return n + ':' + s.mtimeMs + ':' + s.size; }).join('|'); } catch (e) { return ''; }
}

function entrySource(file, name, carbonCss) {
  return `
import React from 'react';
import { createRoot } from 'react-dom/client';
${carbonCss ? `import ${JSON.stringify(carbonCss)};` : ''}
import * as M from ${JSON.stringify(file)};
const NAME = ${JSON.stringify(name || '')};
const C = (NAME && M[NAME]) || M.default || Object.values(M).find(v => typeof v === 'function');
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    return this.state.err
      ? React.createElement('pre', { style: { margin: 12, color: '#da1e28', font: '12px/1.4 monospace', whiteSpace: 'pre-wrap' } }, 'This dashboard failed to render with the sample data:\\n' + String(this.state.err && this.state.err.message || this.state.err))
      : this.props.children;
  }
}
let root = null;
function show(props) {
  const el = document.getElementById('root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(Boundary, { key: JSON.stringify(props || {}) }, C ? React.createElement(C, props || {}) : null));
}
window.addEventListener('message', e => { if (e.data && e.data.type === 'props') show(e.data.props); });
window.addEventListener('error', e => { const el = document.getElementById('root'); if (el && !el.firstChild) el.textContent = String(e.message); });
parent.postMessage({ type: 'ready' }, '*');
`;
}

function widgetEntry(root, carbonCss) {
  const q = f => JSON.stringify(path.join(root, f));
  return `
import React from 'react';
import { createRoot } from 'react-dom/client';
${carbonCss ? `import ${JSON.stringify(carbonCss)};` : ''}
import ${q('dashboard-builder.scss')};
import { WidgetBody } from ${q('Widgets')};
import { DataHub } from ${q('datahub')};
import { BuilderCtx } from ${q('context')};
const hub = new DataHub();
const ctx = { hub, filters: [], toggleFilter() {}, setSelection() {} };
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() { return this.state.err ? React.createElement('pre', { style: { margin: 12, color: '#da1e28', font: '12px/1.4 monospace', whiteSpace: 'pre-wrap' } }, String(this.state.err && this.state.err.message || this.state.err)) : this.props.children; }
}
let rootEl = null;
function show(props) {
  const el = document.getElementById('root');
  if (!rootEl) rootEl = createRoot(el);
  const w = props && props.widget;
  rootEl.render(React.createElement(Boundary, { key: JSON.stringify(w || {}) }, w ? React.createElement(BuilderCtx.Provider, { value: ctx }, React.createElement('div', { className: 'dashboard-builder-container', style: { padding: 0, height: '100%' } }, React.createElement('div', { className: 'db-widget-body', style: { height: '100%' } }, React.createElement(WidgetBody, { w })))) : null));
}
window.addEventListener('message', e => { if (e.data && e.data.type === 'props') show(e.data.props); });
parent.postMessage({ type: 'ready' }, '*');
`;
}


function designerEntry(root, carbonCss) {
  const q = f => JSON.stringify(path.join(root, f));
  return `
import React from 'react';
import { createRoot } from 'react-dom/client';
${carbonCss ? `import ${JSON.stringify(carbonCss)};` : ''}
import ${q('dashboard-builder.scss')};
import DashboardBuilder from ${q('DashboardBuilder')};
import { registerExtraTiles } from ${q('registry')};
const st = document.createElement('style');
st.textContent = '.is-editing iframe{pointer-events:none}html,body,#root{height:100%;overflow:hidden}.dashboard-builder-container{height:100%;display:flex;flex-direction:column;overflow:hidden}.dashboard-builder-container .db-body{flex:1 1 auto;min-height:0;overflow:auto}.dashboard-builder-container .db-dock-in{top:0;height:calc(100vh - var(--db-bar-h) - 24px);min-height:0}';
document.head.append(st);
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() { return this.state.err ? React.createElement('pre', { style: { margin: 12, color: '#da1e28', font: '12px/1.4 monospace', whiteSpace: 'pre-wrap' } }, 'The Dashboard Designer failed:\\n' + String(this.state.err && this.state.err.message || this.state.err)) : this.props.children; }
}
const post = m => parent.postMessage(m, '*');
let rootEl = null, loads = 0, cur = null, parts = {}, status = '';
function draw() {
  if (!cur) return;
  if (!rootEl) rootEl = createRoot(document.getElementById('root'));
  const authoring = {
    dashboard: cur, status,
    onChange: d => post({ type: 'change', dashboard: d }),
    onSelect: id => post({ type: 'select', id }),
    partsFor: t => parts[t] || []
  };
  rootEl.render(React.createElement(Boundary, { key: loads }, React.createElement(DashboardBuilder, { authoring })));
}
window.addEventListener('message', e => {
  const m = e.data; if (!m || e.source !== parent) return;
  if (m.type === 'load') {
    if (Array.isArray(m.tiles)) registerExtraTiles(m.tiles);
    parts = m.parts || {}; status = m.status || ''; cur = m.dashboard; loads++; draw();
  } else if (m.type === 'ui') {
    window.dispatchEvent(new CustomEvent('db-ui', { detail: m.action }));
  } else if (m.type === 'meta' && cur) {
    cur = { ...cur, name: m.name != null ? m.name : cur.name, rowH: m.rowH }; if (m.status != null) status = m.status;
    draw();
  }
});
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); post({ type: 'save' }); } });
window.addEventListener('error', e => { const el = document.getElementById('root'); if (el && !el.firstChild) el.textContent = String(e.message); });
post({ type: 'ready' });
`;
}

const DESIGNER_TILE = `
import React, { useEffect, useRef, useState } from 'react';
export function Tile({ id, name, props }) {
  const ref = useRef(null); const pr = useRef(props); pr.current = props;
  const [err, setErr] = useState('');
  useEffect(() => {
    const on = e => {
      if (!ref.current || e.source !== ref.current.contentWindow || !e.data) return;
      if (e.data.type === 'ready') ref.current.contentWindow.postMessage({ type: 'props', props: pr.current || {} }, '*');
      if (e.data.type === 'fail') fetch('/preview/' + id + '.js').then(r => r.text()).then(t => setErr(String(t).slice(0, 400))).catch(() => setErr('The preview could not be loaded.'));
    };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, [id]);
  const sig = JSON.stringify(props || {});
  useEffect(() => { if (ref.current && ref.current.contentWindow) ref.current.contentWindow.postMessage({ type: 'props', props: pr.current || {} }, '*'); }, [sig]);
  if (err) return React.createElement('div', { className: 'db-empty', role: 'alert' }, React.createElement('strong', null, name + ' has no live preview here.'), React.createElement('span', null, err));
  return React.createElement('iframe', { ref, src: '/preview/' + id + '.html', title: name, style: { border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent' } });
}
`;

/** Builds (or returns the cached) bundle for one dashboard. `p` = { extDir, dashboardsDir, dir, file, component }. */
export async function buildPreview(p) {
  const st = previewStatus(p.extDir);
  if (!st.available) { const e = new Error('The preview needs these packages in dashboard-extension: ' + st.missing.join(', ') + '. Run npm install there.'); e.code = 'missing'; throw e; }
  const root = path.join(p.dashboardsDir, p.dir);
  if ((p.widget || p.designer) && !fs.existsSync(path.join(root, 'Widgets.tsx'))) { const e = new Error('The Dashboard Designer is not installed (dashboards/dashboard-builder is missing).'); e.code = 'missing'; throw e; }
  const key = p.dir + '|' + p.file + '|' + stamp(root);
  const ck = p.dir + (p.widget ? '#w' : p.designer ? '#d' : '');
  const hit = cache.get(ck);
  if (hit && hit.key === key) return hit;

  const esbuild = tryRequire(p.extDir, 'esbuild');
  const sass = tryRequire(p.extDir, 'sass');
  const nm = path.join(p.extDir, 'node_modules');
  const carbonCss = ['@carbon/styles/css/styles.css'].find(f => fs.existsSync(path.join(nm, f)));
  const extComp = path.join(p.extDir, 'src', 'components', p.dir);
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js'];
  const exists = abs => exts.some(x => { try { return fs.statSync(abs + x).isFile(); } catch (e) { return false; } });

  const plugin = {
    name: 'scaffold-preview',
    setup(build) {
      if (p.designer) {
        // embedded dashboards are shown through their own live preview frames
        const inRoot = d => { try { return fs.realpathSync(d) === fs.realpathSync(root); } catch (e) { return path.resolve(d) === path.resolve(root); } };
        build.onResolve({ filter: /^\.\/Tiles(\.tsx?)?$/ }, args => (inRoot(args.resolveDir) ? { path: 'tiles-frame', namespace: 'pv-tile' } : null));
        // anything else that reaches into the extension's panels is never needed by the editor itself
        build.onResolve({ filter: /(^|\/)panels\// }, args => (inRoot(args.resolveDir) ? { path: 'panel-stub', namespace: 'pv-empty' } : null));
        build.onLoad({ filter: /.*/, namespace: 'pv-empty' }, () => ({ contents: 'export default function Stub() { return null; }', loader: 'js' }));
        build.onLoad({ filter: /.*/, namespace: 'pv-tile' }, () => ({ contents: DESIGNER_TILE, loader: 'js', resolveDir: root }));
      }
      build.onResolve({ filter: /^\.\.?\// }, args => {
        if (!args.resolveDir.startsWith(root)) return null;
        const here = path.resolve(args.resolveDir, args.path);
        if (exists(here) || /\.s?css$/.test(args.path)) return null;
        const rel = path.relative(root, args.resolveDir);
        const alt = path.resolve(extComp, rel, args.path);
        return exists(alt) ? { path: exts.map(x => alt + x).find(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } }) } : null;
      });
      if (p.widget) {
        // widgets never show other dashboards here: the tile registry is replaced by an empty one
        build.onResolve({ filter: /^\.\/Tiles$/ }, args => (args.resolveDir === root ? { path: 'tiles-stub', namespace: 'pv-stub' } : null));
        build.onLoad({ filter: /.*/, namespace: 'pv-stub' }, () => ({ contents: 'export function Tile() { return null; }', loader: 'js' }));
      }
      build.onLoad({ filter: /\.scss$/ }, args => {
        const opts = { loadPaths: [nm, path.join(p.extDir, 'src')], quietDeps: true, silenceDeprecations: ['import', 'global-builtin', 'mixed-decls', 'legacy-js-api'], logger: sass.Logger ? sass.Logger.silent : undefined };
        if (sass.NodePackageImporter) opts.importers = [new sass.NodePackageImporter()];
        const out = sass.compile(args.path, opts);
        return { contents: out.css, loader: 'css', resolveDir: path.dirname(args.path) };
      });
    }
  };

  const res = await esbuild.build({
    stdin: { contents: p.designer ? designerEntry(root, carbonCss) : p.widget ? widgetEntry(root, carbonCss) : entrySource(path.join(root, p.file), p.component, carbonCss), resolveDir: root, loader: 'tsx', sourcefile: 'preview-entry.tsx' },
    bundle: true, write: false, outdir: 'out', format: 'iife', platform: 'browser', target: 'es2020', jsx: 'transform',
    nodePaths: [nm], logLevel: 'silent', minify: Boolean(p.designer), sourcemap: false,
    define: { 'process.env.NODE_ENV': '"development"', 'process.env.DASHBOARD_API_KEY': '""', 'process.env.DASHBOARD_TENANT_ID': '"sample-tenant"', global: 'window' },
    banner: { js: 'window.process = window.process || { env: {} };' },
    loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.gif': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.eot': 'dataurl' },
    plugins: [plugin]
  });
  const out = { key, js: '', css: '' };
  for (const f of res.outputFiles) { if (f.path.endsWith('.css')) out.css = f.text; else if (f.path.endsWith('.js')) out.js = f.text; }
  cache.set(ck, out);
  return out;
}
