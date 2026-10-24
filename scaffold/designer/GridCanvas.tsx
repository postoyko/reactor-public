/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The drag-and-resize surface. 12 columns, fixed row height. While editing, drag a widget by its title bar,
 * resize from the corner, or use the keyboard (arrows move, Shift+arrows resize, Delete removes).
 * The layout is only handed to the parent when a drag ends, so the rest of the page does not re-render per pixel.
 */

import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, TrashCan } from '@carbon/icons-react';
import { Glyph } from './Glyph';
import { moveItem, resizeItem, gridHeight, gapFor } from './grid';
import { GRID_COLS, Widget } from './types';
import { minSize } from './registry';
import { NestCtx, LinkCtx } from './nest';
import { canListen } from './Wiring';
import { DEFAULT_GROUP } from './rows';
import { Filter as FilterIcon } from '@carbon/icons-react';
import { cellAt, ghost, highlight, targetAt, Target } from './dnd';

const ROW_H = 48;
const NARROW = 640;

interface Props {
  widgets: Widget[];
  rowH?: number;
  editing: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLayout: (next: Widget[], label: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  renderBody: (w: Widget) => React.ReactNode;
  /** Inside a container's panel: never switches to the stacked phone layout. */
  nested?: boolean;
  /** Widgets that the selected widget sends its selections to (outlined). */
  wired?: Set<string>;
  /** This grid's panel id ('' for the dashboard itself) and how deep it is nested. Used to drop widgets between panels. */
  slot?: string;
  depth?: number;
}

type Gesture =
  | { kind: 'move'; id: string; px: number; py: number; x: number; y: number }
  | { kind: 'resize'; id: string; px: number; py: number; w: number; h: number };

export default function GridCanvas({ widgets, rowH, editing, selectedId, onSelect, onLayout, onRemove, onDuplicate, renderBody, nested, wired, slot = '', depth = 0 }: Props) {
  const dnd = useContext(NestCtx)?.dnd;
  const link = useContext(LinkCtx);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  // While a gesture is running the preview layout lives here; it is committed on pointer-up.
  const [preview, setPreview] = useState<Widget[] | null>(null);
  const previewRef = useRef<Widget[] | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const dragging = preview !== null;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el && el.clientWidth > 0) setWidth(el.clientWidth);
  }, []);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(Math.round(w));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const ROW = rowH && rowH >= 24 && rowH <= 96 ? rowH : ROW_H;
  const GAP = gapFor(ROW);
  const colW = Math.max((width - GAP * (GRID_COLS - 1)) / GRID_COLS, 20);
  const stepX = colW + GAP;
  const stepY = ROW + GAP;
  const items = preview || widgets;
  const narrow = !nested && width < NARROW && !editing;

  const rt = !editing && !!link && link.resizeOn && !narrow;
  const begin = (e: React.PointerEvent, g: Gesture) => {
    if ((!editing && !(rt && (g.kind === 'resize' || g.kind === 'move') && widgets.find(x => x.id === g.id)?.config.resize !== false)) || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (editing) onSelect(g.id);
    gestureRef.current = g;
    previewRef.current = widgets;
    setPreview(widgets);
    let away: Target | null = null;
    const src = { id: g.id };
    const onMove = (ev: PointerEvent) => {
      const cur = gestureRef.current;
      if (!cur) return;
      if (cur.kind === 'move' && dnd && editing) {
        const t = targetAt(ev.clientX, ev.clientY, src, dnd);
        away = t && t.slot !== slot ? t : null;
        highlight(away ? away.el : null);
        ghost(away ? (widgets.find(w => w.id === cur.id) || { title: '' }).title : null, ev.clientX, ev.clientY);
        if (away) return;
      }
      const dx = Math.round((ev.clientX - cur.px) / stepX);
      const dy = Math.round((ev.clientY - cur.py) / stepY);
      const next = cur.kind === 'move'
        ? moveItem(widgets, cur.id, cur.x + dx, cur.y + dy)
        : resizeItem(widgets, cur.id, cur.w + dx, cur.h + dy, minSize(widgets.find(w => w.id === cur.id)!.type).minW, minSize(widgets.find(w => w.id === cur.id)!.type).minH);
      previewRef.current = next;
      setPreview(next);
    };
    const onUp = (ev: PointerEvent) => {
      highlight(null);
      ghost(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const cur = gestureRef.current;
      const result = previewRef.current;
      gestureRef.current = null;
      previewRef.current = null;
      setPreview(null);
      if (cur && cur.kind === 'move' && away && dnd && ev.type === 'pointerup') {
        const w = widgets.find(x => x.id === cur.id);
        dnd.drop({ id: cur.id }, away.slot, cellAt(away.el, ev.clientX, ev.clientY, w ? w.w : 4));
        return;
      }
      if (cur && result && result !== widgets && result.some((r, i) => {
        const o = widgets[i];
        return r.x !== o.x || r.y !== o.y || r.w !== o.w || r.h !== o.h;
      })) {
        if (editing) onLayout(result, cur.kind === 'move' ? 'Move widget' : 'Resize widget');
        else if (link) link.setLayout(result);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const onKey = (e: React.KeyboardEvent, w: Widget) => {
    if (!editing || e.target !== e.currentTarget) return;
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onRemove(w.id);
    } else if (d[e.key]) {
      e.preventDefault();
      const [dx, dy] = d[e.key];
      const { minW, minH } = minSize(w.type);
      onLayout(e.shiftKey ? resizeItem(widgets, w.id, w.w + dx, w.h + dy, minW, minH) : moveItem(widgets, w.id, w.x + dx, w.y + dy), e.shiftKey ? 'Resize widget' : 'Move widget');
    } else if (e.key === 'Escape') {
      onSelect(null);
    }
  };

  const ordered = narrow ? items.slice().sort((a, b) => a.y - b.y || a.x - b.x) : items;
  const height = narrow ? undefined : nested ? Math.max(gridHeight(items) + (editing ? 1 : 0), editing ? 3 : 1) * stepY : (gridHeight(items) + (editing ? 3 : 0)) * stepY;

  return (
    <div
      ref={wrapRef}
      className={`db-canvas${nested ? ' nested' : ''}${rt ? ' rt-resize' : ''}${editing ? ' editing' : ''}${dragging ? ' dragging' : ''}${narrow ? ' narrow' : ''}`}
      style={{ height }}
      data-slot={slot}
      data-depth={depth}
      data-row={ROW}
      onPointerDown={e => { if (e.target === e.currentTarget && !nested) onSelect(null); }}
    >
      {widgets.length === 0 && !nested && (
        <div className="db-canvas-empty">
          <strong>{editing ? 'Start with a widget' : 'This dashboard is empty'}</strong>
          <span>{editing ? 'Pick one from the library on the left. It lands in the first free spot, and you can drag it from there.' : 'Switch to Edit to add widgets.'}</span>
        </div>
      )}
      {ordered.map(w => {
        const startHidden = w.config.hidden === true;
        if (startHidden && !editing) return null;
        const style: React.CSSProperties = narrow
          ? { height: Math.max(w.h, 3) * stepY - GAP }
          : { left: w.x * stepX, top: w.y * stepY, width: w.w * colW + (w.w - 1) * GAP, height: w.h * ROW + (w.h - 1) * GAP, ...(w.config.overlay ? { zIndex: 8 } : {}) };
        const bg = w.config.bg, fg = w.config.fg;
        const tint: Record<string, string> = {};
        if (bg) Object.assign(tint, { background: bg, '--db-card': bg });
        if (fg) Object.assign(tint, { color: fg, '--cds-text-primary': fg, '--db-text': fg, '--db-muted': fg, '--cds-text-secondary': fg, '--cds-text-helper': fg, '--cds-link-primary': fg });
        Object.assign(style, tint);
        const active = gestureRef.current && gestureRef.current.id === w.id;
        return (
          <section
            key={w.id}
            data-wid={w.id}
            className={`db-widget${startHidden ? ' db-hidden-start' : ''}${selectedId === w.id && editing ? ' selected' : ''}${wired && wired.has(w.id) ? ' wired' : ''}${active ? ' active' : ''}${w.config.chromeless || w.config.overlay ? ' db-chromeless' : ''}${w.config.overlay ? ' db-overlay' : ''}${bg || fg ? ' db-tinted' : ''}`}
            style={style}
            tabIndex={editing ? 0 : -1}
            aria-label={`${w.title} widget`}
            onKeyDown={e => onKey(e, w)}
            onPointerDown={e => { if (editing) { e.stopPropagation(); onSelect(w.id); } }}
          >
            <header
              className="db-widget-head"
              onPointerDown={e => begin(e, { kind: 'move', id: w.id, px: e.clientX, py: e.clientY, x: w.x, y: w.y })}
              title={editing ? 'Drag to move' : rt && w.config.resize !== false ? 'Drag to move' : undefined}
            >
              {editing && <Glyph type={w.type} size={20} />}
              <h3>{w.title}</h3>
              {startHidden && <span className="db-hidden-badge" title="Hidden when the dashboard is used; an action wire can show it">Hidden at start</span>}
              {link && !editing && link.pivotFields(w) && (
                <select className="db-pivot" aria-label={`Group ${w.title} by`} title="Group this chart by another field" value={w.config.groupBy || (w.config.query ? DEFAULT_GROUP[w.config.query] : '')}
                  onPointerDown={e => e.stopPropagation()} onChange={e => link.setPivot(w, e.target.value)}>
                  {(link.pivotFields(w) || []).map(f => <option key={f.key} value={f.key}>by {f.label}</option>)}
                </select>
              )}
              {link && link.on && !editing && w.config.query && canListen(w) && (
                <button type="button" className={`db-linkchip${link.follows(w) ? ' is-on' : ''}`} aria-pressed={link.follows(w)} title={link.follows(w) ? 'Follows the filter bar. Click to ignore it.' : 'Ignores the filter bar. Click to follow it.'}
                  onPointerDown={e => e.stopPropagation()} onClick={() => link.toggle(w)}><FilterIcon size={14} aria-hidden="true" />{link.follows(w) ? 'Filter bar' : 'Not linked'}</button>
              )}
              {editing && (
                <div className="db-widget-actions" onPointerDown={e => e.stopPropagation()}>
                  <button type="button" className="db-iconbtn" title="Duplicate (Ctrl+D)" aria-label={`Duplicate ${w.title}`} onClick={() => onDuplicate(w.id)}><Copy size={16} /></button>
                  <button type="button" className="db-iconbtn" title="Remove (Del)" aria-label={`Remove ${w.title}`} onClick={() => onRemove(w.id)}><TrashCan size={16} /></button>
                </div>
              )}
            </header>
            <div className="db-widget-body">{renderBody(w)}</div>
            {((editing && !narrow) || (rt && w.config.resize !== false)) && (
              <div
                className="db-resize"
                role="presentation"
                title="Drag to resize"
                onPointerDown={e => begin(e, { kind: 'resize', id: w.id, px: e.clientX, py: e.clientY, w: w.w, h: w.h })}
              />
            )}
          </section>
        );
      })}
      {editing && !narrow && !dragging && selectedId && (() => {
        const w = items.find(x => x.id === selectedId);
        if (!w) return null;
        return (
          <div className="db-selchip" style={{ left: w.x * stepX, top: Math.max(w.y * stepY - 22, -22) }} aria-hidden="true">
            <span className="db-selchip-name">{w.title}</span>
            <code>{w.w}×{w.h}</code>
          </div>
        );
      })()}
    </div>
  );
}
