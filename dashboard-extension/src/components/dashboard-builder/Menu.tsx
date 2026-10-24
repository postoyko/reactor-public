/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A small pop-over menu for the toolbar. Closes on outside click and Escape; arrow keys move between items.
 */

import React, { useEffect, useRef, useState } from 'react';

interface Props {
  trigger: (p: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
}

export default function Menu({ trigger, children, align = 'left' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(ref.current ? ref.current.querySelectorAll<HTMLElement>('.db-pop [role^="menuitem"]:not(:disabled)') : []);
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
    items[next].focus();
  };

  return (
    <div className="db-menu" ref={ref} onKeyDown={onKey}>
      {trigger({ open, toggle: () => setOpen(o => !o) })}
      {open && <div className={`db-pop db-pop--${align}`} role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}
