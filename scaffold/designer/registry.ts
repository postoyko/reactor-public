/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeType, QueryName, WidgetConfig, WidgetType } from './types';
import { DEFAULT_GROUP, DEFAULT_TIME, fieldsOf } from './rows';
import { shapeOf } from './sources';
import { EXTRA_TILES } from './tiles-extra';
import { carbonSpec as carbonDef } from './carbon-specs';

export interface NativeDef {
  type: NativeType;
  label: string;
  description: string;
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export const NATIVE: NativeDef[] = [
  { type: 'kpi', label: 'Number', description: 'One figure: a count, distinct count, max, average or sum.', w: 3, h: 3, minW: 2, minH: 2 },
  { type: 'bar', label: 'Bar chart', description: 'Rows grouped by a field. Click a bar to filter other widgets.', w: 4, h: 6, minW: 3, minH: 3 },
  { type: 'donut', label: 'Donut', description: 'Share per group. Click a slice to filter other widgets.', w: 4, h: 6, minW: 3, minH: 4 },
  { type: 'timeseries', label: 'Timeline', description: 'Rows counted over time (first occurrence, created and so on).', w: 6, h: 5, minW: 3, minH: 3 },
  { type: 'table', label: 'Table', description: 'The rows themselves, with the columns you pick.', w: 6, h: 8, minW: 3, minH: 3 },
  { type: 'image', label: 'Image', description: 'A picture (PNG, JPEG, GIF, WebP, SVG, BMP) kept inside the dashboard.', w: 4, h: 5, minW: 1, minH: 1 },
  { type: 'group', label: 'Container', description: 'A panel with its own grid that holds other widgets.', w: 6, h: 6, minW: 3, minH: 3 },
  { type: 'text', label: 'Note', description: 'Free text: a heading or a short explanation.', w: 4, h: 2, minW: 2, minH: 1 }
];

/**
 * Existing toolkit panels that can be dropped in as tiles. `id` names the panel module in src/panels/.
 * A tile fetches its own data and does not take part in cross-filtering.
 */
export interface TileDef {
  id: string;
  label: string;
  description: string;
  w: number;
  h: number;
}

const BUILTIN_TILES: TileDef[] = [
  { id: 'telco-causal-gen2', label: 'Telco Causal Mesh (Gen 2)', description: 'Topology, insight views and replay. Give it at least 8 x 14 cells.', w: 12, h: 16 },
  { id: 'telco-causal', label: 'Telco Causal Mesh (original)', description: '3D mesh and signal observatory.', w: 12, h: 14 },
  { id: 'telco-command', label: 'Telco Command Center', description: '360-degree operations view.', w: 12, h: 14 },
  { id: 'incident-dashboard', label: 'Incident & Alert Dashboard', description: 'Incident and alert KPIs, charts and table.', w: 12, h: 14 },
  { id: 'cognitive-deep-dive', label: 'Cognitive Deep Dive', description: 'Investigation view.', w: 12, h: 14 },
  { id: 'top-n', label: 'Top N (alerts)', description: 'Top alert groups.', w: 6, h: 8 },
  { id: 'top-n-incidents', label: 'Top N (incidents)', description: 'Top incident groups.', w: 6, h: 8 },
  { id: 'application-heatmap', label: 'Application Heatmap', description: 'Heatmap by application.', w: 6, h: 8 },
  { id: 'incidents-pie-chart', label: 'Incident Pie Chart', description: 'Incidents by group.', w: 4, h: 7 },
  { id: 'monitor-boxes', label: 'Monitor Boxes', description: 'Alert counts per saved filter.', w: 8, h: 6 },
  { id: 'alerts-workflow', label: 'Alerts Workflow', description: 'Alert status groups.', w: 8, h: 8 }
];

export const TILES: TileDef[] = [...BUILTIN_TILES];

/** Adds tiles for panels that are not in the built-in list (ignored when the id is already known). */
export function registerExtraTiles(list: TileDef[]): void {
  list.forEach(t => {
    if (t && typeof t.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(t.id) && !TILES.some(x => x.id === t.id)) TILES.push(t);
  });
}
registerExtraTiles(EXTRA_TILES);

export function tileDef(type: WidgetType): TileDef | undefined {
  return type.startsWith('tile:') ? TILES.find(t => `tile:${t.id}` === type) : undefined;
}

export function nativeDef(type: WidgetType): NativeDef | undefined {
  return NATIVE.find(n => n.type === type);
}

export function isKnownType(type: string): type is WidgetType {
  return NATIVE.some(n => n.type === type) || TILES.some(t => `tile:${t.id}` === type) || !!carbonDef(type);
}

export function isNative(type: WidgetType): type is NativeType {
  return NATIVE.some(n => n.type === type);
}

export function minSize(type: WidgetType): { minW: number; minH: number } {
  const n = nativeDef(type);
  if (n) return { minW: n.minW, minH: n.minH };
  const c = carbonDef(type);
  return c ? { minW: c.minW || 2, minH: c.minH || 2 } : { minW: 2, minH: 2 };
}

/** The first columns of a new table for a source. */
export function defaultColumns(query: QueryName): string[] {
  const shape = shapeOf(query);
  if (shape === 'alerts') return ['severityLabel', 'resource', 'summary', 'state'];
  if (shape === 'stories') return ['priority', 'title', 'state', 'team'];
  return fieldsOf(query).slice(0, 4).map(f => f.key);
}

export function defaultConfig(type: WidgetType, query: QueryName = 'getAlerts'): WidgetConfig {
  const base: WidgetConfig = { query, emits: true, listens: true };
  switch (type) {
    case 'kpi': return { ...base, metric: 'count' };
    case 'bar': return { ...base, groupBy: DEFAULT_GROUP[query], metric: 'count', limit: 8 };
    case 'donut': return { ...base, groupBy: shapeOf(query) === 'alerts' || shapeOf(query) === 'stories' ? 'state' : DEFAULT_GROUP[query], metric: 'count', limit: 6 };
    case 'timeseries': return { ...base, timeField: DEFAULT_TIME[query], emits: false };
    case 'table': return {
      ...base,
      emits: false,
      limit: 50,
      columns: defaultColumns(query)
    };
    case 'text': return { ...base, text: 'Notes', emits: false, listens: false };
    case 'image': return { ...base, emits: false, listens: false, fit: 'contain' };
    case 'group': return { ...base, emits: false, listens: false };
    case 'carbon:PeoplePicker': return { ...base, groupBy: 'owner', emits: true, listens: true };
    default: {
      const c = carbonDef(type);
      if (c) return { ...base, query: query === 'getAlerts' && c.query ? c.query : query, emits: c.emits === true, listens: c.uses === 'rows' || c.uses === 'values' || c.uses === 'measure' || c.uses === 'chart' };
      return { ...base, emits: false, listens: false };
    }
  }
}

export function defaultTitle(type: WidgetType): string {
  const n = nativeDef(type);
  if (n) return n.label;
  const t = tileDef(type);
  if (t) return t.label;
  const c = carbonDef(type);
  return c ? c.label : 'Widget';
}
