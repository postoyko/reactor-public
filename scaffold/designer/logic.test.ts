/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { compact, findSpot, moveItem, overlaps, resizeItem, clampBox, gridHeight } from './grid';
import { alertRows, incidentRows, groupMetric, metricValue, timeBins, applyFilters, orderSeverity } from './rows';
import { sanitizeDashboard, importJson, exportJson, starterDashboard, loadState, saveState, cloneDashboard, STORE_KEY } from './store';
import { DataHub, MAX_ROWS, sourceKey } from './datahub';
import { Box } from './types';

const b = (id: string, x: number, y: number, w: number, h: number): Box => ({ id, x, y, w, h });
const noOverlap = (items: Box[]) => items.every(a => items.every(c => !overlaps(a, c)));

describe('grid', () => {
  it('compacts upward and leaves no overlaps', () => {
    const out = compact([b('a', 0, 5, 4, 2), b('b', 0, 9, 4, 2), b('c', 6, 3, 4, 2)]);
    expect(out.find(i => i.id === 'a')!.y).toBe(0);
    expect(out.find(i => i.id === 'b')!.y).toBe(2);
    expect(out.find(i => i.id === 'c')!.y).toBe(0);
    expect(noOverlap(out)).toBe(true);
  });
  it('moving onto another item pushes it down', () => {
    const start = [b('a', 0, 0, 4, 3), b('b', 4, 0, 4, 3)];
    const out = moveItem(start, 'b', 0, 0);
    expect(out.find(i => i.id === 'b')).toMatchObject({ x: 0, y: 0 });
    expect(out.find(i => i.id === 'a')!.y).toBe(3);
    expect(noOverlap(out)).toBe(true);
  });
  it('clamps to the 12 columns and a minimum size', () => {
    expect(clampBox(b('a', 20, -3, 30, 0))).toMatchObject({ x: 0, y: 0, w: 12, h: 2 });
    expect(clampBox(b('a', 11, 0, 4, 3))).toMatchObject({ x: 8, w: 4 });
  });
  it('resizing grows into a neighbour by pushing it', () => {
    const out = resizeItem([b('a', 0, 0, 4, 3), b('b', 0, 3, 4, 3)], 'a', 4, 6);
    expect(out.find(i => i.id === 'b')!.y).toBe(6);
    expect(noOverlap(out)).toBe(true);
  });
  it('respects a per-type minimum on resize', () => {
    expect(resizeItem([b('a', 0, 0, 4, 4)], 'a', 1, 1, 3, 3)[0]).toMatchObject({ w: 3, h: 3 });
  });
  it('finds the first free spot, then the bottom', () => {
    const items = [b('a', 0, 0, 6, 3)];
    expect(findSpot(items, 6, 3)).toEqual({ x: 6, y: 0 });
    expect(findSpot([b('a', 0, 0, 12, 3)], 4, 2)).toEqual({ x: 0, y: 3 });
    expect(gridHeight([b('a', 0, 2, 4, 5)])).toBe(7);
  });
  it('is stable: compacting twice changes nothing', () => {
    const once = compact([b('a', 0, 4, 5, 2), b('b', 3, 1, 6, 3), b('c', 8, 8, 4, 2)]);
    expect(compact(once)).toEqual(once);
  });
});

const alertData = {
  tenant: {
    alerts: {
      columns: [{ name: 'id' }, { name: 'severity' }, { name: 'state' }, { name: 'resource.name' }, { name: 'summary' }, { name: 'firstOccurrenceTime' }],
      rows: [
        { fields: ['a1', '6', 'open', 'upf-1', 'down', '2026-01-01T00:00:00Z'] },
        { fields: ['a2', '5', 'open', 'upf-1', 'slow', '2026-01-01T01:00:00Z'] },
        { fields: ['a3', '6', 'ack', null, 'down', '2026-01-01T02:00:00Z'] },
        { fields: [null, '3', 'open', 'x', 'no id', null] }
      ]
    }
  }
};

describe('rows', () => {
  it('maps alert columns by name, labels severity and drops rows without an id', () => {
    const rows = alertRows(alertData);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: 'a1', severity: 6, severityLabel: 'Critical', resource: 'upf-1' });
    expect(rows[2].resource).toBeUndefined();
  });
  it('survives junk responses', () => {
    expect(alertRows(undefined)).toEqual([]);
    expect(alertRows({ tenant: { alerts: { columns: 5, rows: 'x' } } })).toEqual([]);
    expect(incidentRows({ tenant: { stories: 'x' } })).toEqual([]);
  });
  it('reads incidents from both response shapes', () => {
    const s = { id: 's1', priority: '1', state: 'open', alertIds: ['a', 'b'], title: 'T' };
    expect(incidentRows({ tenant: { stories: [s] } })[0]).toMatchObject({ id: 's1', priority: 1, alertCount: 2 });
    expect(incidentRows({ tenant: { stories: { stories: [s, null] } } })).toHaveLength(1);
  });
  it('groups, counts missing values as (none), and folds the tail into Other', () => {
    const rows = alertRows(alertData);
    const g = groupMetric(rows, 'resource');
    expect(g[0]).toEqual({ key: 'upf-1', value: 2 });
    expect(g.find(x => x.key === '(none)')!.value).toBe(1);
    const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i), t: `g${i}` }));
    const folded = groupMetric(many, 't', 'count', undefined, 4);
    expect(folded).toHaveLength(4);
    expect(folded[3].key).toBe('Other (7)');
    expect(folded.reduce((a, c) => a + c.value, 0)).toBe(10);
  });
  it('orders severity Critical first', () => {
    const ord = orderSeverity(groupMetric(alertRows(alertData), 'severityLabel')).map(x => x.key);
    expect(ord).toEqual(['Critical', 'Major']);
  });
  it('metrics: undefined when there is nothing numeric to compute', () => {
    const rows = alertRows(alertData);
    expect(metricValue(rows, 'count')).toBe(3);
    expect(metricValue(rows, 'distinct', 'resource')).toBe(1);
    expect(metricValue(rows, 'max', 'severity')).toBe(6);
    expect(metricValue(rows, 'avg', 'severity')).toBeCloseTo(17 / 3);
    expect(metricValue(rows, 'max', 'summary')).toBeUndefined();
    expect(metricValue([], 'avg', 'severity')).toBeUndefined();
    expect(metricValue(rows, 'sum')).toBeUndefined();
  });
  it('bins by time and reports rows with no time', () => {
    const r = timeBins(alertRows({ ...alertData }).concat([{ id: 'z' }]), 'firstOccurrence', 4);
    expect(r.missing).toBe(1);
    expect(r.bins).toHaveLength(4);
    expect(r.bins.reduce((a, c) => a + c.value, 0)).toBe(3);
    expect(timeBins([], 'firstOccurrence').bins).toEqual([]);
    expect(timeBins([{ id: 'a', t: '2026-01-01T00:00:00Z' }], 't').bins).toHaveLength(1);
  });
  it('filters: OR within a field, AND across fields', () => {
    const rows = alertRows(alertData);
    expect(applyFilters(rows, [])).toBe(rows);
    expect(applyFilters(rows, [{ field: 'severityLabel', value: 'Critical' }])).toHaveLength(2);
    expect(applyFilters(rows, [{ field: 'severityLabel', value: 'Critical' }, { field: 'severityLabel', value: 'Major' }])).toHaveLength(3);
    expect(applyFilters(rows, [{ field: 'severityLabel', value: 'Critical' }, { field: 'state', value: 'ack' }])).toHaveLength(1);
    expect(applyFilters(rows, [{ field: 'resource', value: '(none)' }])).toHaveLength(1);
  });
});

