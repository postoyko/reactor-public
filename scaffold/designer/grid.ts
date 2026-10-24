/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure grid layout: 12 columns, unlimited rows. Items never overlap; dropping one on another pushes the
 * others down, and everything floats up to close gaps (the same behaviour people know from react-grid-layout).
 */

import { Box, GRID_COLS } from './types';

/** A widget flagged `config.overlay` floats over the grid: it never collides and is never moved by the others. */
export const isOverlay = (i: unknown): boolean => Boolean(i && (i as { config?: { overlay?: boolean } }).config && (i as { config: { overlay?: boolean } }).config.overlay);

export function overlaps(a: Box, b: Box): boolean {
  if (isOverlay(a) || isOverlay(b)) return false;
  return a.id !== b.id && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clampBox<T extends Box>(b: T, minW = 2, minH = 2): T {
  const w = Math.min(Math.max(Math.round(b.w), minW), GRID_COLS);
  const h = Math.max(Math.round(b.h), minH);
  const x = Math.min(Math.max(Math.round(b.x), 0), GRID_COLS - w);
  const y = Math.max(Math.round(b.y), 0);
  return { ...b, x, y, w, h };
}

/** Float every item up as far as it can go, in reading order. Returns new boxes in the input order. */
export function compact<T extends Box>(items: T[]): T[] {
  const order = items.map((_, i) => i).sort((i, j) => items[i].y - items[j].y || items[i].x - items[j].x || i - j);
  const placed: T[] = [];
  const out: T[] = items.slice();
  order.forEach(i => {
    if (isOverlay(items[i])) { out[i] = items[i]; return; }
    let it = { ...items[i], y: 0 };
    while (placed.some(p => overlaps(it, p))) it = { ...it, y: it.y + 1 };
    placed.push(it);
    out[i] = it;
  });
  return out;
}

/**
 * Resolve overlaps after `id` was moved/resized: that item keeps its place, the others are pushed down
 * (in reading order) until nothing overlaps, then everything floats up.
 */
export function resolve<T extends Box>(items: T[], id: string): T[] {
  if (!items.some(i => i.id === id)) return compact(items);
  return compactAround(items, id);
}

function compactAround<T extends Box>(items: T[], anchorId: string): T[] {
  const anchor = items.find(i => i.id === anchorId) as T;
  const others = items.filter(i => i.id !== anchorId).sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: T[] = [anchor];
  const byId = new Map<string, T>();
  byId.set(anchor.id, anchor);
  others.forEach(o => {
    if (isOverlay(o)) { byId.set(o.id, o); return; }
    let it = { ...o, y: 0 };
    while (placed.some(p => overlaps(it, p))) it = { ...it, y: it.y + 1 };
    placed.push(it);
    byId.set(it.id, it);
  });
  return items.map(i => byId.get(i.id) as T);
}

export function moveItem<T extends Box>(items: T[], id: string, x: number, y: number): T[] {
  const next = items.map(i => (i.id === id ? clampBox({ ...i, x, y }) : i));
  return resolve(next, id);
}

export function resizeItem<T extends Box>(items: T[], id: string, w: number, h: number, minW = 2, minH = 2): T[] {
  const next = items.map(i => (i.id === id ? clampBox({ ...i, w, h }, minW, minH) : i));
  return resolve(next, id);
}

/** First free spot (reading order) for a new w x h item. */
export function findSpot(items: Box[], w: number, h: number): { x: number; y: number } {
  const cw = Math.min(Math.max(w, 1), GRID_COLS);
  const rows = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x + cw <= GRID_COLS; x++) {
      const probe: Box = { id: '__new__', x, y, w: cw, h };
      if (!items.some(i => overlaps(probe, i))) return { x, y };
    }
  }
  return { x: 0, y: rows };
}

export function gridHeight(items: Box[]): number {
  return items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
}

/** Space between widgets: tighter on compact (short-row) dashboards. */
export const gapFor = (row: number): number => (row <= 32 ? 6 : 8);

/**
 * Smallest content height (px, below the title bar and padding) that a component needs to show itself whole. A widget
 * given fewer rows than this is clipped when the row height is small, so loading a dashboard (and applying a template)
 * grows it, and moves whatever is underneath it down.
 */
const CONTENT_PX: Record<string, number> = {
  Tag: 28, ShapeIndicator: 28, IconIndicator: 28, BadgeIndicator: 28,
  ProgressBar: 64, InlineNotification: 64, ActionableNotification: 70, ToastNotification: 90,
  Button: 40, ComboButton: 40, Popover: 40, MenuButton: 40, OverflowMenu: 40, CopyButton: 40,
  Toggle: 56, Checkbox: 32, Search: 44, Slider: 72, Dropdown: 72, Select: 72, ComboBox: 72, MultiSelect: 72,
  TextInput: 72, NumberInput: 72, PasswordInput: 72, DatePicker: 72, TimePicker: 72
};
const CHROME_PX = 38 + 16;

export function fitHeights<T extends { id: string; type: string; x: number; y: number; w: number; h: number; parent?: string; config: { chromeless?: boolean; overlay?: boolean } }>(list: T[], rowH?: number): T[] {
  const row = rowH && rowH >= 24 && rowH <= 96 ? rowH : 48, gap = gapFor(row);
  const out = list.map(w => ({ ...w }));
  const need = (w: T): number => {
    if (!w.type.startsWith('carbon:') || w.config.chromeless || w.config.overlay) return w.h;
    const c = CONTENT_PX[w.type.slice(7)];
    return c ? Math.max(w.h, Math.ceil((c + CHROME_PX + gap) / (row + gap))) : w.h;
  };
  const groups = new Map<string, typeof out>();
  out.forEach(w => { const k = w.parent || ''; groups.set(k, [...(groups.get(k) || []), w]); });
  groups.forEach(items => {
    // Top to bottom: a widget keeps the space it had below each neighbour above it, measured from where that neighbour now ends.
    const orig = new Map(items.map(w => [w.id, { y: w.y, h: w.h }]));
    items.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach(k => {
      const o = orig.get(k.id) as { y: number; h: number };
      let y = o.y;
      items.forEach(j => {
        const oj = orig.get(j.id) as { y: number; h: number };
        if (j === k || oj.y + oj.h > o.y || j.x >= k.x + k.w || j.x + j.w <= k.x) return;
        y = Math.max(y, j.y + j.h + (o.y - (oj.y + oj.h)));
      });
      k.y = y;
      k.h = Math.max(k.h, need(k as unknown as T));
    });
  });
  return out;
}

/**
 * The title band of a dashboard, when it has one: a frameless coloured text across the whole top, with nothing beside
 * it. While viewing it is drawn above the filter bar, so the dashboard reads title first, then its filters.
 */
export function titleBand<T extends { type: string; x: number; y: number; w: number; h: number; parent?: string; config: { chromeless?: boolean; bg?: string; hidden?: boolean } }>(list: T[]): T | undefined {
  const band = list.find(w => !w.parent && w.type === 'text' && w.x === 0 && w.y === 0 && w.w === GRID_COLS && w.config.chromeless && w.config.bg);
  if (!band || band.config.hidden === true) return undefined;
  return list.some(w => w !== band && !w.parent && w.y < band.h) ? undefined : band;
}
