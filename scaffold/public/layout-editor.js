// Design tab: the real Dashboard Designer (the same React editor users get in Concert Operate), running in a frame with
// sample data. This file is the shell around it: layouts (open, save, publish, default) and the tools that only make
// sense here, such as splitting a dashboard into its sections. Grid maths and validation come from designer-core.js.
import {
  GRID_COLS, TILES, defaultConfig, tileDef, compactTree, importJson, exportJson, newId, sanitizeDashboard, registerExtraTiles, availableTemplates
} from '/designer-core.js';

const S = {
  layouts: [], defaultSlug: null, designerInstalled: false,
  slug: null, dash: null, dirty: false, selected: null,
  past: [], future: [], busy: false, ready: false,
  git: null
};
let root;
let frame = null, frameReady = false, frameTimer = 0;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

// Like append(), but skips null / false / undefined (conditional buttons) instead of printing them as text.
function put(el, ...kids) { kids.flat().forEach(k => { if (k !== null && k !== undefined && k !== false) el.append(k); }); }

function api(url, body, method) {
  return fetch(url, body === undefined ? {} : { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async res => {
      const text = await res.text();
      let data = null; try { data = JSON.parse(text); } catch (e) { /* not json */ }
      if (!res.ok || !data || data.error) throw new Error((data && data.error) || `Server answered ${res.status}`);
      return data;
    }, () => { throw new Error('Cannot reach Studio server (is "npm start" still running?)'); });
}

function say(msg, ok = true) {
  const el = root && root.querySelector('#le-status');
  if (el) { el.textContent = msg; el.style.color = ok ? 'var(--green)' : '#da1e28'; }
  if (typeof logTerminal === 'function') logTerminal((ok ? '' : '') + msg);
}

// ---------- state helpers ----------
function snapshot() { return JSON.stringify(S.dash.widgets); }
function pushHistory(before) {
  S.past.push(before);
  // Layouts holding pictures are big: keep fewer undo steps for them.
  const cap = before.length > 1000000 ? 6 : 100;
  while (S.past.length > cap) S.past.shift();
  S.future = [];
}
// Changes made here (splitting, converting, removing missing sections) replace the Designer's content; ordinary editing
// happens inside the Designer, which keeps its own undo. Only the last such change here can be undone.
function commit(before, widgets) {
  if (before !== undefined) pushHistory(before);
  S.dash.widgets = widgets; S.dirty = true; renderAll(); sendLoad();
}
function undoChange() { if (!S.past.length) return; S.dash.widgets = JSON.parse(S.past.pop()); S.selected = null; S.dirty = true; renderAll(); sendLoad(); }
const selectedWidget = () => (S.dash ? S.dash.widgets.find(w => w.id === S.selected) : undefined);

function confirmDiscard() { return !S.dirty || confirm('This layout has unsaved changes. Discard them?'); }

function openDash(slug, dash) {
  S.slug = slug; S.dash = dash; S.dirty = false; S.selected = null; S.past = []; S.future = [];
  renderAll(); sendLoad();
}

// ---------- server actions ----------
async function refreshTiles() {
  try { const d = await api('/api/tiles'); S.skipped = d.skipped || {}; S.tiles = d.tiles; registerExtraTiles(d.tiles); sendLoad(); } catch (e) { /* built-in tiles still work */ }
  try { const d = await api('/api/split/parts'); registerSplits(d.parts || {}); registerSuggestions(d.suggest || {}); } catch (e) { /* none made yet */ }
}
/** Widget suggestions Studio worked out for sections of dashboards it made splittable (curated entries win). */
function registerSuggestions(map) {
  Object.entries(map).forEach(([tile, secs]) => {
    SECTION_WIDGETS[tile] = { ...secs, ...(SECTION_WIDGETS[tile] && SECTION_WIDGETS[tile].__curated ? SECTION_WIDGETS[tile] : {}) };
  });
}
/** Dashboards made splittable by Studio ("Split dashboards into tiles"): their sections become parts and a stacked starting recipe. */
function registerSplits(map) {
  Object.entries(map).forEach(([tile, parts]) => {
    if (RECIPES[tile] && !RECIPES[tile].auto) return; // hand-made recipes win
    PARTS[tile] = parts;
    let y = 0;
    RECIPES[tile] = {
      auto: true, tile,
      note: 'its sections, stacked in the original order. They share one live instance, so a click in one tile updates the others. Move and resize them as you like.',
      missing: '',
      parts: parts.map(([id]) => { const row = [id, 0, y, 12, 5]; y += 5; return row; })
    };
  });
}

async function refreshList() {
  const d = await api('/api/layouts');
  S.layouts = d.layouts; S.defaultSlug = d.defaultSlug; S.designerInstalled = d.designerInstalled;
}

async function loadLayout(slug) {
  if (!confirmDiscard()) { renderToolbar(); return; }
  try { const d = await api('/api/layouts/' + encodeURIComponent(slug)); openDash(slug, d.dashboard); say(`Opened “${d.dashboard.name}”.`); }
  catch (e) { say('Could not open: ' + e.message, false); }
}

function newLayout() {
  if (!confirmDiscard()) return;
  const name = prompt('Name for the new dashboard:', 'New dashboard');
  if (!name) return;
  openDash(null, { id: newId('d'), name: name.slice(0, 80), updated: Date.now(), widgets: [] });
  S.dirty = true; renderToolbar();
}

function duplicateLayout() {
  if (!S.dash || !confirmDiscard()) return;
  const copy = JSON.parse(JSON.stringify(S.dash));
  copy.id = newId('d'); copy.name = (copy.name + ' (copy)').slice(0, 80);
  copy.widgets.forEach(w => { w.id = newId('w'); });
  openDash(null, copy); S.dirty = true; renderToolbar();
}

async function save() {
  if (!S.dash) return false;
  try {
    const d = await api('/api/layouts', { slug: S.slug, dashboard: S.dash });
    S.slug = d.slug; S.dirty = false;
    await refreshList();
    await refreshGit();
    say(`Saved dashboards/layouts/${d.slug}.json` + (d.defaultUpdated ? ' (the starting dashboard was updated too: deploy to ship it)' : '') + (d.dropped ? `. ${d.dropped} unusable widget(s) were dropped.` : '.'));
    renderToolbar();
    return true;
  } catch (e) { say('NOT saved: ' + e.message, false); return false; }
}

async function removeLayout() {
  if (!S.slug) { if (confirm('Discard this unsaved dashboard?')) { S.dash = null; renderAll(); } return; }
  if (!confirm(`Delete dashboard “${S.dash.name}”? This removes dashboards/layouts/${S.slug}.json.`)) return;
  try {
    await api('/api/layouts/delete', { slug: S.slug });
    S.dash = null; S.slug = null; S.dirty = false;
    await refreshList(); say('Dashboard deleted.'); renderAll();
  } catch (e) { say('NOT deleted: ' + e.message, false); }
}

async function setDefault(andDeploy) {
  if (!S.dash) return;
  if (!S.dash.widgets.length) { say('Add at least one widget first.', false); return; }
  if (S.dirty || !S.slug) { if (!(await save())) return; }
  try {
    await api('/api/layouts/default', { slug: S.slug });
    await refreshList();
    say(`“${S.dash.name}” is now everyone’s starting dashboard (written to dashboards/dashboard-builder/default-layout.ts).` + (andDeploy ? ' Deploying…' : ' Click Build & Deploy to ship it.'));
    renderToolbar();
    if (andDeploy && typeof triggerDeploy === 'function') triggerDeploy();
  } catch (e) { say('Default NOT set: ' + e.message, false); }
}

async function publish(andDeploy) {
  if (!S.dash) return;
  if (!S.dash.widgets.length) { say('Add at least one widget first.', false); return; }
  if (S.dirty || !S.slug) { if (!(await save())) return; }
  try {
    const d = await api('/api/layouts/publish', { slug: S.slug });
    await refreshList();
    const g = d.git ? (d.git.committed ? ` Committed ${d.git.sha} on ${d.git.branch}.` : d.git.error ? ` Not committed: ${d.git.error}` : '') : '';
    say(`Published as the page ${d.route} (added to the sidebar).` + (andDeploy ? ' Deploying…' : ' Click Build & Deploy to put it in Concert Operate.') + g, !(d.git && d.git.error));
    await refreshGit();
    renderToolbar();
    if (typeof fetchDashboards === 'function') fetchDashboards();
    if (andDeploy && typeof triggerDeploy === 'function') triggerDeploy();
  } catch (e) { say('NOT published: ' + e.message, false); }
}

/** Saves every starter template as its own layout (tpl-<id>), publishes each as a sidebar page, then deploys. */
async function publishAllTemplates() {
  const list = availableTemplates();
  if (!S.designerInstalled) { say('Install the Dashboard Designer first (Setup tab).', false); return; }
  if (!confirm(`Publish all ${list.length} starter templates as live dashboards in the Concert Operate sidebar and deploy? Existing template pages are refreshed from the starter versions (edits to them are replaced).`)) return;
  let ok = 0, lost = 0; const bad = [];
  for (const t of list) {
    const slug = 'tpl-' + t.id;
    try {
      const dash = { id: 'd-tpl-' + t.id, name: t.name, updated: Date.now(), widgets: t.build(), ...(t.bar ? { bar: t.bar } : {}), ...(t.rowH ? { rowH: t.rowH } : {}) };
      say(`Publishing ${ok + bad.length + 1} of ${list.length}: ${t.name}…`);
      const sv = await api('/api/layouts', { slug, dashboard: dash });
      lost += sv.dropped || 0;
      await api('/api/layouts/publish', { slug });
      ok++;
    } catch (e) { bad.push(`${t.name}: ${e.message}`); }
  }
  await refreshList();
  say(`Published ${ok} of ${list.length} templates.` + (lost ? ` ${lost} widget(s) were dropped as unusable.` : '') + (bad.length ? ' Not published: ' + bad.join('; ') : ' Deploying…'), !bad.length);
  if (typeof fetchDashboards === 'function') fetchDashboards();
  if (ok && typeof triggerDeploy === 'function') triggerDeploy();
}

async function unpublish() {
  if (!S.slug || !confirm('Remove this page from the Concert Operate sidebar? The dashboard itself stays saved. Deploy afterwards to remove it from the cluster.')) return;
  try {
    await api('/api/layouts/unpublish', { slug: S.slug });
    await refreshList(); say('Unpublished. Deploy to remove the page from Concert Operate.'); renderToolbar();
    if (typeof fetchDashboards === 'function') fetchDashboards();
  } catch (e) { say('NOT unpublished: ' + e.message, false); }
}

const publishedRoute = () => { const l = S.layouts.find(x => x.slug === S.slug); return l ? l.published : null; };

async function openFor({ title, panelFile, publishedSlug }) {
  await open();
  if (!confirmDiscard()) return;
  if (publishedSlug) { try { const d = await api('/api/layouts/' + encodeURIComponent(publishedSlug)); openDash(publishedSlug, d.dashboard); say(`Opened the layout published as “${title}”.`); } catch (e) { say('Could not open: ' + e.message, false); } return; }
  // Reopen what was saved for this dashboard instead of splitting it again (a fresh split on every visit loses earlier edits).
  const layoutName = `${title} (dashboard)`.slice(0, 80);
  try {
    await refreshList();
    const saved = S.layouts.find(l => l.name === layoutName || l.name === `${title} (layout)`.slice(0, 80));
    if (saved) { const d = await api('/api/layouts/' + encodeURIComponent(saved.slug)); openDash(saved.slug, d.dashboard); say(`Opened your saved layout for “${title}” (${saved.slug}). To start again from the original split, delete it (Delete button) and open the dashboard again.`); return; }
  } catch (e) { /* no saved layouts to look at: start from the original */ }
  const id = panelFile ? panelFile.replace(/\.panel\.ts$/, '') : null;
  const td = id ? tileDef('tile:' + id) : null;
  const dash = { id: newId('d'), name: `${title} (dashboard)`.slice(0, 80), updated: Date.now(), widgets: [] };
  const rec = id ? RECIPES[id] : undefined;
  if (rec) {
    dash.widgets.push(...recipeWidgets(rec, 0, 0));
    if (rec.keep && td) dash.widgets.push({ id: newId('w'), type: 'tile:' + id, title: td.label, x: 0, y: dash.widgets.reduce((m, x) => Math.max(m, x.y + x.h), 0), w: GRID_COLS, h: td.h, config: { ...defaultConfig('tile:' + id, 'getAlerts'), part: rec.keep.part } });
  }
  else if (td) dash.widgets.push({ id: newId('w'), type: 'tile:' + id, title: td.label, x: 0, y: 0, w: td.w, h: td.h, config: defaultConfig('tile:' + id, 'getAlerts') });
  openDash(null, dash); S.dirty = true; renderAll();
  if (rec && rec.parts) { say(`“${title}” split into ${dash.widgets.length} section tiles: ${rec.note} Move, resize or remove them, add other widgets around them, Save, then Publish as page. The original route is not changed.`); return; }
  if (rec) { say(`“${title}” decomposed into ${dash.widgets.length} editable widgets (${rec.note}) ${rec.missing ? 'Not reproduced as widgets: ' + rec.missing : ''} Edit them, Save, then Publish as page. The original route is not changed.`); return; }
  say(td
    ? `“${td.label}” is one custom component, so it is placed as a single tile: it cannot be split into widgets. Add widgets around it, Save, then Publish as page. The original route is not changed.`
    : `“${title}” cannot be embedded as a tile: ${(id && S.skipped && S.skipped[id]) || (id ? `Studio found no src/panels/${id}.panel.ts in the dashboard-extension folder it is running against` : 'this route has no panel file')}. Started an empty layout instead.`, Boolean(td));
}

async function clearDefault() {
  try { await api('/api/layouts/default', { slug: null }); await refreshList(); say('Starting dashboard cleared. Deploy to ship that.'); renderToolbar(); }
  catch (e) { say('Not cleared: ' + e.message, false); }
}

function exportFile() {
  const blob = new Blob([exportJson(S.dash)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: (S.slug || 'dashboard') + '.json' });
  document.body.append(a); a.click(); a.remove();
}

function importFile(file) {
  if (!file || !confirmDiscard()) return;
  const r = new FileReader();
  r.onload = () => {
    const res = importJson(String(r.result || ''));
    if ('error' in res) { say(res.error, false); return; }
    openDash(null, res.dashboard); S.dirty = true; renderToolbar();
    say(`Imported “${res.dashboard.name}” (${res.dashboard.widgets.length} widgets)${res.dropped ? `, ${res.dropped} could not be used` : ''}. Save to keep it.`);
  };
  r.readAsText(file);
}


// ---------- Decomposing an existing dashboard into editable widgets ----------
// A dashboard is one hand-written component, so it cannot be split automatically. For the toolkit dashboards whose
// structure is known (read from their source), these recipes rebuild the same KPIs, charts and tables from live-bound
// widgets. They are equivalents: the original's own styling and any custom card are not reproduced.
/** Dashboards that can show just one of their sections in a tile (their `part` prop): [part, label]. */
const PARTS = {
  'incident-atlas': [
    ['header', 'Title, status and refresh'],
    ['kpis', 'The KPI cards'],
    ['tools', 'Mode, layers and view controls'],
    ['graph', 'The incident / alert graph'],
    ['playback', 'Replay bar and timeline'],
    ['incidents', 'Incidents list'],
    ['details', 'Selected incident: impact, changes, similar'],
    ['datacheck', 'Data check'],
    ['help', 'How to read this']
  ],
  'incident-dashboard': [
    ['header', 'Title, live status and refresh'],
    ['kpis', 'The six KPI cards'],
    ['services', 'Business & Application Services Health'],
    ['priority', 'Incidents by Priority'],
    ['critical', 'Critical Alert Categories (Sev 6)'],
    ['major', 'Major Alert Categories (Sev 5)'],
    ['sources', 'Alert Ingestion Sources'],
    ['incidents', 'Active Incidents table'],
    ['intel', 'Top Resources / Key Observations / Recent Sev 6'],
    ['stream', 'Recent Alerts Stream']
  ],
  'cognitive-deep-dive': [
    ['header', 'Title, refresh rate and About'],
    ['lenses', 'The three lens cards'],
    ['workspace', 'Drill-down for the selected lens']
  ],
  'telco-causal-gen2': [
    ['header', 'Title, live status and refresh'],
    ['incidents', 'Incident triage list'],
    ['topology', '3D / 2D topology mesh'],
    ['insights', 'Triage, Sunburst, Timeline, Link Explorer and Sankey views'],
    ['alarms', 'Focused alarms for the selected node'],
    ['blast', 'Blast radius and SPOF island'],
    ['ingest', 'Ingest rate'],
    ['remediation', 'Remediation policies']
  ]
};
const partLabel = (tileId, part) => { const p = (PARTS[tileId] || []).find(x => x[0] === part); return p ? p[1] : String(part); };
/** A tile that asks for a section its dashboard no longer has (renamed or removed since the layout was saved). */
const staleSection = w => { if (!w.type.startsWith('tile:')) return false; const s = sectionOf(w), parts = PARTS[w.type.slice(5)]; return Boolean(s && parts && !parts.some(x => x[0] === s)); };
const sectionOf = w => (w.config && w.config.props && typeof w.config.props.part === 'string' ? w.config.props.part : '');

const RECIPES = {
  'incident-dashboard': {
    tile: 'incident-dashboard',
    note: 'title and refresh, the six KPI cards, service health, four charts, the incidents table, the Top Resources / Key Observations / Recent Sev 6 tabs and the alerts stream. Each one runs the real dashboard code with live data, so the numbers match the original exactly.',
    missing: '',
    parts: [
      ['header', 0, 0, 12, 2],
      ['kpis', 0, 2, 12, 2],
      ['services', 0, 4, 12, 4],
      ['priority', 0, 8, 3, 4],
      ['critical', 3, 8, 3, 4],
      ['major', 6, 8, 3, 4],
      ['sources', 9, 8, 3, 4],
      ['incidents', 0, 12, 7, 8],
      ['intel', 7, 12, 5, 8],
      ['stream', 0, 20, 12, 8]
    ]
  },
  'cognitive-deep-dive': {
    tile: 'cognitive-deep-dive',
    note: 'title and refresh rate, the three lens cards and the drill-down workspace. They share one live feed and one selected lens, so clicking a lens card in one tile changes the workspace tile. Each runs the real dashboard code.',
    missing: '',
    parts: [
      ['header', 0, 0, 12, 3],
      ['lenses', 0, 3, 12, 4],
      ['workspace', 0, 7, 12, 12]
    ]
  },
  'incident-atlas': {
    tile: 'incident-atlas',
    note: 'header, KPI cards, view controls, graph, replay bar, incident list, selected-incident details, data check and help. They share one live data feed and one selection, so picking an incident in one tile updates the others. Each runs the real dashboard code.',
    missing: '',
    parts: [
      ['header', 0, 0, 12, 2],
      ['kpis', 0, 2, 8, 3],
      ['tools', 0, 5, 8, 3],
      ['graph', 0, 8, 8, 14],
      ['playback', 0, 22, 8, 6],
      ['incidents', 8, 2, 4, 8],
      ['details', 8, 10, 4, 12],
      ['datacheck', 8, 22, 4, 8],
      ['help', 8, 30, 4, 3]
    ]
  },
  'telco-causal-gen2': {
    tile: 'telco-causal-gen2',
    note: 'title and refresh, incident triage, the 3D / 2D topology, the insight views, focused alarms, blast radius, ingest rate and remediation. They share one live data feed and one selection, so picking an incident or node in one tile updates the others. Each runs the real dashboard code, so the numbers match the original.',
    missing: '',
    parts: [
      ['header', 0, 0, 12, 2],
      ['incidents', 0, 2, 3, 14],
      ['topology', 3, 2, 6, 14],
      ['alarms', 9, 2, 3, 7],
      ['blast', 9, 9, 3, 7],
      ['insights', 0, 16, 12, 12],
      ['ingest', 0, 28, 6, 8],
      ['remediation', 6, 28, 6, 8]
    ]
  },
  'telco-causal': {
    keep: { part: '3D force mesh, Sankey signal stream, blast-radius radar and remediation policies' },
    note: 'numbers (network elements, alerts, critical alerts, incidents), alerts by severity and by probe, the incident list and the alarm table.',
    missing: 'The 3D mesh, Sankey signal stream, blast-radius radar and remediation policies are custom visuals, so a surrogate tile stands in for them at the bottom. Its "Automated Policies: 178 Actions" card is a fixed number in the original (not live data), so it is not reproduced. Resize or move the surrogate.',
    widgets: [
      ['kpi', 'Network elements', 0, 0, 3, 3, { query: 'getAlerts', metric: 'distinct', valueField: 'resource' }],
      ['kpi', 'Active alerts', 3, 0, 3, 3, { query: 'getAlerts', metric: 'count' }],
      ['kpi', 'Critical alerts', 6, 0, 3, 3, { query: 'getAlerts', metric: 'count', where: { field: 'severityLabel', value: 'Critical' } }],
      ['kpi', 'Incidents', 9, 0, 3, 3, { query: 'getStories', metric: 'count' }],
      ['bar', 'Alerts by severity', 0, 3, 6, 6, { query: 'getAlerts', groupBy: 'severityLabel' }],
      ['bar', 'Alerts per probe', 6, 3, 6, 6, { query: 'getAlerts', groupBy: 'sender', limit: 8 }],
      ['table', 'Incidents', 0, 9, 5, 9, { query: 'getStories', columns: ['priority', 'title', 'state', 'team', 'alertCount'], limit: 50 }],
      ['table', 'Alarms', 5, 9, 7, 9, { query: 'getAlerts', columns: ['severityLabel', 'resource', 'summary', 'state'], limit: 50 }]
    ]
  },
  'top-n': {
    note: 'Open alerts counted per resource (the original also lets you switch the grouping; change "Group by" in the inspector).',
    widgets: [['bar', 'Top alerts by resource', 0, 0, 6, 8, { query: 'getAlerts', groupBy: 'resource', limit: 10 }]]
  },
  'top-n-incidents': {
    note: 'Incidents counted per state (the original lets you switch the grouping; change "Group by" in the inspector).',
    widgets: [['bar', 'Top incidents by state', 0, 0, 6, 8, { query: 'getStories', groupBy: 'state', limit: 10 }]]
  },
  'incidents-pie-chart': {
    note: 'Incidents by state as a donut (the original lets you switch the grouping; change "Group by" in the inspector).',
    widgets: [['donut', 'Incidents by state', 0, 0, 4, 7, { query: 'getStories', groupBy: 'state', limit: 6 }]]
  }
};
const recipeFor = type => (type && type.startsWith('tile:') ? RECIPES[type.slice(5)] : undefined);

function recipeWidgets(recipe, ox, oy) {
  const native = (recipe.widgets || []).map(([type, title, x, y, w, h, cfg]) => ({
    id: newId('w'), type, title, x: x + ox, y: y + oy, w, h, config: { ...defaultConfig(type, cfg.query), ...cfg }
  }));
  const sections = (recipe.parts || []).map(([part, x, y, w, h]) => {
    const label = partLabel(recipe.tile, part);
    return { id: newId('w'), type: 'tile:' + recipe.tile, title: label, x: x + ox, y: y + oy, w, h, config: { ...defaultConfig('tile:' + recipe.tile, 'getAlerts'), part: label, props: { part }, chromeless: true } };
  });
  return [...native, ...sections];
}

// Sections of a real dashboard that can be turned into configurable Designer widgets (real toolkit data widgets bound to
// live queries: pick the query, field, filter, columns and limit in the settings). They are equivalents, not copies:
// custom logic in the original (keyword buckets, service grid, live status) is approximated or left as a real section.
const QA = 'getAlerts', QS = 'getStories';
const SECTION_WIDGETS = {
  'incident-dashboard': {
    header: { note: 'The live status and refresh controls are not reproduced.', items: [['text', 'Incident & Alert Operations Dashboard', { text: 'Incident & Alert Operations Dashboard' }]] },
    kpis: { note: 'Top Alert Ingestion becomes "Alert sources"; P1/P2 becomes P1 only (widgets filter on one value).', items: [
      ['kpi', 'Total incidents', { query: QS, metric: 'count' }],
      ['kpi', 'P1 incidents', { query: QS, metric: 'count', where: { field: 'priority', value: '1' } }],
      ['kpi', 'Critical alerts', { query: QA, metric: 'count', where: { field: 'severityLabel', value: 'Critical' } }],
      ['kpi', 'Major alerts', { query: QA, metric: 'count', where: { field: 'severityLabel', value: 'Major' } }],
      ['kpi', 'Alert sources', { query: QA, metric: 'distinct', valueField: 'sender' }],
      ['kpi', 'Max incident scope', { query: QS, metric: 'max', valueField: 'alertCount' }]
    ] },
    priority: { note: '', items: [['donut', 'Incidents by priority', { query: QS, groupBy: 'priority', limit: 6 }]] },
    critical: { note: 'Grouped by alert summary instead of the original keyword buckets.', items: [['bar', 'Critical alerts (Sev 6)', { query: QA, groupBy: 'summary', limit: 6, where: { field: 'severityLabel', value: 'Critical' } }]] },
    major: { note: 'Grouped by alert summary instead of the original keyword buckets.', items: [['bar', 'Major alerts (Sev 5)', { query: QA, groupBy: 'summary', limit: 5, where: { field: 'severityLabel', value: 'Major' } }]] },
    sources: { note: '', items: [['bar', 'Alert ingestion sources', { query: QA, groupBy: 'sender', limit: 5 }]] },
    incidents: { note: 'No service column or deep links.', items: [['table', 'Active incidents', { query: QS, columns: ['priority', 'title', 'state', 'team', 'alertCount'], limit: 50 }]] },
    intel: { note: 'Shows the top resources by critical alerts; Key Observations is not reproduced.', items: [['bar', 'Top resources (Sev 6)', { query: QA, groupBy: 'resource', limit: 5, where: { field: 'severityLabel', value: 'Critical' } }]] },
    stream: { note: 'No time-window dropdown or service column.', items: [['table', 'Recent alerts', { query: QA, columns: ['severityLabel', 'summary', 'resource', 'sender', 'state', 'lastOccurrence'], limit: 100, sortBy: 'lastOccurrence', sortDesc: true }]] }
  }
};
SECTION_WIDGETS['incident-dashboard'].__curated = true;
const sectionConv = w => { const t = w.type.startsWith('tile:') ? w.type.slice(5) : ''; const p = sectionOf(w); return t && p && SECTION_WIDGETS[t] ? SECTION_WIDGETS[t][p] : null; };

function convertWidgets(list) {
  const out = []; const notes = [];
  S.dash.widgets.forEach(w => {
    const conv = list.includes(w.id) ? sectionConv(w) : null;
    if (!conv) { out.push(w); return; }
    const n = conv.items.length;
    const cw = Math.max(Math.floor(w.w / n), 1);
    conv.items.forEach(([type, title, cfg, meta], i) => {
      if (meta) notes.push(`“${title}”: ${meta.traced ? 'read from the dashboard code' : 'guessed'}${meta.notes && meta.notes.length ? ' (' + meta.notes.join('; ') + ')' : ''}.`);
      out.push({ id: newId('w'), ...(w.parent ? { parent: w.parent } : {}), type, title, x: w.x + i * cw, y: w.y, w: i === n - 1 ? w.w - cw * (n - 1) : cw, h: w.h, config: { ...defaultConfig(type, cfg.query || 'getAlerts'), ...cfg } });
    });
    if (conv.note) notes.push(`${w.title}: ${conv.note}`);
  });
  S.selected = null;
  commit(snapshot(), out);
  return notes;
}
function convertSelectedSection() {
  const w = selectedWidget(); if (!w || !sectionConv(w)) return;
  const notes = convertWidgets([w.id]);
  say(`“${w.title}” is now configurable widget(s): select one to change its query, field, filter, columns or limit. ${notes.join(' ')} “Undo change” brings the real section back.`);
}
function convertAllSections() {
  const ids = S.dash.widgets.filter(w => sectionConv(w)).map(w => w.id);
  if (!ids.length) return;
  const notes = convertWidgets(ids);
  say(`Converted ${ids.length} section(s) to configurable widgets (sections with no equivalent stay as real code). ${notes.join(' ')} “Undo change” brings them back.`);
}

function decomposeSelected() {
  const w = selectedWidget(); const r = w && recipeFor(w.type);
  if (!r) return;
  const rest = S.dash.widgets.filter(x => x.id !== w.id);
  // Everything that was below the tile moves down by the height the new widgets need.
  const made = recipeWidgets(r, 0, w.y).map(m => (w.parent ? { ...m, parent: w.parent } : m));
  const newH = made.reduce((m, x) => Math.max(m, x.y + x.h), w.y) - w.y;
  const keptTile = r.keep ? [{ ...w, x: 0, y: w.y + newH, w: GRID_COLS, config: { ...w.config, part: r.keep.part } }] : [];
  const used = newH + (r.keep ? w.h : 0);
  const shift = Math.max(used - w.h, 0);
  const moved = rest.map(x => ((x.parent || '') === (w.parent || '') && x.y >= w.y + w.h ? { ...x, y: x.y + shift } : x));
  S.selected = made[0].id;
  commit(snapshot(), compactTree([...moved, ...made, ...keptTile]));
  say(r.parts ? `Split “${w.title}” into ${made.length} section tiles that keep the real dashboard's live data. “Undo change” puts the original back.` : `Decomposed “${w.title}” into ${made.length} editable widget${made.length === 1 ? '' : 's'}. ${r.missing ? r.missing : '“Undo change” puts the original back.'}`);
}


let closeOpenMenu = null;
document.addEventListener('pointerdown', e => { if (closeOpenMenu && !e.target.closest('.le-menu')) closeOpenMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && closeOpenMenu) closeOpenMenu(); });

