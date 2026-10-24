/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure (React/three free) logic for the Telco Causal Mesh panel: data adapters, graph construction,
 * topology analysis and probe lead-time analysis. Everything here is unit tested.
 */

import { LayerSchemeId, TELCO_LAYER_NAMES, classifyResource, isAnchorLayer, layerDef, layerZ } from './classification';
export { classifyLayer, hasTerm } from './classification';
export type { LayerGuess } from './classification';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AlertInsight {
  id?: string;
  type?: string;
  source?: string;
  details?: any;
}

export interface AlertItem {
  id: string;
  signature?: string;
  summary: string;
  severity: number;
  state: string;
  firstOccurrenceTime: string;
  lastOccurrenceTime: string;
  /** Only present when the alert query asks for the `eventCount` column. */
  eventCount?: number;
  sender?: { name?: string; component?: string };
  /** The alert's `type.classification`, when the query returns it. */
  alertType?: string;
  resource?: { name?: string; hostname?: string; entityType?: string };
  team?: string;
  insights?: AlertInsight[];
}

export interface IncidentInsight {
  type?: string;
  source?: string;
  details?: { id?: string; rank?: number; score?: number; time?: number };
}

export interface IncidentItem {
  id: string;
  title: string;
  description?: string;
  priority: number;
  state: string;
  owner?: string;
  team: string;
  alertIds: string[];
  insights?: IncidentInsight[];
  createdTime?: string;
}

export interface TopologyResourceDetails {
  id?: string;
  uniqueId?: string;
  name?: string;
  entityTypes: string[];
  matchTokens: string[];
  tags: string[];
  properties: Record<string, any>;
}

export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

export interface MetricSeries {
  metricName: string;
  unit?: string;
  points: MetricDataPoint[];
  currentValue?: number;
  min?: number;
  max?: number;
  avg?: number;
}

export interface RunbookPolicyInfo {
  policyId?: string;
  policyName?: string;
  runbookId?: string;
  runbookName?: string;
  description?: string;
  isAutomated?: boolean;
  parameters?: Record<string, any>;
}

export interface StoryInsightsDetail {
  storyId: string;
  probableCauseAlertId?: string;
  probableCauseScore?: number;
  confidencePercent?: number;
  insightSummary?: string;
}

/** A real adjacency supplied by the host application (e.g. from the topology service). */
export interface TopologyLinkInput {
  /** Resource names, matched against the cleaned `resource.name` of alerts. */
  source: string;
  target: string;
  relType?: string;
  latencyMs?: number;
}

export type LayoutMode = 'stratified' | 'constellation' | 'organic';

export interface Node3DGen2 {
  id: string;
  name: string;
  entityType: string;
  /** Raw entity types reported by topology insights, when present. */
  entityTypes: string[];
  topologyGroups: string[];
  layer: number;
  layerName: string;
  /** How the layer was decided (`type`, `name`, `text` or `default`) and the canonical telco type recognised, if any. */
  layerBasis?: 'type' | 'name' | 'text' | 'default';
  canonicalType?: string;
  /** Where the entity types came from: the alert's topology insight, the live topology service, or nowhere. */
  typeSource?: 'insight' | 'topology' | 'none';
  severity: number;
  isProbableCause: boolean;
  probableCauseRank?: number;
  alertCount: number;
  alerts: AlertItem[];
  runbooks: any[];
  uniqueId?: string;
  compositeId?: string;
  degree: number;
  /** 0-100, computed from the links that describe topology; null when there are none. */
  betweenness: number | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  // three.js handles, owned by the component
  mesh?: any;
  labelSprite?: any;
}

export type LinkKind = 'physical' | 'causal' | 'illustrative';

export interface Link3DGen2 {
  source: Node3DGen2;
  target: Node3DGen2;
  kind: LinkKind;
  isCausal: boolean;
  relType: string;
  value: number;
  /** Only set when a real measurement was supplied. */
  latencyMs?: number;
}

/** Telco layer names by number. Other schemes: `layerDef(id)` in ./classification. */
export const LAYER_NAMES: Record<number, string> = TELCO_LAYER_NAMES;

export const DEFAULT_PROBE = 'Unknown source';
const TOPOLOGY_RESOURCE = 'insight-type/topology/resource';
const TOPOLOGY_GROUP = 'insight-type/topology/group';
const PROBABLE_CAUSE = 'probable-cause';
const RUNBOOK = 'insight-type/runbook';

// ── Small helpers ────────────────────────────────────────────────────────────

export const asString = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : value === null || value === undefined ? fallback : String(value)
);

/** `host/part:::suffix` -> `part`. Returns null for missing or blank names. */
export const cleanResourceName = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const last = trimmed.split('/').pop() || trimmed;
  const base = (last.split(':::')[0] || last).trim();
  return base || trimmed;
};

export const resourceKeyOf = (a: AlertItem): string | null => (
  cleanResourceName(a.resource?.name) ?? cleanResourceName(a.resource?.hostname)
);

export const probeOf = (a: AlertItem): string => a.sender?.name || a.sender?.component || DEFAULT_PROBE;

const safeJson = (value: unknown): any => {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return JSON.parse(value);
  } catch (e) {
    return undefined;
  }
};

const parseTime = (value: string | undefined): number | null => {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
};

export const alertTime = (a: AlertItem): number | null => parseTime(a.firstOccurrenceTime) ?? parseTime(a.lastOccurrenceTime);

// ── Adapters: toolkit query results -> component data ────────────────────────

/** Converts `data.tenant.alerts` ({ columns, rows[].fields[] }) from the toolkit's getAlerts query. */
export function adaptAlerts(data: any): { alerts: AlertItem[]; hasEventCounts: boolean; skipped: number } {
  const source = data?.tenant?.alerts;
  const columns: Array<{ name?: string }> = Array.isArray(source?.columns) ? source.columns : [];
  const rows: Array<{ fields?: Array<string | null> }> = Array.isArray(source?.rows) ? source.rows : [];
  const index = new Map<string, number>();
  columns.forEach((c, i) => { if (c?.name) index.set(c.name, i); });
  const insightColumns = columns.map((c, i) => ({ i, name: c?.name || '' })).filter(c => c.name.startsWith('@insights.type='));
  const hasEventCounts = index.has('eventCount');

  const alerts: AlertItem[] = [];
  let skipped = 0;
  rows.forEach(row => {
    const fields = row?.fields || [];
    const get = (name: string): string | undefined => {
      const i = index.get(name);
      const v = i === undefined ? undefined : fields[i];
      return v === null || v === undefined ? undefined : String(v);
    };
    const id = get('id');
    if (!id) {
      skipped++;
      return;
    }
    const insights: AlertInsight[] = [];
    insightColumns.forEach(({ i }) => {
      const parsed = safeJson(fields[i]);
      if (Array.isArray(parsed)) parsed.forEach(p => { if (p && typeof p === 'object') insights.push(p); });
    });
    const severity = Number(get('severity'));
    const eventCount = Number(get('eventCount'));
    alerts.push({
      id,
      signature: get('signature'),
      summary: get('summary') || '',
      severity: Number.isFinite(severity) ? severity : 0,
      state: get('state') || '',
      firstOccurrenceTime: get('firstOccurrenceTime') || '',
      lastOccurrenceTime: get('lastOccurrenceTime') || '',
      eventCount: hasEventCounts && Number.isFinite(eventCount) && eventCount > 0 ? eventCount : undefined,
      sender: { name: get('sender.name') },
      alertType: get('type.classification'),
      resource: { name: get('resource.name') },
      team: get('team'),
      insights
    });
  });
  return { alerts, hasEventCounts, skipped };
}

/** Converts `data.tenant.stories` from the toolkit's getStories query. */
export function adaptIncidents(data: any): IncidentItem[] {
  const raw = data?.tenant?.stories;
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.stories) ? raw.stories : [];
  const out: IncidentItem[] = [];
  list.forEach(s => {
    if (!s || typeof s !== 'object' || !s.id) return;
    const insights = Array.isArray(s.insights) ? s.insights : safeJson(s.insights);
    const priority = Number(s.priority);
    out.push({
      id: String(s.id),
      title: asString(s.title, 'Untitled incident'),
      description: s.description === null || s.description === undefined ? undefined : String(s.description),
      priority: Number.isFinite(priority) ? priority : 0,
      state: asString(s.state),
      owner: s.owner === null || s.owner === undefined ? undefined : String(s.owner),
      team: asString(s.team),
      alertIds: Array.isArray(s.alertIds) ? s.alertIds.map((x: unknown) => String(x)) : [],
      insights: Array.isArray(insights) ? insights : [],
      createdTime: s.createdTime ? String(s.createdTime) : undefined
    });
  });
  return out;
}

