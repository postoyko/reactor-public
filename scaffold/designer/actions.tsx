/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Action wiring at run time. A widget raises events (`useEmit`); the dashboard looks up the wires that start at it and
 * changes the widgets they point to (shows or hides them, sets a setting or a value, opens a dialog, chooses a tab ...).
 * Components that understand commands listen with `useCommand`.
 */

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Widget } from './types';

export interface ActionApi { emit: (from: string, event: string, value?: string) => void }
export const ActionCtx = createContext<ActionApi>({ emit: () => undefined });

/** `emit('change', value)` for this widget. Does nothing outside a dashboard that is being used. */
export function useEmit(w: Widget): (event: string, value?: string) => void {
  const api = useContext(ActionCtx);
  const id = w.id;
  return useCallback((event: string, value?: string): void => api.emit(id, event, value), [api, id]);
}

export interface Command { name: string; arg: string; n: number }

/** Runs `handler` each time an action sends this widget a new command (and never for one that was sent before it appeared). */
export function useCommand(p: Record<string, any>, handler: (name: string, arg: string) => void): void {
  const c = p.__cmd as Command | undefined;
  const seen = useRef(c ? c.n : 0);
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    if (c && c.n !== seen.current) { seen.current = c.n; h.current(c.name, c.arg); }
  }, [c]);
}

/** Turns an action argument into a value for a setting of the given kind. */
export function coerce(kind: string | undefined, text: string): unknown {
  if (kind === 'bool') return /^(true|yes|on|1)$/i.test(text.trim());
  if (kind === 'number') { const n = Number(text); return Number.isFinite(n) ? n : 0; }
  if (kind === undefined) {
    // a property chosen by name: true / false and numbers keep their type, anything else is text
    if (/^(true|false)$/i.test(text.trim())) return text.trim().toLowerCase() === 'true';
    if (text.trim() !== '' && Number.isFinite(Number(text))) return Number(text);
  }
  return text;
}

/** "2" or a title: the 0-based position it names among `titles` (-1 when none). */
export function indexOf(arg: string, titles: string[]): number {
  const t = arg.trim();
  if (/^\d+$/.test(t)) { const i = Number(t) - 1; return i >= 0 && i < titles.length ? i : -1; }
  return titles.findIndex(x => x.trim().toLowerCase() === t.toLowerCase());
}