/** A button that opens a menu. `fill(pop, close)` adds the items; use mi() / msep() / mlabel(). */
function menu(label, fill, o = {}) {
  const wrap = h('div', { class: 'le-menu' });
  let pop = null;
  const btn = h('button', { class: o.cls || 'btn btn-secondary btn-sm', title: o.title, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: () => {
      if (pop) { closeOpenMenu(); return; }
      if (closeOpenMenu) closeOpenMenu();
      pop = h('div', { class: 'le-pop' + (o.right ? ' right' : ''), role: 'menu' });
      const close = () => { if (pop) { pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); } closeOpenMenu = null; };
      fill(pop, close);
      wrap.append(pop); btn.setAttribute('aria-expanded', 'true'); closeOpenMenu = close;
    } }, label);
  wrap.append(btn);
  return wrap;
}
function mi(pop, close, label, fn, o = {}) {
  pop.append(h('button', { class: 'le-mi' + (o.danger ? ' danger' : '') + (o.on ? ' on' : ''), role: 'menuitem', title: o.title, disabled: o.disabled, onclick: () => { close(); fn(); } },
    h('span', { class: 'le-mi-t' }, label), o.meta ? h('span', { class: 'le-mi-m' }, o.meta) : null));
}
const msep = pop => pop.append(h('div', { class: 'le-sep' }));
const mlabel = (pop, t) => pop.append(h('div', { class: 'le-mlabel' }, t));

