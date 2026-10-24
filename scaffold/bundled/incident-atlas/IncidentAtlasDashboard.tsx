/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Incident Atlas: incidents → alerts → topology as three stacked layers. Click anything to light up its whole chain;
 * right-click for tools; expand a resource to see what it affects, or reach into the live topology for its neighbours.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALERT_QUERY_PARAMS } from '../constants';
import './atlas.scss';
import { SplitShell, useSplit, renderSplit } from './split-runtime';
import { Alert, GroupMethod, IncModel, Model, TopologyLink, buildModel, frameAt, layoutLanes, openAt, groupStats, pathTo, reach, regroup, sevLabel, suspects } from './logic';
import { Chain, Change, Disclosure, Ghost, GhostLink, Sel, Tree, ViewId, SERVICE_TYPE, changeAlerts, changesBefore, chainOf, descendants, impactOf, pivotSet, placeTiles, sampleNeighbours, shortestPath, similarIncidents, spanOf, visibleEntities } from './atlas-logic';
import { Timeline } from './Timeline';
import { SEVERITY_COLORS } from './theme';
import { sampleChanges } from './sample';
import { DeepDive, MetricQuery, Neighbour, RemediationConsole, RemediationHandler, alertForRemediation } from './Overlays';
import { DEFAULT_TOPOLOGY_URL, neighbours, resolveId } from './topo';
import { SavedView, loadViews, urlViewName } from './views';
import { FeedProps, MenuEntry, ago, api, clock, useFeed, useNewVersion } from './feed';
import { Stage, Cmd, PlacedGhost, Tile } from './Stage';
import { Cosmos, CosmosProps } from './Cosmos';
import { PANEL_VERSION } from './version';

const INC_COLORS = ['#8a3ffc', '#1192e8', '#007d79', '#ee5396', '#b28600', '#9f1853', '#198038', '#0072c3'];
const REPLAY_MS = 14000;

export interface IncidentAtlasProps extends FeedProps {
  /** Show one piece only: header, kpis, tools, graph, playback, incidents, details, datacheck or help (used by the Layout Editor). */
  part?: string;
  windowMinutes?: number;
  topologyLinks?: TopologyLink[];
  nodeLinks?: Array<{ label: string; url: string }>;
  updateUrl?: string;
  netcoolWebGuiUrl?: string;
  metricQueries?: MetricQuery[];
  tenantId?: string;
  onExecuteRemediation?: RemediationHandler;
  /** Base URL of the topology REST API (Concert Workbench's read-only proxy by default). */
  topologyApiUrl?: string;
  initialView?: ViewId | 'cosmos';
  /** Children shown under each open resource before "+N more". Default 6. */
  baseChildren?: number;
  /** Change / deployment / maintenance events to show on the timeline and before an incident: { id, time (ms), resource, label, kind }. Change-like alerts in the feed are picked up too. */
  changeEvents?: Change[];
}

const StageOrCosmos = ({ cosmos, ...p }: CosmosProps & { cosmos: boolean }) => (cosmos ? <Cosmos {...p} /> : <Stage {...p} />);

