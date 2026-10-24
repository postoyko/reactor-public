/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * One incident as a story in time: when it was created, each alert as it arrived (the probable cause marked), and every
 * runbook run on those alerts. Built from data the dashboard already reads, plus Concert's runbook runs and insights.
 * When Concert keeps the incident's own timeline (getStoryAlertsGroups → story.timeline), each alert is shown at the
 * moment it was added, with its severity then; otherwise at its first occurrence. The slider replays it step by step.
 */

import React, { useEffect, useReducer, useState } from 'react';
import { ALERT_QUERY_PARAMS } from '../constants';
import { useBuilder } from './context';
import { sourceKey } from './datahub';
import { loadRuns, RunInfo, runbookDetail } from './runbooks';
import { SEVERITY_LABELS, semanticColor } from './rows';
import { readTimeline, TimelineEntry } from './explanation';
import { summarise } from './IncidentInsights';
import { Row } from './types';

interface Ev { at: number; kind: 'start' | 'alert' | 'run'; title: string; sub?: string; color?: string; tag?: string }
const t = (v: unknown): number => { const d = Date.parse(String(v || '')); return Number.isFinite(d) ? d : NaN; };
const fmt = (ms: number): string => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function IncidentTimeline({ row }: { row: Row }) {
  const { hub } = useBuilder();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [causes, setCauses] = useState<Record<string, number>>({});
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [upto, setUpto] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let on = true;
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.getStoryAlertsGroups;
    if (typeof fn !== 'function') return () => { on = false; };
    Promise.resolve().then(() => fn(hub.paramsFor('getStoryAlertsGroups', String(row.id)))).then((r: any) => { if (on) setTimeline(readTimeline(r)); }, (): void => undefined);
    return () => { on = false; };
  }, [row.id]);
  useEffect(() => hub.acquire('getAlerts', undefined, 0, bump), [hub]);
  useEffect(() => { loadRuns(ALERT_QUERY_PARAMS.tenantId).then(setRuns); }, [row.id]);
  useEffect(() => {
    let on = true;
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.getStoryAlertsInsights;
    if (typeof fn !== 'function') return () => { on = false; };
    Promise.resolve().then(() => fn({ tenantId: ALERT_QUERY_PARAMS.tenantId, storyId: String(row.id) })).then((r: any) => {
      if (!on) return;
      const m: Record<string, number> = {};
      summarise(r).causes.forEach(c => { if (m[c.alert] === undefined) m[c.alert] = c.rank; });
      setCauses(m);
    }, (): void => undefined);
    return () => { on = false; };
  }, [row.id]);

  const ids = new Set(String(row.alertIds || '').split(',').filter(Boolean));
  const alerts = hub.snapshot(sourceKey('getAlerts', undefined)).rows.filter(a => ids.has(String(a.id)));
  const mine = runs.filter(r => r.alertId && ids.has(r.alertId));
  useEffect(() => {
    Array.from(new Set(mine.map(r => r.runbookId))).forEach(id => { if (id && !names[id]) runbookDetail(ALERT_QUERY_PARAMS.tenantId, id).then(i => setNames(n => ({ ...n, [id]: i.name }))); });
  }, [mine.map(r => r.runbookId).join(',')]);

  const evs: Ev[] = [];
  const created = t(row.created);
  if (Number.isFinite(created)) evs.push({ at: created, kind: 'start', title: `Incident created: ${String(row.title || row.id)}`, sub: [row.priority ? `Priority ${row.priority}` : '', row.owner ? `Owner ${row.owner}` : ''].filter(Boolean).join(' · ') });
  const added = (timeline || []).filter(e => e.kind === 'alertadded');
  if (added.length) {
    // Concert's own record: when each alert joined the incident, and how severe it was then
    added.forEach(e => {
      const a = alerts.find(x => String(x.id) === e.alertId);
      const label = e.severity !== undefined ? SEVERITY_LABELS[e.severity] || `Severity ${e.severity}` : String((a && a.severityLabel) || '');
      const rank = e.alertId ? causes[e.alertId] : undefined;
      evs.push({ at: e.at, kind: 'alert', title: e.summary || String((a && a.summary) || e.alertId || 'Alert'), sub: [`added as ${label}`, a && a.resource ? String(a.resource) : '', a && a.severityLabel && a.severityLabel !== label ? `now ${String(a.severityLabel)}` : ''].filter(Boolean).join(' · '), color: semanticColor('severityLabel', label)?.fill, tag: rank !== undefined ? `Probable cause #${rank}` : undefined });
    });
  } else {
    alerts.forEach(a => {
      const at = t(a.firstOccurrence); if (!Number.isFinite(at)) return;
      const rank = causes[String(a.id)];
      evs.push({ at, kind: 'alert', title: String(a.summary || a.id), sub: String(a.resource || ''), color: semanticColor('severityLabel', String(a.severityLabel || ''))?.fill, tag: rank !== undefined ? `Probable cause #${rank}` : undefined });
    });
  }
  mine.forEach(r => { const at = t(r.at); if (Number.isFinite(at)) evs.push({ at, kind: 'run', title: `Runbook ${names[r.runbookId] || r.runbookId}: ${r.status}`, sub: `on alert ${r.alertId}`, tag: r.status }); });
  evs.sort((a, b) => a.at - b.at);

  // replay: step through the events; Play advances one step a second
  const last = evs.length - 1;
  const at = upto === null || upto > last ? last : upto;
  useEffect(() => {
    if (!playing) return undefined;
    if (at >= last) { setPlaying(false); return undefined; }
    const id = window.setTimeout(() => setUpto(at + 1), 1000);
    return () => window.clearTimeout(id);
  }, [playing, at, last]);
  if (evs.length === 0) return <p className="db-note">No timeline yet: this incident's alerts are not in the data loaded here.</p>;
  const soFar = evs.slice(0, at + 1).filter(e => e.kind === 'alert').length;
  const allAlerts = evs.filter(e => e.kind === 'alert').length;
  const span = evs[evs.length - 1].at - evs[0].at;
  const lead = span > 0 ? `${span < 3600000 ? Math.max(1, Math.round(span / 60000)) + ' min' : span < 86400000 ? (span / 3600000).toFixed(1) + ' h' : (span / 86400000).toFixed(1) + ' days'} from first event to last` : '';
  return (
    <div className="db-tl">
      <h4>Timeline{lead ? ` · ${lead}` : ''}{added.length ? ' · from Concert’s incident record' : ''}</h4>
      {evs.length > 1 && (
        <div className="db-tl-replay">
          <button type="button" className="db-af-btn" onClick={() => { if (at >= last) setUpto(0); setPlaying(p => !p); }}>{playing ? 'Pause' : at >= last ? 'Replay' : 'Play'}</button>
          <input type="range" min={0} max={last} value={at} aria-label="Replay the incident" onChange={e => { setPlaying(false); setUpto(Number(e.target.value)); }} />
          <span>{fmt(evs[at].at)} · {soFar} of {allAlerts} alert{allAlerts === 1 ? '' : 's'} so far</span>
        </div>
      )}
      <ol>
        {evs.map((e, i) => (
          <li key={i} className={`db-tl-${e.kind}${i > at ? ' db-tl-later' : ''}${i === at && at < last ? ' db-tl-now' : ''}`}>
            <span className="db-tl-dot" style={e.color ? { background: e.color } : undefined} />
            <div><span className="db-tl-time">{fmt(e.at)}</span> <b>{e.title}</b>{e.tag && <span className="db-insight-tag">{e.tag}</span>}{e.sub && <div className="db-similar-line">{e.sub}</div>}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