const staleCount = () => (S.dash ? S.dash.widgets.filter(staleSection).length : 0);
function removeStale() {
  if (!S.dash) return;
  const before = snapshot();
  commit(before, S.dash.widgets.filter(w => !staleSection(w)));
  say('Removed the tiles with a missing section. Save to keep this.');
}


// ---------- versions in git (Setup > Git). Only dashboard files are committed; see scaffold/git.mjs ----------
async function refreshGit() { try { S.git = await api('/api/git/status'); } catch (e) { S.git = null; } }

async function gitAction(op, done) {
  try {
    const d = await api('/api/git/' + op, {});
    await refreshGit(); renderToolbar();
    say(done(d));
  } catch (e) { say(`git ${op}: ${e.message}`, false); await refreshGit(); renderToolbar(); }
}

async function gitCommit() {
  const g = S.git;
  if (!g || !g.changes.length) return;
  if (S.dirty && confirm('This dashboard has unsaved changes. Save them first, so they are part of the commit?')) { if (!(await save())) return; }
  const names = Array.from(new Set(g.changes.map(c => c.slug).filter(Boolean)));
  const files = g.changes.map(c => `  ${c.change}: ${c.path}`).join('\n');
  const message = prompt(`Commit ${g.changes.length} dashboard file${g.changes.length === 1 ? '' : 's'} on ${g.branch}:\n${files}\n\nMessage:`,
    names.length ? `Update dashboard${names.length === 1 ? '' : 's'} ${names.join(', ')}` : 'Update dashboards');
  if (!message) return;
  try {
    const d = await api('/api/git/commit', { message });
    await refreshGit(); renderToolbar();
    say(d.committed ? `Committed ${d.sha} on ${d.branch} (${d.files.length} file${d.files.length === 1 ? '' : 's'}). Push to share it.` : 'Nothing to commit.');
  } catch (e) { say('NOT committed: ' + e.message, false); }
}