/** Converts `data.tenant.resource` or `data.resource` from the toolkit's getTopologyResource query. */
export function adaptTopologyResource(data: any): TopologyResourceDetails | null {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.errors) && data.errors.length > 0) return null;
  // Only the documented envelope is accepted; an arbitrary object (an error, say) must not pass for a resource.
  const res = data?.tenant?.resource || data?.resource;
  if (!res || typeof res !== 'object' || (!res.id && !res.name && !res.uniqueId)) return null;

  const entityTypes: string[] = Array.isArray(res.entityTypes)
    ? res.entityTypes.map((t: unknown) => String(t))
    : [];
  const matchTokens: string[] = Array.isArray(res.matchTokens)
    ? res.matchTokens.map((t: unknown) => String(t))
    : [];
  const tags: string[] = Array.isArray(res.tags)
    ? res.tags.map((t: unknown) => String(t))
    : [];
  const properties = (res.properties && typeof res.properties === 'object') ? res.properties : {};

  return {
    id: res.id ? String(res.id) : undefined,
    uniqueId: res.uniqueId ? String(res.uniqueId) : undefined,
    name: res.name ? String(res.name) : undefined,
    entityTypes,
    matchTokens,
    tags,
    properties
  };
}

/** Converts `data.tenant.metricData` from getMetricManagerData query into structured MetricSeries. */
export function adaptMetricManagerData(data: any): MetricSeries[] {
  if (!data || typeof data !== 'object') return [];
  const rawSeries = data?.tenant?.metricData || data?.metricData || data?.series || (Array.isArray(data) ? data : []);
  if (!Array.isArray(rawSeries)) return [];

  const out: MetricSeries[] = [];
  rawSeries.forEach((s: any) => {
    if (!s || typeof s !== 'object') return;
    const name = String(s.metric || s.metricName || s.name || 'Metric');
    const unit = s.unit ? String(s.unit) : undefined;
    const rawPoints = Array.isArray(s.points) ? s.points : Array.isArray(s.data) ? s.data : [];
    const points: MetricDataPoint[] = [];

    rawPoints.forEach((p: any) => {
      if (!p || typeof p !== 'object') return;
      const t = Number(p.timestamp ?? p.time ?? p.t);
      const v = Number(p.value ?? p.val ?? p.v);
      if (Number.isFinite(t) && Number.isFinite(v)) {
        points.push({ timestamp: t, value: v });
      }
    });

    if (points.length > 0) {
      const values = points.map(p => p.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      const currentValue = points[points.length - 1].value;
      out.push({
        metricName: name,
        unit,
        points,
        currentValue,
        min,
        max,
        avg: Math.round(avg * 100) / 100
      });
    }
  });
  return out;
}

/** Converts `data.tenant.policies` and `data.tenant.runbooks` from getRunbooksAndPolicy query. */
export function adaptRunbooksAndPolicy(data: any): RunbookPolicyInfo[] {
  if (!data || typeof data !== 'object') return [];
  const tenant = data?.tenant || data;
  const policies = Array.isArray(tenant?.policies) ? tenant.policies : [];
  const runbooks = Array.isArray(tenant?.runbooks) ? tenant.runbooks : [];

  const runbookMap = new Map<string, any>();
  runbooks.forEach((rb: any) => {
    if (rb?.id) runbookMap.set(String(rb.id), rb);
  });

  const out: RunbookPolicyInfo[] = [];
  policies.forEach((pol: any) => {
    if (!pol || typeof pol !== 'object') return;
    const policyId = pol.id ? String(pol.id) : undefined;
    const policyName = pol.name ? String(pol.name) : undefined;
    const description = pol.description ? String(pol.description) : undefined;

    const rbIds: string[] = Array.isArray(pol.runbookIds) ? pol.runbookIds : [];
    if (rbIds.length > 0) {
      rbIds.forEach(rbId => {
        const rb = runbookMap.get(String(rbId));
        out.push({
          policyId,
          policyName,
          runbookId: String(rbId),
          runbookName: rb?.name ? String(rb.name) : undefined,
          description: rb?.description || description,
          isAutomated: Boolean(pol.isAutomated || rb?.isAutomated),
          parameters: rb?.parameters || pol.parameters
        });
      });
    } else {
      out.push({
        policyId,
        policyName,
        description,
        isAutomated: Boolean(pol.isAutomated),
        parameters: pol.parameters
      });
    }
  });

  if (out.length === 0 && runbooks.length > 0) {
    runbooks.forEach((rb: any) => {
      if (rb?.id) {
        out.push({
          runbookId: String(rb.id),
          runbookName: rb.name ? String(rb.name) : undefined,
          description: rb.description ? String(rb.description) : undefined,
          isAutomated: Boolean(rb.isAutomated),
          parameters: rb.parameters
        });
      }
    });
  }

  return out;
}

/** Converts `data.tenant.storyAlertsInsights` from getStoryAlertsInsights query. */
export function adaptStoryAlertsInsights(data: any, storyId?: string): StoryInsightsDetail | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data?.tenant?.storyAlertsInsights || data?.storyAlertsInsights || data?.insights || data;
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.insights) ? raw.insights : []);

  let probableCauseAlertId: string | undefined;
  let probableCauseScore: number | undefined;
  let insightSummary: string | undefined;

  list.forEach((ins: any) => {
    if (!ins || typeof ins !== 'object') return;
    if (ins.type?.includes('probable-cause') || ins.source?.includes('probable-cause')) {
      probableCauseAlertId = ins.details?.id ? String(ins.details.id) : probableCauseAlertId;
      // `rank` is an ordering (1 = best), not a confidence, so it is never used as a score.
      const raw = ins.details?.score ?? ins.details?.confidence;
      const score = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
      if (Number.isFinite(score)) {
        probableCauseScore = score;
      }
      insightSummary = ins.summary || ins.description || insightSummary;
    }
  });

  // A percentage only when the score is a 0-1 fraction. Other scales are unknown, so the raw score is shown instead.
  const confidencePercent = probableCauseScore !== undefined && probableCauseScore >= 0 && probableCauseScore <= 1
    ? Math.round(probableCauseScore * 100)
    : undefined;

  return {
    storyId: storyId || String(data?.storyId || ''),
    probableCauseAlertId,
    probableCauseScore,
    confidencePercent,
    insightSummary
  };
}

// ── Layer classification: see ./classification (telco, OSI and OPS schemes) ──

// ── Graph construction ───────────────────────────────────────────────────────

export interface BuildGraphOptions {
  layoutMode: LayoutMode;
  layerSpacing: number;
  /** Real adjacencies (resource names). When absent, the graph has no topology links. */
  topologyLinks?: TopologyLinkInput[];
  /** Draw invented demo links between layers. Off by default; never use for real analysis. */
  illustrativeLinks?: boolean;
  /** Positions from the previous build so a data refresh does not reshuffle the layout. */
  positionCache?: Map<string, { x: number; y: number; z: number }>;
  /** Which layer scheme classifies the resources: `telco` (default), `osi` or `ops`. */
  layerScheme?: LayerSchemeId;
  /** Entity types fetched live from the topology service, by resource name (see useLiveEntityTypes). Used by the OSI and OPS schemes. */
  liveEntityTypes?: Record<string, string[]>;
}

export interface GraphResult {
  nodes: Node3DGen2[];
  links: Link3DGen2[];
  skippedAlerts: number;
  restoredPositions: number;
  /** Links that describe topology (physical or illustrative); causal links are excluded. */
  topologyLinkCount: number;
}

/** alertId -> best (lowest) probable-cause rank, from incident insights (and alert insights when present). */
export function probableCauseRanks(alerts: AlertItem[], incidents: IncidentItem[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const put = (id: string | undefined, rank: number | undefined) => {
    if (!id) return;
    const r = Number.isFinite(rank as number) && (rank as number) > 0 ? (rank as number) : 1;
    ranks.set(id, Math.min(ranks.get(id) ?? Infinity, r));
  };
  incidents.forEach(inc => (inc.insights || []).forEach(ins => {
    if (ins?.type?.includes(PROBABLE_CAUSE)) put(ins.details?.id, ins.details?.rank);
  }));
  alerts.forEach(a => (a.insights || []).forEach(ins => {
    if (ins?.type?.includes(PROBABLE_CAUSE)) put(a.id, ins.details?.rank);
  }));
  return ranks;
}

function initialPosition(n: Node3DGen2, idx: number, count: number, mode: LayoutMode, spacing: number) {
  const def = layerDef(n.layer);
  const level = def.index; // 1 = top plane, whichever scheme is active
  const angle = (idx / Math.max(1, count)) * Math.PI * 2 * 3 + level * 1.57;
  if (mode === 'stratified') {
    const radius = 30 + ((idx * 23) % 95);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: layerZ(n.layer, spacing) + Math.sin(idx) * 6 };
  }
  if (mode === 'constellation') {
    const ringAngle = (idx % 24) * (Math.PI / 12) + level * 0.4;
    const r = def.ring + (idx % 3) * 10;
    return { x: Math.cos(ringAngle) * r, y: Math.sin(ringAngle) * r, z: Math.sin(ringAngle * 3) * 16 };
  }
  const r = 35 + level * 52;
  const phi = (level - 0.5) * 0.65 + (idx % 5) * 0.1;
  return { x: r * Math.sin(phi) * Math.cos(angle), y: r * Math.sin(phi) * Math.sin(angle), z: r * Math.cos(phi) - 20 };
}

/**
 * Resources whose alerts carry no entity type (neither in the topology insights nor on the resource), with the id to ask the
 * live topology service about. These are the resources the OSI and OPS schemes cannot place from the alert data alone.
 */
