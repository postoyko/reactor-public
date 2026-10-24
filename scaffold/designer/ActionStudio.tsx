/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Action flows: a full-screen, canvas-style editor for the dashboard's action wiring. Three lanes read left to right
 * as a sentence: WHEN a widget raises an event, THEN an action runs, ON a target widget. Every action rule
 * (widget.config.on) is one card in the middle lane, joined to its trigger and its target by a drawn connector.
 *
 * - Drag from a trigger's port (●) onto any widget to create an action; every other widget is offered while dragging.
 * - Select an action to edit it in the side panel: events and actions are tiles built from component-api.ts, so only
 *   what the chosen widgets can actually raise or receive is offered.
 * - Suggestions are proposed from the widgets on the dashboard (a button and a dialog, a hidden panel, tabs ...).
 *
 * The data model is unchanged: the editor reads and writes the same ActionLink rules the runtime runs.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Add, Application, ArrowRight, Checkmark, ChevronDown, ChevronRight, Close, Copy, Cursor_1, DataBase, Edit, Flow, Hashtag,
  Keyboard, MagicWand, Maximize, Search, Settings, TextCreation, Touch_1, TrashCan, View, WarningAlt, CloudServices
} from '@carbon/icons-react';
import { ActionLink, Widget } from './types';
import { ActionArg, ActionSpec, actionLabel, actionsOf, EventSpec, eventsOf, isPickable, newLink, PLATFORM, suggestAction, VALUE_TYPES } from './component-api';
import { encodeParts, partValues } from './platform-actions';
import { isAlertSource } from './sources';
import { treeOrder } from './nesting';
import { Glyph } from './Glyph';
import { typeLabel } from './meta';
import PickInput from './PickInput';

type Icon = typeof Add;

interface Props {
  widgets: Widget[];
  /** Open with this widget's first action (or the widget as a trigger) selected. */
  focus?: string | null;
  onWidgets: (next: Widget[], key: string) => void;
  onClose: () => void;
}

interface Rule { rid: string; from: Widget; i: number; link: ActionLink; target?: Widget }
interface Edge { id: string; d: string; kind: 'in' | 'out'; rid: string; hot: boolean }
interface Suggestion { key: string; from: Widget; link: ActionLink; title: string; why: string }

const GROUP_ORDER: ActionSpec['group'][] = ['Concert Operate', 'Component', 'Visibility', 'Value', 'Data', 'Content', 'Settings'];
const GROUP_ICON: Record<ActionSpec['group'], Icon> = { 'Concert Operate': CloudServices, Component: Application, Visibility: View, Value: Hashtag, Data: DataBase, Content: TextCreation, Settings: Settings };
const EVENT_ICON: Record<string, Icon> = {
  change: Edit, select: Touch_1, tab: Application, toggle: ChevronDown, open: Maximize, close: Close, submit: Checkmark, page: Hashtag,
  click: Touch_1, dblclick: Touch_1, hover: Cursor_1, leave: Cursor_1, input: Keyboard, enter: Keyboard, focus: Keyboard, blur: Keyboard
};
/** Events every widget raises; anything else is specific to the component and shown first. */
const GENERIC = new Set(['click', 'dblclick', 'hover', 'leave', 'input', 'enter', 'focus', 'blur']);

const cname = (w: Widget) => (w.type.startsWith('carbon:') ? w.type.slice(7) : '');
const ridOf = (from: string, i: number) => `${from}#${i}`;
const eventLabel = (w: Widget, id: string) => (eventsOf(w).find(e => e.id === id) || { label: id }).label;

/** A short, readable form of an action's argument for the card ("= {value}", "tab 2"). */
function argText(link: ActionLink): string {
  if (link.arg === undefined || link.arg === '') return '';
  if (link.do.startsWith('api:')) {
    try {
      const o = JSON.parse(link.arg);
      const t = Object.keys(o).map(k => (k === 'priority' ? `P${o[k]}` : String(o[k]))).filter(Boolean).join(' · ');
      return t.length > 28 ? `${t.slice(0, 27)}…` : t;
    } catch (e) { return ''; }
  }
  const a = link.arg.length > 28 ? `${link.arg.slice(0, 27)}…` : link.arg;
  return a;
}

/** Proposed flows: things people usually wire, built from what is on the dashboard and not wired yet. */
function suggest(widgets: Widget[]): Suggestion[] {
  const out: Suggestion[] = [];
  const has = (from: string, to: string) => widgets.some(w => w.id === from && (w.config.on || []).some(l => l.to === to));
  const buttons = widgets.filter(w => /Button$/.test(cname(w)) || cname(w) === 'ClickableTile');
  const push = (from: Widget, to: Widget, event: string, act: string, title: string, why: string) => {
    if (from.id === to.id || has(from.id, to.id) || out.some(s => s.key === `${from.id}>${to.id}`)) return;
    const spec = actionsOf(to).find(a => a.id === act);
    out.push({ key: `${from.id}>${to.id}`, from, link: { event, to: to.id, do: act, ...(spec && spec.arg && spec.arg.def ? { arg: spec.arg.def } : {}) }, title, why });
  };
  for (const t of widgets) {
    const n = cname(t);
    if (n === 'Modal') buttons.forEach(b => push(b, t, 'click', 'cmd:open', `“${b.title}” opens “${t.title}”`, 'A button and a dialog'));
    if (t.config.hidden) {
      const src = buttons[0] || widgets.find(w => VALUE_TYPES.has(cname(w)) && /Toggle|Checkbox/.test(cname(w)));
      if (src) push(src, t, /Toggle|Checkbox/.test(cname(src)) ? 'change' : 'click', 'toggleVisible', `“${src.title}” shows or hides “${t.title}”`, 'It is hidden at start');
    }
    if (n === 'Tabs') {
      const sw = widgets.find(w => /ContentSwitcher|Dropdown|Select|RadioButtonGroup/.test(cname(w)));
      if (sw) push(sw, t, 'change', 'cmd:select', `“${sw.title}” chooses the tab in “${t.title}”`, 'A chooser and tabs');
    }
    if (isAlertSource(t.config.query) && (t.type === 'table' || /DataTable/.test(t.type)) && buttons.length) {
      push(buttons[0], t, 'click', 'api:incidentFromRows', `“${buttons[0].title}” creates an incident from the alerts in “${t.title}”`, 'Concert Operate');
    }
    if (t.type === 'text') {
      const pick = widgets.find(w => isPickable(w));
      if (pick) push(pick, t, 'select', 'set:text', `“${t.title}” shows what is picked in “${pick.title}”`, 'A chart people click');
    }
  }
  const search = widgets.find(w => cname(w) === 'Search');
  if (search) widgets.filter(w => w.type === 'table' || (w.type.startsWith('carbon:') && /DataTable/.test(w.type))).slice(0, 1)
    .forEach(t => push(search, t, 'enter', 'title', `Enter in “${search.title}” retitles “${t.title}”`, 'A search box and a table'));
  return out.slice(0, 6);
}

