/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * API check: runs every read-only data source against the real Concert Operate and records the shape of what comes
 * back, so the Designer's readers (rows.ts) can be checked and fixed against real responses rather than guesses.
 *
 * Nothing is changed: mutations (create incident, policies) are only looked up, never called. By default the report
 * holds the structure of each response (keys, types, list lengths), not its values; sample values are opt-in.
 */

import { DataHub } from './datahub';
import { PLATFORM_ACTIONS, ROW_ACTIONS } from './platform-actions';
import { toRows } from './rows';
import { SOURCES } from './sources';
import { QueryName, Row } from './types';

export type CheckStatus = 'ok' | 'empty' | 'error' | 'missing' | 'skipped';

export interface CheckResult {
  name: string;
  api: string;
  kind: 'source' | 'mutation' | 'helper' | 'extra' | 'schema';
  status: CheckStatus;
  ms?: number;
  params?: Record<string, unknown>;
  note?: string;
  /** The response as an outline of keys, types and list lengths. */
  outline?: string;
  rows?: number;
  fields?: string[];
  sample?: Row;
  /** The start of the API function's code, which often names the GraphQL query and its fields. */
  code?: string;
}

export interface CheckOptions {
  values: boolean;
  code: boolean;
  incidentId?: string;
  resourceId?: string;
}

/** Functions the Designer calls besides the data sources (metric pickers, runbooks, insights, people). */
const HELPERS = ['getMetricGroups', 'getMetrics', 'getMetricResources', 'getMetricManagerData', 'getMetricForecastData', 'getRunbook', 'getRunbooksAndPolicy', 'getSimilarIncidents', 'getStoryAlertsInsights', 'getUsersAndGroups'];

const api = (): Record<string, any> => ((window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI) || {};

const clip = (v: unknown, n = 60): string => { const s = String(v); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

/** A compact outline of any JSON value: keys and types, the first record of each list, list lengths. Values only when asked. */
export function outline(v: unknown, values: boolean, depth = 0, pad = ''): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (depth > 7) return `[${v.length}× …]`;
    return `[${v.length}× ${outline(v[0], values, depth + 1, pad)}]`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as object);
    if (!keys.length) return '{}';
    if (depth > 7) return `{ ${keys.length} keys }`;
    const inner = `${pad}  `;
    const lines = keys.slice(0, 40).map(k => `${inner}${k}: ${outline((v as Record<string, unknown>)[k], values, depth + 1, inner)}`);
    if (keys.length > 40) lines.push(`${inner}… ${keys.length - 40} more keys`);
    return `{\n${lines.join('\n')}\n${pad}}`;
  }
  if (typeof v === 'string') {
    if (values) return JSON.stringify(clip(v));
    // a string that holds JSON (insight columns do) is outlined too
    if (/^\s*[[{]/.test(v)) { try { return `string(json) ${outline(JSON.parse(v), values, depth + 1, pad)}`; } catch (e) { /* plain text */ } }
    return 'string';
  }
  return values ? clip(v) : typeof v;
}

const codeOf = (fn: unknown): string => clip(String(fn).replace(/\s+/g, ' '), 1500);

/** Parameters with ids made anonymous, for the report. */
const showParams = (p: Record<string, unknown>, values: boolean): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  Object.keys(p).forEach(k => {
    const v = p[k];
    if (k === 'tenantId') out[k] = '<tenant>';
    else if (k === 'columns' && Array.isArray(v)) out[k] = `[${v.length} columns]`;
    else out[k] = values ? v : Array.isArray(v) ? `[${v.length}]` : typeof v === 'string' && v ? '<text>' : v;
  });
  return out;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`no answer after ${ms / 1000} s`)), ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });
}