describe('store', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null), setItem: (k: string, v: string) => { m.set(k, v); }, m };
  };
  it('starter dashboard is valid, overlap-free and bound only to known fields', () => {
    const d = starterDashboard();
    expect(noOverlap(d.widgets)).toBe(true);
    expect(d.widgets.length).toBeGreaterThan(5);
    const s = sanitizeDashboard(d)!;
    expect(s.dropped).toBe(0);
    expect(s.dashboard.widgets.map(w => w.type)).toEqual(d.widgets.map(w => w.type));
  });
  it('round-trips through export / import with fresh ids', () => {
    const d = starterDashboard();
    const r = importJson(exportJson(d));
    if ('error' in r) throw new Error(r.error);
    expect(r.dashboard.id).not.toBe(d.id);
    expect(r.dashboard.widgets).toHaveLength(d.widgets.length);
    expect(r.dropped).toBe(0);
  });
  it('rejects non-dashboards and drops unknown widget types, clamping the rest', () => {
    expect('error' in importJson('not json')).toBe(true);
    expect('error' in importJson('{"a":1}')).toBe(true);
    const r = importJson(JSON.stringify({ name: 'x', widgets: [
      { type: 'nope', x: 0, y: 0, w: 3, h: 3 },
      { type: 'kpi', title: 'T', x: 99, y: -5, w: 99, h: 0, config: { query: 'getStories', limit: 99999, refreshSeconds: 2 } },
      'junk'
    ] }));
    if ('error' in r) throw new Error(r.error);
    expect(r.dropped).toBe(2);
    expect(r.dashboard.widgets).toHaveLength(1);
    expect(r.dashboard.widgets[0]).toMatchObject({ x: 0, y: 0, w: 12 });
    expect(r.dashboard.widgets[0].config).toMatchObject({ query: 'getStories', refreshSeconds: 10 });
  });
  it('de-duplicates widget ids', () => {
    const s = sanitizeDashboard({ widgets: [{ id: 'a', type: 'kpi', x: 0, y: 0, w: 2, h: 2 }, { id: 'a', type: 'kpi', x: 4, y: 0, w: 2, h: 2 }] })!;
    expect(new Set(s.dashboard.widgets.map(w => w.id)).size).toBe(2);
  });
  it('saves and loads, and falls back to the starter on bad storage', () => {
    const kv = mem();
    const st = loadState(kv);
    expect(st.dashboards).toHaveLength(1);
    expect(saveState(st, kv)).toBe(true);
    expect(loadState(kv).activeId).toBe(st.activeId);
    kv.setItem(STORE_KEY, '{broken');
    expect(loadState(kv).dashboards).toHaveLength(1);
    expect(saveState(st, { getItem: () => null, setItem: () => { throw new Error('quota'); } })).toBe(false);
  });
  it('clones with new ids', () => {
    const d = starterDashboard();
    const c = cloneDashboard(d);
    expect(c.id).not.toBe(d.id);
    expect(c.widgets[0].id).not.toBe(d.widgets[0].id);
    expect(c.name).toContain('copy');
  });
});

describe('datahub', () => {
  const tick = () => new Promise(r => setTimeout(r, 0));
  it('shares one fetch per source and delivers rows', async () => {
    const calls: string[] = [];
    const hub = new DataHub(async (q) => { calls.push(q); return alertData; }, 't1');
    let n1 = 0; let n2 = 0;
    const r1 = hub.acquire('getAlerts', undefined, 0, () => { n1++; });
    const r2 = hub.acquire('getAlerts', '', 0, () => { n2++; });
    await tick();
    expect(calls).toEqual(['getAlerts']);
    const key = sourceKey('getAlerts');
    expect(hub.snapshot(key).rows).toHaveLength(3);
    expect(hub.snapshot(key).loading).toBe(false);
    expect(n1).toBeGreaterThan(0);
    expect(n2).toBeGreaterThan(0);
    r1(); r2();
    expect(hub.snapshot(key).rows).toHaveLength(0);
  });
  it('keeps the last rows and reports the error when a refresh fails', async () => {
    let fail = false;
    const hub = new DataHub(async () => { if (fail) throw new Error('boom'); return alertData; }, 't1');
    const rel = hub.acquire('getAlerts', undefined, 0, () => {});
    await tick();
    fail = true;
    hub.refresh();
    await tick();
    const s = hub.snapshot(sourceKey('getAlerts'));
    expect(s.error).toBe('boom');
    expect(s.rows).toHaveLength(3);
    rel();
  });
  it('runs one load at a time: a refresh while a load runs waits for it', async () => {
    const resolvers: Array<(v: any) => void> = [];
    const hub = new DataHub(() => new Promise(res => { resolvers.push(res); }), 't1');
    const rel = hub.acquire('getAlerts', undefined, 0, () => {});
    hub.refresh();
    expect(resolvers).toHaveLength(1);
    resolvers[0]({ tenant: { alerts: { columns: [{ name: 'id' }], rows: [{ fields: ['old'] }] } } });
    await tick();
    hub.refresh();
    expect(resolvers).toHaveLength(2);
    resolvers[1]({ tenant: { alerts: { columns: [{ name: 'id' }], rows: [{ fields: ['new'] }] } } });
    await tick();
    expect(hub.snapshot(sourceKey('getAlerts')).rows.map(r => r.id)).toEqual(['new']);
    rel();
  });
  it('ignores an answer that arrives after its source was released', async () => {
    const resolvers: Array<(v: any) => void> = [];
    const hub = new DataHub(() => new Promise(res => { resolvers.push(res); }), 't1');
    let calls = 0;
    const rel = hub.acquire('getAlerts', undefined, 0, () => { calls++; });
    const before = calls;
    rel();
    resolvers[0]({ tenant: { alerts: { columns: [{ name: 'id' }], rows: [{ fields: ['late'] }] } } });
    await tick();
    expect(calls).toBe(before);
    expect(hub.snapshot(sourceKey('getAlerts')).rows).toEqual([]);
  });
  it('keeps at most MAX_ROWS rows and says how many there were', async () => {
    const many = Array.from({ length: MAX_ROWS + 7 }, (_, i) => ({ fields: [`a${i}`] }));
    const hub = new DataHub(async () => ({ tenant: { alerts: { columns: [{ name: 'id' }], rows: many } } }), 't1');
    const rel = hub.acquire('getAlerts', undefined, 0, () => {});
    await tick();
    const st = hub.snapshot(sourceKey('getAlerts'));
    expect(st.rows).toHaveLength(MAX_ROWS);
    expect(st.truncated).toBe(MAX_ROWS + 7);
    rel();
  });
  it('uses the tenant and the right params per query, and survives a throwing fetcher', async () => {
    const seen: any[] = [];
    const hub = new DataHub(async (q, p) => { seen.push([q, p]); return {}; }, 'tenant-x');
    const r1 = hub.acquire('getAlerts', 'severity > 3', 0, () => {});
    const r2 = hub.acquire('getStories', undefined, 0, () => {});
    await tick();
    expect(seen[0][1]).toMatchObject({ tenantId: 'tenant-x', filter: 'severity > 3' });
    expect(seen[1][1]).toMatchObject({ tenantId: 'tenant-x' });
    r1(); r2();
    const bad = new DataHub(() => { throw new Error('sync'); }, 't');
    const r3 = bad.acquire('getAlerts', undefined, 0, () => {});
    await tick();
    expect(bad.snapshot(sourceKey('getAlerts')).error).toBe('sync');
    r3();
  });
});

