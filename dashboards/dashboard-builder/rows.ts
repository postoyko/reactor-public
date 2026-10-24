/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Turns query responses into flat rows and aggregates them. Nothing is invented: a field that is missing stays
 * undefined and is shown as "(none)".
 */

import { Metric, QueryName, Row } from './types';

export const SEVERITY_LABELS = ['Clear', 'Indeterminate', 'Information', 'Warning', 'Minor', 'Major', 'Critical'];
/** Carbon-ish colours, indexed by severity number 0..6 (same order as SEVERITY_LABELS). */
export const SEVERITY_COLORS = ['#8d8d8d', '#a56eff', '#78a9ff', '#4589ff', '#f1c21b', '#ff832b', '#da1e28'];

/** Text colour that reads on top of each severity fill (dark on yellow, orange, light blue and grey; white on the rest). */
export const SEVERITY_INK = ['#161616', '#ffffff', '#161616', '#ffffff', '#161616', '#161616', '#ffffff'];
/** Incident priority is its own scale, P1 to P5 (index 0 is P1). */
export const PRIORITY_COLORS = ['#da1e28', '#ff832b', '#f1c21b', '#4589ff', '#57606a'];
export const PRIORITY_INK = ['#ffffff', '#161616', '#161616', '#ffffff', '#ffffff'];

/**
 * The colour a value must have wherever it is shown, or undefined when the field has no fixed colour. Severity (by label or by
 * number) and priority always use the same palette, so Critical is the same red in every chart, tag, tile and table.
 */
export function semanticColor(field: string, key: string): { fill: string; ink: string } | undefined {
  if (field === 'severityLabel' || field === 'severity') {
    const k = field === 'severityLabel' ? SEVERITY_LABELS.indexOf(key) : (key !== '' && Number.isFinite(Number(key)) ? Math.round(Number(key)) : -1);
    if (k >= 0 && k <= 6) return { fill: SEVERITY_COLORS[k], ink: SEVERITY_INK[k] };
  }
  if (field === 'priority') {
    const k = Math.round(Number(key)) - 1;
    if (key !== '' && Number.isFinite(Number(key)) && k >= 0 && k <= 4) return { fill: PRIORITY_COLORS[k], ink: PRIORITY_INK[k] };
  }
  return undefined;
}

/** Business service domains, worked out from the alert or incident text (same rules as the incident-alert-dashboard). */
export const SERVICES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Banking & Payments', pattern: /banking|loyalty|balance|payment|bank|apic-gw|gateway|checkout|orders/i },
  { name: 'Digital Microservices', pattern: /recommendation-svc|qotd|coredb|discount-svc|proxy-supplychain|bk1-eg2|suggestions|erroneous call rate/i },
  { name: 'Mainframe & IBM MQ', pattern: /mq|queue|listener|dsna|cics|db2|subsystem|enmesh|acemq|kafka|consumer lag/i },
  { name: 'Telecom & Optical Core', pattern: /cisco|fujitsu|loss of signal|mttrapd|switch|router|voltage|tenge|tengige|nyfbop|rchmd|eth1|network/i },
  { name: 'OpenShift & Ingress', pattern: /openshift|ingress|canary|liveness|k8s|kubernetes|pod|node|worker0|nodestatus/i },
  { name: 'Database & Storage', pattern: /postgres|database|db|nfs|storage|cache|redis|disk/i }
];
export function serviceOf(text: string): string {
  for (const s of SERVICES) if (s.pattern.test(text)) return s.name;
  return 'Digital Microservices';
}

export const RUNBOOK_COLUMN = "@insights.type='aiops.ibm.com/insight-type/runbook'";
const ins = (t: string) => `@insights.type='aiops.ibm.com/insight-type/${t}'`;
const causal = (src: string) => `${ins('relationship/causal')} and insights.source='aiops.ibm.com/insight-source/relationship/causal/${src}'`;
export const COL = {
  criticality: ins('business/criticality'), topoRes: ins('topology/resource'), topoGroup: ins('topology/group'),
  anomaly: ins('anomaly'), seasonal: ins('seasonal-occurrence'), golden: ins('golden-signal'),
  lad1: ins('lad/resolutions'), lad2: ins('lad/templates'), union: ins('relationship/causal-union'),
  causal: [causal('topological-group'), causal('custom'), causal('temporal')]
};
/** Optional columns, in two tiers. The server may refuse them; the query then retries with fewer. */
export const TIER1 = [RUNBOOK_COLUMN, 'eventCount'];
export const TIER2 = ['relatedStoryIds', 'relatedContextualStoryIds', 'signature', COL.criticality, COL.topoRes, COL.topoGroup, COL.anomaly, COL.seasonal, COL.golden, COL.lad1, COL.lad2, COL.union, ...COL.causal];
export const EXTRA_COLUMNS = [...TIER1, ...TIER2];

