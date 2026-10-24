/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The side panel that drill-through opens: the rows behind what was clicked, searchable, with every field of a row one
 * click away and an Open button when the widget has an address for it.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Close, Launch, Search } from '@carbon/icons-react';
import { DrillRequest, openAddress } from './drill';
import { cell, fieldLabel, fieldsOf } from './rows';
import { Row } from './types';
import { SemCell } from './Sem';
import Explain from './Explain';
import IncidentInsights from './IncidentInsights';
import IncidentTimeline from './IncidentTimeline';
import RunbookPanel from './RunbookPanel';
import { shapeOf } from './sources';

const WIDTH_KEY = 'db-drawer-width';
const MIN_W = 360;
const readWidth = (): number => { try { const n = Number(window.localStorage.getItem(WIDTH_KEY)); return n >= MIN_W ? n : 520; } catch (e) { return 520; } };
interface Float { x: number; y: number; h: number }

/**
 * Where the panel may go: below whatever sits above the dashboard (Concert Operate's own header), so its title and
 * Close button are never hidden. Measured from the dashboard's container, as it is on screen now.
 */
function topLimit(el: HTMLElement | null): number {
  const host = el && el.closest('.dashboard-builder-container');
  const t = host ? host.getBoundingClientRect().top : 0;
  return Math.max(0, Math.min(t, window.innerHeight - 200));
}

export default function DrillDrawer({ req, onClose }: { req: DrillRequest; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const [top, setTop] = useState(0);
  const [width, setWidth] = useState(readWidth);
  // docked on the right (null), or floating where its title bar was dragged
  const [float, setFloat] = useState<Float | null>(null);
  useLayoutEffect(() => {
    const measure = () => setTop(topLimit(ref.current));
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, []);
  const keepWidth = (w: number): number => { const v = Math.round(Math.min(Math.max(w, MIN_W), window.innerWidth - 16)); setWidth(v); try { window.localStorage.setItem(WIDTH_KEY, String(v)); } catch (e) { /* no storage */ } return v; };
  const clampFloat = (f: Float): Float => {
    const y = Math.min(Math.max(f.y, top), Math.max(top, window.innerHeight - 120));
    return { x: Math.min(Math.max(f.x, 0), Math.max(0, window.innerWidth - Math.min(width, window.innerWidth))), y, h: Math.max(160, Math.min(f.h, window.innerHeight - y - 8)) };
  };
  const dragHead = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const box = ref.current ? ref.current.getBoundingClientRect() : null;
    if (!box) return;
    e.preventDefault();
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    const h = box.height;
    const move = (m: PointerEvent) => setFloat(clampFloat({ x: m.clientX - dx, y: m.clientY - dy, h }));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('db-dragging'); };
    document.body.classList.add('db-dragging');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const dragEdge = (e: React.PointerEvent) => {
    if (e.button !== 0 || !ref.current) return;
    e.preventDefault();
    const right = ref.current.getBoundingClientRect().right;
    // the right edge stays put; a floating panel grows to the left
    const move = (m: PointerEvent) => { const w = keepWidth(right - m.clientX); setFloat(f => (f ? { ...f, x: Math.max(0, right - w) } : f)); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('db-dragging'); };
    document.body.classList.add('db-dragging');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const place: React.CSSProperties = float
    ? { top: float.y, left: float.x, right: 'auto', bottom: 'auto', height: float.h, width, maxWidth: '100%' }
    : { top, width, maxWidth: '100%' };
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(req.rows.length === 1 && !req.explain ? 0 : null);
  const [explain, setExplain] = useState(Boolean(req.explain));
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
  const shape = shapeOf(req.query);
  const noun = shape === 'alerts' ? 'alert' : shape === 'apps' ? 'application' : shape === 'metric' ? 'data point' : shape === 'stories' ? 'incident' : shape === 'people' ? 'entry' : 'record';
  const shown = rows.slice(0, 200);
  const rec = (r: Row) => r as Record<string, unknown>;
  return (
    <aside ref={ref} className={`db-drawer${float ? ' is-float' : ''}`} role="dialog" aria-label={req.title} style={place}>
      <div className="db-drawer-edge" role="separator" aria-orientation="vertical" aria-label="Resize the panel" aria-valuenow={width} tabIndex={0} title="Drag to resize"
        onPointerDown={dragEdge} onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); keepWidth(width + 40); } if (e.key === 'ArrowRight') { e.preventDefault(); keepWidth(width - 40); } }} />
      <header className="db-drawer-head" onPointerDown={dragHead} onDoubleClick={() => setFloat(null)} title={float ? 'Drag to move · double-click to dock on the right' : 'Drag to move'}>
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
        {(shape === 'alerts' || shape === 'stories') && req.rows.length > 0 && (
          <div className="db-ex-wrap">
            <button type="button" className="db-ex-toggle" aria-expanded={explain} onClick={() => setExplain(x => !x)}>{explain ? '▾' : '▸'} Explain {req.rows.length === 1 ? `this ${noun}` : `these ${req.rows.length} ${noun}s`}</button>
            {explain && <Explain query={req.query} rows={req.rows} />}
          </div>
        )}
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
            {open === i && shape === 'stories' && <IncidentTimeline row={r} />}
            {open === i && shape === 'alerts' && <RunbookPanel row={r} />}
            {open === i && shape === 'stories' && <IncidentInsights storyId={String(r.id)} title={String(r.title || '')} />}
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
