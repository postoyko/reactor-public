/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 *
 * Incident & Alert Dashboard — live data from Concert Operate APIs
 */

import React, { useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import './incident-dashboard.scss';

// ── Types ────────────────────────────────────────────────────────────────────

interface Incident {
  id: string;
  title: string;
  priority: number;
  state: string;
  createdTime: string;
  alertIds: string[];
  contextualAlertIds: string[];
  runbookCount: number;
  serviceKey: string;
  serviceName: string;
}

interface Alert {
  id: string;
  summary: string;
  severity: number;
  state: string;
  type?: { classification?: string; eventType?: string };
  resource?: { name?: string; type?: string };
  sender?: { name?: string; type?: string; hostname?: string };
  firstOccurrenceTime?: string;
  lastOccurrenceTime?: string;
  eventCount?: number;
  serviceKey: string;
  runbookCount: number;
}

interface ServiceDef {
  key: string;
  name: string;
  icon: string;
  pattern: RegExp;
}

interface ServiceHealth {
  key: string;
  name: string;
  icon: string;
  status: 'critical' | 'degraded' | 'nominal';
  statusLabel: string;
  incidentCount: number;
  alertCount: number;
  critAlertCount: number;
  topComponent: string;
}

interface DashData {
  incidents: Incident[];
  criticalAlerts: Alert[];   // sev 6, open
  majorAlerts: Alert[];      // sev 5, open
  allAlerts: Alert[];
  services: ServiceHealth[];
  fetchedAt: string;
}

// ── Service Definitions ───────────────────────────────────────────────────────

const SERVICE_DEFINITIONS: ServiceDef[] = [
  {
    key:     'banking',
    name:    'Banking & Payments',
    icon:    '💳',
    pattern: /banking|loyalty|balance|payment|bank|apic-gw|gateway|get \/banking|get \/loyalty/i,
  },
  {
    key:     'microservices',
    name:    'Digital Microservices',
    icon:    '⚡',
    pattern: /recommendation-svc|qotd|coredb|discount-svc|proxy-supplychain|bk1-eg2|suggestions|erroneous call rate/i,
  },
  {
    key:     'mainframe-mq',
    name:    'Mainframe & IBM MQ',
    icon:    '📨',
    pattern: /mq|queue|listener|dsna|cics|db2|subsystem|enmesh|acemq/i,
  },
  {
    key:     'telecom-network',
    name:    'Telecom & Optical Core',
    icon:    '🌐',
    pattern: /cisco|fujitsu|loss of signal|mttrapd|switch|router|voltage|tenge|tengige|nyfbop|rchmd|eth1|network/i,
  },
  {
    key:     'platform-k8s',
    name:    'OpenShift & Ingress',
    icon:    '☸️',
    pattern: /openshift|ingress|canary|liveness|k8s|kubernetes|pod|node|worker0|nodestatus/i,
  },
  {
    key:     'data-tier',
    name:    'Database & Storage',
    icon:    '🗄️',
    pattern: /postgres|database|db|nfs|storage|cache|coredb/i,
  },
];

function classifyService(text: string): { key: string; name: string } {
  for (const def of SERVICE_DEFINITIONS) {
    if (def.pattern.test(text)) {
      return { key: def.key, name: def.name };
    }
  }
  return { key: 'microservices', name: 'Digital Microservices' };
}

// ── API helpers ───────────────────────────────────────────────────────────────

const INCIDENTS_PATH = '/aiops/api/v2/incidents?size=200';
const ALERTS_PATH    = '/aiops/api/v2/alerts?size=1000&filter=state%20%3D%20%27open%27';

// Injected at build time from target.json via webpack DefinePlugin —
// no credentials in source code; each builder supplies their own target.json
const API_KEY   = process.env.DASHBOARD_API_KEY   as string;
const TENANT_ID = process.env.DASHBOARD_TENANT_ID as string;

async function fetchAll(): Promise<DashData> {
  const headers = {
    'Authorization': API_KEY,
    'x-tenant-id':  TENANT_ID,
  };

  const [incRes, alertRes] = await Promise.all([
    fetch(INCIDENTS_PATH, { headers, credentials: 'omit' }),
    fetch(ALERTS_PATH,    { headers, credentials: 'omit' }),
  ]);

  if (!incRes.ok)   throw new Error(`Incidents API ${incRes.status}`);
  if (!alertRes.ok) throw new Error(`Alerts API ${alertRes.status}`);

  const incJson   = await incRes.json();
  const alertJson = await alertRes.json();

  const rawAlerts: any[] = alertJson.items ?? alertJson.alerts ?? [];
  const alertRunbookMap = new Map<string, number>();

  const allAlerts: Alert[] = rawAlerts.map((a: any) => {
    const summaryText = a.summary ?? '';
    const resText = a.resource?.name ?? '';
    const svc = classifyService(summaryText + ' ' + resText);

    // Calculate runbook count for this alert
    const insights: any[] = a.insights ?? [];
    const runbookInsights = insights.filter(
      (ins: any) => ins.type === 'aiops.ibm.com/insight-type/runbook' || ins.type?.includes('runbook')
    );
    const rbCount = runbookInsights.reduce((sum: number, ins: any) => {
      if (Array.isArray(ins.details?.runbooks) && ins.details.runbooks.length > 0) {
        return sum + ins.details.runbooks.length;
      }
      return sum + 1;
    }, 0);

    alertRunbookMap.set(a.id, rbCount);

    return {
      id:                  a.id,
      summary:             summaryText,
      severity:            a.severity ?? 0,
      state:               a.state ?? 'open',
      type:                a.type,
      resource:            a.resource,
      sender:              a.sender,
      firstOccurrenceTime: a.firstOccurrenceTime,
      lastOccurrenceTime:  a.lastOccurrenceTime,
      eventCount:          a.eventCount ?? 1,
      serviceKey:          svc.key,
      runbookCount:        rbCount,
    };
  });

  const rawIncidents: any[] = incJson.items ?? incJson.incidents ?? [];
  const incidents: Incident[] = rawIncidents.map((i: any) => {
    const titleText = i.title ?? i.summary ?? '(untitled)';
    const svc = classifyService(titleText + ' ' + (i.description ?? ''));
    const alertIds: string[] = i.alertIds ?? [];

    // Sum runbooks across all triggering alerts
    let rbCount = 0;
    for (const aid of alertIds) {
      rbCount += alertRunbookMap.get(aid) ?? 0;
    }

    // Check incident direct insights as fallback
    const directRbs = (i.insights ?? []).filter(
      (ins: any) => ins.type === 'aiops.ibm.com/insight-type/runbook' || ins.type?.includes('runbook')
    );
    if (directRbs.length > 0) {
      rbCount = Math.max(rbCount, directRbs.length);
    }

    return {
      id:                  i.id,
      title:               titleText,
      priority:            i.priority ?? 5,
      state:               i.state ?? 'open',
      createdTime:         i.createdTime ?? i.firstOccurrenceTime ?? '',
      alertIds,
      contextualAlertIds:  i.contextualAlertIds ?? [],
      runbookCount:        rbCount,
      serviceKey:          svc.key,
      serviceName:         svc.name,
    };
  });

  // Calculate Service Health
  const services: ServiceHealth[] = SERVICE_DEFINITIONS.map(def => {
    const svclncidents = incidents.filter(i => i.serviceKey === def.key);
    const svclAlerts   = allAlerts.filter(a => a.serviceKey === def.key);
    const critAlerts   = svclAlerts.filter(a => a.severity === 6);
    const p1p2Inc      = svclncidents.filter(i => i.priority <= 2);

    let status: 'critical' | 'degraded' | 'nominal' = 'nominal';
    let statusLabel = 'NOMINAL';

    if (p1p2Inc.length > 0 || critAlerts.length > 0) {
      status = 'critical';
      statusLabel = 'CRITICAL';
    } else if (svclncidents.length > 0 || svclAlerts.length > 0) {
      status = 'degraded';
      statusLabel = 'DEGRADED';
    }

    // Find top impacted component
    const resMap = new Map<string, number>();
    for (const a of svclAlerts) {
      const n = a.resource?.name || 'Service Component';
      resMap.set(n, (resMap.get(n) ?? 0) + 1);
    }
    for (const i of svclncidents) {
      const short = i.title.split(' - ')[0].slice(0, 30);
      resMap.set(short, (resMap.get(short) ?? 0) + 2);
    }

    let topComponent = 'None';
    let maxCount = 0;
    for (const [comp, cnt] of resMap.entries()) {
      if (cnt > maxCount) {
        maxCount = cnt;
        topComponent = comp;
      }
    }

    return {
      key: def.key,
      name: def.name,
      icon: def.icon,
      status,
      statusLabel,
      incidentCount: svclncidents.length,
      alertCount: svclAlerts.length,
      critAlertCount: critAlerts.length,
      topComponent,
    };
  });

  return {
    incidents,
    criticalAlerts: allAlerts.filter(a => a.severity === 6),
    majorAlerts:    allAlerts.filter(a => a.severity === 5),
    allAlerts,
    services,
    fetchedAt:      new Date().toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
  };
}

// ── Derived computations ──────────────────────────────────────────────────────

const PRIORITY_COLOURS: Record<number, string> = {
  1: '#da1e28',
  2: '#ff832b',
  3: '#f1c21b',
  4: '#4589ff',
  5: '#57606a',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5',
};

const PRIORITY_BADGE_MOD: Record<number, string> = {
  1: 'p1', 2: 'p2', 3: 'p3', 4: 'p4', 5: 'p5',
};

const SEVERITY_INFO: Record<number, { label: string; badgeMod: string }> = {
  6: { label: 'Critical', badgeMod: 's6' },
  5: { label: 'Major', badgeMod: 's5' },
  4: { label: 'Minor', badgeMod: 's4' },
  3: { label: 'Warning', badgeMod: 's3' },
  2: { label: 'Information', badgeMod: 's2' },
  1: { label: 'Indeterminate', badgeMod: 's1' },
  0: { label: 'Clear', badgeMod: 's0' },
};

const TIME_WINDOWS = [
  { label: 'Last 15 minutes',  value: 15 },
  { label: 'Last 30 minutes',  value: 30 },
  { label: 'Last 60 minutes',  value: 60 },
  { label: 'Last 4 hours',     value: 240 },
  { label: 'Last 24 hours',    value: 1440 },
  { label: 'All Open Alerts',  value: 0 },
];

/** Bucket alerts into categories by keyword matching on summary */
function categoriseAlerts(alerts: Alert[]): { label: string; count: number; color: string }[] {
  const buckets: [string, RegExp, string][] = [
    ['Erroneous call rate',       /erroneous|call.rate/i,                               '#da1e28'],
    ['Network / threshold',       /network|threshold|bandwidth|latency|cisco|switch|interface|link|bgp/i, '#0f62fe'],
    ['IBM MQ listeners/channels', /mq.*(listener|channel)|listener.*mq/i,               '#0e7a6e'],
    ['Pod / K8s health',          /pod|liveness|readiness|k8s|kubernetes|container/i,   '#1192e8'],
    ['MQ queue depth',            /queue.depth|depth.*queue/i,                          '#8a3ffc'],
    ['Instana health checks',     /instana|agent|probe/i,                               '#a0522d'],
    ['CPE gateway',               /cpe|gateway/i,                                       '#eb6200'],
    ['Node abnormal termination', /node.*terminat|terminat.*node|abnormal/i,            '#fa4d56'],
    ['Hardware / temperature',    /temperature|thermal|hardware|cpu.*(high|critical)|voltage/i, '#ba4e00'],
  ];

  const counts = new Map<string, { count: number; color: string }>();
  let other = 0;

  for (const alert of alerts) {
    let matched = false;
    for (const [label, pattern, color] of buckets) {
      if (pattern.test(alert.summary)) {
        const existing = counts.get(label);
        counts.set(label, { count: (existing?.count ?? 0) + 1, color });
        matched = true;
        break;
      }
    }
    if (!matched) other++;
  }

  const result = Array.from(counts.entries())
    .map(([label, { count, color }]) => ({ label, count, color }))
    .sort((a, b) => b.count - a.count);

  if (other > 0) result.push({ label: 'Other / misc', count: other, color: '#8d8d8d' });
  return result;
}

/** Group alerts by sender/integration source */
function getTopSenders(alerts: Alert[]): { label: string; count: number; color: string }[] {
  const SENDER_COLORS: Record<string, string> = {
    'Instana': '#0043ce',
    'file-observer': '#1192e8',
    'SevOne': '#0072c3',
    'SevOne Tiger': '#009d9a',
    'Nokia Netact': '#6929c4',
    'SNMP Probe': '#8a3ffc',
    'OMEGAMON': '#0e7a6e',
    'ELK': '#ee538b',
    'Netcool': '#005d5d', // not red: red means severity 6
  };

  const counts = new Map<string, number>();
  for (const a of alerts) {
    const sender = a.sender?.name || a.sender?.type || 'Other Observer';
    counts.set(sender, (counts.get(sender) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      color: SENDER_COLORS[label] || '#57606a',
    }));
}

/** Get top affected resources */
function getTopResources(alerts: Alert[]): { name: string; count: number; type: string }[] {
  const counts = new Map<string, { count: number; type: string }>();
  for (const a of alerts) {
    const rawName = a.resource?.name || 'Unknown resource';
    const type = a.resource?.type || 'INFRASTRUCTURE';
    const existing = counts.get(rawName);
    counts.set(rawName, { count: (existing?.count ?? 0) + 1, type });
  }

  return Array.from(counts.entries())
    .map(([name, { count, type }]) => ({ name, count, type }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/** Build donut segments for incidents by priority */
function buildDonutSegments(incidents: Incident[]) {
  const counts = new Map<number, number>();
  for (const inc of incidents) {
    counts.set(inc.priority, (counts.get(inc.priority) ?? 0) + 1);
  }
  const total = incidents.length || 1;
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([priority, count]) => ({
      priority,
      count,
      pct: (count / total) * 100,
      color: PRIORITY_COLOURS[priority] ?? '#57606a',
      label: PRIORITY_LABELS[priority] ?? `P${priority}`,
    }));
}

/** Build SVG donut path from segments */
function DonutChart({ segments }: { segments: ReturnType<typeof buildDonutSegments> }) {
  const r = 15.9;
  let offset = 25;

  return (
    <svg width="100" height="100" viewBox="0 0 42 42" className="inc-dash__donut-svg">
      <circle cx="21" cy="21" r={r} fill="transparent" stroke="#e0e0e0" strokeWidth="5.5" />
      {segments.map(seg => {
        const dash = (seg.pct / 100) * 100;
        const gap  = 100 - dash;
        const el = (
          <circle key={seg.priority}
            cx="21" cy="21" r={r}
            fill="transparent"
            stroke={seg.color}
            strokeWidth="5.5"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset + 25}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

/** Format ISO date string to YYYY-MM-DD */
function fmtDate(iso: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return iso; }
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function fmtRelativeTime(iso?: string): string {
  if (!iso) return '—';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${Math.max(diffSec, 1)}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ${diffMin % 60}m ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  } catch {
    return iso;
  }
}

// ── Key Observations (derived) ────────────────────────────────────────────────

function deriveObservations(data: DashData): string[] {
  const obs: string[] = [];
  const { incidents, criticalAlerts, majorAlerts, services } = data;

  // Impacted services summary
  const critServices = services.filter(s => s.status === 'critical');
  if (critServices.length > 0) {
    obs.push(`${critServices.length} critical service${critServices.length > 1 ? 's' : ''} impacted: ${critServices.map(s => s.name).join(', ')}.`);
  }

  // High priority incidents callout
  const p1p2 = incidents.filter(i => i.priority <= 2);
  if (p1p2.length > 0) {
    obs.push(`${p1p2.length} High-Priority Incident${p1p2.length > 1 ? 's' : ''} (P1/P2) require active triage (e.g. "${p1p2[0].title}").`);
  }

  // Dominant critical alert category
  const cats = categoriseAlerts(criticalAlerts);
  if (cats.length > 0) {
    const top = cats[0];
    obs.push(`${top.label} is the top alert pattern (${top.count} of ${criticalAlerts.length} Sev 6 alerts).`);
  }

  // Top impacted resource
  const topRes = getTopResources(criticalAlerts);
  if (topRes.length > 0 && topRes[0].count > 1) {
    obs.push(`Resource hot-spot: "${topRes[0].name}" has ${topRes[0].count} correlated critical alerts.`);
  }

  // Major alerts volume
  if (majorAlerts.length > 0) {
    obs.push(`${majorAlerts.length} major (Sev 5) warning alerts open across monitored services.`);
  }

  return obs.slice(0, 5);
}

// ── Refresh interval options ──────────────────────────────────────────────────

const INTERVALS = [
  { label: 'Off',   value: 0    },
  { label: '30s',   value: 30   },
  { label: '60s',   value: 60   },
  { label: '5 min', value: 300  },
];

// ── State shared by every copy of this component on a page ────────────────────
// The dashboard can be split into separate tiles with the `part` prop (see README). All of them use ONE fetch, ONE
// refresh timer and ONE service filter, so they still behave as a single dashboard. Without `part` nothing changes.

interface Shared {
  data:            DashData | null;
  loading:         boolean;
  error:           string | null;
  intervalSec:     number;
  selectedService: string | null;
}

let shared: Shared = { data: null, loading: true, error: null, intervalSec: 60, selectedService: null };
let countdownValue = 60;
const sharedListeners    = new Set<() => void>();
const countdownListeners = new Set<() => void>();

function setShared(patch: Partial<Shared>) {
  shared = { ...shared, ...patch };
  sharedListeners.forEach(l => l());
}

function setCountdownValue(v: number) {
  countdownValue = v;
  countdownListeners.forEach(l => l());
}

const subscribeShared    = (l: () => void) => { sharedListeners.add(l);    return () => { sharedListeners.delete(l); }; };
const subscribeCountdown = (l: () => void) => { countdownListeners.add(l); return () => { countdownListeners.delete(l); }; };
const getShared    = () => shared;
const getCountdown = () => countdownValue;

let inflight: Promise<void> | null = null;

function refreshShared(): Promise<void> {
  if (inflight) return inflight;
  setShared({ loading: true, error: null });
  inflight = fetchAll()
    .then(d  => { setShared({ data: d, loading: false }); })
    .catch(e => { setShared({ error: (e && e.message) || 'Unknown error', loading: false }); })
    .then(() => { inflight = null; });
  return inflight;
}

function setSharedInterval(v: number) {
  setShared({ intervalSec: v });
  setCountdownValue(v);
}

function setSharedService(key: string | null) {
  setShared({ selectedService: key });
}

let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** Called once by every mounted copy. The first one starts the refresh timer and the load; the last one to leave stops the timer. */
function joinShared(): () => void {
  users += 1;
  if (users === 1) {
    setCountdownValue(shared.intervalSec);
    timer = setInterval(() => {
      if (shared.intervalSec === 0) return;
      if (countdownValue <= 1) { setCountdownValue(shared.intervalSec); void refreshShared(); }
      else setCountdownValue(countdownValue - 1);
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

/** "next sync in Ns": subscribes to the one-second tick on its own, so only this little piece re-renders every second. */
function Countdown() {
  const c = useSyncExternalStore(subscribeCountdown, getCountdown, getCountdown);
  const { intervalSec } = useSyncExternalStore(subscribeShared, getShared, getShared);
  return intervalSec > 0 ? <span className="inc-dash__countdown"> · next sync in {c}s</span> : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `part` (optional) shows ONE section of the dashboard instead of the whole page, so it can sit in its own tile:
 * header, kpis, services, priority, critical, major, sources, incidents, intel, stream.
 */
const IncidentDashboard: React.FC<{ part?: string }> = ({ part }) => {
  const { data, loading, error, intervalSec, selectedService } = useSyncExternalStore(subscribeShared, getShared, getShared);
  const setSelectedService = setSharedService;
  const [priorityFilter,   setPriorityFilter]   = useState<'all' | 'p1p2' | 'p3' | 'p4p5'>('all');
  const [searchQuery,      setSearchQuery]      = useState('');
  const [activeTab,        setActiveTab]        = useState<'resources' | 'observations' | 'recent'>('resources');

  // Recent Alerts stream state
  const [timeWindowMin,    setTimeWindowMin]    = useState<number>(60); // Default to last 60 minutes
  const [alertSevFilter,   setAlertSevFilter]   = useState<'all' | 'sev6' | 'sev5' | 'sev4_below'>('all');
  const [alertSearch,      setAlertSearch]      = useState<string>('');

  const refresh = () => { void refreshShared(); };

  // First copy on the page loads the data and runs the refresh timer (see "State shared" above).
  useEffect(() => joinShared(), []);

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    if (!data) return [];
    return data.incidents
      .filter(inc => {
        if (priorityFilter === 'p1p2') return inc.priority <= 2;
        if (priorityFilter === 'p3')   return inc.priority === 3;
        if (priorityFilter === 'p4p5') return inc.priority >= 4;
        return true;
      })
      .filter(inc => {
        if (!selectedService) return true;
        return inc.serviceKey === selectedService;
      })
      .filter(inc => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return inc.title.toLowerCase().includes(q) || inc.id.toLowerCase().includes(q) || inc.serviceName.toLowerCase().includes(q);
      })
      .sort((a, b) => a.priority - b.priority || new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  }, [data, priorityFilter, selectedService, searchQuery]);

  // Filtered recent alerts stream
  const filteredRecentAlerts = useMemo(() => {
    if (!data) return [];
    const now = Date.now();

    return data.allAlerts
      .filter(alert => {
        // Time window filter
        if (timeWindowMin > 0) {
          const t = alert.lastOccurrenceTime || alert.firstOccurrenceTime;
          if (!t) return false;
          const alertTime = new Date(t).getTime();
          const diffMin = (now - alertTime) / (1000 * 60);
          if (diffMin > timeWindowMin) return false;
        }
        return true;
      })
      .filter(alert => {
        // Severity filter
        if (alertSevFilter === 'sev6') return alert.severity === 6;
        if (alertSevFilter === 'sev5') return alert.severity === 5;
        if (alertSevFilter === 'sev4_below') return alert.severity <= 4;
        return true;
      })
      .filter(alert => {
        // Service filter
        if (!selectedService) return true;
        return alert.serviceKey === selectedService;
      })
      .filter(alert => {
        // Search query
        if (!alertSearch.trim()) return true;
        const q = alertSearch.toLowerCase();
        const resName = alert.resource?.name?.toLowerCase() || '';
        const senderName = (alert.sender?.name || alert.sender?.type || '').toLowerCase();
        return alert.summary.toLowerCase().includes(q) || resName.includes(q) || senderName.includes(q) || alert.id.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const timeA = new Date(a.lastOccurrenceTime || a.firstOccurrenceTime || 0).getTime();
        const timeB = new Date(b.lastOccurrenceTime || b.firstOccurrenceTime || 0).getTime();
        return timeB - timeA;
      });
  }, [data, timeWindowMin, alertSevFilter, selectedService, alertSearch]);

  const header = (children?: React.ReactNode) => (
    <div className="inc-dash__header">
      <div>
        <div className="inc-dash__title-wrap">
          <h1 className="inc-dash__title">Incident &amp; Alert Operations Dashboard</h1>
          <span className="inc-dash__status-indicator" title="Connected to Concert Operate Live Feed">● LIVE</span>
        </div>
        {children}
      </div>
      <div className="inc-dash__controls">
        <label className="inc-dash__control-label">Refresh:</label>
        <select
          className="inc-dash__interval-select"
          value={intervalSec}
          onChange={e => setSharedInterval(Number(e.target.value))}
          aria-label="Auto-refresh interval"
        >
          {INTERVALS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          className={`inc-dash__refresh-btn${loading ? ' inc-dash__refresh-btn--spinning' : ''}`}
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh now"
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  );

  const rootClass = part ? 'inc-dash inc-dash--part' : 'inc-dash';
  const showHeader = !part || part === 'header';

  if (loading && !data) return (
    <div className={rootClass}>
      {showHeader && header()}
      <div className="inc-dash__subtitle inc-dash__subtitle--loading">Loading Concert Operate live telemetry…</div>
    </div>
  );

  if (error || !data) return (
    <div className={rootClass}>
      {showHeader && header()}
      <div className="inc-dash__subtitle inc-dash__subtitle--error">
        Failed to load Concert Operate telemetry: {error ?? 'No data returned'}.
      </div>
    </div>
  );

  const { incidents, criticalAlerts, majorAlerts, allAlerts, services, fetchedAt } = data;

  // Derived values
  const totalIncidents  = incidents.length;
  const p1p2Count       = incidents.filter(i => i.priority <= 2).length;
  const criticalCount   = criticalAlerts.length;
  const majorCount      = majorAlerts.length;
  const topIncident     = [...incidents].sort((a, b) => b.alertIds.length - a.alertIds.length)[0];
  const alertCategories = categoriseAlerts(criticalAlerts).slice(0, 6);
  const majorCategories = categoriseAlerts(majorAlerts).slice(0, 5);
  const topSenders      = getTopSenders(allAlerts).slice(0, 5);
  const topResources    = getTopResources(criticalAlerts);
  const maxCritCat      = Math.max(...alertCategories.map(c => c.count), 1);
  const maxMajorCat     = Math.max(...majorCategories.map(c => c.count), 1);
  const maxSenderCount  = Math.max(...topSenders.map(s => s.count), 1);
  const donutSegments   = buildDonutSegments(incidents);
  const observations    = deriveObservations(data);
  const recentCritical  = criticalAlerts.slice(0, 5);

  // ── The sections, each one a block of the page ──
  const headerEl = header(

        <div className="inc-dash__subtitle">
          {totalIncidents} active incidents · {criticalCount} critical (Sev 6) · {majorCount} major (Sev 5) · Synced at {fetchedAt}
          <Countdown />
        </div>
  );

  const kpiRow = (
      <div className="inc-dash__kpi-row">
        <div className="inc-dash__kpi">
          <div className="inc-dash__kpi-label">Total Incidents</div>
          <div className="inc-dash__kpi-value inc-dash__kpi-value--dark">{totalIncidents}</div>
          <div className="inc-dash__kpi-sub">All active in tenant</div>
        </div>

        <div className="inc-dash__kpi">
          <div className="inc-dash__kpi-label">P1 / P2 Incidents</div>
          <div className={`inc-dash__kpi-value ${p1p2Count > 0 ? 'inc-dash__kpi-value--red' : 'inc-dash__kpi-value--dark'}`}>
            {p1p2Count}
          </div>
          <div className="inc-dash__kpi-sub">{p1p2Count > 0 ? 'Requires immediate action' : 'No critical incidents'}</div>
        </div>

        <div className="inc-dash__kpi">
          <div className="inc-dash__kpi-label">Critical Alerts</div>
          <div className="inc-dash__kpi-value inc-dash__kpi-value--red">{criticalCount}</div>
          <div className="inc-dash__kpi-sub">Severity 6 (Open)</div>
        </div>

        <div className="inc-dash__kpi">
          <div className="inc-dash__kpi-label">Major Alerts</div>
          <div className="inc-dash__kpi-value inc-dash__kpi-value--orange">{majorCount}</div>
          <div className="inc-dash__kpi-sub">Severity 5 (Open)</div>
        </div>

        <div className="inc-dash__kpi">
          <div className="inc-dash__kpi-label">Top Alert Ingestion</div>
          <div className="inc-dash__kpi-value inc-dash__kpi-value--blue" style={{ fontSize: '20px', lineHeight: '1.2' }}>
            {topSenders[0]?.label ?? 'None'}
          </div>
          <div className="inc-dash__kpi-sub">{topSenders[0] ? `${topSenders[0].count} alerts (${((topSenders[0].count / allAlerts.length) * 100).toFixed(0)}%)` : 'No telemetry'}</div>
        </div>

        <div className="inc-dash__kpi">
          <div className="inc-dash__kpi-label">Max Incident Scope</div>
          <div className="inc-dash__kpi-value inc-dash__kpi-value--purple">
            {topIncident ? `${topIncident.alertIds.length} Alerts` : '—'}
          </div>
          <div className="inc-dash__kpi-sub" title={topIncident?.title}>
            {topIncident ? (topIncident.title.length > 24 ? topIncident.title.slice(0, 24) + '…' : topIncident.title) : '—'}
          </div>
        </div>
      </div>
  );

  const servicesSection = (
      <div className="inc-dash__services-section">
        <div className="inc-dash__services-header">
          <div className="inc-dash__services-title-wrap">
            <h2 className="inc-dash__services-title">Business &amp; Application Services Health</h2>
            <span className="inc-dash__services-hint">
              {selectedService ? (
                <>Filtered by <strong>{services.find(s => s.key === selectedService)?.name}</strong> · <button className="inc-dash__clear-filter-btn" onClick={() => setSelectedService(null)}>Clear filter</button></>
              ) : (
                'Real-time status across key operational domains · Click any service to filter incidents & alerts'
              )}
            </span>
          </div>
          {selectedService && (
            <button className="inc-dash__reset-svc-btn" onClick={() => setSelectedService(null)}>
              Show All Services
            </button>
          )}
        </div>

        <div className="inc-dash__services-grid">
          {services.map(svc => {
            const isSelected = selectedService === svc.key;
            return (
              <div
                key={svc.key}
                className={`inc-dash__svc-card inc-dash__svc-card--${svc.status} ${isSelected ? 'inc-dash__svc-card--selected' : ''}`}
                onClick={() => setSelectedService(isSelected ? null : svc.key)}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
              >
                <div className="inc-dash__svc-header">
                  <div className="inc-dash__svc-name-wrap">
                    <span className="inc-dash__svc-icon">{svc.icon}</span>
                    <span className="inc-dash__svc-name">{svc.name}</span>
                  </div>
                  <span className={`inc-dash__svc-status inc-dash__svc-status--${svc.status}`}>
                    {svc.statusLabel}
                  </span>
                </div>

                <div className="inc-dash__svc-metrics">
                  <div className="inc-dash__svc-metric">
                    <span className="inc-dash__svc-metric-val">{svc.incidentCount}</span>
                    <span className="inc-dash__svc-metric-lbl">Incidents</span>
                  </div>
                  <div className="inc-dash__svc-metric">
                    <span className="inc-dash__svc-metric-val">{svc.alertCount}</span>
                    <span className="inc-dash__svc-metric-lbl">Alerts</span>
                  </div>
                  <div className="inc-dash__svc-metric">
                    <span className={`inc-dash__svc-metric-val ${svc.critAlertCount > 0 ? 'inc-dash__svc-metric-val--red' : ''}`}>
                      {svc.critAlertCount}
                    </span>
                    <span className="inc-dash__svc-metric-lbl">Sev 6</span>
                  </div>
                </div>

                <div className="inc-dash__svc-footer" title={`Top component: ${svc.topComponent}`}>
                  <span className="inc-dash__svc-footer-lbl">Hot-spot:</span>
                  <span className="inc-dash__svc-footer-val">{svc.topComponent}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
  );

  const priorityCard = (
        <div className="inc-dash__card">
          <div className="inc-dash__card-header">
            <h3>Incidents by Priority</h3>
            <span className="inc-dash__card-count">{totalIncidents} total</span>
          </div>
          {incidents.length === 0 ? (
            <div className="inc-dash__empty">No active incidents</div>
          ) : (
            <div className="inc-dash__donut-wrap">
              <DonutChart segments={donutSegments} />
              <div className="inc-dash__donut-legend">
                {donutSegments.map(seg => (
                  <div className="inc-dash__legend-item" key={seg.priority}>
                    <div className="inc-dash__legend-dot" style={{ background: seg.color }} />
                    <span className="inc-dash__legend-label">{seg.label}</span>
                    <span className="inc-dash__legend-val">{seg.count} ({seg.pct.toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
  );

  const criticalCard = (
        <div className="inc-dash__card">
          <div className="inc-dash__card-header">
            <h3>Critical Alert Categories (Sev 6)</h3>
            <span className="inc-dash__card-count">{criticalCount} alerts</span>
          </div>
          {alertCategories.length === 0 ? (
            <div className="inc-dash__empty">No critical alerts</div>
          ) : (
            <div className="inc-dash__bar-list">
              {alertCategories.map(({ label, count }) => (
                <div className="inc-dash__bar-row" key={label}>
                  <div className="inc-dash__bar-label" title={label}>{label}</div>
                  <div className="inc-dash__bar-track">
                    <div
                      className="inc-dash__bar-fill"
                      style={{ width: `${(count / maxCritCat) * 100}%`, background: '#da1e28' /* severity 6 */ }}
                    />
                  </div>
                  <div className="inc-dash__bar-count">{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
  );

  const majorCard = (
        <div className="inc-dash__card">
          <div className="inc-dash__card-header">
            <h3>Major Alert Categories (Sev 5)</h3>
            <span className="inc-dash__card-count">{majorCount} alerts</span>
          </div>
          {majorCategories.length === 0 ? (
            <div className="inc-dash__empty">No major alerts</div>
          ) : (
            <div className="inc-dash__bar-list">
              {majorCategories.map(({ label, count }) => (
                <div className="inc-dash__bar-row" key={label}>
                  <div className="inc-dash__bar-label" title={label}>{label}</div>
                  <div className="inc-dash__bar-track">
                    <div
                      className="inc-dash__bar-fill"
                      style={{ width: `${(count / maxMajorCat) * 100}%`, background: '#ff832b' /* severity 5 */ }}
                    />
                  </div>
                  <div className="inc-dash__bar-count">{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
  );

  const sourcesCard = (
        <div className="inc-dash__card">
          <div className="inc-dash__card-header">
            <h3>Alert Ingestion Sources</h3>
            <span className="inc-dash__card-count">{allAlerts.length} total</span>
          </div>
          {topSenders.length === 0 ? (
            <div className="inc-dash__empty">No alert sources</div>
          ) : (
            <div className="inc-dash__bar-list">
              {topSenders.map(({ label, count, color }) => (
                <div className="inc-dash__bar-row" key={label}>
                  <div className="inc-dash__bar-label" title={label}>{label}</div>
                  <div className="inc-dash__bar-track">
                    <div
                      className="inc-dash__bar-fill"
                      style={{ width: `${(count / maxSenderCount) * 100}%`, background: color }}
                    />
                  </div>
                  <div className="inc-dash__bar-count">{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
  );

  const incidentsCard = (
        <div className="inc-dash__card inc-dash__card--table">
          <div className="inc-dash__table-header">
            <div>
              <h3>Active Incidents</h3>
              <div className="inc-dash__table-subtitle">
                Showing {filteredIncidents.length} of {incidents.length} incidents
                {selectedService && (
                  <span className="inc-dash__filter-tag"> · Filtered: {services.find(s => s.key === selectedService)?.name}</span>
                )}
              </div>
            </div>

            <div className="inc-dash__table-tools">
              <input
                type="text"
                placeholder="Search incidents or services…"
                className="inc-dash__search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search incidents"
              />
              <div className="inc-dash__filter-pills">
                <button
                  className={`inc-dash__pill ${priorityFilter === 'all' ? 'inc-dash__pill--active' : ''}`}
                  onClick={() => setPriorityFilter('all')}
                >
                  All ({incidents.length})
                </button>
                <button
                  className={`inc-dash__pill ${priorityFilter === 'p1p2' ? 'inc-dash__pill--active' : ''}`}
                  onClick={() => setPriorityFilter('p1p2')}
                >
                  P1/P2 ({p1p2Count})
                </button>
                <button
                  className={`inc-dash__pill ${priorityFilter === 'p3' ? 'inc-dash__pill--active' : ''}`}
                  onClick={() => setPriorityFilter('p3')}
                >
                  P3 ({incidents.filter(i => i.priority === 3).length})
                </button>
                <button
                  className={`inc-dash__pill ${priorityFilter === 'p4p5' ? 'inc-dash__pill--active' : ''}`}
                  onClick={() => setPriorityFilter('p4p5')}
                >
                  P4/P5 ({incidents.filter(i => i.priority >= 4).length})
                </button>
              </div>
            </div>
          </div>

          <div className="inc-dash__table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '42px' }}>Pri</th>
                  <th>Incident Title</th>
                  <th style={{ width: '110px' }}>Service</th>
                  <th style={{ width: '65px', textAlign: 'center' }}>Runbooks</th>
                  <th style={{ width: '55px', textAlign: 'center' }}>Trigger</th>
                  <th style={{ width: '55px', textAlign: 'center' }}>Context</th>
                  <th style={{ width: '80px' }}>State</th>
                  <th style={{ width: '80px' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="inc-dash__empty-td">
                      No incidents match current filter
                    </td>
                  </tr>
                ) : (
                  filteredIncidents.map(inc => {
                    const incUrl = `/aiops/${TENANT_ID}/resolution-hub/incidents/all/${inc.id}/overview`;
                    return (
                      <tr key={inc.id}>
                        <td>
                          <span className={`inc-dash__badge inc-dash__badge--${PRIORITY_BADGE_MOD[inc.priority] ?? 'p5'}`}>
                            {PRIORITY_LABELS[inc.priority] ?? `P${inc.priority}`}
                          </span>
                        </td>
                        <td className="inc-dash__title-cell">
                          <a
                            href={incUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inc-dash__title-link"
                            title={`Open incident "${inc.title}" in Concert Operate Resolution Hub`}
                          >
                            <span className="inc-dash__title-text">{inc.title}</span>
                            <span className="inc-dash__link-icon">↗</span>
                          </a>
                        </td>
                        <td>
                          <span
                            className="inc-dash__service-pill"
                            onClick={() => setSelectedService(selectedService === inc.serviceKey ? null : inc.serviceKey)}
                            title={`Filter by ${inc.serviceName}`}
                          >
                            {inc.serviceName}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {inc.runbookCount > 0 ? (
                            <span className="inc-dash__runbook-badge" title={`${inc.runbookCount} runbooks attached`}>
                              📖 {inc.runbookCount}
                            </span>
                          ) : (
                            <span className="inc-dash__runbook-zero" title="No runbooks attached">0</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{inc.alertIds.length}</td>
                        <td style={{ textAlign: 'center', color: '#6f6f6f' }}>{inc.contextualAlertIds.length}</td>
                        <td>
                          <span className="inc-dash__state-tag">{inc.state}</span>
                        </td>
                        <td style={{ fontSize: '11px', color: '#525252' }}>{fmtDate(inc.createdTime)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
  );

  const intelCard = (
        <div className="inc-dash__card inc-dash__card--intel">
          <div className="inc-dash__intel-tabs">
            <button
              className={`inc-dash__tab-btn ${activeTab === 'resources' ? 'inc-dash__tab-btn--active' : ''}`}
              onClick={() => setActiveTab('resources')}
            >
              Top Resources ({topResources.length})
            </button>
            <button
              className={`inc-dash__tab-btn ${activeTab === 'observations' ? 'inc-dash__tab-btn--active' : ''}`}
              onClick={() => setActiveTab('observations')}
            >
              Key Observations ({observations.length})
            </button>
            <button
              className={`inc-dash__tab-btn ${activeTab === 'recent' ? 'inc-dash__tab-btn--active' : ''}`}
              onClick={() => setActiveTab('recent')}
            >
              Recent Sev 6 ({recentCritical.length})
            </button>
          </div>

          <div className="inc-dash__intel-body">
            {activeTab === 'resources' && (
              <div className="inc-dash__resource-list">
                {topResources.length === 0 ? (
                  <div className="inc-dash__empty">No impacted resources</div>
                ) : (
                  topResources.map((res, idx) => (
                    <div className="inc-dash__resource-row" key={res.name}>
                      <span className="inc-dash__rank-num">#{idx + 1}</span>
                      <div className="inc-dash__resource-info">
                        <div className="inc-dash__resource-name" title={res.name}>{res.name}</div>
                        <div className="inc-dash__resource-type">{res.type}</div>
                      </div>
                      <div className="inc-dash__resource-badge">
                        {res.count} alert{res.count > 1 ? 's' : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'observations' && (
              <ul className="inc-dash__obs-list">
                {observations.map((obs, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: obs.replace(/^([^:]+:)/, '<strong>$1</strong>') }} />
                ))}
              </ul>
            )}

            {activeTab === 'recent' && (
              <div className="inc-dash__recent-alerts">
                {recentCritical.length === 0 ? (
                  <div className="inc-dash__empty">No recent critical alerts</div>
                ) : (
                  recentCritical.map(alert => (
                    <div className="inc-dash__recent-item" key={alert.id}>
                      <div className="inc-dash__recent-header">
                        <span className="inc-dash__badge inc-dash__badge--p1">SEV 6</span>
                        <span className="inc-dash__recent-res">{alert.resource?.name || 'Cluster Host'}</span>
                        <span className="inc-dash__recent-time">{fmtTime(alert.lastOccurrenceTime || alert.firstOccurrenceTime)}</span>
                      </div>
                      <div className="inc-dash__recent-summary">{alert.summary}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
  );

  const streamCard = (
      <div className="inc-dash__card inc-dash__card--alerts-stream">
        <div className="inc-dash__stream-header">
          <div>
            <div className="inc-dash__stream-title-wrap">
              <h3>Recent Alerts Stream</h3>
              <span className="inc-dash__stream-count">
                {filteredRecentAlerts.length} alert{filteredRecentAlerts.length !== 1 ? 's' : ''} in view
                {timeWindowMin > 0 ? ` (Last ${timeWindowMin >= 60 ? `${timeWindowMin / 60} hour${timeWindowMin > 60 ? 's' : ''}` : `${timeWindowMin} min`})` : ' (All Open)'}
                {selectedService && <span> · Service: {services.find(s => s.key === selectedService)?.name}</span>}
              </span>
            </div>
            <div className="inc-dash__stream-subtitle">
              Live alert feed from connected observers and telemetry probes · Ordered by most recent occurrence
            </div>
          </div>

          <div className="inc-dash__stream-tools">
            {/* Time Window Select Dropdown */}
            <div className="inc-dash__time-select-wrap">
              <label className="inc-dash__time-label">Time Window:</label>
              <select
                className="inc-dash__time-select"
                value={timeWindowMin}
                onChange={e => setTimeWindowMin(Number(e.target.value))}
                aria-label="Filter alerts by time window"
              >
                {TIME_WINDOWS.map(w => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>

            {/* Severity Filter Pills */}
            <div className="inc-dash__filter-pills">
              <button
                className={`inc-dash__pill ${alertSevFilter === 'all' ? 'inc-dash__pill--active' : ''}`}
                onClick={() => setAlertSevFilter('all')}
              >
                All
              </button>
              <button
                className={`inc-dash__pill ${alertSevFilter === 'sev6' ? 'inc-dash__pill--active' : ''}`}
                onClick={() => setAlertSevFilter('sev6')}
              >
                Sev 6 ({data.allAlerts.filter(a => a.severity === 6).length})
              </button>
              <button
                className={`inc-dash__pill ${alertSevFilter === 'sev5' ? 'inc-dash__pill--active' : ''}`}
                onClick={() => setAlertSevFilter('sev5')}
              >
                Sev 5 ({data.allAlerts.filter(a => a.severity === 5).length})
              </button>
              <button
                className={`inc-dash__pill ${alertSevFilter === 'sev4_below' ? 'inc-dash__pill--active' : ''}`}
                onClick={() => setAlertSevFilter('sev4_below')}
              >
                Sev 1-4 ({data.allAlerts.filter(a => a.severity <= 4).length})
              </button>
            </div>

            {/* Alert Search */}
            <input
              type="text"
              placeholder="Search alert summary, resource, sender…"
              className="inc-dash__search-input inc-dash__search-input--stream"
              value={alertSearch}
              onChange={e => setAlertSearch(e.target.value)}
              aria-label="Search alerts"
            />
          </div>
        </div>

        <div className="inc-dash__stream-table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '50px' }}>Sev</th>
                <th>Alert Summary</th>
                <th style={{ width: '180px' }}>Impacted Resource</th>
                <th style={{ width: '110px' }}>Source / Sender</th>
                <th style={{ width: '120px' }}>Service</th>
                <th style={{ width: '65px', textAlign: 'center' }}>Runbook</th>
                <th style={{ width: '45px', textAlign: 'center' }}>Count</th>
                <th style={{ width: '60px' }}>State</th>
                <th style={{ width: '85px' }}>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecentAlerts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="inc-dash__empty-td">
                    No alerts match the selected time window and filters ({TIME_WINDOWS.find(w => w.value === timeWindowMin)?.label})
                  </td>
                </tr>
              ) : (
                filteredRecentAlerts.map(alert => {
                  const sevInfo = SEVERITY_INFO[alert.severity] ?? { label: `Sev ${alert.severity}`, badgeMod: 's0' };
                  const resName = alert.resource?.name || '—';
                  const senderName = alert.sender?.name || alert.sender?.type || 'Observer';
                  const alertTime = alert.lastOccurrenceTime || alert.firstOccurrenceTime;
                  const serviceObj = classifyService(alert.summary + ' ' + resName);

                  return (
                    <tr key={alert.id}>
                      <td>
                        <span className={`inc-dash__sev-badge inc-dash__sev-badge--${sevInfo.badgeMod}`}>
                          {sevInfo.label}
                        </span>
                      </td>
                      <td className="inc-dash__alert-summary-cell" title={alert.summary}>
                        <div className="inc-dash__alert-summary-text">{alert.summary}</div>
                      </td>
                      <td className="inc-dash__alert-res-cell" title={resName}>
                        <div className="inc-dash__alert-res-name">{resName}</div>
                        {alert.resource?.type && (
                          <div className="inc-dash__alert-res-type">{alert.resource.type}</div>
                        )}
                      </td>
                      <td>
                        <span className="inc-dash__sender-tag">{senderName}</span>
                      </td>
                      <td>
                        <span
                          className="inc-dash__service-pill"
                          onClick={() => setSelectedService(selectedService === serviceObj.key ? null : serviceObj.key)}
                          title={`Filter by ${serviceObj.name}`}
                        >
                          {serviceObj.name}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {alert.runbookCount > 0 ? (
                          <span className="inc-dash__runbook-badge" title={`${alert.runbookCount} runbooks attached`}>
                            📖 {alert.runbookCount}
                          </span>
                        ) : (
                          <span className="inc-dash__runbook-zero">—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: alert.eventCount && alert.eventCount > 1 ? '#0f62fe' : '#525252' }}>
                        {alert.eventCount ?? 1}
                      </td>
                      <td>
                        <span className="inc-dash__state-tag">{alert.state}</span>
                      </td>
                      <td style={{ fontSize: '11px', color: '#525252', whiteSpace: 'nowrap' }} title={alertTime ? new Date(alertTime).toLocaleString() : ''}>
                        {fmtRelativeTime(alertTime)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
  );

  const sections: Record<string, React.ReactNode> = {
    header:    headerEl,
    kpis:      kpiRow,
    services:  servicesSection,
    priority:  priorityCard,
    critical:  criticalCard,
    major:     majorCard,
    sources:   sourcesCard,
    incidents: incidentsCard,
    intel:     intelCard,
    stream:    streamCard,
  };

  // One section on its own (inside a tile). An unknown name shows the whole dashboard.
  if (part && sections[part]) {
    return <div className="inc-dash inc-dash--part">{sections[part]}</div>;
  }

  return (
    <div className="inc-dash">

      {headerEl}

      {/* ── Top Executive KPI Bar (6 Columns) ── */}
      {kpiRow}

      {/* ── Business & Application Services Health Grid (Option 1) ── */}
      {servicesSection}

      {/* ── Middle Analytics Row (4 Columns Grid across full screen) ── */}
      <div className="inc-dash__analytics-row">
        {priorityCard}
        {criticalCard}
        {majorCard}
        {sourcesCard}
      </div>

      {/* ── Operational Grid (2 Columns: Incidents Table + Operational Intelligence) ── */}
      <div className="inc-dash__ops-row">
        {incidentsCard}
        {intelCard}
      </div>

      {/* ── Bottom Full-Width Widget: Most Recent Alerts Stream ── */}
      {streamCard}

    </div>
  );
};

export default IncidentDashboard;
