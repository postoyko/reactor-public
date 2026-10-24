/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * "Raw JSON" tab for a deep dive. For an alert: pulls that alert back from the alerts API and pretty-prints it.
 * For an ASM / topology entity: pulls the resource back from the topology API and pretty-prints it.
 * Self-contained (inline styles) so the same file serves every panel that has a deep dive.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ALERT_QUERY_PARAMS } from '../constants';

/** Studio's read-only topology proxy (Studio, Bundled dashboards, Topology proxy). */
export const DEFAULT_TOPOLOGY_URL = 'http://127.0.0.1:4000/api/topology';

export type RawQuery = (name: string, options: Record<string, unknown>) => Promise<any>;
export interface RawAlert { id: string; summary?: string; severity?: number }
export interface RawJsonTabProps {
  query: RawQuery | null;
  alerts: RawAlert[];
  /** The ASM unique id when the panel already has it. Otherwise it is looked up in the alerts' topology insights. */
  uniqueId?: string;
  entityName: string;
  /** Studio's topology proxy (default http://127.0.0.1:4000/api/topology), or any base that serves the topology REST paths. Pass '' to turn the REST lookups off. */
  topologyApiUrl?: string;
  /** Shown instead of querying (sample data): the local objects. */
  sampleAlert?: (id: string) => unknown;
}

const looksJson = (v: unknown): v is string => typeof v === 'string' && /^\s*[[{]/.test(v);
const deep = (v: unknown): unknown => {
  if (looksJson(v)) { try { return deep(JSON.parse(v)); } catch (e) { return v; } }
  if (Array.isArray(v)) return v.map(deep);
  if (v && typeof v === 'object') { const o: Record<string, unknown> = {}; Object.keys(v as object).forEach(k => { o[k] = deep((v as any)[k]); }); return o; }
  return v;
};

/** One alert row -> an object keyed by column name, with JSON-in-a-string cells (insights and so on) opened up. */
export function alertRowToObject(res: any, id: string): Record<string, unknown> | null {
  const src = res && res.data ? res.data.tenant?.alerts : res?.tenant?.alerts;
  const cols: Array<{ name?: string }> = Array.isArray(src?.columns) ? src.columns : [];
  const rows: Array<{ fields?: unknown[] }> = Array.isArray(src?.rows) ? src.rows : [];
  const idi = cols.findIndex(c => c && c.name === 'id');
  const row = rows.find(r => idi >= 0 && String((r.fields || [])[idi]) === id) || (rows.length === 1 && idi < 0 ? rows[0] : undefined);
  if (!row) return null;
  const o: Record<string, unknown> = {};
  cols.forEach((c, i) => { const v = (row.fields || [])[i]; if (c && c.name && v !== null && v !== undefined && v !== '') o[c.name] = deep(v); });
  return o;
}

/** Finds an ASM unique id in an object (the alert JSON), preferring the topology resource insight. */
export function findUniqueId(v: unknown, depth = 0): string | undefined {
  if (!v || typeof v !== 'object' || depth > 8) return undefined;
  if (Array.isArray(v)) { for (const x of v) { const r = findUniqueId(x, depth + 1); if (r) return r; } return undefined; }
  const o = v as Record<string, unknown>;
  if (typeof o.uniqueId === 'string' && o.uniqueId) return o.uniqueId;
  for (const k of Object.keys(o)) { const r = findUniqueId(o[k], depth + 1); if (r) return r; }
  return undefined;
}

/**
 * Topology REST API (from its Swagger): GET /resources?_filter=uniqueId:<v> or name=<n> returns `_items`; GET /resources/{_id} returns one resource;
 * GET /topology/{_id}?_max_hops=1 returns the neighbourhood. Reached through Studio's proxy, which holds the address and login.
 */
async function topologyRest(name: string, base: string, uniqueIds: string[]): Promise<{ json?: unknown; id?: string; hood?: unknown; tried: string[] }> {
  const tried: string[] = [], b = base.replace(/\/+$/, '');
  const get = async (path: string): Promise<any> => {
    const url = `${b}${path}`, ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = window.setTimeout(() => ctl && ctl.abort(), 20000);
    try {
      const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } });
      tried.push(`${path} -> ${r.status}`);
      if (!r.ok) { try { const e = await r.json(); tried[tried.length - 1] += ` ${e.error || (e._error && e._error.message) || e.message || ''}`.trimEnd(); } catch (x) { /* no body */ } return undefined; }
      return await r.json();
    } catch (e) { tried.push(`${path} -> ${msg(e)}`); return undefined; } finally { window.clearTimeout(to); }
  };
  const filters = [...uniqueIds.map(u => `uniqueId:${u}`), `name=${name}`];
  for (const f of filters) {
    const j = await get(`/resources?_filter=${encodeURIComponent(f)}&_limit=5`);
    const items: any[] = Array.isArray(j?._items) ? j._items : [];
    const hit = items.find(x => x && x.name === name) || items[0];
    if (hit && hit._id) {
      const id = String(hit._id), full = await get(`/resources/${encodeURIComponent(id)}`);
      const hood = await get(`/topology/${encodeURIComponent(id)}?_max_hops=1&_include_seed=true&_include_status_severity=true`);
      return { json: full || hit, id, hood, tried };
    }
  }
  return { tried };
}