export default function ActionStudio({ widgets, focus, onWidgets, onClose }: Props) {
  const ordered = useMemo(() => treeOrder(widgets), [widgets]);
  const byId = useMemo(() => new Map([...widgets, PLATFORM].map(w => [w.id, w])), [widgets]);
  const [staged, setStaged] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(() => {
    if (!focus) return null;
    const w = widgets.find(x => x.id === focus);
    return w && (w.config.on || []).length ? ridOf(w.id, 0) : null;
  });
  const [hover, setHover] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [drag, setDrag] = useState<{ from: string; event: string; x: number; y: number; over: string | null } | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [dragPath, setDragPath] = useState('');
  const boardRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // the focused widget becomes a trigger even when it has no action yet
  useEffect(() => {
    if (focus && byId.has(focus) && !(byId.get(focus)!.config.on || []).length) setStaged(s => (s.includes(focus) ? s : [...s, focus]));
  }, []);
  useEffect(() => { if (rootRef.current) rootRef.current.focus(); }, []);

  const rules: Rule[] = useMemo(() => ordered.flatMap(w => (w.config.on || []).map((link, i) => ({ rid: ridOf(w.id, i), from: w, i, link, target: byId.get(link.to) }))), [ordered, byId]);
  const sources = ordered.filter(w => (w.config.on || []).length > 0 || staged.includes(w.id));
  // targets ordered by where their actions sit, so connectors cross as little as possible
  const targets = useMemo(() => {
    const pos = new Map<string, number[]>();
    rules.forEach((r, k) => { if (r.target) pos.set(r.target.id, [...(pos.get(r.target.id) || []), k]); });
    return Array.from(pos.entries()).map(([id, ks]) => ({ w: byId.get(id)!, at: ks.reduce((a, b) => a + b, 0) / ks.length, n: ks.length })).sort((a, b) => a.at - b.at);
  }, [rules, byId]);
  const spare = drag ? [PLATFORM, ...ordered].filter(w => w.id !== drag.from && !targets.some(t => t.w.id === w.id)) : [];
  const selected = rules.find(r => r.rid === sel) || null;
  const suggestions = useMemo(() => suggest(widgets), [widgets]);

  /* ── writes ── */
  const putRules = useCallback((fromId: string, on: ActionLink[], key: string) => {
    onWidgets(widgets.map(w => {
      if (w.id !== fromId) return w;
      const cfg = { ...w.config };
      if (on.length) cfg.on = on; else delete cfg.on;
      return { ...w, config: cfg };
    }), key);
  }, [widgets, onWidgets]);
  const rulesOf = (id: string) => (byId.get(id) ? byId.get(id)!.config.on || [] : []);
  const addRule = (fromId: string, link: ActionLink) => {
    const list = rulesOf(fromId);
    putRules(fromId, [...list, link], `${fromId}:on`);
    setStaged(s => s.filter(x => x !== fromId));
    setSel(ridOf(fromId, list.length));
  };
  const updateRule = (r: Rule, next: ActionLink, field = 'rule') => putRules(r.from.id, rulesOf(r.from.id).map((x, j) => (j === r.i ? next : x)), `${r.rid}:${field}`);
  const removeRule = (r: Rule) => {
    const rest = rulesOf(r.from.id).filter((_, j) => j !== r.i);
    putRules(r.from.id, rest, `${r.from.id}:on`);
    if (!rest.length) setStaged(s => (s.includes(r.from.id) ? s : [...s, r.from.id]));
    setSel(null);
  };
  const duplicateRule = (r: Rule) => addRule(r.from.id, { ...r.link });
  const moveSource = (r: Rule, toId: string) => {
    if (toId === r.from.id) return;
    const src = byId.get(toId);
    if (!src) return;
    const events = eventsOf(src);
    const link: ActionLink = { ...r.link, event: events.some(e => e.id === r.link.event) ? r.link.event : events[0].id };
    delete link.when;
    const rest = rulesOf(r.from.id).filter((_, j) => j !== r.i);
    const moved = [...rulesOf(toId), link];
    onWidgets(widgets.map(w => {
      if (w.id === r.from.id) { const cfg = { ...w.config }; if (rest.length) cfg.on = rest; else delete cfg.on; return { ...w, config: cfg }; }
      if (w.id === toId) return { ...w, config: { ...w.config, on: moved } };
      return w;
    }), `${r.rid}:from`);
    setSel(ridOf(toId, moved.length - 1));
  };

  /** Every action of `fromId` moves to the widget `toId` (events it cannot raise become its first event). */
  const moveAll = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const src = byId.get(toId);
    if (!src) return;
    const evs = eventsOf(src);
    const moved = rulesOf(fromId).map(l => {
      const n: ActionLink = { ...l, event: evs.some(e => e.id === l.event) ? l.event : evs[0].id };
      if (n.event !== l.event) delete n.when;
      return n;
    }).filter(l => l.to !== toId);
    onWidgets(widgets.map(w => {
      if (w.id === fromId) { const cfg = { ...w.config }; delete cfg.on; return { ...w, config: cfg }; }
      if (w.id === toId) return { ...w, config: { ...w.config, on: [...(w.config.on || []), ...moved] } };
      return w;
    }), `${fromId}:from`);
    setStaged(s => [...s.filter(x => x !== fromId), ...(moved.length ? [] : [toId])]);
    setSel(null);
  };
  /** The actions of `fromId` that start on `was` start on `next` instead. */
  const changeEvent = (fromId: string, was: string, next: string) => {
    if (was === next) return;
    const list = rulesOf(fromId);
    if (!list.length) { const w = byId.get(fromId); if (w) addRule(fromId, { ...newLink(w, ordered.find(o => o.id !== fromId) || PLATFORM), event: next }); return; }
    putRules(fromId, list.map(l => { if (l.event !== was) return l; const n: ActionLink = { ...l, event: next }; delete n.when; return n; }), `${fromId}:event`);
  };
  /** Every action that changes `was` changes `next` instead (keeping what it does when `next` understands it). */
  const retargetAll = (was: string, next: string) => {
    if (was === next) return;
    onWidgets(widgets.map(w => {
      if (!(w.config.on || []).some(l => l.to === was)) return w;
      const on = (w.config.on || []).map(l => (l.to === was && w.id !== next ? withTarget(l, next) : l)).filter(l => l.to !== w.id);
      const cfg = { ...w.config };
      if (on.length) cfg.on = on; else delete cfg.on;
      return { ...w, config: cfg };
    }), `${was}:to`);
  };
  const withTarget = (l: ActionLink, id: string): ActionLink => {
    const t = byId.get(id);
    if (!t) return l;
    const keep = actionsOf(t).some(a => a.id === l.do);
    return keep ? { ...l, to: id } : withAction({ ...l, to: id }, t, suggestAction(t));
  };
  const withAction = (l: ActionLink, t: Widget, d: string): ActionLink => {
    const spec = actionsOf(t).find(a => a.id === d);
    const n: ActionLink = { ...l, do: d === 'prop' ? 'set:' : d === 'addprop' ? 'add:' : d };
    if (spec && spec.arg && spec.arg.def !== undefined) n.arg = spec.arg.def; else delete n.arg;
    return n;
  };

  /* ── connectors: measured from the cards after every render ── */
  const measure = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const b = board.getBoundingClientRect();
    const pt = (sel: string, side: 'l' | 'r') => {
      const el = board.querySelector(`[data-port="${CSS.escape(sel)}"]`) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: (side === 'r' ? r.right : r.left) - b.left + board.scrollLeft - (side === 'r' ? r.width / 2 : -r.width / 2), y: r.top + r.height / 2 - b.top + board.scrollTop };
    };
    const curve = (a: { x: number; y: number }, z: { x: number; y: number }) => {
      const dx = Math.max(40, (z.x - a.x) * 0.5);
      return `M${a.x},${a.y} C${a.x + dx},${a.y} ${z.x - dx},${z.y} ${z.x},${z.y}`;
    };
    const out: Edge[] = [];
    for (const r of rules) {
      const hot = r.rid === sel || r.rid === hover || r.from.id === hover || (!!r.target && r.target.id === hover);
      const a = pt(`ev:${r.from.id}:${r.link.event}`, 'r');
      const m = pt(`in:${r.rid}`, 'l');
      if (a && m) out.push({ id: `i-${r.rid}`, d: curve(a, m), kind: 'in', rid: r.rid, hot });
      const n = pt(`out:${r.rid}`, 'r');
      const z = r.target ? pt(`to:${r.target.id}`, 'l') : null;
      if (n && z) out.push({ id: `o-${r.rid}`, d: curve(n, z), kind: 'out', rid: r.rid, hot });
    }
    setEdges(prev => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
  }, [rules, sel, hover]);
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(board);
    Array.from(board.querySelectorAll('.db-af-lane')).forEach(l => ro.observe(l));
    return () => ro.disconnect();
  }, [measure]);

  /* ── drag a new connection from a trigger port ── */
  const startDrag = (e: React.PointerEvent, from: string, event: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ from, event, x: e.clientX, y: e.clientY, over: null });
  };
  useEffect(() => {
    if (!drag) return undefined;
    const board = boardRef.current;
    const overAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const card = el ? el.closest('[data-drop]') as HTMLElement | null : null;
      return card ? card.getAttribute('data-drop') : null;
    };
    const move = (e: PointerEvent) => {
      const over = overAt(e.clientX, e.clientY);
      setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY, over: over !== d.from ? over : null } : d));
      if (board) {
        const b = board.getBoundingClientRect();
        const el = board.querySelector(`[data-port="${CSS.escape(`ev:${drag.from}:${drag.event}`)}"]`) as HTMLElement | null;
        if (el) {
          const r = el.getBoundingClientRect();
          const a = { x: r.left + r.width / 2 - b.left + board.scrollLeft, y: r.top + r.height / 2 - b.top + board.scrollTop };
          const z = { x: e.clientX - b.left + board.scrollLeft, y: e.clientY - b.top + board.scrollTop };
          const dx = Math.max(40, (z.x - a.x) * 0.5);
          setDragPath(`M${a.x},${a.y} C${a.x + dx},${a.y} ${z.x - dx},${z.y} ${z.x},${z.y}`);
        }
      }
    };
    const up = (e: PointerEvent) => {
      const over = overAt(e.clientX, e.clientY);
      const src = byId.get(drag.from);
      const to = over ? byId.get(over) : undefined;
      if (src && to && to.id !== src.id) {
        const act = suggestAction(to);
        const spec = actionsOf(to).find(a => a.id === act);
        addRule(src.id, { event: drag.event, to: to.id, do: act, ...(spec && spec.arg && spec.arg.def ? { arg: spec.arg.def } : {}) });
      }
      setDrag(null);
      setDragPath('');
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrag(null); setDragPath(''); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', key); };
  }, [drag && drag.from, drag && drag.event]);

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (picker) setPicker(false); else if (sel) setSel(null); else onClose();
      return;
    }
    if (typing) { e.stopPropagation(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); e.stopPropagation(); removeRule(selected); return; }
    // let undo / redo through to the Designer; keep its single-key shortcuts away from the canvas behind
    if (!(e.ctrlKey || e.metaKey)) e.stopPropagation();
  };

  const total = rules.length;
  const chain = (id: string) => hover === id || (!!selected && (selected.from.id === id || (!!selected.target && selected.target.id === id)));

  return (
    <div className="db-af" role="dialog" aria-modal="true" aria-label="Action flows" ref={rootRef} tabIndex={-1} onKeyDown={onKey}>
      <header className="db-af-head">
        <span className="db-af-logo"><Flow size={20} /></span>
        <div className="db-af-title">
          <h2>Action flows</h2>
          <span>{total === 0 ? 'Nothing wired yet' : `${total} action${total === 1 ? '' : 's'} on ${sources.filter(s => rulesOf(s.id).length).length} trigger${sources.length === 1 ? '' : 's'}`} · they run while the dashboard is used, never while you design</span>
        </div>
        <button type="button" className="db-af-btn db-af-btn--primary" onClick={() => setPicker(p => !p)}><Add size={16} />Add trigger</button>
        <button type="button" className="db-af-close" aria-label="Close action flows (Esc)" title="Close (Esc)" onClick={onClose}><Close size={20} /></button>
      </header>

      <div className="db-af-body">
        <div className="db-af-scroll" onPointerDown={e => { const t = e.target as HTMLElement; if (t === e.currentTarget || t.classList.contains('db-af-board') || t.classList.contains('db-af-lane')) setSel(null); }}>
          <div className={`db-af-board${drag ? ' is-dragging' : ''}`} ref={boardRef}>
            <svg className="db-af-wires" aria-hidden="true">
              <defs>
                <linearGradient id="db-af-grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#0f62fe" /><stop offset="1" stopColor="#8a3ffc" /></linearGradient>
                <linearGradient id="db-af-grad2" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#8a3ffc" /><stop offset="1" stopColor="#007d79" /></linearGradient>
              </defs>
              {edges.map(e => (
                <g key={e.id} className={`db-af-edge db-af-edge--${e.kind}${e.hot ? ' is-hot' : ''}`}>
                  <path className="db-af-edge-base" d={e.d} stroke={`url(#${e.kind === 'in' ? 'db-af-grad' : 'db-af-grad2'})`} />
                  <path className="db-af-edge-flow" d={e.d} />
                </g>
              ))}
              {dragPath && <path className="db-af-edge-drag" d={dragPath} />}
            </svg>

            <section className="db-af-lane db-af-lane--when" aria-label="Triggers">
              <h3 className="db-af-lane-head"><span className="db-af-step">1</span>When</h3>
              {sources.map(w => {
                const list = rulesOf(w.id);
                const used = Array.from(new Set(list.map(l => l.event)));
                const firstEvent = eventsOf(w)[0];
                const ports = used.length ? used : [firstEvent.id];
                return (
                  <div key={w.id} className={`db-af-card db-af-card--src${chain(w.id) ? ' is-chain' : ''}`} onPointerEnter={() => setHover(w.id)} onPointerLeave={() => setHover(null)}>
                    <div className="db-af-card-head">
                      <Glyph type={w.type} size={24} />
                      <div className="db-af-card-name">
                        <TileMenu
                          label={<strong>{w.title || typeLabel(w.type)}</strong>}
                          title="Change the trigger widget"
                          value={w.id}
                          items={ordered.map(o => ({ id: o.id, label: o.title || typeLabel(o.type), sub: typeLabel(o.type), type: o.type }))}
                          onPick={id => moveAll(w.id, id)}
                        />
                        <span>{typeLabel(w.type)}</span>
                      </div>
                      {!list.length && <button type="button" className="db-af-x" title="Remove this trigger" aria-label={`Remove trigger ${w.title}`} onClick={() => setStaged(s => s.filter(x => x !== w.id))}><Close size={16} /></button>}
                    </div>
                    <ul className="db-af-events">
                      {ports.map(ev => {
                        const Ic = EVENT_ICON[ev] || Touch_1;
                        return (
                          <li key={ev} className="db-af-event">
                            <Ic size={16} />
                            <TileMenu
                              label={<span>{eventLabel(w, ev)}</span>}
                              title="Change the event"
                              value={ev}
                              items={eventsOf(w).map(e => ({ id: e.id, label: e.label, group: GENERIC.has(e.id) ? 'Every widget' : 'This widget' }))}
                              onPick={id => changeEvent(w.id, ev, id)}
                            />
                            <button
                              type="button"
                              className="db-af-port db-af-port--out"
                              data-port={`ev:${w.id}:${ev}`}
                              title="Drag onto a widget to add an action"
                              aria-label={`Add an action when ${w.title}: ${eventLabel(w, ev)}`}
                              onPointerDown={e => startDrag(e, w.id, ev)}
                              onClick={() => { const other = ordered.find(x => x.id !== w.id); if (other) addRule(w.id, { ...newLink(w, other), event: ev }); }}
                            />
                          </li>
                        );
                      })}
                    </ul>
                    {!list.length && <p className="db-af-hint">Drag from <span className="db-af-dot" /> onto a widget to add the first action.</p>}
                  </div>
                );
              })}
              {picker && <TriggerPicker widgets={ordered} taken={sources.map(s => s.id)} onPick={id => { setStaged(s => [...s, id]); setPicker(false); }} onClose={() => setPicker(false)} />}
              {!picker && <button type="button" className="db-af-ghost" onClick={() => setPicker(true)}><Add size={16} />Add a trigger</button>}
            </section>

            <section className="db-af-lane db-af-lane--then" aria-label="Actions">
              <h3 className="db-af-lane-head"><span className="db-af-step db-af-step--then">2</span>Then</h3>
              {rules.map(r => {
                const spec = r.target ? actionsOf(r.target).find(a => a.id === r.link.do) : undefined;
                const group = spec ? spec.group : (r.link.do.startsWith('set:') || r.link.do.startsWith('add:') ? 'Settings' : 'Visibility');
                const Ic = GROUP_ICON[group];
                const a = argText(r.link);
                return (
                  <div
                    key={r.rid}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setSel(r.rid); } }}
                    className={`db-af-card db-af-card--act${sel === r.rid ? ' is-sel' : ''}${hover === r.rid ? ' is-chain' : ''}${r.target ? '' : ' is-broken'}`}
                    data-group={group}
                    onClick={() => setSel(r.rid)}
                    onPointerEnter={() => setHover(r.rid)}
                    onPointerLeave={() => setHover(null)}
                    aria-pressed={sel === r.rid}
                  >
                    <span className="db-af-port db-af-port--in" data-port={`in:${r.rid}`} />
                    <span className="db-af-act-icon"><Ic size={16} /></span>
                    <span className="db-af-act-text">
                      {r.target ? (
                        <TileMenu
                          label={<strong>{actionLabel(r.target, r.link.do)}</strong>}
                          title="Change what happens"
                          value={r.link.do}
                          search
                          items={actionsOf(r.target).map(x => ({ id: x.id, label: x.label, group: x.group }))}
                          groupOrder={GROUP_ORDER}
                          onPick={id => { setSel(r.rid); updateRule(r, withAction(r.link, r.target!, id), 'do'); }}
                        />
                      ) : <strong>Target is missing</strong>}
                      <span>
                        <TileMenu
                          label={<em className="db-af-chip db-af-chip--to">on {r.target ? r.target.title : 'a missing widget'}</em>}
                          title="Change the widget it acts on"
                          value={r.link.to}
                          items={[PLATFORM, ...ordered.filter(o => o.id !== r.from.id)].map(o => ({ id: o.id, label: o.title || typeLabel(o.type), sub: typeLabel(o.type), type: o.type }))}
                          onPick={id => { setSel(r.rid); updateRule(r, withTarget(r.link, id), 'to'); }}
                        />
                        {r.link.when ? <em className="db-af-chip db-af-chip--if">if = {r.link.when}</em> : null}
                        {a ? <em className="db-af-chip">{a.includes('{value}') ? <>{a.replace('{value}', '')}<b>value</b></> : a}</em> : null}
                        {!r.link.when && !a && <>{eventLabel(r.from, r.link.event).toLowerCase()}</>}
                      </span>
                    </span>
                    {!r.target && <WarningAlt size={16} className="db-af-warn" />}
                    <span className="db-af-port db-af-port--outact" data-port={`out:${r.rid}`} />
                  </div>
                );
              })}
              {rules.length === 0 && (
                <div className="db-af-empty">
                  <Flow size={32} />
                  <p><strong>Make widgets react to each other.</strong> Add a trigger, then drag from its <span className="db-af-dot" /> onto the widget that should change.</p>
                </div>
              )}
            </section>

            <section className="db-af-lane db-af-lane--on" aria-label="Targets">
              <h3 className="db-af-lane-head"><span className="db-af-step db-af-step--on">3</span>On</h3>
              {targets.map(({ w, n }) => (
                <div key={w.id} data-drop={w.id} className={`db-af-card db-af-card--tgt${chain(w.id) ? ' is-chain' : ''}${drag && drag.over === w.id ? ' is-over' : ''}`} onPointerEnter={() => setHover(w.id)} onPointerLeave={() => setHover(null)}>
                  <span className="db-af-port db-af-port--in" data-port={`to:${w.id}`} />
                  <Glyph type={w.type} size={24} />
                  <div className="db-af-card-name">
                    <TileMenu
                      label={<strong>{w.title || typeLabel(w.type)}</strong>}
                      title={`Point its ${n} action${n === 1 ? '' : 's'} at another widget`}
                      value={w.id}
                      items={[PLATFORM, ...ordered].map(o => ({ id: o.id, label: o.title || typeLabel(o.type), sub: typeLabel(o.type), type: o.type }))}
                      onPick={id => retargetAll(w.id, id)}
                    />
                    <span>{typeLabel(w.type)}{w.config.hidden ? ' · hidden at start' : ''}</span>
                  </div>
                  <span className="db-af-count" title={`${n} action${n === 1 ? '' : 's'} change it`}>{n}</span>
                </div>
              ))}
              {drag && (
                <div className="db-af-spare">
                  <p className="db-af-spare-head">Drop on any widget</p>
                  {spare.map(w => (
                    <div key={w.id} data-drop={w.id} className={`db-af-card db-af-card--tgt db-af-card--spare${drag.over === w.id ? ' is-over' : ''}`}>
                      <Glyph type={w.type} size={20} />
                      <div className="db-af-card-name"><strong>{w.title || typeLabel(w.type)}</strong><span>{typeLabel(w.type)}</span></div>
                    </div>
                  ))}
                </div>
              )}
              {!drag && targets.length === 0 && <p className="db-af-hint db-af-hint--lane">Widgets that actions change appear here.</p>}
            </section>
          </div>
        </div>

        <aside className="db-af-side" aria-label={selected ? 'Edit action' : 'Suggestions'}>
          {selected ? (
            <RulePanel
              key={selected.rid}
              rule={selected}
              widgets={ordered}
              onChange={(next, field) => updateRule(selected, next, field)}
              onSource={id => moveSource(selected, id)}
              onRemove={() => removeRule(selected)}
              onDuplicate={() => duplicateRule(selected)}
              onClose={() => setSel(null)}
            />
          ) : (
            <Suggestions list={suggestions} onUse={s => addRule(s.from.id, s.link)} />
          )}
        </aside>
      </div>
    </div>
  );
}

