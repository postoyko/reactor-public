/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A data snapshot: the answers of the read functions the Designer uses, recorded once inside Concert Operate, so the
 * Workbench can design on the tenant's real alerts, incidents and policies instead of sample data. Only reads are
 * recorded, nothing is changed. The Workbench serves each recorded answer back for a request with the same
 * parameters (callKey), ignoring the tenant id and Apollo's own options; scaffold/public/preview-stub.js holds the
 * same rule.
 */

import { DataHub } from './datahub';
import { toRows } from './rows';
import { SOURCES } from './sources';
import { QueryName } from './types';

export const SNAPSHOT_KIND = 'reactor-data-snapshot';
export const SNAPSHOT_VERSION = 1;

export interface SnapshotCall { fn: string; key: string; data: unknown }
export interface Snapshot { kind: typeof SNAPSHOT_KIND; version: number; taken: string; designer: string; calls: SnapshotCall[] }

/** Parameters that do not change the answer's content: left out of the key. */
export const IGNORED = ['tenantId', 'fetchPolicy', 'nextFetchPolicy', 'notifyOnNetworkStatusChange', 'pollInterval', 'columns', 'format'];

/** The parameters that pick an answer, as stable text (keys sorted). */
export function callKey(params: Record<string, unknown> | undefined): string {
  const p = params || {};
  const keys = Object.keys(p).filter(k => !IGNORED.includes(k) && p[k] !== undefined).sort();
  return JSON.stringify(keys.map(k => [k, p[k]]));
}

/** How many incidents get their alerts, alert groups and related incidents recorded (for drill-downs). */
export const INCIDENTS_RECORDED = 10;

const api = (): Record<string, any> => ((window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI) || {};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`no answer after ${ms / 1000} s`)), ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });
}

/**
 * Records the snapshot: every source without a parameter, then for the first open incidents (those with alerts)
 * their alerts, alert groups and related incidents, both kinds of saved filter, and the people list.
 * `onProgress` gets a short line per call. Failures are skipped and counted.
 */
export async function recordSnapshot(hub: DataHub, version: string, onProgress: (text: string) => void): Promise<{ snapshot: Snapshot; failed: string[] }> {
  const a = api();
  const calls: SnapshotCall[] = [];
  const failed: string[] = [];
  const seen = new Set<string>();
  const call = async (fn: string, params: Record<string, unknown>, label: string): Promise<unknown> => {
    const key = callKey(params);
    if (typeof a[fn] !== 'function' || seen.has(`${fn}|${key}`)) return undefined;
    seen.add(`${fn}|${key}`);
    onProgress(label);
    try {
      const data = await withTimeout(Promise.resolve(a[fn](params)), 60000);
      calls.push({ fn, key, data });
      return data;
    } catch (e) {
      failed.push(label);
      return undefined;
    }
  };
  const source = (q: QueryName, param: string, label: string) => {
    const def = SOURCES.find(s => s.id === q)!;
    return call(def.api, hub.paramsFor(q, param), label);
  };

  let incidents: string[] = [];
  for (const def of SOURCES) {
    if (def.id === 'getMetricSeries') continue;
    if (def.param && def.param.required && def.id !== 'getRawAlerts') continue;
    const data = await source(def.id, def.id === 'getRawAlerts' ? 'state != \'clear\'' : '', def.label);
    if (def.id === 'getStories' && data !== undefined) {
      const rows = toRows('getStories', data);
      const open = rows.filter(r => Number(r.alertCount) > 0 && r.state !== 'closed' && r.state !== 'resolved');
      incidents = [...open, ...rows.filter(r => !open.includes(r))].map(r => String(r.id || '')).filter(Boolean).slice(0, INCIDENTS_RECORDED);
    }
  }
  await source('getFiltersViews', 'incident', 'Saved filters (incident)');
  for (const id of incidents) {
    await source('getIncidentAlerts', id, `Alerts of incident ${id}`);
    await source('getStoryAlertsGroups', id, `Alert groups of incident ${id}`);
    await source('getRelatedStories', id, `Related incidents of ${id}`);
  }
  await call('getUsersAndGroups', { tenantId: hub.paramsFor('getPeople', '').tenantId }, 'People and teams');

  return { snapshot: { kind: SNAPSHOT_KIND, version: SNAPSHOT_VERSION, taken: new Date().toISOString(), designer: version, calls }, failed };
}
