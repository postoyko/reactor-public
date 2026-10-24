/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The left dock while editing: "Add" lists every widget you can place (searchable, grouped), "Layers" lists the
 * widgets already on the dashboard so you can select one without hunting for it on the canvas.
 */

import React, { useContext, useState } from 'react';
import { ChevronDown, ChevronRight, CollapseAll, Copy, ExpandAll, Grid, List, Search, Time, TrashCan } from '@carbon/icons-react';
import { Widget } from './types';
import { Glyph } from './Glyph';
import { depthOf, treeOrder } from './nesting';
import { NestCtx } from './nest';
import { startLibraryDrag, wasDrag } from './dnd';
import { WiringPanel } from './Wiring';

export interface LibItem { key: string; type: string; label: string; description: string; onAdd: () => void; w?: number }
export interface LibSection { id: string; cluster: string; title: string; items: LibItem[] }
export type DockTab = 'add' | 'layers' | 'wiring';
type LibView = 'list' | 'grid';

const RECENT_KEY = 'db-lib-recent';
const VIEW_KEY = 'db-lib-view';
const RECENT_MAX = 6;

function readStore<T>(key: string, fallback: T): T {
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch (e) { return fallback; }
}
function writeStore(key: string, v: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* no storage */ }
}

/** The text with every occurrence of the search words marked. */
function Hit({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : <React.Fragment key={i}>{part}</React.Fragment>))}</>;
}

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
  const [view, setView] = useState<LibView>(() => (readStore<string>(VIEW_KEY, 'list') === 'grid' ? 'grid' : 'list'));
  const [recent, setRecent] = useState<string[]>(() => { const r = readStore<unknown>(RECENT_KEY, []); return Array.isArray(r) ? r.filter(x => typeof x === 'string').slice(0, RECENT_MAX) : []; });
  const query = q.trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);

  // every word must appear somewhere: in the name, the description, the group or the cluster ("chart bar", "status")
  const matches = (i: LibItem, s: LibSection) => !words.length || words.every(w => `${i.label} ${i.description} ${s.title} ${s.cluster}`.toLowerCase().includes(w));
  const shown = sections.map(s => ({ ...s, items: s.items.filter(i => matches(i, s)) })).filter(s => s.items.length > 0);
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const found = shown.reduce((n, s) => n + s.items.length, 0);
  const byKey = new Map(sections.flatMap(s => s.items.map(i => [i.key, i] as const)));
  const recentItems = recent.map(k => byKey.get(k)).filter((i): i is LibItem => Boolean(i));
  const allOpen = sections.every(s => open[s.id]);

  const changeView = (v: LibView) => { setView(v); writeStore(VIEW_KEY, v); };
  const toggleAll = () => setOpen(allOpen ? {} : Object.fromEntries(sections.map(s => [s.id, true])));
  const add = (i: LibItem) => {
    i.onAdd();
    const next = [i.key, ...recent.filter(k => k !== i.key)].slice(0, RECENT_MAX);
    setRecent(next);
    writeStore(RECENT_KEY, next);
  };
  const item = (i: LibItem, where: string) => (
    <button
      key={`${where}-${i.key}`}
      type="button"
      role="listitem"
      className="db-lib-item"
      onClick={() => { if (!wasDrag()) add(i); }}
      onPointerDown={e => { if (dnd) startLibraryDrag(e, i.label, { type: i.type }, dnd, i.w || 4); }}
      title={`${i.label}: ${i.description} (click to add, or drag it onto the canvas or into a tab or section)`}
    >
      <Glyph type={i.type} />
      <span className="db-lib-text"><strong><Hit text={i.label} words={words} /></strong>{view === 'list' && <span><Hit text={i.description} words={words} /></span>}</span>
    </button>
  );

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
          <div className="db-lib-bar">
            <span className="db-lib-found" aria-live="polite">{query ? `${found} of ${total}` : `${total} widgets`}</span>
            {!query && (
              <button type="button" className="db-iconbtn" title={allOpen ? 'Collapse all groups' : 'Expand all groups'} aria-label={allOpen ? 'Collapse all groups' : 'Expand all groups'} onClick={toggleAll}>
                {allOpen ? <CollapseAll size={16} /> : <ExpandAll size={16} />}
              </button>
            )}
            <span className="db-lib-seg" role="group" aria-label="View">
              <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} title="List with descriptions" aria-label="List view" onClick={() => changeView('list')}><List size={16} /></button>
              <button type="button" className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} title="Compact grid" aria-label="Grid view" onClick={() => changeView('grid')}><Grid size={16} /></button>
            </span>
          </div>
          <div className={`db-lib-list db-lib-list--${view}`} role="list">
            {shown.length === 0 && <p className="db-lib-none">Nothing matches “{q}”. Try a shorter word, such as “tab” or “table”.</p>}
            {!query && recentItems.length > 0 && (
              <div className="db-lib-sec db-lib-recent">
                <h3 className="db-lib-cluster"><Time size={12} aria-hidden="true" /> Recently used</h3>
                <div className="db-lib-items">{recentItems.map(i => item(i, 'recent'))}</div>
              </div>
            )}
            {shown.map(s => {
              const isOpen = Boolean(query) || Boolean(open[s.id]);
              const head = s.cluster !== lastCluster ? s.cluster : '';
              lastCluster = s.cluster;
              return (
                <div key={s.id} className="db-lib-sec">
                  {head && <h3 className="db-lib-cluster">{head}</h3>}
                  <button type="button" className="db-lib-head" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [s.id]: !o[s.id] }))}>
                    {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    <span><Hit text={s.title} words={words} /></span>
                    <span className="db-count">{s.items.length}</span>
                  </button>
                  {isOpen && <div className="db-lib-items">{s.items.map(i => item(i, s.id))}</div>}
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