export function resourcesWithoutTypes(alerts: AlertItem[]): Array<{ key: string; resourceId: string }> {
  const have = new Set<string>();
  const ids = new Map<string, string>();
  alerts.forEach(alert => {
    const key = resourceKeyOf(alert);
    if (!key) return;
    const insights = alert.insights || [];
    const resourceInsight = insights.find(i => i?.type?.includes(TOPOLOGY_RESOURCE));
    const lists: unknown[] = [resourceInsight?.details?.entityTypes, ...insights.filter(i => i?.type?.includes(TOPOLOGY_GROUP)).map(g => g.details?.entityTypes)];
    if (lists.some(l => Array.isArray(l) && l.length > 0) || alert.resource?.entityType) have.add(key);
    const uid = asString(resourceInsight?.details?.uniqueId);
    if (uid && !ids.has(key)) ids.set(key, uid);
    else if (!ids.has(key)) ids.set(key, key);
  });
  return Array.from(ids.entries()).filter(([key]) => !have.has(key)).map(([key, resourceId]) => ({ key, resourceId }));
}

export function buildGraph(alerts: AlertItem[], incidents: IncidentItem[], options: BuildGraphOptions): GraphResult {
  const ranks = probableCauseRanks(alerts, incidents);
  const nodeMap = new Map<string, Node3DGen2>();
  let skippedAlerts = 0;

  alerts.forEach(alert => {
    const key = resourceKeyOf(alert);
    if (!key) {
      skippedAlerts++;
      return;
    }
    const insights = alert.insights || [];
    const resourceInsight = insights.find(i => i?.type?.includes(TOPOLOGY_RESOURCE));
    const groupInsights = insights.filter(i => i?.type?.includes(TOPOLOGY_GROUP));
    const entityTypes = new Set<string>();
    groupInsights.forEach(g => (Array.isArray(g.details?.entityTypes) ? g.details.entityTypes : []).forEach((t: unknown) => entityTypes.add(String(t))));
    (Array.isArray(resourceInsight?.details?.entityTypes) ? resourceInsight!.details.entityTypes : []).forEach((t: unknown) => entityTypes.add(String(t)));
    if (alert.resource?.entityType) entityTypes.add(alert.resource.entityType);
    const groups = groupInsights.map(g => asString(g.details?.name)).filter(Boolean);
    const runbooks = insights.filter(i => i?.type?.includes(RUNBOOK)).map(i => i.details).filter(Boolean);
    const rank = ranks.get(alert.id);

    const existing = nodeMap.get(key);
    if (existing) {
      existing.severity = Math.max(existing.severity, alert.severity);
      existing.alertCount += 1;
      existing.alerts.push(alert);
      existing.runbooks.push(...runbooks);
      entityTypes.forEach(t => { if (!existing.entityTypes.includes(t)) existing.entityTypes.push(t); });
      groups.forEach(g => { if (!existing.topologyGroups.includes(g)) existing.topologyGroups.push(g); });
      if (rank !== undefined) {
        existing.isProbableCause = existing.isProbableCause || rank === 1;
        existing.probableCauseRank = Math.min(existing.probableCauseRank ?? Infinity, rank);
      }
      existing.uniqueId = existing.uniqueId || resourceInsight?.details?.uniqueId;
      existing.compositeId = existing.compositeId || resourceInsight?.details?.compositeId;
      return;
    }

    const kind = classifyResource(options.layerScheme || 'telco', { name: key, summary: alert.summary, sender: alert.sender?.name, entityTypes: Array.from(entityTypes) });
    nodeMap.set(key, {
      id: key,
      name: key,
      entityType: kind.entityType,
      entityTypes: Array.from(entityTypes),
      topologyGroups: groups,
      layer: kind.layer,
      layerName: kind.layerName,
      layerBasis: kind.basis,
      canonicalType: kind.canonical,
      severity: alert.severity,
      isProbableCause: rank === 1,
      probableCauseRank: rank,
      alertCount: 1,
      alerts: [alert],
      runbooks,
      uniqueId: resourceInsight?.details?.uniqueId,
      compositeId: resourceInsight?.details?.compositeId,
      degree: 0,
      betweenness: null,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0
    });
  });

  const nodes = Array.from(nodeMap.values());
  // OSI / OPS are decided from everything known about a resource: the entity types of all its alerts plus the live topology
  // service, not only its first alert. (Telco keeps the first-alert decision it always had.)
  const scheme = options.layerScheme || 'telco';
  nodes.forEach(n => {
    const live = options.liveEntityTypes?.[n.id] || [];
    n.typeSource = n.entityTypes.length > 0 ? 'insight' : live.length > 0 ? 'topology' : 'none';
    if (scheme === 'telco') return;
    const merged = [...n.entityTypes, ...live.filter(t => !n.entityTypes.includes(t))];
    // Everything the resource's alerts say, not only the first alert: distinct summaries (most severe first) and alert types. The sender is left out: it names the monitoring source, not the entity.
    const seen = new Set<string>();
    const words: string[] = [];
    const add = (v?: string) => { const t = (v || '').trim(); if (t && !seen.has(t) && words.length < 40) { seen.add(t); words.push(t); } };
    [...n.alerts].sort((a, b) => b.severity - a.severity).slice(0, 12).forEach(a => { add(a.summary); add(a.alertType); });
    const kind = classifyResource(scheme, { name: n.id, summary: words.join(' | ').slice(0, 2500), entityTypes: merged });
    n.entityTypes = merged;
    n.layer = kind.layer;
    n.layerName = kind.layerName;
    n.layerBasis = kind.basis;
    n.canonicalType = kind.canonical;
    n.entityType = kind.entityType;
  });
  let restoredPositions = 0;
  nodes.forEach((n, idx) => {
    const cached = options.positionCache?.get(n.id);
    if (cached) {
      n.x = cached.x; n.y = cached.y; n.z = cached.z;
      restoredPositions++;
    } else {
      Object.assign(n, initialPosition(n, idx, nodes.length, options.layoutMode, options.layerSpacing));
    }
  });

  const links: Link3DGen2[] = [];
  const keys = new Set<string>();
  const addLink = (source: Node3DGen2, target: Node3DGen2, kind: LinkKind, relType: string, value: number, latencyMs?: number) => {
    if (source.id === target.id) return;
    const key = `${kind}|${[source.id, target.id].sort().join('|')}`;
    if (keys.has(key)) return;
    keys.add(key);
    links.push({ source, target, kind, isCausal: kind === 'causal', relType, value, latencyMs });
    source.degree += 1;
    target.degree += 1;
  };

  // 1. Causal links: every alert of an incident points at that incident's probable-cause alert (rank 1).
  const alertById = new Map(alerts.map(a => [a.id, a] as [string, AlertItem]));
  incidents.forEach(inc => {
    const present = inc.alertIds.filter(id => alertById.has(id));
    const rootId = present.find(id => ranks.get(id) === 1);
    const root = rootId ? nodeMap.get(resourceKeyOf(alertById.get(rootId)!) || '') : undefined;
    if (!root) return;
    present.forEach(id => {
      const node = nodeMap.get(resourceKeyOf(alertById.get(id)!) || '');
      if (node) addLink(node, root, 'causal', 'causalUnion', 3);
    });
  });

  // 2. Physical links supplied by the host (real adjacency).
  (options.topologyLinks || []).forEach(l => {
    const a = nodeMap.get(cleanResourceName(l.source) || '');
    const b = nodeMap.get(cleanResourceName(l.target) || '');
    if (a && b) addLink(a, b, 'physical', l.relType || 'connectedTo', 2, typeof l.latencyMs === 'number' ? l.latencyMs : undefined);
  });

  // 3. Illustrative links, only when explicitly requested. They are wired by array position, not by topology.
  if (options.illustrativeLinks) {
    nodes.forEach((n1, idx) => {
      const next = nodes.filter(n => n.layer === n1.layer + 1);
      if (next.length > 0) {
        addLink(n1, next[idx % next.length], 'illustrative', layerDef(n1.layer).index === 1 ? 'routesTo' : layerDef(n1.layer).index === 2 ? 'dependsOn' : 'connectedTo', 2);
      }
      if (layerDef(n1.layer).index <= 2 && idx % 2 === 0) {
        const peer = nodes.find(n => n.layer === n1.layer && n.id !== n1.id && !keys.has(`illustrative|${[n1.id, n.id].sort().join('|')}`));
        if (peer) addLink(n1, peer, 'illustrative', 'connectedTo', 1);
      }
    });
  }

  const topoLinks = links.filter(l => l.kind !== 'causal');
  const betweenness = computeBetweenness(nodes, topoLinks);
  nodes.forEach(n => { n.betweenness = topoLinks.length ? betweenness.get(n.id) ?? 0 : null; });

  return { nodes, links, skippedAlerts, restoredPositions, topologyLinkCount: topoLinks.length };
}

// ── Graph algorithms ─────────────────────────────────────────────────────────

