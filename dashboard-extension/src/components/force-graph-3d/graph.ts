/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import { ALERT_QUERY_PARAMS, COLORS_STROKE, SEVERITIES } from '../constants';

/** Alert fields that can be used to cluster resources around shared "hub" nodes. */
export type LinkDimension = 'sender.name' | 'team' | 'type.classification';
export type NodeKind = 'resource' | LinkDimension;

export const LINK_DIMENSIONS: Array<{ label: string; value: LinkDimension }> = [
  { label: 'Alert source', value: 'sender.name' },
  { label: 'Team', value: 'team' },
  { label: 'Alert type', value: 'type.classification' }
];

export const DEFAULT_LINK_BY: LinkDimension[] = ['sender.name', 'type.classification'];

export const HUB_COLORS: Record<LinkDimension, string> = {
  'sender.name': '#08bdba',
  team: '#be95ff',
  'type.classification': '#ff7eb6'
};

export const KIND_LABELS: Record<NodeKind, string> = {
  resource: 'Resource',
  'sender.name': 'Alert source',
  team: 'Team',
  'type.classification': 'Alert type'
};

export const BACKGROUND = '#161616';
export const DIM_TARGET = '#262626';
const CLEAR_COLOR = '#c6c6c6';

export interface GraphNode {
  id: string;
  name: string;
  kind: NodeKind;
  /** Highest alert severity (0-6) for resources, 0 for hubs. */
  severity: number;
  /** Alerts for a resource, linked resources for a hub. */
  count: number;
  /** Relative size handed to the force graph. */
  val: number;
  color: string;
  // d3-force-3d writes these during simulation.
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

export interface GraphStats {
  alerts: number;
  resources: number;
  hubs: number;
  links: number;
  /** Resources dropped because of the maxNodes cap. */
  truncated: number;
  /** Alert rows ignored because they carried no resource name. */
  skipped: number;
}

export interface AlertGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  neighbors: Map<string, Set<string>>;
  stats: GraphStats;
}

export interface BuildOptions {
  linkBy: LinkDimension[];
  /** Hide alerts below this severity (0 keeps everything). */
  minSeverity: number;
  /** Case-insensitive match against resource names and hub values. */
  search: string;
  /** Cap on resource nodes; highest severity, then busiest, wins. */
  maxNodes: number;
}

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  linkBy: DEFAULT_LINK_BY,
  minSeverity: 0,
  search: '',
  maxNodes: 1500
};

type AlertRow = { fields: Array<string | null> };
type AlertColumn = { name: string };

export const severityColor = (severity: number): string => {
  if (!Number.isFinite(severity) || severity <= 0) return CLEAR_COLOR;
  return COLORS_STROKE[Math.min(Math.round(severity), COLORS_STROKE.length - 1)];
};

export const severityLabel = (severity: number): string =>
  SEVERITIES[Math.max(0, Math.min(Math.round(severity) || 0, SEVERITIES.length - 1))];

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** Blend a colour towards the canvas background (used to de-emphasise nodes/links without alpha). */
export const dimColor = (hex: string, amount = 0.82, target = DIM_TARGET): string => {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = hexToRgb(target);
  return `#${toHex(r + (tr - r) * amount)}${toHex(g + (tg - g) * amount)}${toHex(b + (tb - b) * amount)}`;
};

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string
  ));

/** Link endpoints are strings before the force engine runs and node objects afterwards. */
export const endpointId = (end: unknown): string =>
  typeof end === 'object' && end !== null ? String((end as { id: unknown }).id) : String(end);

const nodeId = (kind: NodeKind, name: string) => `${kind}:${name}`;

const resolveColumns = (columns?: AlertColumn[]) => {
  const names = columns?.length ? columns.map(c => c.name) : ALERT_QUERY_PARAMS.columns;
  const index = (name: string) => names.indexOf(name);
  return {
    severity: index('severity'),
    resource: index('resource.name'),
    dims: {
      'sender.name': index('sender.name'),
      team: index('team'),
      'type.classification': index('type.classification')
    } as Record<LinkDimension, number>
  };
};

const clean = (v: string | null | undefined) => (v ?? '').toString().trim();

interface ResourceAgg {
  name: string;
  count: number;
  maxSev: number;
  dims: Record<LinkDimension, Map<string, number>>;
}

const newAgg = (name: string): ResourceAgg => ({
  name,
  count: 0,
  maxSev: 0,
  dims: { 'sender.name': new Map(), team: new Map(), 'type.classification': new Map() }
});

/**
 * Turns Concert Operate `getAlerts` rows into a resource graph: one node per resource,
 * plus shared hub nodes (source / team / type) that cluster related resources together.
 */
