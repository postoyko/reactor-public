/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Blast Radius: live view of what an incident is taking down. Resources are drawn as a graph that arranges itself, with
 * causes on the left and what they affect to the right (links come from Concert Operate's own incident correlation and,
 * when supplied, real topology links). Drag the timeline to replay the last hour. Reads `getAlerts` and `getStories`
 * through the same toolkit API every other dashboard uses.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALERT_QUERY_PARAMS, INCIDENT_QUERY_PARAMS } from '../constants';
import { SavedView, loadViews, urlViewName } from './views';
import {
  Alert, GroupMethod, regroup, groupStats, IncModel, Incident, LAYOUT_MODES, LayoutMode, Layout, SANKEY_BAR_W, Model, TopologyLink, adaptAlertsEx, GroupInfo, adaptIncidents, blastRadius, buildModel, frameAt, frameTimes, layoutLanes, openAt, pathTo, reach, sevLabel, suspects
} from './logic';
import { sampleData } from './sample';
import { DeepDive, MetricQuery, Neighbour, RemediationConsole, RemediationHandler, alertForRemediation } from './Overlays';
import { PANEL_VERSION } from './version';
import { Menu } from './Menu';
import './blast-radius.scss';

export interface BlastRadiusProps {
  /** How often to re-read alerts and incidents. Default 20. */
  refreshSeconds?: number;
  /** How far back the replay timeline goes. Default 60. */
  windowMinutes?: number;
  /** Filter Concert Operate's alertViewer (the route's other region) when something is selected. Default on. */
  syncAlertViewer?: boolean;
  /** false = do not stretch to the window height (used on the route that stacks the alertViewer underneath). Default true. */
  fillWindow?: boolean;
  /** Show the alert table under the graph (movable divider). Default true. */
  alertTable?: boolean;
  /** Alert filter sent to `getAlerts`. Default: the toolkit's own. */
  alertFilter?: string;
  windowHours?: number;
  /** Real adjacency between resources (names as in `resource.name`). Without it the graph uses incident correlation only. */
  topologyLinks?: TopologyLink[];
  /** Open with example data instead of reading the environment. */
  sample?: boolean;
  /**
   * Extra alert columns to request so alert groups (a parent event with child alerts) can be drawn, e.g. ['parentId'].
   * UNVERIFIED: the column name for the parent alert is installation specific, so none is requested unless you set it.
   * Without it, groups appear only when the alert query already returns a parent or child column.
   */
  groupColumns?: string[];
  /** Starting layout: 'lanes' (default), 'tree', 'radial' or 'grid'. */
  layout?: LayoutMode;
  /**
   * Extra items in the right-click menu of a resource. `url` may use {name}, {encodedName}, {incidentId}, {tenant} and
   * {origin}, e.g. { label: 'Open in Grafana', url: 'https://grafana.example.com/d/host?var-host={encodedName}' }.
   */
  nodeLinks?: Array<{ label: string; url: string }>;
  /**
   * Where to ask which version is newest. Default: Concert Workbench on this computer
   * (http://127.0.0.1:4000/api/panel-version/blast-radius). Any URL that returns { "version": "v1.2.3" } works. '' turns the check off.
   * When Studio is not running the check stays silent.
   */
  /** Base URL of the ASM topology REST service (ends /1.0/topology), used by Raw JSON to find a resource by name. Common routes are tried when unset. */
  topologyApiUrl?: string;
  updateUrl?: string;
  /** Adds "View in Netcool / WebGUI" to the resource menu and the Deep Dive drawer. */
  netcoolWebGuiUrl?: string;
  /** Metrics for the Deep Dive "Golden signals" tab: [{ group, metric, label? }]. Names are installation specific, so none are guessed. */
  metricQueries?: MetricQuery[];
  /** Tenant for the Deep Dive queries. Default: the toolkit's. */
  tenantId?: string;
  /** Runs a remediation when "Confirm & Execute" is pressed in the Remediation Console. Without it the console is a simulation. */
  onExecuteRemediation?: RemediationHandler;
}

interface MenuEntry { label?: string; hint?: string; onClick?: () => void; disabled?: boolean; sep?: boolean; head?: boolean }