import { sharedDashboard, loadState as loadSt } from './store';
describe('shared default layout', () => {
  const raw = { kind: 'dashboard-builder', version: 1, dashboard: { id: 'x', name: 'Shared', widgets: [
    { id: 'a', type: 'kpi', title: 'K', x: 0, y: 0, w: 3, h: 3, config: { query: 'getAlerts' } },
    { id: 'b', type: 'tile:telco-causal-gen2', title: 'T', x: 0, y: 3, w: 12, h: 16, config: { query: 'getAlerts' } },
    { id: 'c', type: 'nonsense', title: 'bad', x: 0, y: 0, w: 1, h: 1, config: {} }
  ] } };
  it('null / junk / empty give null', () => {
    expect(sharedDashboard(null)).toBeNull();
    expect(sharedDashboard(undefined)).toBeNull();
    expect(sharedDashboard({ kind: 'dashboard-builder', dashboard: { widgets: [] } })).toBeNull();
    expect(sharedDashboard('x')).toBeNull();
  });
  it('cleans the layout, drops unknown widgets and gives fresh ids', () => {
    const d = sharedDashboard(raw)!;
    expect(d.name).toBe('Shared');
    expect(d.widgets.map(w => w.type)).toEqual(['kpi', 'tile:telco-causal-gen2']);
    expect(d.widgets[0].id).not.toBe('a');
  });
  it('is used on first visit only', () => {
    const mem: Record<string, string> = {};
    const kv = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; } };
    const seed = sharedDashboard(raw)!;
    expect(loadSt(kv, seed).dashboards[0].name).toBe('Shared');
    kv.setItem('dashboard-builder:v1', JSON.stringify({ version: 1, activeId: 'm', dashboards: [{ id: 'm', name: 'Mine', widgets: [{ id: 'q', type: 'kpi', title: 'k', x: 0, y: 0, w: 3, h: 3, config: {} }] }] }));
    expect(loadSt(kv, seed).dashboards[0].name).toBe('Mine');
  });
});

import { TILES, registerExtraTiles, isKnownType } from './registry';
describe('extra tiles', () => {
  it('adds new tile types, ignores duplicates and bad ids', () => {
    const before = TILES.length;
    expect(isKnownType('tile:my-panel')).toBe(false);
    registerExtraTiles([{ id: 'my-panel', label: 'Mine', description: '', w: 6, h: 6 }, { id: 'top-n', label: 'dup', description: '', w: 1, h: 1 }, { id: '../x', label: 'bad', description: '', w: 1, h: 1 }]);
    expect(TILES.length).toBe(before + 1);
    expect(isKnownType('tile:my-panel')).toBe(true);
    expect(isKnownType('tile:../x')).toBe(false);
    expect(TILES.filter(t => t.id === 'top-n').length).toBe(1);
  });
  it('a layout using an extra tile survives sanitize once registered', () => {
    registerExtraTiles([{ id: 'late-panel', label: 'L', description: '', w: 6, h: 6 }]);
    const s = sanitizeDashboard({ name: 'x', widgets: [{ type: 'tile:late-panel', title: 'T', x: 0, y: 0, w: 12, h: 8, config: {} }] });
    expect(s && s.dashboard.widgets.length).toBe(1);
  });
});

describe('tile part note', () => {
  it('survives sanitize and is capped', () => {
    const s = sanitizeDashboard({ name: 'x', widgets: [{ type: 'tile:top-n', title: 'T', x: 0, y: 0, w: 12, h: 8, config: { part: 'p'.repeat(500) } }] });
    expect(s && (s.dashboard.widgets[0].config as any).part.length).toBe(200);
  });
});

