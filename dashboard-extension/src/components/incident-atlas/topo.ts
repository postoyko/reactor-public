/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Live topology neighbours for Incident Atlas, through Studio's read-only topology proxy (or any base serving the
 * topology REST paths). UNVERIFIED against a live service: shapes are read defensively.
 */

import { parseNeighbourhood } from './atlas-logic';

export const DEFAULT_TOPOLOGY_URL = 'http://127.0.0.1:4000/api/topology';

async function get(base: string, path: string): Promise<any> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = window.setTimeout(() => ctl && ctl.abort(), 20000);
  try {
    const r = await fetch(`${base.replace(/\/+$/, '')}${path}`, { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } });
    if (!r.ok) { let m = ''; try { const e = await r.json(); m = e.error || (e._error && e._error.message) || e.message || ''; } catch (x) { /* no body */ } throw new Error(`HTTP ${r.status} ${m}`.trim()); }
    return await r.json();
  } catch (e) {
    throw new Error(e instanceof Error ? (e.name === 'AbortError' ? 'timed out' : e.message) : String(e));
  } finally { window.clearTimeout(to); }
}

/** The ASM `_id` of a resource, found by uniqueId or name. */
export async function resolveId(base: string, name: string, uniqueId?: string): Promise<string> {
  const filters = [...(uniqueId ? [`uniqueId:${uniqueId}`] : []), `name=${name}`];
  for (const f of filters) {
    const j = await get(base, `/resources?_filter=${encodeURIComponent(f)}&_limit=5&_field=name&_field=uniqueId`);
    const items: any[] = Array.isArray(j && j._items) ? j._items : [];
    const hit = items.find(x => x && x.name === name) || items[0];
    if (hit && hit._id) return String(hit._id);
  }
  throw new Error(`"${name}" was not found in the topology service`);
}

/** One hop around a resource, with status severity. */
export async function neighbours(base: string, seedId: string) {
  const j = await get(base, `/topology/${encodeURIComponent(seedId)}?_max_hops=1&_include_seed=false&_include_status_severity=true&_field=name&_field=entityTypes&_field=uniqueId`);
  return parseNeighbourhood(j, seedId);
}
