/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Saved dashboards. They live in this browser's localStorage and move between browsers as a JSON file.
 * Everything read back is validated and clamped, so a hand-edited or old file cannot break the page.
 */

import { BarField, COND_OPS, Cond, CondOp, Dashboard, FilterBarConfig, GRID_COLS, QueryName, Widget, WidgetConfig } from './types';
import { clampBox, fitHeights } from './grid';
import { compactTree, MAX_DEPTH, slotOwner } from './nesting';
import { defaultConfig, isKnownType, minSize } from './registry';
import { isImageSrc } from './image';
import { isQuery, PLATFORM_ID } from './sources';

export const STORE_KEY = 'dashboard-builder:v1';
export const FILE_KIND = 'dashboard-builder';

export interface StoreState {
  version: 1;
  activeId: string;
  dashboards: Dashboard[];
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function widget(type: Widget['type'], title: string, x: number, y: number, w: number, h: number, cfg: Partial<WidgetConfig> & { query: QueryName }): Widget {
  return { id: newId('w'), type, title, x, y, w, h, config: { ...defaultConfig(type, cfg.query), ...cfg } };
}

/** What a first visit opens: an empty dashboard, so the start screen offers templates or a blank page. */
export function emptyDashboard(): Dashboard {
  return { id: newId('d'), name: 'New dashboard', updated: Date.now(), widgets: [] };
}

/** A starting point built only from live-bound widgets: every figure comes from the queries. */
export function starterDashboard(): Dashboard {
  return {
    id: newId('d'),
    name: 'Operations overview',
    updated: Date.now(),
    widgets: [
      widget('kpi', 'Open alerts', 0, 0, 3, 3, { query: 'getAlerts', metric: 'count' }),
      widget('kpi', 'Critical alerts', 3, 0, 3, 3, { query: 'getAlerts', metric: 'count', where: { field: 'severityLabel', value: 'Critical' } }),
      widget('kpi', 'Incidents', 6, 0, 3, 3, { query: 'getStories', metric: 'count' }),
      widget('kpi', 'Affected resources', 9, 0, 3, 3, { query: 'getAlerts', metric: 'distinct', valueField: 'resource' }),
      widget('bar', 'Alerts by severity', 0, 3, 4, 6, { query: 'getAlerts', groupBy: 'severityLabel' }),
      widget('donut', 'Alerts by state', 4, 3, 4, 6, { query: 'getAlerts', groupBy: 'state' }),
      widget('bar', 'Top resources', 8, 3, 4, 6, { query: 'getAlerts', groupBy: 'resource', limit: 8 }),
      widget('timeseries', 'Alerts over time', 0, 9, 12, 5, { query: 'getAlerts', timeField: 'firstOccurrence' }),
      widget('table', 'Alerts', 0, 14, 12, 8, { query: 'getAlerts' })
    ]
  };
}

function isObj(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback: string, max = 200): string {
  return typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback;
}

function numOr(v: unknown): number | undefined {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? n : undefined;
}

/** A JSON value kept to a sane size and depth (strings, finite numbers, booleans, null, arrays, records). Anything else is dropped. */
function jsonClean(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.slice(0, 2000);
  if (depth >= 6) return undefined;
  if (Array.isArray(v)) return v.slice(0, 200).map(x => jsonClean(x, depth + 1)).filter(x => x !== undefined);
  if (isObj(v)) {
    const o: Record<string, unknown> = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 100) break;
      if (k === '__proto__' || k === 'constructor' || k === 'prototype' || k.length > 64) continue;
      const c = jsonClean((v as Record<string, unknown>)[k], depth + 1);
      if (c !== undefined) { o[k] = c; n += 1; }
    }
    return o;
  }
  return undefined;
}

/** Options for a tile, passed to the embedded panel as props: at most 24 short names; strings, numbers, booleans, lists and records. */
export function sanitizeTileProps(raw: unknown): Record<string, unknown> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const key of Object.keys(raw)) {
    if (n >= 24) break;
    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(key) || key === 'constructor' || key === 'prototype') continue;
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'string') out[key] = v.slice(0, 500);
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
    else if (Array.isArray(v) || isObj(v)) { const c = jsonClean(v); if (c !== undefined) out[key] = c; else continue; }
    else continue;
    n += 1;
  }
  if (n === 0) return undefined;
  return JSON.stringify(out).length > 40000 ? undefined : out;
}

