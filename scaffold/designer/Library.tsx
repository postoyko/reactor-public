/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The left dock while editing: "Add" lists every widget you can place (searchable, grouped), "Layers" lists the
 * widgets already on the dashboard so you can select one without hunting for it on the canvas.
 */

import React, { useContext, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Search, TrashCan } from '@carbon/icons-react';
import { Widget } from './types';
import { Glyph } from './Glyph';
import { depthOf, treeOrder } from './nesting';
import { NestCtx } from './nest';
import { startLibraryDrag, wasDrag } from './dnd';
import { WiringPanel } from './Wiring';

export interface LibItem { key: string; type: string; label: string; description: string; onAdd: () => void; w?: number }
export interface LibSection { id: string; cluster: string; title: string; items: LibItem[] }
export type DockTab = 'add' | 'layers' | 'wiring';

interface Props {
  sections: LibSection[];
  widgets: Widget[];
  selectedId: string | null;
  tab: DockTab;
  onTab: (t: DockTab) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onWire: (next: Widget, key: string) => void;
}

export default function Library({ sections, widgets, selectedId, tab, onTab, searchRef, onSelect, onDuplicate, onRemove, onWire }: Props) {
  const dnd = useContext(NestCtx)?.dnd;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ data: true });
  const query = q.trim().toLowerCase();

  const matches = (i: LibItem) => !query || `${i.label} ${i.description}`.toLowerCase().includes(query);
  const shown = sections.map(s => ({ ...s, items: s.items.filter(matches) })).filter(s => s.items.length > 0);
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  const layers = treeOrder(widgets);
  let lastCluster = '';

  return (
    <div className="db-lib">
      <div className="db-tabs" role="tablist" aria-label="Library">
        <button type="button" role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'on' : ''} onClick={() => onTab('add')}>Add</button>
        <button type="button" role="tab" aria-selected={tab === 'layers'} className={tab === 'layers' ? 'on' : ''} onClick={() => onTab('layers')}>
          Layers<span className="db-count">{widgets.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'wiring'} className={tab === 'wiring' ? 'on' : ''} onClick={() => onTab('wiring')}>Wiring</button>
      </div>

      {tab === 'add' && (
        <>
          <label className="db-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              placeholder={`Search ${total} widgets`}
              aria-label="Search widgets"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur(); } }}
            />
            <kbd>/</kbd>
          </label>
          <div className="db-lib-list" role="list">
            {shown.length === 0 && <p className="db-lib-none">Nothing matches “{q}”. Try a shorter word, such as “tab” or “table”.</p>}
            {shown.map(s => {
              const isOpen = Boolean(query) || Boolean(open[s.id]);
              const head = s.cluster !== lastCluster ? s.cluster : '';
              lastCluster = s.cluster;
              return (
                <div key={s.id} className="db-lib-sec">
                  {head && <h3 className="db-lib-cluster">{head}</h3>}
                  <button type="button" className="db-lib-head" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [s.id]: !o[s.id] }))}>
                    {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    <span>{s.title}</span>
                    <span className="db-count">{s.items.length}</span>
                  </button>
                  {isOpen && s.items.map(i => (
                    <button key={i.key} type="button" role="listitem" className="db-lib-item" onClick={() => { if (!wasDrag()) i.onAdd(); }} onPointerDown={e => { if (dnd) startLibraryDrag(e, i.label, { type: i.type }, dnd, i.w || 4); }} title={`${i.description} (click to add, or drag it onto the canvas or into a tab or section)`}>
                      <Glyph type={i.type} />
                      <span className="db-lib-text"><strong>{i.label}</strong><span>{i.description}</span></span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'wiring' && <WiringPanel widgets={widgets} selectedId={selectedId} onSelect={onSelect} onChange={onWire} />}

      {tab === 'layers' && (
        <div className="db-lib-list" role="list">
          {layers.length === 0 && <p className="db-lib-none">No widgets yet. Open Add and pick one.</p>}
          {layers.map(w => (
            <div key={w.id} role="listitem" className={`db-layer${selectedId === w.id ? ' on' : ''}`} style={{ paddingLeft: depthOf(widgets, w) * 14 }}>
              <button type="button" className="db-layer-main" onClick={() => onSelect(w.id)} aria-current={selectedId === w.id ? 'true' : undefined}>
                <Glyph type={w.type} size={20} />
                <span className="db-layer-title">{w.title}</span>
                <span className="db-layer-size">{w.w}×{w.h}</span>
              </button>
              <span className="db-layer-act">
                <button type="button" className="db-iconbtn" title="Duplicate" aria-label={`Duplicate ${w.title}`} onClick={() => onDuplicate(w.id)}><Copy size={16} /></button>
                <button type="button" className="db-iconbtn" title="Remove" aria-label={`Remove ${w.title}`} onClick={() => onRemove(w.id)}><TrashCan size={16} /></button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