async function gitPull() {
  if (S.dirty && !confirm('Pulling can change saved dashboards, and this one has unsaved changes. Pull anyway? (Your unsaved changes stay in the editor.)')) return;
  await gitAction('pull', d => d.note);
  await refreshList(); renderToolbar();
}

/** Lists the committed versions of the open dashboard; opening one puts it in the editor as unsaved changes. */
async function showHistory() {
  if (!S.slug) return;
  let versions;
  try { versions = (await api('/api/git/history', { slug: S.slug })).versions; } catch (e) { say('History: ' + e.message, false); return; }
  const dlg = h('dialog', { class: 'le-dlg', 'aria-label': 'Versions of this dashboard' });
  const close = () => { dlg.close(); dlg.remove(); };
  const restore = async v => {
    if (!confirmDiscard()) return;
    try {
      const d = await api('/api/git/version', { slug: S.slug, sha: v.sha });
      const slug = S.slug;
      close();
      openDash(slug, d.dashboard); S.dirty = true; renderToolbar();
      say(`Opened the version from ${new Date(v.date).toLocaleString()} (${v.sha}). Nothing is changed until you Save; then Publish and Commit to make it the current version.` + (d.dropped ? ` ${d.dropped} unusable widget(s) were dropped.` : ''));
    } catch (e) { say('Could not open that version: ' + e.message, false); }
  };
  put(dlg,
    h('div', { class: 'le-dlg-head' }, h('strong', {}, `Versions of “${S.dash.name}”`), h('button', { class: 'btn btn-secondary btn-sm', onclick: close }, 'Close')),
    h('p', { class: 'le-hint' }, `Committed versions of dashboards/layouts/${S.slug}.json, newest first. Opening one never changes history: it becomes a new version when you save, publish and commit it.`),
    versions.length
      ? h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Who'), h('th', {}, 'Message'), h('th', {}, ''))),
        h('tbody', {}, versions.map(v => h('tr', {},
          h('td', { style: 'white-space:nowrap' }, new Date(v.date).toLocaleString()), h('td', {}, v.author), h('td', {}, h('code', {}, v.sha), ' ', v.subject),
          h('td', {}, h('button', { class: 'btn btn-secondary btn-sm', onclick: () => restore(v) }, 'Open'))))))
      : h('p', {}, 'This dashboard has no committed versions yet. Commit it from Versions.'));
  root.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

