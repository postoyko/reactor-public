import { sanitizeDashboard, exportJson, defaultConfig, defaultTitle, nativeDef } from './public/designer-core.js';

/**
 * Modular Component & API Wiring Code Generator for IBM Concert Operate Dashboards
 */

export function generateCustomComposedDashboard(id, title, config) {
  const compName = toPascalCase(id) + 'Dashboard';
  const { components = [], apiBindings = {} } = config;
  // The title ends up inside a comment and inside JSX text, so strip anything that could break out of either.
  const safeTitle = String(title).replace(/[<>{}`$\\]|\*\//g, '').trim() || 'Dashboard';

  // Detect which features are enabled
  const has3DMesh = components.some(c => c.type === '3d-mesh');
  const has2DTopology = components.some(c => c.type === '2d-topology');
  const hasRadar = components.some(c => c.type === 'blast-radar');
  const hasSankey = components.some(c => c.type === 'sankey');
  const hasKPIs = components.some(c => c.type === 'kpi-grid');
  const hasAlertsTable = components.some(c => c.type === 'alerts-table');
  const hasIncidentsTable = components.some(c => c.type === 'incidents-table');
  const hasRunbooks = components.some(c => c.type === 'runbook-console');
  const hasScrubber = components.some(c => c.type === 'time-scrubber');
  // Designer widgets (KPI, bar, donut, timeline, table, note) are placed as a layout rendered by the Dashboard Designer's engine.
  const widgetTypes = components.map(c => String(c.type || '')).filter(t => /^widget:(kpi|bar|donut|timeseries|table|text)$/.test(t)).map(t => t.slice(7));
  let widgetLayout = null;
  if (widgetTypes.length) {
    let x = 0, y = 0, rowH = 0;
    const widgets = widgetTypes.map((type, i) => {
      const d = nativeDef(type);
      if (x + d.w > 12) { x = 0; y += rowH; rowH = 0; }
      const w = { id: 'w' + (i + 1), type, title: defaultTitle(type), x, y, w: d.w, h: d.h, config: defaultConfig(type) };
      x += d.w; rowH = Math.max(rowH, d.h);
      return w;
    });
    const s = sanitizeDashboard({ id: id, name: safeTitle, updated: 0, widgets });
    if (s) widgetLayout = JSON.parse(exportJson(s.dashboard));
  }
  const panelIds = [...new Set(components.map(c => String(c.type || '')).filter(t => /^panel:[a-z0-9][a-z0-9-]*$/.test(t)).map(t => t.slice(6)))];

  const alertFilter = apiBindings.alertFilter || "state = 'open'";
  const incFilter = apiBindings.incFilter || "state != 'resolved'";
  const refreshRate = apiBindings.refreshSeconds || 30;

  return `/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * ${safeTitle} — Composed via Concert Workbench
 */

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
${has3DMesh ? "import * as THREE from 'three';" : ""}
${hasSankey ? "import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';" : ""}
${hasRadar || hasSankey || has2DTopology ? "import * as d3 from 'd3';" : ""}
import { Button, Tag, InlineNotification } from '@carbon/react';
${widgetLayout ? "import DashboardBuilder from '../dashboard-builder/DashboardBuilder';" : ""}
import { Diagram, Reset, Play, CheckmarkOutline } from '@carbon/icons-react';
import { ALERT_QUERY_PARAMS, INCIDENT_QUERY_PARAMS } from '../constants';
import './${id}.scss';

// The one severity palette (same as every other dashboard): 0 clear, 1 indeterminate, 2 information, 3 warning, 4 minor, 5 major, 6 critical.
const SEV_HEX = ['#8d8d8d', '#a56eff', '#78a9ff', '#4589ff', '#f1c21b', '#ff832b', '#da1e28'];
const sevHex = (s: number) => SEV_HEX[Math.min(6, Math.max(0, Math.round(s || 0)))];
const sevInk = (s: number) => ([1, 3, 6].includes(Math.round(s || 0)) ? '#ffffff' : '#161616');

// ── Data access ──────────────────────────────────────────────────────────────
// Uses the same signed-in query bridge as the toolkit's own dashboards (no API key in the bundle,
// no process.env, no direct REST calls).
const ALERT_FILTER: string = ${JSON.stringify(alertFilter)};
const INCIDENT_FILTER: string = ${JSON.stringify(incFilter)};

${panelIds.map(pid => `const Panel_${pid.replace(/-/g, '_')} = React.lazy(() => import('../../panels/${pid}.panel') as unknown as Promise<{ default: React.ComponentType<any> }>);`).join('\n')}

${widgetLayout ? `const WIDGET_LAYOUT: unknown = ${JSON.stringify(widgetLayout, null, 2)};\n` : ''}
const callApi = (name: string, params: Record<string, unknown>): Promise<any> => {
  const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.[name];
  if (typeof fn !== 'function') return Promise.reject(new Error(\`The \${name} query is not available in this environment.\`));
  return fn(params);
};

const parseJson = (v: unknown): any => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (e) { return undefined; }
};

/** getAlerts returns { columns, rows[].fields[] }; turn it into plain objects. */
function toAlerts(data: any): any[] {
  const src = data?.tenant?.alerts;
  const cols: Array<{ name?: string }> = Array.isArray(src?.columns) ? src.columns : [];
  const rows: any[] = Array.isArray(src?.rows) ? src.rows : [];
  const idx = new Map<string, number>();
  cols.forEach((c, i) => { if (c && c.name) idx.set(c.name, i); });
  const insightCols = cols.map((c, i) => ({ i, name: (c && c.name) || '' })).filter(c => c.name.startsWith('@insights.type='));
  const out: any[] = [];
  rows.forEach(r => {
    const f: any[] = (r && r.fields) || [];
    const get = (n: string): string | undefined => {
      const i = idx.get(n);
      return i === undefined || f[i] === null || f[i] === undefined ? undefined : String(f[i]);
    };
    const id = get('id');
    if (!id) return;
    const insights: any[] = [];
    insightCols.forEach(({ i }) => {
      const p = parseJson(f[i]);
      if (Array.isArray(p)) p.forEach((x: any) => { if (x && typeof x === 'object') insights.push(x); });
    });
    out.push({
      id,
      severity: Number(get('severity')) || 0,
      state: get('state'),
      summary: get('summary') || '',
      resource: { name: get('resource.name') },
      sender: { name: get('sender.name') },
      insights,
    });
  });
  return out;
}

/** getStories returns data.tenant.stories as a list (or { stories: [...] }). */
function toIncidents(data: any): any[] {
  const raw = data?.tenant?.stories;
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.stories) ? raw.stories : [];
  return list
    .filter((s: any) => s && typeof s === 'object' && s.id)
    .map((s: any) => ({
      id: String(s.id),
      title: s.title ? String(s.title) : 'Untitled incident',
      priority: Number(s.priority) || 0,
      state: s.state ? String(s.state) : '',
      alertIds: Array.isArray(s.alertIds) ? s.alertIds : [],
    }));
}

/** getStories takes no server-side filter, so a simple "state = 'x'" / "state != 'x'" is applied here. */
function filterIncidents(list: any[], expr: string): any[] {
  const m = /^\\s*state\\s*(!=|=)\\s*'([^']*)'\\s*$/.exec(expr || '');
  if (!m) return list;
  return list.filter(i => (m[1] === '=' ? i.state === m[2] : i.state !== m[2]));
}

export const ${compName}: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [executedPolicies, setExecutedPolicies] = useState<Record<string, boolean>>({});
  const [scrubberTime, setScrubberTime] = useState<number>(0);

  ${has3DMesh ? "const canvasRef = useRef<HTMLCanvasElement | null>(null);" : ""}
  ${hasRadar ? "const radarRef = useRef<SVGSVGElement | null>(null);" : ""}
  ${hasSankey ? "const sankeyRef = useRef<SVGSVGElement | null>(null);" : ""}

  // ── Live data ────────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [aData, iData] = await Promise.all([
        callApi('getAlerts', { ...ALERT_QUERY_PARAMS, filter: ALERT_FILTER || ALERT_QUERY_PARAMS.filter }),
        callApi('getStories', { ...INCIDENT_QUERY_PARAMS }),
      ]);
      setAlerts(toAlerts(aData));
      setIncidents(filterIncidents(toIncidents(iData), INCIDENT_FILTER));
    } catch (e: any) {
      setError((e && e.message) || 'Error communicating with Cloud Pak for AIOps');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    ${refreshRate > 0 ? `const timer = setInterval(loadData, ${refreshRate * 1000}); return () => clearInterval(timer);` : ""}
  }, []);

  // ── Computed Topology Nodes & Metrics ───────────────────────────────────────
  const nodes = useMemo(() => {
    const map = new Map<string, any>();
    alerts.forEach((a) => {
      const raw = a.resource?.name || a.resource?.hostname || 'Node';
      const clean = raw.split('/').pop()?.split(':::')[0] || raw;
      if (!map.has(clean)) {
        map.set(clean, {
          id: clean,
          name: clean,
          severity: a.severity || 0,
          alertCount: 1,
          alerts: [a],
          isProbableCause: (a.insights || []).some((i: any) => i.type?.includes('probable-cause')),
        });
      } else {
        const item = map.get(clean);
        item.alertCount += 1;
        item.severity = Math.max(item.severity, a.severity || 0);
        item.alerts.push(a);
      }
    });
    return Array.from(map.values());
  }, [alerts]);

  ${has3DMesh ? generate3DSceneHook() : ""}
  ${hasRadar ? generateRadarHook() : ""}

  return (
    <div className="${id}-container">
      {/* Header */}
      <div className="dash-header">
        <div>
          <div className="dash-title">
            <Diagram size={26} />
            ${safeTitle}
          </div>
          <div className="dash-subtitle">Custom Composed Operations Cockpit &bull; Live Telemetry Feed</div>
        </div>
        <div className="dash-actions">
          {error ? <Tag type="red">Query failed</Tag> : <Tag type="cyan">${refreshRate > 0 ? `Refreshes every ${refreshRate}s` : 'Manual refresh'}</Tag>}
          <Button size="sm" kind="tertiary" renderIcon={Reset} disabled={loading} onClick={loadData}>Refresh</Button>
        </div>
      </div>

      {error && <InlineNotification kind="error" title="Telemetry Feed Error" subtitle={error} lowContrast />}

      ${hasKPIs ? `
      {/* Top KPI Metrics Bar */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Active Incidents</span>
          <span className="kpi-val">{incidents.length}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Correlated Alerts</span>
          <span className="kpi-val">{alerts.length}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Critical Alarms (Sev 6)</span>
          <span className="kpi-val" style={{ color: sevHex(6) }}>{alerts.filter(a => a.severity === 6).length}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Probable Causes</span>
          <span className="kpi-val" style={{ color: '#a56eff' }}>{nodes.filter(n => n.isProbableCause).length}</span>
        </div>
      </div>
      ` : ""}

      ${hasScrubber ? `
      {/* Time-Slip Scrubber */}
      <div className="scrubber-bar">
        <span className="scrubber-label">Causal Time-Slip: -{30 - scrubberTime}m</span>
        <input type="range" min="0" max="30" value={scrubberTime} onChange={e => setScrubberTime(Number(e.target.value))} className="scrubber-slider" />
        <Tag type={scrubberTime === 30 ? 'green' : 'red'}>{scrubberTime === 30 ? 'Live (t-0)' : \`Historical (t-\${30 - scrubberTime}m)\`}</Tag>
      </div>
      ` : ""}

      {/* Main Visual Plane Grid */}
      <div className="main-viewport-grid">
        ${has3DMesh ? `
        <div className="viewport-card ${hasRadar ? 'split-left' : 'full-width'}">
          <div className="card-header">
            <span>GPU 3D WebGL Stratified Topology</span>
            <Tag type="purple">Three.js</Tag>
          </div>
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} />
          </div>
        </div>
        ` : ""}

        ${hasRadar ? `
        <div className="viewport-card split-right">
          <div className="card-header">
            <span>Concentric Blast Radius Radar</span>
            <Tag type="red">Radial Zone</Tag>
          </div>
          <div className="radar-wrapper">
            <svg ref={radarRef} width="100%" height="380" />
          </div>
        </div>
        ` : ""}
      </div>

      ${hasAlertsTable ? `
      {/* Live Alerts Ingest Table */}
      <div className="table-card">
        <div className="card-header">
          <span>Live Ingest Alarms</span>
          <Tag type="blue">{alerts.length} Records</Tag>
        </div>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Sev</th>
                <th>Resource Name</th>
                <th>Summary</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {alerts.slice(0, 15).map(a => (
                <tr key={a.id} onClick={() => setSelectedNodeId(a.resource?.name || null)} className={selectedNodeId === a.resource?.name ? 'selected-row' : ''}>
                  <td><Tag type="gray" style={{ background: sevHex(a.severity), color: sevInk(a.severity) }}>Sev {a.severity}</Tag></td>
                  <td className="mono">{a.resource?.name || 'Network Node'}</td>
                  <td>{a.summary}</td>
                  <td><Tag type="cool-gray">{a.sender?.name || 'Native'}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      ` : ""}

      ${hasIncidentsTable ? `
      {/* Correlated Incidents Table */}
      <div className="table-card" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <span>Correlated Incident Stories</span>
          <Tag type="purple">{incidents.length} Stories</Tag>
        </div>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Incident Title</th>
                <th>State</th>
                <th>Alarms Attached</th>
              </tr>
            </thead>
            <tbody>
              {incidents.slice(0, 10).map(inc => (
                <tr key={inc.id}>
                  <td><Tag type={inc.priority <= 2 ? 'red' : 'green'}>P{inc.priority}</Tag></td>
                  <td>{inc.title}</td>
                  <td><Tag type="cyan">{inc.state}</Tag></td>
                  <td>{inc.alertIds?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      ` : ""}

      ${hasRunbooks ? `
      {/* One-Click Runbook Execution Console */}
      <div className="table-card" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <span>Automated Policy Remediation Console</span>
          <Tag type="green">One-Click Action</Tag>
        </div>
        <div className="runbook-grid">
          {alerts.filter(a => a.insights?.some((i: any) => i.type?.includes('runbook'))).slice(0, 4).map(a => (
            <div key={a.id} className="runbook-tile">
              <div>
                <div className="rb-title">{a.resource?.name || 'Target Node'}</div>
                <div className="rb-desc">{a.summary}</div>
              </div>
              <Button
                size="sm"
                kind={executedPolicies[a.id] ? 'secondary' : 'primary'}
                renderIcon={executedPolicies[a.id] ? CheckmarkOutline : Play}
                disabled={Boolean(executedPolicies[a.id])}
                onClick={() => setExecutedPolicies(p => ({ ...p, [a.id]: true }))}
              >
                {executedPolicies[a.id] ? 'Executed' : 'Execute Policy'}
              </Button>
            </div>
          ))}
        </div>
      </div>
      ` : ""}
${widgetLayout ? `
      {/* Designer widgets */}
      <div style={{ marginTop: '1rem' }}><DashboardBuilder layout={WIDGET_LAYOUT} /></div>` : ''}
${panelIds.map(pid => `
      {/* Existing panel: ${pid} */}
      <div style={{ marginTop: '1rem' }}>
        <Suspense fallback={<div>Loading ${pid}…</div>}><Panel_${pid.replace(/-/g, '_')} /></Suspense>
      </div>`).join('\n')}
    </div>
  );
};

export default ${compName};
`;
}

function generate3DSceneHook() {
  return `
  // ── WebGL 3D Force Scene Hook ────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;
    const canvas = canvasRef.current;
    const width = canvas.parentElement?.clientWidth || 700;
    const height = 420;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.002);

    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    camera.position.set(0, 150, 360);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const light = new THREE.DirectionalLight(0x00d2ff, 1.2);
    light.position.set(200, 200, 200);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    // Z-Planes
    [-100, 0, 100].forEach((z, idx) => {
      const colors = [0x38bdf8, 0x42be65, 0xa56eff];
      const g = new THREE.GridHelper(300, 10, colors[idx], 0x1e293b);
      g.position.set(0, 0, z);
      g.rotation.x = Math.PI / 2;
      (g.material as THREE.Material).opacity = 0.2;
      (g.material as THREE.Material).transparent = true;
      scene.add(g);
    });

    const geom = new THREE.SphereGeometry(1, 16, 16);
    nodes.slice(0, 40).forEach((n, idx) => {
      const col = n.severity >= 4 ? parseInt(sevHex(n.severity).slice(1), 16) : n.isProbableCause ? 0x6929c4 : 0x00d2ff;
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 });
      const mesh = new THREE.Mesh(geom, mat);
      const angle = (idx / 40) * Math.PI * 2;
      mesh.scale.set(6, 6, 6);
      mesh.position.set(Math.cos(angle) * 110, Math.sin(angle) * 80, (idx % 3 - 1) * 100);
      scene.add(mesh);
    });

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      scene.rotation.y += 0.002;
      renderer.render(scene, camera);
    };
    animate();

    return () => { cancelAnimationFrame(animId); renderer.dispose(); };
  }, [nodes]);
  `;
}

function generateRadarHook() {
  return `
  // ── Concentric Blast Radius Radar Hook ──────────────────────────────────────
  useEffect(() => {
    if (!radarRef.current || nodes.length === 0) return;
    const svg = d3.select(radarRef.current);
    svg.selectAll('*').remove();

    const width = radarRef.current.clientWidth || 380;
    const height = 380;
    const cx = width / 2;
    const cy = height / 2;
    const g = svg.append('g').attr('transform', \`translate(\${cx}, \${cy})\`);

    [40, 80, 120, 160].forEach((r, i) => {
      const colors = ['#fa4d56', '#ff832b', '#a56eff', '#00d2ff'];
      g.append('circle').attr('r', r).attr('fill', 'none').attr('stroke', colors[i]).attr('stroke-width', 1.2).attr('opacity', 0.4);
    });

    nodes.slice(0, 12).forEach((n, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const r = 40 + (i % 3) * 40;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      g.append('circle').attr('cx', x).attr('cy', y).attr('r', 5).attr('fill', n.severity >= 4 ? sevHex(n.severity) : '#00d2ff');
      g.append('text').attr('x', x).attr('y', y + 12).attr('fill', '#94a3b8').attr('font-size', '8px').attr('text-anchor', 'middle').text(n.name.substring(0, 10));
    });
  }, [nodes]);
  `;
}

export function generatePanelTS(id) {
  const compName = toPascalCase(id) + 'Dashboard';
  return `/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import createPanel from '../app/createPanel';
import ${compName} from '../components/${id}/${compName}';

export default createPanel(${compName});
`;
}

export function generateCustomSCSS(id) {
  return `.${id}-container {
  padding: 1.5rem;
  background: #0b0f19;
  color: #f8fafc;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  .dash-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;

    .dash-title {
      font-size: 1.4rem;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .dash-subtitle {
      font-size: 0.82rem;
      color: #94a3b8;
      margin-top: 4px;
    }

    .dash-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;

    .kpi-card {
      background: #111827;
      border: 1px solid #1e293b;
      padding: 1rem;
      border-radius: 8px;

      .kpi-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
      .kpi-val { font-size: 1.7rem; font-weight: 700; color: #f1f5f9; display: block; margin-top: 4px; }
    }
  }

  .scrubber-bar {
    background: #111827;
    border: 1px solid #1e293b;
    padding: 10px 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 1.5rem;

    .scrubber-label { font-size: 0.82rem; font-weight: 600; color: #38bdf8; min-width: 170px; }
    .scrubber-slider { flex: 1; accent-color: #0070f3; cursor: pointer; }
  }

  .main-viewport-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;

    @media (min-width: 1024px) {
      grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
    }

    .viewport-card {
      background: #111827;
      border: 1px solid #1e293b;
      border-radius: 8px;
      overflow: hidden;

      .card-header {
        background: #1e293b;
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.85rem;
        font-weight: 600;
        border-bottom: 1px solid #334155;
      }

      .canvas-wrapper {
        height: 420px;
        canvas { width: 100%; height: 100%; display: block; }
      }

      .radar-wrapper {
        height: 380px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }
  }

  .table-card {
    background: #111827;
    border: 1px solid #1e293b;
    border-radius: 8px;
    overflow: hidden;

    .card-header {
      background: #1e293b;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 600;
      border-bottom: 1px solid #334155;
    }

    .table-scroll {
      max-height: 350px;
      overflow-y: auto;
    }

    .dash-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;

      th {
        text-align: left;
        padding: 10px 12px;
        background: #0f172a;
        color: #94a3b8;
        border-bottom: 1px solid #1e293b;
      }

      td {
        padding: 10px 12px;
        border-bottom: 1px solid #1e293b;
        color: #cbd5e1;
      }

      tr.selected-row { background: #1e293b; }
      tr:hover { background: #1a2234; cursor: pointer; }
      .mono { font-family: monospace; color: #38bdf8; }
    }
  }

  .runbook-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
    padding: 1rem;

    .runbook-tile {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;

      .rb-title { font-size: 0.85rem; font-weight: 700; color: #38bdf8; }
      .rb-desc { font-size: 0.78rem; color: #94a3b8; }
    }
  }
}
`;
}

function toPascalCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, (chr) => chr.toUpperCase());
}