const IncidentAtlasInner: React.FC<IncidentAtlasProps> = (props) => {
  const __split = useSplit();
  const [filterText, setFilterText] = useState(() => { try { return window.localStorage.getItem('atlas.alertFilter') || ''; } catch (e) { return ''; } });
  const [win, setWin] = useState(() => { try { const v = window.localStorage.getItem('atlas.window'); return v === null ? 24 : Number(v); } catch (e) { return 24; } });
  const [gm, setGm] = useState<GroupMethod>(() => { try { return (window.localStorage.getItem('atlas.groupBy') as GroupMethod) || 'union'; } catch (e) { return 'union'; } });
  const [feed0, loadSample, loadLive] = useFeed({ ...props, alertFilter: filterText.trim() || props.alertFilter, windowHours: win || undefined });
  const feed = useMemo(() => ({ ...feed0, alerts: regroup(feed0.alerts, feed0.sample ? 'api' : gm) }), [feed0, gm]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsErr, setViewsErr] = useState('');
  const [viewName, setViewName] = useState(() => { try { return urlViewName() || window.localStorage.getItem('atlas.view') || ''; } catch (e) { return ''; } });
  const pickView = (n: string, list: SavedView[] = views) => { setViewName(n); try { window.localStorage.setItem('atlas.view', n); } catch (e) { /* storage unavailable */ } const v = list.find(x => x.name === n); applyFilter(v ? v.clause : ''); setFilterDraft(v ? v.clause : ''); };
  useEffect(() => { if (feed.sample) return; let ok = true; loadViews().then(l => { if (!ok) return; setViews(l); if (viewName && !filterText) { const v = l.find(x => x.name === viewName); if (v) applyFilter(v.clause); } }).catch(e => { if (ok) setViewsErr(e instanceof Error ? e.message : String(e)); }); return () => { ok = false; }; }, [feed.sample]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyWin = (v: number) => { setWin(v); try { window.localStorage.setItem('atlas.window', String(v)); } catch (e) { /* storage unavailable */ } };
  const applyFilter = (v: string) => { setFilterText(v); try { window.localStorage.setItem('atlas.alertFilter', v); } catch (e) { /* storage unavailable */ } };
  const [filterDraft, setFilterDraft] = useState('');
  const windowMin = props.windowMinutes || 60;
  const base = Math.max(2, props.baseChildren || 6);
  const [sel, setSel] = useState<Sel>({ kind: 'none' });
  const [mode, setMode] = useState<'cosmos' | 'layers'>(props.initialView && props.initialView !== 'cosmos' ? 'layers' : 'cosmos');
  const [view, setView] = useState<ViewId>(props.initialView && props.initialView !== 'cosmos' ? props.initialView : 'stack');
  const [wave, setWave] = useState({ i: -1, n: 0 });
  const [trace, setTrace] = useState<{ n: number; path: number[] }>({ n: 0, path: [] });
  const [showImpact, setShowImpact] = useState(true);
  const [topoStat, setTopoStat] = useState({ busy: false, done: 0, total: 0, edges: 0, err: '' });
  const topoDone = useRef(new Set<string>());
  const [topoN, setTopoN] = useState(0);
  const [layers, setLayers] = useState({ inc: true, alert: true, topo: true });
  const [paused, setPaused] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [more, setMore] = useState<Map<number, number>>(new Map());
  const [shut, setShut] = useState<Set<number>>(new Set());
  const [pivot, setPivot] = useState<number | null>(null);
  const [isolate, setIsolate] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [ghostLinks, setGhostLinks] = useState<GhostLink[]>([]);
  const [liveLinks, setLiveLinks] = useState<TopologyLink[]>([]);
  const [cmd, setCmd] = useState<Cmd>({ n: 0, type: 'fit' });
  const [fly, setFly] = useState<{ sel: Sel; n: number }>({ sel: { kind: 'none' }, n: 0 });
  const [deep, setDeep] = useState<{ i: number; tab: number; alert?: string } | null>(null);
  const [remed, setRemed] = useState<Alert | null>(null);
  const [toast, setToast] = useState('');
  const [dismissed, setDismissed] = useState('');
  const [rt, setRt] = useState<number | null>(null); // propagation replay position 0..1, null = live
  const [playing, setPlaying] = useState(false);
  const rootEl = useRef<HTMLDivElement>(null);
  const tenant = props.tenantId || ALERT_QUERY_PARAMS.tenantId;
  const newer = useNewVersion(props.updateUrl);
  const topoUrl = props.topologyApiUrl || DEFAULT_TOPOLOGY_URL;

  useEffect(() => {
    const fit = () => { const el = rootEl.current; if (!el || __split) return; const h = Math.max(560, Math.round(window.innerHeight - Math.max(0, el.getBoundingClientRect().top) - 4)); if (el.style.minHeight !== h + 'px') el.style.minHeight = h + 'px'; };
    fit(); window.addEventListener('resize', fit); const id = window.setInterval(fit, 1500);
    return () => { window.removeEventListener('resize', fit); window.clearInterval(id); };
  }, []);

  const queryApi = useCallback((name: string, options: Record<string, unknown>) => {
    const fn = api() && (api() as any)[name];
    if (typeof fn !== 'function') return Promise.reject(new Error(`The ${name} query is not available in this environment.`));
    return fn({ tenantId: tenant, ...options });
  }, [tenant]);

  const allLinks = useMemo(() => [...(props.topologyLinks || []), ...liveLinks], [props.topologyLinks, liveLinks]);
  const model: Model = useMemo(() => buildModel(feed.alerts, feed.incidents, allLinks), [feed.alerts, feed.incidents, allLinks]);
  const byId = useMemo(() => new Map(feed.alerts.map(a => [a.id, a] as [string, Alert])), [feed.alerts]);
  const span = useMemo(() => { const s0 = spanOf(feed.alerts.filter(a => a.severity > 0)); return { from: s0.from, to: Math.max(s0.to, feed.updated) }; }, [feed.alerts, feed.updated]);
  const t = rt === null ? feed.updated : span.from + rt * (span.to - span.from);
  const frame = useMemo(() => frameAt(model, t), [model, t]);
  const nameOf = useCallback((e: number) => model.entities[e].name, [model]);
  const peak = useMemo(() => { const p = new Uint8Array(model.entities.length); model.entities.forEach((e, i) => e.alerts.forEach(a => { p[i] = Math.max(p[i], Math.min(6, Math.max(0, Math.round(a.severity)))); })); return p; }, [model]);
  const openFirst = useMemo(() => model.entities.map((e, i) => { const l = e.alerts.filter(a => a.severity > 0 && a.closed === undefined); return l.length ? Math.min(...l.map(a => a.first)) : NaN; }), [model]);
  const firstAt = useMemo(() => model.entities.map(e => e.alerts.reduce((m, a) => (a.severity > 0 ? Math.min(m, a.first) : m), Infinity)), [model]);

  const active = useMemo(() => {
    const act = model.incs.filter(im => im.start <= t && im.inc.alertIds.some(id => { const a = byId.get(id); return !!a && a.severity > 0 && openAt(a, t); }));
    return act.sort((a, b) => a.inc.priority - b.inc.priority || b.entities.length - a.entities.length);
  }, [model, t, byId]);
  const incKey = active.map(a => a.inc.id).join('|');
  const incColor = useCallback((id: string) => { const k = model.incs.findIndex(im => im.inc.id === id); return INC_COLORS[(k < 0 ? 0 : k) % INC_COLORS.length]; }, [model]);
  const trees: Tree[] = useMemo(() => active.map(im => ({ im, r: reach(model, im.root) })), [model, incKey]);
  const disc: Disclosure = useMemo(() => ({ base, more, shut }), [base, more, shut]);
  const { vis: visInc, hiddenKids } = useMemo(() => visibleEntities(trees, disc, peak, nameOf), [trees, disc, peak, nameOf]);
  const inLane = useMemo(() => { const s = new Set<number>(); trees.forEach(tr => tr.r.depth.forEach((_, e) => s.add(e))); return s; }, [trees]);
  const vis = useMemo(() => {
    const v = new Set(visInc);
    if (showOther || !active.length) model.entities.forEach((_, e) => { if (!inLane.has(e) && model.entities[e].alerts.some(a => a.severity > 0)) v.add(e); });
    if (isolate) { const keep = new Set<number>(); const im = model.incs.find(x => x.inc.id === isolate); if (im) { im.entities.forEach(e => keep.add(e)); keep.add(im.root); } Array.from(v).forEach(e => { if (!keep.has(e)) v.delete(e); }); }
    return v;
  }, [visInc, showOther, active.length, inLane, model, isolate]);
  const hidden = useMemo(() => { const h = new Set<number>(); model.entities.forEach((_, e) => { if (!vis.has(e)) h.add(e); }); return h; }, [model, vis]);
  const layout = useMemo(() => layoutLanes(model, trees.map(tr => ({ im: tr.im, depth: tr.r.depth, parent: tr.r.parent })), peak, 'combined', hidden, 1000), [model, trees, peak, hidden]);

  const roots = useMemo(() => { const m = new Map<number, number>(); active.forEach(im => { const s = suspects(model, im, t)[0]; if (s) m.set(s.entity, s.share); }); return m; }, [model, active, t]);
  const entityName = (name: string) => model.index.get(name);

  // ghosts: a column of faded neighbours beyond the right edge, each beside the resource it came from
  const placed = useMemo(() => {
    const out: PlacedGhost[] = [], depth = new Map<string, number>(), pos = new Map<string, { x: number; y: number }>();
    ghosts.forEach(g => { const fi = model.index.get(g.from); if (fi !== undefined && vis.has(fi)) { depth.set(g.id, 1); } });
    for (let pass = 0; pass < 6; pass++) ghosts.forEach(g => { if (!depth.has(g.id) && depth.has(g.from)) depth.set(g.id, (depth.get(g.from) as number) + 1); });
    const cols = new Map<number, Array<{ g: Ghost; want: number }>>();
    ghosts.forEach(g => {
      const d = depth.get(g.id); if (!d) return;
      let want = 0; const fi = model.index.get(g.from);
      if (fi !== undefined) want = layout.y[fi]; else if (pos.has(g.from)) want = (pos.get(g.from) as { y: number }).y;
      const l = cols.get(d) || []; l.push({ g, want }); cols.set(d, l);
    });
    Array.from(cols.keys()).sort((a, b) => a - b).forEach(d => {
      const l = (cols.get(d) as Array<{ g: Ghost; want: number }>).sort((a, b) => a.want - b.want); let prev = -Infinity;
      l.forEach(({ g, want }) => { const y = Math.max(want, prev + 38), x = layout.width + 70 + (d - 1) * 110; prev = y; pos.set(g.id, { x, y }); out.push({ g, x, y }); });
    });
    return out;
  }, [ghosts, model, vis, layout]);
  const ghostCols = placed.length ? Math.max(...placed.map(p => p.x)) + 90 : 0;
  const planeW = Math.max(layout.width, ghostCols, 480), planeH0 = Math.max(layout.height, placed.length ? Math.max(...placed.map(p => p.y)) + 60 : 0, 360);
  const planeH = Math.max(planeH0, Math.ceil(active.length / Math.max(1, Math.floor((planeW - 60) / 96))) > 1 ? Math.ceil(active.length / Math.max(1, Math.floor((planeW - 60) / 96))) * 70 + 60 : 0);
  const shownGhostLinks = useMemo(() => ghostLinks.filter(l => (model.index.has(l.a) || placed.some(p => p.g.id === l.a)) && (model.index.has(l.b) || placed.some(p => p.g.id === l.b))), [ghostLinks, placed, model]);

  const changes: Change[] = useMemo(() => [...(props.changeEvents || []), ...changeAlerts(feed.alerts), ...(feed.sample ? sampleChanges(feed.updated) : [])].sort((a, b) => a.time - b.time), [props.changeEvents, feed.alerts, feed.sample, feed.updated]);
  const changeMarks = useMemo(() => { const m = new Map<number, number>(); model.entities.forEach((e, i) => { const f = openFirst[i]; if (!Number.isFinite(f)) return; const n = changesBefore(changes, e.name, f).length; if (n) m.set(i, n); }); return m; }, [model, changes, openFirst]);
  const openAlerts = useMemo(() => feed.alerts.filter(a => openAt(a, t) && a.severity > 0), [feed.alerts, t]);
  const alertsAt = useCallback((i: number) => model.entities[i].alerts.filter(a => openAt(a, t) && a.severity > 0), [model, t]);
  const incAlerts = useMemo(() => { const s = new Set<string>(); active.forEach(im => im.inc.alertIds.forEach(id => s.add(id))); return s; }, [active]);
  const inInc = openAlerts.filter(a => incAlerts.has(a.id)).length;
  const shownAlerts = Array.from(vis).reduce((n, i) => n + alertsAt(i).length, 0);
  const hot = frame.h.reduce((n, v) => n + (v < 0.9 ? 1 : 0), 0);

  const pivotLit = useMemo(() => (pivot === null ? null : pivotSet(model, pivot)), [model, pivot]);
  const lit = useCallback((i: number) => (pivotLit ? pivotLit.has(i) : true) && (rt === null || firstAt[i] <= t), [pivotLit, rt, firstAt, t]);
  const litAge = useCallback((i: number) => (rt === null || !Number.isFinite(firstAt[i]) ? -1 : (t - firstAt[i]) / Math.max(1, (span.to - span.from) * 0.07)), [rt, firstAt, t, span]);

  const tiles: Tile[] = useMemo(() => {
    const list = active.filter(im => !isolate || im.inc.id === isolate).map(im => { const xs = im.entities.filter(e => vis.has(e)).map(e => layout.x[e]).filter(Number.isFinite); return { im, x: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 120 }; });
    const rows = Math.max(1, Math.ceil(list.length / Math.max(1, Math.floor((planeW - 60) / 96))));
    const out: Tile[] = [];
    for (let r = 0; r < rows; r++) {
      const mine = list.filter((_, k) => k % rows === r);
      const xs = placeTiles(mine.map(m => ({ id: m.im.inc.id, x: m.x })), 96, 110, Math.max(planeW - 110, 110 + mine.length * 96));
      const y = rows === 1 ? planeH / 2 : 50 + (planeH - 100) * (r / (rows - 1));
      mine.forEach(m => { const s = suspects(model, m.im, t)[0]; out.push({ im: m.im, x: xs.get(m.im.inc.id) as number, y, alerts: m.im.inc.alertIds.filter(id => { const a = byId.get(id); return a && openAt(a, t); }).length, resources: m.im.entities.length, cause: s ? model.entities[s.entity].name : '', share: s ? s.share : 0 }); });
    }
    return out;
  }, [active, vis, layout, planeW, planeH, model, t, byId, isolate]);
  const chain: Chain | null = useMemo(() => (sel.kind === 'none' ? null : chainOf(model, sel, byId, trees, shownGhostLinks)), [model, sel, byId, trees, shownGhostLinks]);

  // ---- helpers ----
  const tell = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3200); };
  const copy = (txt: string, what: string) => { try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(() => tell(`Copied ${what}`), () => tell('Copy was blocked by the browser')); return; } } catch (e) { /* fall through */ } tell('Copy was blocked by the browser'); };
  const concertUrl = (id: string) => `${window.location.origin}/aiops/${ALERT_QUERY_PARAMS.tenantId}/resolution-hub/incidents/all/${id}/overview`;
  const fill = (u: string, e: number, im?: IncModel) => u.replace(/\{origin\}/g, window.location.origin).replace(/\{tenant\}/g, ALERT_QUERY_PARAMS.tenantId).replace(/\{name\}/g, model.entities[e].name).replace(/\{encodedName\}/g, encodeURIComponent(model.entities[e].name)).replace(/\{incidentId\}/g, im ? im.inc.id : '');
  const incOfEnt = (i: number) => active.find(a => a.entities.includes(i)) || model.incs.find(a => a.entities.includes(i));
  const incOfAlert = (id: string) => model.incs.find(a => a.inc.alertIds.includes(id));
  const entOfAlert = (id: string) => { const a = byId.get(id); if (!a) return -1; return model.entities.findIndex(e => e.alerts.some(x => x.id === a.id)); };
  const flyTo = (s: Sel) => setFly(f => ({ sel: s, n: f.n + 1 }));
  const select = (s: Sel) => { setSel(s); };
  const shock = (i: number) => { const d = reach(model, i).depth; let hops = 0; d.forEach(v => { hops = Math.max(hops, v); }); setWave(w => ({ i, n: w.n + 1 })); tell(`Shockwave from ${model.entities[i].name}: ${Math.max(0, d.size - 1)} resource(s) downstream within ${hops} hop${hops === 1 ? '' : 's'}`); };
  const expandOne = (i: number) => { setShut(s => { const n = new Set(s); n.delete(i); return n; }); setMore(m => new Map(m).set(i, (m.get(i) || 0) + base * 2)); };
  const expandBelow = (i: number) => { const d = descendants(trees, i); setShut(s => { const n = new Set(s); n.delete(i); d.forEach(x => n.delete(x)); return n; }); setMore(m => { const n = new Map(m); n.set(i, Infinity); d.forEach(x => n.set(x, Infinity)); return n; }); };
  const collapseOne = (i: number) => setShut(s => new Set(s).add(i));
  const expandAll = () => { setShut(new Set()); setMore(new Map(model.entities.map((_, i) => [i, Infinity] as [number, number]))); };
  const collapseAll = () => { setMore(new Map()); setShut(new Set(trees.map(tr => tr.im.root))); };
  const resetAll = () => { setMore(new Map()); setShut(new Set()); setPivot(null); setIsolate(null); setGhosts([]); setGhostLinks([]); setLiveLinks([]); setSel({ kind: 'none' }); setCmd(c => ({ n: c.n + 1, type: 'fit' })); };

  // ---- live topology neighbours ----
  const expandLive = async (seed: { key: string; name: string; id?: string; uniqueId?: string }) => {
    try {
      let res: { nodes: Array<{ id: string; name: string; types: string[]; sev?: number }>; edges: Array<{ from: string; to: string; type?: string }> }, seedId: string, sample = false;
      if (feed.sample) { sample = true; seedId = `~${seed.name}~`; res = sampleNeighbours(seed.name); }
      else { seedId = seed.id || (await resolveId(topoUrl, seed.name, seed.uniqueId)); res = await neighbours(topoUrl, seedId); }
      const keyOf = (id: string) => { if (id === seedId) return seed.key; const n = res.nodes.find(x => x.id === id); if (!n) return id; return model.index.has(n.name) ? n.name : n.id; };
      const newGhosts: Ghost[] = [], gl: GhostLink[] = [], ll: TopologyLink[] = [];
      res.nodes.forEach(n => { if (!model.index.has(n.name)) newGhosts.push({ id: n.id, name: n.name, types: n.types, sev: n.sev, sample, from: seed.key }); });
      res.edges.forEach(e => { const a = keyOf(e.from), b = keyOf(e.to); if (model.index.has(a) && model.index.has(b)) ll.push({ source: a, target: b, relType: e.type }); else gl.push({ a, b, type: e.type }); });
      setGhosts(g => { const have = new Set(g.map(x => x.id)); return [...g, ...newGhosts.filter(x => !have.has(x.id))]; });
      setGhostLinks(g => { const have = new Set(g.map(x => `${x.a}|${x.b}`)); return [...g, ...gl.filter(x => !have.has(`${x.a}|${x.b}`))]; });
      setLiveLinks(l => { const have = new Set(l.map(x => `${x.source}|${x.target}`)); return [...l, ...ll.filter(x => !have.has(`${x.source}|${x.target}`))]; });
      tell(newGhosts.length || ll.length ? `${seed.name}: ${newGhosts.length} more resource(s) from ${sample ? 'sample topology' : 'the topology service'}` : `${seed.name}: no neighbours beyond what is already shown`);
    } catch (e) { tell(`Topology: ${e instanceof Error ? e.message : String(e)}`); }
  };

  // ---- real topology edges, loaded for every visible resource (through Studio's read-only proxy) ----
  const visKey = Array.from(vis).sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!model.entities.length) return;
    if (feed.sample) {
      if (topoDone.current.has('~sample')) return; topoDone.current.add('~sample');
      const links: TopologyLink[] = []; model.incs.forEach(im => { for (let k = 1; k < im.entities.length; k++) links.push({ source: model.entities[im.entities[k - 1]].name, target: model.entities[im.entities[k]].name, relType: 'sample' }); });
      setLiveLinks(l => [...l, ...links]); setTopoStat({ busy: false, done: 1, total: 1, edges: links.length, err: '' }); return;
    }
    const order: number[] = []; trees.forEach(tr => tr.im.entities.forEach(e => { if (vis.has(e) && !order.includes(e)) order.push(e); })); vis.forEach(e => { if (!order.includes(e)) order.push(e); });
    const todo = order.slice(0, 60).map(e => model.entities[e]).filter(en => !topoDone.current.has(en.name));
    if (!todo.length) return;
    let off = false, done = 0, fails = 0, edges = 0; todo.forEach(en => topoDone.current.add(en.name));
    setTopoStat(s => ({ ...s, busy: true, done: 0, total: todo.length, err: '' }));
    const queue = todo.slice();
    const worker = async () => {
      while (queue.length && !off && fails < 4) {
        const en = queue.shift() as typeof todo[number];
        try {
          const seedId = await resolveId(topoUrl, en.name, en.uniqueId), res = await neighbours(topoUrl, seedId), nameOf2 = new Map<string, string>([[seedId, en.name]]);
          res.nodes.forEach(n => nameOf2.set(n.id, n.name));
          const found: TopologyLink[] = []; res.edges.forEach(e => { const a = nameOf2.get(e.from), b = nameOf2.get(e.to); if (a && b && model.index.has(a) && model.index.has(b) && a !== b) found.push({ source: a, target: b, relType: e.type }); });
          if (found.length && !off) { edges += found.length; setLiveLinks(l => { const have = new Set(l.map(x => `${x.source}|${x.target}`)); const add = found.filter(x => !have.has(`${x.source}|${x.target}`)); return add.length ? [...l, ...add] : l; }); }
          fails = 0;
        } catch (e) { fails++; if (!off) setTopoStat(s => ({ ...s, err: e instanceof Error ? e.message : String(e) })); }
        done++; if (!off) setTopoStat(s => ({ ...s, done, edges: s.edges + 0, busy: done < todo.length })); 
      }
    };
    Promise.all([worker(), worker(), worker()]).then(() => { if (!off) setTopoStat(s => ({ ...s, busy: false, edges: liveCount.current })); });
    return () => { off = true; };
  }, [visKey, feed.sample, topoUrl, topoN]);
  const liveCount = useRef(0); liveCount.current = liveLinks.length;
  const reloadTopology = () => { topoDone.current.clear(); setLiveLinks([]); setTopoStat({ busy: false, done: 0, total: 0, edges: 0, err: '' }); setTopoN(n => n + 1); };

  // ---- trace: the real path from the cause ----
  const trace1 = (i: number) => {
    const im = incOfEnt(i); if (!im) { tell('This resource is not part of an incident'); return; }
    let path = shortestPath(model, im.root, i, ['topology', 'group']); const real = !!path;
    if (!path) path = shortestPath(model, im.root, i, ['topology', 'group', 'causal']);
    if (!path || path.length < 2) { tell(i === im.root ? 'This is the probable cause' : 'No path found'); return; }
    setTrace(t => ({ n: t.n + 1, path: path as number[] })); setSel({ kind: 'ent', i });
    const txt = (path as number[]).map(e => model.entities[e].name).join(' → '); tell(real ? `Path from the cause: ${txt.length > 150 ? txt.slice(0, 147) + '…' : txt}` : 'No topology path found (is the topology proxy running?); showing the inferred incident link instead');
  };
  const incOfAny = (s: Sel): IncModel | undefined => (s.kind === 'inc' ? model.incs.find(x => x.inc.id === s.id) : s.kind === 'ent' ? incOfEnt(s.i) : s.kind === 'alert' ? incOfAlert(s.id) : undefined);
  const focusInc = incOfAny(sel);
  const impact = useMemo(() => (focusInc ? impactOf(model, focusInc) : null), [model, focusInc]);
  const impactSet = useMemo(() => (showImpact && impact ? new Set(impact.services.map(x => x.i)) : new Set<number>()), [showImpact, impact]);
  const similar = useMemo(() => (focusInc ? similarIncidents(model, focusInc.inc.id, feed.updated) : []), [model, focusInc, feed.updated]);
  const trigger = useMemo(() => {
    if (!focusInc) return null; let best: { c: Change; lead: number; e: number } | null = null;
    focusInc.entities.forEach(e => { const f = openFirst[e]; if (!Number.isFinite(f)) return; changesBefore(changes, model.entities[e].name, f).forEach(c => { const lead = focusInc.start - c.time; if (lead >= -60000 && (!best || lead < best.lead)) best = { c, lead, e }; }); });
    return best as { c: Change; lead: number; e: number } | null;
  }, [focusInc, changes, openFirst, model]);
  const findServices = async () => { if (!focusInc) return; setShowImpact(true); const ents = focusInc.entities.slice(0, 10); tell(`Looking for services around ${ents.length} resources…`); for (const e of ents) await expandLive({ key: model.entities[e].name, name: model.entities[e].name, uniqueId: model.entities[e].uniqueId }); };
  const atRiskGhosts = focusInc ? ghosts.filter(g => g.types.some(x => SERVICE_TYPE.test(x)) && focusInc.entities.some(e => model.entities[e].name === g.from)) : [];

  // ---- propagation replay ----
  useEffect(() => {
    if (!playing) return; let raf = 0, t0 = 0, from = rt === null || rt >= 1 ? 0 : rt;
    const step = (now: number) => { if (!t0) t0 = now; const v = Math.min(1, from + (now - t0) / REPLAY_MS); setRt(v); if (v < 1) raf = requestAnimationFrame(step); else setPlaying(false); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [playing]);
  const play = () => { if (playing) { setPlaying(false); return; } setRt(r => (r === null || r >= 1 ? 0 : r)); setPlaying(true); };
  const live = () => { setPlaying(false); setRt(null); };

  // ---- menus ----
  const remedFor = (list: Alert[]) => { const open = list.filter(x => openAt(x, t)); const a = alertForRemediation(open.length ? open : list); if (a) setRemed(a); };
  const menuFor = (s: Sel | null): MenuEntry[] => {
    const canvas: MenuEntry[] = [
      { head: true, label: 'Atlas' },
      { label: 'View: Cosmos (constellation)', hint: mode === 'cosmos' ? '✓' : '', onClick: () => setMode('cosmos') },
      { label: 'View: Layers · Stack (3D)', hint: mode === 'layers' && view === 'stack' ? '✓' : '', onClick: () => { setMode('layers'); setView('stack'); } },
      { label: 'View: Layers · Flat', hint: mode === 'layers' && view === 'flat' ? '✓' : '', onClick: () => { setMode('layers'); setView('flat'); } },
      { label: 'View: Layers · Side', hint: mode === 'layers' && view === 'side' ? '✓' : '', onClick: () => { setMode('layers'); setView('side'); } },
      { sep: true },
      { label: 'Expand everything', onClick: expandAll }, { label: 'Collapse to causes', onClick: collapseAll },
      { label: showOther ? 'Hide non-incident resources' : 'Show non-incident resources', onClick: () => setShowOther(v => !v) },
      { label: playing ? 'Pause propagation replay' : 'Play propagation replay', onClick: play },
      { label: 'Reset everything', onClick: resetAll },
    ];
    if (!s) return canvas;
    if (s.kind === 'ent') {
      const i = s.i, en = model.entities[i], im = incOfEnt(i), open = alertsAt(i), kids = descendants(trees, i).size, isRoot = !!im && im.root === i;
      const hk = hiddenKids.get(i) || 0, path = im ? pathTo(model, im.root, i) : [i];
      return [
        { head: true, label: `${en.name} · ${open.length ? sevLabel(frame.worst[i]) : 'no open alert'}` },
        { label: 'Open Deep Dive diagnostics', onClick: () => setDeep({ i, tab: 0 }) },
        { label: 'Raw JSON: resource and alerts', hint: 'API', onClick: () => setDeep({ i, tab: 4 }) },
        { label: 'Open Remediation Console', disabled: !en.alerts.length, onClick: () => remedFor(en.alerts) },
        { label: 'Trace the path from the cause', hint: incOfEnt(i) && incOfEnt(i)?.root !== i ? '' : 'is the cause', disabled: !incOfEnt(i) || (incOfEnt(i) as IncModel).root === i, onClick: () => trace1(i) },
        { label: 'What changed before this?', hint: changeMarks.get(i) ? `${changeMarks.get(i)}` : 'none', disabled: !changeMarks.get(i), onClick: () => { const cs = changesBefore(changes, en.name, openFirst[i]); tell(cs.map(c => `${clock(c.time).slice(0, 5)} ${c.label}`).join(' · ')); } },
        { label: 'Shockwave: light up the blast radius', hint: mode === 'cosmos' ? '' : 'Cosmos view', disabled: mode !== 'cosmos', onClick: () => shock(i) },
        ...(props.netcoolWebGuiUrl ? [{ label: 'View in Netcool / WebGUI', onClick: () => window.open(props.netcoolWebGuiUrl, '_blank', 'noopener,noreferrer') }] : []),
        { sep: true },
        { head: true, label: 'Follow the links' },
        { label: 'Pivot: show only what it connects to', hint: pivot === i ? '✓' : '', onClick: () => setPivot(pivot === i ? null : i) },
        { label: 'Isolate this incident', disabled: !im, onClick: () => setIsolate(im ? im.inc.id : null) },
        { label: 'Highlight path from the cause', disabled: !im || isRoot, hint: isRoot ? 'is the cause' : `${path.length - 1} hop${path.length === 2 ? '' : 's'}`, onClick: () => select(s) },
        { sep: true },
        { head: true, label: 'Expand out' },
        { label: hk ? `Show more (${hk} hidden)` : 'Show more children', disabled: !hk, onClick: () => expandOne(i) },
        { label: 'Expand everything below', disabled: !kids, hint: kids ? `${kids}` : '', onClick: () => expandBelow(i) },
        { label: 'Collapse', disabled: !kids || shut.has(i), onClick: () => collapseOne(i) },
        { label: 'Reach into live topology (neighbours)', hint: feed.sample ? 'sample' : 'ASM', onClick: () => expandLive({ key: en.name, name: en.name, uniqueId: en.uniqueId }) },
        { sep: true },
        { label: 'Open incident in Concert Operate', disabled: !im || feed.sample, onClick: () => im && window.open(concertUrl(im.inc.id), '_blank') },
        ...(props.nodeLinks || []).map(l => ({ label: l.label, onClick: () => window.open(fill(l.url, i, im), '_blank', 'noopener') })),
        { label: 'Copy resource name', onClick: () => copy(en.name, 'resource name') },
        { label: 'Copy ticket text', onClick: () => copy([`Resource: ${en.name}`, im ? `Incident: P${im.inc.priority || '?'} ${im.inc.title} (${im.inc.id})` : 'Incident: none', `Open alerts: ${open.length}`, ...open.slice(0, 20).map(a => `- [${sevLabel(a.severity)}] ${a.summary} (${a.sender || 'unknown'}, ${clock(a.first)})`)].join('\n'), 'ticket text') },
      ];
    }
    if (s.kind === 'alert') {
      const a = byId.get(s.id), e = entOfAlert(s.id), im = incOfAlert(s.id);
      if (!a) return canvas;
      return [
        { head: true, label: `${sevLabel(a.severity)} · ${a.summary.slice(0, 48)}` },
        { label: 'Raw JSON for this alert', hint: 'API', disabled: e < 0, onClick: () => setDeep({ i: e, tab: 4, alert: a.id }) },
        { label: 'Open resource Deep Dive', disabled: e < 0, onClick: () => setDeep({ i: e, tab: 0 }) },
        { label: 'Open Remediation Console', onClick: () => setRemed(a) },
        { sep: true },
        { label: 'Follow to its resource', disabled: e < 0, onClick: () => { select({ kind: 'ent', i: e }); flyTo({ kind: 'ent', i: e }); } },
        { label: 'Follow to its incident', disabled: !im, onClick: () => { if (im) { select({ kind: 'inc', id: im.inc.id }); flyTo({ kind: 'inc', id: im.inc.id }); } } },
        { label: 'Open incident in Concert Operate', disabled: !im || feed.sample, onClick: () => im && window.open(concertUrl(im.inc.id), '_blank') },
        { sep: true },
        { label: 'Copy alert id', onClick: () => copy(a.id, 'alert id') }, { label: 'Copy summary', onClick: () => copy(a.summary, 'summary') },
      ];
    }
    if (s.kind === 'inc') {
      const im = model.incs.find(x => x.inc.id === s.id); if (!im) return canvas;
      return [
        { head: true, label: `P${im.inc.priority || '?'} · ${im.inc.title.slice(0, 48)}` },
        { label: 'Open incident in Concert Operate', disabled: feed.sample, onClick: () => window.open(concertUrl(im.inc.id), '_blank') },
        { label: 'Fly to the probable cause', onClick: () => { select({ kind: 'ent', i: im.root }); flyTo({ kind: 'ent', i: im.root }); } },
        { label: 'Deep Dive on the probable cause', onClick: () => setDeep({ i: im.root, tab: 0 }) },
        { label: isolate === im.inc.id ? 'Show all incidents' : 'Isolate this incident', onClick: () => setIsolate(isolate === im.inc.id ? null : im.inc.id) },
        { label: 'Expand everything below the cause', onClick: () => expandBelow(im.root) },
        { sep: true },
        { label: 'Copy incident id', onClick: () => copy(im.inc.id, 'incident id') }, { label: 'Copy title', onClick: () => copy(im.inc.title, 'title') },
      ];
    }
    const g = ghosts.find(x => x.id === (s as { id: string }).id);
    if (!g) return canvas;
    return [
      { head: true, label: `${g.name} · from the topology${g.sample ? ' (sample)' : ''}` },
      { label: 'Expand its neighbours', onClick: () => expandLive({ key: g.id, name: g.name, id: g.sample ? undefined : g.id }) },
      { label: 'Remove from the atlas', onClick: () => { setGhosts(l => l.filter(x => x.id !== g.id)); setSel({ kind: 'none' }); } },
      { label: 'Copy name', onClick: () => copy(g.name, 'name') }, { label: 'Copy topology id', onClick: () => copy(g.id, 'topology id') },
    ];
  };
  const onOpen = (s: Sel) => {
    if (s.kind === 'ent') setDeep({ i: s.i, tab: 0 });
    else if (s.kind === 'alert') { const e = entOfAlert(s.id); if (e >= 0) setDeep({ i: e, tab: 4, alert: s.id }); }
    else if (s.kind === 'ghost') { const g = ghosts.find(x => x.id === s.id); if (g) expandLive({ key: g.id, name: g.name, id: g.sample ? undefined : g.id }); }
    else if (s.kind === 'inc') { const im = model.incs.find(x => x.inc.id === s.id); if (im) { select({ kind: 'ent', i: im.root }); flyTo({ kind: 'ent', i: im.root }); } }
  };
  const tipFor = (s: Sel): React.ReactNode => {
    if (s.kind === 'ent') { const en = model.entities[s.i]; return <><b>{en.name}</b><br />{sevLabel(frame.worst[s.i])} · {alertsAt(s.i).length} open alert(s){hiddenKids.get(s.i) ? ` · ${hiddenKids.get(s.i)} hidden below` : ''}{changeMarks.get(s.i) ? <><br />Δ {changeMarks.get(s.i)} change(s) before its first alert</> : null}{impactSet.has(s.i) ? <><br />faces a service</> : null}<br />click: follow chain · right-click: tools</>; }
    if (s.kind === 'alert') { const a = byId.get(s.id); return a ? <><b>{sevLabel(a.severity)}</b> {a.summary}<br />{a.sender || 'unknown source'} · {clock(a.first)}{a.children && a.children.length ? ` · group of ${a.children.length}` : ''}</> : null; }
    if (s.kind === 'inc') { const im = model.incs.find(x => x.inc.id === s.id); if (!im) return null; const sus = suspects(model, im, t)[0]; return <><b>P{im.inc.priority || '?'} {im.inc.title}</b><br />{im.inc.state || 'open'} · started {ago(t - im.start)}<br />{im.inc.alertIds.length} alerts · {im.entities.length} resources{sus ? <><br />probable cause: {model.entities[sus.entity].name} ({Math.round(sus.share * 100)}%)</> : null}<br />click: follow chain · right-click: tools</>; }
    if (s.kind !== 'ghost') return null; const gid = s.id, g = ghosts.find(x => x.id === gid); return g ? <><b>{g.name}</b><br />{g.types.join(', ') || 'resource'} · from topology{g.sample ? ' (sample)' : ''}<br />double-click to expand neighbours</> : null;
  };

  // ---- side panel ----
  const selEnt = sel.kind === 'ent' ? model.entities[sel.i] : null;
  const selAlert = sel.kind === 'alert' ? byId.get(sel.id) : undefined;
  const selInc = sel.kind === 'inc' ? model.incs.find(x => x.inc.id === sel.id) : undefined;
  const selGhostId = sel.kind === 'ghost' ? sel.id : '';
  const selGhost = selGhostId ? ghosts.find(g => g.id === selGhostId) : undefined;
  const why = (): React.ReactNode => {
    if (selEnt && sel.kind === 'ent') {
      const im = incOfEnt(sel.i), path = im ? pathTo(model, im.root, sel.i) : [], open = alertsAt(sel.i);
      return <>
        <div className="blast__meta">{open.length} open alert(s) · {sevLabel(frame.worst[sel.i])}{roots.has(sel.i) ? ' · probable cause' : ''}</div>
        {im ? <div className="atlas__why"><span>Why it is here</span><ol>{path.map((e, k) => <li key={e}><a onClick={() => { select({ kind: 'ent', i: e }); flyTo({ kind: 'ent', i: e }); }}>{model.entities[e].name}</a>{k === 0 ? ' (cause)' : ''}</li>)}<li><a onClick={() => { select({ kind: 'inc', id: im.inc.id }); if (mode === 'cosmos') flyTo({ kind: 'inc', id: im.inc.id }); }}>{`P${im.inc.priority || '?'} ${im.inc.title}`}</a></li></ol></div> : <div className="blast__meta">Not part of an incident.</div>}
        <div className="blast__feed">{open.sort((a, b) => b.severity - a.severity).slice(0, 8).map(a => <div className="blast__al" key={a.id} onClick={() => select({ kind: 'alert', id: a.id })}><span className="t">{clock(a.first).slice(0, 5)}</span><span className="x"><span className={`sev s${Math.round(a.severity)}`}>{sevLabel(a.severity)}</span>{a.summary}</span></div>)}</div>
      </>;
    }
    if (selAlert) { const e = entOfAlert(selAlert.id), im = incOfAlert(selAlert.id); return <>
      <div className="blast__meta"><span className={`sev s${Math.round(selAlert.severity)}`}>{sevLabel(selAlert.severity)}</span> {selAlert.sender || 'unknown source'} · {clock(selAlert.first)} · {selAlert.state}</div>
      <div className="blast__tt">{selAlert.summary}</div>
      <div className="atlas__why"><span>Chain</span><ol>{e >= 0 && <li><a onClick={() => select({ kind: 'ent', i: e })}>{model.entities[e].name}</a></li>}{im && <li><a onClick={() => { select({ kind: 'inc', id: im.inc.id }); if (mode === 'cosmos') flyTo({ kind: 'inc', id: im.inc.id }); }}>{`P${im.inc.priority || '?'} ${im.inc.title}`}</a>{im.inc.ranks[selAlert.id] ? ` · cause rank #${im.inc.ranks[selAlert.id]}` : ''}</li>}{selAlert.parent && <li>in group of {selAlert.parent}</li>}</ol></div>
    </>; }
    if (selInc) { const sus = suspects(model, selInc, t); return <>
      <div className="blast__meta">P{selInc.inc.priority || '?'} · started {ago(t - selInc.start)} · {selInc.inc.state || 'open'}</div>
      <div className="blast__tt">{selInc.inc.title}</div>
      {sus.slice(0, 3).map((s, k) => <div key={s.entity} className={`blast__sus${k ? '' : ' is-first'}`} onClick={() => { select({ kind: 'ent', i: s.entity }); flyTo({ kind: 'ent', i: s.entity }); }}><span className="rk">#{k + 1}</span><span className="nm">{model.entities[s.entity].name}</span><span className="pc">{Math.round(s.share * 100)}%</span><div className="track"><div className="fill" style={{ width: `${Math.round(s.share * 100)}%` }} /></div></div>)}
    </>; }
    if (selGhost) return <><div className="blast__meta">{selGhost.types.join(', ') || 'resource'} · found in the topology{selGhost.sample ? ' (SAMPLE neighbours)' : ''}</div><div className="blast__meta">Linked from {selGhost.from}. It has no alerts in this window.</div></>;
    return null;
  };
  const selTitle = selEnt ? selEnt.name : selAlert ? 'Alert' : selInc ? 'Incident' : selGhost ? selGhost.name : '';

  const iHead = (<>
      <header className="blast__head">
        <div className="blast__brand"><h1>Incident Atlas</h1><span>{PANEL_VERSION} · incidents → alerts → topology, one chain</span></div>
        <div className="blast__chips">
          <span className="blast__chip">{clock(t)}</span>
          {feed.sample ? <span className="blast__chip is-sample">SAMPLE DATA</span> : feed.status === 'ok' ? <span className={`blast__chip ${rt === null ? 'is-live' : 'is-replay'}`}><i />{rt === null ? `LIVE · updated ${clock(feed.updated)}` : 'REPLAY'}</span> : feed.status === 'loading' ? <span className="blast__chip">Loading…</span> : <span className="blast__chip is-err">No data</span>}
          {!feed.sample && <button className="blast__btn is-sm" onClick={reloadTopology} title="Read topology links again">Reload topology</button>}
          {feed.sample && <button className="blast__btn" onClick={loadLive}>Use live data</button>}
        </div>
      </header>
      {newer && dismissed !== newer && <div className="blast__banner is-update" role="status"><div><b>A new version of Incident Atlas is available: {newer}.</b> This page is running {PANEL_VERSION}. In Concert Workbench use "Install &amp; add route" (or Build &amp; Deploy), then reload this page.</div><button className="blast__btn" onClick={() => setDismissed(newer)}>Dismiss</button></div>}
      {feed.status === 'error' && <div className="blast__banner"><div><b>Could not read alerts and incidents.</b> {feed.error}</div><button className="blast__btn" onClick={loadSample}>Load sample data</button></div>}
  </>);
  const iKpis = (
          <div className="blast__kpis">
            <div className="blast__kpi" title="Open = not closed or cleared, severity above clear. Alerts with no resource name are counted here but cannot be drawn."><small>Open alerts</small><strong>{openAlerts.length}</strong><em>{openAlerts.filter(x => x.severity >= 6).length} critical · {feed.alerts.length} returned{feed.alerts.length > openAlerts.length ? `, ${feed.alerts.length - openAlerts.length} closed/clear` : ''}</em></div>
            <div className="blast__kpi"><small>Resources affected</small><strong>{hot}</strong><em>of {model.entities.length} with alerts</em></div>
            <div className="blast__kpi"><small>Incidents</small><strong>{active.length}</strong><em>{active.filter(a => a.inc.priority === 1).length} at priority 1</em></div>
            <div className="blast__kpi"><small>Alerts → incidents</small><strong>{inInc} → {active.length}</strong><em>{active.length && inInc ? `${Math.round((1 - active.length / inInc) * 100)}% fewer things to read` : 'nothing correlated'}</em></div>
          </div>
  );
  const iTools = (
          <div className="blast__tools atlas__tools">
            <div className="blast__seg" role="group" aria-label="Mode"><button className={mode === 'cosmos' ? 'on' : ''} onClick={() => setMode('cosmos')}>Cosmos</button><button className={mode === 'layers' ? 'on' : ''} onClick={() => setMode('layers')}>Layers</button></div>
            {mode === 'layers' && <div className="blast__seg" role="group" aria-label="View">{(['stack', 'flat', 'side'] as ViewId[]).map(v => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'stack' ? 'Stack' : v === 'flat' ? 'Flat' : 'Side'}</button>)}</div>}
            <div className="blast__seg" role="group" aria-label="Layers">
              <button className={layers.inc ? 'on' : ''} onClick={() => setLayers(l => ({ ...l, inc: !l.inc }))}>Incidents</button>
              <button className={layers.alert ? 'on' : ''} onClick={() => setLayers(l => ({ ...l, alert: !l.alert }))}>Alerts</button>
              <button className={layers.topo ? 'on' : ''} onClick={() => setLayers(l => ({ ...l, topo: !l.topo }))}>Topology</button>
            </div>
            <div className="blast__zoom" role="group" aria-label="Camera">
              <button onClick={() => setCmd(c => ({ n: c.n + 1, type: 'out' }))} aria-label="Zoom out">−</button>
              <button onClick={() => setCmd(c => ({ n: c.n + 1, type: 'in' }))} aria-label="Zoom in">+</button>
              {mode === 'layers' && <button onClick={() => setCmd(c => ({ n: c.n + 1, type: 'rotL' }))} aria-label="Rotate left" title="Rotate left">⟲</button>}
              {mode === 'layers' && <button onClick={() => setCmd(c => ({ n: c.n + 1, type: 'rotR' }))} aria-label="Rotate right" title="Rotate right">⟳</button>}
              <button onClick={() => setCmd(c => ({ n: c.n + 1, type: 'fit' }))} aria-label="Fit" title="Fit everything">Fit</button>
            </div>
            <button className="blast__btn is-sm" onClick={expandAll}>Expand all</button>
            <button className="blast__btn is-sm" onClick={collapseAll}>Collapse</button>
            <button className={`blast__btn is-sm${showOther ? ' is-on' : ''}`} onClick={() => setShowOther(v => !v)} disabled={!active.length}>{showOther ? 'Hide' : 'Show'} non-incident</button>
            <button className="blast__btn is-sm" onClick={() => setPaused(p => !p)}>{paused ? 'Play motion' : 'Pause motion'}</button>
            {(pivot !== null || isolate) && <button className="blast__btn is-sm is-ai" onClick={() => { setPivot(null); setIsolate(null); }}>Clear {pivot !== null ? 'pivot' : 'isolate'}</button>}
          </div>
  );
  const iGraph = (<>
          {!model.entities.length ? (
            <div className="blast__stage blast__empty"><div><b>No open alerts in this window.</b><br />The atlas fills in as alerts arrive.<br />{!feed.sample && <button className="blast__btn" onClick={loadSample}>Load sample data</button>}</div></div>
          ) : (
            <StageOrCosmos cosmos={mode === 'cosmos'} wave={wave} model={model} h={frame.h} worst={frame.worst} trees={trees} incColor={incColor} layout={layout} planeW={planeW} planeH={planeH} ghosts={placed} ghostLinks={shownGhostLinks}
              vis={vis} hiddenKids={hiddenKids} alertsAt={alertsAt} tiles={tiles} byId={byId} roots={roots} sel={sel} chain={chain} lit={lit} litAge={litAge}
              layers={layers} view={view} cmd={cmd} flyTo={fly} trace={trace} impact={impactSet} changeMarks={changeMarks} similar={similar.filter(x => active.some(a => a.inc.id === x.im.inc.id)).map(x => ({ id: x.im.inc.id, score: x.score }))} realTopo={liveLinks.length > 0 && !feed.sample} paused={paused} onSelect={select} onOpen={onOpen} onMore={expandOne} menuFor={menuFor} tipFor={tipFor} />
          )}
  </>);
  const iPlay = (<>
          <div className="blast__bar">
            <button className="blast__btn is-ai" onClick={play}>{playing ? 'Pause' : 'Play propagation'}</button>
            {rt !== null && <button className="blast__btn" onClick={live}>Back to live</button>}
            <span className="blast__sp" />
            <span className="blast__lbl" role="status">{topoStat.busy ? `topology ${topoStat.done}/${topoStat.total} · ` : liveLinks.length ? `${liveLinks.length} topology link${liveLinks.length === 1 ? '' : 's'}${feed.sample ? ' (sample)' : ''} · ` : ''}{topoStat.err && !feed.sample ? `topology: ${topoStat.err} · ` : ''}{toast ? `${toast} · ` : ''}{rt !== null ? `replaying ${ago(feed.updated - t)}` : 'live'}{model.unattributed ? ` · ${model.unattributed} alerts have no resource` : ''}</span>
          </div>
          <Timeline alerts={feed.alerts} from={span.from} to={span.to} rt={rt} playing={playing} selectedInc={sel.kind === 'inc' ? sel.id : null} changes={changes}
            incs={model.incs.map(im => ({ id: im.inc.id, title: im.inc.title, start: im.start, priority: im.inc.priority, color: incColor(im.inc.id) }))}
            onScrub={v => { setPlaying(false); setRt(v); }} onSelectInc={id => { select({ kind: 'inc', id }); if (mode === 'cosmos') flyTo({ kind: 'inc', id }); }}
            onChange={c => { const i = c.resource ? model.index.get(c.resource) : undefined; tell(`${c.sample ? '[sample] ' : ''}${c.label}${c.resource ? ` on ${c.resource}` : ''} · ${clock(c.time).slice(0, 5)}`); if (i !== undefined) { select({ kind: 'ent', i }); flyTo({ kind: 'ent', i }); } }} />
  </>);
  const iIncidents = (
          <div className="blast__card">
            <h3><span>Incidents</span><span className="blast__lbl">{active.length} open</span></h3>
            <div className="atlas__list">
              {!active.length && <div className="blast__inc is-quiet">No open incident at this moment.</div>}
              {active.map(im => { const s = suspects(model, im, t)[0], on = sel.kind === 'inc' && sel.id === im.inc.id; return (
                <div key={im.inc.id} className={`atlas__inc${on ? ' on' : ''}`} style={{ borderLeftColor: incColor(im.inc.id) }} onClick={() => { select({ kind: 'inc', id: im.inc.id }); if (mode === 'cosmos') flyTo({ kind: 'inc', id: im.inc.id }); }}>
                  <b>P{im.inc.priority || '?'} · {im.inc.title}</b>
                  <small>{im.inc.alertIds.length} alerts · {im.entities.length} resources{s ? ` · cause ${model.entities[s.entity].name} ${Math.round(s.share * 100)}%` : ''}</small>
                </div>); })}
            </div>
          </div>
  );
  const iDetails = (<>
          {sel.kind !== 'none' && (
            <div className="blast__card">
              <h3><span>{selTitle}</span><span style={{ display: 'flex', gap: 8 }}>
                {selEnt && sel.kind === 'ent' && <><button className="blast__btn is-sm" onClick={() => setDeep({ i: sel.i, tab: 0 })}>Deep dive</button><button className="blast__btn is-sm" onClick={() => trace1(sel.i)}>Trace</button><button className="blast__btn is-sm" onClick={() => expandLive({ key: selEnt.name, name: selEnt.name, uniqueId: selEnt.uniqueId })}>Neighbours</button></>}
                {selAlert && <button className="blast__btn is-sm" onClick={() => { const e = entOfAlert(selAlert.id); if (e >= 0) setDeep({ i: e, tab: 4, alert: selAlert.id }); }}>Raw JSON</button>}
                {selInc && <button className="blast__btn is-sm is-ai" disabled={feed.sample} onClick={() => window.open(concertUrl(selInc.inc.id), '_blank')}>Open in Concert</button>}
                {selGhost && <button className="blast__btn is-sm" onClick={() => expandLive({ key: selGhost.id, name: selGhost.name, id: selGhost.sample ? undefined : selGhost.id })}>Expand</button>}
              </span></h3>
              {why()}
            </div>
          )}
          {focusInc && impact && (
            <div className="blast__card">
              <h3><span>Impact</span><span style={{ display: 'flex', gap: 8 }}><button className={`blast__btn is-sm${showImpact ? ' is-on' : ''}`} onClick={() => setShowImpact(v => !v)}>Show on map</button><button className="blast__btn is-sm" onClick={findServices} title="Reads each resource's neighbours from the topology service and lists services among them">Find services</button></span></h3>
              <div className="blast__meta"><b>{impact.services.length}</b> of {focusInc.entities.length} resources face a service ({Math.round(impact.share * 100)}%) · {focusInc.inc.alertIds.length} alerts</div>
              <div className="atlas__chips">{impact.types.slice(0, 6).map(([t, n]) => <span key={t} className="atlas__chip">{t} ×{n}</span>)}</div>
              <div className="atlas__rows">{impact.services.slice(0, 6).map(sv => <a key={sv.i} onClick={() => { select({ kind: 'ent', i: sv.i }); flyTo({ kind: 'ent', i: sv.i }); }}>{sv.name}<small>{sv.why}</small></a>)}</div>
              {atRiskGhosts.length > 0 && <><div className="atlas__sub">Downstream, from topology</div><div className="atlas__rows">{atRiskGhosts.slice(0, 6).map(g => <a key={g.id} onClick={() => { select({ kind: 'ghost', id: g.id }); flyTo({ kind: 'ghost', id: g.id }); }}>{g.name}<small>{g.sample ? 'sample · ' : ''}{g.types[0]}</small></a>)}</div></>}
              {!impact.services.length && !atRiskGhosts.length && <div className="blast__meta">No service-facing resources recognised from entity types or names. Use Find services to look at the neighbours.</div>}
            </div>
          )}
          {focusInc && (
            <div className="blast__card">
              <h3><span>What changed</span></h3>
              {trigger ? <div className="atlas__trigger" onClick={() => { select({ kind: 'ent', i: trigger.e }); flyTo({ kind: 'ent', i: trigger.e }); }}><b>Possible trigger</b>{trigger.c.sample ? ' (sample)' : ''}<br />{trigger.c.label}<br /><small>on {model.entities[trigger.e].name} · {Math.max(0, Math.round(trigger.lead / 60000))} min before the first alert</small></div>
                : <div className="blast__meta">No change, deployment or maintenance events found near this incident{changes.length ? '' : ' (none loaded: alerts of type change/deploy/maintenance, or the changeEvents property)'}.</div>}
            </div>
          )}
          {focusInc && (
            <div className="blast__card">
              <h3><span>Similar incidents</span><span className="blast__lbl">{similar.length || 'none'}</span></h3>
              {similar.length === 0 && <div className="blast__meta">Nothing in this window shares its resources, cause or wording.</div>}
              {similar.map(sm => (
                <div key={sm.im.inc.id} className="atlas__inc" style={{ borderLeftColor: incColor(sm.im.inc.id) }} onClick={() => { if (active.some(a => a === sm.im)) { select({ kind: 'inc', id: sm.im.inc.id }); if (mode === 'cosmos') flyTo({ kind: 'inc', id: sm.im.inc.id }); } else tell(`${sm.im.inc.title}: ${sm.im.inc.state || 'closed'}, not on the map${feed.sample ? '' : ' (open it in Concert Operate)'}`); }}>
                  <b>{Math.round(sm.score * 100)}% · P{sm.im.inc.priority || '?'} {sm.im.inc.title}</b>
                  <small>{sm.im.inc.state || (sm.open ? 'open' : 'closed')}{sm.sameCause ? ' · same cause' : ''} · {sm.shared.length} shared resource{sm.shared.length === 1 ? '' : 's'}{sm.shared.length ? `: ${sm.shared.slice(0, 2).join(', ')}` : ''}</small>
                </div>
              ))}
            </div>
          )}
  </>);
  const iData = (
          <div className="blast__card">
            <h3><span>Data check</span><span className="blast__lbl">{feed.alerts.length} alerts returned</span></h3>
            {(() => {
              const sevN = [6, 5, 4, 3, 2, 1, 0].map(sv => [sv, feed.alerts.filter(a => Math.round(a.severity) === sv).length] as [number, number]);
              const closed = feed.alerts.filter(a => a.closed !== undefined || /clos|clear/i.test(a.state || '')).length, parents = feed.alerts.filter(a => a.children && a.children.length).length, grouped = feed.alerts.filter(a => a.parent).length;
              return <>
                <table className="atlas__tbl"><tbody>
                  {sevN.map(([sv, n]) => <tr key={sv}><td><i style={{ background: SEVERITY_COLORS[sv] }} />{sevLabel(sv)}</td><td>{n}</td></tr>)}
                  <tr><td>Closed / cleared</td><td>{closed}</td></tr><tr><td>Group parents</td><td>{parents}</td></tr><tr><td>Children inside a group</td><td>{grouped}</td></tr>{(['union', 'scope', 'temporal', 'topo'] as GroupMethod[]).map(m => { const s = groupStats(feed0.alerts, m); return <tr key={m}><td>Groups by {m === 'union' ? 'causal union' : m === 'scope' ? 'scope policy' : m === 'temporal' ? 'temporal pattern' : 'topology group'}{gm === m ? ' (in use)' : ''}</td><td>{s.groups} ({s.inGroups} alerts)</td></tr>; })}<tr><td>No resource name (not drawn)</td><td>{model.unattributed}</td></tr>
                  <tr><td><b>Counted as open alerts</b></td><td><b>{frame.open}</b></td></tr>
                </tbody></table>
                {[100, 200, 250, 500, 1000, 2000, 5000, 10000].includes(feed.alerts.length) && <div className="blast__meta" style={{ color: 'var(--cds-support-warning, #b28600)' }}><b>{feed.alerts.length} is a round number: the API may be returning only one page.</b> Tell me and I will add paging.</div>}
                <div className="blast__meta">Every refresh re-reads the whole list (it is replaced, not appended). On the map: <b>{shownAlerts}</b> of {frame.open} open alerts, on {vis.size} of {model.entities.filter(e => e.alerts.some(a => a.severity > 0)).length} resources{showOther ? '' : ' (non-incident resources are hidden: use Show non-incident)'}; collapsed resources hide the rest (+N badges).</div>
                <div className="blast__meta">The Alerts page header counts every returned row by severity. Compare these numbers with it; if they differ, the filter below is the usual reason (a saved view such as "Infrastructure" has its own filter).</div>
                <div className="blast__meta">Filter in use: <code>{feed.filter || '(none)'}</code></div>
                <div className="atlas__filter"><select value={gm} onChange={e => { const v = e.target.value as GroupMethod; setGm(v); try { window.localStorage.setItem('atlas.groupBy', v); } catch (er) { /* storage unavailable */ } }} aria-label="Group alerts by"><option value="union">Group by causal union</option><option value="scope">Group by scope policy</option><option value="temporal">Group by temporal pattern</option><option value="topo">Group by topology group</option><option value="api">No grouping from insights</option></select></div>
                <div className="atlas__filter"><select value={viewName} onChange={e => pickView(e.target.value)} aria-label="Saved alert view"><option value="">{views.length ? 'Saved view: none' : viewsErr ? 'Saved views unavailable' : 'Loading saved views…'}</option>{views.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}</select><select value={win} onChange={e => applyWin(Number(e.target.value))} aria-label="Alert time window"><option value={24}>Last 24 hrs</option><option value={168}>Last 7 days</option><option value={0}>All time</option></select></div>
                <div className="atlas__filter"><input value={filterDraft} placeholder="Paste the alert filter to use" onChange={e => setFilterDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilter(filterDraft); }} aria-label="Alert filter" /><button className="blast__btn is-sm" onClick={() => applyFilter(filterDraft)}>Apply</button>{filterText && <button className="blast__btn is-sm" onClick={() => { setFilterDraft(''); pickView(''); }}>Reset</button>}</div>
              </>;
            })()}
          </div>
  );
  const iHelp = (
          <div className="blast__card">
            <h3><span>How to read this</span></h3>
            <div className="blast__meta">Top layer: incidents. Middle: their alerts. Bottom: the resources they sit on, linked by what caused what. Click anything to light up its whole chain. Right-click for tools; <b>+N</b> badges open more; double-click a resource to dive in.</div>
          </div>
  );
  const iOverlays = (<>
      {deep && model.entities[deep.i] && (() => {
        const en = model.entities[deep.i], im = incOfEnt(deep.i);
        const nb: Neighbour[] = []; model.links.forEach(l => { if (l.a === deep.i || l.b === deep.i) { const o = l.a === deep.i ? l.b : l.a; if (!nb.some(x => x.i === o)) nb.push({ i: o, name: model.entities[o].name, kind: l.kind, dir: l.a === deep.i ? 'out' : 'in', sev: frame.worst[o] }); } });
        return <DeepDive name={en.name} worst={frame.worst[deep.i]} incident={im ? `P${im.inc.priority || '?'} ${im.inc.title}` : undefined} incidentId={im ? im.inc.id : undefined} alerts={en.alerts} byId={byId}
          neighbours={nb} downstream={Math.max(0, reach(model, deep.i).depth.size - 1)} uniqueId={en.uniqueId} entityTypes={Array.from(new Set(en.alerts.flatMap(a => a.entityTypes || [])))}
          topologyApiUrl={props.topologyApiUrl} initialTab={deep.tab} initialAlert={deep.alert} query={feed.sample || !api() ? null : queryApi} metricQueries={props.metricQueries || []} netcoolUrl={props.netcoolWebGuiUrl} sample={feed.sample}
          concertUrl={im && !feed.sample ? concertUrl(im.inc.id) : undefined}
          onClose={() => setDeep(null)} onTraverse={i => { select({ kind: 'ent', i }); flyTo({ kind: 'ent', i }); setDeep({ i, tab: 0 }); }}
          onRemediation={() => remedFor(en.alerts)} />;
      })()}
      {remed && <RemediationConsole alert={remed} onClose={() => setRemed(null)} onExecute={props.onExecuteRemediation} />}
  </>);

  if (__split) {
    // One piece of the dashboard in its own tile (see split-runtime.tsx): the other pieces share this component's data and selection.
    const sections: Record<string, any> = {
      header: iHead, kpis: iKpis, tools: iTools,
      graph: <div className="atlas__solo">{iGraph}</div>,
      playback: iPlay, incidents: iIncidents,
      details: sel.kind === 'none' ? <div className="blast__card"><h3><span>Selected item</span></h3><div className="blast__meta" style={{ padding: 12 }}>Pick an incident, resource or alert to see its impact, what changed and similar incidents here.</div></div> : iDetails,
      datacheck: iData, help: iHelp
    };
    return (
      <>
        {renderSplit(__split, sections, ['header', 'kpis', 'tools', 'graph', 'playback', 'incidents', 'details', 'datacheck', 'help'], (c) => <div className="blast atlas atlas--part" ref={rootEl}>{c}</div>)}
        <div className="blast atlas atlas--ovl" style={{ display: 'contents' }}>{iOverlays}</div>
      </>
    );
  }

  return (
    <div className="blast atlas" ref={rootEl}>
      {iHead}

      <div className="blast__grid atlas__grid">
        <div className="blast__col">
          {iKpis}
          {iTools}

          {iGraph}

          {iPlay}
        </div>

        <div className="blast__col">
          {iIncidents}
          {iDetails}
          {iData}
          {iHelp}
        </div>
      </div>

      {iOverlays}
    </div>
  );
};

/** The whole dashboard, or - with `part` - one piece of it in a tile (header, kpis, tools, graph, playback, incidents, details, datacheck, help). */
const IncidentAtlasDashboard: React.FC<any> = (props) => (props && props.part
  ? <SplitShell name="incident-atlas" part={String(props.part)} Inner={IncidentAtlasInner} innerProps={props} />
  : <IncidentAtlasInner {...props} />);

export default IncidentAtlasDashboard;