function gitMenu() {
  const g = S.git;
  const n = g && g.repo ? g.changes.length : 0;
  return menu(['Versions', n ? h('span', { class: 'le-badge', title: `${n} dashboard file(s) not committed` }, String(n)) : null, h('span', { class: 'le-caret' }, '▾')], (pop, close) => {
    if (!g) { mlabel(pop, 'git status unavailable'); mi(pop, close, 'Try again', async () => { await refreshGit(); renderToolbar(); }); return; }
    if (!g.repo) { mlabel(pop, 'This folder is not a git repository'); return; }
    mlabel(pop, `Branch ${g.branch || '(none)'}${g.ahead ? ` · ${g.ahead} to push` : ''}${g.behind ? ` · ${g.behind} to pull` : ''}`);
    const stop = g.busy ? 'git is in the middle of a merge or rebase: finish it in a terminal' : !g.branchAllowed ? `Studio may not commit to ${g.branch || 'this branch'} (Setup > Git)` : null;
    if (stop) mlabel(pop, stop);
    mi(pop, close, n ? `Commit ${n} changed file${n === 1 ? '' : 's'}…` : 'Nothing to commit', gitCommit, { disabled: !n || Boolean(stop), title: 'Commits the dashboard files only (layouts, published copies, sidebar entries), never code' });
    mi(pop, close, 'Push', () => gitAction('push', d => `Pushed ${d.branch}.`), { disabled: Boolean(stop) || (g.upstream && !g.ahead), meta: g.ahead ? `${g.ahead}` : '' });
    mi(pop, close, 'Pull', gitPull, { disabled: Boolean(stop), meta: g.behind ? `${g.behind}` : '', title: 'Brings in what others pushed. Stops, changing nothing, if the same files changed on both sides.' });
    msep(pop);
    mi(pop, close, 'History of this dashboard…', showHistory, { disabled: !S.slug, title: S.slug ? 'Committed versions; open one to bring it back' : 'Save the dashboard first' });
    mi(pop, close, 'Refresh', async () => { await refreshGit(); renderToolbar(); });
  });
}

