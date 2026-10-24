/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * "Explain this": a short account of a set of alerts or incidents, at the top of the drill panel. What, where and the
 * signals come from the rows themselves (explain.ts); the probable cause is Concert Operate's own analysis
 * (getStoryAlertsInsights), read for at most three incidents and kept for the session. Nothing here is guessed.
 */

import React, { useEffect, useReducer, useState } from 'react';
import { ALERT_QUERY_PARAMS } from '../constants';
import { useBuilder } from './context';
import { sourceKey } from './datahub';
import { explainAlerts, explainIncidents, rateNote } from './explanation';
import IncidentInsights, { summarise } from './IncidentInsights';
import { semanticColor } from './rows';
import { shapeOf } from './sources';
import { QueryName, Row } from './types';

interface Cause { loading: boolean; alert?: string; rank?: number; score?: number; classification?: string; error?: string }
const causes = new Map<string, Promise<Cause>>();

/** Concert's top-ranked probable cause of one incident (read once per session). */
function causeOf(storyId: string): Promise<Cause> {
  let p = causes.get(storyId);
  if (!p) {
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.getStoryAlertsInsights;
    p = typeof fn !== 'function'
      ? Promise.resolve({ loading: false, error: 'not available here' })
      : Promise.resolve().then(() => fn({ tenantId: ALERT_QUERY_PARAMS.tenantId, storyId })).then((r: any) => {
        const c = summarise(r).causes[0];
        return c ? { loading: false, alert: c.alert, rank: c.rank === 99 ? undefined : c.rank, score: c.score, classification: c.classification } : { loading: false };
      }, (e: any) => ({ loading: false, error: e && e.message ? String(e.message) : 'could not be read' }));
    causes.set(storyId, p);
  }
  return p;
}

function useCauses(ids: string[]): Record<string, Cause> {
  const [got, setGot] = useState<Record<string, Cause>>({});
  const key = ids.join(',');
  useEffect(() => {
    let on = true;
    ids.forEach(id => causeOf(id).then(c => { if (on) setGot(g => ({ ...g, [id]: c })); }));
    return () => { on = false; };
  }, [key]);
  return got;
}

