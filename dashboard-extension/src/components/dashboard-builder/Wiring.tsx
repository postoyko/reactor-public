/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wiring: which widgets a chart, table or chooser sends its selections to. By default a selection reaches every
 * widget that uses the same data; "Only these" limits it to the widgets you tick (`config.sendTo`).
 */

import React from 'react';
import { Glyph } from './Glyph';
import { treeOrder } from './nesting';
import { queryOf } from './bindings';
import { defaultConfig } from './registry';
import { carbonSpec } from './carbon-specs';
import { Widget } from './types';
import { actionLabel, eventsOf } from './component-api';

export const canSend = (w: Widget): boolean =>
  ((w.type === 'bar' || w.type === 'donut') && w.config.emits !== false)
  || (w.type.startsWith('carbon:') && (w.config.props || {}).source === 'field')
  || (!!carbonSpec(w.type)?.emits && w.config.emits !== false && (!carbonSpec(w.type)?.chart?.time || !!w.config.seriesBy))
  || (w.type === 'carbon:ComboButton' && String((w.config.props || {}).items || 'filter:').includes('filter:'))
  || !!w.config.bind;

export const canListen = (w: Widget): boolean => w.config.listens !== false && defaultConfig(w.type).listens !== false;

/** Widgets that can receive what `s` sends (same data, can follow filters). */
export const targetsFor = (all: Widget[], s: Widget): Widget[] => treeOrder(all).filter(t => t.id !== s.id && t.config.query === queryOf(s) && canListen(t));

/** Where the selected widget's selections go, for outlining on the canvas. Empty unless it was limited. */
export function wiredIds(all: Widget[], selected: Widget | null): Set<string> {
  return new Set(selected && canSend(selected) && selected.config.sendTo ? selected.config.sendTo : []);
}

interface EditProps { widget: Widget; all: Widget[]; onChange: (next: Widget, key: string) => void }

export function WireEditor({ widget, all, onChange }: EditProps) {
  const targets = targetsFor(all, widget);
  const isValue = !!widget.config.bind; // a value input only reaches the widgets it is wired to
  const only = isValue || widget.config.sendTo !== undefined;
  const picked = new Set(widget.config.sendTo || []);
  const set = (sendTo: string[] | undefined) => {
    const cfg = { ...widget.config };
    if (sendTo === undefined) delete cfg.sendTo; else cfg.sendTo = sendTo;
    onChange({ ...widget, config: cfg }, `${widget.id}:sendTo`);
  };
  const name = `wire-${widget.id}`;
  return (
    <div className="db-wire-ed">
      {!isValue && <label className="db-check"><input type="radio" name={name} checked={!only} onChange={() => set(undefined)} /> Every widget using the same data ({targets.length})</label>}
      {!isValue && <label className="db-check"><input type="radio" name={name} checked={only} onChange={() => set(targets.map(t => t.id))} /> Only these</label>}
      {isValue && <p className="db-help">Filters these widgets by its value:</p>}
      {only && (
        <div className="db-wire-list">
          {targets.length === 0 && <p className="db-help">No other widget uses this data yet.</p>}
          {targets.map(t => (
            <label key={t.id} className="db-check db-wire-t">
              <input type="checkbox" checked={picked.has(t.id)} onChange={e => set(e.target.checked ? [...picked, t.id] : [...picked].filter(x => x !== t.id))} />
              <Glyph type={t.type} size={18} /> <span>{t.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface PanelProps { widgets: Widget[]; selectedId: string | null; onSelect: (id: string) => void; onChange: (next: Widget, key: string) => void }

export function WiringPanel({ widgets, selectedId, onSelect, onChange }: PanelProps) {
  const senders = treeOrder(widgets).filter(canSend);
  return (
    <div className="db-lib-list db-wiring">
      <p className="db-help db-wire-intro">Click a bar, slice or choice and the widgets below it follow. Here you decide which ones.</p>
      {senders.length === 0 && <p className="db-lib-none">Nothing to wire yet. Add a Bar chart, a Donut or a chooser set to “Filter other widgets”, and it shows up here.</p>}
      <ActionOverview widgets={widgets} onSelect={onSelect} onChange={onChange} />
      {senders.map(s => {
        const n = s.config.sendTo ? s.config.sendTo.length : s.config.bind ? 0 : targetsFor(widgets, s).length;
        return (
          <div key={s.id} className={`db-wire${selectedId === s.id ? ' on' : ''}`}>
            <button type="button" className="db-wire-head" onClick={() => onSelect(s.id)}>
              <Glyph type={s.type} size={20} />
              <span className="db-layer-title">{s.title}</span>
              <span className="db-layer-size">→ {n}</span>
            </button>
            <WireEditor widget={s} all={widgets} onChange={onChange} />
          </div>
        );
      })}
    </div>
  );
}

/** Every action wire on the dashboard in one list: "Button → opens → Dialog". Click one to select its widget. */
function ActionOverview({ widgets, onSelect, onChange }: { widgets: Widget[]; onSelect: (id: string) => void; onChange: (next: Widget, key: string) => void }) {
  const rows = treeOrder(widgets).flatMap(w => (w.config.on || []).map((l, i) => ({ w, l, i })));
  return (
    <div className="db-wire db-wire-actions">
      <div className="db-wire-head" style={{ cursor: 'default' }}><span className="db-layer-title"><strong>Actions</strong></span><span className="db-layer-size">{rows.length}</span></div>
      <p className="db-help db-wire-intro">What one widget makes another do. In Wire mode choose “Actions”, then drag from a widget to the one it should change. Or add them under Actions in a widget's settings.</p>
      {rows.length === 0 && <p className="db-lib-none">No action wires yet.</p>}
      {rows.map(({ w, l, i }) => {
        const t = widgets.find(x => x.id === l.to);
        const ev = eventsOf(w).find(e => e.id === l.event);
        return (
          <div key={`${w.id}:${i}`} className="db-act-line">
            <button type="button" className="db-link" onClick={() => onSelect(w.id)} title="Select the widget that starts this action">
              {w.title} <span className="db-act-ev">{(ev ? ev.label : l.event).toLowerCase()}{l.when ? ` = ${l.when}` : ''}</span> → {t ? `${actionLabel(t, l.do).toLowerCase()}${l.arg && !/^\{value\}$/.test(l.arg) ? ` “${l.arg.length > 24 ? l.arg.slice(0, 24) + '…' : l.arg}”` : ''}` : l.do} <span className="db-act-ev">{t ? t.title : '(missing widget)'}</span>
            </button>
            <button type="button" className="db-link" aria-label="Remove this action wire" onClick={() => { const on = (w.config.on || []).filter((_, j) => j !== i); const cfg = { ...w.config }; if (on.length) cfg.on = on; else delete cfg.on; onChange({ ...w, config: cfg }, `${w.id}:on`); }}>Remove</button>
          </div>
        );
      })}
    </div>
  );
}
