/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { compact, findSpot, moveItem, overlaps, resizeItem, clampBox, gridHeight } from './grid';
import { alertRows, incidentRows, groupMetric, metricValue, timeBins, applyFilters, orderSeverity } from './rows';
import { sanitizeDashboard, importJson, exportJson, starterDashboard, loadState, saveState, cloneDashboard, STORE_KEY } from './store';
import { DataHub, sourceKey } from './datahub';
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
  it('ignores a stale response that arrives after a newer one', async () => {
    const resolvers: Array<(v: any) => void> = [];
    const hub = new DataHub(() => new Promise(res => { resolvers.push(res); }), 't1');
    const rel = hub.acquire('getAlerts', undefined, 0, () => {});
    hub.refresh();
    resolvers[1]({ tenant: { alerts: { columns: [{ name: 'id' }], rows: [{ fields: ['new'] }] } } });
    resolvers[0]({ tenant: { alerts: { columns: [{ name: 'id' }], rows: [{ fields: ['old1'] }, { fields: ['old2'] }] } } });
    await tick();
    expect(hub.snapshot(sourceKey('getAlerts')).rows.map(r => r.id)).toEqual(['new']);
    rel();
  });
  it('uses the tenant and the right params per query, and survives a throwing fetcher', async () => {
    const seen: any[] = [];
    const hub = new DataHub(async (q, p) => { seen.push([q, p]); return {}; }, 'tenant-x');
    const r1 = hub.acquire('getAlerts', "severity > 3", 0, () => {});
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
