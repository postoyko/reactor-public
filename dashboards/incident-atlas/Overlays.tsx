/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deep Dive drawer and Remediation console for Blast Radius (the same two tools as the Telco Causal Mesh's resource menu).
 *   - Deep Dive: alert timeline, topology service metadata and 1-hop neighbours, golden-signal metrics, runbook policies.
 *   - Remediation console: runs the host's `onExecuteRemediation` handler when one is configured; otherwise it is a
 *     clearly labelled simulation that executes nothing.
 */

import { RawJsonTab } from './RawJsonTab';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, sevLabel } from './logic';
import { IDLE, MetricSeries, QueryStatus, RunbookPolicyInfo, TopologyResourceDetails, adaptMetricManagerData, adaptRunbooksAndPolicy, adaptTopologyResource } from './details';

export type QueryFn = (name: string, options: Record<string, unknown>) => Promise<any>;
export interface RemediationResult { ok: boolean; message: string }
export type RemediationHandler = (alert: Alert) => Promise<RemediationResult>;
export interface MetricQuery { group: string; metric: string; label?: string }
export interface Neighbour { i: number; name: string; kind: string; dir: 'out' | 'in'; sev: number }

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const offset = (ms: number) => { const m = Math.round(ms / 60000); return m < 1 ? 'latest' : m < 60 ? `-${m} min` : `-${Math.floor(m / 60)} h ${m % 60} min`; };
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A runbook policy id on the alert, else the first alert on the resource (most severe first). */
export const alertForRemediation = (alerts: Alert[]): Alert | undefined => {
  const sorted = alerts.slice().sort((a, b) => b.severity - a.severity);
  return sorted.find(a => a.runbooks && a.runbooks.length) || sorted[0];
};

function Status({ s, ok = 'From service' }: { s: QueryStatus; ok?: string }) {
  const cls = s.state === 'ok' ? 'ok' : s.state === 'error' ? 'err' : '';
  const txt = s.state === 'ok' ? ok : s.state === 'loading' ? 'Querying…' : s.state === 'error' ? 'Query failed' : s.state === 'unavailable' ? 'Not connected' : s.state === 'empty' ? 'No data' : 'Not configured';
  return <span className={`blast__tag ${cls}`} title={s.message}>{txt}</span>;
}

