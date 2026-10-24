/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AlertItem, IncidentItem, adaptAlerts, adaptIncidents } from './logic';
import { EMPTY_ALERTS, EMPTY_INCIDENTS } from './types';

/*
 * One alert query and one incident query shared by every section tile on a page.
 *
 * The whole dashboard fetches through the toolkit's useQuery hook (see telco-causal-gen2.panel.ts). Section tiles must not
 * each do that, or a page with eight tiles would send sixteen queries and run sixteen refresh timers. Tiles that join the
 * same feed (same `key`) share one query pair, one timer and one result. The first tile to mount starts the fetch; the
 * last to leave stops the timer.
 *
 * Both queries go through `window.akoraConfig.baseState.API.contentAnalyticsAPI`, exactly as useQuery does.
 */

export interface MeshFeedState {
  alerts: AlertItem[];
  hasEventCounts: boolean;
  incidents: IncidentItem[];
  loading: boolean;
  error: unknown;
}

export interface MeshFeedConfig {
  /** Tiles with the same key share a feed. */
  key: string;
  /** Options for the `getAlerts` query. Must be a stable object. */
  alertParams: Record<string, unknown>;
  /** Options for the `getStories` query. Must be a stable object. */
  incidentParams: Record<string, unknown>;
}

type Listener = () => void;

const api = (): Record<string, (o: object) => Promise<unknown>> | undefined => (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI;

export class MeshFeed {
  private state: MeshFeedState = { alerts: EMPTY_ALERTS, hasEventCounts: false, incidents: EMPTY_INCIDENTS, loading: false, error: undefined };
  private listeners = new Set<Listener>();
  private inflight: Promise<void> | null = null;
  private timer: number | null = null;
  private intervals = new Map<symbol, number>();
  private generation = 0;

  constructor(private cfg: MeshFeedConfig) {}

  getState = () => this.state;

  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };

  private patch(p: Partial<MeshFeedState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach(l => l());
  }

  /** Sends both queries (once at a time). Old data stays visible while it loads, as with useQuery. */
  refetch = (): Promise<void> => {
    if (this.inflight) return this.inflight;
    const gen = ++this.generation;
    this.patch({ loading: true });
    const run = async () => {
      const a = api();
      const missing = (name: string) => new Error(`The ${name} query is not available in this environment.`);
      const call = (name: string, params: Record<string, unknown>) => (a && typeof a[name] === 'function' ? a[name](params) : Promise.reject(missing(name)));
      const [alertRes, incidentRes] = await Promise.allSettled([call('getAlerts', this.cfg.alertParams), call('getStories', this.cfg.incidentParams)]);
      if (gen !== this.generation) return;
      const next: Partial<MeshFeedState> = { loading: false };
      let error: unknown;
      if (alertRes.status === 'fulfilled') {
        const adapted = adaptAlerts(alertRes.value);
        next.alerts = adapted.alerts;
        next.hasEventCounts = adapted.hasEventCounts;
      } else error = alertRes.reason;
      if (incidentRes.status === 'fulfilled') next.incidents = adaptIncidents(incidentRes.value);
      else error = error || incidentRes.reason;
      next.error = error;
      this.patch(next);
    };
    this.inflight = run().finally(() => { this.inflight = null; });
    return this.inflight;
  };

  /** A tile joins. Returns the function that makes it leave. `refreshSeconds` 0 means no timer for this tile. */
  attach(refreshSeconds: number): () => void {
    const id = Symbol('feed-user');
    const first = this.intervals.size === 0;
    this.intervals.set(id, refreshSeconds);
    this.retime();
    if (first) void this.refetch();
    return () => {
      this.intervals.delete(id);
      this.retime();
    };
  }

  /** The shortest positive interval requested by any tile wins. */
  private retime() {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    const secs = [...this.intervals.values()].filter(s => s > 0);
    if (secs.length === 0) return;
    this.timer = window.setInterval(() => { void this.refetch(); }, Math.min(...secs) * 1000);
  }

  get users() { return this.intervals.size; }
}

const feeds = new Map<string, MeshFeed>();

/** The feed for a config, created on first use and dropped again when its last user has left. */
export function useSharedMeshFeed(cfg: MeshFeedConfig, refreshSeconds: number): MeshFeedState & { refetch: () => void } {
  let feed = feeds.get(cfg.key);
  if (!feed) { feed = new MeshFeed(cfg); feeds.set(cfg.key, feed); }
  const f = feed;
  useEffect(() => {
    const leave = f.attach(refreshSeconds);
    return () => {
      leave();
      // Forget the feed (and its old data) once nobody uses it, after a tick so that a remount keeps it.
      setTimeout(() => { if (f.users === 0 && feeds.get(cfg.key) === f) feeds.delete(cfg.key); }, 0);
    };
  }, [f, refreshSeconds]);
  const state = useSyncExternalStore(f.subscribe, f.getState, f.getState);
  const refetch = useCallback(() => { void f.refetch(); }, [f]);
  return { ...state, refetch };
}