/** Alert columns requested for the generic widgets (all of them already used by the toolkit's own queries). */
export const ALERT_COLUMNS = [
  'id', 'severity', 'state', 'summary', 'type.classification', 'sender.name', 'resource.name',
  'firstOccurrenceTime', 'lastOccurrenceTime', 'closedTime', 'owner', 'team', 'acknowledged', 'suppressed',
  ...EXTRA_COLUMNS
];

const ALERT_FIELD_MAP: Array<[string, string]> = [
  ['id', 'id'], ['severity', 'severity'], ['state', 'state'], ['summary', 'summary'],
  ['type.classification', 'type'], ['sender.name', 'sender'], ['resource.name', 'resource'],
  ['firstOccurrenceTime', 'firstOccurrence'], ['lastOccurrenceTime', 'lastOccurrence'], ['closedTime', 'closed'],
  ['owner', 'owner'], ['team', 'team'], ['acknowledged', 'acknowledged'], ['suppressed', 'suppressed'], ['eventCount', 'eventCount']
];

export interface FieldInfo {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'time';
}

export const FIELDS: Record<QueryName, FieldInfo[]> = {
  getAlerts: [
    { key: 'severityLabel', label: 'Severity', kind: 'text' },
    { key: 'severity', label: 'Severity (number)', kind: 'number' },
    { key: 'state', label: 'State', kind: 'text' },
    { key: 'resource', label: 'Resource', kind: 'text' },
    { key: 'sender', label: 'Source (sender)', kind: 'text' },
    { key: 'type', label: 'Type', kind: 'text' },
    { key: 'team', label: 'Team', kind: 'text' },
    { key: 'service', label: 'Business service', kind: 'text' },
    { key: 'runbooks', label: 'Runbooks attached', kind: 'number' },
    { key: 'eventCount', label: 'Event count', kind: 'number' },
    { key: 'runbookName', label: 'Runbook', kind: 'text' },
    { key: 'runbookAutomated', label: 'Runbook type', kind: 'text' },
    { key: 'inIncident', label: 'In an incident', kind: 'text' },
    { key: 'incidentCount', label: 'Incidents', kind: 'number' },
    { key: 'criticality', label: 'Business criticality', kind: 'number' },
    { key: 'entityType', label: 'Entity type', kind: 'text' },
    { key: 'topologyGroup', label: 'Topology group', kind: 'text' },
    { key: 'anomaly', label: 'Anomaly', kind: 'text' },
    { key: 'seasonal', label: 'Seasonal', kind: 'text' },
    { key: 'goldenSignal', label: 'Golden signal', kind: 'text' },
    { key: 'logFixes', label: 'Log-analysis fixes', kind: 'number' },
    { key: 'causalGroup', label: 'Causal group', kind: 'text' },
    { key: 'causalLinks', label: 'Causal links', kind: 'number' },
    { key: 'signature', label: 'Signature', kind: 'text' },
    { key: 'recurrence', label: 'Times seen', kind: 'number' },
    { key: 'owner', label: 'Owner', kind: 'text' },
    { key: 'acknowledged', label: 'Acknowledged', kind: 'text' },
    { key: 'summary', label: 'Summary', kind: 'text' },
    { key: 'firstOccurrence', label: 'First occurrence', kind: 'time' },
    { key: 'lastOccurrence', label: 'Last occurrence', kind: 'time' },
    { key: 'id', label: 'Alert id', kind: 'text' }
  ],
  getStories: [
    { key: 'priority', label: 'Priority', kind: 'number' },
    { key: 'state', label: 'State', kind: 'text' },
    { key: 'team', label: 'Team', kind: 'text' },
    { key: 'service', label: 'Business service', kind: 'text' },
    { key: 'runbooks', label: 'Runbooks attached', kind: 'number' },
    { key: 'owner', label: 'Owner', kind: 'text' },
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'text' },
    { key: 'alertCount', label: 'Alert count', kind: 'number' },
    { key: 'created', label: 'Created', kind: 'time' },
    { key: 'id', label: 'Incident id', kind: 'text' }
  ],
  // Business applications and services as Concert Operate sees them (getImpactedApplications).
  getApplications: [
    { key: 'name', label: 'Application', kind: 'text' },
    { key: 'type', label: 'Type', kind: 'text' },
    { key: 'severityLabel', label: 'Worst severity', kind: 'text' },
    { key: 'alerts', label: 'Alerts', kind: 'number' },
    { key: 'critical', label: 'Critical', kind: 'number' },
    { key: 'major', label: 'Major', kind: 'number' },
    { key: 'minor', label: 'Minor', kind: 'number' },
    { key: 'warning', label: 'Warning', kind: 'number' },
    { key: 'incidents', label: 'Open incidents', kind: 'number' },
    { key: 'priority', label: 'Top incident priority', kind: 'number' },
    { key: 'criticality', label: 'Business criticality', kind: 'text' },
    { key: 'criticalityValue', label: 'Criticality value', kind: 'number' },
    { key: 'id', label: 'Application id', kind: 'text' }
  ],
  // One metric of one resource over time, with what the model expected and its forecast (getMetricManagerData and getMetricForecastData).
  getMetricSeries: [
    { key: 'time', label: 'Time', kind: 'time' },
    { key: 'kind', label: 'Actual or forecast', kind: 'text' },
    { key: 'value', label: 'Value', kind: 'number' },
    { key: 'expected', label: 'Expected', kind: 'number' },
    { key: 'min', label: 'Lower bound', kind: 'number' },
    { key: 'max', label: 'Upper bound', kind: 'number' },
    { key: 'anomalous', label: 'Anomalous', kind: 'text' },
    { key: 'resource', label: 'Resource', kind: 'text' },
    { key: 'metric', label: 'Metric', kind: 'text' },
    { key: 'id', label: 'Point id', kind: 'text' }
  ]
};