function Spark({ s }: { s: MetricSeries }) {
  const pts = s.points, w = 220, h = 34;
  if (pts.length < 2) return null;
  const t0 = pts[0].timestamp, t1 = pts[pts.length - 1].timestamp, lo = s.min ?? 0, hi = s.max ?? 1;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(((p.timestamp - t0) / (t1 - t0 || 1)) * w).toFixed(1)},${(h - 3 - ((p.value - lo) / (hi - lo || 1)) * (h - 6)).toFixed(1)}`).join(' ');
  return <svg width={w} height={h} role="img" aria-label={`${s.metricName} over the last hour`}><path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export interface DeepDiveProps {
  name: string; worst: number; rank?: number; incident?: string; incidentId?: string; alerts: Alert[]; byId: Map<string, Alert>;
  neighbours: Neighbour[]; downstream: number; uniqueId?: string; entityTypes: string[];
  topologyApiUrl?: string; initialTab?: number; initialAlert?: string;
  query: QueryFn | null; metricQueries: MetricQuery[]; netcoolUrl?: string; sample: boolean;
  onClose: () => void; onTraverse: (i: number) => void; onRemediation: () => void; concertUrl?: string;
}

export function DeepDive(p: DeepDiveProps) {
  const [tab, setTab] = useState(p.initialTab ?? 0);
  const [topo, setTopo] = useState<TopologyResourceDetails | null>(null);
  const [topoS, setTopoS] = useState<QueryStatus>(IDLE);
  const [metrics, setMetrics] = useState<MetricSeries[]>([]);
  const [metS, setMetS] = useState<QueryStatus>(IDLE);
  const [pols, setPols] = useState<RunbookPolicyInfo[]>([]);
  const [polS, setPolS] = useState<QueryStatus>(IDLE);
  const box = useRef<HTMLDivElement>(null);
  const queryRef = useRef(p.query); queryRef.current = p.query;
  const mqKey = JSON.stringify(p.metricQueries || []);
  const runbooks = p.alerts.flatMap(a => a.runbooks || []);

  useEffect(() => { if (box.current) box.current.focus(); }, [p.name]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc);
  }, [p.onClose]);

  useEffect(() => {
    let live = true;
    const call = async (name: string, o: Record<string, unknown>) => {
      const q = queryRef.current; if (!q) throw new Error('No query API is connected to this panel.');
      const res = await q(name, o);
      if (res && Array.isArray(res.errors) && res.errors.length) throw new Error(String(res.errors[0] && res.errors[0].message || `${name} returned an error`));
      return res;
    };
    const unavailable: QueryStatus = { state: 'unavailable', message: p.sample ? 'Sample data: there is no environment to query.' : 'No query API is connected to this panel.' };
    // 1. topology service resource
    setTopo(null);
    if (!queryRef.current) setTopoS(unavailable);
    else {
      setTopoS({ state: 'loading' });
      call('getTopologyResource', { resourceId: p.uniqueId || p.name }).then(r => { if (!live) return; const d = adaptTopologyResource(r); setTopo(d); setTopoS(d ? { state: 'ok' } : { state: 'empty', message: 'The topology service returned no resource for this id.' }); })
        .catch(e => { if (live) setTopoS({ state: 'error', message: msgOf(e) }); });
    }
    // 2. metrics: only the ones the host configured
    setMetrics([]);
    const cfg: MetricQuery[] = JSON.parse(mqKey);
    if (!queryRef.current) setMetS(unavailable);
    else if (!cfg.length) setMetS({ state: 'idle', message: 'No metrics are configured. Set `metricQueries` ([{ group, metric }]) in the route state.' });
    else {
      setMetS({ state: 'loading' });
      const end = Date.now();
      Promise.allSettled(cfg.map(mq => call('getMetricManagerData', { resource: p.name, group: mq.group, metric: mq.metric, startTime: end - 3600 * 1000, endTime: end }))).then(rs => {
        if (!live) return;
        const series: MetricSeries[] = [], fails: string[] = [];
        rs.forEach((r, i) => { if (r.status === 'rejected') { fails.push(msgOf(r.reason)); return; } adaptMetricManagerData(r.value).forEach(x => series.push({ ...x, metricName: cfg[i].label || x.metricName })); });
        setMetrics(series);
        if (series.length) setMetS({ state: 'ok', message: fails.length ? `${fails.length} of ${cfg.length} queries failed: ${fails[0]}` : undefined });
        else if (fails.length) setMetS({ state: 'error', message: fails[0] });
        else setMetS({ state: 'empty', message: 'The queries succeeded but returned no data points for this resource in the last hour.' });
      });
    }
    // 3. runbook and policy names (only with a real policy id)
    setPols([]);
    const rbIds = runbooks.map((r: any) => r && r.runbookId).filter(Boolean);
    const polId = (runbooks.find((r: any) => r && r.policyId) || {}).policyId;
    if (!polId || !queryRef.current) setPolS(IDLE);
    else {
      setPolS({ state: 'loading' });
      call('getRunbooksAndPolicy', { runbookIds: rbIds, policyId: polId, includePolicy: true, includePolicies: true, includeRunbooks: true })
        .then(r => { if (!live) return; const l = adaptRunbooksAndPolicy(r); setPols(l); setPolS(l.length ? { state: 'ok' } : { state: 'empty' }); })
        .catch(e => { if (live) setPolS({ state: 'error', message: msgOf(e) }); });
    }
    return () => { live = false; };
  }, [p.name, p.uniqueId, mqKey]);

  const list = p.alerts.slice().sort((a, b) => a.first - b.first);
  const latest = Math.max(0, ...list.map(a => a.first));
  const props = topo ? topo.properties as Record<string, any> : {};
  const types = (topo && topo.entityTypes && topo.entityTypes.length ? topo.entityTypes : p.entityTypes);
  const tabs = ['Alert timeline', 'Topology & neighbours', 'Golden signals', 'Remediation', 'Raw JSON'];

  return (
    <div className="blast__scrim" onClick={p.onClose}>
      <div className="blast__drawer" role="dialog" aria-modal="true" aria-label={`Deep dive: ${p.name}`} tabIndex={-1} ref={box} onClick={e => e.stopPropagation()}>
        <div className="blast__dhead">
          <div>
            <h2>Deep-Dive Diagnostics: {p.name}</h2>
            <div className="blast__lbl">Worst alert: {sevLabel(p.worst)} · {p.alerts.length} alert(s) · probable-cause rank: {p.rank ?? 'none'}{p.incident ? ` · ${p.incident}` : ''}</div>
          </div>
          <button className="blast__btn is-sm" onClick={p.onClose} aria-label="Close deep dive">Close</button>
        </div>
        <div className="blast__dtabs" role="tablist">{tabs.map((t, i) => <button key={t} role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}</div>
        <div className="blast__dbody">
          {tab === 0 && (
            <div>
              <div className="blast__sec">Alerts on this resource, oldest first (the earliest ones are precursors)</div>
              {list.map((a, k) => {
                const parent = a.parent ? p.byId.get(a.parent) : undefined;
                return (
                  <div key={a.id} className="blast__tl-row">
                    <span className="t">{offset(latest - a.first)}</span>
                    <span className="x">
                      {k === 0 && list.length > 1 && <span className="blast__tag pre">PRECURSOR</span>}
                      <span className={`sev s${Math.round(a.severity)}`}>{sevLabel(a.severity)}</span>{a.summary || '(no summary)'}
                      <small>{a.sender || 'unknown source'} · {a.state || 'state n/a'} · first seen {clock(a.first)}{a.closed ? ` · cleared ${clock(a.closed)}` : ''}</small>
                      {parent && <small>in alert group under: {parent.summary} ({parent.resource || parent.sender})</small>}
                      {a.children && a.children.length > 0 && <small>alert group parent · {a.children.length} child alert{a.children.length === 1 ? '' : 's'}</small>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {tab === 1 && (
            <div>
              <div className="blast__sec"><span>Topology service resource</span><Status s={topoS} ok="From topology service" /></div>
              {topoS.state === 'error' && <div className="blast__note">The topology query failed: {topoS.message}</div>}
              <div className="blast__props">
                <div><span>Resource</span><b>{p.name}</b></div>
                <div><span>Entity types</span><b>{types.length ? types.join(', ') : 'n/a'}</b></div>
                <div><span>IP address</span><b>{props.ipAddress || (Array.isArray(props.ipAddresses) ? props.ipAddresses.join(', ') : '') || 'n/a'}</b></div>
                <div><span>MAC address</span><b>{props.macAddress || 'n/a'}</b></div>
                <div><span>Firmware / OS</span><b>{props.firmwareVersion || props.osVersion || props.version || 'n/a'}</b></div>
                <div><span>Location</span><b>{props.location || props.dataCenter || 'n/a'}</b></div>
                <div><span>Topology unique ID</span><b>{(topo && topo.uniqueId) || p.uniqueId || 'n/a'}</b></div>
                <div><span>Downstream in blast radius</span><b>{p.downstream}</b></div>
              </div>
              <div className="blast__sec">Neighbours (1 hop, from incident correlation, alert groups and topology links)</div>
              {p.neighbours.length === 0 && <div className="blast__note">No linked resources.</div>}
              {p.neighbours.slice(0, 40).map(n => (
                <div key={n.i + n.kind + n.dir} className="blast__nb">
                  <div><b title={n.name}>{n.name}</b><small>{n.dir === 'out' ? 'effect of this resource' : 'cause of this resource'} · {n.kind}</small></div>
                  <span className={`sev s${n.sev}`}>{sevLabel(n.sev)}</span>
                  <button className="blast__btn is-sm" onClick={() => p.onTraverse(n.i)}>Traverse ➔</button>
                </div>
              ))}
            </div>
          )}
          {tab === 2 && (
            <div>
              <div className="blast__sec"><span>Golden signals (metric manager, last hour)</span><Status s={metS} ok="Last hour" /></div>
              {metrics.map((s, i) => (
                <div key={i} className="blast__metric">
                  <div><b>{s.metricName}</b><b className="v">{s.currentValue ?? 'n/a'} {s.unit || ''}</b></div>
                  <Spark s={s} />
                  <small>Min {s.min ?? 'n/a'} · Max {s.max ?? 'n/a'} · Avg {s.avg ?? 'n/a'} · {s.points.length} points</small>
                </div>
              ))}
              {!metrics.length && <div className="blast__note">{metS.state === 'loading' ? 'Querying the metric manager…' : metS.state === 'error' ? `The metric query failed: ${metS.message}` : (metS.message || 'No metric data.')}</div>}
              {metS.state === 'ok' && metS.message && <div className="blast__note">{metS.message}</div>}
            </div>
          )}
          {tab === 4 && (
            <RawJsonTab initialAlert={p.initialAlert} query={p.query} alerts={p.alerts} uniqueId={p.uniqueId} entityName={p.name} topologyApiUrl={p.topologyApiUrl} sampleAlert={id => p.alerts.find(a => a.id === id)} />
          )}
          {tab === 3 && (
            <div>
              <div className="blast__sec"><span>Runbook policies attached to this resource</span>{pols.length > 0 && <span className="blast__tag ok">AIOps runbook API</span>}</div>
              <div className="blast__term">
                {!runbooks.length && !pols.length ? <div>[none] No runbook is attached to the alerts on this resource.</div>
                  : pols.length ? pols.map((pol, i) => <div key={i}>[POLICY] {pol.policyName || pol.policyId || 'Unnamed policy'} {pol.isAutomated ? '(automated)' : '(assisted)'}{pol.runbookName ? ` ➔ runbook: ${pol.runbookName}` : pol.runbookId ? ` ➔ runbook id: ${pol.runbookId}` : ''}{pol.description ? ` | ${pol.description}` : ''}</div>)
                    : runbooks.map((r: any, i: number) => <div key={i}>[POLICY] {r && r.policyId || '(no policy id)'} | {r && r.isAutomated ? 'automated' : 'assisted'}{r && r.runbookId ? ` | runbook ${r.runbookId}` : ''}</div>)}
              </div>
              {polS.state === 'error' && <div className="blast__note">The runbook query failed: {polS.message}</div>}
              <div className="blast__bar" style={{ marginTop: 12 }}>
                <button className="blast__btn is-ai" disabled={!p.alerts.length} onClick={p.onRemediation}>Open Remediation Console</button>
                {p.concertUrl && <button className="blast__btn" onClick={() => window.open(p.concertUrl, '_blank', 'noopener')}>Open incident in Concert Operate</button>}
                {p.netcoolUrl && <button className="blast__btn" onClick={() => window.open(p.netcoolUrl, '_blank', 'noopener,noreferrer')}>View in Netcool / WebGUI</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RemediationConsole({ alert, onClose, onExecute }: { alert: Alert; onClose: () => void; onExecute?: RemediationHandler }) {
  const stamp = () => `[${new Date().toISOString()}]`;
  const pol = alert.runbooks && alert.runbooks[0];
  const [logs, setLogs] = useState<string[]>(() => [
    `${stamp()} Remediation console opened.`,
    `${stamp()} Target resource: ${alert.resource || alert.sender || 'unknown'}`,
    `${stamp()} Runbook policy: ${(pol && pol.policyId) || 'none attached to this alert'}`,
    onExecute ? `${stamp()} A remediation handler is configured. Confirming will call it.` : `${stamp()} SIMULATION MODE: no remediation handler is configured, so confirming runs nothing on the network.`
  ]);
  const [running, setRunning] = useState(false);
  const alive = useRef(true), timers = useRef<number[]>([]), box = useRef<HTMLDivElement>(null);
  const add = (...l: string[]) => { if (alive.current) setLogs(p => [...p, ...l]); };
  useEffect(() => { alive.current = true; if (box.current) box.current.focus(); return () => { alive.current = false; timers.current.forEach(t => window.clearTimeout(t)); }; }, []);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [onClose]);
  const run = async () => {
    if (running) return; setRunning(true);
    if (onExecute) {
      add(`${stamp()} Calling the remediation handler...`);
      try { const r = await onExecute(alert); add(`${stamp()} ${r.ok ? 'COMPLETED' : 'FAILED'}: ${r.message}`); } catch (e) { add(`${stamp()} FAILED: ${msgOf(e)}`); } finally { if (alive.current) setRunning(false); }
      return;
    }
    timers.current.push(window.setTimeout(() => add(`${stamp()} SIMULATION: would dispatch runbook policy ${(pol && pol.policyId) || '(none)'} for ${alert.resource || 'the resource'}.`), 600));
    timers.current.push(window.setTimeout(() => { add(`${stamp()} SIMULATION COMPLETE: nothing was executed and no alert was changed.`); if (alive.current) setRunning(false); }, 1400));
  };
  return (
    <div className="blast__scrim is-center" onClick={onClose}>
      <div className="blast__modal" role="dialog" aria-modal="true" aria-label="Remediation console" tabIndex={-1} ref={box} onClick={e => e.stopPropagation()}>
        <h2>{onExecute ? 'Remediation Console' : 'Remediation Console (simulation)'}</h2>
        <div className="blast__meta">Target alarm: <b>{alert.summary}</b></div>
        <div className="blast__meta">Resource: {alert.resource || 'Network element'} · Severity: {sevLabel(alert.severity)}</div>
        <div className="blast__term" role="log">
          {logs.map((l, i) => <div key={i} className={l.includes('COMPLETED') ? 'good' : l.includes('FAILED') ? 'bad' : l.includes('SIMULATION') ? 'sim' : ''}>{l}</div>)}
        </div>
        <div className="blast__bar" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="blast__btn" onClick={onClose}>Dismiss</button>
          <button className="blast__btn is-ai" onClick={run} disabled={running}>{running ? 'Running…' : onExecute ? 'Confirm & Execute Action' : 'Run simulation'}</button>
        </div>
      </div>
    </div>
  );
}
