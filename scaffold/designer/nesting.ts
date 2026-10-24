/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Widgets inside widgets. The dashboard stays one flat list; a widget with `parent` = "<containerId>#<n>" lives in
 * panel n of that container (a Container, a tab, an accordion section or a split-pane panel) and is placed on that
 * panel's own 12-column grid. Pure logic, shared with Studio.
 */

import { carbonSpec } from './carbon-specs';
import { compact } from './grid';
import { Widget } from './types';

export const MAX_DEPTH = 3;

export const slotOwner = (slot: string): string => slot.split('#')[0];

export interface SlotInfo { slot: string; label: string; owner: string }

const pairOf = (s: string): [string, string] => { const i = s.indexOf('::'); return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 2).trim()]; };
const linesOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x)) : typeof v === 'string' ? v.split('\n') : []).filter(x => x.trim() !== '');

function propOf(w: Widget, key: string): unknown {
  const p = (w.config.props || {}) as Record<string, unknown>;
  if (p[key] !== undefined) return p[key];
  const spec = carbonSpec(w.type);
  const ps = spec ? spec.props.find(x => x.key === key) : undefined;
  return ps ? ps.def : undefined;
}

/** The panels of one widget that hold widgets (their content is the word "widgets"). */
export function slotsOfWidget(w: Widget): SlotInfo[] {
  if (w.type === 'group') return [{ slot: `${w.id}#0`, label: w.title, owner: w.id }];
  if (w.type === 'carbon:ScrollPane' || w.type === 'carbon:Toolbar') {
    return String(propOf(w, 'content') ?? 'widgets').trim() === 'widgets' ? [{ slot: `${w.id}#0`, label: w.title, owner: w.id }] : [];
  }
  if (w.type === 'carbon:Tabs' || w.type === 'carbon:Accordion' || w.type === 'carbon:Carousel') {
    const noun = w.type === 'carbon:Tabs' ? 'tab' : w.type === 'carbon:Carousel' ? 'slide' : 'section';
    return linesOf(propOf(w, 'items')).map((l, i) => ({ l: pairOf(l), i })).filter(x => x.l[1].trim() === 'widgets')
      .map(x => ({ slot: `${w.id}#${x.i}`, label: `${w.title} › ${x.l[0] || `${noun} ${x.i + 1}`}`, owner: w.id }));
  }
  if (w.type === 'carbon:SplitPane') {
    const out: SlotInfo[] = [];
    if (String(propOf(w, 'first') || '').trim() === 'widgets') out.push({ slot: `${w.id}#0`, label: `${w.title} › first panel`, owner: w.id });
    if (String(propOf(w, 'second') || '').trim() === 'widgets') out.push({ slot: `${w.id}#1`, label: `${w.title} › second panel`, owner: w.id });
    return out;
  }
  return [];
}
export const slotsOf = (widgets: Widget[]): SlotInfo[] => widgets.flatMap(slotsOfWidget);

/** Widgets that hold other widgets. */
export const CONTAINER_TYPE = /^(group|carbon:(Tabs|Accordion|SplitPane|ScrollPane|Carousel|Toolbar))$/;
export const isContainerType = (t: string): boolean => CONTAINER_TYPE.test(t);
export const isContainer = (w: Widget): boolean => isContainerType(w.type);

/** The widget and everything inside it, at any depth. */
export function subtreeIds(widgets: Widget[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    widgets.forEach(w => { if (w.parent && !out.has(w.id) && out.has(slotOwner(w.parent))) { out.add(w.id); grew = true; } });
  }
  return out;
}

export function depthOf(widgets: Widget[], w: Widget): number {
  let d = 0; let cur: Widget | undefined = w;
  while (cur && cur.parent && d < 12) { const o = slotOwner(cur.parent); cur = widgets.find(x => x.id === o); d++; }
  return d;
}

/** Compacts every panel's grid on its own (the top level and each slot). Keeps the list order. */
export function compactTree(widgets: Widget[]): Widget[] {
  const groups = new Map<string, number[]>();
  widgets.forEach((w, i) => { const k = w.parent || ''; groups.set(k, [...(groups.get(k) || []), i]); });
  const out = widgets.slice();
  groups.forEach(idx => { const c = compact(idx.map(i => widgets[i])); idx.forEach((i, j) => { out[i] = c[j]; }); });
  return out;
}

/** Layers order: each widget followed by what it contains. */
export function treeOrder(widgets: Widget[]): Widget[] {
  const by = (list: Widget[]) => list.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Widget[] = [];
  const seen = new Set<string>();
  const walk = (list: Widget[]) => by(list).forEach(w => {
    if (seen.has(w.id)) return;
    seen.add(w.id); out.push(w);
    const slots = Array.from(new Set(widgets.filter(c => c.parent && slotOwner(c.parent) === w.id).map(c => c.parent as string))).sort();
    slots.forEach(sl => walk(widgets.filter(c => c.parent === sl)));
  });
  walk(widgets.filter(w => !w.parent));
  widgets.forEach(w => { if (!seen.has(w.id)) out.push(w); }); // anything orphaned still shows
  return out;
}

/** Copies a widget with everything inside it under new ids; links and parents are renamed to match. */
export function cloneSubtree(widgets: Widget[], id: string, newId: (p: string) => string): { root: Widget; all: Widget[] } | null {
  const ids = subtreeIds(widgets, id);
  const src = widgets.filter(w => ids.has(w.id));
  if (!src.length) return null;
  const map = new Map<string, string>();
  src.forEach(w => map.set(w.id, newId('w')));
  const all = src.map(w => ({
    ...w,
    id: map.get(w.id) as string,
    ...(w.parent && map.has(slotOwner(w.parent)) ? { parent: `${map.get(slotOwner(w.parent))}#${w.parent.split('#')[1]}` } : {}),
    config: { ...w.config, ...(w.config.sendTo ? { sendTo: w.config.sendTo.map(t => map.get(t) || t) } : {}) }
  }));
  return { root: all.find(w => w.id === map.get(id)) as Widget, all };
}