export const DEFAULT_GROUP: Record<QueryName, string> = { getAlerts: 'severityLabel', getStories: 'priority', getApplications: 'severityLabel', getMetricSeries: 'kind' };
export const DEFAULT_TIME: Record<QueryName, string> = { getAlerts: 'firstOccurrence', getStories: 'created', getApplications: '', getMetricSeries: 'time' };

export function fieldsOf(query: QueryName, kind?: FieldInfo['kind']): FieldInfo[] {
  return FIELDS[query].filter(f => !kind || f.kind === kind);
}

export function fieldLabel(query: QueryName, key: string): string {
  const f = FIELDS[query].find(x => x.key === key);
  return f ? f.label : key;
}

function clean(v: unknown): string | undefined {
  return v === null || v === undefined || v === '' ? undefined : String(v);
}

/** getAlerts response (`data.tenant.alerts.{columns,rows}`) -> rows. */
export function alertRows(data: any): Row[] {
  const src = data?.tenant?.alerts;
  const columns: Array<{ name?: string }> = Array.isArray(src?.columns) ? src.columns : [];
  const raw: Array<{ fields?: Array<string | null> }> = Array.isArray(src?.rows) ? src.rows : [];
  const index = new Map<string, number>();
  columns.forEach((c, i) => { if (c && c.name) index.set(c.name, i); });
  const out: Row[] = [];
  raw.forEach(r => {
    const f = (r && r.fields) || [];
    const row: Row = {};
    ALERT_FIELD_MAP.forEach(([col, key]) => {
      const i = index.get(col);
      let v = i === undefined ? undefined : clean(f[i]);
      if (v === '-' && (key === 'team' || key === 'owner')) v = undefined; // Concert writes "-" for nobody
      if (v !== undefined) row[key] = key === 'severity' ? Number(v) : v;
    });
    if (row.id === undefined) return;
    if (typeof row.severity === 'number' && !Number.isFinite(row.severity)) delete row.severity;
    row.service = serviceOf(`${row.resource || ''} ${row.summary || ''}`);
    const rbi = index.get(RUNBOOK_COLUMN);
    if (rbi !== undefined) {
      let n = 0; const ids: string[] = []; let auto = false;
      try {
        const parsed = JSON.parse(String(f[rbi] ?? '[]'));
        (Array.isArray(parsed) ? parsed : []).forEach((p: any) => {
          if (!p || typeof p.type !== 'string' || !p.type.includes('runbook')) return;
          n += Array.isArray(p.details && p.details.runbooks) && p.details.runbooks.length ? p.details.runbooks.length : 1;
          const rid = p.details && (p.details.runbookId || p.id);
          if (rid) ids.push(String(rid));
          if (p.details && p.details.isAutomated === true) auto = true;
        });
      } catch (e) { /* not JSON: no runbooks */ }
      row.runbooks = n;
      row.runbookAutomated = n === 0 ? 'No runbook' : auto ? 'Automated' : 'Manual';
      if (ids.length) row.runbookIds = Array.from(new Set(ids)).join(',');
    }
    enrichInsights(row, index, f);
    if (row.eventCount !== undefined) { row.eventCount = Number(row.eventCount); if (!Number.isFinite(row.eventCount)) delete row.eventCount; }
    if (typeof row.severity === 'number') row.severityLabel = SEVERITY_LABELS[row.severity] || `Severity ${row.severity}`;
    out.push(row);
  });
  // Alerts that share a signature are repeats of one another.
  const seen = new Map<string, number>();
  out.forEach(r => { if (typeof r.signature === 'string') seen.set(r.signature, (seen.get(r.signature) || 0) + 1); });
  out.forEach(r => { if (typeof r.signature === 'string') r.recurrence = seen.get(r.signature) || 1; });
  return out;
}

