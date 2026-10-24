/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dashboard designer: build a page from widgets bound to live AIOps queries and from the toolkit's existing
 * panels, arrange it by dragging and resizing, link widgets by clicking, and save it in this browser or as JSON.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InlineNotification } from '@carbon/react';
import { Add, Checkmark, ChevronDown, Connect, Copy, Download, Flow, Help, Template, OverflowMenuVertical, Redo, Renew, TrashCan, Undo, Upload } from '@carbon/icons-react';
import './dashboard-builder.scss';
import { ActionLink, Cond, Dashboard, Filter, FilterBarConfig, QueryName, Row, Widget } from './types';
import { ActionApi, ActionCtx, coerce } from './actions';
import { argKind, fill } from './component-api';
import { partValues, platformAction } from './platform-actions';
import { PLATFORM_ID } from './sources';
import { carbonSpec, carbonDefaults } from './carbon-specs';
import Library, { DockTab, LibSection } from './Library';
import Menu from './Menu';
import { Glyph } from './Glyph';
import { typeLabel } from './meta';
import { DataHub, sourceKey } from './datahub';
import { BuilderCtx, BuilderContext } from './context';
import { findSpot, fitHeights, moveItem } from './grid';
import { defaultConfig, defaultTitle, minSize, NATIVE, TILES } from './registry';
import { CARBON, GROUPS } from './carbon-catalog';
import { cloneDashboard, exportJson, importJson, loadState, newId, saveState, sharedDashboard, StoreState } from './store';
import { applyFilters, DEFAULT_GROUP, fieldLabel } from './rows';
import GridCanvas from './GridCanvas';
import { NestApi, NestCtx } from './nest';
import { MAX_DEPTH, cloneSubtree, isContainer, isContainerType, slotOwner, slotsOf, subtreeIds } from './nesting';
import { Dnd } from './dnd';
import { wiredIds } from './Wiring';
import WireLayer from './WireLayer';
import { canSend } from './Wiring';
import { pivotFields, retitle } from './pivot';
import ViewsMenu, { SavedView } from './ViewsMenu';
import { LinkCtx } from './nest';
import StartScreen from './StartScreen';
import FilterBar, { passes, Range } from './FilterBar';
import FilterBarSettings from './FilterBarSettings';
import { FilterFieldsMenu } from './FilterFields';
import Tour, { tourSeen } from './Tour';
import { Template as TemplateDef } from './templates';
import DrillDrawer from './DrillDrawer';
import { DrillRequest, urlFilters } from './drill';
import { inputDefault } from './bindings';
import Inspector from './Inspector';
import ActionStudio from './ActionStudio';
import { matches, WidgetBody } from './Widgets';
import { VERSION } from './version';
import { DEFAULT_LAYOUT } from './default-layout';

/** Hosted by Concert Workbench: the host owns the dashboard (load, save, publish). No browser storage, no switcher. */
export interface Authoring {
  dashboard: Dashboard;
  onChange: (d: Dashboard) => void;
  onSelect?: (id: string | null) => void;
  /** Sections a tile can show instead of the whole dashboard, by tile id. */
  partsFor?: (tile: string) => { id: string; label: string }[];
  /** Short text for the status bar, for example "Unsaved changes". */
  status?: string;
}

interface Props {
  authoring?: Authoring;
  /** Tenant for all queries made by the generic widgets. Defaults to the toolkit sample tenant, so set it. */
  tenantId?: string;
  /** Hide all editing. The saved dashboards can still be viewed. */
  readOnly?: boolean;
  /** A published layout (dashboard JSON). Fixed and read-only. */
  layout?: unknown;
  [key: string]: unknown;
}

const MemoBody = React.memo(
  WidgetBody,
  (a, b) => a.w.id === b.w.id && a.w.type === b.w.type && a.w.config === b.w.config
);

interface History {
  past: Widget[][];
  future: Widget[][];
  lastKey?: string;
  lastAt: number;
}

