/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react';

/*
 * A MeshSession holds the state that the sections of the Telco Causal Mesh share: the selected node, the active
 * incident, filters, replay, the drawer and so on, plus a few mutable objects (camera, cached positions) and a
 * small memo cache for the expensive derived models.
 *
 *  - The full dashboard creates its own private session, so it behaves exactly like ordinary component state.
 *  - Section tiles (`part` prop, used by Concert Workbench's Layout Editor) all join ONE page-wide session, so a click
 *    in the incident list selects the node in the topology tile, and so on.
 *
 * Exactly one mounted component per session is the "host". The host runs the side effects that must happen once
 * (resource queries for the drawer, the replay timer, selection clean-up) and renders the overlays (drawer, menus,
 * modals). If the host unmounts, the next mounted component takes over.
 */

export type Updater<T> = T | ((prev: T) => T);
type Listener = () => void;

export class MeshSession {
  private values = new Map<string, unknown>();
  private keyListeners = new Map<string, Set<Listener>>();
  private refs = new Map<string, { current: unknown }>();
  private memos = new Map<string, { deps: readonly unknown[]; value: unknown }>();
  private order: string[] = [];
  private hostListeners = new Set<Listener>();
  hostId: string | null = null;

  /** Current value of a key; `init` (a value or a function returning one) is used the first time. */
  get<T>(key: string, init: T | (() => T)): T {
    if (!this.values.has(key)) this.values.set(key, typeof init === 'function' ? (init as () => T)() : init);
    return this.values.get(key) as T;
  }

  /** Sets a key. Like React's setState, a function receives the previous value. Equal values do nothing. */
  set<T>(key: string, next: Updater<T>, init?: T | (() => T)): void {
    const prev = this.values.has(key) ? (this.values.get(key) as T) : init === undefined ? undefined : this.get(key, init);
    const value = typeof next === 'function' ? (next as (p: T) => T)(prev as T) : next;
    if (this.values.has(key) && Object.is(this.values.get(key), value)) return;
    this.values.set(key, value);
    this.keyListeners.get(key)?.forEach(l => l());
  }

  subscribeKey = (key: string) => (listener: Listener) => {
    let set = this.keyListeners.get(key);
    if (!set) { set = new Set(); this.keyListeners.set(key, set); }
    set.add(listener);
    return () => { set!.delete(listener); };
  };

  /** A mutable box that every component of the session shares (camera targets, position cache ...). */
  ref<T>(key: string, init: () => T): { current: T } {
    let r = this.refs.get(key);
    if (!r) { r = { current: init() }; this.refs.set(key, r); }
    return r as { current: T };
  }

  /** Remembers the result of `fn` until `deps` change (shallow, by identity), so several tiles compute a model once. */
  memo<T>(key: string, deps: readonly unknown[], fn: () => T): T {
    const hit = this.memos.get(key);
    if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => Object.is(d, deps[i]))) return hit.value as T;
    const value = fn();
    this.memos.set(key, { deps, value });
    return value;
  }

  // ── host election (see the note at the top) ──
  subscribeHost = (listener: Listener) => { this.hostListeners.add(listener); return () => { this.hostListeners.delete(listener); }; };
  getHostId = () => this.hostId;
  /** Called from an effect, so only committed components are ever in the list. */
  join(id: string) {
    if (!this.order.includes(id)) this.order.push(id);
    if (this.hostId === null) { this.hostId = this.order[0]; this.hostListeners.forEach(l => l()); }
  }
  leave(id: string) {
    this.order = this.order.filter(x => x !== id);
    if (this.hostId === id) { this.hostId = this.order[0] ?? null; this.hostListeners.forEach(l => l()); }
  }
  get size() { return this.order.length; }
}

// ── the page-wide session used by section tiles ─────────────────────────────

let pageSession: MeshSession | null = null;
let pageUsers = 0;

function usePageSession(enabled: boolean): MeshSession | null {
  const [session] = useState<MeshSession | null>(() => {
    if (!enabled) return null;
    if (!pageSession) pageSession = new MeshSession();
    return pageSession;
  });
  useEffect(() => {
    if (!session) return undefined;
    pageUsers += 1;
    return () => {
      pageUsers -= 1;
      // Drop the shared state when the last tile goes away (after a tick, so a re-layout that remounts tiles keeps it).
      setTimeout(() => { if (pageUsers === 0 && pageSession === session) pageSession = null; }, 0);
    };
  }, [session]);
  return session;
}

/** The session this component belongs to: the page-wide one when `shared`, otherwise a private one. */
export function useMeshSession(shared: boolean): MeshSession {
  const page = usePageSession(shared);
  const [own] = useState(() => (shared ? null : new MeshSession()));
  return (page || own) as MeshSession;
}

/** True for exactly one mounted component of the session. It is true on the very first render of a lone component. */
export function useIsHost(session: MeshSession): boolean {
  const id = useId();
  useEffect(() => {
    session.join(id);
    return () => session.leave(id);
  }, [session, id]);
  const hostId = useSyncExternalStore(session.subscribeHost, session.getHostId, session.getHostId);
  return hostId === null || hostId === id;
}

/** Drop-in for useState whose value lives in the session. `init` may be a function, as with useState. */
export function useSessionState<T>(session: MeshSession, key: string, init: T | (() => T)): [T, (next: Updater<T>) => void] {
  const subscribe = useCallback((l: Listener) => session.subscribeKey(key)(l), [session, key]);
  const getSnapshot = () => session.get<T>(key, init);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useCallback((next: Updater<T>) => session.set<T>(key, next, init), [session, key]);
  return [value, set];
}
