/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Saved views: the filters, bar fields, links and pivots someone has set up, under a name ("Payments on-call"), one
 * click to come back to. A view can be copied as a short code and pasted into another browser.
 */

import React, { useState } from 'react';
import { Bookmark, Close } from '@carbon/icons-react';
import Menu from './Menu';

export interface ViewState { sel: Record<string, string[]>; range: { preset: string; from?: string; to?: string }; refresh: number; fields?: unknown; links?: unknown }
export interface SavedView { name: string; state: ViewState }

export const encodeView = (v: SavedView): string => { try { return window.btoa(unescape(encodeURIComponent(JSON.stringify(v)))); } catch (e) { return ''; } };
export function decodeView(code: string): SavedView | null {
  try {
    const v = JSON.parse(decodeURIComponent(escape(window.atob(code.trim()))));
    return v && typeof v.name === 'string' && v.state && typeof v.state === 'object' ? { name: v.name.slice(0, 60), state: v.state } : null;
  } catch (e) { return null; }
}

interface Props { views: SavedView[]; onSave: (name: string) => void; onApply: (v: SavedView) => void; onDelete: (name: string) => void; onImport: (v: SavedView) => void }

export default function ViewsMenu({ views, onSave, onApply, onDelete, onImport }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const copy = (v: SavedView) => {
    const c = encodeView(v);
    const done = () => setMsg(`Code for "${v.name}" copied.`);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(done, () => setCode(c)); else setCode(c);
  };
  return (
    <Menu align="right" trigger={({ open, toggle }) => (
      <button type="button" className={`db-tb${open ? ' is-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} title="Saved views: come back to a set of filters, links and groupings" onClick={toggle}>
        <Bookmark size={16} aria-hidden="true" />Views{views.length ? ` (${views.length})` : ''}
      </button>
    )}>
      {() => (
        <div className="db-fbset db-views" role="dialog" aria-label="Saved views">
          {views.length === 0 && <p className="db-hint">Set up the filters, links and groupings you want, then name the view to come back to it later.</p>}
          {views.map(v => (
            <div key={v.name} className="db-view-row">
              <button type="button" className="db-view-name" onClick={() => onApply(v)} title="Switch to this view">{v.name}</button>
              <button type="button" className="db-link" onClick={() => copy(v)} title="Copy a code to share this view">Share</button>
              <button type="button" className="db-iconbtn" aria-label={`Delete ${v.name}`} title="Delete this view" onClick={() => onDelete(v.name)}><Close size={16} /></button>
            </div>
          ))}
          <form className="db-view-save" onSubmit={e => { e.preventDefault(); if (name.trim()) { onSave(name.trim().slice(0, 60)); setName(''); setMsg('Saved.'); } }}>
            <input type="text" placeholder="Name the current view" aria-label="View name" value={name} onChange={e => setName(e.target.value)} />
            <button type="submit" className="db-bell-go" disabled={!name.trim()}>Save</button>
          </form>
          <details className="db-view-import">
            <summary>Import a shared view</summary>
            <textarea rows={3} placeholder="Paste a code" aria-label="Shared view code" value={code} onChange={e => setCode(e.target.value)} />
            <button type="button" className="db-bell-go" disabled={!code.trim()} onClick={() => { const v = decodeView(code); if (v) { onImport(v); setCode(''); setMsg(`Added "${v.name}".`); } else setMsg('That is not a view code.'); }}>Add view</button>
          </details>
          {msg && <p className="db-hint" role="status">{msg}</p>}
        </div>
      )}
    </Menu>
  );
}
