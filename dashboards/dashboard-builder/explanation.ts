/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * "Explain this": what a set of rows has in common, worked out from the rows themselves (no guessing). Explain.tsx adds
 * Concert's own probable cause for the incidents involved. Plain data, no React. (Named explanation.ts, not explain.ts: macOS would take that for Explain.tsx.)
 */

import { SEVERITY_LABELS } from './rows';
import { Row } from './types';

const HOUR = 3600000;

/** A time field as milliseconds (ISO text, epoch milliseconds or epoch seconds), or NaN. */
export function ms(v: unknown): number {
  if (typeof v === 'number') return v > 1e11 ? v : v > 1e9 ? v * 1000 : NaN;
  if (typeof v === 'string' && /^\d{10,13}$/.test(v)) return ms(Number(v));
  const d = Date.parse(String(v === undefined || v === null ? '' : v));
  return Number.isFinite(d) ? d : NaN;
}

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const empty = (s: string) => !s || s === '-' || s === 'None' || s === 'No';

/** The most common values of a field, most frequent first: [value, count]. Empty values ("-", "None") are left out. */
export function top(rows: Row[], field: string, n = 3): Array<[string, number]> {
  const m = new Map<string, number>();
  rows.forEach(r => { const v = text(r[field]); if (!empty(v)) m.set(v, (m.get(v) || 0) + 1); });
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

export interface AlertExplanation {
  count: number;
  /** Severity label and count, Critical first. */
  severities: Array<[string, number]>;
  first?: number;
  last?: number;
  /** Alerts that started in the hour before `now`, and the hourly average over the 23 hours before that. */
  lastHour: number;
  perHourBefore: number;
  resources: Array<[string, number]>;
  services: Array<[string, number]>;
  types: Array<[string, number]>;
  inIncidents: number;
  /** Incidents involved (their id is the alert's causal group), most alerts first. */
  incidents: Array<[string, number]>;
  signals: { anomaly: number; seasonal: number; goldenSignal: number; logFixes: number };
  runbooks: { alerts: number; automated: number };
}

export function explainAlerts(rows: Row[], now: number = Date.now()): AlertExplanation {
  const sev = new Map<string, number>();
  rows.forEach(r => { const l = text(r.severityLabel) || 'Unknown'; sev.set(l, (sev.get(l) || 0) + 1); });
  const order = (l: string) => { const i = SEVERITY_LABELS.indexOf(l); return i < 0 ? -1 : i; };
  const starts = rows.map(r => ms(r.firstOccurrence)).filter(Number.isFinite);
  const ends = rows.map(r => ms(r.lastOccurrence)).filter(Number.isFinite);
  const lastHour = starts.filter(t => t > now - HOUR && t <= now).length;
  const before = starts.filter(t => t > now - 24 * HOUR && t <= now - HOUR).length;
  const yes = (r: Row, f: string) => text(r[f]).toLowerCase() === 'yes';
  const inInc = rows.filter(r => yes(r, 'inIncident') || Number(r.incidentCount) > 0);
  return {
    count: rows.length,
    severities: Array.from(sev.entries()).sort((a, b) => order(b[0]) - order(a[0]) || b[1] - a[1]),
    first: starts.length ? Math.min(...starts) : undefined,
    last: ends.length ? Math.max(...ends) : starts.length ? Math.max(...starts) : undefined,
    lastHour,
    perHourBefore: before / 23,
    resources: top(rows, 'resource'),
    services: top(rows, 'service'),
    types: top(rows, 'type'),
    inIncidents: inInc.length,
    incidents: top(inInc, 'causalGroup', 3),
    signals: {
      anomaly: rows.filter(r => yes(r, 'anomaly')).length,
      seasonal: rows.filter(r => yes(r, 'seasonal')).length,
      goldenSignal: rows.filter(r => !empty(text(r.goldenSignal))).length,
      logFixes: rows.filter(r => Number(r.logFixes) > 0).length
    },
    runbooks: { alerts: rows.filter(r => Number(r.runbooks) > 0).length, automated: rows.filter(r => text(r.runbookAutomated).toLowerCase() === 'automated').length }
  };
}

/** "3× the usual rate", "about the usual rate", or nothing when there is too little to compare. */
export function rateNote(e: Pick<AlertExplanation, 'lastHour' | 'perHourBefore'>): string {
  if (e.lastHour < 3) return '';
  if (e.perHourBefore < 0.05) return 'none in the day before';
  const x = e.lastHour / e.perHourBefore;
  if (x >= 1.5) return `${x >= 10 ? Math.round(x) : x.toFixed(1)}× the usual hourly rate`;
  if (x <= 0.67) return 'below the usual hourly rate';
  return 'about the usual hourly rate';
}

export interface IncidentExplanation {
  count: number;
  priorities: Array<[string, number]>;
  states: Array<[string, number]>;
  services: Array<[string, number]>;
  oldest?: number;
  newest?: number;
  /** The incidents to look into first: highest priority (1), then most alerts. */
  lead: Row[];
}

export function explainIncidents(rows: Row[]): IncidentExplanation {
  const created = rows.map(r => ms(r.created)).filter(Number.isFinite);
  const pr = top(rows, 'priority', 5).sort((a, b) => Number(a[0]) - Number(b[0]));
  const lead = rows.slice().sort((a, b) => (Number(a.priority) || 9) - (Number(b.priority) || 9) || (Number(b.alertCount) || 0) - (Number(a.alertCount) || 0)).slice(0, 3);
  return { count: rows.length, priorities: pr, states: top(rows, 'state', 5), services: top(rows, 'service'), oldest: created.length ? Math.min(...created) : undefined, newest: created.length ? Math.max(...created) : undefined, lead };
}

/** Concert's incident timeline (getStoryAlertsGroups → story.timeline): when it was created and each alert as it was added. */
export interface TimelineEntry { at: number; kind: 'created' | 'alertadded' | 'other'; alertId?: string; severity?: number; summary?: string; type: string }

export function readTimeline(data: any): TimelineEntry[] {
  const list: any[] = data && data.tenant && data.tenant.story && Array.isArray(data.tenant.story.timeline) ? data.tenant.story.timeline : [];
  return list.map(e => {
    const c = (e && e.content) || {};
    const kind: TimelineEntry['kind'] = e && e.type === 'created' ? 'created' : e && e.type === 'alertadded' ? 'alertadded' : 'other';
    const added = ms(c.timeAdded);
    const at = Number.isFinite(added) ? added : ms(e && e.createdTime);
    const sev = Number(c.severity);
    return { at, kind, type: text(e && e.type), alertId: c.alertid ? String(c.alertid) : undefined, severity: Number.isFinite(sev) ? sev : undefined, summary: c.summary ? String(c.summary) : undefined };
  }).filter(e => Number.isFinite(e.at)).sort((a, b) => a.at - b.at);
}
