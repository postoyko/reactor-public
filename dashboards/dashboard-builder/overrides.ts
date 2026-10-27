/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * What a person viewing a dashboard has changed for themselves, on top of the saved dashboard. Two kinds:
 * - runtime links (LinkOver): which widgets follow which, whether a widget follows the filter bar, pivots, "View as"
 *   and arranged sizes. Kept in this browser (localStorage 'db-links'), per dashboard.
 * - action effects (ActState): what action wires have done since the dashboard was opened (actions.tsx). Never saved.
 * The saved dashboard itself is never changed by either.
 */

import { useMemo, useState } from 'react';
import { LinkApi } from './nest';
import { pivotFields, retitle } from './pivot';
import { DEFAULT_GROUP, fieldLabel } from './rows';
import { viewAsChoices } from './chart-kinds';
import { Dashboard, Widget } from './types';

/** Per widget: what action wires changed while viewing. */
export type ActState = Record<string, { hidden?: boolean; title?: string; text?: string; props?: Record<string, unknown>; cfg?: Record<string, unknown>; type?: string }>;

/** One dashboard's runtime links, as this person set them. */
export interface DashOver {
  send?: Record<string, string[] | null>;
  follow?: Record<string, boolean>;
  pivot?: Record<string, string>;
  view?: Record<string, string>;
  layout?: Record<string, { x: number; y: number; w: number; h: number }>;
}
/** Runtime links of every dashboard, by dashboard id. */
export type LinkOver = Record<string, DashOver>;

const LINKS_KEY = 'db-links';

/** The dashboard as this person sees it: the saved one with their runtime links and the action effects applied. */
export function applyOverrides(base: Dashboard, lo: DashOver | undefined, act: ActState | undefined): Dashboard {
  if (!lo && !act) return base;
  const lay = lo ? lo.layout : undefined;
  return {
    ...base,
    widgets: base.widgets.map(w0 => {
      let w = w0;
      const L = lay ? lay[w.id] : undefined;
      if (L) w = { ...w, x: L.x, y: L.y, w: L.w, h: L.h };
      const s = lo && lo.send ? lo.send[w.id] : undefined, f = lo && lo.follow ? lo.follow[w.id] : undefined, pv = lo && lo.pivot ? lo.pivot[w.id] : undefined;
      if (s !== undefined || f !== undefined || pv !== undefined) {
        const cfg = { ...w.config };
        let title = w.title;
        if (pv !== undefined) {
          cfg.groupBy = pv;
          const orig = w.config.groupBy || (w.config.query ? DEFAULT_GROUP[w.config.query] : '');
          if (w.config.query && pv !== orig) title = retitle(w.title, fieldLabel(w.config.query, orig), fieldLabel(w.config.query, pv));
        }
        if (s !== undefined) { if (s === null) delete cfg.sendTo; else cfg.sendTo = s; }
        if (f !== undefined) { if (f) delete cfg.followBar; else cfg.followBar = false; }
        w = { ...w, title, config: cfg };
      }
      // "View as": a chart type this person (or an action) chose, from the same family as the saved one
      const byAction = act && act[w.id] ? act[w.id].type : undefined;
      const vt = byAction || (lo && lo.view ? lo.view[w.id] : undefined);
      if (vt && vt !== w.type && (viewAsChoices(w) || []).some(x => x.type === vt)) w = { ...w, type: vt as Widget['type'] };
      const a = act ? act[w.id] : undefined;
      if (a) {
        const cfg = { ...w.config };
        if (a.hidden !== undefined) cfg.hidden = a.hidden;
        if (a.text !== undefined) cfg.text = a.text;
        if (a.props) cfg.props = { ...(cfg.props || {}), ...a.props };
        if (a.cfg) Object.assign(cfg, a.cfg);
        w = { ...w, title: a.title !== undefined ? a.title : w.title, config: cfg };
      }
      return w;
    })
  };
}

/**
 * The runtime links of the dashboard being viewed, and the dashboard with them applied. While designing (`viewing`
 * false) nothing is applied: the designer always edits the saved dashboard.
 */
export function useViewerOverrides(baseActive: Dashboard, viewing: boolean, act: ActState, modes: { link: boolean; resize: boolean }) {
  const [linkOver, setLinkOver] = useState<LinkOver>(() => { try { return JSON.parse(window.localStorage.getItem(LINKS_KEY) || '{}'); } catch (e) { return {}; } });
  const lo = viewing ? linkOver[baseActive.id] : undefined;
  const actOn = viewing && Object.keys(act).length > 0 ? act : undefined;
  const active = useMemo(() => applyOverrides(baseActive, lo, actOn), [baseActive, lo, actOn]);

  /** Changes one dashboard's links; `undefined` from `fn` removes them all. */
  const saveLinks = (id: string, fn: (cur: DashOver) => DashOver | undefined) => setLinkOver(all => {
    const next = { ...all }; const v = fn(all[id] || {}); if (v) next[id] = v; else delete next[id];
    try { window.localStorage.setItem(LINKS_KEY, JSON.stringify(next)); } catch (e) { /* no storage */ }
    return next;
  });
  const runtimeSend = (id: string, sendTo: string[] | undefined) => saveLinks(baseActive.id, cur => ({ ...cur, send: { ...(cur.send || {}), [id]: sendTo === undefined ? null : sendTo } }));

  const linkApi = useMemo<LinkApi>(() => ({
    on: modes.link && viewing,
    follows: (w: Widget) => w.config.followBar !== false,
    toggle: (w: Widget) => saveLinks(baseActive.id, cur => ({ ...cur, follow: { ...(cur.follow || {}), [w.id]: w.config.followBar === false } })),
    viewing,
    pivotFields: (w: Widget) => (viewing ? pivotFields(w) : null),
    setPivot: (w: Widget, key: string) => saveLinks(baseActive.id, cur => ({ ...cur, pivot: { ...(cur.pivot || {}), [w.id]: key } })),
    viewAsChoices: (w: Widget) => (viewing && w.config.viewAs !== false ? viewAsChoices(w) : null),
    viewAsChanged: (w: Widget) => { const saved = baseActive.widgets.find(b => b.id === w.id); return Boolean(saved && saved.type !== w.type); },
    setViewAs: (w: Widget, type: string) => saveLinks(baseActive.id, cur => {
      const saved = baseActive.widgets.find(b => b.id === w.id);
      const view = { ...(cur.view || {}) };
      if (!saved || saved.type === type) delete view[w.id]; else view[w.id] = type;
      const out = { ...cur };
      if (Object.keys(view).length) out.view = view; else delete out.view;
      return Object.keys(out).length ? out : undefined;
    }),
    resizeOn: modes.resize && viewing,
    setLayout: (next: Widget[]) => saveLinks(baseActive.id, cur => {
      const layout = { ...(cur.layout || {}) };
      const base = new Map(baseActive.widgets.map(b => [b.id, b]));
      next.forEach(n => { const b = base.get(n.id); if (!b) return; if (b.x === n.x && b.y === n.y && b.w === n.w && b.h === n.h) delete layout[n.id]; else layout[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h }; });
      const out = { ...cur };
      if (Object.keys(layout).length) out.layout = layout; else delete out.layout;
      return Object.keys(out).length ? out : undefined;
    })
  }), [modes.link, modes.resize, viewing, baseActive]);

  return { active, lo, linkOver, saveLinks, runtimeSend, linkApi };
}