function renderToolbar() {
  if (!root) return;
  const bar = root.querySelector('#le-bar'); bar.replaceChildren();
  const has = Boolean(S.dash);
  const isDefault = has && S.slug && S.slug === S.defaultSlug;
  const route = publishedRoute();
  const noDesigner = S.designerInstalled ? undefined : 'Install the Dashboard Designer first (Setup tab)';
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: e => { importFile(e.target.files[0]); e.target.value = ''; } });

  const layouts = menu(['Dashboards', h('span', { class: 'le-caret' }, '▾')], (pop, close) => {
    mlabel(pop, S.layouts.length ? 'Saved dashboards' : 'No saved dashboards yet');
    S.layouts.forEach(l => mi(pop, close, l.name, () => loadLayout(l.slug), { on: l.slug === S.slug, meta: `${l.widgets}${l.slug === S.defaultSlug ? ' · default' : ''}` }));
    msep(pop);
    mi(pop, close, 'New dashboard…', newLayout);
    mi(pop, close, 'Import from file…', () => fileIn.click());
    if (has) {
      mi(pop, close, 'Duplicate', duplicateLayout);
      mi(pop, close, 'Export to file', exportFile);
      msep(pop);
      mi(pop, close, 'Delete dashboard…', removeLayout, { danger: true });
    }
  });

  put(bar, layouts, gitMenu(), fileIn);
  if (!has) { put(bar, h('button', { class: 'btn btn-sm', onclick: newLayout }, 'New dashboard')); return; }

  put(bar,
    h('input', { class: 'form-input le-name', value: S.dash.name, title: 'Dashboard name', 'aria-label': 'Dashboard name', onchange: e => { S.dash.name = (e.target.value || 'Dashboard').slice(0, 80); S.dirty = true; renderToolbar(); sendMeta(); } }),
    menu('⋯', (pop, close) => {
      pop.append(h('label', { class: 'le-mrow', title: 'Row height in pixels in Concert Operate (24 to 96). Smaller rows give finer placement.' }, h('span', {}, 'Row height'),
        h('input', { type: 'number', class: 'form-input', min: 24, max: 96, step: 4, value: S.dash.rowH || 48, onchange: e => { const v = Math.min(Math.max(Math.round(Number(e.target.value)) || 48, 24), 96); S.dash.rowH = v === 48 ? undefined : v; S.dirty = true; renderToolbar(); sendMeta(); } })));
      if (S.dash.widgets.some(w => sectionConv(w))) mi(pop, close, 'Convert sections to widgets', convertAllSections, { title: 'Turn every section that has an equivalent into configurable data widgets' });
      msep(pop);
      mi(pop, close, 'Publish all starter templates…', publishAllTemplates, { disabled: !S.designerInstalled, title: noDesigner || 'Puts every starter template in the Concert Operate sidebar as its own live dashboard, then deploys' });
      mi(pop, close, isDefault ? 'Already everyone’s starting dashboard' : 'Make this everyone’s starting dashboard', () => setDefault(true), { disabled: !S.designerInstalled || isDefault, title: noDesigner || 'Every user’s Dashboard Designer opens with this layout. Saves and deploys.' });
      if (S.defaultSlug) mi(pop, close, 'Stop using a starting dashboard', clearDefault, { title: 'Users start from the built-in dashboard again after the next deploy' });
      if (route) mi(pop, close, 'Remove from the sidebar', unpublish, { title: 'Takes the page out of the sidebar. The dashboard file stays.' });
    }, { title: 'More', cls: 'btn btn-secondary btn-sm le-ib', right: true }),
    h('span', { style: 'flex:1' }),
    h('button', { class: 'btn btn-secondary btn-sm', title: 'Start from one of the starter templates (replaces the canvas; Undo brings it back)', onclick: () => ui('templates') }, 'Templates'),
    h('button', { class: 'btn btn-secondary btn-sm', title: 'A one-minute guided tour of the Designer', onclick: () => ui('tour') }, 'Tour'),
    staleCount() ? h('button', { class: 'btn btn-sm le-warn', title: 'These tiles point at sections their dashboard no longer has (for example from an older version). Remove them, or pick another section for each in Settings.', onclick: removeStale }, `Remove ${staleCount()} tile${staleCount() === 1 ? '' : 's'} with a missing section`) : null,
    h('span', { class: 'le-dirty' }, S.dirty ? '● Unsaved changes' : ([isDefault ? 'Starting dashboard' : '✓ Saved', route ? `page ${route}` : ''].filter(Boolean).join(' · '))),
    h('button', { class: 'btn btn-secondary btn-sm', title: 'Save to dashboards/layouts/ (Ctrl+S)', onclick: save }, 'Save'),
    h('button', { class: 'btn btn-sm', title: noDesigner || 'Saves, puts this page in the Concert Operate sidebar and deploys it', disabled: !S.designerInstalled, onclick: () => publish(true) }, route ? 'Republish' : 'Publish'));
}


