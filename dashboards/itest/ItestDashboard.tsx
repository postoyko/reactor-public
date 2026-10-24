/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * itest — Composed via Scaffold Studio
 */

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';



import { Button, Tag, InlineNotification } from '@carbon/react';

import { Diagram, Reset, Play, CheckmarkOutline } from '@carbon/icons-react';
import { ALERT_QUERY_PARAMS, INCIDENT_QUERY_PARAMS } from '../constants';
import './itest.scss';

// ── Data access ──────────────────────────────────────────────────────────────
// Uses the same signed-in query bridge as the toolkit's own dashboards (no API key in the bundle,
// no process.env, no direct REST calls).
const ALERT_FILTER: string = "state = 'open'";
const INCIDENT_FILTER: string = "state != 'resolved'";

const Panel_monitor_boxes = React.lazy(() => import('../../panels/monitor-boxes.panel') as unknown as Promise<{ default: React.ComponentType<any> }>);


const callApi = (name: string, params: Record<string, unknown>): Promise<any> => {
  const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.[name];
  if (typeof fn !== 'function') return Promise.reject(new Error(`The ${name} query is not available in this environment.`));
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
  const m = /^s*states*(!=|=)s*'([^']*)'s*$/.exec(expr || '');
  if (!m) return list;
  return list.filter(i => (m[1] === '=' ? i.state === m[2] : i.state !== m[2]));
}

export const ItestDashboard: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [executedPolicies, setExecutedPolicies] = useState<Record<string, boolean>>({});
  const [scrubberTime, setScrubberTime] = useState<number>(0);

  
  
  

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
    const timer = setInterval(loadData, 30000); return () => clearInterval(timer);
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

  
  

  return (
    <div className="itest-container">
      {/* Header */}
      <div className="dash-header">
        <div>
          <div className="dash-title">
            <Diagram size={26} />
            itest
          </div>
          <div className="dash-subtitle">Custom Composed Operations Cockpit &bull; Live Telemetry Feed</div>
        </div>
        <div className="dash-actions">
          {error ? <Tag type="red">Query failed</Tag> : <Tag type="cyan">Refreshes every 30s</Tag>}
          <Button size="sm" kind="tertiary" renderIcon={Reset} disabled={loading} onClick={loadData}>Refresh</Button>
        </div>
      </div>

      {error && <InlineNotification kind="error" title="Telemetry Feed Error" subtitle={error} lowContrast />}

      

      

      {/* Main Visual Plane Grid */}
      <div className="main-viewport-grid">
        

        
      </div>

      

      

      


      {/* Existing panel: monitor-boxes */}
      <div style={{ marginTop: '1rem' }}>
        <Suspense fallback={<div>Loading monitor-boxes…</div>}><Panel_monitor_boxes /></Suspense>
      </div>
    </div>
  );
};

export default ItestDashboard;
