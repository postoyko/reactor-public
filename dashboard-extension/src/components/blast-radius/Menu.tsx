/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A small menu-bar dropdown: a button that opens a list of actions, radios or checks. Closes on outside click or Escape; arrow keys move.
 */

import React, { useEffect, useRef, useState } from 'react';

export interface MenuItem { label: string; onClick?: () => void; checked?: boolean; radio?: boolean; disabled?: boolean; hint?: string; divider?: boolean; keepOpen?: boolean }

export const Menu: React.FC<{ label: React.ReactNode; items: MenuItem[]; title?: string; active?: boolean }> = ({ label, items, title, active }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const bs = Array.from((root.current as HTMLElement).querySelectorAll('.blast__dditem:not(:disabled)')) as HTMLElement[];
    if (!bs.length) return;
    const at = bs.indexOf(document.activeElement as HTMLElement);
    bs[(at + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus();
  };
  return (
    <div className="blast__dd" ref={root} onKeyDown={keys}>
      <button className={`blast__ddbtn${open || active ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} title={title} onClick={() => setOpen(o => !o)}>{label} <span aria-hidden="true">▾</span></button>
      {open && (
        <div className="blast__ddpop" role="menu">
          {items.map((it, i) => it.divider
            ? <div key={i} className="blast__ddsep" role="separator" />
            : <button key={i} className="blast__dditem" role={it.radio ? 'menuitemradio' : it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={it.checked} disabled={it.disabled} title={it.hint}
                onClick={() => { it.onClick?.(); if (!it.keepOpen) setOpen(false); }}>
                <span className="blast__ddchk" aria-hidden="true">{it.checked ? (it.radio ? '●' : '✓') : ''}</span>{it.label}
              </button>)}
        </div>
      )}
    </div>
  );
};