import { isImageSrc, imageMimeOk, IMAGE_MAX_CHARS } from './image';
describe('image widget', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  it('accepts web image data URIs only', () => {
    expect(isImageSrc(PNG)).toBe(true);
    expect(isImageSrc('data:image/svg+xml;base64,PHN2Zy8+')).toBe(true);
    expect(isImageSrc('data:image/tiff;base64,AAAA')).toBe(false);
    expect(isImageSrc('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isImageSrc('https://example.com/a.png')).toBe(false);
    expect(isImageSrc('javascript:alert(1)')).toBe(false);
    expect(isImageSrc('data:image/png;base64,AAAA"onerror="x')).toBe(false);
    expect(isImageSrc('data:image/png;base64,' + 'A'.repeat(IMAGE_MAX_CHARS))).toBe(false);
    expect(isImageSrc(42)).toBe(false);
  });
  it('mime check', () => { expect(imageMimeOk('image/png')).toBe(true); expect(imageMimeOk('image/tiff')).toBe(false); });
  it('image config survives sanitize; bad src is dropped; fit is limited', () => {
    const ok = sanitizeDashboard({ name: 'x', widgets: [{ type: 'image', title: 'Logo', x: 0, y: 0, w: 4, h: 4, config: { src: PNG, alt: 'a'.repeat(400), fit: 'cover' } }] })!;
    const c = ok.dashboard.widgets[0].config as any;
    expect(c.src).toBe(PNG); expect(c.alt.length).toBe(200); expect(c.fit).toBe('cover');
    const bad = sanitizeDashboard({ name: 'x', widgets: [{ type: 'image', title: 'L', x: 0, y: 0, w: 4, h: 4, config: { src: 'http://evil/x.png', fit: 'zoom' } }] })!;
    const b = bad.dashboard.widgets[0].config as any;
    expect(b.src).toBeUndefined(); expect(b.fit).toBe('contain');
  });
  it('a non-image widget never keeps a src', () => {
    const s = sanitizeDashboard({ name: 'x', widgets: [{ type: 'kpi', title: 'K', x: 0, y: 0, w: 3, h: 3, config: { src: PNG } }] })!;
    expect((s.dashboard.widgets[0].config as any).src).toBeUndefined();
  });
});

describe('tile props', () => {
  const tile = (props: unknown, type = 'tile:top-n') => sanitizeDashboard({ name: 'x', widgets: [{ type, title: 'T', x: 0, y: 0, w: 12, h: 8, config: { props } }] })!.dashboard.widgets[0].config as any;
  it('keeps flat string / number / boolean options on a tile', () => {
    expect(tile({ part: 'services', limit: 5, compact: true }).props).toEqual({ part: 'services', limit: 5, compact: true });
  });
  it('keeps lists and records; drops functions, bad names and non-finite numbers', () => {
    const p = tile({ ok: 'yes', nested: { a: 1, f: () => 1 }, list: [1, NaN], fn: () => 1, 'bad-name': 'x', '1abc': 'x', __proto__x: 'x', n: Infinity, nan: NaN }).props;
    expect(p).toEqual({ ok: 'yes', nested: { a: 1 }, list: [1] });
  });
  it('caps the number of options and the length of values', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 30; i++) many['k' + i] = 'v'.repeat(600);
    const p = tile(many).props;
    expect(Object.keys(p).length).toBe(24);
    expect(p.k0.length).toBe(500);
  });
  it('is ignored on widgets that are not tiles, and absent when nothing is valid', () => {
    expect(tile({ part: 'x' }, 'kpi').props).toBeUndefined();
    expect(tile({ fn: () => 1, 'bad-name': 'x' }).props).toBeUndefined();
    expect(tile('nope').props).toBeUndefined();
  });
  it('does not touch the prototype', () => {
    const p = tile(JSON.parse('{"constructor":"x","prototype":"y","part":"a"}')).props;
    expect(p).toEqual({ part: 'a' });
    expect(({} as any).part).toBeUndefined();
  });
});

describe('chromeless tiles', () => {
  const w = (type: string, chromeless: unknown) => sanitizeDashboard({ name: 'x', widgets: [{ type, title: 'T', x: 0, y: 0, w: 12, h: 8, config: { chromeless } }] })!.dashboard.widgets[0].config as any;
  it('is kept on tiles when boolean, ignored otherwise', () => {
    expect(w('tile:top-n', true).chromeless).toBe(true);
    expect(w('tile:top-n', false).chromeless).toBe(false);
    expect(w('tile:top-n', 'yes').chromeless).toBeUndefined();
    expect(w('kpi', true).chromeless).toBeUndefined();
  });
  it('a tile can be 2 x 2', () => {
    const s = sanitizeDashboard({ name: 'x', widgets: [{ type: 'tile:top-n', title: 'T', x: 0, y: 0, w: 2, h: 2, config: {} }] })!;
    expect([s.dashboard.widgets[0].w, s.dashboard.widgets[0].h]).toEqual([2, 2]);
  });
});

import { anyAlertRows, fieldsOf, genericRows, peopleRows, toRows } from './rows';
import { actionsOf, PLATFORM } from './component-api';
import { partValues, platformAction, ROW_ACTIONS } from './platform-actions';
import { isQuery, PLATFORM_ID, SOURCES } from './sources';