/** Values that replace constants written in a dashboard's code (see scaffold/config-runtime.ts), passed to the tile as the `settings` prop. */
export function sanitizeSettings(raw: unknown): Record<string, unknown> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const key of Object.keys(raw)) {
    if (n >= 40) break;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,47}$/.test(key) || key === 'constructor' || key === 'prototype' || key === '__proto__') continue;
    const c = jsonClean((raw as Record<string, unknown>)[key]);
    if (c === undefined) continue;
    out[key] = c; n += 1;
  }
  if (n === 0) return undefined;
  return JSON.stringify(out).length > 40000 ? undefined : out;
}

export function sanitizeConfig(raw: unknown, type: Widget['type']): WidgetConfig {
  const r = isObj(raw) ? raw : {};
  const query: QueryName = isQuery(r.query) ? r.query : 'getAlerts';
  const base = defaultConfig(type, query);
  const cfg: WidgetConfig = { ...base, query };
  if (typeof r.filter === 'string') cfg.filter = r.filter.slice(0, 500);
  if (typeof r.groupBy === 'string') cfg.groupBy = r.groupBy.slice(0, 80);
  if (typeof r.seriesBy === 'string') cfg.seriesBy = r.seriesBy.slice(0, 80);
  if (typeof r.valueField === 'string') cfg.valueField = r.valueField.slice(0, 80);
  if (typeof r.timeField === 'string') cfg.timeField = r.timeField.slice(0, 80);
  if (typeof r.sortBy === 'string') cfg.sortBy = r.sortBy.slice(0, 80);
  if (typeof r.sortDesc === 'boolean') cfg.sortDesc = r.sortDesc;
  if (r.overlay === true) cfg.overlay = true;
  if (typeof r.bg === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.bg)) cfg.bg = r.bg.toLowerCase();
  if (typeof r.fg === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.fg)) cfg.fg = r.fg.toLowerCase();
  if (r.followBar === false) cfg.followBar = false;
  if (r.pivot === false) cfg.pivot = false;
  if (r.resize === false) cfg.resize = false;
  if (r.notify === false) cfg.notify = false;
  if (typeof r.text === 'string') cfg.text = r.text.slice(0, 2000);
  if (typeof r.part === 'string') cfg.part = r.part.slice(0, 200);
  if (type === 'text' && typeof r.chromeless === 'boolean') cfg.chromeless = r.chromeless;
  if (type.startsWith('carbon:')) {
    const props = sanitizeTileProps(r.props);
    if (props) cfg.props = props;
    if (typeof r.chromeless === 'boolean') cfg.chromeless = r.chromeless;
  }
  if (type.startsWith('tile:')) {
    const props = sanitizeTileProps(r.props);
    if (props) cfg.props = props;
    const settings = sanitizeSettings(r.settings);
    if (settings) cfg.settings = settings;
    if (typeof r.chromeless === 'boolean') cfg.chromeless = r.chromeless;
  }
  if (type === 'image') {
    if (isImageSrc(r.src)) cfg.src = r.src;
    if (typeof r.alt === 'string') cfg.alt = r.alt.slice(0, 200);
    if (r.fit === 'cover' || r.fit === 'fill' || r.fit === 'contain') cfg.fit = r.fit;
  }
  if (['count', 'distinct', 'max', 'avg', 'sum'].includes(r.metric)) cfg.metric = r.metric;
  if (Array.isArray(r.columns)) cfg.columns = r.columns.filter((c: unknown) => typeof c === 'string').slice(0, 12);
  const limit = numOr(r.limit);
  if (limit !== undefined) cfg.limit = Math.min(Math.max(Math.round(limit), 1), 500);
  const refresh = numOr(r.refreshSeconds);
  if (refresh !== undefined) cfg.refreshSeconds = refresh <= 0 ? 0 : Math.min(Math.max(Math.round(refresh), 10), 3600);
  if (typeof r.emits === 'boolean') cfg.emits = r.emits;
  if (typeof r.listens === 'boolean') cfg.listens = r.listens;
  if (typeof r.hidden === 'boolean' && r.hidden) cfg.hidden = true;
  if (Array.isArray(r.on)) {
    const on = r.on.filter((l: unknown) => isObj(l) && typeof l.event === 'string' && typeof l.to === 'string' && typeof l.do === 'string' && l.event && l.to && l.do)
      .slice(0, 40).map((l: Record<string, unknown>) => ({
        event: String(l.event).slice(0, 40), to: String(l.to).slice(0, 80), do: String(l.do).slice(0, 80),
        ...(typeof l.arg === 'string' && l.arg ? { arg: l.arg.slice(0, 4000) } : {}),
        ...(typeof l.when === 'string' && l.when ? { when: l.when.slice(0, 200) } : {})
      }));
    if (on.length) cfg.on = on;
  }
  if (Array.isArray(r.sendTo)) cfg.sendTo = r.sendTo.filter((x: unknown) => typeof x === 'string').map((x: string) => x.slice(0, 80)).slice(0, 80);
  if (isObj(r.drill) && (r.drill.mode === 'details' || r.drill.mode === 'link')) {
    const u = typeof r.drill.url === 'string' ? r.drill.url.trim().slice(0, 500) : '';
    cfg.drill = { mode: r.drill.mode, ...(u && /^(https?:\/\/|\/|#)/i.test(u) ? { url: u } : {}), newTab: r.drill.newTab !== false };
  }
  if (isObj(r.bind) && typeof r.bind.field === 'string' && r.bind.field) {
    const b = r.bind;
    cfg.bind = { field: b.field.slice(0, 80), op: COND_OPS.includes(b.op) ? (b.op as CondOp) : '=', query: isQuery(b.query) ? b.query : 'getAlerts' };
  }
  const cond = (x: any): Cond | undefined => (isObj(x) && typeof x.field === 'string' && typeof x.value === 'string'
    ? { field: x.field.slice(0, 80), value: x.value.slice(0, 200), ...(COND_OPS.includes(x.op) && x.op !== '=' ? { op: x.op as CondOp } : {}) }
    : undefined);
  const w1 = cond(r.where);
  if (w1) cfg.where = w1;
  if (Array.isArray(r.also)) {
    const more = r.also.map(cond).filter((x: Cond | undefined): x is Cond => !!x).slice(0, 8);
    if (more.length) cfg.also = more;
  }
  return cfg;
}

/** Returns a clean dashboard and how many widgets had to be dropped (unknown type, not an object). */
const BAR_PRESETS = ['all', '15m', '1h', '6h', '24h', '7d', '30d', 'custom'];
export function sanitizeBar(raw: unknown): FilterBarConfig | undefined {
  if (!isObj(raw)) return undefined;
  const fields: BarField[] = [];
  (Array.isArray(raw.fields) ? raw.fields : []).slice(0, 12).forEach((f: unknown) => {
    if (isObj(f) && (f.query === 'getAlerts' || f.query === 'getStories') && typeof f.field === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(f.field) && !fields.some(x => x.query === f.query && x.field === f.field)) fields.push({ query: f.query, field: f.field });
  });
  const bar: FilterBarConfig = { fields };
  if (raw.time === true) bar.time = true;
  if (raw.timeField === 'firstOccurrence' || raw.timeField === 'lastOccurrence') bar.timeField = raw.timeField;
  if (typeof raw.preset === 'string' && BAR_PRESETS.includes(raw.preset) && raw.preset !== 'custom') bar.preset = raw.preset as FilterBarConfig['preset'];
  if (Number.isFinite(Number(raw.refresh)) && Number(raw.refresh) > 0) bar.refresh = Math.min(Math.max(Math.round(Number(raw.refresh)), 5), 3600);
  return bar;
}

export function sanitizeDashboard(raw: unknown): { dashboard: Dashboard; dropped: number } | null {
  if (!isObj(raw) || !Array.isArray(raw.widgets)) return null;
  let dropped = 0;
  const widgets: Widget[] = [];
  const seen = new Set<string>();
  raw.widgets.forEach((w: unknown) => {
    if (!isObj(w) || typeof w.type !== 'string' || !isKnownType(w.type)) {
      dropped++;
      return;
    }
    const type = w.type;
    let id = typeof w.id === 'string' && w.id ? w.id : newId('w');
    if (seen.has(id)) id = newId('w');
    seen.add(id);
    const { minW, minH } = minSize(type);
    const box = clampBox({ id, x: Number(w.x) || 0, y: Number(w.y) || 0, w: Number(w.w) || 4, h: Number(w.h) || 4 }, minW, minH);
    widgets.push({
      id,
      type,
      title: str(w.title, 'Widget', 120),
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      config: sanitizeConfig(w.config, type),
      ...(typeof w.parent === 'string' && /^[A-Za-z0-9_-]{1,80}#\d{1,2}$/.test(w.parent) ? { parent: w.parent } : {})
    });
  });
  // A widget whose container is gone (or that sits inside itself) goes back to the top level.
  const ids = new Set(widgets.map(x => x.id));
  widgets.forEach(x => {
    if (!x.parent) return;
    let cur: Widget | undefined = x; let n = 0; let ok = true;
    while (cur && cur.parent && n < MAX_DEPTH + 2) { const o = slotOwner(cur.parent); if (!ids.has(o) || o === cur.id) { ok = false; break; } cur = widgets.find(y => y.id === o); n++; }
    if (!ok || n >= MAX_DEPTH + 2) delete x.parent;
  });
  widgets.forEach(x => { if (x.config.sendTo) { const s = x.config.sendTo.filter(t => ids.has(t) && t !== x.id); if (s.length) x.config.sendTo = s; else delete x.config.sendTo; } });
  widgets.forEach(x => { if (x.config.on) { const k = x.config.on.filter(l => (ids.has(l.to) || l.to === PLATFORM_ID) && l.to !== x.id); if (k.length) x.config.on = k; else delete x.config.on; } });
  const rowN = Number(raw.rowH);
  const laid = fitHeights(compactTree(widgets), Number.isFinite(rowN) && rowN > 0 ? Math.min(Math.max(Math.round(rowN), 24), 96) : undefined);
  return {
    dashboard: { id: str(raw.id, newId('d'), 80), name: str(raw.name, 'Imported dashboard', 80), updated: Date.now(), widgets: laid, ...(sanitizeBar(raw.bar) ? { bar: sanitizeBar(raw.bar) } : {}), ...(Number.isFinite(Number(raw.rowH)) && Number(raw.rowH) > 0 ? { rowH: Math.min(Math.max(Math.round(Number(raw.rowH)), 24), 96) } : {}) },
    dropped
  };
}

export function loadState(storage?: KV, seed?: Dashboard | null): StoreState {
  try {
    const kv = storage || (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const text = kv ? kv.getItem(STORE_KEY) : null;
    if (text) {
      const parsed = JSON.parse(text);
      if (isObj(parsed) && Array.isArray(parsed.dashboards)) {
        const dashboards: Dashboard[] = [];
        parsed.dashboards.forEach((d: unknown) => {
          const s = sanitizeDashboard(d);
          if (s) dashboards.push({ ...s.dashboard, updated: isObj(d) && Number.isFinite(Number(d.updated)) ? Number(d.updated) : s.dashboard.updated });
        });
        if (dashboards.length > 0) {
          const active = dashboards.some(d => d.id === parsed.activeId) ? parsed.activeId : dashboards[0].id;
          return { version: 1, activeId: active, dashboards };
        }
      }
    }
  } catch (e) {
    // Fall through to a fresh state: unreadable storage must never block the page.
  }
  // First visit in this browser: an empty dashboard (or the seed the caller passes).
  const starter = seed || emptyDashboard();
  return { version: 1, activeId: starter.id, dashboards: [starter] };
}

/** The layout shipped with the bundle (from Concert Workbench), cleaned and given fresh ids; null when there is none. */
export function sharedDashboard(raw: unknown): Dashboard | null {
  if (raw === null || raw === undefined) return null;
  const body = isObj(raw) && raw.kind === FILE_KIND ? raw.dashboard : raw;
  const s = sanitizeDashboard(body);
  if (!s || s.dashboard.widgets.length === 0) return null;
  return { ...s.dashboard, id: newId('d'), widgets: copyIds(s.dashboard.widgets) };
}

/** Returns false when the browser refused the write (private mode, quota). */
export function saveState(state: StoreState, storage?: KV): boolean {
  try {
    const kv = storage || (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (!kv) return false;
    kv.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function exportJson(d: Dashboard): string {
  return JSON.stringify({ kind: FILE_KIND, version: 1, dashboard: d }, null, 2);
}

export function importJson(text: string): { dashboard: Dashboard; dropped: number } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: 'That file is not valid JSON.' };
  }
  const body = isObj(parsed) && parsed.kind === FILE_KIND ? parsed.dashboard : parsed;
  const s = sanitizeDashboard(body);
  if (!s) return { error: 'That file does not look like a dashboard exported from this builder.' };
  // Fresh ids so an import never overwrites a dashboard that is already saved.
  return { dashboard: { ...s.dashboard, id: newId('d') }, dropped: s.dropped };
}

/** New ids for every widget; parents and wiring are renamed to match. */
function copyIds(widgets: Widget[]): Widget[] {
  const map = new Map<string, string>();
  widgets.forEach(w => map.set(w.id, newId('w')));
  return widgets.map(w => ({
    ...w,
    id: map.get(w.id) as string,
    ...(w.parent && map.has(slotOwner(w.parent)) ? { parent: `${map.get(slotOwner(w.parent))}#${w.parent.split('#')[1]}` } : {}),
    config: { ...w.config, ...(w.config.sendTo ? { sendTo: w.config.sendTo.map(t => map.get(t) || t) } : {}), ...(w.config.on ? { on: w.config.on.map(l => ({ ...l, to: map.get(l.to) || l.to })) } : {}) }
  }));
}

export function cloneDashboard(d: Dashboard, name?: string): Dashboard {
  return {
    ...d,
    id: newId('d'),
    name: name || `${d.name} (copy)`,
    updated: Date.now(),
    widgets: copyIds(d.widgets)
  };
}

export { GRID_COLS };