function list(v: unknown): any[] {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(String(v)); return Array.isArray(p) ? p : p ? [p] : []; } catch (e) { return String(v).split(',').map(x => x.trim()).filter(Boolean); }
}
const yes = (b: boolean) => (b ? 'Yes' : 'No');
const first = (o: any, keys: string[]): string | undefined => { for (const k of keys) { const v = o && o[k]; if (v !== undefined && v !== null && v !== '') return String(v); } return undefined; };

/** Reads the optional insight columns of one alert row into plain fields. Only fields whose column came back are set. */
function enrichInsights(row: Row, index: Map<string, number>, f: Array<string | null>) {
  const col = (n: string) => { const i = index.get(n); return i === undefined ? undefined : f[i]; };
  const has = (n: string) => index.has(n);
  if (has('relatedStoryIds') || has('relatedContextualStoryIds')) {
    const ids = new Set<string>([...list(col('relatedStoryIds')), ...list(col('relatedContextualStoryIds'))].map(String));
    row.incidentCount = ids.size;
    row.inIncident = yes(ids.size > 0);
  }
  const sig = clean(col('signature')); if (sig !== undefined) row.signature = sig;
  if (has(COL.criticality)) { const c = list(col(COL.criticality))[0]; const v = c && c.details ? first(c.details, ['criticality', 'value', 'level']) : undefined; if (v !== undefined && Number.isFinite(Number(v))) row.criticality = Number(v); }
  if (has(COL.topoRes)) { const t = list(col(COL.topoRes))[0]; const et = t && t.details && t.details.entityTypes; const v = Array.isArray(et) ? et[0] : first(t && t.details, ['entityType']); if (v) row.entityType = String(v); }
  if (has(COL.topoGroup)) { const g = list(col(COL.topoGroup))[0]; const v = g && g.details ? first(g.details, ['name', 'groupName', 'displayName', 'id']) : undefined; if (v) row.topologyGroup = v; }
  if (has(COL.anomaly)) row.anomaly = yes(list(col(COL.anomaly)).length > 0);
  if (has(COL.seasonal)) row.seasonal = yes(list(col(COL.seasonal)).length > 0);
  if (has(COL.golden)) { const g = list(col(COL.golden))[0]; row.goldenSignal = g ? (first(g.details, ['signal', 'signalType', 'type', 'name']) || 'Yes') : 'None'; }
  if (has(COL.lad1) || has(COL.lad2)) row.logFixes = list(col(COL.lad1)).length + list(col(COL.lad2)).length;
  if (has(COL.union)) { const u = list(col(COL.union))[0]; if (u && u.id) row.causalGroup = String(u.id); }
  const cc = COL.causal.filter(has);
  if (cc.length) row.causalLinks = cc.reduce((n, c) => n + list(col(c)).length, 0);
}

