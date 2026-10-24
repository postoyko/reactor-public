/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A bell on a number: "tell me when this goes above (or below) N". While the dashboard is open, crossing the line
 * outlines the number and sends a browser notification (if allowed). Kept in this browser, per widget.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Notification as BellIcon, NotificationFilled } from '@carbon/icons-react';

export interface Rule { op: '>' | '<'; value: number }
const KEY = 'db-thresholds';
const load = (): Record<string, Rule> => { try { return JSON.parse(window.localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
const save = (all: Record<string, Rule>) => { try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* no storage */ } };

export const breached = (r: Rule | undefined, v: number | undefined): boolean => Boolean(r && v !== undefined && (r.op === '>' ? v > r.value : v < r.value));

/** The rule for a widget, and whether it is breached right now. */
export function useThreshold(id: string, value: number | undefined, title: string): { rule?: Rule; hit: boolean; setRule: (r: Rule | undefined) => void } {
  const [rule, setRuleState] = useState<Rule | undefined>(() => load()[id]);
  const was = useRef(false);
  const hit = breached(rule, value);
  useEffect(() => {
    if (hit && !was.current && rule) {
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(title, { body: `${value} is ${rule.op === '>' ? 'above' : 'below'} ${rule.value}` });
        }
      } catch (e) { /* notifications unavailable */ }
    }
    was.current = hit;
  }, [hit, rule, title, value]);
  const setRule = (r: Rule | undefined) => {
    const all = load(); if (r) all[id] = r; else delete all[id]; save(all); setRuleState(r);
    if (r) { try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission(); } catch (e) { /* ignore */ } }
  };
  return { rule, hit, setRule };
}

export default function ThresholdBell({ rule, hit, setRule }: { rule?: Rule; hit: boolean; setRule: (r: Rule | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<'>' | '<'>(rule ? rule.op : '>');
  const [val, setVal] = useState(rule ? String(rule.value) : '');
  const Icon = rule ? NotificationFilled : BellIcon;
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<React.CSSProperties>({});
  // The pop-over is placed against the window (not inside the widget, which would clip it): above the bell, or below it when there is no room.
  const place = () => {
    const r = btn.current ? btn.current.getBoundingClientRect() : null;
    if (!r) return;
    const right = Math.max(window.innerWidth - r.right, 8);
    setAt(r.top > 150 ? { position: 'fixed', right, bottom: window.innerHeight - r.top + 6 } : { position: 'fixed', right, top: r.bottom + 6 });
  };
  useEffect(() => {
    if (!open) return undefined;
    place();
    const down = (e: PointerEvent) => { const n = e.target as Node; if (pop.current && !pop.current.contains(n) && btn.current && !btn.current.contains(n)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key); window.addEventListener('resize', place);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); window.removeEventListener('resize', place); };
  }, [open]);
  const host = btn.current ? (btn.current.closest('.dashboard-builder-container') as HTMLElement | null) || document.body : document.body;
  return (
    <div className="db-bell" onPointerDown={e => e.stopPropagation()}>
      <button type="button" ref={btn} className={`db-bell-btn${rule ? ' on' : ''}${hit ? ' hit' : ''}`} aria-label={rule ? `Alert when ${rule.op} ${rule.value}` : 'Notify me about this number'} aria-expanded={open}
        title={rule ? `Notifying when ${rule.op === '>' ? 'above' : 'below'} ${rule.value}` : 'Notify me when this number crosses a line'} onClick={() => setOpen(o => !o)}><Icon size={16} /></button>
      {open && createPortal(
        <div className="db-bell-pop" role="dialog" aria-label="Notify me" ref={pop} style={at}>
          <span>Notify me when it is</span>
          <select value={op} onChange={e => setOp(e.target.value as '>' | '<')} aria-label="Above or below"><option value=">">above</option><option value="<">below</option></select>
          <input type="number" value={val} onChange={e => setVal(e.target.value)} aria-label="Number" />
          <button type="button" className="db-bell-go" disabled={val === '' || !Number.isFinite(Number(val))} onClick={() => { setRule({ op, value: Number(val) }); setOpen(false); }}>Set</button>
          {rule && <button type="button" className="db-link" onClick={() => { setRule(undefined); setVal(''); setOpen(false); }}>Clear</button>}
        </div>, host)}
    </div>
  );
}