/** Runs the check. `onResult` is called as each result arrives, in order. */
export async function runApiCheck(hub: DataHub, opt: CheckOptions, onResult: (r: CheckResult) => void): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const push = (r: CheckResult) => { out.push(r); onResult(r); };
  const a = api();

  // ids the detail sources need: taken from the first incident and alerts, unless given
  let incidentId = (opt.incidentId || '').trim();
  let alertIds: string[] = [];
  const read = async (q: QueryName, param: string): Promise<{ data?: any; rows: Row[]; ms: number; params: Record<string, unknown>; error?: string }> => {
    const def = SOURCES.find(s => s.id === q)!;
    const params = hub.paramsFor(q, param);
    const t0 = Date.now();
    try {
      const fn = a[def.api];
      const data = await withTimeout(Promise.resolve(fn(params)), 25000);
      return { data, rows: toRows(q, data), ms: Date.now() - t0, params };
    } catch (e: any) {
      return { rows: [], ms: Date.now() - t0, params, error: e && e.message ? String(e.message) : String(e) };
    }
  };

  for (const def of SOURCES) {
    const base: CheckResult = { name: def.label, api: def.api, kind: 'source', status: 'ok' };
    if (opt.code && a[def.api]) base.code = codeOf(a[def.api]);
    if (typeof a[def.api] !== 'function') { push({ ...base, status: 'missing', note: 'This function is not in contentAnalyticsAPI here.' }); continue; }
    if (def.id === 'getMetricSeries') { push({ ...base, status: 'skipped', note: 'Built from the metric helpers below (group, metric, resource), checked there.' }); continue; }
    let param = '';
    if (def.param && def.param.required) {
      if (def.id === 'getRawAlerts') param = "state != 'clear'";
      else if (def.id === 'getTopologyResource') param = (opt.resourceId || '').trim();
      else if (def.id === 'getRelatedStories') param = incidentId || alertIds.slice(0, 2).join(', ');
      else param = incidentId;
      if (!param) { push({ ...base, status: 'skipped', note: `Needs ${def.param.label.toLowerCase()}: type one at the top and run again.` }); continue; }
    }
    const r = await read(def.id, param);
    if (def.id === 'getStories' && !incidentId) {
      // an incident that has alerts (open ones first), so the incident sources have something to show
      const withAlerts = r.rows.filter(x => Number(x.alertCount) > 0);
      const pick = withAlerts.find(x => x.state !== 'closed' && x.state !== 'resolved') || withAlerts[0] || r.rows[0];
      incidentId = String((pick || {}).id || '');
    }
    if (def.id === 'getAlerts') alertIds = r.rows.slice(0, 3).map(x => String(x.id));
    const fields = Array.from(new Set(r.rows.slice(0, 50).flatMap(x => Object.keys(x)))).sort();
    push({
      ...base,
      status: r.error ? 'error' : r.rows.length ? 'ok' : 'empty',
      ms: r.ms,
      params: showParams(r.params, opt.values),
      ...(r.error ? { note: r.error } : {}),
      ...(r.data !== undefined ? { outline: outline(r.data, opt.values) } : {}),
      rows: r.rows.length,
      fields,
      ...(opt.values && r.rows[0] ? { sample: r.rows[0] } : {})
    });
  }

  // Read functions this tenant has beyond the toolkit's list: called once with the tenant (and the incident where it
  // obviously needs one), to see what they return. All are reads.
  const EXTRA: Array<[string, Record<string, unknown>]> = [
    ['getIncident', { incident: incidentId }], ['getAlertSummary', {}], ['getStandingAlertCount', {}], ['getStandingStoryCount', {}],
    ['getPoliciesSummary', {}], ['getPoliciesMetadata', {}], ['getTickets', {}], ['getProfiles', {}], ['getSeasonalFindings', {}],
    ['getDataQualityIssues', {}], ['getBlockedResources', {}], ['getStoriesWithAlertFilter', { filter: "state != 'clear'" }], ['getAlertSchema', {}], ['getStorySchema', {}]
  ];
  for (const [name, extra] of EXTRA) {
    if (typeof a[name] !== 'function') { push({ name, api: name, kind: 'extra', status: 'missing' }); continue; }
    const params = { tenantId: hub.paramsFor('getPeople', '').tenantId, ...extra };
    const t0 = Date.now();
    try {
      const data = await withTimeout(Promise.resolve(a[name](params)), 25000);
      const list = data === undefined || data === null ? [] : [data];
      push({ name, api: name, kind: 'extra', status: list.length ? 'ok' : 'empty', ms: Date.now() - t0, params: showParams(params, opt.values), outline: outline(data, opt.values) });
    } catch (e: any) {
      push({ name, api: name, kind: 'extra', status: 'error', ms: Date.now() - t0, params: showParams(params, opt.values), note: e && e.message ? String(e.message).slice(0, 400) : String(e) });
    }
  }

  push(await schemaCheck(a));

  HELPERS.forEach(name => push({ name, api: name, kind: 'helper', status: typeof a[name] === 'function' ? 'ok' : 'missing', note: 'Looked up only.', ...(opt.code && a[name] ? { code: codeOf(a[name]) } : {}) }));

  const mutations = Array.from(new Set([...ROW_ACTIONS, ...PLATFORM_ACTIONS].map(x => x.call({}, []).name)));
  mutations.forEach(name => push({ name, api: name, kind: 'mutation', status: typeof a[name] === 'function' ? 'ok' : 'missing', note: 'Looked up only: never called by the check.', ...(opt.code && a[name] ? { code: codeOf(a[name]) } : {}) }));
  return out;
}

