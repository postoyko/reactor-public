/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The runbooks attached to one alert: what each does, how often it succeeds, when it last ran on this alert, and a Run
 * button (with a confirmation) where this environment has a run API we know how to call.
 */

import React, { useEffect, useState } from 'react';
import { ALERT_QUERY_PARAMS } from '../constants';
import { forgetRuns, loadRuns, RunInfo, runAdapter, runApiCandidates, RunbookInfo, runbookDetail } from './runbooks';
import { Row } from './types';

const when = (t: string): string => { const d = Date.parse(t); return Number.isFinite(d) ? new Date(d).toLocaleString() : t; };

export default function RunbookPanel({ row }: { row: Row }) {
  const ids = String(row.runbookIds || '').split(',').filter(Boolean);
  const alertId = String(row.id);
  const [info, setInfo] = useState<RunbookInfo[] | null>(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const adapter = runAdapter();
  const load = () => { loadRuns(ALERT_QUERY_PARAMS.tenantId).then(r => setRuns(r.filter(x => x.alertId === alertId))); };
  useEffect(() => {
    let on = true;
    Promise.all(ids.map(id => runbookDetail(ALERT_QUERY_PARAMS.tenantId, id))).then(l => { if (on) setInfo(l); });
    load();
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId, ids.join(',')]);
  if (ids.length === 0) return null;
  const run = (rb: RunbookInfo) => {
    if (!adapter) return;
    setConfirm(null); setMsg(m => ({ ...m, [rb.id]: 'Starting…' }));
    adapter.run(ALERT_QUERY_PARAMS.tenantId, rb.id, alertId).then(
      () => { setMsg(m => ({ ...m, [rb.id]: 'Started. It shows below once Concert records the run.' })); forgetRuns(); window.setTimeout(load, 1500); },
      (e: any) => setMsg(m => ({ ...m, [rb.id]: `Could not start it: ${e && e.message ? e.message : 'unknown error'}` }))
    );
  };
  const found = runApiCandidates();
  return (
    <div className="db-rbp">
      <h4>Runbooks on this alert</h4>
      {!info && <p className="db-note">Reading the runbooks…</p>}
      {info && info.map(rb => {
        const mine = runs.filter(r => r.runbookId === rb.id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
        const rate = rb.total && rb.success !== undefined ? Math.round((rb.success / rb.total) * 100) : undefined;
        return (
          <div key={rb.id} className="db-rbp-item">
            <div className="db-rbp-head">
              <b>{rb.name}</b>
              <span className="db-insight-tag">{rb.automated ? 'Automated' : 'Manual'}</span>
              {rate !== undefined && <span className="db-insight-tag">{rate}% success over {rb.total} runs</span>}
            </div>
            {rb.description && <div className="db-similar-line">{rb.description}</div>}
            {mine.length === 0 ? <div className="db-similar-line">Has not run on this alert.</div> : (
              <ul className="db-rbp-runs">{mine.slice(0, 4).map(r => <li key={r.id}><span className={`db-rbp-st ${r.status}`}>{r.status}</span> {when(r.at)}</li>)}</ul>
            )}
            {adapter ? (
              confirm === rb.id ? (
                <div className="db-rbp-confirm">Run “{rb.name}” on this alert{adapter.sample ? ' (sample data: nothing really runs)' : ''}? <button type="button" className="db-bell-go" onClick={() => run(rb)}>Run</button> <button type="button" className="db-link" onClick={() => setConfirm(null)}>Cancel</button></div>
              ) : <button type="button" className="db-bell-go" onClick={() => setConfirm(rb.id)}>Run…</button>
            ) : null}
            {msg[rb.id] && <div className="db-similar-line" role="status">{msg[rb.id]}</div>}
          </div>
        );
      })}
      {!adapter && <p className="db-note">Running is not switched on here: starting a runbook changes the cluster, so it is only enabled once the exact call has been confirmed.{found.length ? ` Found on the API: ${found.join(', ')}.` : ''}</p>}
    </div>
  );
}
