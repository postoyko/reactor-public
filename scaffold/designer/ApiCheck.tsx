/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The API check window (⋮ > Check the Concert Operate API): runs api-check.ts and shows each source as it answers,
 * then copies or downloads the report. Read-only: nothing in Concert Operate is changed.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CheckmarkFilled, Close, Copy, Download, ErrorFilled, Play, SubtractAlt, WarningAltFilled } from '@carbon/icons-react';
import { DataHub } from './datahub';
import { CheckResult, reportText, runApiCheck } from './api-check';
import { VERSION } from './version';

const ICON = { ok: CheckmarkFilled, empty: WarningAltFilled, error: ErrorFilled, missing: ErrorFilled, skipped: SubtractAlt };
const WORD = { ok: 'OK', empty: 'Empty', error: 'Error', missing: 'Missing', skipped: 'Skipped' };

export default function ApiCheck({ hub, onClose }: { hub: DataHub; onClose: () => void }) {
  const [values, setValues] = useState(false);
  const [code, setCode] = useState(true);
  const [probe, setProbe] = useState(false);
  const [incidentId, setIncidentId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [copied, setCopied] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const report = results.length ? reportText(results, { version: VERSION, values }) : '';

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const run = () => {
    setRunning(true);
    setResults([]);
    setCopied('');
    runApiCheck(hub, { values, code, incidentId, resourceId, probe }, r => setResults(list => [...list, r])).finally(() => setRunning(false));
  };
  const copy = () => {
    const done = () => setCopied('Copied. Paste it into the chat.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(report).then(done, () => { selectAll(); setCopied('Select all is done: press Ctrl+C.'); });
    else { selectAll(); setCopied('Select all is done: press Ctrl+C.'); }
  };
  const selectAll = () => { if (areaRef.current) { areaRef.current.hidden = false; areaRef.current.select(); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([report], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url; a.download = `concert-api-check-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="db-ac-back" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="db-ac" role="dialog" aria-modal="true" aria-label="Concert Operate API check" onKeyDown={e => e.stopPropagation()}>
        <header className="db-ac-head">
          <div>
            <h2>Check the Concert Operate API</h2>
            <p>Calls each data source once and records the shape of its answer, so the Designer can be fixed against your real data. Nothing is changed: incident and policy actions are only looked up, or, if you tick the option below, sent a request the server must refuse.</p>
          </div>
          <button type="button" className="db-af-x" aria-label="Close" onClick={onClose}><Close size={20} /></button>
        </header>

        <div className="db-ac-opts">
          <label className="db-ac-field"><span>Incident id (optional)</span><input value={incidentId} placeholder="first open incident" onChange={e => setIncidentId(e.target.value)} /></label>
          <label className="db-ac-field"><span>Topology resource id (optional)</span><input value={resourceId} placeholder="needed for Topology resource" onChange={e => setResourceId(e.target.value)} /></label>
          <label className="db-check"><input type="checkbox" checked={code} onChange={e => setCode(e.target.checked)} /> Include the start of each function's code (shows which fields the query asks for)</label>
          <label className="db-check"><input type="checkbox" checked={probe} onChange={e => setProbe(e.target.checked)} /> Ask the server which parameters each incident and policy action needs (sends each one a request with an invalid tenant id, which the server refuses before doing anything)</label>
          <label className="db-check"><input type="checkbox" checked={values} onChange={e => setValues(e.target.checked)} /> Include sample values (one record per source; leave off if the data is sensitive)</label>
          <div className="db-ac-actions">
            <button type="button" className="db-af-btn db-af-btn--primary" disabled={running} onClick={run}><Play size={16} />{running ? 'Checking…' : results.length ? 'Run again' : 'Run the check'}</button>
            <button type="button" className="db-af-btn" disabled={!report || running} onClick={copy}><Copy size={16} />Copy report</button>
            <button type="button" className="db-af-btn" disabled={!report || running} onClick={download}><Download size={16} />Download</button>
            {copied && <span className="db-ac-copied">{copied}</span>}
          </div>
        </div>

        <div className="db-ac-list">
          {!results.length && !running && <p className="db-help">Run the check, then copy the report and paste it into the chat.</p>}
          {results.map((r, i) => {
            const Ic = ICON[r.status];
            const id = `${r.kind}-${r.api}-${i}`;
            const more = Boolean(r.outline || r.code || r.fields);
            return (
              <div key={id} className={`db-ac-row db-ac-row--${r.status}`}>
                <button type="button" className="db-ac-sum" disabled={!more} aria-expanded={open === id} onClick={() => setOpen(o => (o === id ? null : id))}>
                  <Ic size={16} className="db-ac-icon" />
                  <span className="db-ac-name"><strong>{r.name}</strong><small>{r.api} · {r.kind}</small></span>
                  <span className="db-ac-meta">{r.kind === 'source' && r.rows !== undefined ? `${r.rows} rows` : ''}{r.ms !== undefined ? ` · ${r.ms} ms` : ''}</span>
                  <span className="db-ac-pill">{WORD[r.status]}</span>
                </button>
                {r.note && <p className="db-ac-note">{r.note}</p>}
                {open === id && (
                  <div className="db-ac-detail">
                    {r.fields && r.fields.length > 0 && <p><b>Fields read:</b> {r.fields.join(', ')}</p>}
                    {r.outline && <pre>{r.outline}</pre>}
                    {r.code && <pre className="db-ac-code">{r.code}</pre>}
                  </div>
                )}
              </div>
            );
          })}
          {running && <p className="db-help">Waiting for the next answer…</p>}
        </div>
        <textarea ref={areaRef} className="db-ac-area" hidden readOnly value={report} />
      </div>
    </div>
  );
}
