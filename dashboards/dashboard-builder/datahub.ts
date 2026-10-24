/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * One fetch per distinct (query, filter), shared by every widget that asks for it. Refreshes on the shortest
 * interval any subscriber asked for. Responses that arrive out of order are ignored.
 */

import { EXTRA_COLUMNS, TIER1, TIER2 } from './rows';
import { ALERT_QUERY_PARAMS, INCIDENT_QUERY_PARAMS } from '../constants';
import { QueryName, Row } from './types';
import { ALERT_COLUMNS, toRows } from './rows';

export type Fetcher = (query: QueryName, params: Record<string, unknown>) => Promise<any>;

export interface SourceState {
  rows: Row[];
  loading: boolean;
  error?: string;
  updated?: number;
}

const EMPTY: SourceState = { rows: [], loading: false };

interface Entry {
  query: QueryName;
  filter: string;
  state: SourceState;
  subs: Map<number, { refresh: number; fn: () => void }>;
  timer?: ReturnType<typeof setInterval>;
  timerMs: number;
  seq: number;
  started: boolean;
}

export function sourceKey(query: QueryName, filter?: string): string {
  return `${query}|${(filter || '').trim()}`;
}

/** A metric widget names its series as "group|metric|resource" in its filter; the resource may be left empty to take the first one. */
export function parseMetricSpec(spec: string): { group: string; metric: string; resource: string } {
  const [group = '', metric = '', ...rest] = String(spec || '').split('|');
  return { group: group.trim(), metric: metric.trim(), resource: rest.join('|').trim() };
}
const contentApi = (): Record<string, (o: object) => Promise<any>> | undefined => (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI;
const idsOf = (res: any): string[] => {
  const t = res && res.tenant;
  const m = t && (t.metricGroups || t.metrics || t.resources);
  return m && Array.isArray(m.mIds) ? m.mIds.map(String) : [];
};
export function listMetricGroups(tenantId: string): Promise<string[]> {
  const a = contentApi(); return a && a.getMetricGroups ? a.getMetricGroups({ tenantId }).then(idsOf, (): string[] => []) : Promise.resolve([]);
}
export function listMetrics(tenantId: string, group: string): Promise<string[]> {
  const a = contentApi(); return a && a.getMetrics && group ? a.getMetrics({ tenantId, group }).then(idsOf, (): string[] => []) : Promise.resolve([]);
}
export function listMetricResources(tenantId: string, group: string, metric: string): Promise<string[]> {
  const a = contentApi(); return a && a.getMetricResources && group && metric ? a.getMetricResources({ tenantId, group, metric }).then(idsOf, (): string[] => []) : Promise.resolve([]);
}
async function fetchMetricSeries(tenantId: string, spec: string): Promise<any> {
  const a = contentApi();
  const { group, metric, resource: given } = parseMetricSpec(spec);
  if (!a || !a.getMetricManagerData) throw new Error('Metric data is not available in this environment.');
  if (!group || !metric) throw new Error('Choose a metric group and a metric in the widget settings.');
  const resource = given || (await listMetricResources(tenantId, group, metric))[0];
  if (!resource) throw new Error(`No resource reports ${metric} in ${group}.`);
  const end = Date.now(), start = end - 6 * 3600e3;
  const [actual, forecast] = await Promise.all([
    a.getMetricManagerData({ tenantId, resource, group, metric, startTime: start, endTime: end }),
    a.getMetricForecastData ? a.getMetricForecastData({ tenantId, resource, group, metric }).catch((): any => undefined) : Promise.resolve(undefined)
  ]);
  return { resource: resource.split(':::')[0], metric, actual: actual?.tenant?.metricManager, forecast: forecast?.tenant?.metricForecast };
}

export function defaultFetcher(query: QueryName, params: Record<string, unknown>): Promise<any> {
  if (query === 'getMetricSeries') return fetchMetricSeries(String(params.tenantId || ''), String(params.filter || ''));
  const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.[query === 'getApplications' ? 'getImpactedApplications' : query];
  if (typeof fn !== 'function') return Promise.reject(new Error(`The ${query} query is not available in this environment.`));
  return fn(params);
}

export interface Directory { users: string[]; groups: string[]; /** Each user's groups (from getUsersAndGroups). */ membership?: Record<string, string[]> }
/** Reads names out of a getUsersAndGroups response without assuming its exact shape: any list under a key that mentions "group" or "user". */
export function parseDirectory(data: any): Directory {
  const out: Directory = { users: [], groups: [] };
  const name = (x: any): string | undefined => {
    if (typeof x === 'string') return x;
    if (!x || typeof x !== 'object') return undefined;
    for (const k of ['name', 'displayName', 'groupName', 'userName', 'username', 'email', 'id']) if (typeof x[k] === 'string' && x[k]) return x[k];
    return undefined;
  };
  const walk = (o: any, depth: number) => {
    if (!o || typeof o !== 'object' || depth > 4) return;
    Object.keys(o).forEach(k => {
      const v = o[k];
      const key = k.toLowerCase();
      if (Array.isArray(v) && (key.includes('group') || key.includes('user'))) {
        const names = v.map(name).filter((n): n is string => Boolean(n));
        (key.includes('group') ? out.groups : out.users).push(...names);
      } else if (v && typeof v === 'object') walk(v, depth + 1);
    });
  };
  walk(data, 0);
  // Who belongs to which group: users[].groups[].id
  const us: any[] = (data && data.tenant && Array.isArray(data.tenant.users)) ? data.tenant.users : [];
  const membership: Record<string, string[]> = {};
  us.forEach(u => { const id = name(u); const gs = Array.isArray(u && u.groups) ? (u.groups as any[]).map(name).filter((g): g is string => Boolean(g)) : []; if (id && gs.length) membership[id] = gs; });
  if (Object.keys(membership).length) out.membership = membership;
  Object.values(membership).forEach(gs => out.groups.push(...gs));
  out.users = Array.from(new Set(out.users)).sort();
  out.groups = Array.from(new Set(out.groups)).sort();
  return out;
}

export class DataHub {
  private entries = new Map<string, Entry>();
  private nextSub = 1;

  constructor(private fetcher: Fetcher = defaultFetcher, private tenantId: string = ALERT_QUERY_PARAMS.tenantId) {}

  paramsFor(query: QueryName, filter: string): Record<string, unknown> {
    if (query === 'getAlerts') {
      return { tenantId: this.tenantId, columns: ALERT_COLUMNS.filter(c => !EXTRA_COLUMNS.includes(c) || (TIER1.includes(c) ? this.extras >= 1 : this.extras >= 2)), filter: filter || ALERT_QUERY_PARAMS.filter, format: ALERT_QUERY_PARAMS.format };
    }
    if (query === 'getMetricSeries') return { tenantId: this.tenantId, filter };
    if (query === 'getApplications') return { tenantId: this.tenantId, includeCount: true, includeSeverity: true, includeStoryPriority: true, includeBusinessCriticality: true, applicationIds: '' };
    return { ...INCIDENT_QUERY_PARAMS, tenantId: this.tenantId };
  }

  snapshot(key: string): SourceState {
    const e = this.entries.get(key);
    return e ? e.state : EMPTY;
  }

  /** Start using a source. Returns a function that stops using it. */
  acquire(query: QueryName, filter: string | undefined, refreshSeconds: number, onChange: () => void): () => void {
    const key = sourceKey(query, filter);
    let e = this.entries.get(key);
    if (!e) {
      e = { query, filter: (filter || '').trim(), state: { rows: [], loading: false }, subs: new Map(), timerMs: 0, seq: 0, started: false };
      this.entries.set(key, e);
    }
    const id = this.nextSub++;
    e.subs.set(id, { refresh: refreshSeconds > 0 ? refreshSeconds : 0, fn: onChange });
    this.retime(e);
    if (!e.started) {
      e.started = true;
      this.load(key);
    }
    return () => {
      const cur = this.entries.get(key);
      if (!cur) return;
      cur.subs.delete(id);
      this.retime(cur);
      if (cur.subs.size === 0) {
        if (cur.timer) clearInterval(cur.timer);
        cur.seq++; // anything still in flight is stale
        this.entries.delete(key);
      }
    };
  }

  refresh(key?: string) {
    if (key) { this.load(key); return; }
    Array.from(this.entries.keys()).forEach(k => this.load(k));
  }

  private retime(e: Entry) {
    const wanted = Array.from(e.subs.values()).map(s => s.refresh).filter(r => r > 0);
    const ms = wanted.length ? Math.min(...wanted) * 1000 : 0;
    if (ms === e.timerMs) return;
    if (e.timer) clearInterval(e.timer);
    e.timer = undefined;
    e.timerMs = ms;
    if (ms > 0) e.timer = setInterval(() => this.load(sourceKey(e.query, e.filter)), ms);
  }

  private notify(e: Entry) {
    Array.from(e.subs.values()).forEach(s => s.fn());
  }

  private dir?: Promise<Directory>;
  /** The people and teams of the tenant (getUsersAndGroups). Empty when the query is not available. */
  directory(): Promise<Directory> {
    if (!this.dir) {
      const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.getUsersAndGroups;
      this.dir = this.fetcher === defaultFetcher && typeof fn === 'function'
        ? Promise.resolve().then(() => fn({ tenantId: this.tenantId })).then(parseDirectory, () => ({ users: [], groups: [] } as Directory)).then(x => { this.dirNow = x; this.entries.forEach(e => { if (this.applyTeams(e)) this.notify(e); }); return x; })
        : Promise.resolve({ users: [], groups: [] });
    }
    return this.dir;
  }
  /** Names known from the directory, for the Team and Owner filters. */
  directoryNames(field: string): string[] {
    const d = this.dirNow;
    return field === 'team' ? d.groups : field === 'owner' ? d.users : [];
  }
  private dirNow: Directory = { users: [], groups: [] };
  /** An alert or incident with an owner but no team takes the team of the owner's user group (not the catch-all "All Users" when there is a real one). */
  private applyTeams(e: Entry): boolean {
    const m = this.dirNow.membership;
    if (!m || (e.query !== 'getAlerts' && e.query !== 'getStories')) return false;
    let changed = false;
    const rows = e.state.rows.map(r => {
      if (r.team || typeof r.owner !== 'string' || !m[r.owner]) return r;
      const gs = m[r.owner];
      const team = gs.find(g => g !== 'All Users') || gs[0];
      if (!team) return r;
      changed = true;
      return { ...r, team };
    });
    if (changed) e.state = { ...e.state, rows };
    return changed;
  }

  /** Runbooks per alert id, learnt from the alerts query; incidents add up the runbooks of their alerts. */
  private rb = new Map<string, number>();
  private extras = 2; // 2 = all optional columns, 1 = runbooks and event count only, 0 = none
  private rbNames = new Map<string, string>();
  private rbAsked = new Set<string>();
  /** Puts runbook names (learnt from getRunbook) on the alert rows that mention them. */
  private applyNames(e: Entry): boolean {
    let changed = false;
    const rows = e.state.rows.map(r => {
      if (typeof r.runbookIds !== 'string') return r;
      const names = r.runbookIds.split(',').map(i => this.rbNames.get(i)).filter((x): x is string => Boolean(x));
      if (!names.length || r.runbookName === names.join(', ')) return r;
      changed = true;
      return { ...r, runbookName: names.join(', ') };
    });
    if (changed) e.state = { ...e.state, rows };
    return changed;
  }
  private nameRunbooks(from: Entry) {
    this.applyNames(from);
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.getRunbook;
    if (this.fetcher !== defaultFetcher || typeof fn !== 'function') return;
    const need = new Set<string>();
    from.state.rows.forEach(r => { if (typeof r.runbookIds === 'string') r.runbookIds.split(',').forEach(i => { if (i && !this.rbAsked.has(i)) need.add(i); }); });
    Array.from(need).slice(0, 25).forEach(id => {
      this.rbAsked.add(id);
      Promise.resolve().then(() => fn({ tenantId: this.tenantId, runbookId: id })).then(res => {
        const name = res && res.tenant && res.tenant.runbook && res.tenant.runbook.name;
        if (!name) return;
        this.rbNames.set(id, String(name));
        this.entries.forEach(x => { if (x.query === 'getAlerts' && this.applyNames(x)) this.notify(x); });
      }, () => { /* a runbook that cannot be read keeps its id only */ });
    });
  }
  private shareRunbooks(from: Entry) {
    if (from.query === 'getAlerts') this.nameRunbooks(from);
    if (from.query === 'getAlerts') from.state.rows.forEach(r => { if (typeof r.runbooks === 'number') this.rb.set(String(r.id), r.runbooks); });
    if (this.rb.size === 0) return;
    this.entries.forEach(e => {
      if (e.query !== 'getStories') return;
      const rows = e.state.rows.map(r => ({ ...r, runbooks: String(r.alertIds || '').split(',').filter(Boolean).reduce((n, id) => n + (this.rb.get(id) ?? 0), 0) }));
      e.state = { ...e.state, rows };
      if (e !== from) this.notify(e);
    });
  }

  private load(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    const seq = ++e.seq;
    if (e.query === 'getAlerts' || e.query === 'getStories') void this.directory(); // who is in which group, so owners can give their rows a team
    e.state = { ...e.state, loading: true };
    this.notify(e);
    let p: Promise<any>;
    try {
      p = this.fetcher(e.query, this.paramsFor(e.query, e.filter));
      if (e.query === 'getAlerts' && this.extras > 0) {
        // The optional columns (runbooks, event count, insights): if the server rejects them, carry on with fewer.
        const again = (err: any): Promise<any> => {
          if (this.extras <= 0) return Promise.reject(err);
          this.extras = this.extras === 2 ? 1 : 0;
          return this.fetcher(e.query, this.paramsFor(e.query, e.filter)).catch(again);
        };
        p = p.catch(again);
      }
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then(
      data => {
        if (e.seq !== seq) return;
        e.state = { rows: toRows(e.query, data), loading: false, updated: Date.now() };
        this.applyTeams(e);
        this.notify(e);
        this.shareRunbooks(e);
      },
      err => {
        if (e.seq !== seq) return;
        const msg = err && err.message ? String(err.message) : 'The query failed.';
        // Keep the last good rows on screen next to the error rather than blanking the widget.
        e.state = { rows: e.state.rows, loading: false, error: msg, updated: e.state.updated };
        this.notify(e);
      }
    );
  }
}