const api = (): Record<string, (o: object) => Promise<any>> | undefined => (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI;
const ago = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`; };
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const semver = (v: string) => (/(\d+)\.(\d+)\.(\d+)/.exec(v) || [0, 0, 0, 0]).slice(1).map(Number);
const isNewer = (a: string, b: string) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; };
const DEFAULT_UPDATE_URL = 'http://127.0.0.1:4000/api/panel-version/blast-radius';

/** Asks the update URL for the newest version now and every 30 minutes. Returns it only when it is newer than this panel. */
function useNewVersion(url: string | undefined): string | null {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    const u = url === undefined ? DEFAULT_UPDATE_URL : url;
    if (!u) return;
    let off = false;
    const check = () => {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = window.setTimeout(() => ctl && ctl.abort(), 4000);
      fetch(u, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(r => (r.ok ? r.json() : null)).then(j => { if (!off && j && typeof j.version === 'string') setLatest(isNewer(j.version, PANEL_VERSION) ? j.version : null); }).catch(() => { /* Studio not running: stay quiet */ }).then(() => window.clearTimeout(to));
    };
    check(); const id = window.setInterval(check, 30 * 60000);
    return () => { off = true; window.clearInterval(id); };
  }, [url]);
  return latest;
}

/** Field names a group (parent / child) alert might use; asked for once, dropped if the server refuses them. */
const GROUP_PROBE = ['parentId', 'childIds', 'groupId'];

const INC_COLORS = ['#8a3ffc', '#1192e8', '#007d79', '#ee5396', '#b28600', '#9f1853', '#198038', '#0072c3'];

interface Feed { alerts: Alert[]; incidents: Incident[]; status: 'loading' | 'ok' | 'error'; error?: string; updated: number; sample: boolean; groups?: GroupInfo; filter?: string }

function useFeed(p: BlastRadiusProps): [Feed, () => void, () => void] {
  const [feed, setFeed] = useState<Feed>({ alerts: [], incidents: [], status: 'loading', updated: Date.now(), sample: !!p.sample });
  const sampleRef = useRef(!!p.sample);
  const seq = useRef(0);
  const probeOk = useRef<boolean | undefined>(undefined), loggedGroups = useRef(false);
  const load = useCallback(async () => {
    if (sampleRef.current) { const d = sampleData(Date.now()); setFeed({ ...d, status: 'ok', updated: Date.now(), sample: true }); return; }
    const a = api();
    const me = ++seq.current;
    if (!a || typeof a.getAlerts !== 'function' || typeof a.getStories !== 'function') {
      setFeed(f => ({ ...f, status: 'error', error: 'This page is not running inside Concert Operate, so there is no alert or incident data to read.', sample: false }));
      return;
    }
    try {
      const base = String(p.alertFilter || ALERT_QUERY_PARAMS.filter || '');
      const cut = p.windowHours ? new Date(Date.now() - p.windowHours * 3600e3).toISOString() : '';
      const effFilter = cut ? `${base ? base + ' and ' : ''}(firstOccurrenceTime >= '${cut}' or lastOccurrenceTime >= '${cut}')` : base;
      const cols = (extra: string[]) => (extra.length ? [...ALERT_QUERY_PARAMS.columns, ...extra] : ALERT_QUERY_PARAMS.columns);
      const q = (extra: string[]) => a.getAlerts({ tenantId: ALERT_QUERY_PARAMS.tenantId, columns: cols(extra), filter: effFilter, format: ALERT_QUERY_PARAMS.format });
      // Ask for likely group fields too; if the server rejects them, fall back to the normal columns (and remember that).
      const want = [...(p.groupColumns || []), ...(probeOk.current === false ? [] : GROUP_PROBE)].filter((x, i, l) => l.indexOf(x) === i);
      const alertsP = (async () => {
        if (probeOk.current === false || !want.length) return q(p.groupColumns || []);
        try { const r = await q(want); if (r && r.errors && r.errors[0]) throw new Error('probe'); probeOk.current = true; return r; } catch (e) { probeOk.current = false; return q(p.groupColumns || []); }
      })();
      const [ar, ir] = await Promise.all([alertsP, a.getStories({ ...INCIDENT_QUERY_PARAMS, tenantId: ALERT_QUERY_PARAMS.tenantId })]);
      if (me !== seq.current) return;
      const err = (ar && ar.errors && ar.errors[0]) || (ir && ir.errors && ir.errors[0]);
      if (err) throw new Error(String(err.message || 'The query returned an error'));
      const { alerts: al, groups } = adaptAlertsEx(ar, p.groupColumns || []);
      if (!loggedGroups.current) { loggedGroups.current = true; try { console.info('[Blast Radius] alert columns returned:', groups.seenColumns, '| insight types:', groups.seenInsightTypes, '| group fields detected:', [...groups.columns, ...groups.insights]); } catch (e) { /* ignore */ } }
      setFeed({ alerts: al, incidents: adaptIncidents(ir), status: 'ok', updated: Date.now(), sample: false, groups, filter: effFilter });
    } catch (e) {
      if (me === seq.current) setFeed(f => ({ ...f, status: 'error', error: e instanceof Error ? e.message : String(e), sample: false }));
    }
  }, [p.alertFilter, p.groupColumns, p.windowHours]);
  useEffect(() => {
    load();
    const ms = Math.max(5, p.refreshSeconds || 20) * 1000;
    const id = window.setInterval(() => { if (!sampleRef.current) load(); }, ms);
    return () => window.clearInterval(id);
  }, [load, p.refreshSeconds]);
  const useSample = useCallback(() => { sampleRef.current = true; load(); }, [load]);
  const useLive = useCallback(() => { sampleRef.current = false; setFeed(f => ({ ...f, status: 'loading', sample: false, alerts: [], incidents: [] })); load(); }, [load]);
  return [feed, useSample, useLive];
}

/* ---------- graph: lane layout in a larger world, with pan and zoom ---------- */
interface Theme { bg: string; layer: string; ink: string; dim: string; line: string; ok: string; crit: string; major: string; minor: string; warn: string; ai: string; dark: boolean }
const LIGHT: Theme = { bg: '#ffffff', layer: '#f4f4f4', ink: '#161616', dim: '#525252', line: '#e0e0e0', ok: '#24a148', crit: '#da1e28', major: '#ff832b', minor: '#f1c21b', warn: '#4589ff', ai: '#8a3ffc', dark: false };
const DARK: Theme = { bg: '#161616', layer: '#262626', ink: '#f4f4f4', dim: '#c6c6c6', line: '#393939', ok: '#42be65', crit: '#fa4d56', major: '#ff832b', minor: '#f1c21b', warn: '#78a9ff', ai: '#be95ff', dark: true };
/** Reads the host's Carbon theme (g10 / white / g90 / g100) so the canvas matches the page. */
function readTheme(el: HTMLElement): Theme {
  const cs = getComputedStyle(el), v = (n: string) => cs.getPropertyValue(n).trim();
  const bg = v('--cds-background') || v('--cds-layer-01');
  let dark = false;
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.replace('#', '#'));
  if (m) { const n = parseInt(m[1], 16); dark = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 128; }
  else { const r = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(bg); if (r) dark = (0.299 * +r[1] + 0.587 * +r[2] + 0.114 * +r[3]) < 128; }
  const base = dark ? DARK : LIGHT;
  return { ...base, bg: bg || base.bg, layer: v('--cds-layer-01') || base.layer, ink: v('--cds-text-primary') || base.ink, dim: v('--cds-text-secondary') || base.dim, line: v('--cds-border-subtle-01') || base.line };
}
const sevColor = (t: Theme, s: number) => (s >= 6 ? t.crit : ['#8d8d8d', '#a56eff', '#78a9ff', '#4589ff', '#f1c21b', '#ff832b'][Math.min(5, Math.max(0, Math.round(s)))]);
const withAlpha = (hex: string, a: number) => { const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

interface Cam { k: number; x: number; y: number }
interface GraphProps {
  model: Model; h: Float32Array; worst: Uint8Array; layout: Layout; roots: Map<number, number>; focus: Map<number, number> | null;
  selected: number; onSelect: (i: number) => void; paused: boolean; focusLane: { id: string | null; n: number }; wide: boolean; onWide: () => void;
  mode: LayoutMode; onMode: (m: LayoutMode) => void; collapsed: Set<number>; hidden: Set<number>; kids: Map<number, number>; hiddenN: Map<number, number>;
  grp: Map<number, number>; onToggle: (i: number) => void; menuFor: (i: number) => MenuEntry[]; focusLabel: string | null; onClearFocus: () => void;
  onCollapseAll: () => void; onExpandAll: () => void; showOther: boolean; onOther: () => void; hasInc: boolean; resetN: number; selLane: string | null; onLane: (inc: string) => void; onWidth: (w: number) => void; onDeep: (i: number) => void; flyTo: { i: number; n: number };
}
/** Where the collapse/expand badge of a node sits (world coordinates). */
const badgeGeom = (p: { x: number; y: number }, k: number) => { const r = Math.max(11, 4.5 / k); return { x: p.x + r * .95, y: p.y - r * .95, br: Math.max(7, 6 / k) }; };

function Graph(props: GraphProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const P = useRef(props); P.current = props;
  const cam = useRef<Cam>({ k: 1, x: 0, y: 0 });
  const camT = useRef<Cam | null>(null);
  const touched = useRef(false);
  const cur = useRef(new Map<string, { x: number; y: number }>());
  const manual = useRef(new Map<string, { x: number; y: number }>());
  const hover = useRef(-1);
  const gesture = useRef<{ kind: 'node' | 'pan'; i: number; sx: number; sy: number; moved: boolean; cx: number; cy: number } | null>(null);
  const size = useRef({ w: 800, h: 560, dpr: 1 });
  const theme = useRef<Theme>(LIGHT);
  const [tip, setTip] = useState<{ x: number; y: number; i: number } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const sig = props.model.entities.map(e => e.id).join('|') + '#' + props.layout.lanes.map(l => l.inc).join('|') + '#' + Math.round(props.layout.width) + 'x' + Math.round(props.layout.height);
  const [menu, setMenu] = useState<{ x: number; y: number; i: number } | null>(null);
  const [fInc, setFInc] = useState<string | null>(null);
  const fIncRef = useRef<string | null>(null);
  const ghost = useRef<HTMLCanvasElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const bounds = () => { const { w, h } = size.current, L = P.current.layout, m = 80; return { minX: Math.min(m, w - L.width * cam.current.k - m), maxX: m, minY: Math.min(m, h - L.height * cam.current.k - m), maxY: m }; };
  const clampCam = (c: Cam) => { const { w, h } = size.current, L = P.current.layout, m = 80; const minX = Math.min(m, w - L.width * c.k - m), minY = Math.min(m, h - L.height * c.k - m); c.x = Math.min(m, Math.max(minX, c.x)); c.y = Math.min(m, Math.max(minY, c.y)); return c; };
  const fitBox = (bx: number, by: number, bw: number, bh: number, pad: number, maxK: number, topAlign: boolean): Cam => {
    const { w, h } = size.current;
    const k = Math.min(maxK, Math.max(.12, Math.min((w - pad * 2) / bw, topAlign ? 9 : (h - pad * 2) / bh)));
    return { k, x: (w - bw * k) / 2 - bx * k, y: topAlign ? pad - by * k : (h - bh * k) / 2 - by * k };
  };
  const fitWidth = () => { fIncRef.current = null; setFInc(null); const L = P.current.layout; camT.current = fitBox(0, 0, L.width, L.height, 24, 1.4, P.current.mode !== 'combined'); touched.current = false; };
  const zoomTo = (k2: number, cx: number, cy: number, animate: boolean) => {
    const c = camT.current || cam.current, k = Math.min(2.6, Math.max(.12, k2)), wx = (cx - c.x) / c.k, wy = (cy - c.y) / c.k;
    const next = clampCam({ k, x: cx - wx * k, y: cy - wy * k }); touched.current = true;
    if (animate) camT.current = next; else { cam.current = next; camT.current = null; }
  };

  useEffect(() => { if (!touched.current) fitWidth(); }, [sig]);
  useEffect(() => { manual.current.clear(); fitWidth(); }, [props.mode]);
  useEffect(() => { manual.current.clear(); }, [props.resetN]);
  useEffect(() => {
    if (props.flyTo.n <= 0) return;
    const e = P.current.model.entities[props.flyTo.i], p = e && cur.current.get(e.id); if (!p) return;
    const { w, h } = size.current, k = 1.5; camT.current = { k, x: w / 2 - p.x * k, y: h / 2 - p.y * k }; touched.current = true;
  }, [props.flyTo.n]);
  useEffect(() => {
    const L = P.current.layout, b = L.lanes.find(l => l.inc === props.focusLane.id);
    if (b && props.focusLane.n > 0) { fIncRef.current = b.inc; setFInc(b.inc); camT.current = fitBox(b.x, b.y, b.w, b.h, Math.round(Math.min(size.current.w, size.current.h) * .14), 1.6, false); touched.current = true; }
  }, [props.focusLane.n]);

  useEffect(() => {
    const cv = ref.current as HTMLCanvasElement, box = wrap.current as HTMLDivElement;
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    const fit = () => { const r = box.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); size.current = { w: r.width, h: r.height, dpr }; P.current.onWidth(r.width); cv.width = r.width * dpr; cv.height = r.height * dpr; if (!touched.current) fitWidth(); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(box);
    const onWheel = (e: WheelEvent) => {
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo((camT.current || cam.current).k * Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? .01 : .0025)), mx, my, false); return; }
      const c = camT.current || cam.current, before = { x: c.x, y: c.y };
      const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
      const next = clampCam({ k: c.k, x: c.x - dx, y: c.y - dy });
      if (next.x !== before.x || next.y !== before.y) { e.preventDefault(); touched.current = true; cam.current = next; camT.current = null; }
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    let raf = 0, themeAt = 0, zp = 100;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = (now: number) => {
      if (now - themeAt > 2000) { theme.current = readTheme(box); themeAt = now; }
      const T = theme.current, { model, h, worst, layout, roots, focus, selected, paused } = P.current, { w: W, h: H, dpr } = size.current;
      const ents = model.entities;
      // camera tween
      if (camT.current) { const c = cam.current, t = camT.current, e = reduce ? 1 : .2; c.k += (t.k - c.k) * e; c.x += (t.x - c.x) * e; c.y += (t.y - c.y) * e; if (Math.abs(t.k - c.k) < .002 && Math.abs(t.x - c.x) < .4 && Math.abs(t.y - c.y) < .4) { cam.current = { ...t }; camT.current = null; } }
      const C = cam.current, pct = Math.round(C.k * 100); if (pct !== zp) { zp = pct; setZoomPct(pct); }
      // positions ease toward their lane slots
      const live = new Set<string>(); const pos: Array<{ x: number; y: number }> = [];
      ents.forEach((e, i) => {
        live.add(e.id);
        const m = manual.current.get(e.id), tx = m ? m.x : layout.x[i], ty = m ? m.y : layout.y[i];
        let p = cur.current.get(e.id); if (!p) { p = { x: tx, y: ty - 40 }; cur.current.set(e.id, p); }
        const f = reduce ? 1 : .18; p.x += (tx - p.x) * f; p.y += (ty - p.y) * f; pos.push(p);
      });
      cur.current.forEach((_, k) => { if (!live.has(k)) cur.current.delete(k); });
      // draw
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(dpr * C.k, 0, 0, dpr * C.k, dpr * C.x, dpr * C.y);
      const px = 1 / C.k, sc = (base: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, base * C.k)) / C.k, r = Math.min(26, sc(11, 5, 15)), dim0 = (i: number) => (focus && !focus.has(i) ? .5 : 1);
      const nb = layout.lanes.length, boxOf = (i: number) => (layout.lane[i] >= 0 ? layout.lane[i] : nb - 1);
      const paint = (ctx: CanvasRenderingContext2D, base: number, inPass: (b: number) => boolean) => {
      const dim = (i: number) => base * dim0(i);
      // lanes
      layout.lanes.forEach((l, li) => {
        if (!inPass(li)) return; ctx.globalAlpha = base;
        ctx.fillStyle = T.layer; ctx.fillRect(l.x, l.y, l.w, l.h);
        const sel = !!l.inc && l.inc === P.current.selLane;
        ctx.strokeStyle = sel ? (T.dark ? '#78a9ff' : '#0f62fe') : T.line; ctx.lineWidth = (sel ? 2.5 : 1) * Math.max(1, px); ctx.setLineDash(l.inc ? [] : [6 * px, 4 * px]); ctx.strokeRect(l.x, l.y, l.w, l.h); ctx.setLineDash([]);
        if (l.inc) { ctx.fillStyle = l.priority === 1 ? T.crit : l.priority === 2 ? T.major : T.warn; ctx.fillRect(l.x, l.y, 4, l.h); }
        const fs = Math.min(24, sc(14, 10, 17));
        ctx.font = `600 ${fs}px IBM Plex Sans, -apple-system, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillStyle = T.ink;
        const head = `${l.inc ? 'P' + (l.priority || '?') + '  ' : ''}${l.title}`;
        const maxCh = Math.max(8, Math.floor((l.w - 30) / (fs * .58))); ctx.fillText(head.length > maxCh ? head.slice(0, maxCh - 1) + '…' : head, l.x + 18, l.y + 12 + fs * .8);
        if (P.current.mode === 'combined') {
          let lx = l.x + 140; const sq = Math.min(14, sc(9, 7, 10)), tf = Math.min(18, sc(11, 9, 12));
          ctx.font = `400 ${tf}px IBM Plex Sans, -apple-system, system-ui, sans-serif`;
          model.incs.forEach((im, ii) => { const t = im.inc.title.length > 26 ? im.inc.title.slice(0, 25) + '…' : im.inc.title, tw = ctx.measureText(t).width; if (lx + sq + tw + 24 > l.x + l.w) return; ctx.fillStyle = INC_COLORS[ii % INC_COLORS.length]; const ly = l.y + 14 + fs * 1.6 + 6 * px; ctx.fillRect(lx, ly, sq, sq); ctx.fillStyle = T.ink; ctx.textAlign = 'left'; ctx.fillText(t, lx + sq + 5, ly + sq * .9); lx += sq + tw + 24; });
        }
        const fs2 = Math.min(18, sc(11, 9, 12)); ctx.font = `400 ${fs2}px IBM Plex Mono, ui-monospace, monospace`; ctx.fillStyle = T.dim;
        ctx.fillText(`${l.count} resource${l.count === 1 ? '' : 's'}`, l.x + 18, l.y + 14 + fs * 1.6 + fs2 * .5);
      });
      // heat
      ents.forEach((_, i) => {
        if (h[i] >= .9 || P.current.hidden.has(i) || !inPass(boxOf(i))) return; const p = pos[i], sev = 1 - h[i], R = 70 + sev * 90, g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R), col = sevColor(T, worst[i]);
        g.addColorStop(0, withAlpha(col, (T.dark ? .3 : .22) * sev * dim(i))); g.addColorStop(1, withAlpha(col, 0)); ctx.fillStyle = g; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
      });
      // links
      const t = paused || reduce ? 0 : now * .001;
      const sankey = P.current.mode === 'sankey' || P.current.mode === 'combined', comb = P.current.mode === 'combined', selI = P.current.selLane;
      if (sankey) {
        // Sankey lineage: ribbons whose ends share the bar height of each node, so thickness shows how much of a node's alerts flows on.
        const out = new Map<number, number[]>(), inn = new Map<number, number[]>();
        model.links.forEach((l, k) => { const s = pos[l.a], d = pos[l.b]; if (!s || !d || l.kind === 'topology' && !(layout.lane[l.a] >= 0) || P.current.hidden.has(l.a) || P.current.hidden.has(l.b) || d.x <= s.x + 4 || !layout.bar[l.a] || !layout.bar[l.b]) return; (out.get(l.a) || out.set(l.a, []).get(l.a) as number[]).push(k); (inn.get(l.b) || inn.set(l.b, []).get(l.b) as number[]).push(k); });
        out.forEach(ks => ks.sort((x, y) => pos[model.links[x].b].y - pos[model.links[y].b].y));
        inn.forEach(ks => ks.sort((x, y) => pos[model.links[x].a].y - pos[model.links[y].a].y));
        model.links.forEach((l, k) => {
          const oi = (out.get(l.a) || []).indexOf(k), ii = (inn.get(l.b) || []).indexOf(k); if (oi < 0 || ii < 0 || !inPass(boxOf(l.a))) return;
          const s = pos[l.a], d = pos[l.b], so = (out.get(l.a) as number[]).length, di = (inn.get(l.b) as number[]).length, sh = layout.bar[l.a] / so, dh = layout.bar[l.b] / di;
          const sy = s.y - layout.bar[l.a] / 2 + oi * sh, dy = d.y - layout.bar[l.b] / 2 + ii * dh, x0 = s.x + SANKEY_BAR_W / 2, x1 = d.x - SANKEY_BAR_W / 2, mx = (x0 + x1) / 2;
          const hot = Math.min(h[l.a], h[l.b]) < .9; ctx.globalAlpha = base * dim0(l.a) * dim0(l.b);
          let col = l.kind === 'group' ? T.warn : l.kind === 'topology' ? T.dim : sevColor(T, worst[l.b]), a0 = hot ? (T.dark ? .45 : .38) : .14;
          if (comb) { const ii = l.inc ? model.incs.findIndex(x => x.inc.id === l.inc) : -1; col = ii >= 0 ? INC_COLORS[ii % INC_COLORS.length] : T.dim; a0 = l.inc ? (selI ? (l.inc === selI ? .6 : .07) : .38) : .1; }
          ctx.fillStyle = withAlpha(col, a0);
          ctx.beginPath(); ctx.moveTo(x0, sy); ctx.bezierCurveTo(mx, sy, mx, dy, x1, dy); ctx.lineTo(x1, dy + dh); ctx.bezierCurveTo(mx, dy + dh, mx, sy + sh, x0, sy + sh); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = base;
        });
      }
      model.links.forEach((l, k) => {
        if (sankey) return;
        const s = pos[l.a], d = pos[l.b]; if (!s || !d || P.current.hidden.has(l.a) || P.current.hidden.has(l.b) || !inPass(boxOf(l.a))) return;
        const hot = Math.min(h[l.a], h[l.b]) < .9, al = base * dim0(l.a) * dim0(l.b);
        ctx.globalAlpha = al; ctx.lineWidth = (hot ? 1.4 : 1) * px * 1.2;
        ctx.strokeStyle = l.kind === 'causal' ? withAlpha(T.ai, hot ? .45 : .18) : l.kind === 'group' ? withAlpha(T.warn, hot ? .8 : .45) : withAlpha(T.dim, .35); ctx.setLineDash(l.kind === 'topology' ? [5 * px, 4 * px] : l.kind === 'group' ? [2 * px, 3 * px] : []);
        const mx = (s.x + d.x) / 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.bezierCurveTo(mx, s.y, mx, d.y, d.x, d.y); ctx.stroke(); ctx.setLineDash([]);
        if (l.kind !== 'topology' && hot && C.k > .45) { const u = (t * .3 + k * .13) % 1, uu = 1 - u, bx = uu * uu * uu * s.x + 3 * uu * uu * u * mx + 3 * uu * u * u * mx + u * u * u * d.x, by = uu * uu * uu * s.y + 3 * uu * uu * u * s.y + 3 * uu * u * u * d.y + u * u * u * d.y; ctx.fillStyle = sevColor(T, worst[l.b]); ctx.beginPath(); ctx.arc(bx, by, 3 * Math.max(1, px), 0, 7); ctx.fill(); }
        ctx.globalAlpha = base;
      });
      // nodes
      const showAll = C.k >= .4, lf = sc(11, 8, 14);
      const { hidden, kids, hiddenN, collapsed, grp } = P.current;
      ents.forEach((e, i) => {
        if (hidden.has(i) || !inPass(boxOf(i))) return;
        const p = pos[i], bad = h[i] < .9, c = bad ? sevColor(T, worst[i]) : T.ok;
        ctx.globalAlpha = dim(i);
        if (sankey && layout.bar[i]) {
          const bh = layout.bar[i] || 24, bx = p.x - SANKEY_BAR_W / 2; ctx.fillStyle = bad ? c : withAlpha(T.dim, .55); ctx.fillRect(bx, p.y - bh / 2, SANKEY_BAR_W, bh);
          if (i === selected || i === hover.current) { ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5 * Math.max(1, px); ctx.strokeRect(bx - 3, p.y - bh / 2 - 3, SANKEY_BAR_W + 6, bh + 6); }
          if (showAll || roots.has(i) || i === selected || i === hover.current) { const nf = showAll ? lf : Math.min(26, 10 / C.k); ctx.font = `400 ${nf}px IBM Plex Mono, ui-monospace, monospace`; ctx.textAlign = 'left'; ctx.fillStyle = bad ? T.ink : T.dim; const mc = Math.max(6, Math.min(20, Math.floor(120 / (.6 * nf)))), nm = e.name.length > mc ? e.name.slice(0, mc - 1) + '…' : e.name; ctx.fillText(nm, bx + SANKEY_BAR_W + 6, p.y - 2); ctx.fillStyle = T.dim; ctx.fillText(`${e.alerts.length} alert${e.alerts.length === 1 ? '' : 's'}`, bx + SANKEY_BAR_W + 6, p.y + nf * 1.2); }
          ctx.globalAlpha = base; return;
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fillStyle = T.bg; ctx.fill(); ctx.lineWidth = (bad ? 2.4 : 1.6) * Math.max(1, px * .8); ctx.strokeStyle = bad ? c : withAlpha(T.dim, .55); ctx.stroke();
        if (bad) { ctx.beginPath(); ctx.arc(p.x, p.y, r * .5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h[i]); ctx.lineWidth = 2.2 * Math.max(1, px * .8); ctx.strokeStyle = c; ctx.stroke(); }
        const arrive = focus && focus.has(i) ? ((t * .9 - (focus.get(i) as number) * .5) % 3) : -1;
        if (arrive >= 0 && arrive < 1) { ctx.strokeStyle = withAlpha(T.ai, (1 - arrive) * .8); ctx.lineWidth = 1.5 * Math.max(1, px); ctx.beginPath(); ctx.arc(p.x, p.y, r + 3 + arrive * 22, 0, 7); ctx.stroke(); }
        if (i === selected || i === hover.current) { ctx.setLineDash([3 * Math.max(1, px), 3 * Math.max(1, px)]); ctx.strokeStyle = T.ink; ctx.lineWidth = Math.max(1, px); ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
        if (showAll || roots.has(i) || i === selected || i === hover.current) {
          const nf = showAll ? lf : Math.min(26, 10 / C.k); ctx.font = `400 ${nf}px IBM Plex Mono, ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = bad ? T.ink : T.dim;
          const mc = Math.max(6, Math.min(24, Math.floor(184 / (.6 * nf)))), nm = e.name.length > mc ? e.name.slice(0, mc - 1) + '…' : e.name; ctx.fillText(nm, p.x, p.y + r + nf * 1.35);
        }
        const nk = kids.get(i) || 0, ng = grp.get(i) || 0;
        if (ng && C.k >= .4) {
          const gx = p.x - r * .95, gy = p.y - r * .95, txt = `×${ng}`, gw = 8 + txt.length * 6 * Math.max(1, px * .8), gh = 13 * Math.max(1, px * .8);
          ctx.fillStyle = T.bg; ctx.strokeStyle = T.warn; ctx.lineWidth = Math.max(1, px); ctx.beginPath(); ctx.rect(gx - gw / 2, gy - gh / 2, gw, gh); ctx.fill(); ctx.stroke();
          ctx.font = `600 ${9 * Math.max(1, px * .8)}px IBM Plex Mono, ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = T.warn; ctx.fillText(txt, gx, gy + 3.2 * Math.max(1, px * .8));
        }
        if (nk && (C.k >= .4 || collapsed.has(i))) {
          const b = badgeGeom(p, C.k), open = !collapsed.has(i), lbl = open ? '−' : `+${hiddenN.get(i) || nk}`, bw = open ? b.br * 2 : Math.max(b.br * 2, (lbl.length * 6.4 + 8) * Math.max(1, px * .8));
          ctx.fillStyle = open ? T.bg : T.ai; ctx.strokeStyle = open ? T.dim : T.ai; ctx.lineWidth = Math.max(1, px);
          ctx.beginPath(); if (open) ctx.arc(b.x, b.y, b.br, 0, 7); else ctx.rect(b.x - bw / 2, b.y - b.br, bw, b.br * 2); ctx.fill(); ctx.stroke();
          ctx.font = `600 ${(open ? 13 : 10) * Math.max(1, px * .8)}px IBM Plex Mono, ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = open ? T.ink : '#fff'; ctx.fillText(lbl, b.x, b.y + (open ? 4.2 : 3.4) * Math.max(1, px * .8));
        }
        ctx.globalAlpha = base;
      });
      roots.forEach((conf, i) => {
        if (h[i] >= .9 || hidden.has(i) || !inPass(boxOf(i))) return; ctx.globalAlpha = base; const p = pos[i], R = r + 12;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(reduce || paused ? 0 : now * .0012); ctx.strokeStyle = T.ai; ctx.lineWidth = 1.8 * Math.max(1, px * .8);
        for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, R, -.35, .35); ctx.stroke(); ctx.beginPath(); ctx.moveTo(R + 3, 0); ctx.lineTo(R + 8, 0); ctx.stroke(); }
        ctx.restore();
        if (C.k >= .4) { const cf = Math.min(18, sc(10, 8, 12)); ctx.font = `600 ${cf}px IBM Plex Mono, ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = T.ai; ctx.fillText(`LIKELY CAUSE ${Math.round(conf * 100)}%`, p.x, p.y - R - cf * .7); }
      });
      ctx.globalAlpha = 1;
      };
      const fi = fIncRef.current ? layout.lanes.findIndex(l => l.inc === fIncRef.current) : -1;
      if (fi >= 0) {
        // The other lanes are drawn small and scaled back up, which softens them cheaply (no canvas filter).
        const gw = Math.max(1, Math.ceil(W * dpr / 3)), gh = Math.max(1, Math.ceil(H * dpr / 3));
        const g = ghost.current || (ghost.current = document.createElement('canvas'));
        if (g.width !== gw || g.height !== gh) { g.width = gw; g.height = gh; }
        const gx = g.getContext('2d') as CanvasRenderingContext2D;
        gx.setTransform(1, 0, 0, 1, 0, 0); gx.clearRect(0, 0, gw, gh);
        gx.setTransform(dpr * C.k / 3, 0, 0, dpr * C.k / 3, dpr * C.x / 3, dpr * C.y / 3);
        paint(gx, .6, bb => bb !== fi);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = .55; ctx.drawImage(g, 0, 0, gw, gh, 0, 0, W * dpr, H * dpr); ctx.globalAlpha = 1;
        ctx.setTransform(dpr * C.k, 0, 0, dpr * C.k, dpr * C.x, dpr * C.y);
        paint(ctx, 1, bb => bb === fi);
      } else paint(ctx, 1, () => true);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener('wheel', onWheel); };
  }, []);

  const world = (e: React.PointerEvent | React.MouseEvent) => { const b = (ref.current as HTMLCanvasElement).getBoundingClientRect(), sx = e.clientX - b.left, sy = e.clientY - b.top, c = cam.current; return { sx, sy, x: (sx - c.x) / c.k, y: (sy - c.y) / c.k }; };
  const hit = (wx: number, wy: number) => {
    const ents = P.current.model.entities, k = cam.current.k, rr = Math.max(15, 11 / k);
    for (let i = ents.length - 1; i >= 0; i--) { if (P.current.hidden.has(i)) continue; const p = cur.current.get(ents[i].id); if (p && (Math.hypot(p.x - wx, p.y - wy) < rr || ((P.current.mode === 'sankey' || P.current.mode === 'combined') && Math.abs(p.x - wx) < 10 && Math.abs(p.y - wy) < (P.current.layout.bar[i] || 0) / 2))) return i; }
    return -1;
  };
  const hitBadge = (wx: number, wy: number) => {
    const ents = P.current.model.entities, k = cam.current.k;
    for (let i = ents.length - 1; i >= 0; i--) {
      if (P.current.hidden.has(i) || !(P.current.kids.get(i) || 0)) continue; const p = cur.current.get(ents[i].id); if (!p) continue;
      const b = badgeGeom(p, k); if (Math.hypot(b.x - wx, b.y - wy) < b.br + (P.current.collapsed.has(i) ? 8 : 3) / Math.min(1, k)) return i;
    }
    return -1;
  };
  const down = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    setMenu(null);
    const w = world(e), bi = hitBadge(w.x, w.y);
    if (bi >= 0) { props.onToggle(bi); return; }
    const i = hit(w.x, w.y);
    gesture.current = { kind: i >= 0 ? 'node' : 'pan', i, sx: e.clientX, sy: e.clientY, moved: false, cx: cam.current.x, cy: cam.current.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const g = gesture.current, w = world(e);
    if (g) {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > 3) g.moved = true;
      if (g.moved && g.kind === 'pan') { touched.current = true; camT.current = null; cam.current = clampCam({ ...cam.current, x: g.cx + dx, y: g.cy + dy }); }
      if (g.moved && g.kind === 'node') manual.current.set(P.current.model.entities[g.i].id, { x: w.x, y: w.y });
      return;
    }
    const i = hit(w.x, w.y); hover.current = i; setTip(i >= 0 ? { x: w.sx, y: w.sy, i } : null);
  };
  const up = (e: React.PointerEvent) => {
    const g = gesture.current; gesture.current = null;
    if (!g || g.moved) return;
    if (g.i >= 0) { props.onSelect(g.i); return; }
    const w = world(e), lane = P.current.layout.lanes.find(l => l.inc && w.x >= l.x && w.x <= l.x + l.w && w.y >= l.y && w.y <= l.y + l.h);
    if (lane && lane.inc) props.onLane(lane.inc); else props.onSelect(-1);
  };
  const onCtx = (e: React.MouseEvent) => {
    e.preventDefault(); const w = world(e), i = hit(w.x, w.y); gesture.current = null;
    setMenu({ x: w.sx, y: w.sy, i }); setTip(null);
  };
  useEffect(() => {
    if (!menu) return;
    const first = menuRef.current && menuRef.current.querySelector('button:not(:disabled)'); if (first) (first as HTMLElement).focus();
    const away = (ev: Event) => { if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenu(null); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const menuKeys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault(); const bs = Array.from((menuRef.current as HTMLElement).querySelectorAll('button:not(:disabled)')) as HTMLElement[], at = bs.indexOf(document.activeElement as HTMLElement);
    bs[(at + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus();
  };
  const stageW = size.current.w;
  const te = tip ? props.model.entities[tip.i] : null;
  const zoomBy = (f: number) => { const { w, h } = size.current; zoomTo((camT.current || cam.current).k * f, w / 2, h / 2, true); };
  const entries = menu ? props.menuFor(menu.i) : [];
  return (
    <div className="blast__graph">
      <div className="blast__tools">
        <Menu label={`Layout: ${(LAYOUT_MODES.find(m => m.id === props.mode) || LAYOUT_MODES[0]).label}`} title="How the graph is arranged" items={LAYOUT_MODES.map(m => ({ label: m.label, hint: m.hint, radio: true, checked: props.mode === m.id, onClick: () => props.onMode(m.id) }))} />
        <Menu label="Actions" items={[
          { label: 'Collapse all', hint: 'Hide the effects under every cause', onClick: props.onCollapseAll },
          { label: 'Expand all', hint: 'Show every resource again', onClick: props.onExpandAll },
          { divider: true, label: '' },
          { label: 'Non-incident resources', checked: props.showOther, disabled: !props.hasInc, hint: 'Hide or show resources that are not part of an incident', onClick: props.onOther },
          { label: props.wide ? 'Show side panels' : 'Widen graph', onClick: props.onWide }
        ]} />
        {fInc && <button className="blast__chip is-focus" onClick={fitWidth} title="Back to all incidents">{(props.layout.lanes.find(l => l.inc === fInc) || { title: 'Incident' }).title.slice(0, 40)} · show all ✕</button>}
        {props.focusLabel && <button className="blast__chip is-focus" onClick={props.onClearFocus} title="Clear focus">{props.focusLabel} ✕</button>}
        <span className="blast__sp" />
        <div className="blast__zoom" role="group" aria-label="Graph view">
          <button onClick={() => zoomBy(1.3)} aria-label="Zoom in" title="Zoom in">+</button>
          <button onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out" title="Zoom out">−</button>
          <button onClick={fitWidth} aria-label="Fit to width" title="Fit to width (double-click the canvas)">Fit</button>
          <button onClick={props.onWide} aria-label={props.wide ? 'Show side panels' : 'Widen graph'} title={props.wide ? 'Show side panels' : 'Widen graph'}>{props.wide ? '⇥' : '⇤'}</button>
          <span>{zoomPct}%</span>
        </div>
      </div>
      <div className="blast__legend"><span><i style={{ background: '#24a148' }} />no open alert</span><span><i style={{ background: '#8d8d8d' }} />info only (no glow)</span><span><i style={{ background: '#f1c21b' }} />minor</span><span><i style={{ background: '#ff832b' }} />major</span><span><i style={{ background: '#da1e28' }} />critical</span><span><i style={{ background: '#8a3ffc' }} />likely cause</span><span><i className="sq" style={{ borderColor: '#4589ff' }} />alert group ×children</span><span>− / + collapse a resource's effects</span></div>
      <div className={`blast__stage${props.wide ? ' is-wide' : ''}`} ref={wrap}>
        <canvas ref={ref} style={{ cursor: gesture.current ? 'grabbing' : tip ? 'pointer' : 'grab' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onContextMenu={onCtx} onPointerLeave={() => { hover.current = -1; setTip(null); }} onDoubleClick={e => { const w = world(e), i = hit(w.x, w.y); if (i >= 0) props.onDeep(i); else fitWidth(); }} aria-label="Graph of affected resources, grouped by incident. Right-click a resource for its menu." />
        {te && tip && !menu && (
          <div className="blast__tip" style={{ left: Math.min(tip.x, stageW - 240), top: tip.y }}>
            <b>{te.name}</b><br />worst open alert: {sevLabel(P.current.worst[tip.i])} · {te.alerts.length} alert(s) in window<br />right-click for more
          </div>
        )}
        {menu && (
          <div className="blast__menu" ref={menuRef} role="menu" onKeyDown={menuKeys} onContextMenu={e => e.preventDefault()} style={{ left: Math.max(4, Math.min(menu.x, stageW - 350)), top: Math.max(4, Math.min(menu.y, size.current.h - Math.min(entries.length * 32 + 12, size.current.h - 8))) }}>
            {entries.map((en, k) => en.sep ? <div key={k} className="sep" role="separator" /> : en.head ? <div key={k} className="head">{en.label}</div> : (
              <button key={k} role="menuitem" disabled={en.disabled} onClick={() => { setMenu(null); if (en.onClick) en.onClick(); }}><span>{en.label}</span>{en.hint && <small>{en.hint}</small>}</button>
            ))}
          </div>
        )}
        <div className="blast__hint">scroll to pan · Ctrl/⌘ + scroll to zoom · drag to move · right-click for menu</div>
      </div>
    </div>
  );
}

/* ---------- dashboard ---------- */
const BlastRadiusDashboard: React.FC<BlastRadiusProps> = (props) => {
  const [win, setWin] = useState(() => { try { const v = window.localStorage.getItem('blast.window'); return v === null ? 24 : Number(v); } catch (e) { return 24; } });
  const [filterText, setFilterText] = useState(() => { try { return window.localStorage.getItem('blast.alertFilter') || ''; } catch (e) { return ''; } });
  const [gm, setGm] = useState<GroupMethod>(() => { try { return (window.localStorage.getItem('blast.groupBy') as GroupMethod) || 'union'; } catch (e) { return 'union'; } });
  const [feed0, loadSample, loadLive] = useFeed({ ...props, alertFilter: filterText.trim() || props.alertFilter, windowHours: win || undefined });
  const feed = useMemo(() => ({ ...feed0, alerts: regroup(feed0.alerts, feed0.sample ? 'api' : gm) }), [feed0, gm]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsErr, setViewsErr] = useState('');
  const [viewName, setViewName] = useState(() => { try { return urlViewName() || window.localStorage.getItem('blast.view') || ''; } catch (e) { return ''; } });
  const store = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
  const applyFilter = (v: string) => { setFilterText(v); store('blast.alertFilter', v); };
  const pickView = (n: string) => { setViewName(n); store('blast.view', n); const v = views.find(x => x.name === n); applyFilter(v ? v.clause : ''); };
  useEffect(() => { if (feed0.sample) return; let ok = true; loadViews(api()).then(l => { if (!ok) return; setViews(l); if (viewName && !filterText) { const v = l.find(x => x.name === viewName); if (v) applyFilter(v.clause); } }).catch(e => { if (ok) setViewsErr(e instanceof Error ? e.message : String(e)); }); return () => { ok = false; }; }, [feed0.sample]); // eslint-disable-line react-hooks/exhaustive-deps
  const windowMin = props.windowMinutes || 60;
  const [view, setView] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [mode, setMode] = useState<'raw' | 'grp'>('raw');
  const [incSel, setIncSel] = useState<string | null>(null);
  const [laneFocus, setLaneFocus] = useState(0);
  const [wide, setWide] = useState(false);
  const [mode0, setMode0] = useState<LayoutMode>(props.layout || 'lanes');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [cfocus, setCfocus] = useState<{ label: string; map: Map<number, number> } | null>(null);
  const [splitPct, setSplitPct] = useState(() => { try { const v = Number(window.localStorage.getItem('blast.split')); return v >= 20 && v <= 85 ? v : 58; } catch (e) { return 58; } });
  const [scopeInc, setScopeInc] = useState(false);
  const [tabOpen, setTabOpen] = useState<Set<string>>(new Set());
  const splitRef = useRef<HTMLDivElement>(null);
  const moveSplit = (clientY: number) => { const el = splitRef.current; if (!el) return; const r = el.getBoundingClientRect(); const p = Math.min(85, Math.max(20, ((clientY - r.top) / Math.max(1, r.height)) * 100)); setSplitPct(p); };
  const endSplit = () => { try { window.localStorage.setItem('blast.split', String(Math.round(splitPct))); } catch (e) { /* storage unavailable */ } };
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');
  const [resetN, setResetN] = useState(0);
  const [stageW, setStageW] = useState(0);
  const [deep, setDeep] = useState<string | null>(null);
  const [remed, setRemed] = useState<Alert | null>(null);
  const [fly, setFly] = useState({ i: -1, n: 0 });
  const tenant = props.tenantId || ALERT_QUERY_PARAMS.tenantId;
  const queryApi = useCallback((name: string, options: Record<string, unknown>) => {
    const fn = api() && (api() as any)[name];
    if (typeof fn !== 'function') return Promise.reject(new Error(`The ${name} query is not available in this environment.`));
    return fn({ tenantId: tenant, ...options });
  }, [tenant]);
  const newer = useNewVersion(props.updateUrl);
  const rootEl = useRef<HTMLDivElement>(null);
  // Fill the window: the host page does not give the panel a height, so measure what is left below the panel's top edge.
  useEffect(() => {
    const fit = () => { const el = rootEl.current; if (!el) return; if (props.fillWindow === false) { el.style.minHeight = ''; return; } const h = Math.max(520, Math.round(window.innerHeight - Math.max(0, el.getBoundingClientRect().top) - 4)); if (el.style.minHeight !== h + 'px') el.style.minHeight = h + 'px'; };
    fit(); window.addEventListener('resize', fit); const id = window.setInterval(fit, 1500);
    return () => { window.removeEventListener('resize', fit); window.clearInterval(id); };
  }, []);
  const [dismissed, setDismissed] = useState('');
  const [vw, setVw] = useState(0);
  useEffect(() => { const f = () => setVw(w => w + 1); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

  const model = useMemo(() => buildModel(feed.alerts, feed.incidents, props.topologyLinks || []), [feed.alerts, feed.incidents, props.topologyLinks]);
  const entKey = model.entities.map(e => e.id).join('|');
  const collapsedNames = useRef<Set<string>>(new Set());
  const collapsedIdx = useMemo(() => { const set = new Set<number>(); collapsedNames.current.forEach(n => { const i = model.index.get(n); if (i !== undefined) set.add(i); }); return set; }, [entKey, collapsed]);
  const times = useMemo(() => frameTimes(feed.alerts, feed.updated, windowMin), [feed.alerts, feed.updated, windowMin]);
  const live = view === null || view >= times.length - 1;
  const t = live ? feed.updated : times[Math.min(view as number, times.length - 1)];
  const frame = useMemo(() => frameAt(model, t), [model, t]);
  const series = useMemo(() => times.map(x => frameAt(model, x).open), [model, times]);

  const active = useMemo(() => model.incs.filter(im => im.start <= t && im.entities.some(e => frame.h[e] < .9)).sort((a, b) => a.inc.priority - b.inc.priority || b.entities.length - a.entities.length), [model, frame, t]);
  const focusIm = active.find(a => a.inc.id === incSel) || (selected >= 0 ? active.find(a => a.entities.includes(selected)) : undefined) || active[0];
  const sus = useMemo(() => (focusIm ? suspects(model, focusIm, t) : []), [model, focusIm, t]);
  const roots = useMemo(() => { const m = new Map<number, number>(); active.forEach(im => { const s = suspects(model, im, t)[0]; if (s) m.set(s.entity, s.share); }); return m; }, [model, active, t]);
  const peak = useMemo(() => { const p = new Uint8Array(model.entities.length); model.entities.forEach((e, i) => e.alerts.forEach(a => { p[i] = Math.max(p[i], Math.min(6, Math.max(0, Math.round(a.severity)))); })); return p; }, [model]);
  const laneKey = active.map(a => a.inc.id).join('|');
  const reaches = useMemo(() => active.map(im => ({ im, ...reach(model, im.root, collapsedIdx) })), [model, laneKey, collapsedIdx]);
  const [showOther, setShowOther] = useState(true);
  const hidden = useMemo(() => {
    const vis = new Set<number>(); reaches.forEach(r => r.depth.forEach((_, e) => vis.add(e)));
    const hid = new Set<number>(); const inLane = new Set<number>(); active.forEach(im => reach(model, im.root).depth.forEach((_, e) => inLane.add(e)));
    inLane.forEach(e => { if (!vis.has(e)) hid.add(e); });
    if (!showOther && active.length) model.entities.forEach((_, e) => { if (!inLane.has(e)) hid.add(e); });
    return hid;
  }, [reaches, model, laneKey, showOther]);
  const kids = useMemo(() => { const m = new Map<number, number>(); const seen = new Set<string>(); model.links.forEach(l => { if (l.kind === 'topology') return; const k = `${l.a}>${l.b}`; if (seen.has(k)) return; seen.add(k); m.set(l.a, (m.get(l.a) || 0) + 1); }); return m; }, [model]);
  const hiddenN = useMemo(() => { const m = new Map<number, number>(); collapsedIdx.forEach(c => { let n = 0; reach(model, c).depth.forEach((_, e) => { if (e !== c && hidden.has(e)) n++; }); m.set(c, n); }); return m; }, [collapsedIdx, hidden, model]);
  const grp = useMemo(() => { const m = new Map<number, number>(); model.entities.forEach((e, i) => { const n = e.alerts.reduce((a, x) => a + (x.children ? x.children.length : 0), 0); if (n) m.set(i, n); }); return m; }, [model]);
  const layout = useMemo(() => layoutLanes(model, reaches, peak, mode0, hidden, Math.max(1000, Math.round(((stageW || 1300) / .75) / 100) * 100)), [model, reaches, peak, mode0, hidden, stageW]);
  const focus = useMemo(() => (cfocus ? cfocus.map : focusIm && selected >= 0 ? blastRadius(model, focusIm.root) : null), [model, focusIm, selected, cfocus]);

  const incAlerts = useMemo(() => { const set = new Set<string>(); active.forEach(im => im.inc.alertIds.forEach(id => set.add(id))); return set; }, [active]);
  const openAlerts = useMemo(() => feed.alerts.filter(a => openAt(a, t) && a.severity > 0), [feed.alerts, t]);
  const inInc = openAlerts.filter(a => incAlerts.has(a.id)).length;
  const hot = frame.h.reduce((n, v) => n + (v < .9 ? 1 : 0), 0);

  const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;
  // Concert Operate's alertViewer filters itself from the page route (filtername / filterwhereclause), as the Monitor Boxes, Top N and Heatmap panels use it.
  const pushViewer = (clause: string, name: string) => {
    if (props.syncAlertViewer !== true || feed.sample) return;
    try {
      const u = new URL(window.location.href);
      if (clause) { u.searchParams.set('filtername', name); u.searchParams.set('filterwhereclause', clause); } else { u.searchParams.delete('filtername'); u.searchParams.delete('filterwhereclause'); }
      if (u.toString() === window.location.href) return;
      window.history.replaceState({}, '', u.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) { /* no router here */ }
  };
  const viewerResource = (i: number) => { const e = model.entities[i]; if (e) pushViewer(`resource.name = ${sq(e.name)}`, `Resource ${e.name}`); };
  const viewerIncident = (id: string) => { const im = active.find(x => x.inc.id === id); if (im) pushViewer(im.inc.alertIds.slice(0, 60).map(x => `id = ${sq(x)}`).join(' or '), `Incident ${im.inc.title}`.slice(0, 80)); };
  const select = (i: number) => { if (i >= 0) viewerResource(i); else pushViewer('', ''); select0(i); };
  const select0 = (i: number) => { setCfocus(null); setSelected(i); if (i >= 0) { const im = active.find(a => a.entities.includes(i)); if (im) setIncSel(im.inc.id); } };
  const concertUrl = (id: string) => `${window.location.origin}/aiops/${ALERT_QUERY_PARAMS.tenantId}/resolution-hub/incidents/all/${id}/overview`;
  const tell = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 2600); };
  const copy = (txt: string, what: string) => {
    const done = () => tell(`Copied ${what}`);
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done, () => tell('Copy was blocked by the browser')); return; } } catch (e) { /* fall through */ }
    tell('Copy was blocked by the browser');
  };
  const toggle = (i: number) => { const n = model.entities[i].name; if (collapsedNames.current.has(n)) collapsedNames.current.delete(n); else collapsedNames.current.add(n); setCollapsed(new Set(collapsedNames.current)); };
  const collapseAll = () => { active.forEach(im => collapsedNames.current.add(model.entities[im.root].name)); setCollapsed(new Set(collapsedNames.current)); };
  const expandAll = () => { collapsedNames.current.clear(); setCollapsed(new Set()); };
  const fill = (u: string, e: number, im?: IncModel) => u.replace(/\{origin\}/g, window.location.origin).replace(/\{tenant\}/g, ALERT_QUERY_PARAMS.tenantId).replace(/\{name\}/g, model.entities[e].name).replace(/\{encodedName\}/g, encodeURIComponent(model.entities[e].name)).replace(/\{incidentId\}/g, im ? im.inc.id : '');
  const ticketText = (e: number, im?: IncModel) => {
    const en = model.entities[e], open = en.alerts.filter(a => openAt(a, t));
    return [`Resource: ${en.name}`, im ? `Incident: P${im.inc.priority || '?'} ${im.inc.title} (${im.inc.id})` : 'Incident: none', `Open alerts: ${open.length}`, ...open.slice(0, 20).map(a => `- [${sevLabel(a.severity)}] ${a.summary} (${a.sender || 'unknown source'}, ${clock(a.first)})`)].join('\n');
  };
  const menuFor = (i: number): MenuEntry[] => {
    if (i < 0) {
      return [
        { head: true, label: 'Graph' },
        ...LAYOUT_MODES.map(m => ({ label: `Layout: ${m.label}`, hint: m.id === mode0 ? '✓' : '', onClick: () => setMode0(m.id) })),
        { sep: true },
        { label: 'Reset dragged positions', onClick: () => setResetN(n => n + 1) },
        { label: showOther ? 'Hide non-incident resources' : 'Show non-incident resources', onClick: () => setShowOther(v => !v), disabled: !active.length }, { label: 'Collapse every cause', onClick: collapseAll }, { label: 'Expand all', onClick: expandAll },
        { label: 'Clear focus', disabled: !cfocus && !(incSel || selected >= 0), onClick: () => { pushViewer('', ''); setScopeInc(false); setCfocus(null); setSelected(-1); setIncSel(null); } }
      ];
    }
    const en = model.entities[i], im = active.find(a => a.entities.includes(i)), isRoot = !!im && im.root === i, nk = kids.get(i) || 0, open = en.alerts.filter(a => openAt(a, t));
    const pathLen = im ? pathTo(model, im.root, i) : [i];
    return [
      { head: true, label: `NE: ${en.name} · ${open.length ? sevLabel(frame.worst[i]) : 'no open alert'}` },
      { label: 'Fly-To & Focus Node', onClick: () => { setSelected(i); setFly(f => ({ i, n: f.n + 1 })); } },
      { label: 'Open Deep Dive Diagnostics', onClick: () => setDeep(en.id) },
      ...(props.netcoolWebGuiUrl ? [{ label: 'View in Netcool / WebGUI', onClick: () => window.open(props.netcoolWebGuiUrl, '_blank', 'noopener,noreferrer') }] : []),
      { label: 'Open Remediation Console', disabled: !en.alerts.length, onClick: () => { const a = alertForRemediation(en.alerts.filter(x => openAt(x, t)).length ? en.alerts.filter(x => openAt(x, t)) : en.alerts); if (a) setRemed(a); } },
      { sep: true },
      { label: `Show alerts (${open.length})`, onClick: () => select(i) },
      { label: 'Focus: what this affects', hint: `${blastRadius(model, i).size - 1} downstream`, onClick: () => { setSelected(i); setCfocus({ label: `Downstream of ${en.name}`, map: blastRadius(model, i) }); } },
      { label: 'Focus: path from the cause', hint: isRoot ? 'this is the cause' : `${pathLen.length - 1} hop${pathLen.length === 2 ? '' : 's'}`, disabled: !im || isRoot, onClick: () => { setSelected(i); setCfocus({ label: `Path to ${en.name}`, map: new Map(pathLen.map((e, k) => [e, k] as [number, number])) }); } },
      { sep: true },
      { label: collapsedNames.current.has(en.name) ? `Expand ${hiddenN.get(i) || nk} hidden` : 'Collapse effects', disabled: !nk, hint: nk ? `${nk} direct` : 'no effects', onClick: () => toggle(i) },
      { label: 'Reset dragged positions', onClick: () => setResetN(n => n + 1) },
      { sep: true },
      { label: 'Open incident in Concert Operate', disabled: !im || feed.sample, onClick: () => window.open(concertUrl((im as IncModel).inc.id), '_blank') },
      ...(props.nodeLinks || []).map(l => ({ label: l.label, onClick: () => window.open(fill(l.url, i, im), '_blank', 'noopener') })),
      { label: 'Copy resource name', onClick: () => copy(en.name, 'resource name') },
      { label: 'Copy details for a ticket', onClick: () => copy(ticketText(i, im), 'details') }
    ];
  };
  const tl = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = tl.current; if (!c) return; const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = r.width * dpr; c.height = r.height * dpr; const x = c.getContext('2d') as CanvasRenderingContext2D; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
    const T = readTheme(c), blue = T.dark ? '#78a9ff' : '#0f62fe';
    const mx = Math.max(1, ...series), X = (i: number) => i / Math.max(1, series.length - 1) * r.width, Y = (v: number) => r.height - 6 - v / mx * (r.height - 14);
    x.beginPath(); x.moveTo(0, r.height); series.forEach((v, i) => x.lineTo(X(i), Y(v))); x.lineTo(r.width, r.height); x.closePath();
    const g = x.createLinearGradient(0, 0, 0, r.height); g.addColorStop(0, withAlpha(blue, .25)); g.addColorStop(1, withAlpha(blue, 0)); x.fillStyle = g; x.fill();
    x.beginPath(); series.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.strokeStyle = blue; x.lineWidth = 1.5; x.stroke();
    model.incs.forEach(im => { const i = times.findIndex(tt => tt >= im.start); if (i >= 0) { x.fillStyle = T.crit; x.fillRect(X(i) - .5, 0, 1, r.height); } });
    const pi = live ? series.length - 1 : (view as number); x.fillStyle = T.ink; x.fillRect(X(pi) - 1, 0, 2, r.height);
  }, [series, model, times, view, live, vw, wide]);

  const deepIdx = deep !== null ? model.index.get(deep) : undefined;
  const deepEnt = deepIdx !== undefined ? model.entities[deepIdx] : null;
  const alertById = useMemo(() => new Map(feed.alerts.map(a => [a.id, a] as [string, Alert])), [feed.alerts]);
  const deepInc = deepIdx !== undefined ? model.incs.find(im => im.entities.includes(deepIdx)) : undefined;
  const deepRank = deepEnt ? deepEnt.alerts.map(a => deepInc ? deepInc.inc.ranks[a.id] : a.rank).filter(r => r !== undefined).sort((a, b) => (a as number) - (b as number))[0] : undefined;
  const deepNeighbours = useMemo((): Neighbour[] => {
    if (deepIdx === undefined) return [];
    const out: Neighbour[] = [], seen = new Set<string>();
    model.links.forEach(l => {
      const add = (o: number, dir: 'out' | 'in') => { const k = `${o}|${dir}|${l.kind}`; if (seen.has(k)) return; seen.add(k); out.push({ i: o, name: model.entities[o].name, kind: l.kind === 'causal' ? 'incident correlation' : l.kind === 'group' ? 'alert group' : 'topology link', dir, sev: frame.worst[o] }); };
      if (l.a === deepIdx) add(l.b, 'out'); else if (l.b === deepIdx) add(l.a, 'in');
    });
    return out.sort((x, y) => y.sev - x.sev);
  }, [deepIdx, model, frame]);
  const empty = feed.status === 'ok' && model.entities.length === 0;
  const selEnt = selected >= 0 ? model.entities[selected] : null;
  const openById = useMemo(() => new Map(openAlerts.map(a => [a.id, a] as [string, Alert])), [openAlerts]);
  const resOf = (a: Alert) => model.index.get((a.resource || a.sender || '').split('/').pop()?.split(':::')[0]?.trim() || '');
  const scopeIm = incSel ? active.find(x => x.inc.id === incSel) : undefined;
  const scope: 'resource' | 'incident' | 'all' = selected >= 0 ? 'resource' : scopeInc && scopeIm ? 'incident' : 'all';
  const scoped = useMemo(() => {
    let l = openAlerts;
    if (scope === 'resource') l = l.filter(a => resOf(a) === selected);
    else if (scope === 'incident' && scopeIm) { const ids = new Set(scopeIm.inc.alertIds); l = l.filter(a => ids.has(a.id)); }
    return l;
  }, [openAlerts, scope, selected, scopeIm, model]); // eslint-disable-line react-hooks/exhaustive-deps
  const gridRows = useMemo(() => {
    const ids = new Set(scoped.map(a => a.id)), by = new Map(scoped.map(a => [a.id, a] as [string, Alert]));
    const tops = scoped.filter(a => !(a.parent && ids.has(a.parent))).sort((x, y) => y.severity - x.severity || y.last - x.last);
    const groups = tops.filter(a => (a.children || []).some(c => ids.has(c))).length;
    return { tops, by, groups };
  }, [scoped]);
  const topRows = openAlerts.filter(a => !(a.parent && openById.has(a.parent))).sort((a, b) => b.first - a.first).slice(0, 80);
  const kidsOf = (a: Alert) => (a.children || []).map(id => openById.get(id)).filter(Boolean).sort((x, y) => (y as Alert).severity - (x as Alert).severity) as Alert[];
  const toggleGroup = (id: string) => setOpenGroups(g => { const n = new Set(g); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alertRow = (a: Alert, child: boolean) => {
    const ch = child ? [] : kidsOf(a), open = openGroups.has(a.id);
    return (
      <React.Fragment key={a.id}>
        <div className={`blast__al${child ? ' is-child' : ''}`} onClick={() => { const i = model.index.get((a.resource || a.sender || '').split('/').pop()?.split(':::')[0]?.trim() || ''); if (i !== undefined) select(i); }}>
          <span className="t">{clock(a.first).slice(0, 5)}</span>
          <span className="x"><span className={`sev s${Math.round(a.severity)}`}>{sevLabel(a.severity)}</span>{a.summary}{ch.length > 0 && <button className="blast__grpbtn" aria-expanded={open} onClick={e => { e.stopPropagation(); toggleGroup(a.id); }}>{open ? '▾' : '▸'} group · {ch.length} child alert{ch.length === 1 ? '' : 's'}</button>}<small>{a.resource || a.sender || 'unknown'} · {a.sender || ''}</small></span>
        </div>
        {open && ch.map(c => alertRow(c, true))}
      </React.Fragment>
    );
  };
  const groups = useMemo(() => {
    const g = new Map<string, { title: string; n: number; worst: number; last: Alert }>();
    const byId = new Map(openAlerts.map(a => [a.id, a] as [string, Alert]));
    openAlerts.forEach(a => {
      const head = a.parent && byId.has(a.parent) ? (byId.get(a.parent) as Alert) : a;
      const grouped = !!(a.parent || (a.children && a.children.length));
      const k = grouped ? head.id : '—';
      const o = g.get(k) || { title: grouped ? head.summary || head.resource || 'Alert group' : 'Not in any alert group', n: 0, worst: 0, last: a };
      o.n++; o.worst = Math.max(o.worst, a.severity); if (a.first > o.last.first) o.last = a; g.set(k, o);
    });
    return Array.from(g.entries()).sort((a, b) => (a[0] === '—' ? 1 : b[0] === '—' ? -1 : b[1].worst - a[1].worst));
  }, [openAlerts]);

  return (
    <div className={`blast${props.fillWindow === false ? ' is-compact' : ''}`} ref={rootEl}>
      <header className="blast__head">
        <div className="blast__brand"><h1>Blast Radius</h1><span>{PANEL_VERSION} · what each incident is taking down</span></div>
        <div className="blast__chips">
          <span className="blast__chip">{clock(t)}</span>
          {feed.sample ? <span className="blast__chip is-sample">SAMPLE DATA</span> : feed.status === 'ok' ? <span className={`blast__chip ${live ? 'is-live' : 'is-replay'}`}><i />{live ? `LIVE · updated ${clock(feed.updated)}` : 'REPLAY'}</span> : feed.status === 'loading' ? <span className="blast__chip">Loading…</span> : <span className="blast__chip is-err">No data</span>}
          {!feed.sample && feed.status === 'ok' && feed.groups && <span className="blast__chip" title={feed.groups.links ? `Alert groups read from: ${[...feed.groups.columns, ...feed.groups.insights].join(', ')}` : `No parent/child fields found in the alert data. Columns returned: ${feed.groups.seenColumns.join(', ')}. Insight types: ${feed.groups.seenInsightTypes.join(', ') || 'none'}. Set the groupColumns property to name the field.`}>{feed.groups.links ? `Groups: ${feed.groups.links} linked` : 'Groups: none found'}</span>}
          {feed.sample && <button className="blast__btn" onClick={loadLive}>Use live data</button>}
        </div>
      </header>

      {newer && dismissed !== newer && (
        <div className="blast__banner is-update" role="status"><div><b>A new version of Blast Radius is available: {newer}.</b> This page is running {PANEL_VERSION}. In Concert Workbench use "Install &amp; add route" (or Build &amp; Deploy), then reload this page.</div><button className="blast__btn" onClick={() => setDismissed(newer)}>Dismiss</button></div>
      )}

      {feed.status === 'error' && (
        <div className="blast__banner"><div><b>Could not read alerts and incidents.</b> {feed.error}</div><button className="blast__btn" onClick={loadSample}>Load sample data</button></div>
      )}

      <div className={`blast__grid${wide ? ' is-wide' : ''}`}>
        <div className="blast__col">
          <div className="blast__kpis">
            <div className="blast__kpi"><small>Open alerts</small><strong>{frame.open}</strong><em>{frame.critical} critical</em></div>
            <div className="blast__kpi"><small>Resources affected</small><strong>{hot}</strong><em>of {model.entities.length} with alerts</em></div>
            <div className="blast__kpi"><small>Incidents</small><strong>{active.length}</strong><em>{active.filter(a => a.inc.priority === 1).length} at priority 1</em></div>
            <div className="blast__kpi"><small>Alerts → incidents</small><strong>{inInc} → {active.length}</strong><em>{active.length && inInc ? `${Math.round((1 - active.length / inInc) * 100)}% fewer things to read` : 'nothing correlated'}</em></div>
          </div>

          {empty ? (
            <div className="blast__stage blast__empty"><div><b>No open alerts in this window.</b><br />The graph fills in as alerts arrive.{feed.sample ? '' : ' To see it with example data, load the sample.'}<br />{!feed.sample && <button className="blast__btn" onClick={loadSample}>Load sample data</button>}</div></div>
          ) : (
            <div className="blast__split" ref={splitRef}>
              <div className="blast__pane" style={props.alertTable === false ? { flex: '1 1 auto' } : { flex: `0 0 ${splitPct}%` }}>
                <Graph model={model} h={frame.h} worst={frame.worst} layout={layout} roots={roots} focus={focus} selected={selected} onSelect={select} paused={paused} focusLane={{ id: incSel, n: laneFocus }} wide={wide} onWide={() => setWide(w => !w)} mode={mode0} onMode={setMode0} collapsed={collapsedIdx} hidden={hidden} kids={kids} hiddenN={hiddenN} grp={grp} onToggle={toggle} menuFor={menuFor} focusLabel={cfocus ? cfocus.label : null} onClearFocus={() => setCfocus(null)} onCollapseAll={collapseAll} onExpandAll={expandAll} showOther={showOther} onOther={() => setShowOther(v => !v)} hasInc={active.length > 0} resetN={resetN} onDeep={i => setDeep(model.entities[i].id)} flyTo={fly} selLane={focusIm ? focusIm.inc.id : null} onLane={id => { setCfocus(null); setSelected(-1); setIncSel(id); setLaneFocus(n => n + 1); }} onWidth={w => setStageW(Math.round(w / 100) * 100)} />
              </div>
              {props.alertTable !== false && <>
                <div className="blast__divider" role="separator" aria-orientation="horizontal" aria-label="Drag to resize the graph and alert table" tabIndex={0}
                  onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
                  onPointerMove={e => { if ((e.buttons & 1) === 1) moveSplit(e.clientY); }}
                  onPointerUp={endSplit}
                  onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setSplitPct(p => { const n = Math.min(85, Math.max(20, p + (e.key === 'ArrowUp' ? -4 : 4))); try { window.localStorage.setItem('blast.split', String(n)); } catch (er) { /* storage unavailable */ } return n; }); } }}
                  onDoubleClick={() => setSplitPct(58)}><span /></div>
                <div className="blast__pane blast__agrid" style={{ flex: '1 1 0' }}>
                  <div className="blast__ahead">
                    <b>Alerts</b>
                    <span className="blast__lbl">{scope === 'resource' && selected >= 0 ? `on ${model.entities[selected]?.name}` : scope === 'incident' && scopeIm ? `in ${scopeIm.inc.title}` : 'all open alerts'}</span>
                    {scope !== 'all' && <button className="blast__btn is-sm" onClick={() => { setSelected(-1); setScopeInc(false); setCfocus(null); }}>Show all</button>}
                    <span className="blast__sp" />
                    <span className="blast__lbl">Showing: {scoped.length} alerts, {gridRows.groups} groups</span>
                  </div>
                  <div className="blast__atbl-wrap">
                    <table className="blast__atbl">
                      <thead><tr><th>Sev</th><th>Summary</th><th>Resource</th><th>Sender</th><th>State</th><th>First</th><th>Last</th></tr></thead>
                      <tbody>
                        {gridRows.tops.slice(0, 400).flatMap(a => {
                          const kids = (a.children || []).map(c => gridRows.by.get(c)).filter(Boolean).sort((x, y) => (y as Alert).severity - (x as Alert).severity) as Alert[];
                          const open = tabOpen.has(a.id);
                          const row = (r: Alert, child: boolean, n: number) => (
                            <tr key={r.id} className={child ? 'is-child' : ''} onClick={() => { const i = resOf(r); if (i !== undefined) select(i); }}>
                              <td><span className={`sev s${Math.round(r.severity)}`}>{sevLabel(r.severity)}</span></td>
                              <td className="sum">{n > 0 && <button className="blast__grpbtn" aria-expanded={open} onClick={e => { e.stopPropagation(); setTabOpen(g => { const x = new Set(g); if (x.has(r.id)) x.delete(r.id); else x.add(r.id); return x; }); }}>{open ? '▾' : '▸'} group · {n}</button>}{r.summary}</td>
                              <td>{r.resource || '-'}</td><td>{r.sender || ''}</td><td>{r.state}</td><td>{clock(r.first)}</td><td>{clock(r.last)}</td>
                            </tr>
                          );
                          return [row(a, false, kids.length), ...(open ? kids.map(k => row(k, true, 0)) : [])];
                        })}
                        {!gridRows.tops.length && <tr><td colSpan={7} className="blast__lbl">No open alerts here.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>}
            </div>
          )}

          <div className="blast__bar">
            <button className="blast__btn" onClick={() => setPaused(p => !p)}>{paused ? 'Play motion' : 'Pause motion'}</button>
            {!live && <button className="blast__btn is-ai" onClick={() => setView(null)}>Back to live</button>}
            <span className="blast__sp" />
            <span className="blast__lbl" role="status">{toast ? `${toast} · ` : ''}{model.unattributed ? `${model.unattributed} alerts have no resource and are not drawn · ` : ''}{['incident correlation', model.links.some(l => l.kind === 'group') ? 'alert groups' : '', model.links.some(l => l.kind === 'topology') ? 'topology' : ''].filter(Boolean).join(' + ').replace(/^/, 'links: ')}</span>
          </div>

          <div className="blast__tl">
            <div className="blast__tlhead"><span className="blast__lbl">Replay · last {windowMin} min</span><span className="blast__lbl">{live ? 'live' : `${ago(feed.updated - t)} · drag right to return`}</span></div>
            <div className="blast__tlbox">
              <canvas ref={tl} />
              <input className="blast__range" type="range" min={0} max={Math.max(0, times.length - 1)} step={1} value={live ? times.length - 1 : (view as number)} onChange={e => { const v = Number(e.target.value); setView(v >= times.length - 1 ? null : v); }} aria-label="Replay position" />
            </div>
          </div>
        </div>

        <div className="blast__col">
          <div className="blast__card">
            <h3><span>Incident correlation</span><span className="blast__lbl">{focusIm ? (focusIm.source === 'ranking' ? 'probable-cause ranking' : 'earliest alert') : ''}</span></h3>
            {!focusIm ? <div className="blast__inc is-quiet">No open incident at this moment.</div> : (
              <div className="blast__inc">
                {active.length > 1 && <div className="blast__tabs">{active.map(a => <button key={a.inc.id} className={a === focusIm ? 'on' : ''} onClick={() => { viewerIncident(a.inc.id); setScopeInc(true); setIncSel(a.inc.id); setSelected(-1); setLaneFocus(n => n + 1); }}>P{a.inc.priority || '?'} · {a.inc.title.length > 22 ? a.inc.title.slice(0, 21) + '…' : a.inc.title}</button>)}</div>}
                <div className="blast__meta">P{focusIm.inc.priority || '?'} · started {ago(t - focusIm.start)} · {focusIm.inc.state || 'open'}</div>
                <div className="blast__tt">{focusIm.inc.title}</div>
                <div className="blast__meta"><span className="is-ai">{openAlerts.filter(a => focusIm.inc.alertIds.includes(a.id)).length} alerts → 1 incident</span> · {blastRadius(model, focusIm.root).size} resources in the blast radius</div>
                {sus.slice(0, 3).map((s, k) => (
                  <div key={s.entity} className={`blast__sus${k ? '' : ' is-first'}`} onClick={() => select(s.entity)}>
                    <span className="rk">#{k + 1}</span><span className="nm">{model.entities[s.entity].name}</span><span className="pc">{Math.round(s.share * 100)}%</span>
                    <div className="track"><div className="fill" style={{ width: `${Math.round(s.share * 100)}%` }} /></div>
                  </div>
                ))}
                <div className="blast__bar"><button className="blast__btn is-ai" onClick={() => window.open(concertUrl(focusIm.inc.id), '_blank')} disabled={feed.sample}>Open incident in Concert Operate</button></div>
              </div>
            )}
          </div>

          {selEnt && (
            <div className="blast__card">
              <h3><span>{selEnt.name}</span><span style={{ display: 'flex', gap: 8 }}><button className="blast__btn is-sm" onClick={() => setDeep(selEnt.id)}>Deep dive</button><button className="blast__btn is-sm" onClick={() => { const a = alertForRemediation(selEnt.alerts); if (a) setRemed(a); }} disabled={!selEnt.alerts.length}>Remediation</button><button className="blast__btn is-sm" onClick={() => setSelected(-1)}>Close</button></span></h3>
              <div className="blast__feed">{selEnt.alerts.filter(a => openAt(a, t)).sort((a, b) => b.severity - a.severity).slice(0, 8).map(a => (
                <div className="blast__al" key={a.id}><span className="t">{clock(a.first).slice(0, 5)}</span><span className="x"><span className={`sev s${Math.round(a.severity)}`}>{sevLabel(a.severity)}</span>{a.summary}{a.parent && openById.has(a.parent) && <small>in group: {(openById.get(a.parent) as Alert).summary}</small>}{a.children && a.children.length > 0 && <small>alert group · {a.children.length} child alert{a.children.length === 1 ? '' : 's'}</small>}<small>{a.sender || 'unknown source'}</small></span></div>
              ))}{!selEnt.alerts.some(a => openAt(a, t)) && <div className="blast__al"><span /><span className="x blast__lbl">No open alerts at this time.</span></div>}</div>
            </div>
          )}

          <div className="blast__card">
            <div className="blast__meta" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <select value={gm} onChange={e => { setGm(e.target.value as GroupMethod); store('blast.groupBy', e.target.value); }} aria-label="Group alerts by"><option value="union">Group: causal union ({groupStats(feed0.alerts, 'union').groups})</option><option value="scope">Group: scope policy ({groupStats(feed0.alerts, 'scope').groups})</option><option value="temporal">Group: temporal ({groupStats(feed0.alerts, 'temporal').groups})</option><option value="topo">Group: topology ({groupStats(feed0.alerts, 'topo').groups})</option><option value="api">No insight grouping</option></select>
              <select value={win} onChange={e => { const v = Number(e.target.value); setWin(v); store('blast.window', String(v)); }} aria-label="Alert time window"><option value={24}>Last 24 hrs</option><option value={168}>Last 7 days</option><option value={0}>All time</option></select>
              <select value={viewName} onChange={e => pickView(e.target.value)} aria-label="Saved alert view"><option value="">{views.length ? 'Saved view: none' : viewsErr ? 'Saved views unavailable' : 'Loading saved views…'}</option>{views.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}</select>
              <span>{feed0.alerts.length} alerts returned · filter: <code>{feed0.filter || '(default)'}</code></span>
            </div>
            <h3><span>Alert stream</span><span className="blast__seg"><button className={mode === 'raw' ? 'on' : ''} onClick={() => setMode('raw')}>Raw</button><button className={mode === 'grp' ? 'on' : ''} onClick={() => setMode('grp')}>By group</button></span></h3>
            <div className="blast__feed">
              {mode === 'raw' ? topRows.map(a => alertRow(a, false)) : groups.map(([k, g]) => (
                <div className="blast__al" key={k}><span className="t">{clock(g.last.first).slice(0, 5)}</span><span className="x"><span className={`sev s${Math.round(g.worst)}`}>{sevLabel(g.worst)}</span>{g.title} <b>×{g.n}</b><small>{g.last.summary}</small></span></div>
              ))}
              {!openAlerts.length && <div className="blast__al"><span /><span className="x blast__lbl">No open alerts.</span></div>}
            </div>
          </div>
        </div>
      </div>
      {deepIdx !== undefined && deepEnt && (
        <DeepDive name={deepEnt.name} worst={frame.worst[deepIdx]} rank={deepRank} incident={deepInc ? `P${deepInc.inc.priority || '?'} ${deepInc.inc.title}` : undefined} alerts={deepEnt.alerts} byId={alertById}
          neighbours={deepNeighbours} downstream={blastRadius(model, deepIdx).size - 1} uniqueId={deepEnt.uniqueId} entityTypes={Array.from(new Set(deepEnt.alerts.flatMap(a => a.entityTypes || [])))}
          topologyApiUrl={props.topologyApiUrl} query={feed.sample || !api() ? null : queryApi} metricQueries={props.metricQueries || []} netcoolUrl={props.netcoolWebGuiUrl} sample={feed.sample}
          concertUrl={deepInc && !feed.sample ? concertUrl(deepInc.inc.id) : undefined}
          onClose={() => setDeep(null)} onTraverse={i => { select(i); setFly(f => ({ i, n: f.n + 1 })); setDeep(model.entities[i].id); }}
          onRemediation={() => { const a = alertForRemediation(deepEnt.alerts); if (a) setRemed(a); }} />
      )}
      {remed && <RemediationConsole alert={remed} onClose={() => setRemed(null)} onExecute={props.onExecuteRemediation} />}
    </div>
  );
};

export default BlastRadiusDashboard;