/** Brandes betweenness centrality (unweighted), scaled to 0-100 by the largest value. */
export function computeBetweenness(nodes: Node3DGen2[], links: Link3DGen2[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  links.forEach(l => {
    adj.get(l.source.id)?.push(l.target.id);
    adj.get(l.target.id)?.push(l.source.id);
  });
  const score = new Map<string, number>(nodes.map(n => [n.id, 0] as [string, number]));
  nodes.forEach(s => {
    const stack: string[] = [];
    const preds = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    nodes.forEach(n => { preds.set(n.id, []); sigma.set(n.id, 0); dist.set(n.id, -1); });
    sigma.set(s.id, 1);
    dist.set(s.id, 0);
    const queue = [s.id];
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      stack.push(v);
      (adj.get(v) || []).forEach(w => {
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          preds.get(w)!.push(v);
        }
      });
    }
    const delta = new Map<string, number>(nodes.map(n => [n.id, 0] as [string, number]));
    while (stack.length) {
      const w = stack.pop()!;
      preds.get(w)!.forEach(v => {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      });
      if (w !== s.id) score.set(w, score.get(w)! + delta.get(w)!);
    }
  });
  const max = Math.max(...Array.from(score.values()), 0);
  const out = new Map<string, number>();
  score.forEach((v, k) => out.set(k, max > 0 ? Math.round((v / max) * 100) : 0));
  return out;
}

export interface RoutePath {
  nodes: Node3DGen2[];
  hops: number;
  /** Sum of measured link latencies; null unless every link on the path has one. */
  latencyMs: number | null;
}

/** Dijkstra over link latency (a link with no measurement counts as 1). Optionally avoids one node. */
export function findShortestPath(
  startId: string,
  targetId: string,
  nodes: Node3DGen2[],
  links: Link3DGen2[],
  avoidId?: string
): RoutePath | null {
  if (startId === targetId || startId === avoidId || targetId === avoidId) return null;
  const byId = new Map(nodes.map(n => [n.id, n] as [string, Node3DGen2]));
  if (!byId.has(startId) || !byId.has(targetId)) return null;
  const adj = new Map<string, Array<{ to: string; link: Link3DGen2 }>>();
  nodes.forEach(n => adj.set(n.id, []));
  links.forEach(l => {
    if (l.source.id === avoidId || l.target.id === avoidId) return;
    adj.get(l.source.id)?.push({ to: l.target.id, link: l });
    adj.get(l.target.id)?.push({ to: l.source.id, link: l });
  });

  const dist = new Map<string, number>([[startId, 0]]);
  const prev = new Map<string, { from: string; link: Link3DGen2 }>();
  const done = new Set<string>();
  while (true) {
    let current: string | null = null;
    let best = Infinity;
    dist.forEach((d, id) => { if (!done.has(id) && d < best) { best = d; current = id; } });
    if (current === null) return null;
    if (current === targetId) break;
    done.add(current);
    for (const { to, link } of adj.get(current) || []) {
      const next = best + (typeof link.latencyMs === 'number' ? link.latencyMs : 1);
      if (next < (dist.get(to) ?? Infinity)) {
        dist.set(to, next);
        prev.set(to, { from: current, link });
      }
    }
  }
  const path: Node3DGen2[] = [byId.get(targetId)!];
  const used: Link3DGen2[] = [];
  let cursor = targetId;
  while (cursor !== startId) {
    const step = prev.get(cursor)!;
    used.push(step.link);
    cursor = step.from;
    path.push(byId.get(cursor)!);
  }
  path.reverse();
  const measured = used.every(l => typeof l.latencyMs === 'number');
  return { nodes: path, hops: path.length - 1, latencyMs: measured ? used.reduce((s, l) => s + (l.latencyMs as number), 0) : null };
}

export interface SpofNodeReport {
  id: string;
  name: string;
  layer: number;
  layerName: string;
  isCutVertex: boolean;
  /** Nodes that were connected to the core before this node failed and are not afterwards. */
  blastPartitionIds: string[];
  blastNodeCount: number;
  /** Sum over the failed node and its blast island; null when no subscriber inventory was supplied. */
  severedSubscribers: number | null;
  severedLinks: Link3DGen2[];
  detourPath: Node3DGen2[] | null;
}

export interface SpofAnalysis {
  spofNodes: SpofNodeReport[];
  spofNodeIds: Set<string>;
  spofMap: Map<string, SpofNodeReport>;
  /** False when there are no topology links or no core-layer node, so blast islands cannot be computed. */
  blastAvailable: boolean;
}

/** Tarjan articulation points plus blast islands measured from the core layer (layer 1). Pass topology links only. */
export function computeSpofAnalysis(
  nodes: Node3DGen2[],
  links: Link3DGen2[],
  subscribersByResource?: Record<string, number>
): SpofAnalysis {
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  links.forEach(l => {
    adj.get(l.source.id)?.push(l.target.id);
    adj.get(l.target.id)?.push(l.source.id);
  });

  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const cut = new Set<string>();
  let timer = 0;
  const dfs = (u: string) => {
    disc.set(u, ++timer);
    low.set(u, timer);
    let children = 0;
    for (const v of adj.get(u) || []) {
      if (!disc.has(v)) {
        children++;
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (parent.get(u) === null && children > 1) cut.add(u);
        if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) cut.add(u);
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  };
  nodes.forEach(n => {
    if (!disc.has(n.id)) {
      parent.set(n.id, null);
      dfs(n.id);
    }
  });

  const coreIds = nodes.filter(n => isAnchorLayer(n.layer)).map(n => n.id);
  const blastAvailable = links.length > 0 && coreIds.length > 0;
  const reach = (removed?: string): Set<string> => {
    const seen = new Set<string>();
    const queue: string[] = [];
    coreIds.forEach(id => { if (id !== removed) { seen.add(id); queue.push(id); } });
    for (let head = 0; head < queue.length; head++) {
      (adj.get(queue[head]) || []).forEach(nbr => {
        if (nbr !== removed && !seen.has(nbr)) { seen.add(nbr); queue.push(nbr); }
      });
    }
    return seen;
  };
  const baseline = blastAvailable ? reach() : new Set<string>();
  const byId = new Map(nodes.map(n => [n.id, n] as [string, Node3DGen2]));

  const spofMap = new Map<string, SpofNodeReport>();
  const spofNodes: SpofNodeReport[] = [];
  nodes.forEach(n => {
    const after = blastAvailable ? reach(n.id) : new Set<string>();
    const blast = blastAvailable
      ? nodes.filter(o => o.id !== n.id && baseline.has(o.id) && !after.has(o.id)).map(o => o.id)
      : [];
    const neighborIds = Array.from(new Set(adj.get(n.id) || []));
    const detour = neighborIds.length >= 2 ? findShortestPath(neighborIds[0], neighborIds[1], nodes, links, n.id) : null;
    const severedSubscribers = subscribersByResource
      ? [n.id, ...blast].reduce((sum, id) => sum + (subscribersByResource[id] || 0), 0)
      : null;
    const report: SpofNodeReport = {
      id: n.id,
      name: n.name,
      layer: n.layer,
      layerName: n.layerName,
      isCutVertex: cut.has(n.id),
      blastPartitionIds: blast,
      blastNodeCount: blast.length,
      severedSubscribers,
      severedLinks: links.filter(l => l.source.id === n.id || l.target.id === n.id),
      detourPath: detour ? detour.nodes : null
    };
    spofMap.set(n.id, report);
    if (report.isCutVertex) spofNodes.push(report);
  });
  void byId;
  return { spofNodes, spofNodeIds: cut, spofMap, blastAvailable };
}

// ── Multi-probe detection lead-time analysis ─────────────────────────────────

export interface ProbePairLeadTime {
  probeA: string;
  probeB: string;
  /** Number of resources/incidents where both probes alerted. */
  coOccurCount: number;
  /** Positive = probeA alerted earlier than probeB. */
  avgLeadSec: number;
  minLeadSec: number;
  maxLeadSec: number;
  /** Percent of co-occurrences in which A was strictly first. */
  leadPercentA: number;
}

export interface ProbeHorizonItem {
  probe: string;
  /** Mean seconds this probe alerted ahead of the other probes on the same resource/incident; null without samples. */
  avgLeadSec: number | null;
  /** Percent of its correlated groups in which it alerted strictly first; null without samples. */
  firstSharePercent: number | null;
  samples: number;
  totalAlerts: number;
  rank: number;
  color: string;
}

export interface MultiProbeAnalysis {
  probes: string[];
  /** pairwiseMap.get(A)?.get(B) is undefined when A and B never alerted on the same resource/incident. */
  pairwiseMap: Map<string, Map<string, ProbePairLeadTime>>;
  horizonSequence: ProbeHorizonItem[];
  totalCrossCorrelations: number;
  maxEarlyLeadMin: number | null;
  fastestProbe: string | null;
}

const PROBE_COLORS = ['#0f62fe', '#6929c4', '#0043ce', '#ba4e00', '#b28600', '#198038', '#d12771', '#da1e28'];

export function analyzeProbes(alerts: AlertItem[], incidents: IncidentItem[]): MultiProbeAnalysis {
  const totals = new Map<string, number>();
  alerts.forEach(a => totals.set(probeOf(a), (totals.get(probeOf(a)) || 0) + 1));
  const probes = Array.from(totals.keys()).sort();

  const groups = new Map<string, AlertItem[]>();
  const push = (key: string, a: AlertItem) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  };
  const incidentsByAlert = new Map<string, string[]>();
  incidents.forEach(inc => inc.alertIds.forEach(id => {
    if (!incidentsByAlert.has(id)) incidentsByAlert.set(id, []);
    incidentsByAlert.get(id)!.push(inc.id);
  }));
  alerts.forEach(a => {
    const res = resourceKeyOf(a);
    if (res) push(`res:${res}`, a);
    (incidentsByAlert.get(a.id) || []).forEach(incId => push(`inc:${incId}`, a));
  });

  const pairs = new Map<string, { deltas: number[]; aFirst: number }>();
  const horizon = new Map<string, { leads: number[]; first: number }>();
  let totalCrossCorrelations = 0;

  groups.forEach(group => {
    const earliest = new Map<string, number>();
    group.forEach(a => {
      const t = alertTime(a);
      if (t === null) return;
      const p = probeOf(a);
      if (!earliest.has(p) || t < earliest.get(p)!) earliest.set(p, t);
    });
    const active = Array.from(earliest.keys());
    if (active.length < 2) return;
    totalCrossCorrelations++;

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const [pa, pb] = active[i] < active[j] ? [active[i], active[j]] : [active[j], active[i]];
        const delta = (earliest.get(pb)! - earliest.get(pa)!) / 1000; // positive: pa first
        const rec = pairs.get(`${pa}\u0000${pb}`) || { deltas: [], aFirst: 0 };
        rec.deltas.push(delta);
        if (delta > 0) rec.aFirst++;
        pairs.set(`${pa}\u0000${pb}`, rec);
      }
    }
    active.forEach(p => {
      const others = active.filter(o => o !== p).map(o => earliest.get(o)!);
      const mean = others.reduce((s, t) => s + t, 0) / others.length;
      const rec = horizon.get(p) || { leads: [], first: 0 };
      rec.leads.push((mean - earliest.get(p)!) / 1000);
      if (earliest.get(p)! < Math.min(...others)) rec.first++;
      horizon.set(p, rec);
    });
  });

  const pairwiseMap = new Map<string, Map<string, ProbePairLeadTime>>();
  probes.forEach(p => pairwiseMap.set(p, new Map()));
  pairs.forEach((rec, key) => {
    const [pa, pb] = key.split('\u0000');
    const n = rec.deltas.length;
    const avg = rec.deltas.reduce((s, d) => s + d, 0) / n;
    pairwiseMap.get(pa)!.set(pb, {
      probeA: pa, probeB: pb, coOccurCount: n, avgLeadSec: Math.round(avg),
      minLeadSec: Math.round(Math.min(...rec.deltas)), maxLeadSec: Math.round(Math.max(...rec.deltas)),
      leadPercentA: Math.round((rec.aFirst / n) * 100)
    });
    const bFirst = rec.deltas.filter(d => d < 0).length;
    pairwiseMap.get(pb)!.set(pa, {
      probeA: pb, probeB: pa, coOccurCount: n, avgLeadSec: Math.round(-avg),
      minLeadSec: Math.round(-Math.max(...rec.deltas)), maxLeadSec: Math.round(-Math.min(...rec.deltas)),
      leadPercentA: Math.round((bFirst / n) * 100)
    });
  });

  const items: ProbeHorizonItem[] = probes.map((probe, i) => {
    const rec = horizon.get(probe);
    const samples = rec ? rec.leads.length : 0;
    return {
      probe,
      avgLeadSec: samples ? Math.round(rec!.leads.reduce((s, d) => s + d, 0) / samples) : null,
      firstSharePercent: samples ? Math.round((rec!.first / samples) * 100) : null,
      samples,
      totalAlerts: totals.get(probe) || 0,
      rank: 0,
      color: PROBE_COLORS[i % PROBE_COLORS.length]
    };
  });
  items.sort((a, b) => (b.avgLeadSec ?? -Infinity) - (a.avgLeadSec ?? -Infinity));
  items.forEach((item, i) => { item.rank = i + 1; });

  const top = items[0];
  const hasLead = top && top.avgLeadSec !== null && top.avgLeadSec > 0;
  return {
    probes,
    pairwiseMap,
    horizonSequence: items,
    totalCrossCorrelations,
    maxEarlyLeadMin: hasLead ? Math.round((top.avgLeadSec as number) / 6) / 10 : null,
    fastestProbe: hasLead ? top.probe : null
  };
}

