/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Undo and redo of the widgets of the dashboard being designed: the last 50 steps. Quick edits of the same field
 * (typing a title) are kept as one step.
 */

import React, { useCallback, useRef, useState } from 'react';
import { StoreState } from './store';
import { Widget } from './types';

interface History {
  past: Widget[][];
  future: Widget[][];
  lastKey?: string;
  lastAt: number;
}

/** Edits of the same key within this many milliseconds are one undo step. */
const COALESCE_MS = 1200;
const MAX_STEPS = 50;

export function useHistory(store: StoreState, setStore: React.Dispatch<React.SetStateAction<StoreState>>) {
  const [, setTick] = useState(0);
  const ref = useRef<History>({ past: [], future: [], lastAt: 0 });
  // Always points at the latest state, so history bookkeeping happens outside React's state updaters
  // (an updater may run twice in StrictMode and must stay pure).
  const storeRef = useRef(store);
  storeRef.current = store;
  const current = () => { const s = storeRef.current; return s.dashboards.find(d => d.id === s.activeId) || s.dashboards[0]; };
  const put = (id: string, widgets: Widget[]) => setStore(s => ({ ...s, dashboards: s.dashboards.map(d => (d.id === id ? { ...d, widgets, updated: Date.now() } : d)) }));

  /** Replaces the widgets as one undoable step (or part of the last one, for the same `coalesceKey`). */
  const setWidgets = useCallback((next: Widget[], coalesceKey?: string) => {
    const cur = current();
    const h = ref.current;
    const now = Date.now();
    // Typing in a field produces many edits; keep them as one undo step.
    const merge = Boolean(coalesceKey) && h.lastKey === coalesceKey && now - h.lastAt < COALESCE_MS && h.past.length > 0;
    if (!merge) h.past = [...h.past.slice(-(MAX_STEPS - 1)), cur.widgets];
    h.future = [];
    h.lastKey = coalesceKey;
    h.lastAt = now;
    put(cur.id, next);
    setTick(n => n + 1);
  }, []);

  const undo = () => {
    const h = ref.current;
    if (h.past.length === 0) return;
    const cur = current();
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [cur.widgets, ...h.future];
    h.lastKey = undefined;
    put(cur.id, prev);
    setTick(n => n + 1);
  };
  const redo = () => {
    const h = ref.current;
    if (h.future.length === 0) return;
    const cur = current();
    const nxt = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, cur.widgets];
    h.lastKey = undefined;
    put(cur.id, nxt);
    setTick(n => n + 1);
  };
  /** Forgets every step, for example after switching to another dashboard. */
  const reset = () => { ref.current = { past: [], future: [], lastAt: 0 }; setTick(n => n + 1); };

  return { setWidgets, undo, redo, reset, canUndo: ref.current.past.length > 0, canRedo: ref.current.future.length > 0 };
}