describe('more data sources', () => {
  it('every source is a known query and has fields', () => {
    SOURCES.forEach(s => { expect(isQuery(s.id)).toBe(true); expect(fieldsOf(s.id).length).toBeGreaterThan(0); });
    expect(isQuery('dropTables')).toBe(false);
  });
  it('reads the largest list of records generically and learns its fields', () => {
    const rows = toRows('getActions', { tenant: { actions: { total: 2, items: [{ id: 1, name: 'Restart', type: 'script', owner: { name: 'sre' }, tags: ['a', 'b'], enabled: true }, { id: 2, name: 'Page', type: 'notify' }] } } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: '1', name: 'Restart', type: 'script', 'owner.name': 'sre', tags: 'a, b', tagsCount: 2, enabled: 'Yes' });
    expect(fieldsOf('getActions').map(f => f.key)).toEqual(expect.arrayContaining(['owner.name', 'tagsCount', 'enabled']));
    expect(fieldsOf('getActions').find(f => f.key === 'tagsCount')!.kind).toBe('number');
  });
  it('reads one record as one row', () => {
    expect(genericRows({ tenant: { topologyResource: { uniqueId: 'r1', name: 'node-1', entityTypes: ['pod'] } } })).toEqual([{ id: 'r1', uniqueId: 'r1', name: 'node-1', entityTypes: 'pod', entityTypesCount: 1 }]);
    expect(genericRows(null)).toEqual([]);
  });
  it('reads alerts from a table or from records', () => {
    const table = { tenant: { incident: { alerts: { columns: [{ name: 'id' }, { name: 'severity' }, { name: 'resource.name' }], rows: [{ fields: ['a1', '6', 'db'] }] } } } };
    expect(anyAlertRows(table)[0]).toMatchObject({ id: 'a1', severity: 6, severityLabel: 'Critical', resource: 'db' });
    const recs = anyAlertRows({ tenant: { rawAlerts: [{ id: 'a2', severity: 5, summary: 'Disk full', resource: { name: 'nfs' }, state: 'open' }] } });
    expect(recs[0]).toMatchObject({ id: 'a2', severityLabel: 'Major', resource: 'nfs', service: 'Database & Storage' });
  });
  it('people and teams: one row per user and per group', () => {
    const rows = peopleRows({ tenant: { users: [{ id: 'u1', name: 'alex', groups: [{ name: 'SRE' }] }], groups: [{ id: 'g1', name: 'SRE' }] } });
    expect(rows).toEqual([{ id: 'u1', kind: 'User', name: 'alex', groups: 'SRE', groupCount: 1 }, { id: 'g1', kind: 'Group', name: 'SRE', members: 1 }]);
  });
  it('a source that needs a parameter says so instead of calling the server', async () => {
    const calls: any[] = [];
    const hub = new DataHub((q, p) => { calls.push([q, p]); return Promise.resolve({}); }, 't1');
    expect(hub.paramsFor('getIncidentAlerts', '')).toMatchObject({ __missing: 'Incident id' });
    expect(hub.paramsFor('getIncidentAlerts', 'inc-1')).toMatchObject({ tenantId: 't1', storyId: 'inc-1', format: 'AIOPS' });
    expect(hub.paramsFor('getIncidentAlerts', 'inc-1')).not.toHaveProperty('filter');
    expect(hub.paramsFor('getFiltersViews', '')).toMatchObject({ condition: 'type = \'alert\'' });
    expect(hub.paramsFor('getRelatedStories', 'alert-1, alert-2')).toMatchObject({ alertIds: ['alert-1', 'alert-2'] });
    expect(hub.paramsFor('getRelatedStories', 'inc-9')).toMatchObject({ storyId: 'inc-9' });
  });
  it('keeps new sources and platform actions when a dashboard is loaded', () => {
    const d = sanitizeDashboard({ name: 'x', widgets: [
      { id: 'w1', type: 'table', title: 'T', x: 0, y: 0, w: 6, h: 4, config: { query: 'getIncidentAlerts', filter: 'inc-1', on: [{ event: 'click', to: PLATFORM_ID, do: 'api:createIncident', arg: '{"alertIds":"{value}"}' }, { event: 'click', to: 'gone', do: 'show' }] } },
      { id: 'w2', type: 'kpi', title: 'K', x: 6, y: 0, w: 3, h: 3, config: { query: 'nonsense' } }
    ] })!;
    const [a, b2] = d.dashboard.widgets;
    expect(a.config.query).toBe('getIncidentAlerts');
    expect(a.config.on).toEqual([{ event: 'click', to: PLATFORM_ID, do: 'api:createIncident', arg: '{"alertIds":"{value}"}' }]);
    expect(b2.config.query).toBe('getAlerts');
  });
});

describe('Concert Operate actions', () => {
  it('the platform target offers the mutations; alert widgets offer the row actions', () => {
    expect(actionsOf(PLATFORM).map(a => a.id)).toEqual(expect.arrayContaining(['api:createIncident', 'api:addToIncident']));
    // policies are managed in Concert Operate itself, not from dashboards
    expect(actionsOf(PLATFORM).some(a => /polic/i.test(a.id))).toBe(false);
    expect(actionsOf({ type: 'table', config: { query: 'getAlerts' } }).map(a => a.id)).toEqual(expect.arrayContaining(ROW_ACTIONS.map(a => a.id)));
    expect(actionsOf({ type: 'table', config: { query: 'getStories' } }).some(a => a.id.startsWith('api:'))).toBe(false);
    expect(actionsOf({ type: 'table', config: { query: 'getStories' } }).some(a => a.id === 'cfg:filter')).toBe(true);
  });
  it('builds the API call from the fields', () => {
    const create = platformAction('api:createIncident')!;
    const v = partValues(create.parts, JSON.stringify({ alertIds: 'a1, a2 a3', priority: '9', description: 'Disk' }));
    expect(create.call(v, [])).toEqual({ name: 'createIncidentMutation', params: { alertIds: ['a1', 'a2', 'a3'], priority: 5, description: 'Disk' }, summary: 'Create a P5 incident from 3 alerts' });
    const rows = platformAction('api:incidentFromRows')!;
    expect(rows.call(partValues(rows.parts, undefined), ['x']).params).toEqual({ alertIds: ['x'], priority: 3, description: 'Created from the dashboard' });
  });
  it('missing or broken fields fall back to the defaults', () => {
    expect(partValues(platformAction('api:addToIncident')!.parts, 'not json')).toEqual({ alertIds: '{value}', correlationKey: '{value}' });
  });
});