// ── 2D structural layouts (used by TopologyCanvas2D) ─────────────────────────
//
// Pure, deterministic and free of any invented data: positions come only from the nodes' estimated tier,
// their topology group names (when topology insights supply them) and the links that were actually supplied.

export type Topology2DLayoutType = 'hierarchical' | 'circular' | 'containment';

export interface Layout2DNode {
  id: string;
  x: number;
  y: number;
  /** Hierarchical: tier row index. Circular: hop distance from the centre node. */
  rank?: number;
  clusterId?: string;
}

export interface Layout2DCluster {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
}

export interface Layout2DRing {
  rank: number;
  radius: number;
  label: string;
}

export interface Layout2DResult {
  nodes: Layout2DNode[];
  /** Containment layout only. */
  clusters?: Layout2DCluster[];
  /** Circular layout only. */
  center?: { x: number; y: number };
  rings?: Layout2DRing[];
}

/** Size of a node card as drawn by the canvas; the layouts space nodes by it. */
export const CARD_2D = { width: 148, height: 56 };
const COL_PITCH = CARD_2D.width + 28;
const ROW_PITCH = 110; // leaves room for same-row edges to arc over neighbouring cards
const TIER_GAP = 70;
const CLUSTER_PAD = 20;
const CLUSTER_HEADER = 36;

const byImportance = (a: Node3DGen2, b: Node3DGen2): number => (
  (b.isProbableCause ? 1 : 0) - (a.isProbableCause ? 1 : 0)
  || b.severity - a.severity
  || a.name.localeCompare(b.name)
  || a.id.localeCompare(b.id)
);

function neighbourMap(nodes: Node3DGen2[], links: Link3DGen2[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  nodes.forEach(n => map.set(n.id, new Set()));
  links.forEach(l => {
    const a = l.source.id;
    const b = l.target.id;
    if (a === b || !map.has(a) || !map.has(b)) return;
    map.get(a)!.add(b);
    map.get(b)!.add(a);
  });
  return map;
}

/**
 * Tiered layout: one band per estimated tier (core at the top), nodes ordered inside each tier with a few
 * barycentre sweeps to reduce edge crossings. Tiers with more nodes than fit the width wrap onto sub-rows.
 */
export function computeHierarchical2DLayout(nodes: Node3DGen2[], links: Link3DGen2[], width: number): Layout2DResult {
  if (nodes.length === 0) return { nodes: [] };
  const nbr = neighbourMap(nodes, links);
  const layerOf = new Map(nodes.map(n => [n.id, n.layer] as [string, number]));
  const layers = Array.from(new Set(nodes.map(n => n.layer))).sort((a, b) => a - b);
  const rows = new Map<number, Node3DGen2[]>();
  layers.forEach(l => rows.set(l, nodes.filter(n => n.layer === l).sort(byImportance)));

  const norm = new Map<string, number>(); // id -> 0..1 position inside its tier
  const refresh = () => rows.forEach(list => list.forEach((n, i) => norm.set(n.id, list.length > 1 ? i / (list.length - 1) : 0.5)));
  refresh();
  const sweep = (order: number[]) => {
    order.forEach(l => {
      const list = rows.get(l)!;
      const key = new Map<string, number>();
      list.forEach(n => {
        const xs = Array.from(nbr.get(n.id) || []).filter(id => layerOf.get(id) !== l).map(id => norm.get(id) as number);
        key.set(n.id, xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : (norm.get(n.id) as number));
      });
      list.sort((a, b) => (key.get(a.id) as number) - (key.get(b.id) as number) || (norm.get(a.id) as number) - (norm.get(b.id) as number));
      refresh();
    });
  };
  for (let i = 0; i < 4; i++) {
    sweep(layers);
    sweep([...layers].reverse());
  }

  const perRow = Math.max(4, Math.floor((Math.max(width, 600) - 80) / COL_PITCH));
  const cx = width / 2;
  let y = 80;
  const out: Layout2DNode[] = [];
  layers.forEach((l, tier) => {
    const list = rows.get(l)!;
    const subRows = Math.ceil(list.length / perRow);
    const per = Math.ceil(list.length / subRows);
    for (let r = 0; r < subRows; r++) {
      const slice = list.slice(r * per, (r + 1) * per);
      slice.forEach((n, i) => out.push({ id: n.id, x: cx + (i - (slice.length - 1) / 2) * COL_PITCH, y: y + r * ROW_PITCH, rank: tier }));
    }
    y += (subRows - 1) * ROW_PITCH + ROW_PITCH + TIER_GAP;
  });
  return { nodes: out };
}

/**
 * Concentric hop rings around a centre node (the selected node, else the most connected / probable cause).
 * Nodes with no path to the centre sit on a final ring labelled as such. Ring radii grow so cards never overlap.
 */
export function computeCircular2DLayout(
  nodes: Node3DGen2[],
  links: Link3DGen2[],
  width: number,
  height: number,
  centerId?: string
): Layout2DResult {
  if (nodes.length === 0) return { nodes: [] };
  const nbr = neighbourMap(nodes, links);
  const byId = new Map(nodes.map(n => [n.id, n] as [string, Node3DGen2]));
  const centre = (centerId && byId.get(centerId)) || [...nodes].sort((a, b) => (
    (b.isProbableCause ? 1 : 0) - (a.isProbableCause ? 1 : 0)
    || (nbr.get(b.id) as Set<string>).size - (nbr.get(a.id) as Set<string>).size
    || b.severity - a.severity
    || a.id.localeCompare(b.id)
  ))[0];

  const hop = new Map<string, number>([[centre.id, 0]]);
  const queue = [centre.id];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    (nbr.get(id) as Set<string>).forEach(o => {
      if (!hop.has(o)) {
        hop.set(o, (hop.get(id) as number) + 1);
        queue.push(o);
      }
    });
  }
  const reachableMax = Math.max(...Array.from(hop.values()));
  const unlinked = nodes.filter(n => !hop.has(n.id));
  const unlinkedRank = reachableMax + 1;
  unlinked.forEach(n => hop.set(n.id, unlinkedRank));
  const maxRank = unlinked.length ? unlinkedRank : reachableMax;

  const cxy = { x: width / 2, y: height / 2 };
  const angleOf = new Map<string, number>();
  const out: Layout2DNode[] = [{ id: centre.id, x: cxy.x, y: cxy.y, rank: 0 }];
  const rings: Layout2DRing[] = [];
  let prevRadius = 0;

  for (let h = 1; h <= maxRank; h++) {
    const members = nodes.filter(n => hop.get(n.id) === h).sort(byImportance);
    if (members.length === 0) continue;
    // Order by the mean angle of neighbours on the previous ring so edges stay short.
    const key = new Map<string, number>();
    members.forEach(n => {
      const angles = Array.from(nbr.get(n.id) as Set<string>).filter(id => hop.get(id) === h - 1 && angleOf.has(id)).map(id => angleOf.get(id) as number);
      if (angles.length) {
        const sx = angles.reduce((s, a) => s + Math.cos(a), 0);
        const sy = angles.reduce((s, a) => s + Math.sin(a), 0);
        key.set(n.id, Math.atan2(sy, sx));
      } else {
        key.set(n.id, Infinity);
      }
    });
    members.sort((a, b) => (key.get(a.id) as number) - (key.get(b.id) as number));

    const radius = Math.max(prevRadius + 170, (members.length * COL_PITCH) / (2 * Math.PI), 190);
    members.forEach((n, i) => {
      const angle = -Math.PI / 2 + (i / members.length) * Math.PI * 2;
      angleOf.set(n.id, angle);
      out.push({ id: n.id, x: cxy.x + radius * Math.cos(angle), y: cxy.y + radius * Math.sin(angle), rank: h });
    });
    rings.push({ rank: h, radius, label: unlinked.length && h === unlinkedRank ? 'Not linked to centre' : `${h}-hop` });
    prevRadius = radius;
  }
  return { nodes: out, center: cxy, rings };
}

