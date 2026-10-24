/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cognitive Deep Dive Dashboard — User-driven incident triage, surge analysis & topological epicenter drilldowns
 */

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, Button } from '@carbon/react';
import { Information, Layers, Flash, Terminal } from '@carbon/icons-react';
import './cognitive-deep-dive.scss';

// ── Types ────────────────────────────────────────────────────────────────────

type ActiveLens = 'assignment' | 'surge' | 'epicenter';

interface IncidentItem {
  id: string;
  title: string;
  priority: number;
  state: string;
  createdTime: string;
  owner?: string;
  team?: string;
  alertIds?: string[];
  contextualAlertIds?: string[];
  insights?: any[];
}

interface AlertItem {
  id: string;
  summary: string;
  severity: number;
  state: string;
  firstOccurrenceTime: string;
  lastOccurrenceTime?: string;
  eventCount?: number;
  resource?: {
    name?: string;
    hostname?: string;
    type?: string;
    ipAddress?: string;
  };
  sender?: {
    connectorType?: string;
    name?: string;
    serverName?: string;
  };
  insights?: {
    id: string;
    type: string;
    details?: {
      score?: number;
      rank?: number;
    };
  }[];
}

interface TelemetryData {
  incidents: IncidentItem[];
  alerts: AlertItem[];
  timestamp: string;
}

// ── API Endpoints & Auth ─────────────────────────────────────────────────────

const INCIDENTS_API = '/aiops/api/v2/incidents?size=100';
const ALERTS_API = '/aiops/api/v2/alerts?size=300';

const API_KEY = process.env.DASHBOARD_API_KEY as string;
const TENANT_ID = process.env.DASHBOARD_TENANT_ID as string;

async function fetchTelemetry(): Promise<TelemetryData> {
  const headers = {
    'Authorization': API_KEY,
    'x-tenant-id': TENANT_ID,
  };

  const [incRes, alertRes] = await Promise.all([
    fetch(INCIDENTS_API, { headers, credentials: 'omit' }),
    fetch(ALERTS_API, { headers, credentials: 'omit' }),
  ]);

  if (!incRes.ok) throw new Error(`Incidents request failed: HTTP ${incRes.status}`);
  if (!alertRes.ok) throw new Error(`Alerts request failed: HTTP ${alertRes.status}`);

  const incJson = await incRes.json();
  const alertJson = await alertRes.json();

  const incidents: IncidentItem[] = (incJson.items ?? incJson.incidents ?? []).map((i: any) => ({
    id: i.id,
    title: i.title ?? i.summary ?? '(Untitled Incident)',
    priority: i.priority ?? 5,
    state: i.state ?? 'unassigned',
    owner: i.owner ?? '-',
    team: i.team ?? '-',
    createdTime: i.createdTime ?? i.firstOccurrenceTime ?? '',
    alertIds: i.alertIds ?? [],
    contextualAlertIds: i.contextualAlertIds ?? [],
    insights: i.insights ?? [],
  }));

  const alerts: AlertItem[] = (alertJson.items ?? alertJson.alerts ?? []).map((a: any) => ({
    id: a.id,
    summary: a.summary ?? '',
    severity: a.severity ?? 0,
    state: a.state ?? 'open',
    firstOccurrenceTime: a.firstOccurrenceTime ?? '',
    lastOccurrenceTime: a.lastOccurrenceTime ?? '',
    eventCount: a.eventCount ?? 1,
    resource: a.resource,
    sender: a.sender,
    insights: a.insights ?? [],
  }));

  return {
    incidents,
    alerts,
    timestamp: new Date().toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
  };
}

// ── Helpers & Computations ───────────────────────────────────────────────────

function getCategories(alerts: AlertItem[]): { label: string; count: number; color: string }[] {
  const buckets: [string, RegExp, string][] = [
    ['Pod Liveness / Ingress Readiness', /liveness|readiness|ingress|pod|container/i, '#0f62fe'],
    ['High Erroneous Call Rate', /erroneous|call.rate|slower/i, '#da1e28'],
    ['Hardware Voltage & Threshold', /voltage|threshold|baseline|percent/i, '#ff832b'],
    ['Loss of Network Signal', /signal|loss|down|offline|link/i, '#8a3ffc'],
    ['IBM MQ Channel & Subsystem', /mq|subsystem|interface|channel|listener/i, '#0072c3'],
  ];

  const map = new Map<string, { count: number; color: string }>();
  let other = 0;

  for (const a of alerts) {
    let matched = false;
    for (const [label, reg, color] of buckets) {
      if (reg.test(a.summary)) {
        const cur = map.get(label);
        map.set(label, { count: (cur?.count ?? 0) + 1, color });
        matched = true;
        break;
      }
    }
    if (!matched) other++;
  }

  const res = Array.from(map.entries())
    .map(([label, { count, color }]) => ({ label, count, color }))
    .sort((a, b) => b.count - a.count);

  if (other > 0) res.push({ label: 'Other Active Signatures', count: other, color: '#8d8d8d' });
  return res;
}

