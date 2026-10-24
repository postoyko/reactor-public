/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reading alerts and incidents from the toolkit API (same queries as Blast Radius), the update check and small helpers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ALERT_QUERY_PARAMS, INCIDENT_QUERY_PARAMS } from '../constants';
import { Alert, GroupInfo, Incident, adaptAlertsEx, adaptIncidents } from './logic';
import { sampleData } from './sample';
import { PANEL_VERSION } from './version';

export interface FeedProps { refreshSeconds?: number; alertFilter?: string; windowHours?: number; sample?: boolean; groupColumns?: string[] }

export interface MenuEntry { label?: string; hint?: string; onClick?: () => void; disabled?: boolean; sep?: boolean; head?: boolean }

export const api = (): Record<string, (o: object) => Promise<any>> | undefined => (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI;
export const ago = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`; };
export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const semver = (v: string) => (/(\d+)\.(\d+)\.(\d+)/.exec(v) || [0, 0, 0, 0]).slice(1).map(Number);
export const isNewer = (a: string, b: string) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; };
export const DEFAULT_UPDATE_URL = 'http://127.0.0.1:4000/api/panel-version/incident-atlas';

/** Asks the update URL for the newest version now and every 30 minutes. Returns it only when it is newer than this panel. */
export function useNewVersion(url: string | undefined): string | null {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    const u = url === undefined ? DEFAULT_UPDATE_URL : url;
    if (!u) return;
    let off = false;
    const check = () => {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = window.setTimeout(() => ctl && ctl.abort(), 4000);
      fetch(u, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(r => (r.ok ? r.json() : null)).then(j => { if (!off && j && typeof j.version === 'string') setLatest(isNewer(j.version, PANEL_VERSION) ? j.version : null); }).catch(() => { /* Studio not running: stay quiet */ }).then(() => window.clearTimeout(to));
    };
    check(); const id = window.setInterval(check, 30 * 60000);
    return () => { off = true; window.clearInterval(id); };
  }, [url]);
  return latest;
}

/** Field names a group (parent / child) alert might use; asked for once, dropped if the server refuses them. */
export const GROUP_PROBE = ['parentId', 'childIds', 'groupId'];

const INC_COLORS = ['#8a3ffc', '#1192e8', '#007d79', '#ee5396', '#b28600', '#9f1853', '#198038', '#0072c3'];

export interface Feed { filter?: string; alerts: Alert[]; incidents: Incident[]; status: 'loading' | 'ok' | 'error'; error?: string; updated: number; sample: boolean; groups?: GroupInfo }

export function useFeed(p: FeedProps): [Feed, () => void, () => void] {
  const [feed, setFeed] = useState<Feed>({ alerts: [], incidents: [], status: 'loading', updated: Date.now(), sample: !!p.sample });
  const sampleRef = useRef(!!p.sample);
  const seq = useRef(0);
  const probeOk = useRef<boolean | undefined>(undefined), loggedGroups = useRef(false);
  const load = useCallback(async () => {
    if (sampleRef.current) { const d = sampleData(Date.now()); setFeed({ ...d, status: 'ok', updated: Date.now(), sample: true }); return; }
    const a = api();
    const me = ++seq.current;
    if (!a || typeof a.getAlerts !== 'function' || typeof a.getStories !== 'function') {
      setFeed(f => ({ ...f, status: 'error', error: 'This page is not running inside Concert Operate, so there is no alert or incident data to read.', sample: false }));
      return;
    }
    try {
      const base = String(p.alertFilter || ALERT_QUERY_PARAMS.filter || '');
      const cut = p.windowHours ? new Date(Date.now() - p.windowHours * 3600e3).toISOString() : '';
      const effFilter = cut ? `${base ? base + ' and ' : ''}(firstOccurrenceTime >= '${cut}' or lastOccurrenceTime >= '${cut}')` : base;
      const cols = (extra: string[]) => (extra.length ? [...ALERT_QUERY_PARAMS.columns, ...extra] : ALERT_QUERY_PARAMS.columns);
      const q = (extra: string[]) => a.getAlerts({ tenantId: ALERT_QUERY_PARAMS.tenantId, columns: cols(extra), filter: effFilter, format: ALERT_QUERY_PARAMS.format });
      // Ask for likely group fields too; if the server rejects them, fall back to the normal columns (and remember that).
      const want = [...(p.groupColumns || []), ...(probeOk.current === false ? [] : GROUP_PROBE)].filter((x, i, l) => l.indexOf(x) === i);
      const alertsP = (async () => {
        if (probeOk.current === false || !want.length) return q(p.groupColumns || []);
        try { const r = await q(want); if (r && r.errors && r.errors[0]) throw new Error('probe'); probeOk.current = true; return r; } catch (e) { probeOk.current = false; return q(p.groupColumns || []); }
      })();
      const [ar, ir] = await Promise.all([alertsP, a.getStories({ ...INCIDENT_QUERY_PARAMS, tenantId: ALERT_QUERY_PARAMS.tenantId })]);
      if (me !== seq.current) return;
      const err = (ar && ar.errors && ar.errors[0]) || (ir && ir.errors && ir.errors[0]);
      if (err) throw new Error(String(err.message || 'The query returned an error'));
      const { alerts: al, groups } = adaptAlertsEx(ar, p.groupColumns || []);
      if (!loggedGroups.current) { loggedGroups.current = true; try { console.info('[Blast Radius] alert columns returned:', groups.seenColumns, '| insight types:', groups.seenInsightTypes, '| group fields detected:', [...groups.columns, ...groups.insights]); } catch (e) { /* ignore */ } }
      setFeed({ alerts: al, incidents: adaptIncidents(ir), status: 'ok', updated: Date.now(), sample: false, groups, filter: effFilter });
    } catch (e) {
      if (me === seq.current) setFeed(f => ({ ...f, status: 'error', error: e instanceof Error ? e.message : String(e), sample: false }));
    }
  }, [p.alertFilter, p.groupColumns, p.windowHours]);
  useEffect(() => {
    load();
    const ms = Math.max(5, p.refreshSeconds || 20) * 1000;
    const id = window.setInterval(() => { if (!sampleRef.current) load(); }, ms);
    return () => window.clearInterval(id);
  }, [load, p.refreshSeconds]);
  const useSample = useCallback(() => { sampleRef.current = true; load(); }, [load]);
  const useLive = useCallback(() => { sampleRef.current = false; setFeed(f => ({ ...f, status: 'loading', sample: false, alerts: [], incidents: [] })); load(); }, [load]);
  return [feed, useSample, useLive];
}