/**
 * Pod containment: nodes are grouped by their first topology group name (real, from topology insights) and,
 * when none is supplied, by estimated tier. Each group is a labelled box with its nodes on a grid; boxes are
 * shelf-packed to the given width.
 */
export function computePodContainment2DLayout(nodes: Node3DGen2[], links: Link3DGen2[], width: number): Layout2DResult {
  void links;
  if (nodes.length === 0) return { nodes: [], clusters: [] };
  const groups = new Map<string, { name: string; members: Node3DGen2[] }>();
  nodes.forEach(n => {
    const g = n.topologyGroups[0];
    const id = g ? `group:${g}` : `layer:${n.layer}`;
    const entry = groups.get(id) || { name: g || `${n.layerName} (est.)`, members: [] };
    entry.members.push(n);
    groups.set(id, entry);
  });
  const ordered = Array.from(groups.entries())
    .map(([id, g]) => ({ id, name: g.name, members: g.members.sort(byImportance) }))
    .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));

  const maxRowWidth = Math.max(width - 80, 760);
  const left = 40;
  let x = left;
  let y = 40;
  let rowHeight = 0;
  const outNodes: Layout2DNode[] = [];
  const clusters: Layout2DCluster[] = [];

  ordered.forEach(g => {
    const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(g.members.length * 1.3))));
    const rowCount = Math.ceil(g.members.length / cols);
    const w = CLUSTER_PAD * 2 + cols * COL_PITCH - (COL_PITCH - CARD_2D.width);
    const h = CLUSTER_HEADER + CLUSTER_PAD * 2 + (rowCount - 1) * ROW_PITCH + CARD_2D.height;
    if (x > left && x + w > left + maxRowWidth) {
      x = left;
      y += rowHeight + 40;
      rowHeight = 0;
    }
    g.members.forEach((n, i) => {
      outNodes.push({
        id: n.id,
        x: x + CLUSTER_PAD + CARD_2D.width / 2 + (i % cols) * COL_PITCH,
        y: y + CLUSTER_HEADER + CLUSTER_PAD + CARD_2D.height / 2 + Math.floor(i / cols) * ROW_PITCH,
        clusterId: g.id
      });
    });
    clusters.push({ id: g.id, name: g.name, x, y, width: w, height: h, nodeIds: g.members.map(n => n.id) });
    x += w + 40;
    rowHeight = Math.max(rowHeight, h);
  });
  return { nodes: outNodes, clusters };
}

// ── Insight-view data (all derived from the loaded alerts, incidents and links; nothing is invented) ──────────────

/** First and last occurrence of an alert as epoch ms; null when it has no usable time. */
export function alertSpan(a: AlertItem): { start: number; end: number } | null {
  const first = parseTime(a.firstOccurrenceTime);
  const last = parseTime(a.lastOccurrenceTime);
  const start = first ?? last;
  if (start === null) return null;
  return { start, end: last !== null && last >= start ? last : start };
}

/** Earliest alert time on a node (epoch ms), or null when none of its alerts has a time. */
export function nodeFirstSeen(n: Node3DGen2): number | null {
  let min: number | null = null;
  n.alerts.forEach(a => {
    const t = alertTime(a);
    if (t !== null && (min === null || t < min)) min = t;
  });
  return min;
}

export interface ReplayDomain {
  start: number;
  end: number;
}

/** Time range over which nodes first start alerting; null unless at least two distinct times exist. */
export function replayDomain(nodes: Node3DGen2[]): ReplayDomain | null {
  const times = nodes.map(nodeFirstSeen).filter((t): t is number => t !== null);
  if (times.length === 0) return null;
  const start = Math.min(...times);
  const end = Math.max(...times);
  return end > start ? { start, end } : null;
}

/** Nodes whose first alert happened at or before `t`. */
export function nodesSeenBy(nodes: Node3DGen2[], t: number): Set<string> {
  const out = new Set<string>();
  nodes.forEach(n => {
    const seen = nodeFirstSeen(n);
    if (seen !== null && seen <= t) out.add(n.id);
  });
  return out;
}

/** Nodes with at least one alert whose [first, last] occurrence overlaps [start, end]. */
export function nodesInWindow(nodes: Node3DGen2[], start: number, end: number): Set<string> {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const out = new Set<string>();
  nodes.forEach(n => {
    if (n.alerts.some(a => {
      const span = alertSpan(a);
      return span !== null && span.start <= hi && span.end >= lo;
    })) out.add(n.id);
  });
  return out;
}

/** Hop distance from `startId` over the given links (undirected). Unreachable nodes are absent. */
export function hopDistances(startId: string, nodes: Node3DGen2[], links: Link3DGen2[]): Map<string, number> {
  const nbr = neighbourMap(nodes, links);
  const dist = new Map<string, number>();
  if (!nbr.has(startId)) return dist;
  dist.set(startId, 0);
  const queue = [startId];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    (nbr.get(id) as Set<string>).forEach(o => {
      if (!dist.has(o)) {
        dist.set(o, (dist.get(id) as number) + 1);
        queue.push(o);
      }
    });
  }
  return dist;
}

export interface HierarchyDatum {
  id: string;
  name: string;
  kind: 'root' | 'tier' | 'group' | 'resource';
  /** Alert count (sum for tiers and groups). */
  value: number;
  /** Highest alert severity underneath. */
  severity: number;
  /** Set for resources: the node id. */
  nodeId?: string;
  layer?: number;
  children?: HierarchyDatum[];
}

export const NO_GROUP_LABEL = 'No topology group';

/** Tier (estimated) -> topology group (from topology insights, when present) -> resource. Sized by alert count. */
export function buildTierHierarchy(nodes: Node3DGen2[]): HierarchyDatum {
  const tiers = new Map<number, Map<string, Node3DGen2[]>>();
  nodes.forEach(n => {
    const group = n.topologyGroups[0] || NO_GROUP_LABEL;
    const groups = tiers.get(n.layer) || new Map<string, Node3DGen2[]>();
    groups.set(group, [...(groups.get(group) || []), n]);
    tiers.set(n.layer, groups);
  });
  const sum = (items: HierarchyDatum[]) => items.reduce((s, c) => s + c.value, 0);
  const maxSev = (items: HierarchyDatum[]) => items.reduce((m, c) => Math.max(m, c.severity), 0);

  const tierData: HierarchyDatum[] = Array.from(tiers.entries()).sort((a, b) => a[0] - b[0]).map(([layer, groups]) => {
    const groupData: HierarchyDatum[] = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, members]) => {
      const leaves: HierarchyDatum[] = [...members].sort(byImportance).map(n => ({
        id: `res:${n.id}`, name: n.name, kind: 'resource' as const, value: Math.max(n.alertCount, 1), severity: n.severity, nodeId: n.id, layer
      }));
      return { id: `group:${layer}:${name}`, name, kind: 'group' as const, value: sum(leaves), severity: maxSev(leaves), layer, children: leaves };
    });
    return { id: `tier:${layer}`, name: `${layerDef(layer).name} (est.)`, kind: 'tier' as const, value: sum(groupData), severity: maxSev(groupData), layer, children: groupData };
  });
  return { id: 'root', name: 'All resources', kind: 'root', value: sum(tierData), severity: maxSev(tierData), children: tierData };
}

