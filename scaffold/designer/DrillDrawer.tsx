/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The side panel that drill-through opens: the rows behind what was clicked, searchable, with every field of a row one
 * click away and an Open button when the widget has an address for it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Close, Launch, Search } from '@carbon/icons-react';
import { DrillRequest, openAddress } from './drill';
import { cell, fieldLabel, fieldsOf } from './rows';
import { Row } from './types';
import { SemCell } from './Sem';
import IncidentInsights from './IncidentInsights';
import IncidentTimeline from './IncidentTimeline';
import RunbookPanel from './RunbookPanel';

export default function DrillDrawer({ req, onClose }: { req: DrillRequest; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(req.rows.length === 1 ? 0 : null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const cols = req.columns && req.columns.length ? req.columns : fieldsOf(req.query).slice(0, 4).map(f => f.key);
  const all = fieldsOf(req.query);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? req.rows.filter(r => all.some(f => cell(r, f.key).toLowerCase().includes(n))) : req.rows;
  }, [req.rows, q, all]);
  const noun = req.query === 'getAlerts' ? 'alert' : req.query === 'getApplications' ? 'application' : req.query === 'getMetricSeries' ? 'data point' : 'incident';
  const shown = rows.slice(0, 200);
  const rec = (r: Row) => r as Record<string, unknown>;
  return (
    <aside className="db-drawer" role="dialog" aria-label={req.title}>
      <header className="db-drawer-head">
        <div>
          <h2>{req.title}</h2>
          <span>{req.rows.length} {noun}{req.rows.length === 1 ? '' : 's'}</span>
        </div>
        <button type="button" className="db-iconbtn" aria-label="Close" title="Close (Esc)" onClick={onClose}><Close size={20} /></button>
      </header>
      {req.rows.length > 1 && (
        <label className="db-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="Search these rows" aria-label="Search these rows" value={q} onChange={e => setQ(e.target.value)} />
        </label>
      )}
      <div className="db-drawer-body">
        {shown.length === 0 && <p className="db-lib-none">Nothing matches “{q}”.</p>}
        {shown.map((r, i) => (
          <div key={`${r.id}-${i}`} className={`db-drow${open === i ? ' open' : ''}`}>
            <button type="button" className="db-drow-main" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              {cols.map((k, j) => <span key={k} className={j === 0 ? 'first' : ''} title={fieldLabel(req.query, k)}><SemCell field={k} value={r[k]} shown={cell(r, k)} /></span>)}
            </button>
            {open === i && (
              <dl className="db-drow-all">
                {all.map(f => (r[f.key] === undefined ? null : <div key={f.key}><dt>{f.label}</dt><dd><SemCell field={f.key} value={r[f.key]} shown={cell(r, f.key)} /></dd></div>))}
              </dl>
            )}
            {open === i && req.query === 'getStories' && <IncidentTimeline row={r} />}
            {open === i && req.query === 'getAlerts' && <RunbookPanel row={r} />}
            {open === i && req.query === 'getStories' && <IncidentInsights storyId={String(r.id)} title={String(r.title || '')} />}
            {req.url && (
              <button type="button" className="db-drow-open" onClick={() => openAddress(req.url as string, rec(r), req.newTab !== false)}>Open <Launch size={14} aria-hidden="true" /></button>
            )}
          </div>
        ))}
        {rows.length > shown.length && <p className="db-note">Showing {shown.length} of {rows.length}. Search to narrow them.</p>}
      </div>
    </aside>
  );
}