/** Every id the alert's topology insights carry that could identify the resource: ASM `_id` style keys first, then `uniqueId`. */
export function topologyIds(v: unknown): string[] {
  const out: string[] = [];
  const add = (x: unknown) => { if (typeof x === 'string' && x && out.indexOf(x) < 0) out.push(x); };
  const walk = (o: any, d: number) => {
    if (!o || typeof o !== 'object' || d > 8) return;
    if (Array.isArray(o)) { o.forEach(x => walk(x, d + 1)); return; }
    if (typeof o.type === 'string' && o.type.indexOf('insight-type/topology/resource') >= 0 && o.details && typeof o.details === 'object') {
      ['_id', 'resourceId', 'asmId', 'id'].forEach(k => add(o.details[k])); add(o.details.uniqueId);
    }
    Object.keys(o).forEach(k => walk(o[k], d + 1));
  };
  walk(v, 0);
  add(findUniqueId(v));
  return out;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Light syntax colouring for pretty-printed JSON. */
const colour = (json: string): string => esc(json).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m, str, colon, kw, num) =>
  str ? (colon ? `<span style="color:#0f62fe">${str}</span>${colon}` : `<span style="color:#198038">${str}</span>`) : kw ? `<span style="color:#8a3ffc">${kw}</span>` : num ? `<span style="color:#b28600">${num}</span>` : m);

