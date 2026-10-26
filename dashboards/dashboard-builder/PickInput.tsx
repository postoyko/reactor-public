/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A text field that also offers values from live data (pickers.ts): open incidents for an incident id. Typing stays free (an id, {value}, a list), the list only helps. The source is loaded the
 * first time the field gets the focus, never before, so large lists cost nothing until used.
 */

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BuilderCtx } from './context';
import { sourceKey } from './datahub';
import { PICKS, PickKind, applyPick, matchOptions } from './pickers';

interface Props {
  id: string;
  kind: PickKind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  /** Labels the field (the id of the visible label, or the label text). */
  labelledBy?: string;
  label?: string;
}

export default function PickInput({ id, kind, value, onChange, placeholder, className, invalid, labelledBy, label }: Props) {
  const spec = PICKS[kind];
  const ctx = useContext(BuilderCtx);
  const hub = ctx ? ctx.hub : undefined;
  const [wanted, setWanted] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [, setTick] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  // load the options once someone uses the field, and keep them current while the editor is open
  useEffect(() => {
    if (!wanted || !hub || !spec.query) return undefined;
    return hub.acquire(spec.query, '', 0, () => setTick(t => t + 1));
  }, [wanted, hub, spec.query]);

  const state = hub && spec.query ? hub.snapshot(sourceKey(spec.query, '')) : undefined;
  const all = useMemo(() => (spec.fixed ? spec.fixed : spec.options(state ? state.rows : [])), [spec, state && state.rows]);
  const shown = useMemo(() => matchOptions(all, value, spec.multi), [all, value, spec.multi]);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open]);
  useEffect(() => { setActive(0); }, [value, open]);

  const choose = (v: string) => { onChange(applyPick(value, v, spec.multi)); setOpen(false); };
  const listId = `${id}-options`;
  const loading = Boolean(state && state.loading && !state.rows.length);

  return (
    <div className="db-pick" ref={wrap}>
      <input
        id={id}
        className={`${className || 'db-af-input'}${invalid ? ' is-invalid' : ''}`}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onFocus={() => { setWanted(true); setOpen(true); }}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, Math.max(shown.length - 1, 0))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); choose(shown[active].value); }
          else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
        }}
      />
      {open && (
        <ul className="db-pick-list" id={listId} role="listbox">
          {loading && <li className="db-pick-note">Loading…</li>}
          {!loading && state && state.error && <li className="db-pick-note">Could not load the list. Type the value instead.</li>}
          {!loading && !(state && state.error) && !shown.length && <li className="db-pick-note">{all.length ? 'Nothing matches. You can still type any value.' : 'Nothing to pick from. Type the value.'}</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`db-pick-opt${i === active ? ' is-active' : ''}`}
              onMouseDown={e => { e.preventDefault(); choose(o.value); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="db-pick-label">{o.label}</span>
              {o.sub && <span className="db-pick-sub">{o.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
