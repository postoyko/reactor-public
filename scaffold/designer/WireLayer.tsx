/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wiring you can see. Curves are drawn over the dashboard from a widget that sends selections to the widgets that
 * follow them. In Wire mode every widget that can send has a port: drag from it to a widget to connect them, click a
 * line to cut it. Outside Wire mode the lines of the widget you hover or select are shown, and a line pulses while
 * its sender has something selected, so a click in a chart visibly travels to the table it filters.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionLink, COND_OPS, CondOp, Filter, Widget } from './types';
import { actionLabel, eventsOf, newLink } from './component-api';
import { RuleFields } from './ActionEditor';
import { slotOwner } from './nesting';
import { canSend, targetsFor } from './Wiring';

interface Edge { key: string; from: string; to: string; auto: boolean; value: boolean }
interface Pt { x: number; y: number; faded: boolean }
type Geo = Record<string, Box | undefined>;

interface Props {
  stageRef: React.RefObject<HTMLDivElement>;
  widgets: Widget[];
  filters: Filter[];
  values: Record<string, string>;
  wireMode: boolean;
  selectedId: string | null;
  onSendTo: (id: string, sendTo: string[] | undefined) => void;
  onBindOp: (id: string, op: CondOp) => void;
  onNotice: (text: string) => void;
  /** Designer only: which kind of wire Wire mode draws and edits. */
  wireKind?: 'data' | 'action';
  onWireKind?: (k: 'data' | 'action') => void;
  onActions?: (id: string, on: ActionLink[] | undefined) => void;
  /** Draw the hover/selection/live lines outside Wire mode. Off while people are just using a dashboard. */
  passive?: boolean;
}

type Box = { l: number; t: number; w: number; h: number; faded: boolean };
type Side = 'r' | 'l' | 'b' | 't';
const VEC: Record<Side, [number, number]> = { r: [1, 0], l: [-1, 0], b: [0, 1], t: [0, -1] };
const at = (g: Box, s: Side): { x: number; y: number } => (s === 'r' ? { x: g.l + g.w, y: g.t + g.h / 2 } : s === 'l' ? { x: g.l, y: g.t + g.h / 2 } : s === 'b' ? { x: g.l + g.w / 2, y: g.t + g.h } : { x: g.l + g.w / 2, y: g.t });

/** Leaves the side that faces the target and arrives on the side that faces the sender. */
function route(a: Box, b: Box): { d: string; path: [number, number, number, number] } {
  let sa: Side, sb: Side;
  if (b.l >= a.l + a.w - 8) { sa = 'r'; sb = 'l'; }
  else if (b.l + b.w <= a.l + 8) { sa = 'l'; sb = 'r'; }
  else if (b.t >= a.t + a.h - 8) { sa = 'b'; sb = 't'; }
  else if (b.t + b.h <= a.t + 8) { sa = 't'; sb = 'b'; }
  else { sa = 'r'; sb = 'r'; }
  const p = at(a, sa), q = at(b, sb);
  const k = Math.min(Math.max(Math.hypot(q.x - p.x, q.y - p.y) / 2.5, 48), 150);
  const c1 = { x: p.x + VEC[sa][0] * k, y: p.y + VEC[sa][1] * k };
  const c2 = { x: q.x + VEC[sb][0] * k, y: q.y + VEC[sb][1] * k };
  return { d: `M ${p.x} ${p.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${q.x} ${q.y}`, path: [p.x, p.y, q.x, q.y] };
}
const tempCurve = (a: Pt, b: { x: number; y: number }) => {
  const k = Math.min(Math.max(Math.abs(b.x - a.x) / 2, 48), 150);
  return `M ${a.x} ${a.y} C ${a.x + k} ${a.y}, ${b.x - k} ${b.y}, ${b.x} ${b.y}`;
};