function Pane({ title, status, data, note }: { title: string; status: 'idle' | 'loading' | 'ok' | 'error' | 'empty'; data?: unknown; note?: string }) {
  const text = data === undefined ? '' : JSON.stringify(data, null, 2);
  const [copied, setCopied] = useState(false);
  const copy = () => { try { navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); } catch (e) { /* ignore */ } };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13 }}>{title}</strong>
        {text && <button type="button" onClick={copy} style={{ font: 'inherit', fontSize: 12, padding: '2px 8px', cursor: 'pointer', border: '1px solid currentColor', background: 'none', color: 'inherit' }}>{copied ? 'Copied' : 'Copy JSON'}</button>}
      </div>
      {status === 'loading' && <div style={{ fontSize: 12, opacity: .7, padding: '8px 0' }}>Querying…</div>}
      {status === 'error' && <div role="alert" style={{ fontSize: 12, color: '#da1e28', padding: '8px 0' }}>{note}</div>}
      {status === 'empty' && <div style={{ fontSize: 12, opacity: .7, padding: '8px 0' }}>{note}</div>}
      {status === 'ok' && <pre tabIndex={0} aria-label={title} style={{ margin: '6px 0 0', padding: 10, maxHeight: 420, overflow: 'auto', fontSize: 12, lineHeight: 1.45, background: 'rgba(127,127,127,.12)', fontFamily: 'IBM Plex Mono, ui-monospace, monospace', whiteSpace: 'pre', tabSize: 2 }} dangerouslySetInnerHTML={{ __html: colour(text) }} />}
      {status === 'ok' && note && <div style={{ fontSize: 11, opacity: .7, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

export function RawJsonTab(p: RawJsonTabProps) {
  const list = p.alerts.slice().sort((a, b) => (b.severity || 0) - (a.severity || 0));
  const [alertId, setAlertId] = useState(list[0] ? list[0].id : '');
  const [aS, setAS] = useState<'idle' | 'loading' | 'ok' | 'error' | 'empty'>('idle'), [aData, setAData] = useState<unknown>(), [aNote, setANote] = useState('');
  const [hS, setHS] = useState<'idle' | 'loading' | 'ok' | 'error' | 'empty'>('idle'), [hData, setHData] = useState<unknown>();
  const [eS, setES] = useState<'idle' | 'loading' | 'ok' | 'error' | 'empty'>('idle'), [eData, setEData] = useState<unknown>(), [eNote, setENote] = useState('');
  useEffect(() => { if (!list.find(a => a.id === alertId)) setAlertId(list[0] ? list[0].id : ''); }, [p.entityName, p.alerts.length]);

  const call = useCallback(async (name: string, options: Record<string, unknown>) => {
    if (!p.query) throw new Error('No query API is connected.');
    const res = await p.query(name, options);
    if (res && Array.isArray(res.errors) && res.errors.length) throw new Error(String(res.errors[0] && res.errors[0].message || `${name} returned an error`));
    return res;
  }, [p.query]);

  // alert
  useEffect(() => {
    if (!alertId) { setAS('empty'); setANote('No alert on this resource.'); return; }
    if (!p.query) { const s = p.sampleAlert ? p.sampleAlert(alertId) : undefined; if (s) { setAData(s); setAS('ok'); setANote('Sample data: the alert as held by the panel (not from the API).'); } else { setAS('empty'); setANote('Not connected to the alerts API.'); } return; }
    let live = true; setAS('loading');
    (async () => {
      const base = { columns: ALERT_QUERY_PARAMS.columns, format: ALERT_QUERY_PARAMS.format };
      let obj: Record<string, unknown> | null = null, lastErr = '';
      try { obj = alertRowToObject(await call('getAlerts', { ...base, filter: `id = '${alertId.replace(/'/g, "''")}'` }), alertId); } catch (e) { lastErr = msg(e); }
      if (!obj) { try { obj = alertRowToObject(await call('getAlerts', { ...base, filter: ALERT_QUERY_PARAMS.filter }), alertId); } catch (e) { lastErr = lastErr || msg(e); } }
      if (!live) return;
      if (obj) { setAData(obj); setAS('ok'); setANote('From the alerts API (getAlerts), columns the panel asks for; JSON inside cells is expanded.'); }
      else if (lastErr) { setAS('error'); setANote(`The alerts query failed: ${lastErr}`); }
      else { setAS('empty'); setANote('The alerts API did not return this alert (it may have closed or fallen outside the filter).'); }
    })();
    return () => { live = false; };
  }, [alertId, p.query]);

  // entity: ask the topology service (getTopologyResource) with each id the alert's topology insight gives us
  useEffect(() => {
    if (!p.query) { setES('empty'); setENote('Not connected to the topology API (sample data has no entity).'); setEData(undefined); return; }
    if (!p.uniqueId && aS === 'loading') return; // wait for the alert: it carries the topology insight
    let live = true; setES('loading'); setHS('idle'); setHData(undefined);
    (async () => {
      let cands: string[] = p.uniqueId ? [p.uniqueId] : (aS === 'ok' ? topologyIds(aData) : []);
      if (!cands.length && p.alerts.length) { // look through every alert of this resource
        try { const res = await call('getAlerts', { columns: ALERT_QUERY_PARAMS.columns, format: ALERT_QUERY_PARAMS.format, filter: ALERT_QUERY_PARAMS.filter }); for (const a of p.alerts) { const o = alertRowToObject(res, a.id); cands = o ? topologyIds(o) : []; if (cands.length) break; } } catch (e) { /* fall through */ }
      }
      const errors: string[] = [];
      for (const id of cands) {
        try {
          const res = await call('getTopologyResource', { resourceId: id }); if (!live) return;
          const d = deep(res); const empty = d === null || d === undefined || (typeof d === 'object' && Object.keys(d as object).length === 0);
          if (empty) { errors.push(`${id}: empty`); continue; }
          setEData(d); setES('ok'); setENote(`From the topology service (getTopologyResource) with id "${id}"${cands.length > 1 ? ` (candidates from the alert: ${cands.join(', ')})` : ''}.`); return;
        } catch (e) { errors.push(`${id}: ${msg(e)}`); }
      }
      // optional: the topology REST service, only when its address is configured (it is a separate route and needs its own login)
      const base = p.topologyApiUrl === undefined ? DEFAULT_TOPOLOGY_URL : p.topologyApiUrl;
      if (base) {
        const r = await topologyRest(p.entityName, base, cands);
        if (!live) return;
        if (r.json !== undefined) { setEData(r.json); setES('ok'); setENote(`From the topology REST API (through ${base}), ASM _id "${r.id}".`); if (r.hood !== undefined) { setHData(r.hood); setHS('ok'); } return; }
        errors.push(...r.tried.map(t => `REST ${t}`));
      }
      if (!live) return;
      setES(cands.length ? 'error' : 'empty');
      setENote(cands.length || errors.length ? `The topology service did not return the entity. Tried: ${errors.join(' | ')}. If the REST lines fail, set up Studio's Topology proxy (Bundled dashboards tab).` : `No topology id found in the alerts of "${p.entityName}" (no topology resource insight) and the topology REST lookup is switched off.`);
    })();
    return () => { live = false; };
  }, [p.uniqueId, p.entityName, p.query, aS, aData, p.topologyApiUrl]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="rawjson-alert" style={{ fontSize: 12 }}>Alert</label>
        <select id="rawjson-alert" value={alertId} onChange={e => setAlertId(e.target.value)} style={{ font: 'inherit', fontSize: 12, maxWidth: '100%', padding: '3px 6px' }}>
          {list.length === 0 && <option value="">(none)</option>}
          {list.map(a => <option key={a.id} value={a.id}>{`${(a.summary || a.id).slice(0, 70)}`}</option>)}
        </select>
      </div>
      <Pane title="Alert JSON" status={aS} data={aData} note={aNote} />
      <Pane title={`Topology entity JSON: ${p.entityName}`} status={eS} data={eData} note={eNote} />
      {hS === 'ok' && <Pane title="Topology neighbourhood (1 hop, with status severity)" status="ok" data={hData} note="From the topology REST API: GET /topology/{_id}?_max_hops=1" />}
    </div>
  );
}