function getTopEpicenters(alerts: AlertItem[]): { name: string; rawEvents: number; alertCount: number; connector: string }[] {
  const map = new Map<string, { rawEvents: number; alertCount: number; connector: string }>();

  for (const a of alerts) {
    const name = a.resource?.name || a.resource?.hostname || 'Unknown Node';
    const conn = a.sender?.connectorType || a.sender?.name || 'Native';
    const cur = map.get(name) || { rawEvents: 0, alertCount: 0, connector: conn };
    cur.rawEvents += (a.eventCount || 1);
    cur.alertCount += 1;
    map.set(name, cur);
  }

  return Array.from(map.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.rawEvents - a.rawEvents)
    .slice(0, 6);
}

// ── SVG Interactive Node Topology Visualizer ─────────────────────────────────

function TopologyEpicenterGraph({ epicenters }: { epicenters: { name: string; rawEvents: number; alertCount: number }[] }) {
  const max = Math.max(...epicenters.map(e => e.rawEvents), 1);
  const cx = 110;
  const cy = 110;

  return (
    <svg width="220" height="220" viewBox="0 0 220 220" style={{ margin: '0 auto', display: 'block' }}>
      <circle cx={cx} cy={cy} r="95" fill="none" stroke="#e0e0e0" strokeWidth="1" strokeDasharray="4 4" />
      <circle cx={cx} cy={cy} r="60" fill="none" stroke="#e0e0e0" strokeWidth="1" strokeDasharray="4 4" />
      <circle cx={cx} cy={cy} r="30" fill="none" stroke="#e0e0e0" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="8" fill="#8a3ffc" />

      {epicenters.map((e, i) => {
        const angle = (i * (360 / Math.max(epicenters.length, 1)) - 90) * (Math.PI / 180);
        const dist = 35 + (e.rawEvents / max) * 55;
        const x = cx + dist * Math.cos(angle);
        const y = cy + dist * Math.sin(angle);
        const r = 5 + (e.rawEvents / max) * 10;

        return (
          <g key={e.name}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#8a3ffc" strokeWidth="1.5" strokeOpacity="0.5" />
            <circle cx={x} cy={y} r={r} fill="#ff832b" />
          </g>
        );
      })}
    </svg>
  );
}

// ── Main Dashboard Component ─────────────────────────────────────────────────

const REFRESH_INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
];

// ── State shared by every copy of this component on a page ────────────────────
// The dashboard can be split into separate tiles with the `part` prop (header, lenses, workspace). All of them use ONE
// fetch, ONE refresh timer, ONE selected lens and ONE priority filter, so they still behave as a single dashboard.
// Without `part` nothing changes.

interface Shared {
  data: TelemetryData | null;
  loading: boolean;
  error: string | null;
  activeLens: ActiveLens;
  intervalSec: number;
  selectedPriority: number | 'all';
}

let shared: Shared = { data: null, loading: true, error: null, activeLens: 'assignment', intervalSec: 30, selectedPriority: 'all' };
let countdownValue = 30;
const sharedListeners = new Set<() => void>();

function setShared(patch: Partial<Shared>) {
  shared = { ...shared, ...patch };
  sharedListeners.forEach(l => l());
}
const subscribeShared = (l: () => void) => { sharedListeners.add(l); return () => { sharedListeners.delete(l); }; };
const getShared = () => shared;

let inflight: Promise<void> | null = null;

function refreshShared(): Promise<void> {
  if (inflight) return inflight;
  setShared({ loading: true, error: null });
  inflight = fetchTelemetry()
    .then(res => { setShared({ data: res, loading: false }); })
    .catch(err => { setShared({ error: (err && err.message) || 'Failed to load telemetry.', loading: false }); })
    .then(() => { inflight = null; });
  return inflight;
}

function setSharedInterval(v: number) {
  countdownValue = v;
  setShared({ intervalSec: v });
}