export default function DashboardBuilder(props: Props) {
  // `layout` = a fixed, published layout (from Concert Workbench): shown read-only, never touches this browser's saved dashboards.
  const authoring = props.authoring || null;
  const fixed = useMemo(() => (!authoring && props.layout ? sharedDashboard(props.layout) : null), [props.layout, authoring]);
  const readOnly = !authoring && (Boolean(props.readOnly) || fixed !== null);
  const [store, setStore] = useState<StoreState>(() =>
    authoring ? { version: 1, activeId: authoring.dashboard.id, dashboards: [authoring.dashboard] } :
    fixed ? { version: 1, activeId: fixed.id, dashboards: [fixed] } : loadState(undefined, sharedDashboard(DEFAULT_LAYOUT)));
  const [editing, setEditing] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filter[]>(() => (typeof window !== 'undefined' ? urlFilters(window.location.search) : []));
  const [tab, setTab] = useState<DockTab>('add');
  const [pending, setPending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [wireMode, setWireMode] = useState(false);
  const [wireKind, setWireKind] = useState<'data' | 'action'>('data');
  /** Action flows editor: open (with the widget in focus, or null) or closed (undefined). */
  const [flows, setFlows] = useState<string | null | undefined>(undefined);
  const [tour, setTour] = useState(false);
  const [pick, setPick] = useState(false);
  const [barSel, setBarSel] = useState<Record<string, string[]>>({});
  const [range, setRange] = useState<Range>({ preset: 'all' });
  const [refreshS, setRefreshS] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [blank, setBlank] = useState<string[]>([]);
  const [drillReq, setDrillReq] = useState<DrillRequest | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  // Action wiring: what the wires have done to widgets since the dashboard was opened (see actions.tsx). Never saved.
  type ActState = Record<string, { hidden?: boolean; title?: string; text?: string; props?: Record<string, unknown>; cfg?: Record<string, unknown> }>;
  const [act, setAct] = useState<ActState>({});
  const cmdN = useRef(0);
  const depth = useRef(0);
  const setValue = useCallback((id: string, v: string) => setValues(o => (o[id] === v ? o : { ...o, [id]: v })), []);
  const [notice, setNotice] = useState<{ kind: 'info' | 'error' | 'warning'; text: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [, setHistoryTick] = useState(0);
  const historyRef = useRef<History>({ past: [], future: [], lastAt: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const hub = useMemo(() => new DataHub(undefined, props.tenantId || undefined), [props.tenantId]);

  const baseActive: Dashboard = store.dashboards.find(d => d.id === store.activeId) || store.dashboards[0];
  // Runtime links: while viewing, people can re-wire which widgets follow which, and whether a widget follows the filter bar.
  // Kept in this browser, per dashboard; the saved dashboard is not changed.
  type LinkOver = Record<string, { send?: Record<string, string[] | null>; follow?: Record<string, boolean>; pivot?: Record<string, string>; layout?: Record<string, { x: number; y: number; w: number; h: number }> }>;
  const [linkOver, setLinkOver] = useState<LinkOver>(() => { try { return JSON.parse(window.localStorage.getItem('db-links') || '{}'); } catch (e) { return {}; } });
  const [linkMode, setLinkMode] = useState(false);
  const [resizeMode, setResizeMode] = useState(false);
  const viewing = !(editing && !readOnly);
  const lo = viewing ? linkOver[baseActive.id] : undefined;
  const actOn = viewing && Object.keys(act).length > 0 ? act : undefined;
  const active: Dashboard = useMemo(() => {
    if (!lo && !actOn) return baseActive;
    const lay = lo ? lo.layout : undefined;
    return {
      ...baseActive,
      widgets: baseActive.widgets.map(w0 => {
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
        const a = actOn ? actOn[w.id] : undefined;
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
  }, [baseActive, lo, actOn]);
  useEffect(() => { setAct({}); }, [baseActive.id, viewing]);
  const saveLinks = (id: string, fn: (cur: LinkOver[string]) => LinkOver[string] | undefined) => setLinkOver(all => {
    const next = { ...all }; const v = fn(all[id] || {}); if (v) next[id] = v; else delete next[id];
    try { window.localStorage.setItem('db-links', JSON.stringify(next)); } catch (e) { /* no storage */ }
    return next;
  });
  const runtimeSend = (id: string, sendTo: string[] | undefined) => saveLinks(baseActive.id, cur => ({ ...cur, send: { ...(cur.send || {}), [id]: sendTo === undefined ? null : sendTo } }));
  const linkApi = useMemo(() => ({
    on: linkMode && viewing,
    follows: (w: Widget) => w.config.followBar !== false,
    toggle: (w: Widget) => saveLinks(baseActive.id, cur => ({ ...cur, follow: { ...(cur.follow || {}), [w.id]: w.config.followBar === false } })),
    viewing,
    pivotFields: (w: Widget) => (viewing ? pivotFields(w) : null),
    setPivot: (w: Widget, key: string) => saveLinks(baseActive.id, cur => ({ ...cur, pivot: { ...(cur.pivot || {}), [w.id]: key } })),
    resizeOn: resizeMode && viewing,
    setLayout: (next: Widget[]) => saveLinks(baseActive.id, cur => {
      const layout = { ...(cur.layout || {}) };
      const base = new Map(baseActive.widgets.map(b => [b.id, b]));
      next.forEach(n => { const b = base.get(n.id); if (!b) return; if (b.x === n.x && b.y === n.y && b.w === n.w && b.h === n.h) delete layout[n.id]; else layout[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h }; });
      const out = { ...cur };
      if (Object.keys(layout).length) out.layout = layout; else delete out.layout;
      return Object.keys(out).length ? out : undefined;
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [linkMode, resizeMode, viewing, baseActive]);
  const selected = active.widgets.find(w => w.id === selectedId) || null;

  // Autosave, debounced. A refused write (private window, full storage) is shown, not swallowed.
  useEffect(() => {
    if (fixed || authoring) return undefined; // a published layout is never written to this browser's saved dashboards
    setPending(true);
    const t = window.setTimeout(() => { setSaveFailed(!saveState(store)); setPending(false); }, 400);
    return () => window.clearTimeout(t);
  }, [store, fixed, authoring]);

  // Hosted by Studio: every change goes to the host (not the first render), and so does the selection.
  const hostRef = useRef(authoring); hostRef.current = authoring;
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    const h = hostRef.current; if (!h) return;
    const d = store.dashboards.find(x => x.id === store.activeId) || store.dashboards[0];
    h.onChange(d);
  }, [store]);
  useEffect(() => { const h = hostRef.current; if (h && h.onSelect) h.onSelect(selectedId); }, [selectedId]);
  // The host renames the layout or changes its row height from its own toolbar.
  const hostName = authoring ? authoring.dashboard.name : undefined;
  const hostRow = authoring ? authoring.dashboard.rowH : undefined;
  useEffect(() => {
    if (!hostRef.current) return;
    setStore(st => {
      const d = st.dashboards[0];
      return d.name === hostName && d.rowH === hostRow ? st : { ...st, dashboards: [{ ...d, name: hostName as string, rowH: hostRow }] };
    });
  }, [hostName, hostRow]);

  const resetHistory = () => { historyRef.current = { past: [], future: [], lastAt: 0 }; setHistoryTick(n => n + 1); };

  // Always points at the latest state, so history bookkeeping happens outside React's state updaters
  // (an updater may run twice in StrictMode and must stay pure).
  const storeRef = useRef(store);
  storeRef.current = store;

  const setWidgets = useCallback((next: Widget[], coalesceKey?: string) => {
    const s = storeRef.current;
    const cur = s.dashboards.find(d => d.id === s.activeId) || s.dashboards[0];
    const h = historyRef.current;
    const now = Date.now();
    // Typing in a field produces many edits; keep them as one undo step.
    const merge = Boolean(coalesceKey) && h.lastKey === coalesceKey && now - h.lastAt < 1200 && h.past.length > 0;
    if (!merge) h.past = [...h.past.slice(-49), cur.widgets];
    h.future = [];
    h.lastKey = coalesceKey;
    h.lastAt = now;
    const id = cur.id;
    setStore(st => ({ ...st, dashboards: st.dashboards.map(d => (d.id === id ? { ...d, widgets: next, updated: now } : d)) }));
    setHistoryTick(n => n + 1);
  }, []);

  const undo = () => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [active.widgets, ...h.future];
    h.lastKey = undefined;
    setStore(s => ({ ...s, dashboards: s.dashboards.map(d => (d.id === active.id ? { ...d, widgets: prev, updated: Date.now() } : d)) }));
    setHistoryTick(n => n + 1);
  };
  const redo = () => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const nxt = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, active.widgets];
    h.lastKey = undefined;
    setStore(s => ({ ...s, dashboards: s.dashboards.map(d => (d.id === active.id ? { ...d, widgets: nxt, updated: Date.now() } : d)) }));
    setHistoryTick(n => n + 1);
  };

  const emitRef = useRef<ActionApi['emit']>(() => undefined);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const toggleFilter = useCallback((from: string, query: QueryName, field: string, value: string) => {
    const was = filtersRef.current.some(f => f.from === from && f.field === field && f.value === value);
    setFilters(fs => {
      const i = fs.findIndex(f => f.from === from && f.field === field && f.value === value);
      return i >= 0 ? fs.filter((_, j) => j !== i) : [...fs, { from, query, field, value }];
    });
    emitRef.current(from, 'select', was ? '' : value);
  }, []);

  const setSelectionRaw = useCallback((from: string, query: QueryName, field: string, values: string[]) => {
    setFilters(fs => [...fs.filter(f => !(f.from === from && f.field === field)), ...values.map(value => ({ from, query, field, value }))]);
  }, []);
  const setSelection = useCallback((from: string, query: QueryName, field: string, values: string[]) => {
    setSelectionRaw(from, query, field, values);
    emitRef.current(from, 'select', values.join(', '));
  }, [setSelectionRaw]);

  // Action wiring: run the wires that start at `from` for `event`. Only while a dashboard is being used, never while designing.
  const widgetsRef = useRef(baseActive.widgets);
  widgetsRef.current = baseActive.widgets;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  const actRef = useRef(act);
  actRef.current = act;
  const barRef = useRef<{ pass: (q: QueryName, r: Row) => boolean } | undefined>(undefined);
  /** Calls Concert Operate (create an incident, change policies), only after the person using the dashboard confirms. */
  const runPlatform = (l: ActionLink, value: string, t?: Widget) => {
    const spec = platformAction(l.do);
    if (!spec) return;
    const v = partValues(spec.parts, l.arg);
    Object.keys(v).forEach(k => { v[k] = fill(v[k], value); });
    let alertIds: string[] = [];
    if (spec.fromRows && t) {
      // the alerts the widget shows: its source, its own condition, and what other widgets filter it by
      const cfg = { ...t.config, ...((actRef.current[t.id] || {}).cfg || {}) };
      let rows = hub.snapshot(sourceKey(cfg.query, cfg.filter)).rows;
      const conds = [cfg.where, ...(cfg.also || [])].filter((x): x is Cond => !!x && !!x.field && x.value !== '');
      const gate = cfg.followBar !== false ? barRef.current : undefined;
      rows = rows.filter(r => conds.every(x => matches(r, x)) && (!gate || gate.pass(cfg.query, r)));
      if (cfg.listens !== false) rows = applyFilters(rows, filtersRef.current.filter(f => f.from !== t.id && f.query === cfg.query));
      alertIds = rows.map(r => String(r.id)).filter(Boolean).slice(0, 1000);
      if (!alertIds.length) { setNotice({ kind: 'warning', text: `“${t.title}” shows no alerts, so nothing was sent.` }); return; }
    }
    const c = spec.call(v, alertIds);
    if (!window.confirm(`${c.summary}?\n\nThis changes data in Concert Operate.`)) return;
    hub.call(c.name, c.params).then(
      () => setNotice({ kind: 'info', text: `${c.summary}: done.` }),
      (err: any) => setNotice({ kind: 'error', text: `${c.summary} failed: ${err && err.message ? err.message : 'the server refused it'}` })
    );
  };
  const runAction = useCallback((l: ActionLink, value: string) => {
    if (l.to === PLATFORM_ID) { runPlatform(l, value); return; }
    const t = widgetsRef.current.find(x => x.id === l.to);
    if (!t) return;
    if (l.do.startsWith('api:')) { runPlatform(l, value, t); return; }
    const arg = fill(l.arg, value);
    const d = l.do, id = t.id;
    const patch = (fn: (cur: ActState[string]) => ActState[string]) => setAct(a => ({ ...a, [id]: fn(a[id] || {}) }));
    if (d === 'show' || d === 'hide') patch(c => ({ ...c, hidden: d === 'hide' }));
    else if (d === 'toggleVisible') patch(c => ({ ...c, hidden: !(c.hidden !== undefined ? c.hidden : t.config.hidden === true) }));
    else if (d === 'title') patch(c => ({ ...c, title: arg }));
    else if (d === 'set:text' && t.type === 'text') patch(c => ({ ...c, text: arg }));
    else if (d.startsWith('cfg:')) {
      const k = d.slice(4);
      if (k === 'where') {
        const i = arg.indexOf('=');
        patch(c => ({ ...c, cfg: { ...(c.cfg || {}), where: i > 0 ? { field: arg.slice(0, i).trim(), value: arg.slice(i + 1).trim() } : undefined } }));
      } else patch(c => ({ ...c, cfg: { ...(c.cfg || {}), [k]: coerce(argKind(t, d), arg) } }));
    }
    else if (d.startsWith('add:')) {
      const k = d.slice(4), spec = carbonSpec(t.type), base: Record<string, any> = { ...(spec ? carbonDefaults(spec) : {}), ...(t.config.props || {}) };
      patch(c => {
        const cur = Number(c.props && c.props[k] !== undefined ? c.props[k] : base[k]) || 0;
        let n = cur + (Number(arg) || 0);
        const mx = Number(c.props && c.props.max !== undefined ? c.props.max : base.max);
        if (k === 'value' && Number.isFinite(mx) && mx > 0) n = Math.min(n, mx);
        return { ...c, props: { ...(c.props || {}), [k]: Math.max(n, 0) } };
      });
    }
    else if (d === 'addValue') setValue(id, String((Number(valuesRef.current[id] !== undefined ? valuesRef.current[id] : inputDefault(t)) || 0) + (Number(arg) || 0)));
    else if (d.startsWith('set:')) { const k = d.slice(4), kind = argKind(t, d); patch(c => ({ ...c, props: { ...(c.props || {}), [k]: coerce(kind, arg) } })); }
    else if (d.startsWith('cmd:')) { const n = ++cmdN.current; patch(c => ({ ...c, props: { ...(c.props || {}), __cmd: { name: d.slice(4), arg, n } } })); }
    else if (d === 'value') setValue(id, arg);
    else if (d === 'clear' || d === 'off') setValue(id, '');
    else if (d === 'on') setValue(id, 'true');
    else if (d === 'flip') setValue(id, valuesRef.current[id] === 'true' ? '' : 'true');
    else if ((d === 'pick' || d === 'clearPick') && t.config.groupBy) {
      const picked = d === 'pick' && arg ? [arg] : [];
      setSelectionRaw(id, t.config.query, t.config.groupBy, picked);
      emitRef.current(id, 'select', picked.join(', '));
    }
  }, [setSelectionRaw]);
  const emit = useCallback((from: string, event: string, value = '') => {
    if (!viewingRef.current || depth.current > 3) return;
    const src = widgetsRef.current.find(x => x.id === from);
    if (!src || !src.config.on) return;
    const v = String(value);
    depth.current += 1;
    try {
      src.config.on.filter(l => l.event === event && (!l.when || l.when.trim().toLowerCase() === v.trim().toLowerCase())).forEach(l => runAction(l, v));
    } finally { depth.current -= 1; }
  }, [runAction]);
  emitRef.current = emit;
  const actApi = useMemo<ActionApi>(() => ({ emit }), [emit]);

  const links = useMemo(() => {
    const o: Record<string, string[] | undefined> = {};
    active.widgets.forEach(w => { if (w.config.sendTo) o[w.id] = w.config.sendTo; });
    return o;
  }, [active.widgets]);
  const binds = useMemo(
    () => active.widgets.filter(w => w.config.bind && w.config.sendTo && w.config.sendTo.length)
      .map(w => ({ id: w.id, bind: w.config.bind as NonNullable<Widget['config']['bind']>, sendTo: w.config.sendTo as string[], def: inputDefault(w) })),
    [active.widgets]
  );
  const [views, setViews] = useState<Record<string, SavedView[]>>(() => { try { return JSON.parse(window.localStorage.getItem('db-views') || '{}'); } catch (e) { return {}; } });
  const putViews = (id: string, fn: (l: SavedView[]) => SavedView[]) => setViews(all => {
    const next = { ...all, [id]: fn(all[id] || []) };
    try { window.localStorage.setItem('db-views', JSON.stringify(next)); } catch (e) { /* no storage */ }
    return next;
  });
  // People who only view a dashboard can still choose their own filter fields; kept in this browser, per dashboard.
  const [barOver, setBarOver] = useState<Record<string, Pick<FilterBarConfig, 'fields' | 'time'>>>(() => { try { return JSON.parse(window.localStorage.getItem('db-bar-fields') || '{}'); } catch (e) { return {}; } });
  const saveOver = (id: string, v: Pick<FilterBarConfig, 'fields' | 'time'> | undefined) => setBarOver(cur => {
    const next = { ...cur }; if (v) next[id] = v; else delete next[id];
    try { window.localStorage.setItem('db-bar-fields', JSON.stringify(next)); } catch (e) { /* no storage */ }
    return next;
  });
  const over = active.bar && !(editing && !readOnly) ? barOver[active.id] : undefined;
  const bar = useMemo(() => (active.bar && over ? { ...active.bar, fields: over.fields, time: over.time } : active.bar), [active.bar, over]);
  const barPreset = bar ? bar.preset : undefined;
  const barRefresh = bar ? bar.refresh : undefined;
  useEffect(() => {
    setBarSel({});
    setRange({ preset: barPreset || 'all' });
    setRefreshS(barRefresh || 0);
    setNow(Date.now());
  }, [active.id, barPreset, barRefresh]);
  useEffect(() => { setNow(Date.now()); }, [range]);
  useEffect(() => {
    if (!bar || refreshS <= 0) return undefined;
    const id = window.setInterval(() => { hub.refresh(); setNow(Date.now()); }, refreshS * 1000);
    return () => window.clearInterval(id);
  }, [bar, refreshS, hub]);
  const barGate = useMemo(() => (bar ? { key: JSON.stringify([barSel, range, bar.fields, bar.time, bar.timeField, range.preset === 'all' ? 0 : now]), pass: (q: QueryName, r: Row) => passes(bar, barSel, range, now, q, r) } : undefined), [bar, barSel, range, now]);
  barRef.current = barGate;
  const setBar = (next: FilterBarConfig | undefined) => setStore(st => ({ ...st, dashboards: st.dashboards.map(d => { if (d.id !== st.activeId) return d; const { bar: _old, ...rest } = d; return { ...rest, updated: Date.now(), ...(next ? { bar: next } : {}) }; }) }));

  const ctx: BuilderContext = useMemo(() => ({ hub, filters, links, values, setValue, binds, bar: barGate, drill: setDrillReq, toggleFilter, setSelection }), [hub, filters, links, values, setValue, binds, barGate, toggleFilter, setSelection]);

  /** After dropping at an exact spot: push whatever it landed on out of the way, within its own panel. */
  const settle = (list: Widget[], id: string): Widget[] => {
    const me = list.find(x => x.id === id);
    if (!me) return list;
    const key = me.parent || '';
    const sib = moveItem(list.filter(x => (x.parent || '') === key), id, me.x, me.y);
    const by = new Map(sib.map(x => [x.id, x]));
    return list.map(x => by.get(x.id) || x);
  };

  const addWidget = (type: Widget['type'], title?: string, size?: { w: number; h: number }, parent?: string, cell?: { x: number; y: number } | null) => {
    const def = NATIVE.find(n => n.type === type);
    const tile = TILES.find(t => `tile:${t.id}` === type);
    const cd = CARBON.find(c => `carbon:${c.name}` === type);
    const w = size ? size.w : def ? def.w : tile ? tile.w : cd ? cd.w : 4;
    const h = size ? size.h : def ? def.h : tile ? tile.h : cd ? cd.h : 4;
    const spot = cell || findSpot(active.widgets.filter(x => (x.parent || undefined) === parent), w, h);
    const widget: Widget = { id: newId('w'), type, title: title || defaultTitle(type), x: spot.x, y: spot.y, w, h, config: defaultConfig(type), ...(parent ? { parent } : {}) };
    setWidgets(cell ? settle([...active.widgets, widget], widget.id) : [...active.widgets, widget]);
    setSelectedId(widget.id);
  };

  const removeWidget = (id: string) => {
    // Everything inside it goes too, and nothing keeps pointing at what was removed.
    const gone = subtreeIds(active.widgets, id);
    setWidgets(active.widgets.filter(w => !gone.has(w.id)).map(w => (w.config.sendTo && w.config.sendTo.some(t => gone.has(t)) ? { ...w, config: { ...w.config, sendTo: w.config.sendTo.filter(t => !gone.has(t)) } } : w)));
    setFilters(fs => fs.filter(f => !gone.has(f.from)));
    if (selectedId && gone.has(selectedId)) setSelectedId(null);
  };

  const duplicateWidget = (id: string) => {
    const src = active.widgets.find(w => w.id === id);
    if (!src) return;
    const c = cloneSubtree(active.widgets, id, newId);
    if (!c) return;
    const spot = findSpot(active.widgets.filter(x => (x.parent || undefined) === (src.parent || undefined)), src.w, src.h);
    setWidgets([...active.widgets, ...c.all.map(w => (w.id === c.root.id ? { ...w, title: `${src.title} (copy)`, x: spot.x, y: spot.y } : w))]);
    setSelectedId(c.root.id);
  };

  /** Moves a widget (and what is inside it) into a panel, or back to the top level when `slot` is empty. */
  const moveTo = (id: string, slot: string, cell?: { x: number; y: number } | null) => {
    const w = active.widgets.find(x => x.id === id);
    if (!w || (slot && subtreeIds(active.widgets, id).has(slotOwner(slot)))) return;
    const spot = cell || findSpot(active.widgets.filter(x => x.id !== id && (x.parent || undefined) === (slot || undefined)), w.w, w.h);
    const moved = active.widgets.map(x => {
      if (x.id !== id) return x;
      const { parent: _old, ...rest } = x;
      return { ...rest, x: spot.x, y: spot.y, ...(slot ? { parent: slot } : {}) };
    });
    setWidgets(cell ? settle(moved, id) : moved);
    setSelectedId(id);
  };

  const updateWidget = (next: Widget, key: string) => {
    const { minW, minH } = minSize(next.type);
    setWidgets(active.widgets.map(w => (w.id === next.id ? { ...next, w: Math.max(next.w, minW), h: Math.max(next.h, minH) } : w)), key);
    // Changing what a widget is bound to makes its old selections meaningless.
    const old = active.widgets.find(w => w.id === next.id);
    if (old && (old.config.query !== next.config.query || old.config.groupBy !== next.config.groupBy)) {
      setFilters(fs => fs.filter(f => f.from !== next.id));
    }
  };

  /* ── dashboards: switch / new / copy / rename / delete / import / export ── */
  const switchTo = (id: string) => {
    setStore(s => ({ ...s, activeId: id }));
    setSelectedId(null);
    setFilters([]);
    setConfirmDelete(false);
    setRenaming(false);
    resetHistory();
  };

  useEffect(() => {
    const on = (e: Event) => {
      const a = (e as CustomEvent).detail;
      if (a === 'tour') setTour(true);
      else if (a === 'templates') { setEditing(true); setPick(true); }
    };
    window.addEventListener('db-ui', on);
    return () => window.removeEventListener('db-ui', on);
  }, []);

  const applyTemplate = (t: TemplateDef) => {
    if (t.id === 'blank') {
      if (active.widgets.length) setWidgets([]);
      setBlank(b => (b.includes(active.id) ? b : [...b, active.id]));
      setPick(false);
      setEditing(true);
      return;
    }
    setWidgets(fitHeights(t.build(), t.rowH));
    if (t.bar) setBar(t.bar);
    setStore(st => ({ ...st, dashboards: st.dashboards.map(x => { if (x.id !== st.activeId) return x; const { rowH: _r, ...rest } = x; return t.rowH ? { ...rest, rowH: t.rowH } : rest; }) }));
    setPick(false);
    setEditing(true);
    if (!authoring && /^New dashboard$/.test(active.name)) rename(t.name);
    setSelectedId(null);
  };
  const newDashboard = () => {
    const d: Dashboard = { id: newId('d'), name: 'New dashboard', updated: Date.now(), widgets: [] };
    setStore(s => ({ ...s, dashboards: [...s.dashboards, d], activeId: d.id }));
    setEditing(true);
    setRenaming(true);
    setSelectedId(null);
    setFilters([]);
    resetHistory();
  };

  const copyDashboard = () => {
    const d = cloneDashboard(active);
    setStore(s => ({ ...s, dashboards: [...s.dashboards, d], activeId: d.id }));
    setSelectedId(null);
    setFilters([]);
    resetHistory();
  };

  const rename = (name: string) => setStore(s => ({ ...s, dashboards: s.dashboards.map(d => (d.id === active.id ? { ...d, name: name.slice(0, 80), updated: Date.now() } : d)) }));

  const deleteDashboard = () => {
    if (store.dashboards.length <= 1) {
      // Never leave the user with nothing: an emptied dashboard replaces the last one.
      const d: Dashboard = { id: newId('d'), name: 'New dashboard', updated: Date.now(), widgets: [] };
      setStore({ ...store, dashboards: [d], activeId: d.id });
    } else {
      const rest = store.dashboards.filter(d => d.id !== active.id);
      setStore({ ...store, dashboards: rest, activeId: rest[0].id });
    }
    setConfirmDelete(false);
    setSelectedId(null);
    setFilters([]);
    resetHistory();
  };

  const doExport = () => {
    try {
      const blob = new Blob([exportJson(active)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${active.name.replace(/[^\w.-]+/g, '-').toLowerCase() || 'dashboard'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setNotice({ kind: 'error', text: 'The browser blocked the download.' });
    }
  };

  const doImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = importJson(String(reader.result || ''));
      if ('error' in r) {
        setNotice({ kind: 'error', text: r.error });
        return;
      }
      setStore(s => ({ ...s, dashboards: [...s.dashboards, r.dashboard], activeId: r.dashboard.id }));
      setSelectedId(null);
      setFilters([]);
      resetHistory();
      setNotice({
        kind: r.dropped ? 'warning' : 'info',
        text: `Imported “${r.dashboard.name}” (${r.dashboard.widgets.length} widgets).${r.dropped ? ` ${r.dropped} item${r.dropped === 1 ? '' : 's'} could not be used and were left out.` : ''}`
      });
    };
    reader.onerror = () => setNotice({ kind: 'error', text: 'The file could not be read.' });
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasShared = useMemo(() => sharedDashboard(DEFAULT_LAYOUT) !== null, []);
  const addShared = () => {
    const d = sharedDashboard(DEFAULT_LAYOUT);
    if (!d) return;
    setStore(s => ({ ...s, dashboards: [...s.dashboards, d], activeId: d.id }));
    setSelectedId(null);
    setFilters([]);
    resetHistory();
    setNotice({ kind: 'info', text: `Added a copy of the shared layout “${d.name}”.` });
  };

  const refreshAll = () => hub.refresh();
  const h = historyRef.current;
  const isEditing = editing && !readOnly;
  const showStart = isEditing && (pick || (active.widgets.length === 0 && !blank.includes(active.id)));
  const startedTour = useRef(false);
  useEffect(() => {
    if (showStart && !startedTour.current && !tourSeen()) { startedTour.current = true; setTour(true); }
  }, [showStart]);


  const filterChips = filters.map(f => {
    const from = active.widgets.find(w => w.id === f.from);
    return { f, label: `${fieldLabel(f.query, f.field)}: ${f.value}`, from: from ? from.title : '' };
  });

  const renderBody = useCallback((w: Widget) => <MemoBody w={w} />, []);
  const wired = useMemo(() => wiredIds(active.widgets, selected), [active.widgets, selected]);
  const dnd: Dnd = {
    canDrop: (src, slot, depth) => {
      if (src.id) {
        const w = active.widgets.find(x => x.id === src.id);
        if (!w || (slot && subtreeIds(active.widgets, w.id).has(slotOwner(slot)))) return false;
        return !(isContainer(w) && depth >= MAX_DEPTH);
      }
      return !(src.type && isContainerType(src.type) && depth >= MAX_DEPTH);
    },
    drop: (src, slot, cell) => {
      if (src.id) moveTo(src.id, slot, cell);
      else if (src.type) addWidget(src.type as Widget['type'], undefined, undefined, slot || undefined, cell);
    }
  };
  const nest: NestApi = {
    widgets: active.widgets, editing: isEditing, selectedId, rowH: active.rowH, wired, renderBody,
    onSelect: setSelectedId, setAll: next => setWidgets(next), onRemove: removeWidget, onDuplicate: duplicateWidget,
    addTo: (slot, type) => addWidget(type as Widget['type'], undefined, undefined, slot),
    dnd
  };
  const inside = selected ? subtreeIds(active.widgets, selected.id) : new Set<string>();
  const slots = slotsOf(active.widgets).filter(s => !inside.has(s.owner));

  // Keyboard shortcuts while editing. One window listener that always calls the latest closure.
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keysRef.current = (e: KeyboardEvent) => {
    if (!isEditing || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && k === 'y') { e.preventDefault(); redo(); }
    else if (mod && k === 'd' && selected) { e.preventDefault(); duplicateWidget(selected.id); }
    else if (!mod && k === 'w') { e.preventDefault(); setWireMode(m => !m); }
    else if (!mod && e.key === '/') { e.preventDefault(); setTab('add'); window.setTimeout(() => { if (searchRef.current) searchRef.current.focus(); }, 0); }
    else if (!mod && e.key === 'Delete' && selected) { e.preventDefault(); removeWidget(selected.id); }
    else if (!mod && e.key === 'Escape' && selected) { setSelectedId(null); }
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const sections: LibSection[] = [
    {
      id: 'data', cluster: 'Widgets', title: 'Data and content',
      items: NATIVE.map(n => ({ key: n.type, type: n.type, label: n.label, description: n.description, onAdd: () => addWidget(n.type), w: n.w }))
    },
    ...GROUPS.map(g => ({
      id: `c-${g}`, cluster: 'Carbon components', title: g,
      items: CARBON.filter(c => c.group === g).map(c => ({ key: c.name, type: `carbon:${c.name}`, label: c.label, description: c.description, onAdd: () => addWidget(`carbon:${c.name}`, c.label, c), w: c.w }))
    })),
    {
      id: 'tiles', cluster: 'Your dashboards', title: 'Existing dashboards',
      items: TILES.map(t => ({ key: t.id, type: `tile:${t.id}`, label: t.label, description: t.description, onAdd: () => addWidget(`tile:${t.id}`, t.label, t), w: t.w }))
    }
  ];

  const saveText = authoring ? (authoring.status || 'Saved by Studio') : fixed ? 'Published layout' : saveFailed ? 'Not saved in this browser' : pending ? 'Saving…' : 'Saved in this browser';
  const saveState_ = authoring ? 'ok' : fixed ? 'fixed' : saveFailed ? 'bad' : pending ? 'wait' : 'ok';

  return (
    <ActionCtx.Provider value={actApi}><BuilderCtx.Provider value={ctx}>
      <NestCtx.Provider value={nest}>
      <div className={`dashboard-builder-container db-shell${isEditing ? ' is-editing' : ''}`}>
        <header className="db-bar-top">
          <div className="db-title">
            {authoring ? (
              <span className="db-tb db-name"><span className="db-name-text">{active.name}</span></span>
            ) : renaming && isEditing ? (
              <input
                className="db-name-input"
                aria-label="Dashboard name"
                value={active.name}
                autoFocus
                onFocus={e => e.target.select()}
                onChange={e => rename(e.target.value)}
                onBlur={() => setRenaming(false)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setRenaming(false); }}
              />
            ) : (
              <Menu
                trigger={({ open, toggle }) => (
                  <button type="button" className={`db-tb db-name${open ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setConfirmDelete(false); toggle(); }} onDoubleClick={() => { if (isEditing) setRenaming(true); }}>
                    <span className="db-name-text">{active.name}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                )}
              >
                {close => (
                  <>
                    <div className="db-pop-label">Dashboards</div>
                    {store.dashboards.map(d => (
                      <button key={d.id} type="button" role="menuitemradio" aria-checked={d.id === active.id} className="db-pop-item" onClick={() => { switchTo(d.id); close(); }}>
                        <span className="db-pop-check">{d.id === active.id && <Checkmark size={16} aria-hidden="true" />}</span>
                        <span className="db-pop-text">{d.name}</span>
                        <span className="db-pop-meta">{d.widgets.length}</span>
                      </button>
                    ))}
                    {!readOnly && (
                      <>
                        <div className="db-pop-sep" />
                        <button type="button" role="menuitem" className="db-pop-item" onClick={() => { newDashboard(); close(); }}><span className="db-pop-check"><Add size={16} aria-hidden="true" /></span><span className="db-pop-text">New dashboard</span></button>
                        <button type="button" role="menuitem" className="db-pop-item" onClick={() => { copyDashboard(); close(); }}><span className="db-pop-check"><Copy size={16} aria-hidden="true" /></span><span className="db-pop-text">Duplicate “{active.name}”</span></button>
                        <button type="button" role="menuitem" className="db-pop-item" onClick={() => { setEditing(true); setRenaming(true); close(); }}><span className="db-pop-check" /><span className="db-pop-text">Rename</span></button>
                        {confirmDelete ? (
                          <div className="db-pop-confirm">
                            <span>Delete “{active.name}”? This can’t be undone.</span>
                            <span>
                              <button type="button" role="menuitem" className="db-pop-btn danger" onClick={() => { deleteDashboard(); close(); }}>Delete</button>
                              <button type="button" role="menuitem" className="db-pop-btn" onClick={() => setConfirmDelete(false)}>Keep</button>
                            </span>
                          </div>
                        ) : (
                          <button type="button" role="menuitem" className="db-pop-item danger" onClick={() => setConfirmDelete(true)}><span className="db-pop-check"><TrashCan size={16} aria-hidden="true" /></span><span className="db-pop-text">Delete dashboard…</span></button>
                        )}
                      </>
                    )}
                  </>
                )}
              </Menu>
            )}
            <span className="db-version" title="Dashboard Designer version">{VERSION}</span>
          </div>

          {isEditing && (
            <div className="db-tools">
              <button type="button" className="db-tb icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={h.past.length === 0} onClick={undo}><Undo size={16} /></button>
              <button type="button" className="db-tb icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={h.future.length === 0} onClick={redo}><Redo size={16} /></button>
              <button type="button" data-tour="wire" className={`db-tb${wireMode ? ' is-on' : ''}`} aria-pressed={wireMode} title="Wire mode (W): drag from a widget's port to the widgets it should filter" onClick={() => setWireMode(m => !m)}>
                <Connect size={16} aria-hidden="true" />Wire
              </button>
              <button type="button" className={`db-tb${flows !== undefined ? ' is-on' : ''}`} title="Action flows: what happens when people click, change or pick something" onClick={() => setFlows(selected ? selected.id : null)}>
                <Flow size={16} aria-hidden="true" />Flows
              </button>
              <span className="db-sep" />
              <FilterBarSettings bar={bar} onChange={setBar} />
              <button type="button" className="db-tb" data-tour="templates" title="Start from a template" onClick={() => setPick(true)}>
                <Template size={16} aria-hidden="true" />Templates
              </button>
              <button type="button" className="db-tb" title="Find a widget to add (/)" onClick={() => { setTab('add'); window.setTimeout(() => { if (searchRef.current) searchRef.current.focus(); }, 0); }}>
                <Add size={16} aria-hidden="true" />Add widget
              </button>
            </div>
          )}

          <div className="db-tools db-tools--end">
            {!isEditing && (
              <ViewsMenu
                views={views[baseActive.id] || []}
                onSave={name => putViews(baseActive.id, l => [...l.filter(v => v.name !== name), { name, state: { sel: barSel, range, refresh: refreshS, fields: barOver[baseActive.id], links: linkOver[baseActive.id] } }])}
                onApply={v => {
                  setBarSel(v.state.sel || {}); setRange((v.state.range as Range) || { preset: 'all' }); setRefreshS(Number(v.state.refresh) || 0);
                  saveOver(baseActive.id, v.state.fields as Pick<FilterBarConfig, 'fields' | 'time'> | undefined);
                  saveLinks(baseActive.id, () => (v.state.links as LinkOver[string] | undefined));
                }}
                onDelete={name => putViews(baseActive.id, l => l.filter(v => v.name !== name))}
                onImport={v => putViews(baseActive.id, l => [...l.filter(x => x.name !== v.name), v])}
              />
            )}
            {!isEditing && active.widgets.length > 0 && (
              <button type="button" className={`db-tb${resizeMode ? ' is-on' : ''}`} aria-pressed={resizeMode} title="Arrange widgets: drag a widget by its title to move it, drag its corner to resize it (only for you)" onClick={() => setResizeMode(m => !m)}>
                {resizeMode ? 'Done arranging' : 'Arrange widgets'}
              </button>
            )}
            {!isEditing && lo && <button type="button" className="db-tb" title="Back to the links and sizes this dashboard was saved with" onClick={() => saveLinks(baseActive.id, () => undefined)}>Reset changes</button>}
            {!isEditing && active.widgets.some(canSend) && (
              <>
                <button type="button" className={`db-tb${linkMode ? ' is-on' : ''}`} aria-pressed={linkMode} title="Link widgets: choose which charts and filters change which widgets (only for you)" onClick={() => setLinkMode(m => !m)}>
                  <Connect size={16} aria-hidden="true" />{linkMode ? 'Done linking' : 'Link widgets'}
                </button>
              </>
            )}
            {!readOnly && <button type="button" className="db-tb" title="Take the 1-minute tour" aria-label="Take the tour" onClick={() => setTour(true)}><Help size={16} aria-hidden="true" />Tour</button>}
            <button type="button" className="db-tb icon" title="Refresh data" aria-label="Refresh data" onClick={refreshAll}><Renew size={16} /></button>
            <Menu align="right" trigger={({ open, toggle }) => (
              <button type="button" className={`db-tb icon${open ? ' is-on' : ''}`} title="More" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><OverflowMenuVertical size={16} /></button>
            )}>
              {close => (
                <>
                  {!readOnly && <button type="button" role="menuitem" className="db-pop-item" onClick={() => { setTour(true); close(); }}><span className="db-pop-check"><Help size={16} aria-hidden="true" /></span><span className="db-pop-text">Take the tour</span></button>}
                  <button type="button" role="menuitem" className="db-pop-item" onClick={() => { doExport(); close(); }}><span className="db-pop-check"><Download size={16} aria-hidden="true" /></span><span className="db-pop-text">Export as JSON</span></button>
                  {!readOnly && !authoring && <button type="button" role="menuitem" className="db-pop-item" onClick={() => { if (fileRef.current) fileRef.current.click(); close(); }}><span className="db-pop-check"><Upload size={16} aria-hidden="true" /></span><span className="db-pop-text">Import JSON</span></button>}
                  {!readOnly && !authoring && hasShared && <button type="button" role="menuitem" className="db-pop-item" onClick={() => { addShared(); close(); }}><span className="db-pop-check"><Copy size={16} aria-hidden="true" /></span><span className="db-pop-text">Add the shared layout</span></button>}
                </>
              )}
            </Menu>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => doImport(e.target.files ? e.target.files[0] : undefined)} />
 {readOnly ? (
              <span className="db-badge" title="This layout is fixed. Make a copy to change it.">Read only</span>
            ) : (
              <div className="db-seg" role="group" aria-label="Mode" data-tour="mode">
                <button type="button" aria-pressed={!isEditing} onClick={() => { setEditing(false); setSelectedId(null); }}>Preview</button>
                <button type="button" aria-pressed={isEditing} onClick={() => setEditing(true)}>Edit</button>
              </div>
            )}
          </div>
        </header>

        {(saveFailed || notice) && (
          <div className="db-notes">
            {saveFailed && (
              <InlineNotification kind="warning" lowContrast hideCloseButton title="Not saved in this browser." subtitle="Storage is blocked or full. Use Export to keep your work." />
            )}
            {notice && (
              <InlineNotification kind={notice.kind} lowContrast title={notice.text} onCloseButtonClick={() => setNotice(null)} />
            )}
          </div>
        )}

        {filterChips.length > 0 && (
          <div className="db-filters" role="status" aria-label="Active filters">
            <span>Filtering by</span>
            {filterChips.map(({ f, label, from }) => (
              <button key={`${f.from}-${f.field}-${f.value}`} type="button" className="db-chip" title={from ? `Set from ${from}. Click to remove.` : 'Click to remove'} onClick={() => toggleFilter(f.from, f.query, f.field, f.value)}>
                {label} ×
              </button>
            ))}
            <button type="button" className="db-link" onClick={() => setFilters([])}>Clear all</button>
          </div>
        )}

        {bar && (
          <FilterBar
            bar={bar}
            hub={hub}
            sel={barSel}
            onSel={(k, v) => setBarSel(cur => ({ ...cur, [k]: v }))}
            range={range}
            onRange={setRange}
            refresh={refreshS}
            onRefresh={setRefreshS}
            onClear={() => { setBarSel({}); setRange({ preset: 'all' }); }}
            extra={(
              <div className="db-fb-field db-fb-fields">
                <Menu align="right" trigger={({ open, toggle: t }) => (
                  <button type="button" className={`db-fb-btn${open || over ? ' is-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} title="Add or remove filters on this bar" onClick={t}>
                    <Add size={16} aria-hidden="true" />Add or remove filters
                  </button>
                )}>
                  {() => <FilterFieldsMenu bar={bar} changed={Boolean(over)}
                    onChange={b => (isEditing ? setBar(b) : saveOver(active.id, { fields: b.fields, time: b.time }))}
                    onReset={() => saveOver(active.id, undefined)} />}
                </Menu>
              </div>
            )}
          />
        )}

        {linkMode && !isEditing && <p className="db-linkhint" role="status"><strong>Linking.</strong> Drag from the dot on a chart or choice to the widgets it should filter; click a line to cut it. The <em>Filter bar</em> chip on a widget switches whether it follows the bar above. Only you see these changes.</p>}
        <div className={`db-body${isEditing ? ' is-editing' : ''}`}>
          {isEditing && (
            <aside className="db-dock db-dock--left" aria-label="Widget library" data-tour="library">
              <div className="db-dock-in">
              <Library
                sections={sections}
                widgets={active.widgets}
                selectedId={selectedId}
                tab={tab}
                onTab={setTab}
                searchRef={searchRef}
                onSelect={setSelectedId}
                onDuplicate={duplicateWidget}
                onRemove={removeWidget}
                onWire={updateWidget}
              />
              </div>
            </aside>
          )}
          <LinkCtx.Provider value={linkApi}>
          <div className="db-stage" ref={stageRef} data-tour="canvas">
            {showStart && <StartScreen replace={active.widgets.length > 0} onPick={applyTemplate} onBlank={() => { setPick(false); setBlank(b => [...b, active.id]); }} onTour={() => setTour(true)} />}
            <GridCanvas
              widgets={active.widgets.filter(w => !w.parent)}
              wired={wired}
              rowH={active.rowH}
              editing={isEditing}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onLayout={next => setWidgets([...next, ...active.widgets.filter(w => w.parent)])}
              onRemove={removeWidget}
              onDuplicate={duplicateWidget}
              renderBody={renderBody}
            />
            <WireLayer
              stageRef={stageRef}
              widgets={active.widgets}
              filters={filters}
              values={values}
              wireMode={(wireMode && isEditing) || (linkMode && !isEditing)}
              selectedId={selectedId}
              onSendTo={(id, sendTo) => { if (!isEditing) { runtimeSend(id, sendTo); return; } const w = active.widgets.find(x => x.id === id); if (w) { const cfg = { ...w.config }; if (sendTo === undefined) delete cfg.sendTo; else cfg.sendTo = sendTo; updateWidget({ ...w, config: cfg }, `${id}:sendTo`); } }}
              onBindOp={(id, op) => { if (!isEditing) return; const w = active.widgets.find(x => x.id === id); if (w && w.config.bind) updateWidget({ ...w, config: { ...w.config, bind: { ...w.config.bind, op } } }, `${id}:op`); }}
              onNotice={text => setNotice({ kind: 'info', text })}
              passive={isEditing}
              wireKind={isEditing ? wireKind : 'data'}
              onWireKind={isEditing ? setWireKind : undefined}
              onActions={isEditing ? (id, on) => { const w = active.widgets.find(x => x.id === id); if (w) { const cfg = { ...w.config }; if (on && on.length) cfg.on = on; else delete cfg.on; updateWidget({ ...w, config: cfg }, `${id}:on`); } } : undefined}
            />
          </div>
          </LinkCtx.Provider>
          {isEditing && (
            <aside className={`db-dock db-dock--right${selected ? '' : ' db-dock--idle'}`} aria-label="Settings" data-tour="settings">
              <div className="db-dock-in">
              {selected ? (
                <Inspector widget={selected} barOn={Boolean(bar)} everyone={active.widgets} slots={slots} onMove={moveTo} onFlows={id => setFlows(id)} onChange={updateWidget} partsFor={authoring ? authoring.partsFor : undefined} onClose={() => setSelectedId(null)} />
              ) : (
                <div className="db-rest">
                  <h2>Nothing selected</h2>
                  <p>Click a widget on the canvas, or pick one under Layers, to change its data and look.</p>
                  <dl className="db-keys">
                    <div><dt><kbd>/</kbd></dt><dd>Search widgets</dd></div>
                    <div><dt><kbd>Ctrl</kbd><kbd>Z</kbd></dt><dd>Undo</dd></div>
                    <div><dt><kbd>Ctrl</kbd><kbd>D</kbd></dt><dd>Duplicate the selected widget</dd></div>
                    <div><dt><kbd>Del</kbd></dt><dd>Remove the selected widget</dd></div>
                    <div><dt><kbd>←↑↓→</kbd></dt><dd>Move it one cell</dd></div>
                    <div><dt><kbd>Shift</kbd><kbd>←↑↓→</kbd></dt><dd>Resize it one cell</dd></div>
                  </dl>
                </div>
              )}
              </div>
            </aside>
          )}
        </div>

        {drillReq && <DrillDrawer req={drillReq} onClose={() => setDrillReq(null)} />}

        <footer className="db-status">
          <span className={`db-save db-save--${saveState_}`}><i aria-hidden="true" />{saveText}</span>
          <span>{active.widgets.length} widget{active.widgets.length === 1 ? '' : 's'}</span>
          {filters.length > 0 && <span>{filters.length} filter{filters.length === 1 ? '' : 's'} active</span>}
          <span className="db-status-fill" />
          {isEditing && selected && (
            <span className="db-status-sel"><Glyph type={selected.type} size={16} />{typeLabel(selected.type)}<code>x {selected.x} · y {selected.y} · {selected.w}×{selected.h}</code></span>
          )}
        </footer>
        {isEditing && flows !== undefined && <ActionStudio widgets={active.widgets} focus={flows} onWidgets={setWidgets} onClose={() => setFlows(undefined)} />}
      </div>
      {tour && <Tour onClose={() => setTour(false)} />}
      </NestCtx.Provider>
    </BuilderCtx.Provider></ActionCtx.Provider>
  );
}
