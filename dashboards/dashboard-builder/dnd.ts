/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Drag and drop between panels. Every grid (the dashboard and each panel inside a container) carries `data-slot`
 * (its panel id, empty for the dashboard), `data-depth` and `data-row`. While something is dragged, the grid under the
 * pointer that accepts it is outlined; releasing there places the widget at that spot.
 */

import { gapFor } from './grid';
import { GRID_COLS } from './types';


export interface DragSource { id?: string; type?: string }
export interface Dnd {
  /** Can this widget (existing id, or new type) go into the panel `slot` (at nesting depth `depth`)? */
  canDrop: (src: DragSource, slot: string, depth: number) => boolean;
  /** Place it. `cx`/`cy` are the pointer position, in client coordinates. */
  drop: (src: DragSource, slot: string, cell: { x: number; y: number } | null) => void;
}

export interface Target { el: HTMLElement; slot: string }

/** The innermost grid under the pointer that accepts the drag. (Geometry, not element hit-testing: widget bodies ignore the pointer while editing.) */
export function targetAt(cx: number, cy: number, src: DragSource, dnd: Dnd): Target | null {
  let best: Target | null = null;
  let area = Infinity;
  document.querySelectorAll<HTMLElement>('[data-slot]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return;
    const a = r.width * r.height;
    if (a < area && dnd.canDrop(src, el.dataset.slot || '', Number(el.dataset.depth) || 0)) { best = { el, slot: el.dataset.slot || '' }; area = a; }
  });
  return best;
}

/** The grid cell under the pointer, with the widget centred on it. */
export function cellAt(el: HTMLElement, cx: number, cy: number, w: number): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const width = el.clientWidth || r.width;
  const row = Number(el.dataset.row) || 48;
  const GAP = gapFor(row);
  const colW = Math.max((width - GAP * (GRID_COLS - 1)) / GRID_COLS, 20);
  const x = Math.round((cx - r.left) / (colW + GAP) - w / 2);
  const y = Math.round((cy - r.top) / (row + GAP) - 0.5);
  return { x: Math.min(Math.max(x, 0), Math.max(GRID_COLS - w, 0)), y: Math.max(y, 0) };
}

let lit: HTMLElement | null = null;
export function highlight(el: HTMLElement | null) {
  if (lit === el) return;
  if (lit) lit.classList.remove('db-drop');
  lit = el;
  if (lit) lit.classList.add('db-drop');
}

let ghostEl: HTMLElement | null = null;
export function ghost(label: string | null, cx = 0, cy = 0) {
  if (label === null) {
    if (ghostEl) ghostEl.remove();
    ghostEl = null;
    return;
  }
  if (!ghostEl) {
    ghostEl = document.createElement('div');
    ghostEl.className = 'db-ghost';
    document.body.appendChild(ghostEl);
  }
  if (ghostEl.textContent !== label) ghostEl.textContent = label;
  ghostEl.style.left = `${cx + 14}px`;
  ghostEl.style.top = `${cy + 10}px`;
}

/**
 * Drags something that is not on the canvas yet (a library item). A press that never moves stays a click.
 * Returns true through `wasDrag()` right after a drag, so the click that follows can be ignored.
 */
export function startLibraryDrag(e: React.PointerEvent, label: string, src: DragSource, dnd: Dnd, w: number) {
  if (e.button !== 0) return;
  const sx = e.clientX; const sy = e.clientY;
  let started = false;
  let target: Target | null = null;
  const move = (ev: PointerEvent) => {
    if (!started && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return;
    started = true;
    ev.preventDefault();
    document.body.classList.add('db-dragging');
    target = targetAt(ev.clientX, ev.clientY, src, dnd);
    highlight(target ? target.el : null);
    ghost(label, ev.clientX, ev.clientY);
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.classList.remove('db-dragging');
    highlight(null);
    ghost(null);
    if (started) {
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
      const t = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY, src, dnd) : null;
      if (t) dnd.drop(src, t.slot, cellAt(t.el, ev.clientX, ev.clientY, w));
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

let suppressClick = false;
export const wasDrag = () => suppressClick;
