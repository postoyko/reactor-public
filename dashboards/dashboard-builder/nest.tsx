/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A panel that holds widgets (inside a Container, a tab, an accordion section or a split pane). It is the same grid as
 * the dashboard itself, one level down, so widgets inside move, resize, select and wire up exactly like the others.
 */

import React, { useContext } from 'react';
import { Add } from '@carbon/icons-react';
import GridCanvas from './GridCanvas';
import { MAX_DEPTH, isContainerType, slotOwner } from './nesting';
import { NATIVE, TILES } from './registry';
import { GROUPS, SPECS } from './carbon-specs';
import { Widget } from './types';
import { Dnd } from './dnd';

/** Runtime linking while viewing: lets each widget show a "Filter bar" switch. */
export interface LinkApi {
  on: boolean; follows: (w: Widget) => boolean; toggle: (w: Widget) => void;
  /** True while people are viewing (not designing): runtime controls such as notifications and pivoting show. */
  viewing: boolean;
  /** Fields this widget can be regrouped by, or null when it cannot be pivoted. */
  pivotFields: (w: Widget) => Array<{ key: string; label: string }> | null;
  setPivot: (w: Widget, key: string) => void;
  /** Chart types this widget can be viewed as, or null when it cannot be switched. */
  viewAsChoices: (w: Widget) => Array<{ type: string; label: string }> | null;
  setViewAs: (w: Widget, type: string) => void;
  /** This person switched the widget from the type it was saved with. */
  viewAsChanged: (w: Widget) => boolean;
  /** Runtime resizing: handles are showing, and where a finished resize goes (only for this person, this browser). */
  resizeOn: boolean;
  setLayout: (next: Widget[]) => void;
}
export const LinkCtx = React.createContext<LinkApi | null>(null);

export interface NestApi {
  widgets: Widget[];
  editing: boolean;
  selectedId: string | null;
  rowH?: number;
  wired: Set<string>;
  onSelect: (id: string | null) => void;
  setAll: (next: Widget[]) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  renderBody: (w: Widget) => React.ReactNode;
  addTo: (slot: string, type: string) => void;
  dnd: Dnd;
}

export const NestCtx = React.createContext<NestApi | null>(null);

function depthOfSlot(widgets: Widget[], slot: string): number {
  let d = 1; let cur = widgets.find(w => w.id === slotOwner(slot));
  while (cur && cur.parent && d < 12) { cur = widgets.find(w => w.id === slotOwner(cur!.parent as string)); d++; }
  return d;
}

function AddHere({ slot, deep }: { slot: string; deep: boolean }) {
  const n = useContext(NestCtx);
  if (!n) return null;
  return (
    <label className="db-slot-add">
      <Add size={16} aria-hidden="true" />
      <select aria-label="Add a widget here" value="" onChange={e => { if (e.target.value) n.addTo(slot, e.target.value); }}>
        <option value="">Add a widget here…</option>
        <optgroup label="Data and content">
          {NATIVE.filter(x => !(deep && x.type === 'group')).map(x => <option key={x.type} value={x.type}>{x.label}</option>)}
        </optgroup>
        {GROUPS.map(g => (
          <optgroup key={g} label={`Carbon: ${g}`}>
            {SPECS.filter(c => c.group === g && !(deep && isContainerType(`carbon:${c.name}`))).map(c => <option key={c.name} value={`carbon:${c.name}`}>{c.label}</option>)}
          </optgroup>
        ))}
        {TILES.length > 0 && (
          <optgroup label="Your dashboards">
            {TILES.map(t => <option key={t.id} value={`tile:${t.id}`}>{t.label}</option>)}
          </optgroup>
        )}
      </select>
    </label>
  );
}

export function Slot({ id }: { id: string }) {
  const n = useContext(NestCtx);
  if (!n) return <div className="db-empty">Widgets can only be placed inside a dashboard.</div>;
  const kids = n.widgets.filter(w => w.parent === id);
  const deep = depthOfSlot(n.widgets, id) >= MAX_DEPTH;
  return (
    <div className="db-slot">
      {kids.length === 0 && !n.editing && <div className="db-empty">Nothing here.</div>}
      <GridCanvas
        nested
        slot={id}
        depth={depthOfSlot(n.widgets, id)}
        widgets={kids}
        rowH={n.rowH}
        editing={n.editing}
        selectedId={n.selectedId}
        wired={n.wired}
        onSelect={n.onSelect}
        onLayout={next => n.setAll([...n.widgets.filter(w => w.parent !== id), ...next])}
        onRemove={n.onRemove}
        onDuplicate={n.onDuplicate}
        renderBody={n.renderBody}
      />
      {n.editing && <AddHere slot={id} deep={deep} />}
    </div>
  );
}