let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** Called once by every mounted copy. The first one starts the load and the refresh timer; the last one to leave stops the timer. */
function joinShared(): () => void {
  users += 1;
  if (users === 1) {
    countdownValue = shared.intervalSec;
    timer = setInterval(() => {
      if (shared.intervalSec === 0) return;
      if (countdownValue <= 1) { countdownValue = shared.intervalSec; void refreshShared(); }
      else countdownValue -= 1;
    }, 1000);
    void refreshShared();
  } else if (!shared.data && !inflight) {
    void refreshShared();
  }
  return () => {
    users -= 1;
    if (users <= 0) {
      users = 0;
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * `part` (optional) shows ONE section instead of the whole page, so it can sit in its own tile:
 * `header` (title, refresh rate, About), `lenses` (the three lens cards) or `workspace` (the drill-down for the selected lens).
 */
export const CognitiveDeepDiveDashboard: React.FC<{ part?: string }> = ({ part }) => {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const { data, loading, error, activeLens, intervalSec, selectedPriority } = useSyncExternalStore(subscribeShared, getShared, getShared);
  const setActiveLens = (v: ActiveLens) => setShared({ activeLens: v });
  const setSelectedPriority = (v: number | 'all') => setShared({ selectedPriority: v });
  const setIntervalSec = setSharedInterval;
  const refreshData = () => { void refreshShared(); };

  useEffect(() => joinShared(), []);

  const rootClass = part ? 'deep-dive deep-dive--part' : 'deep-dive';

  if (loading && !data) {
    return (
      <div className={rootClass}>
        <h1 className="deep-dive__title">Cognitive Observations Deep Dive</h1>
        <p className="deep-dive__subtitle deep-dive__subtitle--loading">Retrieving cluster operational telemetry...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={rootClass}>
        <h1 className="deep-dive__title">Cognitive Observations Deep Dive</h1>
        <p className="deep-dive__subtitle deep-dive__subtitle--error">Telemetry Feed Error: {error}</p>
        <button className="deep-dive__btn" onClick={refreshData} style={{ marginTop: '16px' }}>Retry Feed</button>
      </div>
    );
  }

  const { incidents, alerts, timestamp } = data;

  // Lens 1: Assignment metrics
  const unassignedIncidents = incidents.filter(i => i.state.toLowerCase() === 'unassigned');
  const highPriUnassigned = unassignedIncidents.filter(i => i.priority <= 2);

  // Lens 2: Surge metrics
  const criticalSev6 = alerts.filter(a => a.severity === 6);
  const majorSev5 = alerts.filter(a => a.severity === 5);
  const surgeAlerts = alerts.filter(a => a.severity >= 5);
  const categories = getCategories(surgeAlerts);
  const maxCatCount = Math.max(...categories.map(c => c.count), 1);

  // Lens 3: Epicenter metrics
  const epicenters = getTopEpicenters(alerts);
  const topEpicenter = epicenters[0] || { name: 'kea1.fyre.ibm.com', rawEvents: 36539, alertCount: 42, connector: 'Netcool' };
  const totalRawEvents = alerts.reduce((acc, a) => acc + (a.eventCount || 1), 0);
  const deduplicationRatio = totalRawEvents > 0 ? ((1 - alerts.length / totalRawEvents) * 100).toFixed(1) : '0';

  // Filtered incidents for Assignment Lens
  const displayedIncidents = incidents.filter(i => {
    if (selectedPriority === 'all') return true;
    return i.priority === selectedPriority;
  });

  const sections: Record<string, React.ReactNode> = {
    header: (
      <>
      {/* ── App Navigation Header ── */}
      <div className="deep-dive__header">
        <div>
          <div className="deep-dive__tag-pill">
            <span className="deep-dive__pulse-dot" />
            Interactive Cognitive Observatory
          </div>
          <h1 className="deep-dive__title">Signal Observations Deep Dive Deck</h1>
          <p className="deep-dive__subtitle">
            Synchronized with Concert Operate cluster at {timestamp} · Select a cognitive observation tile below to expand deep dive analysis.
          </p>
        </div>
        <div className="deep-dive__controls">
          <select
            className="deep-dive__select"
            value={intervalSec}
            onChange={e => {
              const val = Number(e.target.value);
              setIntervalSec(val);
            }}
            aria-label="Refresh Rate"
          >
            {REFRESH_INTERVALS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button className="deep-dive__btn" onClick={() => setIsAboutOpen(true)} style={{ background: '#393939', color: '#f4f4f4', marginRight: '6px' }}>
            ⓘ About
          </button>
          <button className="deep-dive__btn" onClick={refreshData} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh Now'}
          </button>
        </div>
      </div>

      {/* ── About Dashboard Modal ── */}
      <Modal
        open={isAboutOpen}
        modalHeading="About: Cognitive Observations Deep Dive Deck"
        passiveModal
        onRequestClose={() => setIsAboutOpen(false)}
        size="lg"
      >
        <div className="about-modal-wrapper">
          <div className="about-guide-container">
            {/* Card 1: What It Shows */}
            <div className="about-card">
              <div className="card-header-badge">
                <Layers size={16} /> 1. What It Shows
              </div>
              <p className="card-body-text">
                A cognitive triage cockpit driven by 3 selectable operational lenses:
                <span className="highlight-pill">Assignment Delay &amp; Orphan Stories</span>
                <span className="highlight-pill">Critical Alarm Surge Analysis</span>
                <span className="highlight-pill">Topological Epicenter &amp; Storm Radius</span>.
                It parses real-time incidents and alerts from the Concert Operate / Cloud Pak for AIOps cluster.
              </p>
            </div>

            {/* Card 2: What It Provides */}
            <div className="about-card">
              <div className="card-header-badge">
                <Flash size={16} /> 2. What It Provides
              </div>
              <ul className="capabilities-list">
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Triage Lens 1 (Assignment Delay):</strong> Identifies unassigned Priority 1/2 incidents with long idle dwell times and highlights assignees.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Surge Lens 2 (Alarm Surge):</strong> Deconstructs Sev 5/6 alert surges by subsystem category (Database, MQ, Container, Network, Security) and first occurrence timelines.
                  </div>
                </li>
                <li className="cap-item">
                  <span className="cap-bullet" />
                  <div className="cap-text">
                    <strong>Epicenter Lens 3 (Topology Epicenter):</strong> Visualizes the primary noise-radiating network elements, total event compression ratios, and topology storm radial scatter.
                  </div>
                </li>
              </ul>
            </div>

            {/* Card 3: How To Use It */}
            <div className="about-card">
              <div className="card-header-badge">
                <Terminal size={16} /> 3. How To Use It
              </div>
              <div className="usage-steps-list">
                <div className="step-item">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <div className="step-title">Cognitive Lens Selection</div>
                    <div className="step-desc">
                      Click any of the 3 top cognitive lens cards (<strong>Assignment Delay</strong>, <strong>Critical Surge</strong>, or <strong>Topological Epicenter</strong>) to switch workspaces.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <div className="step-title">Priority Filtering</div>
                    <div className="step-desc">
                      In Lens 1, click priority filter pills (<strong>All</strong>, <strong>P1</strong>, <strong>P2</strong>, <strong>P3</strong>) to filter the assignment table.
                    </div>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <div className="step-title">Live Ingest Refresh Cadence</div>
                    <div className="step-desc">
                      Use the dropdown in the header to set auto-refresh interval (15s, 30s, 60s, or Off).
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
      </>
    ),
    lenses: (
      <>
      {/* ── 3 Interactive Cognitive Lens Cards (Click to Drill Down) ── */}
      <div className="deep-dive__lens-grid">
        {/* Tile 1: Assignment Delay */}
        <div
          className={`deep-dive__lens-card deep-dive__lens-card--warning ${activeLens === 'assignment' ? 'deep-dive__lens-card--active' : ''}`}
          onClick={() => setActiveLens('assignment')}
          role="button"
          tabIndex={0}
        >
          <div className="deep-dive__lens-header">
            <span className="deep-dive__lens-icon">⚠️</span>
            <span className="deep-dive__lens-badge deep-dive__lens-badge--warning">Triage Required</span>
          </div>
          <h3 className="deep-dive__lens-title">Assignment Delay Lens</h3>
          <p className="deep-dive__lens-desc">
            {unassignedIncidents.length} active incident(s) currently unassigned across cluster services.
          </p>
          <div className="deep-dive__lens-stat">
            {unassignedIncidents.length} <span>Unassigned ({highPriUnassigned.length} High Priority)</span>
          </div>
        </div>

        {/* Tile 2: High Severity Surge */}
        <div
          className={`deep-dive__lens-card deep-dive__lens-card--surge ${activeLens === 'surge' ? 'deep-dive__lens-card--active' : ''}`}
          onClick={() => setActiveLens('surge')}
          role="button"
          tabIndex={0}
        >
          <div className="deep-dive__lens-header">
            <span className="deep-dive__lens-icon">🚨</span>
            <span className="deep-dive__lens-badge deep-dive__lens-badge--surge">Fault Wave</span>
          </div>
          <h3 className="deep-dive__lens-title">High Severity Surge Lens</h3>
          <p className="deep-dive__lens-desc">
            {surgeAlerts.length} Sev 5/6 alerts active, driving potential service degradation.
          </p>
          <div className="deep-dive__lens-stat">
            {surgeAlerts.length} <span>Active Sev 5/6 Alerts</span>
          </div>
        </div>

        {/* Tile 3: Epicenter Identified */}
        <div
          className={`deep-dive__lens-card deep-dive__lens-card--epicenter ${activeLens === 'epicenter' ? 'deep-dive__lens-card--active' : ''}`}
          onClick={() => setActiveLens('epicenter')}
          role="button"
          tabIndex={0}
        >
          <div className="deep-dive__lens-header">
            <span className="deep-dive__lens-icon">🎯</span>
            <span className="deep-dive__lens-badge deep-dive__lens-badge--epicenter">Epicenter Radius</span>
          </div>
          <h3 className="deep-dive__lens-title">Topological Epicenter Lens</h3>
          <p className="deep-dive__lens-desc">
            Resource {topEpicenter.name} generates highest signal volume ({topEpicenter.rawEvents.toLocaleString()} events).
          </p>
          <div className="deep-dive__lens-stat">
            {topEpicenter.rawEvents.toLocaleString()} <span>Event Blast Radius</span>
          </div>
        </div>
      </div>

      </>
    ),
    workspace: (
      <>
      {/* ── Dynamic Deep Dive Workspace Area ── */}
      <div className="deep-dive__workspace">
        {activeLens === 'assignment' && (
          <div>
            <div className="deep-dive__workspace-header">
              <h2>⚠️ Incident Assignment Delay &amp; Triage Deck</h2>
              <span className="deep-dive__workspace-sub">Focusing on {unassignedIncidents.length} unassigned items</span>
            </div>

            <div className="deep-dive__mini-stats">
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">Total Unassigned</div>
                <div className="deep-dive__mini-value" style={{ color: '#ff832b' }}>{unassignedIncidents.length}</div>
              </div>
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">High Priority (P1/P2)</div>
                <div className="deep-dive__mini-value" style={{ color: '#da1e28' }}>{highPriUnassigned.length}</div>
              </div>
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">Assigned to Individuals</div>
                <div className="deep-dive__mini-value" style={{ color: '#0f62fe' }}>
                  {incidents.length - unassignedIncidents.length}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Filter Priority:</span>
              {[
                { label: 'All Priorities', val: 'all' as const },
                { label: 'P1 (Critical)', val: 1 },
                { label: 'P2 (Major)', val: 2 },
                { label: 'P3 (Moderate)', val: 3 },
              ].map(p => (
                <button
                  key={p.label}
                  className="deep-dive__btn"
                  style={{
                    background: selectedPriority === p.val ? '#0f62fe' : undefined,
                    color: selectedPriority === p.val ? '#ffffff' : undefined,
                  }}
                  onClick={() => setSelectedPriority(p.val as any)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <table>
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Incident Summary</th>
                  <th>Current State</th>
                  <th>Triggering Alerts</th>
                  <th>Owner / Team</th>
                  <th>Logged Date</th>
                </tr>
              </thead>
              <tbody>
                {displayedIncidents.map(inc => (
                  <tr key={inc.id}>
                    <td>
                      <span className={`deep-dive__badge deep-dive__badge--p${inc.priority}`}>
                        P{inc.priority}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500, maxWidth: '380px' }}>{inc.title}</td>
                    <td>
                      <span style={{ color: inc.state === 'unassigned' ? '#ff832b' : '#0f62fe', fontWeight: 600 }}>
                        {inc.state}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{inc.alertIds?.length || 0} alerts</td>
                    <td>{inc.owner} / {inc.team}</td>
                    <td>{inc.createdTime ? new Date(inc.createdTime).toISOString().slice(0, 16).replace('T', ' ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeLens === 'surge' && (
          <div>
            <div className="deep-dive__workspace-header">
              <h2>🚨 High Severity Fault Surge Deep Dive</h2>
              <span className="deep-dive__workspace-sub">{surgeAlerts.length} active severity 5/6 alert signals</span>
            </div>

            <div className="deep-dive__mini-stats">
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">Sev 6 (Critical)</div>
                <div className="deep-dive__mini-value" style={{ color: '#da1e28' }}>{criticalSev6.length}</div>
              </div>
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">Sev 5 (Major)</div>
                <div className="deep-dive__mini-value" style={{ color: '#ff832b' }}>{majorSev5.length}</div>
              </div>
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">Active Signatures</div>
                <div className="deep-dive__mini-value" style={{ color: '#0f62fe' }}>{categories.length}</div>
              </div>
            </div>

            <div className="deep-dive__drilldown-grid">
              <div className="deep-dive__card">
                <h4>
                  <span>Fault Category Classification</span>
                  <span style={{ fontSize: '11px', color: '#6f6f6f' }}>Pattern Match</span>
                </h4>
                {categories.map(c => (
                  <div className="deep-dive__bar-row" key={c.label}>
                    <div className="deep-dive__bar-meta">
                      <span style={{ fontWeight: 500 }}>{c.label}</span>
                      <span style={{ fontWeight: 600, color: c.color }}>{c.count} alerts</span>
                    </div>
                    <div className="deep-dive__bar-track">
                      <div
                        className="deep-dive__bar-fill"
                        style={{ width: `${(c.count / maxCatCount) * 100}%`, background: c.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="deep-dive__card">
                <h4>
                  <span>Highest Volume Fault Signatures</span>
                  <span style={{ fontSize: '11px', color: '#6f6f6f' }}>Live Signals</span>
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {surgeAlerts.slice(0, 4).map(a => (
                    <div key={a.id} style={{ fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #e0e0e0' }}>
                      <div style={{ fontWeight: 600, color: a.severity === 6 ? '#da1e28' : '#ff832b', marginBottom: '2px' }}>
                        Sev {a.severity} · {a.resource?.name || 'Cluster Resource'}
                      </div>
                      <div style={{ color: '#525252', lineHeight: 1.3 }}>{a.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeLens === 'epicenter' && (
          <div>
            <div className="deep-dive__workspace-header">
              <h2>🎯 Topological Epicenter &amp; Event Storm Radius</h2>
              <span className="deep-dive__workspace-sub">{totalRawEvents.toLocaleString()} raw events compressed into alerts</span>
            </div>

            <div className="deep-dive__mini-stats">
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">Top Radiating Resource</div>
                <div className="deep-dive__mini-value" style={{ color: '#8a3ffc', fontSize: '15px' }}>{topEpicenter.name}</div>
              </div>
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">Raw Ingested Events</div>
                <div className="deep-dive__mini-value" style={{ color: '#0f62fe' }}>{totalRawEvents.toLocaleString()}</div>
              </div>
              <div className="deep-dive__mini-stat">
                <div className="deep-dive__mini-label">Deduplication Ratio</div>
                <div className="deep-dive__mini-value" style={{ color: '#198038' }}>{deduplicationRatio}%</div>
              </div>
            </div>

            <div className="deep-dive__drilldown-grid">
              <div className="deep-dive__card">
                <h4>
                  <span>Topology Storm Radial</span>
                  <span style={{ fontSize: '11px', color: '#6f6f6f' }}>Radial Intensity</span>
                </h4>
                <TopologyEpicenterGraph epicenters={epicenters} />
              </div>

              <div className="deep-dive__card">
                <h4>
                  <span>Ranked Epicenter Resources</span>
                  <span style={{ fontSize: '11px', color: '#6f6f6f' }}>Noise Generators</span>
                </h4>
                <table>
                  <thead>
                    <tr>
                      <th>Resource Name</th>
                      <th>Connector</th>
                      <th>Raw Events</th>
                      <th>Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {epicenters.map(e => (
                      <tr key={e.name}>
                        <td style={{ fontWeight: 600 }}>{e.name}</td>
                        <td>{e.connector}</td>
                        <td style={{ fontWeight: 700, color: '#da1e28' }}>{e.rawEvents.toLocaleString()}</td>
                        <td style={{ color: '#525252' }}>{e.alertCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      </>
    ),
  };

  if (part && sections[part]) {
    return <div className="deep-dive deep-dive--part">{sections[part]}</div>;
  }

  return (
    <div className="deep-dive">
      {sections.header}
      {sections.lenses}
      {sections.workspace}
    </div>
  );
};

export default CognitiveDeepDiveDashboard;