const when = (t?: number) => (t === undefined ? '' : new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
const list = (xs: Array<[string, number]>) => xs.map(([v, n]) => `${v} (${n})`).join(', ');
const chip = (field: string, label: string, n: number) => {
  const c = semanticColor(field, label);
  return <span key={label} className="db-ex-chip" style={c ? { background: c.fill, color: c.ink } : undefined}>{field === 'priority' ? `P${label}` : label} <b>{n}</b></span>;
};

export default function Explain({ query, rows }: { query: QueryName; rows: Row[] }) {
  const { hub } = useBuilder();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [similar, setSimilar] = useState(false);
  const shape = shapeOf(query);
  // incident titles and alert summaries, from data the dashboard already shares
  useEffect(() => hub.acquire('getStories', undefined, 0, bump), [hub]);
  useEffect(() => hub.acquire('getAlerts', undefined, 0, bump), [hub]);
  const stories = hub.snapshot(sourceKey('getStories', undefined)).rows;
  const alertsKnown = shape === 'alerts' ? [...rows, ...hub.snapshot(sourceKey('getAlerts', undefined)).rows] : hub.snapshot(sourceKey('getAlerts', undefined)).rows;
  const storyOf = (id: string) => stories.find(s => String(s.id) === id);
  const alertText = (id?: string) => { const a = id ? alertsKnown.find(x => String(x.id) === id) : undefined; return a ? `${String(a.summary || a.id)}${a.resource ? ` on ${String(a.resource)}` : ''}` : id || ''; };

  const ex = shape === 'alerts' ? explainAlerts(rows) : undefined;
  const ix = shape === 'stories' ? explainIncidents(rows) : undefined;
  const leadIds = ex ? ex.incidents.map(([id]) => id) : ix ? ix.lead.map(r => String(r.id)) : [];
  const got = useCauses(leadIds);
  if (!ex && !ix) return null;

  const causeLine = (c?: Cause): React.ReactNode => {
    if (!c) return 'Reading Concert’s probable cause…';
    if (c.error) return `Probable cause ${c.error}.`;
    if (!c.alert) return 'Concert has not ranked a probable cause for it.';
    const how = c.rank !== undefined ? ` (rank ${c.rank}${c.score !== undefined ? `, score ${c.score}` : ''})` : '';
    return <>Probable cause{how}: <b>{alertText(c.alert)}</b>{c.classification ? ` · ${c.classification}` : ''}</>;
  };
  const why = leadIds.map(id => {
    const s = storyOf(id);
    const c = got[id];
    const n = ex ? (ex.incidents.find(x => x[0] === id) || [id, 0])[1] : undefined;
    return (
      <li key={id}>
        <b>{s ? String(s.title || id) : `Incident ${id}`}</b>
        {s && s.priority !== undefined && <span className="db-insight-tag">P{String(s.priority)}</span>}
        {n !== undefined && <span className="db-ex-sub"> · {n} of these alerts</span>}
        <div className="db-ex-sub">{causeLine(c)}</div>
      </li>
    );
  });

  return (
    <section className="db-ex" aria-label="Explain this">
      {ex && <>
        <h4>What</h4>
        <p className="db-ex-chips">{ex.severities.map(([l, n]) => chip('severityLabel', l, n))}</p>
        <p>{ex.count} alert{ex.count === 1 ? '' : 's'}{ex.first !== undefined ? `, first seen ${when(ex.first)}, last ${when(ex.last)}` : ''}.
          {ex.lastHour > 0 && <> {ex.lastHour} started in the last hour{rateNote(ex) ? ` (${rateNote(ex)})` : ''}.</>}</p>
        <h4>Where</h4>
        {ex.resources.length > 0 && <p><span className="db-ex-k">Resources</span> {list(ex.resources)}</p>}
        {ex.services.length > 0 && <p><span className="db-ex-k">Services</span> {list(ex.services)}</p>}
        {ex.types.length > 0 && <p><span className="db-ex-k">Types</span> {list(ex.types)}</p>}
        <h4>Why</h4>
        <p>{ex.inIncidents === 0 ? 'None of these alerts is in an incident yet.' : `${ex.inIncidents} of ${ex.count} are in incidents.`}</p>
        {why.length > 0 && <ul className="db-ex-inc">{why}</ul>}
        {(ex.signals.anomaly || ex.signals.seasonal || ex.signals.goldenSignal || ex.signals.logFixes) ? (
          <p><span className="db-ex-k">Signals</span> {[ex.signals.anomaly && `${ex.signals.anomaly} anomal${ex.signals.anomaly === 1 ? 'y' : 'ies'}`, ex.signals.seasonal && `${ex.signals.seasonal} seasonal`, ex.signals.goldenSignal && `${ex.signals.goldenSignal} on a golden signal`, ex.signals.logFixes && `${ex.signals.logFixes} with log fixes`].filter(Boolean).join(' · ')}</p>
        ) : null}
        <h4>What to do</h4>
        <p>{ex.runbooks.alerts ? `${ex.runbooks.alerts} alert${ex.runbooks.alerts === 1 ? ' has a runbook' : 's have runbooks'} (${ex.runbooks.automated} automated): open one below to run it.` : 'No runbooks are attached to these alerts.'}</p>
      </>}
      {ix && <>
        <h4>What</h4>
        <p className="db-ex-chips">{ix.priorities.map(([p, n]) => chip('priority', p, n))}</p>
        <p>{ix.count} incident{ix.count === 1 ? '' : 's'}{ix.oldest !== undefined ? `, created ${when(ix.oldest)} to ${when(ix.newest)}` : ''}.</p>
        {ix.states.length > 0 && <p><span className="db-ex-k">States</span> {list(ix.states)}</p>}
        {ix.services.length > 0 && <p><span className="db-ex-k">Services</span> {list(ix.services)}</p>}
        <h4>Why: the incidents to look at first</h4>
        <ul className="db-ex-inc">{why}</ul>
      </>}
      {leadIds[0] && (similar
        ? <IncidentInsights storyId={leadIds[0]} title={String((storyOf(leadIds[0]) || {}).title || '')} show="similar" />
        : <button type="button" className="db-link" onClick={() => setSimilar(true)}>Look for similar past incidents</button>)}
      <p className="db-note">Worked out from these rows. The probable cause is Concert Operate’s own analysis.</p>
    </section>
  );
}