// ---------- the Dashboard Designer, in a frame ----------
// /preview/_designer.html is the real Designer built from dashboards/dashboard-builder with sample data. Studio owns the
// layout (load, save, publish); the frame reports every change. Embedded dashboards show through their own preview frames.
const partsMap = () => { const o = {}; Object.entries(PARTS).forEach(([t, ps]) => { o[t] = ps.map(([id, label]) => ({ id, label })); }); return o; };
const frameStatus = () => (S.dirty ? 'Unsaved: use Save in Studio' : 'Saved in Studio');

function sendLoad() {
  if (!S.dash || !frame || !frameReady) return;
  S.selected = null; renderActions();
  frame.contentWindow.postMessage({ type: 'load', dashboard: S.dash, tiles: S.tiles || [], parts: partsMap(), status: frameStatus() }, '*');
}
function ui(action) { if (frame && frameReady) frame.contentWindow.postMessage({ type: 'ui', action }, '*'); }

function sendMeta() {
  if (!S.dash || !frame || !frameReady) return;
  frame.contentWindow.postMessage({ type: 'meta', name: S.dash.name, rowH: S.dash.rowH, status: frameStatus() }, '*');
}

window.addEventListener('message', e => {
  const m = e.data;
  if (!m || !frame || e.source !== frame.contentWindow) return;
  if (m.type === 'ready') { frameReady = true; clearTimeout(frameTimer); const ld = root.querySelector('#le-loading'); if (ld) ld.remove(); sendLoad(); return; }
  if (!S.dash) return;
  if (m.type === 'select') { S.selected = m.id || null; renderActions(); return; }
  if (m.type === 'save') { save().then(sendMeta); return; }
  if (m.type === 'change' && m.dashboard) {
    const d = m.dashboard;
    const sameBar = JSON.stringify(d.bar || null) === JSON.stringify(S.dash.bar || null);
    if (JSON.stringify(d.widgets) === JSON.stringify(S.dash.widgets) && d.rowH === S.dash.rowH && sameBar) return; // echo of what we sent
    S.dash.widgets = d.widgets; S.dash.rowH = d.rowH; S.past = []; S.dirty = true;
    if (d.bar) S.dash.bar = d.bar; else delete S.dash.bar;
    renderToolbar(); renderActions(); sendMeta();
  }
});

function frameFailed() {
  const box = root.querySelector('#le-none');
  fetch('/preview/_designer.js').then(r => r.text()).then(t => { box.textContent = 'The Dashboard Designer could not start. ' + String(t).slice(0, 500); }).catch(() => { box.textContent = 'The Dashboard Designer could not be loaded.'; });
  box.style.display = 'block';
}
function reloadFrame() { if (!frame) return; frameReady = false; clearTimeout(frameTimer); frame.src = '/preview/_designer.html'; frameTimer = setTimeout(frameFailed, 45000); }

