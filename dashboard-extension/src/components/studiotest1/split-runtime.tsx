/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Added by Scaffold Studio ("Make splittable"). Lets one hand-written dashboard be shown as several tiles.
 *
 * How it works: the dashboard component still runs ONCE (its hooks, its data, its selections are untouched).
 * Every tile that asks for a `part` registers an empty slot. The first tile hosts the real component, which draws
 * its own part in place and draws every other part into the other tiles' slots with React portals. So all tiles
 * share one data fetch, one timer and one set of selections without any change to the dashboard's own logic.
 * If the hosting tile is removed, the next tile takes over (the dashboard reloads its data once).
 */

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface Slot { part: string; el: HTMLElement | null; ref: (el: HTMLElement | null) => void }
interface Group { slots: Slot[]; version: number; listeners: Set<() => void> }

const groups = new Map<string, Group>();
function groupOf(name: string): Group {
  let g = groups.get(name);
  if (!g) { g = { slots: [], version: 0, listeners: new Set() }; groups.set(name, g); }
  return g;
}
function bump(g: Group) { g.version += 1; g.listeners.forEach(l => l()); }

export interface SplitInfo { part: string; portals: Record<string, HTMLElement> }
const SplitCtx = createContext<SplitInfo | null>(null);

/** Called first thing inside the dashboard component. null = the whole dashboard (no `part`). */
export function useSplit(): SplitInfo | null {
  return useContext(SplitCtx);
}

export function SplitShell({ name, part, Inner, innerProps }: { name: string; part: string; Inner: React.ComponentType<any>; innerProps: any }) {
  const g = groupOf(name);
  const [slot] = useState<Slot>(() => {
    // The ref callback must keep the same identity between renders, or React would detach and re-attach it every time.
    const sl: Slot = { part, el: null, ref: el => { if (sl.el !== el) { sl.el = el; bump(g); } } };
    return sl;
  });
  slot.part = part;
  useEffect(() => {
    g.slots.push(slot);
    bump(g);
    return () => { g.slots = g.slots.filter(s => s !== slot); bump(g); };
  }, [g, slot]);
  useSyncExternalStore(
    l => { g.listeners.add(l); return () => { g.listeners.delete(l); }; },
    () => g.version,
    () => g.version
  );

  if (g.slots[0] !== slot) {
    return (
      <div
        className="split-slot"
        style={{ height: '100%' }}
        ref={slot.ref}
      />
    );
  }
  const portals: Record<string, HTMLElement> = {};
  g.slots.forEach(s => { if (s !== slot && s.el && !portals[s.part]) portals[s.part] = s.el; });
  return (
    <SplitCtx.Provider value={{ part, portals }}>
      <Inner {...innerProps} />
    </SplitCtx.Provider>
  );
}

/** Replaces the component's final `return`. Without a split it renders every section in order, exactly as before. */
export function renderSplit(
  split: SplitInfo | null,
  sections: Record<string, any>,
  order: string[],
  wrap: (children: React.ReactNode) => React.ReactElement
): React.ReactElement {
  const draw = (keys: string[]) => keys.map(k => <React.Fragment key={k}>{sections[k]}</React.Fragment>);
  if (!split || sections[split.part] === undefined) return wrap(draw(order));
  return (
    <>
      {wrap(draw([split.part]))}
      {Object.keys(split.portals).filter(p => sections[p] !== undefined).map(p => createPortal(wrap(draw([p])), split.portals[p], p))}
    </>
  );
}