/* Shapes copied from a real Concert Operate API check (2026-10-24), values shortened. */
describe('real Concert Operate responses', () => {
  const insight = { id: 'x', type: 'aiops.ibm.com/insight-type/probable-cause', source: 'aiops.ibm.com/insight-source/probable-cause', details: { id: 'x', rank: 2 } };
  const story = (id: string) => ({ id, createdBy: 'system', title: 'GET /loyalty - error rate', description: 'd', priority: 3, state: 'unassigned', owner: '-', team: '-', createdTime: '2026-10-20T20:39:11.870Z', insights: Array.from({ length: 9 }, () => insight), alertIds: ['a1', 'a2'], contextualAlertIds: [] as string[] });
  const groups = [{ __typename: 'Group', id: 'All Users', users: [{ __typename: 'RawUsers', id: 'cpadmin', properties: { fullName: 'cpadmin' } }, { id: 'u2' }] }];
  it('getStoriesByAlerts: the incidents, not their insights', () => {
    const rows = toRows('getStoriesByAlerts', { tenant: { __typename: 'Tenant', storiesByAlerts: [story('s1'), story('s2')], groups } });
    expect(rows.map(r => r.id)).toEqual(['s1', 's2']);
    expect(rows[0]).toMatchObject({ priority: 3, title: 'GET /loyalty - error rate', alertCount: 2 });
    expect(rows[0].owner).toBeUndefined();
  });
  it('getRelatedStories: empty is empty', () => {
    expect(toRows('getRelatedStories', { tenant: { __typename: 'Tenant', relatedStories: [] } })).toEqual([]);
  });
  it('getGroups: user groups with their members, no __typename', () => {
    const rows = toRows('getGroups', { tenant: { __typename: 'Tenant', groups: [{ __typename: 'Group', id: 'All Users', description: null, users: [{ __typename: 'RawUsers', id: 'cpadmin' }, { __typename: 'RawUsers', id: 'admin' }] }] } });
    expect(rows).toEqual([{ id: 'All Users', users: 'cpadmin, admin', usersCount: 2 }]);
  });
  it('getRawAlerts: flags as true / false and the insight fields', () => {
    const raw = { tenant: { rawAlerts: [{
      sender: { type: 'instana', name: 'Instana' }, resource: { name: 'QM1@10.21.61.33', type: 'INFRASTRUCTURE' }, signature: 'sig1', type: { classification: 'Issue' },
      id: 'a1', severity: 6, summary: 'Queue depth', firstOccurrenceTime: '2026-10-17T23:49:22.000Z', team: '-', owner: '-', state: 'open', eventCount: 1, acknowledged: false, suppressed: false,
      insights: [{ id: 'g', type: 'aiops.ibm.com/insight-type/topology/group', details: { name: 'QM1@10.21.61.33' } }], relatedStoryIds: ['s1'], relatedContextualStoryIds: [] as string[]
    }] } };
    const [r] = toRows('getRawAlerts', raw);
    expect(r).toMatchObject({ id: 'a1', severityLabel: 'Critical', sender: 'Instana', resource: 'QM1@10.21.61.33', type: 'Issue', acknowledged: 'false', suppressed: 'false', topologyGroup: 'QM1@10.21.61.33', inIncident: 'Yes', incidentCount: 1, signature: 'sig1', service: 'Mainframe & IBM MQ' });
    expect(r.team).toBeUndefined();
  });
  it('getImpactedApplications: no severity counts is "Not reported", not healthy', () => {
    const [r] = toRows('getApplications', { tenant: { impactedApplications: { items: [{ id: 'm2', name: 'Applications', iconId: 'application', count: 14, severityCounts: null, storyPriorityCounts: null, businessCriticality: { name: 'Tier 1', businessCriticalityValue: 100 } }] } } });
    expect(r).toMatchObject({ alerts: 14, severityLabel: 'Not reported', criticality: 'Tier 1' });
  });
  it('getActions: nested parameter lists stay inside their action', () => {
    const rows = toRows('getActions', { tenant: { actions: [{ __typename: 'Action', id: 'a', name: 'Send', description: '', version: 1, client: null, modifiedAt: '2025-01-17T01:48:37.658Z', parameters: [{ __typename: 'RunbookParameter', name: 'target' }, { name: 'user' }], author: 'cpadmin' }] } });
    expect(rows).toEqual([{ id: 'a', name: 'Send', version: 1, modifiedAt: '2025-01-17T01:48:37.658Z', parameters: 'target, user', parametersCount: 2, author: 'cpadmin' }]);
  });
  it('getUsersAndGroups: full names', () => {
    const rows = toRows('getPeople', { tenant: { groups: [{ id: 'All Users' }], users: [{ id: 'u1', groups: [{ id: 'All Users' }], properties: { fullName: 'Ada Lovelace' } }] } });
    expect(rows[0]).toMatchObject({ kind: 'User', name: 'Ada Lovelace', groups: 'All Users' });
    expect(rows[1]).toMatchObject({ kind: 'Group', name: 'All Users', members: 1 });
  });
});

describe('policies, counts and related incidents (second real check)', () => {
  it('getPoliciesMetadata: one row per policy, the name taken from metadata', () => {
    const rows = toRows('getPolicies', { tenant: { __typename: 'Tenant', aiopsPolicies: [{ __typename: 'AIopsPolicy', id: 'p1', metadata: { __typename: 'AIopsPolicyMetadata', name: 'Default alert repeat create guard policy' } }, { id: 'p2', metadata: { name: 'Other' } }] } });
    expect(rows).toEqual([{ id: 'p1', name: 'Default alert repeat create guard policy' }, { id: 'p2', name: 'Other' }]);
  });
  it('getStandingAlertCount: one row with the quantity', () => {
    expect(toRows('getAlertCount', { tenant: { __typename: 'Tenant', alertCount: { __typename: 'AlertCount', quantity: 380 } } })).toEqual([{ quantity: 380, id: 'total' }]);
    expect(toRows('getIncidentCount', { tenant: { storyCount: { quantity: 15 } } })[0].quantity).toBe(15);
  });
  it('getRelatedStories: leaves out the incident it was asked about', () => {
    const data = { tenant: { relatedStories: [{ __typename: 'Story', id: 's1', title: 'Self', priority: 3 }, { id: 's2', title: 'Other', priority: 2 }] } };
    expect(toRows('getRelatedStories', data, 's1').map(r => r.id)).toEqual(['s2']);
    expect(toRows('getRelatedStories', data, 'a1, a2').map(r => r.id)).toEqual(['s1', 's2']);
  });
});

import { probeMutation } from './api-check';
describe('API check: mutation parameter probe', () => {
  it('reads the required parameters from the refusal, as Apollo words it', async () => {
    const refuse = () => Promise.reject(Object.assign(new Error('Response not successful: Received status code 400'), { networkError: { result: { errors: [
      { message: 'Variable "$tenantId" got invalid value { invalid: "x" }; ID cannot represent value: { invalid: "x" }' },
      { message: 'Variable "$alertIds" of required type "[String]!" was not provided.' },
      { message: 'Variable "$priority" of required type "Int!" was not provided.' }
    ] } } }));
    const r = await probeMutation('createIncidentMutation', refuse);
    expect(r.status).toBe('ok');
    expect(r.outline).toContain('required: alertIds: [String]!, priority: Int!');
  });
  it('shouts if a server ever accepts the invalid request', async () => {
    const r = await probeMutation('activatePolicy', () => Promise.resolve({ ok: true }));
    expect(r.status).toBe('error');
    expect(r.note).toMatch(/^WARNING/);
  });
});

describe('change actions match the parameters Concert Operate requires (probe, 2026-10-24)', () => {
  const call = (id: string, v: Record<string, string>, rows: string[] = []) => platformAction(id)!.call(v, rows);
  it('createIncidentMutation: alertIds [String]!, priority Int!', () => {
    const c = call('api:createIncident', { alertIds: 'a1,a2', priority: '2', description: 'x' });
    expect(c.name).toBe('createIncidentMutation');
    expect(c.params.alertIds).toEqual(['a1', 'a2']);
    expect(Number.isInteger(c.params.priority)).toBe(true);
  });
  it('updateIncidentMutation: alertIds [String]!', () => { expect(call('api:rowsToIncident', { correlationKey: 'k' }, ['a1']).params).toMatchObject({ alertIds: ['a1'] }); });
});

