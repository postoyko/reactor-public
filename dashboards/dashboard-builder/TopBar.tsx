/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The Designer's top bar: the dashboard switcher (rename, duplicate, delete), the design tools while editing (undo,
 * wire, flows, filter bar, templates, add widget), and the viewer's tools (saved views, arrange, link, reset), the
 * More menu and the Preview / Edit switch. It holds no dashboard state of its own except the saved views list.
 */

import React, { useRef, useState } from 'react';
import { Activity, Add, Checkmark, ChevronDown, Connect, Copy, Download, Flow, Help, OverflowMenuVertical, Redo, Renew, Template, TrashCan, Undo, Upload } from '@carbon/icons-react';
import FilterBarSettings from './FilterBarSettings';
import Menu from './Menu';
import { Dashboard, FilterBarConfig } from './types';
import { VERSION } from './version';
import ViewsMenu, { SavedView, ViewState } from './ViewsMenu';

const VIEWS_KEY = 'db-views';

export interface TopBarProps {
  /** Hosted by the Workbench: the name is shown, not switched or renamed here. */
  hosted: boolean;
  /** Import and the shared layout are only offered in the browser's own dashboards. */
  canImport: boolean;
  readOnly: boolean;
  isEditing: boolean;
  dashboards: Dashboard[];
  active: Dashboard;
  /** The saved views belong to the saved dashboard's id. */
  baseId: string;
  dash: {
    switchTo: (id: string) => void; create: () => void; copy: () => void; rename: (name: string) => void; remove: () => void;
    renaming: boolean; setRenaming: (on: boolean) => void; confirmDelete: boolean; setConfirmDelete: (on: boolean) => void;
  };
  design: {
    canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void;
    wireMode: boolean; toggleWire: () => void; flowsOpen: boolean; openFlows: () => void;
    bar: FilterBarConfig | undefined; setBar: (b: FilterBarConfig | undefined) => void;
    templates: () => void; addWidget: () => void;
  };
  view: {
    /** What a saved view captures now, and how one is brought back. */
    state: () => ViewState; apply: (s: ViewState) => void;
    resizeMode: boolean; toggleResize: () => void;
    canLink: boolean; linkMode: boolean; toggleLink: () => void;
    changed: boolean; reset: () => void;
  };
  more: { tour: () => void; refresh: () => void; apiCheck: () => void; exportJson: () => void; importFile: (f: File | undefined) => void; shared?: () => void };
  setEditing: (on: boolean) => void;
}