export interface SwimBar {
  alertId: string;
  start: number;
  end: number;
  severity: number;
  probe: string;
  summary: string;
  state: string;
}

export interface SwimLane {
  id: string;
  name: string;
  layer: number;
  layerName: string;
  severity: number;
  /** The probe behind this resource's earliest alert. */
  firstProbe: string | null;
  firstTime: number | null;
  bars: SwimBar[];
}

export interface Swimlanes {
  lanes: SwimLane[];
  /** Epoch ms range covering every bar; null when no alert has a time. */
  domain: [number, number] | null;
}

/** One lane per resource (grouped by estimated tier, worst first); one bar per alert from first to last occurrence. */
export function buildSwimlanes(nodes: Node3DGen2[]): Swimlanes {
  let lo = Infinity;
  let hi = -Infinity;
  const lanes: SwimLane[] = nodes.map(n => {
    const bars: SwimBar[] = [];
    n.alerts.forEach(a => {
      const span = alertSpan(a);
      if (!span) return;
      lo = Math.min(lo, span.start);
      hi = Math.max(hi, span.end);
      bars.push({ alertId: a.id, start: span.start, end: span.end, severity: a.severity, probe: probeOf(a), summary: a.summary, state: a.state });
    });
    bars.sort((a, b) => a.start - b.start || a.alertId.localeCompare(b.alertId));
    return {
      id: n.id, name: n.name, layer: n.layer, layerName: n.layerName, severity: n.severity,
      firstProbe: bars.length ? bars[0].probe : null,
      firstTime: bars.length ? bars[0].start : null,
      bars
    };
  });
  lanes.sort((a, b) => a.layer - b.layer || b.severity - a.severity || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { lanes, domain: Number.isFinite(lo) ? [lo, hi] : null };
}

export interface AdjacencyCell {
  row: number;
  col: number;
  kind: LinkKind;
  link: Link3DGen2;
}

export interface AdjacencyModel {
  order: Node3DGen2[];
  index: Map<string, number>;
  cells: AdjacencyCell[];
  /** Contiguous index ranges per estimated tier, for the banding. */
  tiers: Array<{ layer: number; start: number; end: number }>;
  physicalCount: number;
  causalCount: number;
}

/** Nodes ordered by tier, then severity; topology links fill both (row, col) and (col, row), causal links only source -> target. */
export function buildAdjacency(nodes: Node3DGen2[], links: Link3DGen2[]): AdjacencyModel {
  const order = [...nodes].sort((a, b) => a.layer - b.layer || b.severity - a.severity || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const index = new Map(order.map((n, i) => [n.id, i] as [string, number]));
  const cells: AdjacencyCell[] = [];
  let physicalCount = 0;
  let causalCount = 0;
  links.forEach(l => {
    const r = index.get(l.source.id);
    const c = index.get(l.target.id);
    if (r === undefined || c === undefined || r === c) return;
    if (l.isCausal) {
      causalCount++;
      cells.push({ row: r, col: c, kind: l.kind, link: l });
    } else {
      physicalCount++;
      cells.push({ row: r, col: c, kind: l.kind, link: l }, { row: c, col: r, kind: l.kind, link: l });
    }
  });
  const tiers: AdjacencyModel['tiers'] = [];
  order.forEach((n, i) => {
    const last = tiers[tiers.length - 1];
    if (last && last.layer === n.layer) last.end = i;
    else tiers.push({ layer: n.layer, start: i, end: i });
  });
  return { order, index, cells, tiers, physicalCount, causalCount };
}

export interface MiniNode {
  id: string;
  name: string;
  layer: number;
  severity: number;
  isRoot: boolean;
  /** Position in a 100 x 60 box. */
  x: number;
  y: number;
}

export interface MiniGraph {
  nodes: MiniNode[];
  links: Array<{ source: string; target: string; isCausal: boolean; kind: LinkKind }>;
  /** Resources of the incident that were left out to keep the picture small. */
  hidden: number;
}

/**
 * The incident's own subgraph: resources behind its alerts (probable cause in the middle, the rest on a ring)
 * and the links that exist between them in the loaded graph.
 */
export function buildIncidentSubgraph(
  incident: IncidentItem,
  alertById: Map<string, AlertItem>,
  nodeById: Map<string, Node3DGen2>,
  links: Link3DGen2[],
  rootNodeId?: string | null,
  maxNodes = 14
): MiniGraph {
  const ids = new Set<string>();
  incident.alertIds.forEach(id => {
    const a = alertById.get(id);
    const key = a ? resourceKeyOf(a) : null;
    if (key && nodeById.has(key)) ids.add(key);
  });
  const members = Array.from(ids).map(id => nodeById.get(id) as Node3DGen2).sort((a, b) => (
    (b.id === rootNodeId ? 1 : 0) - (a.id === rootNodeId ? 1 : 0) || byImportance(a, b)
  ));
  const shown = members.slice(0, maxNodes);
  const root = shown.find(n => n.id === rootNodeId);
  const ring = shown.filter(n => n !== root).sort((a, b) => a.layer - b.layer || byImportance(a, b));
  const nodes: MiniNode[] = [];
  if (root) nodes.push({ id: root.id, name: root.name, layer: root.layer, severity: root.severity, isRoot: true, x: 50, y: 30 });
  ring.forEach((n, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(ring.length, 1)) * Math.PI * 2;
    const single = !root && ring.length === 1;
    nodes.push({
      id: n.id, name: n.name, layer: n.layer, severity: n.severity, isRoot: false,
      x: single ? 50 : 50 + 40 * Math.cos(angle), y: single ? 30 : 30 + 22 * Math.sin(angle)
    });
  });
  const shownIds = new Set(nodes.map(n => n.id));
  const out = links
    .filter(l => shownIds.has(l.source.id) && shownIds.has(l.target.id))
    .map(l => ({ source: l.source.id, target: l.target.id, isCausal: l.isCausal, kind: l.kind }));
  return { nodes, links: out, hidden: members.length - shown.length };
}

// ── Link flow (Sankey over resource links) ───────────────────────────────────

export interface FlowNode {
  id: string;
  name: string;
  layer: number;
  layerName: string;
  severity: number;
  alertCount: number;
}

export interface FlowLink {
  source: string;
  target: string;
  kind: LinkKind;
  /** How many links were merged into this one (parallel links between the same pair and kind). */
  value: number;
  /** The first underlying link, for inspection. */
  link: Link3DGen2;
}

export interface LinkFlowModel {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Links left out because drawing them would close a loop (a Sankey cannot show cycles). */
  dropped: number;
  /** Resources with no link at all (not drawn). */
  unlinked: number;
}

/**
 * Turns resource links into an acyclic, directed flow: causal links keep their direction, topology links run from
 * the lower tier to the higher one (then by id). A link that would close a loop is skipped and counted in `dropped`.
 * Only resources that have at least one kept link are returned, so the picture is not padded with isolated boxes.
 */
export function buildLinkFlow(nodes: Node3DGen2[], links: Link3DGen2[], kinds?: LinkKind[]): LinkFlowModel {
  const byId = new Map(nodes.map(n => [n.id, n] as [string, Node3DGen2]));
  const wanted = links.filter(l => byId.has(l.source.id) && byId.has(l.target.id) && l.source.id !== l.target.id && (!kinds || kinds.includes(l.kind)));

  const oriented = wanted.map(l => {
    if (l.isCausal) return { s: l.source.id, t: l.target.id, link: l };
    const a = l.source;
    const b = l.target;
    const forward = a.layer < b.layer || (a.layer === b.layer && a.id <= b.id);
    return forward ? { s: a.id, t: b.id, link: l } : { s: b.id, t: a.id, link: l };
  });
  // Causal links first so they are the ones kept when a loop has to be broken.
  oriented.sort((x, y) => Number(y.link.isCausal) - Number(x.link.isCausal) || x.s.localeCompare(y.s) || x.t.localeCompare(y.t));

  const out = new Map<string, Set<string>>();
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length) {
      const cur = stack.pop() as string;
      if (cur === to) return true;
      (out.get(cur) || new Set<string>()).forEach(nx => { if (!seen.has(nx)) { seen.add(nx); stack.push(nx); } });
    }
    return false;
  };

  const kept = new Map<string, FlowLink>();
  let dropped = 0;
  oriented.forEach(({ s, t, link }) => {
    const key = `${s}\u0000${t}\u0000${link.kind}`;
    const existing = kept.get(key);
    if (existing) { existing.value += 1; return; }
    if (reaches(t, s)) { dropped += 1; return; }
    kept.set(key, { source: s, target: t, kind: link.kind, value: 1, link });
    if (!out.has(s)) out.set(s, new Set());
    (out.get(s) as Set<string>).add(t);
  });

  const used = new Set<string>();
  kept.forEach(l => { used.add(l.source); used.add(l.target); });
  const touched = new Set<string>();
  wanted.forEach(l => { touched.add(l.source.id); touched.add(l.target.id); });
  const flowNodes: FlowNode[] = nodes
    .filter(n => used.has(n.id))
    .sort((a, b) => a.layer - b.layer || b.severity - a.severity || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(n => ({ id: n.id, name: n.name, layer: n.layer, layerName: n.layerName, severity: n.severity, alertCount: n.alertCount }));

  return {
    nodes: flowNodes,
    links: Array.from(kept.values()),
    dropped,
    unlinked: nodes.filter(n => !touched.has(n.id)).length
  };
}