/* ── trigger picker: every widget, the ones with their own events first ── */
function TriggerPicker({ widgets, taken, onPick, onClose }: { widgets: Widget[]; taken: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = widgets
    .filter(w => !taken.includes(w.id))
    .filter(w => !query || `${w.title} ${typeLabel(w.type)}`.toLowerCase().includes(query))
    .map(w => ({ w, own: eventsOf(w).filter(e => !GENERIC.has(e.id)) }))
    .sort((a, b) => b.own.length - a.own.length);
  return (
    <div className="db-af-picker">
      <label className="db-af-search">
        <Search size={16} />
        <input autoFocus placeholder="Which widget starts it?" value={q} onChange={e => setQ(e.target.value)} />
        <button type="button" className="db-af-x" aria-label="Close" onClick={onClose}><Close size={16} /></button>
      </label>
      <div className="db-af-picker-list">
        {list.length === 0 && <p className="db-af-hint">No widget matches.</p>}
        {list.map(({ w, own }) => (
          <button key={w.id} type="button" className="db-af-pick" onClick={() => onPick(w.id)}>
            <Glyph type={w.type} size={20} />
            <span className="db-af-card-name"><strong>{w.title || typeLabel(w.type)}</strong><span>{own.length ? own.map(e => e.label).join(' · ') : 'Clicks, pointer, keyboard'}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── suggestions shown when nothing is selected ── */
function Suggestions({ list, onUse }: { list: Suggestion[]; onUse: (s: Suggestion) => void }) {
  return (
    <div className="db-af-panel">
      <div className="db-af-panel-head"><MagicWand size={20} /><h3>Suggested flows</h3></div>
      {list.length === 0 ? (
        <p className="db-af-hint">No suggestions for this dashboard yet. Buttons, dialogs, tabs, switches and widgets that are hidden at start get suggestions here.</p>
      ) : (
        <div className="db-af-sugs">
          {list.map(s => (
            <button key={s.key} type="button" className="db-af-sug" onClick={() => onUse(s)}>
              <span className="db-af-sug-why">{s.why}</span>
              <strong>{s.title}</strong>
              <span className="db-af-sug-add"><Add size={16} />Add</span>
            </button>
          ))}
        </div>
      )}
      <div className="db-af-howto">
        <h4>How it works</h4>
        <ol>
          <li><b>Add a trigger</b>: the widget people interact with.</li>
          <li><b>Drag</b> from its <span className="db-af-dot" /> onto the widget that should change.</li>
          <li><b>Pick what happens</b> in this panel. Only actions that widget understands are offered.</li>
        </ol>
        <p>Select an action and press Delete to remove it. Ctrl+Z undoes.</p>
      </div>
    </div>
  );
}

/* ── the selected rule, as a sentence of tiles ── */
interface PanelProps {
  rule: Rule;
  widgets: Widget[];
  onChange: (next: ActionLink, field: string) => void;
  onSource: (id: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

function RulePanel({ rule, widgets, onChange, onSource, onRemove, onDuplicate, onClose }: PanelProps) {
  const { from, link, target } = rule;
  const events = eventsOf(from);
  const ev: EventSpec = events.find(e => e.id === link.event) || events[0];
  const acts = target ? actionsOf(target) : [];
  const custom = /^(set|add):/.test(link.do) && !acts.some(a => a.id === link.do) ? (link.do.startsWith('set:') ? 'prop' : 'addprop') : '';
  const act = acts.find(a => a.id === (custom || link.do));
  const [q, setQ] = useState('');
  const [moreEvents, setMoreEvents] = useState(GENERIC.has(ev.id) && events.some(e => !GENERIC.has(e.id)) ? true : false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => (act ? { [act.group]: true } : {}));
  const argRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const query = q.trim().toLowerCase();
  const items = (() => { const it = (from.config.props || {}).items; const l = Array.isArray(it) ? it : typeof it === 'string' ? it.split('\n') : []; return l.map(x => String(x).split('::')[0].trim()).filter(Boolean); })();

  const own = events.filter(e => !GENERIC.has(e.id));
  const generic = events.filter(e => GENERIC.has(e.id));
  const shownEvents = own.length && !moreEvents && !GENERIC.has(ev.id) ? own : events;

  const pickAction = (d: string) => {
    const spec = acts.find(a => a.id === d);
    const next: ActionLink = { ...link, do: d === 'prop' ? 'set:' : d === 'addprop' ? 'add:' : d };
    if (spec && spec.arg && spec.arg.def !== undefined) next.arg = spec.arg.def; else delete next.arg;
    onChange(next, 'do');
  };
  const retarget = (id: string) => {
    const t = id === PLATFORM.id ? PLATFORM : widgets.find(x => x.id === id);
    if (!t) return;
    const keep = actionsOf(t).some(a => a.id === link.do);
    const d = keep ? link.do : suggestAction(t);
    const spec = actionsOf(t).find(a => a.id === d);
    const next: ActionLink = { ...link, to: id, do: d };
    if (!keep) { if (spec && spec.arg && spec.arg.def) next.arg = spec.arg.def; else delete next.arg; }
    onChange(next, 'to');
  };
  const insertValue = () => {
    const el = argRef.current;
    const v = link.arg || '';
    const at = el && typeof el.selectionStart === 'number' ? el.selectionStart : v.length;
    onChange({ ...link, arg: `${v.slice(0, at)}{value}${v.slice(at)}` }, 'arg');
    if (el) window.setTimeout(() => { el.focus(); el.setSelectionRange(at + 7, at + 7); }, 0);
  };

  const groups = GROUP_ORDER.map(g => ({ g, list: acts.filter(a => a.group === g && (!query || a.label.toLowerCase().includes(query))) })).filter(x => x.list.length);
  const argEl = act && act.arg && act.arg.parts ? (
    <PartsEditor arg={act.arg} value={link.arg} carries={ev.carries} onChange={x => onChange({ ...link, arg: x }, 'arg')} />
  ) : act && act.arg ? (() => {
    const a = act.arg;
    const v = link.arg === undefined ? '' : link.arg;
    const set = (x: string) => onChange({ ...link, arg: x }, 'arg');
    if (a.kind === 'bool') {
      const on = /^(true|yes|on|1)$/i.test(v);
      return (
        <span className="db-af-seg">
          <button type="button" className={on ? 'on' : ''} onClick={() => set('true')}>On</button>
          <button type="button" className={!on ? 'on' : ''} onClick={() => set('false')}>Off</button>
        </span>
      );
    }
    if (a.kind === 'enum' && a.options) {
      return (
        <span className="db-af-opts">
          {a.options.map(o => <button key={o} type="button" className={`db-af-opt${o === v ? ' on' : ''}`} onClick={() => set(o)}>{o}</button>)}
          {ev.carries && <button type="button" className={`db-af-opt${v === '{value}' ? ' on' : ''}`} onClick={() => set('{value}')}><b>value</b></button>}
        </span>
      );
    }
    if (a.kind === 'area' || a.kind === 'lines') return <textarea ref={argRef} className="db-af-input" rows={3} value={v} placeholder={a.label} onChange={e => set(e.target.value)} />;
    return <input ref={argRef} className="db-af-input" type={a.kind === 'number' ? 'number' : 'text'} value={v} placeholder={a.label} onChange={e => set(e.target.value)} />;
  })() : null;

  return (
    <div className="db-af-panel">
      <div className="db-af-panel-head">
        <h3>Edit action</h3>
        <button type="button" className="db-af-x" aria-label="Done" title="Done (Esc)" onClick={onClose}><Close size={16} /></button>
      </div>

      <p className="db-af-sentence">
        When <b>{from.title}</b> · {ev.label.toLowerCase()}{link.when ? <> (value “{link.when}”)</> : null}
        <ArrowRight size={16} />
        <b>{target ? actionLabel(target, link.do) : '…'}</b> on <b>{target ? target.title : 'a missing widget'}</b>
      </p>

      <div className="db-af-step-block">
        <h4><span className="db-af-step db-af-step--dot" />When</h4>
        <WidgetSelect id="db-af-src" label="Trigger" widgets={widgets} value={from.id} onChange={onSource} />
        <div className="db-af-tiles db-af-tiles--events">
          {shownEvents.map(e => {
            const Ic = EVENT_ICON[e.id] || Touch_1;
            return (
              <button key={e.id} type="button" className={`db-af-tile${e.id === ev.id ? ' on' : ''}`} onClick={() => onChange({ ...link, event: e.id, when: undefined }, 'event')}>
                <Ic size={16} /><span>{e.label}</span>
              </button>
            );
          })}
        </div>
        {own.length > 0 && generic.length > 0 && (
          <button type="button" className="db-af-more" onClick={() => setMoreEvents(m => !m)}>{moreEvents ? 'Fewer events' : `More events (${generic.length}): clicks, pointer, keyboard`}</button>
        )}
        {ev.carries && (
          <label className="db-af-field">
            <span>Only when the value is <i>(optional)</i></span>
            <input className="db-af-input" type="text" value={link.when || ''} list={items.length ? `db-af-items-${from.id}` : undefined} placeholder="any value" onChange={e => onChange({ ...link, when: e.target.value || undefined }, 'when')} />
            {items.length > 0 && <datalist id={`db-af-items-${from.id}`}>{items.map(i => <option key={i} value={i} />)}</datalist>}
          </label>
        )}
      </div>

      <div className="db-af-step-block">
        <h4><span className="db-af-step db-af-step--dot db-af-step--on" />On</h4>
        <WidgetSelect id="db-af-tgt" label="Target" widgets={[PLATFORM, ...widgets.filter(w => w.id !== from.id)]} value={link.to} onChange={retarget} missing={!target} />
        {target && target.id === PLATFORM.id && <p className="db-af-note">Calls Concert Operate itself. It runs only after the person using the dashboard confirms.</p>}
      </div>

      <div className="db-af-step-block">
        <h4><span className="db-af-step db-af-step--dot db-af-step--then" />Then</h4>
        {acts.length > 8 && (
          <label className="db-af-search db-af-search--sm">
            <Search size={16} />
            <input placeholder={`Search ${acts.length} actions`} value={q} onChange={e => setQ(e.target.value)} />
          </label>
        )}
        {groups.map(({ g, list }) => {
          const Ic = GROUP_ICON[g];
          const isOpen = Boolean(query) || open[g] !== undefined ? (query ? true : open[g]) : g !== 'Settings' && g !== 'Data';
          return (
            <div key={g} className="db-af-group" data-group={g}>
              <button type="button" className="db-af-group-head" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [g]: !isOpen }))}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <Ic size={16} /><span>{g}</span><span className="db-af-count">{list.length}</span>
              </button>
              {isOpen && (
                <div className="db-af-tiles">
                  {list.map(a => (
                    <button key={a.id} type="button" className={`db-af-tile${(custom || link.do) === a.id ? ' on' : ''}`} onClick={() => pickAction(a.id)}>
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {custom && (
          <label className="db-af-field">
            <span>Property name</span>
            <input className="db-af-input" type="text" value={link.do.slice(4)} placeholder="value, disabled, kind, limit …" onChange={e => onChange({ ...link, do: `${link.do.slice(0, 4)}${e.target.value.trim()}` }, 'do')} />
          </label>
        )}
        {argEl && (
          <div className="db-af-field">
            <span>{act && act.arg ? act.arg.label : 'Value'}</span>
            {argEl}
            {act && act.group === 'Concert Operate' && <p className="db-af-note">Changes data in Concert Operate. When the dashboard is used, it asks the person to confirm first.</p>}
            {ev.carries && act && act.arg && !act.arg.parts && act.arg.kind !== 'bool' && act.arg.kind !== 'enum' && (
              <button type="button" className="db-af-token" onClick={insertValue} title={`Insert what the event carries: ${ev.carries}`}>+ <b>value</b><span>{ev.carries}</span></button>
            )}
          </div>
        )}
      </div>

      <div className="db-af-panel-foot">
        <button type="button" className="db-af-btn" onClick={onDuplicate}><Copy size={16} />Duplicate</button>
        <button type="button" className="db-af-btn db-af-btn--danger" onClick={onRemove}><TrashCan size={16} />Delete</button>
      </div>
    </div>
  );
}

function WidgetSelect({ id, label, widgets, value, onChange, missing }: { id: string; label: string; widgets: Widget[]; value: string; onChange: (id: string) => void; missing?: boolean }) {
  const cur = widgets.find(w => w.id === value);
  return (
    <label className="db-af-wsel" htmlFor={id}>
      {cur ? <Glyph type={cur.type} size={20} /> : <WarningAlt size={20} />}
      <select id={id} aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
        {(missing || !cur) && <option value={value}>(missing widget)</option>}
        {widgets.map(w => <option key={w.id} value={w.id}>{w.title || typeLabel(w.type)} · {typeLabel(w.type)}</option>)}
      </select>
      <ChevronDown size={16} />
    </label>
  );
}

/** The fields of an action that has several (create an incident: alert ids, priority, description). */
function PartsEditor({ arg, value, carries, onChange }: { arg: ActionArg; value?: string; carries?: string; onChange: (json: string) => void }) {
  const parts = arg.parts || [];
  const v = partValues(parts, value);
  const set = (k: string, x: string) => onChange(encodeParts({ ...v, [k]: x }));
  return (
    <div className="db-af-parts">
      {parts.map(p => (
        <label key={p.key} className="db-af-field">
          <span>{p.label}</span>
          {p.kind === 'enum' && p.options ? (
            <span className="db-af-opts">
              {p.options.map(o => <button key={o} type="button" className={`db-af-opt${o === v[p.key] ? ' on' : ''}`} onClick={() => set(p.key, o)}>{p.key === 'priority' ? `P${o}` : o}</button>)}
            </span>
          ) : (
            <span className="db-af-inrow">
              {p.pick
                ? <PickInput id={`af-part-${p.key}`} kind={p.pick} label={p.label} value={v[p.key]} placeholder={p.label} onChange={x => set(p.key, x)} />
                : <input className="db-af-input" type="text" value={v[p.key]} placeholder={p.label} onChange={e => set(p.key, e.target.value)} />}
              {carries && !v[p.key].includes('{value}') && <button type="button" className="db-af-token db-af-token--sm" title={`Insert what the event carries: ${carries}`} onClick={() => set(p.key, `${v[p.key]}{value}`)}>+ <b>value</b></button>}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}

interface MenuItem { id: string; label: string; sub?: string; group?: string; type?: string }

/** A dropdown on a tile: the tile's own text is the trigger. Clicks inside never reach the card behind it. */
function TileMenu({ label, title, value, items, onPick, search, groupOrder }: { label: React.ReactNode; title: string; value: string; items: MenuItem[]; onPick: (id: string) => void; search?: boolean; groupOrder?: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open]);
  useEffect(() => { if (!open) setQ(''); }, [open]);
  const query = q.trim().toLowerCase();
  const shown = items.filter(i => !query || `${i.label} ${i.sub || ''}`.toLowerCase().includes(query));
  const groups = Array.from(new Set(shown.map(i => i.group || '')));
  if (groupOrder) groups.sort((a, b) => groupOrder.indexOf(a) - groupOrder.indexOf(b));
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const choose = (id: string) => { setOpen(false); if (id !== value) onPick(id); };
  return (
    <span className={`db-tm${open ? ' is-open' : ''}`} ref={ref} onClick={stop} onPointerDown={stop} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className="db-tm-btn" title={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {label}<ChevronDown size={12} className="db-tm-caret" />
      </button>
      {open && (
        <span className="db-tm-pop" role="listbox" aria-label={title}>
          <span className="db-tm-title">{title}</span>
          {(search || items.length > 10) && <input className="db-tm-search" autoFocus placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />}
          <span className="db-tm-list">
            {shown.length === 0 && <span className="db-tm-none">No match</span>}
            {groups.map(g => (
              <React.Fragment key={g || '-'}>
                {g && <span className="db-tm-group">{g}</span>}
                {shown.filter(i => (i.group || '') === g).map(i => (
                  <button key={i.id} type="button" role="option" aria-selected={i.id === value} className={`db-tm-item${i.id === value ? ' on' : ''}`} onClick={() => choose(i.id)}>
                    {i.type && <Glyph type={i.type} size={18} />}
                    <span className="db-tm-text"><span>{i.label}</span>{i.sub && <small>{i.sub}</small>}</span>
                    {i.id === value && <Checkmark size={16} className="db-tm-check" />}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}