// Tools that only make sense in Studio, shown for what is selected in the Designer.
function renderActions() {
  const bar = root && root.querySelector('#le-actions'); if (!bar) return;
  bar.replaceChildren();
  const w = selectedWidget();
  const btn = (label, title, fn) => h('button', { class: 'btn btn-secondary btn-sm', title, onclick: fn }, label);
  if (w && recipeFor(w.type)) put(bar, btn('Break into widgets', 'Replace this dashboard tile with editable widgets that show the same things', decomposeSelected));
  if (w && sectionConv(w)) put(bar, btn('Turn this section into widgets', 'Replace this section with configurable data widgets', convertSelectedSection));
  if (S.past.length) put(bar, btn('Undo change', 'Undo the last split or conversion made here', undoChange));
  bar.style.display = bar.childNodes.length ? 'flex' : 'none';
}

function renderAll() {
  if (!root) return;
  root.querySelector('#le-editor').style.display = S.dash ? 'block' : 'none';
  root.querySelector('#le-none').style.display = S.dash ? 'none' : 'block';
  renderToolbar(); renderActions();
}

const CSS = `
#le-root .le-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px;min-height:36px}
#le-root .le-bar select{max-width:340px}
#le-actions{display:none;gap:6px;align-items:center;margin-bottom:8px}
#le-editor{display:none}
#le-loading{padding:12px 0}
#le-frame{display:block;width:100%;height:calc(100vh - 250px);min-height:560px;border:1px solid var(--border);background:#161616}
.le-hint{color:var(--text-muted);font-size:.8rem}
.le-warn{background:#da1e28;border-color:#da1e28}
.le-dirty{font-size:.8rem;color:var(--text-muted)}
#le-status{font-size:.82rem;margin-left:24px;flex:1;text-align:left;font-weight:400;line-height:1.4}
.card-title>span:first-child{white-space:nowrap}
.le-name{width:240px;max-width:100%}
.le-ib{min-width:34px;padding-left:8px;padding-right:8px}
.le-menu{position:relative;display:inline-block}
.le-caret{margin-left:6px;font-size:.7em}
.le-pop{position:absolute;top:100%;left:0;margin-top:4px;z-index:60;min-width:260px;max-width:360px;max-height:70vh;overflow:auto;background:var(--surface);border:1px solid var(--border);box-shadow:0 10px 28px rgba(0,0,0,.22);padding:4px}
.le-pop.right{left:auto;right:0}
.le-mi{display:flex;width:100%;align-items:center;gap:12px;padding:8px 10px;background:none;border:0;color:var(--text);font:inherit;font-size:.85rem;text-align:left;cursor:pointer}
.le-mi:hover:not([disabled]){background:var(--surface-hover)}
.le-mi[disabled]{opacity:.45;cursor:default}
.le-mi.danger{color:#da1e28}
.le-mi.on .le-mi-t{font-weight:600}
.le-mi.on::before{content:'✓';color:var(--primary)}
.le-mi-t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.le-mi-m{color:var(--text-muted);font-size:.75rem}
.le-sep{height:1px;background:var(--border);margin:4px 0}
.le-mlabel{padding:6px 10px 2px;font-size:.72rem;color:var(--text-muted)}
.le-mrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 10px;font-size:.85rem}
.le-mrow input{width:80px}
.le-real{color:var(--green)}
.le-badge{display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;border-radius:9px;background:var(--primary);color:#fff;font-size:.7rem;line-height:18px;text-align:center}
.le-dlg{margin:auto;width:min(860px,calc(100vw - 32px));max-height:80vh;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:16px}
.le-dlg::backdrop{background:rgba(0,0,0,.4)}
.le-dlg-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px}
`;

function build(container) {
  container.append(h('style', {}, CSS));
  frame = h('iframe', { id: 'le-frame', title: 'Dashboard Designer', src: '/preview/_designer.html' });
  frameTimer = setTimeout(frameFailed, 45000);
  root = h('div', { id: 'le-root' },
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('span', {}, 'Design'), h('span', { id: 'le-status' })),
      h('div', { class: 'card-desc', id: 'le-desc' }, 'This is the Dashboard Designer your users get in Concert Operate, with sample data. Pick a dashboard, edit it, then Publish to put it in the sidebar. Embedded dashboards and sections work here too.'),
      h('div', { class: 'le-bar', id: 'le-bar' }),
      h('div', { id: 'le-actions' }),
      h('div', { id: 'le-none', class: 'le-hint' }, 'Open a saved dashboard from Dashboards, or start a new one.'),
      h('div', { id: 'le-editor' }, h('div', { id: 'le-loading', class: 'le-hint' }, 'Starting the Dashboard Designer… the first start takes a few seconds while it is built.'), frame)));
  container.append(root);
  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', e => {
    if (!S.dash || !root.offsetParent) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save().then(sendMeta); }
  });
}

/** Which data the preview shows: sample data, or a snapshot of the tenant (Setup › Real data for Design). A new snapshot reloads the preview. */
async function refreshDataSource() {
  let info = { present: false };
  try { info = await api('/api/snapshot'); } catch (e) { /* sample data */ }
  const stamp = info.present ? info.taken || 'yes' : '';
  const desc = root.querySelector('#le-desc');
  if (desc) {
    desc.replaceChildren(
      'This is the Dashboard Designer your users get in Concert Operate, with ',
      info.present ? h('b', { class: 'le-real' }, `real data from your tenant (snapshot of ${info.taken ? new Date(info.taken).toLocaleString() : 'unknown date'})`) : 'sample data',
      info.present ? '. Changes are never sent to Concert Operate. ' : ' (load real data under Setup › Real data for Design). ',
      'Pick a dashboard, edit it, then Publish to put it in the sidebar.');
  }
  if (S.dataStamp !== undefined && S.dataStamp !== stamp) reloadFrame();
  S.dataStamp = stamp;
}

async function open() {
  if (!root) build(document.getElementById('tab-layouts'));
  await refreshDataSource();
  try { await refreshList(); } catch (e) { say('Could not load dashboards: ' + e.message, false); }
  await refreshGit();
  try {
    const st = await api('/api/preview/status');
    if (!st.available) {
      const box = root.querySelector('#le-none');
      box.textContent = 'The Dashboard Designer needs these packages in dashboard-extension: ' + st.missing.join(', ') + '. Run npm install there, then reopen this tab.';
      box.style.display = 'block'; S.noFrame = true; return;
    }
  } catch (e) { /* the frame reports its own failure */ }
  await refreshTiles();
  // Always land in the editor on a blank dashboard: the Designer's start screen offers the templates, and saved
  // dashboards are one click away under Dashboards.
  if (!S.dash) openDash(null, { id: newId('d'), name: 'New dashboard', updated: Date.now(), widgets: [] });
  renderAll();
  sendLoad();
}

window.LayoutEditor = { open, openFor, newLayout, _state: S, _sanitize: sanitizeDashboard };