export function buildAlertGraph(
  rows: AlertRow[] | undefined | null,
  columns: AlertColumn[] | undefined | null,
  options: Partial<BuildOptions> = {}
): AlertGraph {
  // Per-key fallback: spreading would let an explicit `undefined` wipe out a default.
  const opts: BuildOptions = {
    linkBy: options.linkBy ?? DEFAULT_BUILD_OPTIONS.linkBy,
    minSeverity: options.minSeverity ?? DEFAULT_BUILD_OPTIONS.minSeverity,
    search: options.search ?? DEFAULT_BUILD_OPTIONS.search,
    maxNodes: options.maxNodes ?? DEFAULT_BUILD_OPTIONS.maxNodes
  };
  const col = resolveColumns(columns ?? undefined);
  const aggs = new Map<string, ResourceAgg>();
  let alerts = 0;
  let skipped = 0;

  (rows ?? []).forEach(row => {
    const fields = row?.fields ?? [];
    const severity = Number(fields[col.severity]) || 0;
    if (severity < opts.minSeverity) return;
    const resource = col.resource >= 0 ? clean(fields[col.resource]) : '';
    if (!resource) {
      skipped++;
      return;
    }
    alerts++;
    const agg = aggs.get(resource) ?? newAgg(resource);
    agg.count++;
    agg.maxSev = Math.max(agg.maxSev, severity);
    opts.linkBy.forEach(dim => {
      const value = col.dims[dim] >= 0 ? clean(fields[col.dims[dim]]) : '';
      if (value) agg.dims[dim].set(value, (agg.dims[dim].get(value) ?? 0) + 1);
    });
    aggs.set(resource, agg);
  });

  const needle = opts.search.trim().toLowerCase();
  let selected = Array.from(aggs.values());
  if (needle) {
    selected = selected.filter(a =>
      a.name.toLowerCase().includes(needle) ||
      opts.linkBy.some(dim => Array.from(a.dims[dim].keys()).some(v => v.toLowerCase().includes(needle)))
    );
  }

  const matched = selected.length;
  selected.sort((a, b) => b.maxSev - a.maxSev || b.count - a.count || a.name.localeCompare(b.name));
  const cap = Math.max(1, opts.maxNodes);
  const truncated = Math.max(0, matched - cap);
  selected = selected.slice(0, cap);

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const hubs = new Map<string, GraphNode>();
  const neighbors = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  };

  selected.forEach(agg => {
    const id = nodeId('resource', agg.name);
    nodes.push({
      id,
      name: agg.name,
      kind: 'resource',
      severity: agg.maxSev,
      count: agg.count,
      val: 1 + Math.log2(agg.count + 1) * 1.5,
      color: severityColor(agg.maxSev)
    });
    if (!neighbors.has(id)) neighbors.set(id, new Set());

    opts.linkBy.forEach(dim => {
      agg.dims[dim].forEach((weight, value) => {
        const hubId = nodeId(dim, value);
        let hub = hubs.get(hubId);
        if (!hub) {
          hub = { id: hubId, name: value, kind: dim, severity: 0, count: 0, val: 3, color: HUB_COLORS[dim] };
          hubs.set(hubId, hub);
        }
        hub.count++;
        links.push({ source: id, target: hubId, weight });
        connect(id, hubId);
      });
    });
  });

  hubs.forEach(hub => {
    hub.val = 3 + Math.sqrt(hub.count) * 1.2;
    nodes.push(hub);
  });

  return {
    nodes,
    links,
    neighbors,
    stats: { alerts, resources: selected.length, hubs: hubs.size, links: links.length, truncated, skipped }
  };
}

/** The node itself plus its direct neighbours, used for hover/selection focus. */
export const focusSet = (graph: Pick<AlertGraph, 'neighbors'>, id: string | null | undefined): Set<string> | null => {
  if (!id) return null;
  const set = new Set<string>([id]);
  graph.neighbors.get(id)?.forEach(n => set.add(n));
  return set;
};

/** Copy x/y/z from a previous layout so a data refresh doesn't reshuffle the whole graph. */
export const preservePositions = (next: GraphNode[], previous: Map<string, GraphNode> | undefined): number => {
  if (!previous) return 0;
  let kept = 0;
  next.forEach(node => {
    const old = previous.get(node.id);
    if (old && old.x !== undefined) {
      node.x = old.x;
      node.y = old.y;
      node.z = old.z;
      kept++;
    }
  });
  return kept;
};

/**
 * Quotes a value for the Concert Operate alert filter language.
 * Assumption: single quotes are escaped by doubling, which matches SQL-style filters;
 * confirm against your cluster's filter grammar before relying on odd characters in names.
 */
export const quoteFilterValue = (value: string): string => `'${value.replace(/'/g, '\'\'')}'`;

/** Alert-list filter that reproduces what a node represents. */
export const buildFilterClause = (node: Pick<GraphNode, 'kind' | 'name'>): string => {
  const field = node.kind === 'resource' ? 'resource.name' : node.kind;
  return `${field} = ${quoteFilterValue(node.name)}`;
};

export const nodeTooltip = (node: GraphNode): string => {
  const lines = [
    `<strong>${escapeHtml(node.name)}</strong>`,
    escapeHtml(KIND_LABELS[node.kind])
  ];
  if (node.kind === 'resource') {
    lines.push(`${node.count} open alert${node.count === 1 ? '' : 's'}`);
    lines.push(`Highest severity: ${escapeHtml(severityLabel(node.severity))}`);
  } else {
    lines.push(`${node.count} linked resource${node.count === 1 ? '' : 's'}`);
  }
  return `<div class="force-graph-3d__tooltip">${lines.join('<br/>')}</div>`;
};