export default function TopBar(p: TopBarProps) {
  const { active, dash, design, view, more, isEditing, readOnly } = p;
  const fileRef = useRef<HTMLInputElement>(null);
  const [views, setViews] = useState<Record<string, SavedView[]>>(() => { try { return JSON.parse(window.localStorage.getItem(VIEWS_KEY) || '{}'); } catch (e) { return {}; } });
  const putViews = (fn: (l: SavedView[]) => SavedView[]) => setViews(all => {
    const next = { ...all, [p.baseId]: fn(all[p.baseId] || []) };
    try { window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch (e) { /* no storage */ }
    return next;
  });

  return (
    <header className="db-bar-top">
      <div className="db-title">
        {p.hosted ? (
          <span className="db-tb db-name"><span className="db-name-text">{active.name}</span></span>
        ) : dash.renaming && isEditing ? (
          <input
            className="db-name-input"
            aria-label="Dashboard name"
            value={active.name}
            autoFocus
            onFocus={e => e.target.select()}
            onChange={e => dash.rename(e.target.value)}
            onBlur={() => dash.setRenaming(false)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') dash.setRenaming(false); }}
          />
        ) : (
          <Menu
            trigger={({ open, toggle }) => (
              <button type="button" className={`db-tb db-name${open ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { dash.setConfirmDelete(false); toggle(); }} onDoubleClick={() => { if (isEditing) dash.setRenaming(true); }}>
                <span className="db-name-text">{active.name}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            )}
          >
            {close => (
              <>
                <div className="db-pop-label">Dashboards</div>
                {p.dashboards.map(d => (
                  <button key={d.id} type="button" role="menuitemradio" aria-checked={d.id === active.id} className="db-pop-item" onClick={() => { dash.switchTo(d.id); close(); }}>
                    <span className="db-pop-check">{d.id === active.id && <Checkmark size={16} aria-hidden="true" />}</span>
                    <span className="db-pop-text">{d.name}</span>
                    <span className="db-pop-meta">{d.widgets.length}</span>
                  </button>
                ))}
                {!readOnly && (
                  <>
                    <div className="db-pop-sep" />
                    <button type="button" role="menuitem" className="db-pop-item" onClick={() => { dash.create(); close(); }}><span className="db-pop-check"><Add size={16} aria-hidden="true" /></span><span className="db-pop-text">New dashboard</span></button>
                    <button type="button" role="menuitem" className="db-pop-item" onClick={() => { dash.copy(); close(); }}><span className="db-pop-check"><Copy size={16} aria-hidden="true" /></span><span className="db-pop-text">Duplicate “{active.name}”</span></button>
                    <button type="button" role="menuitem" className="db-pop-item" onClick={() => { p.setEditing(true); dash.setRenaming(true); close(); }}><span className="db-pop-check" /><span className="db-pop-text">Rename</span></button>
                    {dash.confirmDelete ? (
                      <div className="db-pop-confirm">
                        <span>Delete “{active.name}”? This can’t be undone.</span>
                        <span>
                          <button type="button" role="menuitem" className="db-pop-btn danger" onClick={() => { dash.remove(); close(); }}>Delete</button>
                          <button type="button" role="menuitem" className="db-pop-btn" onClick={() => dash.setConfirmDelete(false)}>Keep</button>
                        </span>
                      </div>
                    ) : (
                      <button type="button" role="menuitem" className="db-pop-item danger" onClick={() => dash.setConfirmDelete(true)}><span className="db-pop-check"><TrashCan size={16} aria-hidden="true" /></span><span className="db-pop-text">Delete dashboard…</span></button>
                    )}
                  </>
                )}
              </>
            )}
          </Menu>
        )}
        <span className="db-version" title="Dashboard Designer version">{VERSION}</span>
      </div>

      {isEditing && (
        <div className="db-tools">
          <button type="button" className="db-tb icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!design.canUndo} onClick={design.undo}><Undo size={16} /></button>
          <button type="button" className="db-tb icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!design.canRedo} onClick={design.redo}><Redo size={16} /></button>
          <button type="button" data-tour="wire" className={`db-tb${design.wireMode ? ' is-on' : ''}`} aria-pressed={design.wireMode} title="Wire mode (W): drag from a widget's port to the widgets it should filter" onClick={design.toggleWire}>
            <Connect size={16} aria-hidden="true" />Wire
          </button>
          <button type="button" className={`db-tb${design.flowsOpen ? ' is-on' : ''}`} title="Action flows: what happens when people click, change or pick something" onClick={design.openFlows}>
            <Flow size={16} aria-hidden="true" />Flows
          </button>
          <span className="db-sep" />
          <FilterBarSettings bar={design.bar} onChange={design.setBar} />
          <button type="button" className="db-tb" data-tour="templates" title="Start from a template" onClick={design.templates}>
            <Template size={16} aria-hidden="true" />Templates
          </button>
          <button type="button" className="db-tb" title="Find a widget to add (/)" onClick={design.addWidget}>
            <Add size={16} aria-hidden="true" />Add widget
          </button>
        </div>
      )}

      <div className="db-tools db-tools--end">
        {!isEditing && (
          <ViewsMenu
            views={views[p.baseId] || []}
            onSave={name => putViews(l => [...l.filter(v => v.name !== name), { name, state: view.state() }])}
            onApply={v => view.apply(v.state)}
            onDelete={name => putViews(l => l.filter(v => v.name !== name))}
            onImport={v => putViews(l => [...l.filter(x => x.name !== v.name), v])}
          />
        )}
        {!isEditing && active.widgets.length > 0 && (
          <button type="button" className={`db-tb${view.resizeMode ? ' is-on' : ''}`} aria-pressed={view.resizeMode} title="Arrange widgets: drag a widget by its title to move it, drag its corner to resize it (only for you)" onClick={view.toggleResize}>
            {view.resizeMode ? 'Done arranging' : 'Arrange widgets'}
          </button>
        )}
        {!isEditing && view.changed && <button type="button" className="db-tb" title="Back to the links and sizes this dashboard was saved with" onClick={view.reset}>Reset changes</button>}
        {!isEditing && view.canLink && (
          <button type="button" className={`db-tb${view.linkMode ? ' is-on' : ''}`} aria-pressed={view.linkMode} title="Link widgets: choose which charts and filters change which widgets (only for you)" onClick={view.toggleLink}>
            <Connect size={16} aria-hidden="true" />{view.linkMode ? 'Done linking' : 'Link widgets'}
          </button>
        )}
        {!readOnly && <button type="button" className="db-tb" title="Take the 1-minute tour" aria-label="Take the tour" onClick={more.tour}><Help size={16} aria-hidden="true" />Tour</button>}
        <button type="button" className="db-tb icon" title="Refresh data" aria-label="Refresh data" onClick={more.refresh}><Renew size={16} /></button>
        <Menu align="right" trigger={({ open, toggle }) => (
          <button type="button" className={`db-tb icon${open ? ' is-on' : ''}`} title="More" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><OverflowMenuVertical size={16} /></button>
        )}>
          {close => (
            <>
              {!readOnly && <button type="button" role="menuitem" className="db-pop-item" onClick={() => { more.tour(); close(); }}><span className="db-pop-check"><Help size={16} aria-hidden="true" /></span><span className="db-pop-text">Take the tour</span></button>}
              <button type="button" role="menuitem" className="db-pop-item" onClick={() => { more.apiCheck(); close(); }}><span className="db-pop-check"><Activity size={16} aria-hidden="true" /></span><span className="db-pop-text">Check the Concert Operate API</span></button>
              <button type="button" role="menuitem" className="db-pop-item" onClick={() => { more.exportJson(); close(); }}><span className="db-pop-check"><Download size={16} aria-hidden="true" /></span><span className="db-pop-text">Export as JSON</span></button>
              {!readOnly && p.canImport && <button type="button" role="menuitem" className="db-pop-item" onClick={() => { if (fileRef.current) fileRef.current.click(); close(); }}><span className="db-pop-check"><Upload size={16} aria-hidden="true" /></span><span className="db-pop-text">Import JSON</span></button>}
              {!readOnly && p.canImport && more.shared && <button type="button" role="menuitem" className="db-pop-item" onClick={() => { if (more.shared) more.shared(); close(); }}><span className="db-pop-check"><Copy size={16} aria-hidden="true" /></span><span className="db-pop-text">Add the shared layout</span></button>}
            </>
          )}
        </Menu>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { more.importFile(e.target.files ? e.target.files[0] : undefined); e.target.value = ''; }} />
        {readOnly ? (
          <span className="db-badge" title="This layout is fixed. Make a copy to change it.">Read only</span>
        ) : (
          <div className="db-seg" role="group" aria-label="Mode" data-tour="mode">
            <button type="button" aria-pressed={!isEditing} onClick={() => p.setEditing(false)}>Preview</button>
            <button type="button" aria-pressed={isEditing} onClick={() => p.setEditing(true)}>Edit</button>
          </div>
        )}
      </div>
    </header>
  );
}