/** Every function contentAnalyticsAPI offers here (to compare with the toolkit's list). */
export const availableFunctions = (): string[] => Object.keys(api()).filter(k => typeof api()[k] === 'function').sort();

/** The report as Markdown, to paste into a chat, an issue or a file. */
export function reportText(results: CheckResult[], meta: { version: string; values: boolean }): string {
  const count = (s: CheckStatus) => results.filter(r => r.status === s).length;
  const lines = [
    `# Concert Operate API check`,
    ``,
    `Designer ${meta.version} · ${new Date().toISOString()} · ${meta.values ? 'with sample values' : 'structure only, no values'}`,
    ``,
    `OK ${count('ok')} · empty ${count('empty')} · error ${count('error')} · missing ${count('missing')} · skipped ${count('skipped')}`,
    ``,
    `Functions in contentAnalyticsAPI: ${availableFunctions().join(', ') || '(none found)'}`,
    ``
  ];
  results.forEach(r => {
    lines.push(`## ${r.name} (${r.api}) · ${r.kind} · ${r.status.toUpperCase()}${r.ms !== undefined ? ` · ${r.ms} ms` : ''}`);
    if (r.note) lines.push(``, r.note);
    if (r.params) lines.push(``, `Parameters: \`${JSON.stringify(r.params)}\``);
    if (r.kind === 'source' && r.rows !== undefined) lines.push(``, `Rows read: ${r.rows}${r.fields && r.fields.length ? ` · fields: ${r.fields.join(', ')}` : ''}`);
    if (r.sample) lines.push(``, 'First row:', '```json', JSON.stringify(r.sample, null, 2), '```');
    if (r.outline) lines.push(``, 'Response:', '```', r.outline, '```');
    if (r.code) lines.push(``, 'Function code (start):', '```js', r.code, '```');
    lines.push(``);
  });
  return lines.join('\n');
}

/** Asks the API to describe itself (GraphQL introspection), for the exact parameters of every query and mutation. Read-only. */
const INTROSPECT = `query DesignerIntrospection { __schema { queryType { name } mutationType { name } types { name kind fields { name args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } } }`;

const typeText = (t: any): string => (!t ? '?' : t.kind === 'NON_NULL' ? `${typeText(t.ofType)}!` : t.kind === 'LIST' ? `[${typeText(t.ofType)}]` : t.name || '?');

async function schemaCheck(a: Record<string, any>): Promise<CheckResult> {
  const base: CheckResult = { name: 'API description (GraphQL introspection)', api: 'graphql', kind: 'schema', status: 'ok' };
  if (typeof a.graphql !== 'function') return { ...base, status: 'missing', note: 'There is no graphql function here.' };
  const tries: Array<[string, () => unknown]> = [
    ['graphql({ query })', () => a.graphql({ query: INTROSPECT })],
    ['graphql(query)', () => a.graphql(INTROSPECT)],
    ['graphql({ query, variables })', () => a.graphql({ query: INTROSPECT, variables: {} })]
  ];
  const errors: string[] = [];
  for (const [how, call] of tries) {
    const t0 = Date.now();
    try {
      const res: any = await withTimeout(Promise.resolve(call()), 25000);
      let schema: any;
      const find = (v: any, d: number) => { if (schema || !v || typeof v !== 'object' || d > 4) return; if (v.__schema) { schema = v.__schema; return; } Object.keys(v).forEach(k => find(v[k], d + 1)); };
      find(res, 0);
      if (!schema || !Array.isArray(schema.types)) { errors.push(`${how}: answered without a schema (${outline(res, false).slice(0, 200)})`); continue; }
      const roots = [schema.queryType && schema.queryType.name, schema.mutationType && schema.mutationType.name].filter(Boolean);
      const keep = schema.types.filter((t: any) => t && Array.isArray(t.fields) && (roots.includes(t.name) || /tenant|mutation/i.test(t.name)) && !/^__/.test(t.name));
      const lines: string[] = [];
      keep.forEach((t: any) => {
        lines.push(`type ${t.name}${roots.includes(t.name) ? ` (${t.name === roots[0] ? 'queries' : 'mutations'})` : ''}`);
        t.fields.forEach((f: any) => lines.push(`  ${f.name}(${(f.args || []).map((x: any) => `${x.name}: ${typeText(x.type)}`).join(', ')})`));
      });
      return { ...base, ms: Date.now() - t0, note: `Answered to ${how}. ${keep.length} types with their fields and parameters.`, outline: lines.join('\n') };
    } catch (e: any) {
      errors.push(`${how}: ${e && e.message ? String(e.message).slice(0, 200) : String(e)}`);
    }
  }
  return { ...base, status: 'error', note: errors.join('\n') };
}