export default function WireLayer({ stageRef, widgets, filters, values, wireMode, selectedId, onSendTo, onBindOp, onNotice, passive = true, wireKind = 'data', onWireKind, onActions }: Props) {
  const [menu, setMenu] = useState<string | null>(null);
  const [geo, setGeo] = useState<Geo>({});
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number; over: string | null } | null>(null);
  const geoKey = useRef('');

  const byId = useMemo(() => new Map(widgets.map(w => [w.id, w])), [widgets]);
  const senders = useMemo(() => widgets.filter(canSend), [widgets]);
  const edges = useMemo(() => {
    const out: Edge[] = [];
    senders.forEach(s => {
      const list = s.config.sendTo
        ? s.config.sendTo.map(id => byId.get(id)).filter((t): t is Widget => !!t && t.id !== s.id && t.config.listens !== false)
        : s.config.bind ? [] : targetsFor(widgets, s);
      list.forEach(t => out.push({ key: `${s.id}>${t.id}`, from: s.id, to: t.id, auto: !s.config.sendTo, value: !!s.config.bind }));
    });
    return out;
  }, [senders, widgets, byId]);

  const actMode = wireMode && wireKind === 'action' && !!onActions;
  const aEdges = useMemo(() => widgets.flatMap(s => (s.config.on || []).map((l, i) => ({ key: `a:${s.id}:${i}`, from: s.id, to: l.to, i, l })).filter(e => byId.has(e.to))), [widgets, byId]);

  const live = useMemo(() => new Set([...filters.map(f => f.from), ...Object.keys(values).filter(k => values[k] !== '')]), [filters, values]);
  const focus = hover || selectedId;
  const shownA = actMode ? aEdges : !passive ? [] : aEdges.filter(e => (hover || selectedId) !== null && (e.from === (hover || selectedId) || e.to === (hover || selectedId)));
  const shown = actMode || (!wireMode && !passive) ? [] : edges.filter(e => wireMode || live.has(e.from) || (focus !== null && (e.from === focus || e.to === focus)));
  // Which widgets need measuring. Held as a string so that an unchanged answer does not restart the measuring below.
  const ids = new Set<string>();
  shown.forEach(e => { ids.add(e.from); ids.add(e.to); });
  shownA.forEach(e => { ids.add(e.from); ids.add(e.to); });
  if (actMode) widgets.forEach(w => ids.add(w.id));
  else if (wireMode) senders.forEach(s => ids.add(s.id));
  const needKey = Array.from(ids).sort().join('\u0001');
  const need = useMemo(() => (needKey ? needKey.split('\u0001') : []), [needKey]);

  // Hover tracking (the lines of the widget under the pointer).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const over = (e: PointerEvent) => { const w = (e.target as HTMLElement).closest('[data-wid]'); setHover(w ? w.getAttribute('data-wid') : null); };
    const leave = () => setHover(null);
    el.addEventListener('pointerover', over);
    el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointerover', over); el.removeEventListener('pointerleave', leave); };
  }, [stageRef]);

  // Where things are. Measured every frame while there is something to draw; state only changes when a box moved.
  useEffect(() => {
    if (need.length === 0 && !drag) { if (geoKey.current !== '') { geoKey.current = ''; setGeo({}); } return undefined; }
    let raf = 0;
    const measure = () => {
      const stage = stageRef.current;
      if (stage) {
        const sr = stage.getBoundingClientRect();
        const next: Geo = {};
        need.forEach(id => {
          // a widget inside a hidden tab has no box: the line goes to the container that is showing
          let cur: Widget | undefined = byId.get(id);
          let faded = false;
          while (cur) {
            const el = stage.querySelector(`[data-wid="${cur.id}"]`);
            const r = el ? el.getBoundingClientRect() : null;
            if (r && r.width > 0 && r.height > 0) { next[id] = { l: r.left - sr.left, t: r.top - sr.top, w: r.width, h: r.height, faded }; return; }
            faded = true;
            cur = cur.parent ? byId.get(slotOwner(cur.parent)) : undefined;
          }
        });
        const k = JSON.stringify(next);
        if (k !== geoKey.current) { geoKey.current = k; setGeo(next); }
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [need, byId, stageRef, drag]);

  const out = (id: string): Pt | null => { const g = geo[id]; return g ? { x: g.l + g.w, y: g.t + g.h / 2, faded: g.faded } : null; };

  const cut = (e: Edge) => {
    const s = byId.get(e.from);
    if (!s) return;
    const current = s.config.sendTo || (s.config.bind ? [] : targetsFor(widgets, s).map(t => t.id));
    onSendTo(s.id, current.filter(x => x !== e.to));
  };

  const startDrag = (ev: React.PointerEvent, s: Widget, kind: 'data' | 'action' = 'data') => {
    ev.preventDefault(); ev.stopPropagation();
    const stage = stageRef.current; if (!stage) return;
    stage.classList.add('is-wiring-drag');
    window.getSelection()?.removeAllRanges();
    const sr = stage.getBoundingClientRect();
    const valid = new Set(kind === 'action' ? widgets.filter(t => t.id !== s.id).map(t => t.id) : targetsFor(widgets, s).map(t => t.id));
    valid.forEach(id => { const el = stage.querySelector(`[data-wid="${id}"]`); if (el) el.classList.add('wire-ok'); });
    const pick = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      const w = el ? el.closest('[data-wid]') : null;
      const id = w ? w.getAttribute('data-wid') : null;
      return id && valid.has(id) ? id : null;
    };
    let over: string | null = null;
    const move = (e: PointerEvent) => {
      const o = pick(e.clientX, e.clientY);
      if (o !== over) {
        if (over) { const el = stage.querySelector(`[data-wid="${over}"]`); if (el) el.classList.remove('wire-drop'); }
        if (o) { const el = stage.querySelector(`[data-wid="${o}"]`); if (el) el.classList.add('wire-drop'); }
        over = o;
      }
      setDrag({ from: s.id, x: e.clientX - sr.left, y: e.clientY - sr.top, over: o });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      stage.querySelectorAll('.wire-ok, .wire-drop').forEach(el => el.classList.remove('wire-ok', 'wire-drop'));
      stage.classList.remove('is-wiring-drag');
      setDrag(null);
      if (!over) return;
      if (kind === 'action') {
        const t = byId.get(over);
        if (!t || !onActions) return;
        const cur = s.config.on || [];
        onActions(s.id, [...cur, newLink(s, t)]);
        setMenu(`a:${s.id}:${cur.length}`);
        return;
      }
      if (!s.config.sendTo && !s.config.bind) { onNotice(`“${s.title}” already reaches everything on the same data. Cut a line to limit where it goes.`); return; }
      const cur = s.config.sendTo || [];
      if (!cur.includes(over)) { onSendTo(s.id, [...cur, over]); setMenu(`${s.id}>${over}`); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    move(ev.nativeEvent);
  };

  const sel = selectedId ? byId.get(selectedId) : undefined;
  const dragFrom = drag ? out(drag.from) : null;

  return (
    <>
      <svg className={`db-wires${wireMode ? ' is-wiring' : ''}`} aria-hidden="true">
        <defs>
          <marker id="db-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" className="db-wire-arrow" /></marker>
        </defs>
        {shown.map(e => {
          const ga = geo[e.from], gb = geo[e.to];
          if (!ga || !gb) return null;
          const { d } = route(ga, gb);
          const isLive = live.has(e.from);
          const dim = ga.faded || gb.faded;
          return (
            <g key={e.key} className={`db-wire-edge${e.auto ? ' auto' : ''}${e.value ? ' value' : ''}${isLive ? ' live' : ''}${dim ? ' dim' : ''}`}>
              <path className="db-wire-line" d={d} markerEnd="url(#db-arrow)" />
              {isLive && <circle r="4" className="db-wire-dot"><animateMotion dur="1.6s" repeatCount="indefinite" path={d} /></circle>}
              {wireMode && (
                <path className="db-wire-hit" d={d} onClick={() => setMenu(m => (m === e.key ? null : e.key))}>
                  <title>{`${byId.get(e.from)?.title} → ${byId.get(e.to)?.title}. Click for the wire menu.`}</title>
                </path>
              )}
            </g>
          );
        })}
        {shownA.map(e => {
          const ga = geo[e.from], gb = geo[e.to];
          if (!ga || !gb) return null;
          const { d, path } = route(ga, gb);
          const tgt = byId.get(e.to);
          const ev = byId.get(e.from) ? eventsOf(byId.get(e.from) as Widget).find(x => x.id === e.l.event) : undefined;
          return (
            <g key={e.key} className={`db-wire-edge act${ga.faded || gb.faded ? ' dim' : ''}`}>
              <path className="db-wire-line" d={d} markerEnd="url(#db-arrow)" />
              {actMode && tgt && <text className="db-act-label" x={(path[0] + path[2]) / 2} y={(path[1] + path[3]) / 2 - 6} textAnchor="middle">{`${ev ? ev.label.toLowerCase() : e.l.event} → ${actionLabel(tgt, e.l.do).toLowerCase()}`}</text>}
              {actMode && (
                <path className="db-wire-hit" d={d} onClick={() => setMenu(m => (m === e.key ? null : e.key))}>
                  <title>{`${byId.get(e.from)?.title} → ${tgt ? tgt.title : ''}. Click to edit this action.`}</title>
                </path>
              )}
            </g>
          );
        })}
        {drag && dragFrom && <path className="db-wire-line db-wire-temp" d={tempCurve(dragFrom, { x: drag.x, y: drag.y })} />}
        {actMode && widgets.map(s => {
          const p = out(s.id);
          if (!p) return null;
          return (
            <g key={`a${s.id}`} className={`db-port act${sel && sel.id === s.id ? ' on' : ''}`} transform={`translate(${p.x} ${p.y})`} onPointerDown={ev => startDrag(ev, s, 'action')} onMouseDown={ev => ev.preventDefault()}>
              <circle r="11" className="db-port-halo" />
              <circle r="6" className="db-port-dot" />
              <title>{`Drag from here to a widget that “${s.title}” should change`}</title>
            </g>
          );
        })}
        {wireMode && !actMode && senders.map(s => {
          const p = out(s.id);
          if (!p) return null;
          return (
            <g key={s.id} className={`db-port${sel && sel.id === s.id ? ' on' : ''}`} transform={`translate(${p.x} ${p.y})`} onPointerDown={ev => startDrag(ev, s)} onMouseDown={ev => ev.preventDefault()}>
              <circle r="11" className="db-port-halo" />
              <circle r="6" className="db-port-dot" />
              <title>{`Drag from here to a widget to send “${s.title}” selections to it`}</title>
            </g>
          );
        })}
      </svg>
      {actMode && menu && menu.startsWith('a:') && (() => {
        const e = aEdges.find(x => x.key === menu);
        const ga = e && geo[e.from], gb = e && geo[e.to];
        const src = e ? byId.get(e.from) : undefined;
        if (!e || !ga || !gb || !src) return null;
        const { path } = route(ga, gb);
        const rules = src.config.on || [];
        return (
          <div className="db-wire-menu db-act-menu" role="dialog" aria-label="Action wire" style={{ left: (path[0] + path[2]) / 2, top: (path[1] + path[3]) / 2 }} onPointerDown={ev => ev.stopPropagation()}>
            <div className="db-wire-menu-h"><span className="db-wire-chip act" />{src.title} → {byId.get(e.to)?.title}</div>
            <RuleFields source={src} all={widgets} link={e.l} fixedTarget onChange={n => onActions && onActions(src.id, rules.map((x, j) => (j === e.i ? n : x)))} />
            <div className="db-wire-menu-b">
              <button type="button" className="db-link" onClick={() => { if (onActions) { const k = rules.filter((_, j) => j !== e.i); onActions(src.id, k.length ? k : undefined); } setMenu(null); }}>Cut this wire</button>
              <button type="button" className="db-link" onClick={() => setMenu(null)}>Done</button>
            </div>
          </div>
        );
      })()}
      {wireMode && menu && !menu.startsWith('a:') && (() => {
        const e = edges.find(x => x.key === menu);
        const ga = e && geo[e.from], gb = e && geo[e.to];
        const src = e ? byId.get(e.from) : undefined;
        if (!e || !ga || !gb || !src) return null;
        const { path } = route(ga, gb);
        const bind = src.config.bind;
        const OPS: Record<string, string> = { '=': 'is', '!=': 'is not', '<': 'is below', '<=': 'is at most', '>': 'is above', '>=': 'is at least', contains: 'contains' };
        return (
          <div className="db-wire-menu" role="dialog" aria-label="Wire" style={{ left: (path[0] + path[2]) / 2, top: (path[1] + path[3]) / 2 }} onPointerDown={ev => ev.stopPropagation()}>
            <div className="db-wire-menu-h"><span className={`db-wire-chip${bind ? ' value' : ''}`} />{src.title} → {byId.get(e.to)?.title}</div>
            <div className="db-wire-menu-k">Wire type</div>
            <div className="db-wire-types" role="radiogroup" aria-label="Wire type">
              <span className={`db-wire-type${bind ? '' : ' on'}`} role="radio" aria-checked={!bind} title="The rows you pick (a bar, a slice, a table row) filter the target">Filter: what is picked</span>
              <span className={`db-wire-type value${bind ? ' on' : ''}`} role="radio" aria-checked={!!bind} title="What is typed or chosen in the input filters the target. Set in the input's own settings: Use this value as a filter">Value: what is typed</span>
            </div>
            {bind && (
              <label className="db-wire-menu-f">Target rows where {bind.field || 'the field'}
                <select value={bind.op} onChange={ev => onBindOp(src.id, ev.target.value as CondOp)}>
                  {COND_OPS.map(o => <option key={o} value={o}>{OPS[o]} the value</option>)}
                </select>
              </label>
            )}
            {e.auto && <div className="db-wire-menu-n">Automatic: reaches every widget on the same data. Cutting it limits this widget to the rest.</div>}
            <div className="db-wire-menu-b">
              <button type="button" className="db-link" onClick={() => { cut(e); setMenu(null); }}>Cut this wire</button>
              <button type="button" className="db-link" onClick={() => setMenu(null)}>Done</button>
            </div>
          </div>
        );
      })()}
      {wireMode && (
        <div className="db-wire-hint" role="status">
          {onWireKind && (
            <span className="db-wire-kinds" role="radiogroup" aria-label="Kind of wire">
              <button type="button" role="radio" aria-checked={wireKind === 'data'} className={`db-wire-kind${wireKind === 'data' ? ' on' : ''}`} onClick={() => onWireKind('data')}>Data filters</button>
              <button type="button" role="radio" aria-checked={wireKind === 'action'} className={`db-wire-kind act${wireKind === 'action' ? ' on' : ''}`} onClick={() => onWireKind('action')}>Actions</button>
            </span>
          )}
          {actMode ? <><strong>Actions.</strong> Drag from a <i className="db-wire-i act" /> on any widget to the widget it should change (open a dialog, show a panel, choose a tab, set a value ...). Click a line to choose the event and the action, or to cut it. Wires run when the dashboard is used (Preview).</> : <><strong>Wire mode.</strong> Drag from a <i className="db-wire-i" /> to a widget to connect them. Click a line for its menu (type, comparison, cut). <span className="db-wire-chip" /> filter, <span className="db-wire-chip value" /> typed value, dashed = automatic: every widget on the same data.
          {sel && canSend(sel) && sel.config.sendTo && !sel.config.bind && (
            <button type="button" className="db-link" onClick={() => onSendTo(sel.id, undefined)}>Make “{sel.title}” automatic again</button>
          )}</>}
        </div>
      )}
    </>
  );
}