/** getStories response (`data.tenant.stories`, optionally `.stories`) -> rows. */
export function incidentRows(data: any): Row[] {
  const raw = data?.tenant?.stories;
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.stories) ? raw.stories : [];
  const out: Row[] = [];
  list.forEach(s => {
    if (!s || typeof s !== 'object' || !s.id) return;
    const row: Row = { id: String(s.id) };
    const pr = Number(s.priority);
    if (s.priority !== null && s.priority !== undefined && Number.isFinite(pr)) row.priority = pr;
    (['state', 'team', 'owner', 'title', 'description'] as const).forEach(k => {
      const v = clean(s[k]);
      if (v !== undefined && !(v === '-' && (k === 'team' || k === 'owner'))) row[k] = v;
    });
    const created = clean(s.createdTime);
    if (created !== undefined) row.created = created;
    row.service = serviceOf(`${row.title || ''} ${row.description || ''}`);
    if (Array.isArray(s.alertIds)) { row.alertCount = s.alertIds.length; row.alertIds = s.alertIds.join(','); }
    out.push(row);
  });
  return out;
}

/** getImpactedApplications response (`data.tenant.impactedApplications.items`) -> rows. */
export function applicationRows(data: any): Row[] {
  const items: any[] = data?.tenant?.impactedApplications?.items;
  const num = (v: unknown) => { const n = Number(v); return v !== null && v !== undefined && Number.isFinite(n) ? n : 0; };
  return (Array.isArray(items) ? items : []).filter(a => a && a.id).map(a => {
    const sev = a.severityCounts || {};
    const pri = a.storyPriorityCounts && typeof a.storyPriorityCounts === 'object' ? a.storyPriorityCounts : {};
    const prios = Object.keys(pri).map(Number).filter(n => Number.isFinite(n) && num(pri[n]) > 0).sort((x, y) => x - y);
    const row: Row = {
      id: String(a.id), name: String(a.name || a.id), alerts: num(a.count),
      critical: num(sev.critical), major: num(sev.major), minor: num(sev.minor), warning: num(sev.warning),
      incidents: prios.reduce((n, p) => n + num(pri[p]), 0),
      severityLabel: num(sev.critical) > 0 ? 'Critical' : num(sev.major) > 0 ? 'Major' : num(sev.minor) > 0 ? 'Minor' : num(sev.warning) > 0 ? 'Warning' : 'Healthy'
    };
    if (a.iconId) row.type = String(a.iconId);
    if (prios.length) row.priority = prios[0];
    if (a.businessCriticality && a.businessCriticality.name) { row.criticality = String(a.businessCriticality.name); row.criticalityValue = num(a.businessCriticality.businessCriticalityValue); }
    return row;
  });
}

/** A metric series (`{ actual, forecast, resource, metric }` built by the data hub) -> rows. */
export function metricRows(data: any): Row[] {
  const out: Row[] = [];
  const n = (v: unknown): number | undefined => { const x = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(x) ? x : undefined; };
  const add = (list: any, kind: string) => (Array.isArray(list) ? list : []).forEach((p: any) => {
    if (!p || !p.timestamp) return;
    const expected = n(p.expected);
    const value = kind === 'Actual' ? n(p.value) : expected;
    const row: Row = { id: `${kind}-${p.timestamp}`, time: String(p.timestamp), kind, resource: String(data.resource || ''), metric: String(data.metric || '') };
    if (value !== undefined) row.value = value;
    if (expected !== undefined) row.expected = expected;
    const lo = n(p.min), hi = n(p.max);
    if (lo !== undefined) row.min = lo;
    if (hi !== undefined) row.max = hi;
    row.anomalous = p.anomalous === true ? 'Yes' : 'No';
    out.push(row);
  });
  add(data && data.actual, 'Actual');
  add(data && data.forecast, 'Forecast');
  return out;
}

export function toRows(query: QueryName, data: any): Row[] {
  return query === 'getAlerts' ? alertRows(data) : query === 'getApplications' ? applicationRows(data) : query === 'getMetricSeries' ? metricRows(data) : incidentRows(data);
}