describe('topology resource (fourth real check)', () => {
  it('one row: its _id as the id, epoch times learnt as times', () => {
    const rows = toRows('getTopologyResource', { tenant: { __typename: 'Tenant', topologyResource: { __typename: 'TopologyResource', _id: 'Epg9I0zlCjLNbXBkwHfgOA', name: 'tu201_12.55.182.10_12346_5062', beginTime: 1791366456101, observedTime: 1791366456101, endTime: null } } });
    expect(rows).toEqual([{ _id: 'Epg9I0zlCjLNbXBkwHfgOA', name: 'tu201_12.55.182.10_12346_5062', beginTime: 1791366456101, observedTime: 1791366456101, id: 'Epg9I0zlCjLNbXBkwHfgOA' }]);
    expect(fieldsOf('getTopologyResource').find(f => f.key === 'beginTime')!.kind).toBe('time');
  });
});

import { FAMILIES, familyOf, viewAsByName, viewAsChoices } from './chart-kinds';
describe('View as (chart type switching)', () => {
  const w = (type: string) => ({ type: type as any, config: { query: 'getAlerts' as const } });
  it('a bar chart can be shown as any chart that groups, a word cloud included', () => {
    const types = viewAsChoices(w('bar'))!.map(c => c.type);
    expect(types).toEqual(expect.arrayContaining(['bar', 'donut', 'carbon:PieChart', 'carbon:TreemapChart', 'carbon:WordCloudChart', 'carbon:StackedBarChart']));
    expect(types).not.toContain('carbon:LineChart');
    expect(types).not.toContain('table');
  });
  it('time charts only switch among time charts; figures among figures; rows among rows', () => {
    expect(viewAsChoices(w('carbon:LineChart'))!.map(c => c.type)).toEqual(['timeseries', 'carbon:LineChart', 'carbon:AreaChart', 'carbon:StackedAreaChart', 'carbon:ScatterChart']);
    expect(viewAsChoices(w('kpi'))!.map(c => c.type)).toEqual(['kpi', 'carbon:GaugeChart', 'carbon:MeterChart']);
    expect(viewAsChoices(w('carbon:DataTable'))!.map(c => c.type)).toEqual(['table', 'carbon:DataTable', 'carbon:StructuredList']);
  });
  it('widgets without a family have no menu; every family type exists', () => {
    expect(viewAsChoices(w('text'))).toBeNull();
    expect(viewAsChoices(w('carbon:AlluvialChart'))).toBeNull();
    FAMILIES.forEach(f => f.types.forEach(t => expect(familyOf(t)).toBe(f)));
    FAMILIES.forEach(f => expect(viewAsChoices({ type: f.types[0] as any, config: { query: 'getAlerts', seriesBy: 'team' } })!.length).toBe(f.types.length));
  });
  it('a heatmap is offered only when the chart has a second split (Series by)', () => {
    expect(viewAsChoices(w('bar'))!.map(c => c.type)).not.toContain('carbon:HeatmapChart');
    expect(viewAsByName(w('bar'), 'heatmap')).toBeUndefined();
    expect(viewAsChoices({ type: 'carbon:StackedBarChart' as any, config: { query: 'getAlerts', seriesBy: 'team' } })!.map(c => c.type)).toContain('carbon:HeatmapChart');
  });
  it('the action finds a type by its label, ignoring case, or by the start of it', () => {
    expect(viewAsByName(w('bar'), 'Word cloud')).toBe('carbon:WordCloudChart');
    expect(viewAsByName(w('bar'), 'pie')).toBe('carbon:PieChart');
    expect(viewAsByName(w('bar'), 'line chart')).toBeUndefined();
  });
  it('the switch is kept per widget and survives loading', () => {
    const d = sanitizeDashboard({ name: 'x', widgets: [{ id: 'a', type: 'bar', title: 'B', x: 0, y: 0, w: 4, h: 4, config: { query: 'getAlerts', viewAs: false } }] })!;
    expect(d.dashboard.widgets[0].config.viewAs).toBe(false);
  });
});

import { PICKS, applyPick, currentTerm, matchOptions } from './pickers';
describe('Pickers (values offered while typing)', () => {
  const opts = [{ value: 'Close incidents when all alerts clear', label: 'Close incidents when all alerts clear' }, { value: 'Promote critical alerts', label: 'Promote critical alerts' }, { value: 'Restart pod runbook policy', label: 'Restart pod runbook policy' }];
  it('a list field works on the term after the last comma, and keeps what was typed before it', () => {
    expect(currentTerm('Promote critical alerts, rest', true)).toBe('rest');
    expect(applyPick('Promote critical alerts, rest', 'Restart pod runbook policy', true)).toBe('Promote critical alerts, Restart pod runbook policy');
    expect(applyPick('anything', 'inc-1', false)).toBe('inc-1');
  });
  it('matches the start first, then anywhere, and leaves out values already in the list', () => {
    expect(matchOptions(opts, 'alerts').map(o => o.value)).toEqual(['Close incidents when all alerts clear', 'Promote critical alerts']);
    expect(matchOptions(opts, 'pro').map(o => o.value)).toEqual(['Promote critical alerts']);
    expect(matchOptions(opts, 'Promote critical alerts, ', true).map(o => o.value)).not.toContain('Promote critical alerts');
    expect(matchOptions(opts, '', false, 2)).toHaveLength(2);
  });
  it('incidents are offered by title with their id, policies by name', () => {
    const inc = PICKS.incident.options([{ id: 'inc-1', title: 'orders: 5xx', priority: 2, state: 'open' }, { id: '' }]);
    expect(inc).toEqual([{ value: 'inc-1', label: 'orders: 5xx', sub: 'inc-1 · P2 · open' }]);
  });
});


import { callKey } from './snapshot';
describe('Data snapshot keys', () => {
  it('ignore the tenant, Apollo options and columns, and sort the rest', () => {
    expect(callKey({ tenantId: 't1', fetchPolicy: 'network-only', columns: ['a'], storyId: 'inc-1', format: 'AIOPS' })).toBe('[["storyId","inc-1"]]');
    expect(callKey({ b: 2, a: 1 })).toBe(callKey({ a: 1, b: 2 }));
    expect(callKey(undefined)).toBe('[]');
    expect(callKey({ storyId: 'inc-1' })).not.toBe(callKey({ storyId: 'inc-2' }));
  });
});

