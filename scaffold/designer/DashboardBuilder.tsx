/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dashboard designer: build a page from widgets bound to live AIOps queries and from the toolkit's existing
 * panels, arrange it by dragging and resizing, link widgets by clicking, and save it in this browser or as JSON.
 *
 * This component holds the dashboards and puts the page together. The parts live in their own modules:
 * - TopBar.tsx: the switcher, design tools, viewer tools and the More menu
 * - history.ts: undo and redo
 * - overrides.ts: what a viewer changed for themselves (links, pivots, View as, arranged sizes, action effects)
 * - action-runner.ts: running action wires while a dashboard is used
 * - filter-bar-state.ts: the filter bar's choices, time range and refresh
 * - library-sections.ts, dashboard-files.ts: the widget library's contents; export and import
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InlineNotification } from '@carbon/react';
import { Add } from '@carbon/icons-react';
import './dashboard-builder.scss';
import { Dashboard, Filter, FilterBarConfig, QueryName, Row, Widget } from './types';
import { ActionApi, ActionCtx } from './actions';
import Library, { DockTab } from './Library';
import Menu from './Menu';
import { Glyph } from './Glyph';
import { typeLabel } from './meta';
import { DataHub } from './datahub';
import { BuilderCtx, BuilderContext } from './context';
import { findSpot, fitHeights, moveItem, titleBand } from './grid';
import { defaultConfig, defaultTitle, minSize, NATIVE, TILES } from './registry';
import { CARBON } from './carbon-catalog';
import { cloneDashboard, loadState, newId, saveState, sharedDashboard, StoreState } from './store';
import { fieldLabel } from './rows';
import GridCanvas, { tintStyle } from './GridCanvas';
import { LinkCtx, NestApi, NestCtx } from './nest';
import { MAX_DEPTH, cloneSubtree, isContainer, isContainerType, slotOwner, slotsOf, subtreeIds } from './nesting';
import { Dnd } from './dnd';
import { canSend, wiredIds } from './Wiring';
import WireLayer from './WireLayer';
import { ViewState } from './ViewsMenu';
import StartScreen from './StartScreen';
import FilterBar, { Range } from './FilterBar';
import { FilterFieldsMenu } from './FilterFields';
import Tour, { tourSeen } from './Tour';
import { Template as TemplateDef } from './templates';
import DrillDrawer from './DrillDrawer';
import { DrillRequest, urlFilters } from './drill';
import { inputDefault } from './bindings';
import Inspector from './Inspector';
import ActionStudio from './ActionStudio';
import ApiCheck from './ApiCheck';
import { WidgetBody } from './Widgets';
import { DEFAULT_LAYOUT } from './default-layout';
import TopBar from './TopBar';
import { useHistory } from './history';
import { ActState, DashOver, useViewerOverrides } from './overrides';
import { Notice, useActionRunner } from './action-runner';
import { BarFields, useFilterBarState } from './filter-bar-state';
import { librarySections } from './library-sections';
import { downloadDashboard, readDashboardFile } from './dashboard-files';

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