export const NONE = '(none)';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "3h ago", "12m ago", "4d ago". */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
/** How a table shows a cell: times as "21 Oct 07:52 · 3h ago", yes/no for flags, "P1" for priority; the raw value stays in the tooltip. */
export function displayCell(query: QueryName, key: string, row: Row): string {
  const v = row[key];
  if (v === undefined) return NONE;
  const kind = (FIELDS[query].find(f => f.key === key) || { kind: 'text' }).kind;
  if (kind === 'time') {
    const t = typeof v === 'number' ? v : Date.parse(String(v));
    if (!Number.isFinite(t)) return String(v);
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())} · ${ago(t)}`;
  }
  if (key === 'priority' && Number.isFinite(Number(v))) return `P${v}`;
  if ((key === 'acknowledged' || key === 'suppressed') && (String(v) === 'true' || String(v) === 'false')) return String(v) === 'true' ? 'Yes' : 'No';
  return String(v);
}

export function cell(row: Row, key: string): string {
  const v = row[key];
  return v === undefined ? NONE : String(v);
}

export interface Bucket {
  key: string;
  value: number;
}

function num(row: Row, key: string): number | undefined {
  const v = row[key];
  const n = typeof v === 'number' ? v : v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** One number over all rows, or undefined when it cannot be computed (no numeric values). */
export function metricValue(rows: Row[], metric: Metric, field?: string): number | undefined {
  if (metric === 'count') return rows.length;
  if (!field) return undefined;
  if (metric === 'distinct') {
    const s = new Set<string>();
    rows.forEach(r => { if (r[field] !== undefined) s.add(String(r[field])); });
    return s.size;
  }
  const vals = rows.map(r => num(r, field)).filter((v): v is number => v !== undefined);
  if (vals.length === 0) return undefined;
  if (metric === 'max') return Math.max(...vals);
  const sum = vals.reduce((a, b) => a + b, 0);
  return metric === 'sum' ? sum : sum / vals.length;
}

/** Group rows by a field and compute a metric per group. Sorted by value, then label. */
export function groupMetric(rows: Row[], groupBy: string, metric: Metric = 'count', field?: string, limit = 12): Bucket[] {
  const groups = new Map<string, Row[]>();
  rows.forEach(r => {
    const k = cell(r, groupBy);
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  });
  const out: Bucket[] = [];
  groups.forEach((g, key) => {
    const v = metricValue(g, metric, field);
    if (v !== undefined) out.push({ key, value: v });
  });
  out.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  if (out.length <= limit) return out;
  const head = out.slice(0, Math.max(limit - 1, 1));
  const tail = out.slice(head.length);
  if (metric === 'count' || metric === 'sum') head.push({ key: `Other (${tail.length})`, value: tail.reduce((a, b) => a + b.value, 0) });
  return head;
}

/** Severity groups keep their natural order (Critical first) and colours. */
export function orderSeverity(buckets: Bucket[]): Bucket[] {
  const rank = (k: string) => {
    const i = SEVERITY_LABELS.indexOf(k);
    return i < 0 ? -1 : i;
  };
  return buckets.slice().sort((a, b) => rank(b.key) - rank(a.key));
}

export interface TimeBin {
  start: number;
  end: number;
  value: number;
}

/** Count rows per time bin. Rows without a parseable time are counted separately, not dropped silently. */
export function timeBins(rows: Row[], field: string, bins = 24): { bins: TimeBin[]; missing: number } {
  const times: number[] = [];
  let missing = 0;
  rows.forEach(r => {
    const raw = r[field];
    const t = raw === undefined ? NaN : typeof raw === 'number' ? raw : Date.parse(String(raw));
    if (Number.isFinite(t)) times.push(t); else missing++;
  });
  if (times.length === 0) return { bins: [], missing };
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  if (hi === lo) return { bins: [{ start: lo - 30000, end: hi + 30000, value: times.length }], missing };
  const step = (hi - lo) / bins;
  const out: TimeBin[] = Array.from({ length: bins }, (_, i) => ({ start: lo + i * step, end: lo + (i + 1) * step, value: 0 }));
  times.forEach(t => { out[Math.min(Math.floor((t - lo) / step), bins - 1)].value++; });
  return { bins: out, missing };
}

export function applyFilters(rows: Row[], filters: Array<{ field: string; value: string }>): Row[] {
  if (filters.length === 0) return rows;
  // Several values for the same field are alternatives (OR); different fields must all match (AND).
  const byField = new Map<string, Set<string>>();
  filters.forEach(f => {
    const s = byField.get(f.field);
    if (s) s.add(f.value); else byField.set(f.field, new Set([f.value]));
  });
  return rows.filter(r => {
    let ok = true;
    byField.forEach((vals, field) => { if (!vals.has(cell(r, field))) ok = false; });
    return ok;
  });
}

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