/** Resources that take part in at least one of the given links. */
export function linkedNodes(nodes: Node3DGen2[], links: Link3DGen2[]): Node3DGen2[] {
  const ids = new Set<string>();
  links.forEach(l => { ids.add(l.source.id); ids.add(l.target.id); });
  return nodes.filter(n => ids.has(n.id));
}

// ── Triage insights (recurring problems, correlation gaps, root causes, sources) ──
//
// Everything below is counted from the loaded alerts and incidents. Nothing is estimated or invented;
// when a field is missing the row says so (null / empty) instead of guessing.

export interface RecurringProblem {
  key: string;
  /** The wording of the first alert in the group (numbers in the text are what vary between alerts). */
  label: string;
  count: number;
  /** Node ids (cleaned resource names) of the resources that raised it. */
  resourceIds: string[];
  worstSeverity: number;
  firstTime: number | null;
  lastTime: number | null;
  probes: string[];
}

export interface IncidentRef {
  id: string;
  title: string;
  priority: number;
  state: string;
  team: string;
}

export interface CoverageGaps {
  alertCount: number;
  alertsInIncident: number;
  orphanAlertIds: string[];
  /** Node ids of the resources behind alerts that belong to no incident. */
  orphanResourceIds: string[];
  incidentCount: number;
  unassigned: IncidentRef[];
  noProbableCause: IncidentRef[];
  alertsWithRunbook: number;
  runbookAutomated: number;
  runbookAssisted: number;
  incidentsWithoutRunbook: IncidentRef[];
}

export interface RootCauseRow {
  resourceId: string;
  incidents: IncidentRef[];
  /** Incidents in which this resource is the top-ranked probable cause. */
  rankOne: number;
  /** Highest score reported by the service when it is a 0..1 value; null otherwise. */
  maxConfidencePercent: number | null;
}

export interface SourceRow {
  probe: string;
  total: number;
  critical: number;
  major: number;
  minor: number;
  warning: number;
  info: number;
}

export interface TriageModel {
  problems: RecurringProblem[];
  gaps: CoverageGaps;
  rootCauses: RootCauseRow[];
  sources: SourceRow[];
}

/** Makes "eth1" and "eth2", or two different IPs, the same problem. Exported for tests. */
export function normalizeSummary(summary: string): string {
  const text = (summary || '').toLowerCase()
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<ip>')
    .replace(/0x[0-9a-f]+|\b[0-9a-f]{8,}\b/g, '<id>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
  return text || '(no summary)';
}

const blank = (s?: string) => !s || !s.trim() || s.trim() === '-' || /^unassigned$/i.test(s.trim());
const hasRunbook = (a: AlertItem) => (a.insights || []).some(i => i?.type?.includes('runbook'));
const isAutomated = (a: AlertItem) => (a.insights || []).some(i => i?.type?.includes('runbook') && Boolean(i.details?.isAutomated));

export function buildTriageInsights(alerts: AlertItem[], incidents: IncidentItem[]): TriageModel {
  const alertById = new Map(alerts.map(a => [a.id, a] as [string, AlertItem]));
  const ref = (i: IncidentItem): IncidentRef => ({ id: i.id, title: i.title, priority: i.priority, state: i.state, team: i.team });

  // 1. Recurring problems
  const groups = new Map<string, AlertItem[]>();
  alerts.forEach(a => {
    const k = normalizeSummary(a.summary);
    groups.set(k, [...(groups.get(k) || []), a]);
  });
  const problems: RecurringProblem[] = Array.from(groups.entries()).map(([key, list]) => {
    const times = list.map(alertTime).filter((t): t is number => t !== null);
    const first = list.slice().sort((x, y) => (alertTime(x) ?? Infinity) - (alertTime(y) ?? Infinity) || x.id.localeCompare(y.id))[0];
    return {
      key,
      label: first.summary || '(no summary)',
      count: list.length,
      resourceIds: Array.from(new Set(list.map(resourceKeyOf).filter((r): r is string => Boolean(r)))).sort(),
      worstSeverity: list.reduce((m, a) => Math.max(m, a.severity), 0),
      firstTime: times.length ? Math.min(...times) : null,
      lastTime: times.length ? Math.max(...times) : null,
      probes: Array.from(new Set(list.map(probeOf))).sort()
    };
  }).sort((a, b) => b.count - a.count || b.worstSeverity - a.worstSeverity || a.key.localeCompare(b.key));

  // 2. Correlation gaps
  const inIncident = new Set<string>();
  incidents.forEach(i => i.alertIds.forEach(id => inIncident.add(id)));
  const orphans = alerts.filter(a => !inIncident.has(a.id));
  const probableCauseOf = (inc: IncidentItem): Array<{ alert: AlertItem; rank: number; score?: number }> => {
    const out: Array<{ alert: AlertItem; rank: number; score?: number }> = [];
    (inc.insights || []).forEach(ins => {
      if (!ins?.type?.includes(PROBABLE_CAUSE)) return;
      const a = ins.details?.id ? alertById.get(ins.details.id) : undefined;
      if (!a) return;
      const rank = Number.isFinite(ins.details?.rank as number) && (ins.details?.rank as number) > 0 ? (ins.details?.rank as number) : 1;
      out.push({ alert: a, rank, score: ins.details?.score });
    });
    return out;
  };
  const withRunbook = alerts.filter(hasRunbook);
  const gaps: CoverageGaps = {
    alertCount: alerts.length,
    alertsInIncident: alerts.length - orphans.length,
    orphanAlertIds: orphans.map(a => a.id),
    orphanResourceIds: Array.from(new Set(orphans.map(resourceKeyOf).filter((r): r is string => Boolean(r)))).sort(),
    incidentCount: incidents.length,
    unassigned: incidents.filter(i => i.state.toLowerCase() === 'unassigned' || (blank(i.owner) && blank(i.team))).map(ref),
    noProbableCause: incidents.filter(i => probableCauseOf(i).length === 0).map(ref),
    alertsWithRunbook: withRunbook.length,
    runbookAutomated: withRunbook.filter(isAutomated).length,
    runbookAssisted: withRunbook.filter(a => !isAutomated(a)).length,
    incidentsWithoutRunbook: incidents.filter(i => !i.alertIds.some(id => { const a = alertById.get(id); return a ? hasRunbook(a) : false; })).map(ref)
  };

  // 3. Root-cause leaderboard
  type RootAcc = { incidents: Map<string, IncidentRef>; rankOne: Set<string>; maxScore: number | null };
  const rc = new Map<string, RootAcc>();
  incidents.forEach(inc => probableCauseOf(inc).forEach(({ alert, rank, score }) => {
    const rid = resourceKeyOf(alert);
    if (!rid) return;
    const row: RootAcc = rc.get(rid) || { incidents: new Map<string, IncidentRef>(), rankOne: new Set<string>(), maxScore: null as number | null };
    row.incidents.set(inc.id, ref(inc));
    if (rank === 1) row.rankOne.add(inc.id);
    if (typeof score === 'number' && score >= 0 && score <= 1) row.maxScore = Math.max(row.maxScore ?? 0, score);
    rc.set(rid, row);
  }));
  const rootCauses: RootCauseRow[] = Array.from(rc.entries()).map(([resourceId, row]) => ({
    resourceId,
    incidents: Array.from(row.incidents.values()),
    rankOne: row.rankOne.size,
    maxConfidencePercent: row.maxScore === null ? null : Math.round(row.maxScore * 100)
  })).sort((a, b) => b.incidents.length - a.incidents.length || b.rankOne - a.rankOne || a.resourceId.localeCompare(b.resourceId));

  // 4. Sources by severity
  const srcMap = new Map<string, SourceRow>();
  alerts.forEach(a => {
    const p = probeOf(a);
    const row = srcMap.get(p) || { probe: p, total: 0, critical: 0, major: 0, minor: 0, warning: 0, info: 0 };
    row.total++;
    if (a.severity >= 6) row.critical++;
    else if (a.severity === 5) row.major++;
    else if (a.severity === 4) row.minor++;
    else if (a.severity === 3) row.warning++;
    else row.info++;
    srcMap.set(p, row);
  });
  const sources = Array.from(srcMap.values()).sort((a, b) => b.total - a.total || a.probe.localeCompare(b.probe));

  return { problems, gaps, rootCauses, sources };
}
