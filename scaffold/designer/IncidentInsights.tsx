/*
 * What Concert Operate has worked out about one incident: which of its alerts is the probable cause (getStoryAlertsInsights),
 * and how many other insights it carries. Shown inside the drill panel when an incident row is open.
 */
import React, { useEffect, useState } from 'react';
import { ALERT_QUERY_PARAMS } from '../constants';

interface Cause { alert: string; rank: number; score?: number; severityScore?: number; classification?: string }
export interface Similar { id: string; title: string; score?: number; explanation?: string; resolution?: string; started?: string; url?: string }
interface Summary { causes: Cause[]; others: Array<[string, number]>; alerts: number }

const short = (t: string) => t.replace(/^aiops\.ibm\.com\/insight-type\//, '');

export function summarise(data: any): Summary {
  const alerts: any[] = (data && data.tenant && data.tenant.storyAlerts) || [];
  const causes: Cause[] = [];
  const counts = new Map<string, number>();
  alerts.forEach((a, i) => (Array.isArray(a && a.insights) ? a.insights : []).forEach((ins: any) => {
    if (!ins || typeof ins.type !== 'string') return;
    if (/probable-cause/.test(ins.type) && ins.details) {
      const rk = Number(ins.details.rank);
      const num = (v: unknown) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined);
      causes.push({ alert: String((a && (a.id || a.alertId)) || `Alert ${i + 1}`), rank: Number.isFinite(rk) ? rk : 99, score: num(ins.details.score), severityScore: num(ins.details.severityScore), classification: ins.details.classification ? String(ins.details.classification) : undefined });
    } else {
      counts.set(short(ins.type), (counts.get(short(ins.type)) || 0) + 1);
    }
  }));
  causes.sort((x, y) => x.rank - y.rank || (y.score ?? 0) - (x.score ?? 0));
  return { causes, others: Array.from(counts.entries()).sort((x, y) => y[1] - x[1]), alerts: alerts.length };
}

/** getSimilarIncidents response -> a short list. Fields are read defensively: only the ones present are shown. */
export function similarList(data: any): Similar[] {
  const raw = data && data.tenant && data.tenant.similarIncidents;
  const list: any[] = Array.isArray(raw && raw.similar_incidents) ? raw.similar_incidents : Array.isArray(raw) ? raw : [];
  return list.filter(x => x && (x.title || x.incident_id)).map(x => ({
    id: String(x.incident_id || x.id || x.title),
    title: String(x.title || x.incident_id),
    score: Number.isFinite(Number(x.score)) ? Number(x.score) : undefined,
    explanation: x.explanation ? String(x.explanation) : undefined,
    resolution: x.resolution ? String(x.resolution) : undefined,
    started: x.started_at ? String(x.started_at) : undefined,
    url: typeof x.url === 'string' && /^https?:\/\//i.test(x.url) ? x.url : undefined
  })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export default function IncidentInsights({ storyId, title, show = 'both' }: { storyId: string; title: string; show?: 'both' | 'probable' | 'similar' }) {
  const [similar, setSimilar] = useState<{ list?: Similar[]; error?: string }>({});
  useEffect(() => {
    let on = true;
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.getSimilarIncidents;
    if (typeof fn !== 'function') { setSimilar({ error: 'Similar incidents are not available in this environment.' }); return () => { on = false; }; }
    setSimilar({});
    // The query wants an application and group, but searches the whole tenant when both are empty.
    Promise.resolve().then(() => fn({ tenantId: ALERT_QUERY_PARAMS.tenantId, storyId, applicationId: '', applicationGroupId: '', searchText: title || '' })).then(
      (r: any) => { if (on) setSimilar({ list: similarList(r) }); },
      (e: any) => { if (on) setSimilar({ error: e && e.message ? String(e.message) : 'Similar incidents could not be read.' }); }
    );
    return () => { on = false; };
  }, [storyId, title]);
  const [state, setState] = useState<{ s?: Summary; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let on = true;
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.getStoryAlertsInsights;
    if (typeof fn !== 'function') { setState({ loading: false, error: 'Incident insights are not available in this environment.' }); return () => { on = false; }; }
    setState({ loading: true });
    Promise.resolve().then(() => fn({ tenantId: ALERT_QUERY_PARAMS.tenantId, storyId })).then(
      (r: any) => { if (on) setState({ loading: false, s: summarise(r) }); },
      (e: any) => { if (on) setState({ loading: false, error: e && e.message ? String(e.message) : 'The insights could not be read.' }); }
    );
    return () => { on = false; };
  }, [storyId]);

  if (state.loading) return <p className="db-note">Reading what Concert knows about this incident…</p>;
  if (state.error) return <p className="db-note">{state.error}</p>;
  const s = state.s as Summary;
  const showCause = show !== 'similar', showSimilar = show !== 'probable';
  return (
    <div className="db-insight">
      {showCause && <><h4>Probable cause</h4>
        {s.causes.length === 0 ? <p className="db-note">No alert of this incident has a ranked probable cause.</p> : (
          <table>
            <thead><tr><th>Rank</th><th>Alert</th><th>Score</th><th>Severity score</th><th>Class</th></tr></thead>
            <tbody>{s.causes.slice(0, 8).map((c, i) => <tr key={i}><td>{c.rank === 99 ? '-' : c.rank}</td><td>{c.alert}</td><td>{c.score ?? '-'}</td><td>{c.severityScore ?? '-'}</td><td>{c.classification || '-'}</td></tr>)}</tbody>
          </table>
        )}
        <h4>Other insights on its {s.alerts} alert{s.alerts === 1 ? '' : 's'}</h4>
        {s.others.length === 0 ? <p className="db-note">None.</p> : <p className="db-insight-types">{s.others.map(([t, n]) => <span key={t} className="db-insight-tag">{t} <b>{n}</b></span>)}</p>}
      </>}
      {showSimilar && <><h4>Similar incidents</h4>
        {similar.error ? <p className="db-note">{similar.error}</p> : !similar.list ? <p className="db-note">Looking for similar incidents…</p> : similar.list.length === 0 ? <p className="db-note">No similar incidents found.</p> : (
          <ul className="db-similar">
            {similar.list.slice(0, 6).map(x => (
              <li key={x.id}>
                <div className="db-similar-head"><b>{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a> : x.title}</b>{x.score !== undefined && <span className="db-insight-tag">match {x.score.toFixed(2)}</span>}</div>
                {x.resolution && <div className="db-similar-line">Resolved: {x.resolution}</div>}
                {x.started && <div className="db-similar-line">Started {x.started.slice(0, 10)}</div>}
              </li>
            ))}
          </ul>
        )}
      </>}
    </div>
  );
}