import { explainAlerts, explainIncidents, rateNote, readTimeline, top } from './explanation';
describe('Explain this', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  const at = (h: number) => new Date(now - h * 3600000).toISOString();
  const alerts = [
    { id: 'a1', severityLabel: 'Critical', firstOccurrence: at(0.2), lastOccurrence: at(0.1), resource: 'db-1', service: 'Payments', type: 'Saturation', inIncident: 'Yes', causalGroup: 'inc-1', anomaly: 'Yes', runbooks: 1, runbookAutomated: 'Automated', goldenSignal: 'None' },
    { id: 'a2', severityLabel: 'Major', firstOccurrence: at(0.5), lastOccurrence: at(0.4), resource: 'db-1', service: 'Payments', type: 'Latency', inIncident: 'Yes', causalGroup: 'inc-1', goldenSignal: 'Latency' },
    { id: 'a3', severityLabel: 'Major', firstOccurrence: at(0.7), resource: 'web-2', service: '-', inIncident: 'No', causalGroup: 'x' },
    { id: 'a4', severityLabel: 'Minor', firstOccurrence: at(5), resource: 'web-2', inIncident: 'No' }
  ];
  it('counts what the alerts have in common, Critical first, and leaves out empty values', () => {
    const e = explainAlerts(alerts, now);
    expect(e.count).toBe(4);
    expect(e.severities).toEqual([['Critical', 1], ['Major', 2], ['Minor', 1]]);
    expect(e.resources).toEqual([['db-1', 2], ['web-2', 2]]);
    expect(e.services).toEqual([['Payments', 2]]);
    expect(e.inIncidents).toBe(2);
    expect(e.incidents).toEqual([['inc-1', 2]]);
    expect(e.signals).toEqual({ anomaly: 1, seasonal: 0, goldenSignal: 1, logFixes: 0 });
    expect(e.runbooks).toEqual({ alerts: 1, automated: 1 });
    expect(e.lastHour).toBe(3);
    expect(rateNote(e)).toBe('none in the day before');
    expect(rateNote({ lastHour: 6, perHourBefore: 1 })).toBe('6.0× the usual hourly rate');
    expect(rateNote({ lastHour: 2, perHourBefore: 1 })).toBe('');
    expect(top([{ v: '-' }, { v: 'None' }], 'v')).toEqual([]);
  });
  it('picks the incidents to look at first: highest priority, then most alerts', () => {
    const ix = explainIncidents([{ id: 'i1', priority: 3, alertCount: 9 }, { id: 'i2', priority: 1, alertCount: 1 }, { id: 'i3', priority: 1, alertCount: 5 }]);
    expect(ix.lead.map(r => r.id)).toEqual(['i3', 'i2', 'i1']);
  });
  it('reads Concert’s incident timeline: created, then each alert with its severity when added', () => {
    const tl = readTimeline({ tenant: { story: { timeline: [
      { createdTime: '2026-10-07T10:51:12.176Z', type: 'alertadded', content: { alertid: 'a2', severity: 6, summary: 'later', timeAdded: '2026-10-07T10:53:00.000Z' } },
      { createdTime: '2026-10-07T10:51:12.176Z', type: 'created', content: {} },
      { createdTime: '2026-10-07T10:51:12.176Z', type: 'alertadded', content: { alertid: 'a1', severity: 5, timeAdded: 1759834300000 } }
    ] } } });
    expect(tl.map(e => e.kind)).toEqual(['alertadded', 'created', 'alertadded']);
    expect(tl[0].alertId).toBe('a1');
    expect(tl[2]).toMatchObject({ alertId: 'a2', severity: 6, summary: 'later' });
    expect(readTimeline({})).toEqual([]);
  });
});

import { titleBand } from './grid';

describe('title band', () => {
  const band = { id: 'b', type: 'text', x: 0, y: 0, w: 12, h: 2, config: { chromeless: true, bg: '#161616' } };
  const tile = (y: number) => ({ id: `t${y}`, type: 'kpi', x: 0, y, w: 3, h: 3, config: {} });
  it('finds the band across the top', () => expect(titleBand([band, tile(2)])).toBe(band));
  it('ignores a band with something beside it', () => expect(titleBand([band, tile(1)])).toBeUndefined());
  it('needs a colour and no frame', () => expect(titleBand([{ ...band, config: { chromeless: true } }])).toBeUndefined());
  it('ignores a hidden band', () => expect(titleBand([{ ...band, config: { ...band.config, hidden: true } }])).toBeUndefined());
});

import { applyOverrides } from './overrides';

describe('viewer overrides', () => {
  const base = { id: 'd', name: 'D', updated: 0, widgets: [{ id: 'a', type: 'kpi', title: 'A', x: 0, y: 0, w: 3, h: 3, config: { query: 'getAlerts', sendTo: ['b'] } }] } as any;
  it('changes nothing without overrides', () => expect(applyOverrides(base, undefined, undefined)).toBe(base));
  it('applies arranged sizes, cut links and action effects, leaving the saved dashboard alone', () => {
    const d = applyOverrides(base, { layout: { a: { x: 3, y: 1, w: 4, h: 2 } }, send: { a: null } }, { a: { title: 'New', hidden: true } });
    expect(d.widgets[0]).toMatchObject({ x: 3, y: 1, w: 4, h: 2, title: 'New' });
    expect(d.widgets[0].config.sendTo).toBeUndefined();
    expect(d.widgets[0].config.hidden).toBe(true);
    expect(base.widgets[0].config.sendTo).toEqual(['b']);
  });
});

import { bandFieldFor } from './gauge-bands';

describe('gauge colour bands', () => {
  const g = { id: 'g', type: 'carbon:GaugeChart', title: 'G', x: 0, y: 0, w: 3, h: 4, config: { query: 'getAlerts' } } as any;
  const pie = (id: string, groupBy: string, sendTo?: string[]) => ({ id, type: 'carbon:PieChart', title: id, x: 0, y: 0, w: 3, h: 4, config: { query: 'getAlerts', groupBy, ...(sendTo ? { sendTo } : {}) } }) as any;
  it('follows the chart that sends to the gauge', () => expect(bandFieldFor([g, pie('p', 'severityLabel')], g)).toBe('severityLabel'));
  it('a chart wired to the gauge by name wins', () => expect(bandFieldFor([g, pie('a', 'team'), pie('b', 'sender', ['g'])], g)).toBe('sender'));
  it('none when the chart sends elsewhere, or the gauge does not listen', () => {
    expect(bandFieldFor([g, pie('p', 'team', ['x'])], g)).toBeUndefined();
    const deaf = { ...g, config: { ...g.config, listens: false } };
    expect(bandFieldFor([deaf, pie('p', 'team')], deaf)).toBeUndefined();
  });
});