export default function DashboardBuilder(props: Props) {
  // `layout` = a fixed, published layout (from Concert Workbench): shown read-only, never touches this browser's saved dashboards.
  const authoring = props.authoring || null;
  const fixed = useMemo(() => (!authoring && props.layout ? sharedDashboard(props.layout) : null), [props.layout, authoring]);
  const readOnly = !authoring && (Boolean(props.readOnly) || fixed !== null);
  const [store, setStore] = useState<StoreState>(() =>
    authoring ? { version: 1, activeId: authoring.dashboard.id, dashboards: [authoring.dashboard] } :
      fixed ? { version: 1, activeId: fixed.id, dashboards: [fixed] } : loadState());
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
  const [apiCheck, setApiCheck] = useState(false);
  const [tour, setTour] = useState(false);
  const [pick, setPick] = useState(false);
  const [blank, setBlank] = useState<string[]>([]);
  const [drillReq, setDrillReq] = useState<DrillRequest | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [act, setAct] = useState<ActState>({});
  const setValue = useCallback((id: string, v: string) => setValues(o => (o[id] === v ? o : { ...o, [id]: v })), []);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [resizeMode, setResizeMode] = useState(false);

  const hub = useMemo(() => new DataHub(undefined, props.tenantId || undefined), [props.tenantId]);

  const baseActive: Dashboard = store.dashboards.find(d => d.id === store.activeId) || store.dashboards[0];
  const isEditing = editing && !readOnly;
  const viewing = !isEditing;
  const { active, lo, linkOver, saveLinks, runtimeSend, linkApi } = useViewerOverrides(baseActive, viewing, act, { link: linkMode, resize: resizeMode });
  useEffect(() => { setAct({}); }, [baseActive.id, viewing]);
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

  const history = useHistory(store, setStore);
  const { setWidgets, undo, redo } = history;
  const resetHistory = history.reset;

  /* ── click filters: a chart or a choice selects values; the widgets it sends to follow ── */
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
  const setSelectionRaw = useCallback((from: string, query: QueryName, field: string, vals: string[]) => {
    setFilters(fs => [...fs.filter(f => !(f.from === from && f.field === field)), ...vals.map(value => ({ from, query, field, value }))]);
  }, []);
  const setSelection = useCallback((from: string, query: QueryName, field: string, vals: string[]) => {
    setSelectionRaw(from, query, field, vals);
    emitRef.current(from, 'select', vals.join(', '));
  }, [setSelectionRaw]);

  /* ── the filter bar ── */
  const { bar, over, barOver, saveOver, sel: barSel, setSel: setBarSel, range, setRange, refreshS, setRefreshS, gate: barGate } = useFilterBarState(active, isEditing, hub);
  const barRef = useRef<{ pass: (q: QueryName, r: Row) => boolean } | undefined>(undefined);
  barRef.current = barGate;
  const setBar = (next: FilterBarConfig | undefined) => setStore(st => ({ ...st, dashboards: st.dashboards.map(d => { if (d.id !== st.activeId) return d; const { bar: _old, ...rest } = d; return { ...rest, updated: Date.now(), ...(next ? { bar: next } : {}) }; }) }));

  /* ── action wires ── */
  const actApi = useActionRunner({ hub, widgets: baseActive.widgets, viewing, act, setAct, values, setValue, setSelectionRaw, filtersRef, barRef, emitRef, setNotice });

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
  const ctx: BuilderContext = useMemo(() => ({ hub, filters, links, values, setValue, binds, bar: barGate, drill: setDrillReq, toggleFilter, setSelection }), [hub, filters, links, values, setValue, binds, barGate, toggleFilter, setSelection]);

  /* ── widgets: add / remove / duplicate / move / change ── */
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
  /** Another dashboard is showing: nothing selected, no filters, no undo steps from the last one. */
  const fresh = () => { setSelectedId(null); setFilters([]); resetHistory(); };
  const switchTo = (id: string) => {
    setStore(s => ({ ...s, activeId: id }));
    setConfirmDelete(false);
    setRenaming(false);
    fresh();
  };

  // The host page can open the tour or the templates (Workbench menu).
  useEffect(() => {
    const on = (e: Event) => {
      const a = (e as CustomEvent).detail;
      if (a === 'tour') setTour(true);
      else if (a === 'templates') { setEditing(true); setPick(true); }
    };
    window.addEventListener('db-ui', on);
    return () => window.removeEventListener('db-ui', on);
  }, []);

  const rename = (name: string) => setStore(s => ({ ...s, dashboards: s.dashboards.map(d => (d.id === active.id ? { ...d, name: name.slice(0, 80), updated: Date.now() } : d)) }));

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
    fresh();
  };

  const copyDashboard = () => {
    const d = cloneDashboard(active);
    setStore(s => ({ ...s, dashboards: [...s.dashboards, d], activeId: d.id }));
    fresh();
  };

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
    fresh();
  };

  const doExport = () => {
    try { downloadDashboard(active); } catch (e) { setNotice({ kind: 'error', text: 'The browser blocked the download.' }); }
  };

  const doImport = (file: File | undefined) => {
    if (!file) return;
    readDashboardFile(file, r => {
      if ('error' in r) { setNotice({ kind: 'error', text: r.error }); return; }
      setStore(s => ({ ...s, dashboards: [...s.dashboards, r.dashboard], activeId: r.dashboard.id }));
      fresh();
      setNotice({
        kind: r.dropped ? 'warning' : 'info',
        text: `Imported “${r.dashboard.name}” (${r.dashboard.widgets.length} widgets).${r.dropped ? ` ${r.dropped} item${r.dropped === 1 ? '' : 's'} could not be used and were left out.` : ''}`
      });
    });
  };

  const hasShared = useMemo(() => sharedDashboard(DEFAULT_LAYOUT) !== null, []);
  const addShared = () => {
    const d = sharedDashboard(DEFAULT_LAYOUT);
    if (!d) return;
    setStore(s => ({ ...s, dashboards: [...s.dashboards, d], activeId: d.id }));
    fresh();
    setNotice({ kind: 'info', text: `Added a copy of the shared layout “${d.name}”.` });
  };

  /* ── the page ── */
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
  // While viewing, the title band sits above the filters; the grid below starts where the band ended.
  const band = isEditing ? undefined : titleBand(active.widgets);
  const gridWidgets = useMemo(() => {
    const top = active.widgets.filter(w => !w.parent);
    return band ? top.filter(w => w !== band).map(w => ({ ...w, y: w.y - band.h })) : top;
  }, [active.widgets, band]);
  const gridLink = useMemo(() => (band ? {
    ...linkApi,
    setLayout: (next: Widget[]) => linkApi.setLayout(next.map(w => (w.parent ? w : { ...w, y: w.y + band.h })))
  } : linkApi), [linkApi, band]);
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
  const focusSearch = () => { setTab('add'); window.setTimeout(() => { if (searchRef.current) searchRef.current.focus(); }, 0); };

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
    else if (!mod && e.key === '/') { e.preventDefault(); focusSearch(); }
    else if (!mod && e.key === 'Delete' && selected) { e.preventDefault(); removeWidget(selected.id); }
    else if (!mod && e.key === 'Escape' && selected) { setSelectedId(null); }
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const sections = librarySections(addWidget);

  const saveText = authoring ? (authoring.status || 'Saved by Studio') : fixed ? 'Published layout' : saveFailed ? 'Not saved in this browser' : pending ? 'Saving…' : 'Saved in this browser';
  const saveState_ = authoring ? 'ok' : fixed ? 'fixed' : saveFailed ? 'bad' : pending ? 'wait' : 'ok';

  return (
    <ActionCtx.Provider value={actApi}><BuilderCtx.Provider value={ctx}>
      <NestCtx.Provider value={nest}>
        <div className={`dashboard-builder-container db-shell${isEditing ? ' is-editing' : ''}`}>
          <TopBar
            hosted={Boolean(authoring)}
            canImport={!authoring}
            readOnly={readOnly}
            isEditing={isEditing}
            dashboards={store.dashboards}
            active={active}
            baseId={baseActive.id}
            dash={{ switchTo, create: newDashboard, copy: copyDashboard, rename, remove: deleteDashboard, renaming, setRenaming, confirmDelete, setConfirmDelete }}
            design={{
              canUndo: history.canUndo, canRedo: history.canRedo, undo, redo,
              wireMode, toggleWire: () => setWireMode(m => !m), flowsOpen: flows !== undefined, openFlows: () => setFlows(selected ? selected.id : null),
              bar, setBar, templates: () => setPick(true), addWidget: focusSearch
            }}
            view={{
              state: (): ViewState => ({ sel: barSel, range, refresh: refreshS, fields: barOver[baseActive.id], links: linkOver[baseActive.id] }),
              apply: v => {
                setBarSel(v.sel || {}); setRange((v.range as Range) || { preset: 'all' }); setRefreshS(Number(v.refresh) || 0);
                saveOver(baseActive.id, v.fields as BarFields | undefined);
                saveLinks(baseActive.id, () => (v.links as DashOver | undefined));
              },
              resizeMode, toggleResize: () => setResizeMode(m => !m),
              canLink: active.widgets.some(canSend), linkMode, toggleLink: () => setLinkMode(m => !m),
              changed: Boolean(lo), reset: () => saveLinks(baseActive.id, () => undefined)
            }}
            more={{ tour: () => setTour(true), refresh: () => hub.refresh(), apiCheck: () => setApiCheck(true), exportJson: doExport, importFile: doImport, shared: hasShared ? addShared : undefined }}
            setEditing={on => { setEditing(on); if (!on) setSelectedId(null); }}
          />

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

          {band && (
            <div className="db-band" style={tintStyle(band)} aria-label={band.title}>
              <div className="db-widget-body">{renderBody(band)}</div>
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
            <LinkCtx.Provider value={gridLink}>
              <div className="db-stage" ref={stageRef} data-tour="canvas">
                {showStart && <StartScreen replace={active.widgets.length > 0} onPick={applyTemplate} onBlank={() => { setPick(false); setBlank(b => [...b, active.id]); }} onTour={() => setTour(true)} />}
                <GridCanvas
                  widgets={gridWidgets}
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
          {apiCheck && <ApiCheck hub={hub} onClose={() => setApiCheck(false)} />}
          {isEditing && flows !== undefined && <ActionStudio widgets={active.widgets} focus={flows} onWidgets={setWidgets} onClose={() => setFlows(undefined)} />}
        </div>
        {tour && <Tour onClose={() => setTour(false)} />}
      </NestCtx.Provider>
    </BuilderCtx.Provider></ActionCtx.Provider>
  );
}
