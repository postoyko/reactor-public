/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shown over an empty dashboard while editing: pick a starter, or start blank. Each card draws a small picture of its layout.
 */

import React, { useMemo } from 'react';
import { availableTemplates, Template } from './templates';
import { Widget } from './types';

const COLOR: Record<string, string> = { kpi: '#0f62fe', bar: '#4589ff', donut: '#8a3ffc', timeseries: '#08bdba', table: '#878d96', text: '#c6c6c6', image: '#c6c6c6' };

const fillOf = (w: Widget) => w.config.bg || COLOR[w.type] || (w.type.startsWith('tile:') ? '#da1e28' : '#a8a8a8');

/** A small picture of the layout, containers included (first tab / slide / section shown). */
function Thumb({ widgets }: { widgets: Widget[] }) {
  const top = widgets.filter(w => !w.parent);
  const rows = Math.max(...top.map(w => w.y + w.h), 1);
  const out: React.ReactNode[] = [];
  const draw = (list: Widget[], ox: number, oy: number, colU: number, rowU: number, depth: number) => {
    list.forEach(w => {
      const x = ox + w.x * colU + 0.5, y = oy + w.y * rowU + 0.5, ww = Math.max(w.w * colU - 1, 2), hh = Math.max(w.h * rowU - 1, 2);
      const owns = widgets.filter(k => k.parent && k.parent.split('#')[0] === w.id);
      if (!owns.length) { out.push(<rect key={w.id} x={x} y={y} width={ww} height={hh} fill={fillOf(w)} opacity={0.85} />); return; }
      out.push(<rect key={w.id} x={x} y={y} width={ww} height={hh} fill="#fff" stroke="#8d8d8d" strokeDasharray="2 2" />);
      const pad = 2, head = Math.min(6, hh / 5);
      const kinds = (k: Widget[], idx: number) => k.filter(c => c.parent === `${w.id}#${idx}`);
      const rowsOf = (k: Widget[]) => Math.max(...k.map(c => c.y + c.h), 1);
      const put = (idx: number, px: number, py: number, pw: number, ph: number) => {
        const k = kinds(owns, idx);
        if (k.length) draw(k, px, py, pw / 12, ph / rowsOf(k), depth + 1);
      };
      const inner = { x: x + pad, y: y + head, w: ww - pad * 2, h: hh - head - pad };
      if (w.type === 'carbon:SplitPane') {
        const pct = Math.min(Math.max(Number((w.config.props || {}).size) || 50, 15), 85) / 100;
        const vert = (w.config.props || {}).direction === 'vertical';
        if (vert) { put(0, inner.x, inner.y, inner.w, inner.h * pct - 1); put(1, inner.x, inner.y + inner.h * pct + 1, inner.w, inner.h * (1 - pct) - 1); }
        else { put(0, inner.x, inner.y, inner.w * pct - 1, inner.h); put(1, inner.x + inner.w * pct + 1, inner.y, inner.w * (1 - pct) - 1, inner.h); }
      } else put(0, inner.x, inner.y, inner.w, inner.h);
    });
  };
  draw(top, 0, 0, 10, 5, 0);
  return <svg viewBox={`0 0 120 ${Math.round(rows * 5)}`} className="db-thumb" aria-hidden="true" preserveAspectRatio="xMidYMin meet">{out}</svg>;
}

export const BLANK: Template = { id: 'blank', name: 'Blank dashboard', tagline: 'An empty canvas', detail: 'An empty canvas', build: () => [] };
interface Props { replace?: boolean; onPick: (t: Template) => void; onBlank: () => void; onTour: () => void }

export default function StartScreen({ replace, onPick, onBlank, onTour }: Props) {
  const list = useMemo(() => availableTemplates().map(t => ({ t, w: t.build() })), []);
  return (
    <div className="db-start" role="region" aria-label="Start a dashboard">
      <div className="db-start-in">
        <div className="db-start-head">
          <h2>Create a dashboard</h2>
          <button type="button" className="db-start-blank-btn" onClick={() => onPick(BLANK)}>Blank dashboard</button>
        </div>
        <p>Pick a head start. Everything in it is an ordinary widget, so you can change, rewire or remove any of it.{replace ? ' This replaces what is on the canvas now; Undo (Ctrl+Z) brings it back.' : ''}</p>
        <div className="db-start-grid">
          <button type="button" className="db-start-card db-start-blankcard" onClick={() => onPick(BLANK)} title="An empty canvas">
            <svg viewBox="0 0 120 70" className="db-thumb" aria-hidden="true"><rect x="1" y="1" width="118" height="68" fill="none" stroke="#8d8d8d" strokeDasharray="4 3" /><path d="M60 26v18M51 35h18" stroke="#0f62fe" strokeWidth="2" /></svg>
            <strong>Blank dashboard</strong>
            <span>An empty canvas. Add widgets yourself.</span>
          </button>
          {list.filter(x => !x.t.advanced).map(({ t, w }) => (
            <button key={t.id} type="button" className="db-start-card" onClick={() => onPick(t)} title={t.detail}>
              <Thumb widgets={w} />
              <strong>{t.name}</strong>
              <span>{t.tagline}</span>
            </button>
          ))}
        </div>
        <h3 className="db-start-sub">Advanced layouts: split panes, tabs, accordions, carousel</h3>
        <div className="db-start-grid">
          {list.filter(x => x.t.advanced).map(({ t, w }) => (
            <button key={t.id} type="button" className="db-start-card" onClick={() => onPick(t)} title={t.detail}>
              <Thumb widgets={w} />
              <strong>{t.name}</strong>
              <span>{t.tagline}</span>
            </button>
          ))}
        </div>
        <div className="db-start-foot">
          <button type="button" className="db-link" onClick={onBlank}>{replace ? 'Cancel' : 'Start with a blank dashboard'}</button>
          <button type="button" className="db-link" onClick={onTour}>Take the 1-minute tour</button>
        </div>
      </div>
    </div>
  );
}
