/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The canvas: three layers (incidents on top, alerts in the middle, topology at the bottom) drawn in perspective, with
 * threads that tie an incident to its alerts and an alert to its resource. Pan, zoom, rotate; click to follow a chain;
 * right-click for tools; double-click to dive in.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, IncModel, Layout, Model } from './logic';
import { Chain, Ghost, GhostLink, Proj, Sel, Tree, VIEWS, ViewId, alertSpot, fitProj, project } from './atlas-logic';
import { MenuEntry } from './feed';
import { Theme, readTheme, sevColor, withAlpha } from './theme';

export interface Tile { im: IncModel; x: number; y: number; alerts: number; resources: number; cause: string; share: number }
export interface PlacedGhost { g: Ghost; x: number; y: number }
export interface Cmd { n: number; type: 'in' | 'out' | 'fit' | 'rotL' | 'rotR' | 'tiltUp' | 'tiltDown' }
export interface StageProps {
  model: Model; h: Float32Array; worst: Uint8Array; trees: Tree[]; incColor: (id: string) => string;
  layout: Layout; planeW: number; planeH: number; ghosts: PlacedGhost[]; ghostLinks: GhostLink[];
  vis: Set<number>; hiddenKids: Map<number, number>; alertsAt: (i: number) => Alert[]; tiles: Tile[]; byId: Map<string, Alert>;
  roots: Map<number, number>; sel: Sel; chain: Chain | null; lit: (i: number) => boolean; litAge: (i: number) => number;
  layers: { inc: boolean; alert: boolean; topo: boolean }; view: ViewId; cmd: Cmd; flyTo: { sel: Sel; n: number }; paused: boolean;
  onSelect: (s: Sel) => void; onOpen: (s: Sel) => void; onMore: (i: number) => void; menuFor: (s: Sel | null) => MenuEntry[]; tipFor: (s: Sel) => React.ReactNode;
}

interface Sprite { k: 'ent' | 'alert' | 'inc' | 'ghost' | 'more'; key: string; x: number; y: number; r: number; w?: number; h?: number }
const GAPF: Record<ViewId, number> = { stack: 0.4, flat: 0.72, side: 0.42 };
const selOf = (s: Sprite): Sel => (s.k === 'alert' ? { kind: 'alert', id: s.key } : s.k === 'inc' ? { kind: 'inc', id: s.key } : s.k === 'ghost' ? { kind: 'ghost', id: s.key } : { kind: 'ent', i: Number(s.key) });
export const selKey = (s: Sel): string => (s.kind === 'ent' ? `e${s.i}` : s.kind === 'none' ? '' : `${s.kind[0]}${s.kind === 'inc' || s.kind === 'alert' || s.kind === 'ghost' ? s.id : ''}`);
const spriteKey = (s: Sprite): string => (s.k === 'more' ? `e${s.key}` : s.k === 'ent' ? `e${s.key}` : `${s.k[0]}${s.key}`);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function Stage(props: StageProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const P = useRef(props); P.current = props;
  const size = useRef({ w: 800, h: 520, dpr: 1 });
  const cam = useRef({ touched: false, k: 1, ox: 0, oy: 0 });
  const rot = useRef<{ yaw: number; tilt: number; gapF: number; user: boolean }>({ yaw: VIEWS.stack.yaw, tilt: VIEWS.stack.tilt, gapF: GAPF.stack, user: false });
  const sprites = useRef<Sprite[]>([]);
  const lastProj = useRef<Proj | null>(null);
  const hover = useRef('');
  const gesture = useRef<{ x: number; y: number; sx: number; sy: number; rotate: boolean; moved: boolean } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; sel: Sel } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; sel: Sel | null } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const [, force] = useState(0);

  // size
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); size.current = { w: Math.max(200, r.width), h: Math.max(200, r.height), dpr }; const c = ref.current; if (c) { c.width = size.current.w * dpr; c.height = size.current.h * dpr; } force(n => n + 1); };
    fit(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; if (ro) ro.observe(el); window.addEventListener('resize', fit);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  useEffect(() => { rot.current.user = false; cam.current.touched = false; }, [props.view]);

  const zoomAt = (f: number, mx: number, my: number) => {
    const c = cam.current, k2 = clamp(c.k * f, 0.08, 4);
    c.ox = mx - (mx - c.ox) * (k2 / c.k); c.oy = my - (my - c.oy) * (k2 / c.k); c.k = k2; c.touched = true;
  };
  // toolbar commands
  useEffect(() => {
    const c = props.cmd; if (!c.n) return; const { w, h } = size.current;
    if (c.type === 'in') zoomAt(1.3, w / 2, h / 2); else if (c.type === 'out') zoomAt(1 / 1.3, w / 2, h / 2);
    else if (c.type === 'fit') { cam.current.touched = false; }
    else { rot.current.user = true; if (c.type === 'rotL') rot.current.yaw -= 0.25; else if (c.type === 'rotR') rot.current.yaw += 0.25; else if (c.type === 'tiltUp') rot.current.tilt = clamp(rot.current.tilt + 0.1, 0.16, 0.98); else rot.current.tilt = clamp(rot.current.tilt - 0.1, 0.16, 0.98); }
  }, [props.cmd.n]);
  // fly to
  useEffect(() => {
    const f = props.flyTo; if (!f.n || !lastProj.current) return;
    const p = P.current, lp = lastProj.current, { w, h } = size.current;
    let wx = NaN, wy = NaN, z = 0;
    if (f.sel.kind === 'ent') { wx = p.layout.x[f.sel.i]; wy = p.layout.y[f.sel.i]; }
    else if (f.sel.kind === 'ghost') { const g = p.ghosts.find(q => q.g.id === (f.sel as { id: string }).id); if (g) { wx = g.x; wy = g.y; } }
    else if (f.sel.kind === 'inc') { const t = p.tiles.find(q => q.im.inc.id === (f.sel as { id: string }).id); if (t) { wx = t.x; wy = t.y; z = 2; } }
    if (!Number.isFinite(wx)) return;
    const k2 = clamp(Math.max(lp.k, 1), 0.3, 2.2), pr = project({ ...lp, k: k2, ox: 0, oy: 0 }, wx, wy, z);
    cam.current = { touched: true, k: k2, ox: w / 2 - pr.x, oy: h / 2 - pr.y };
  }, [props.flyTo.n]);

  // wheel zoom needs a non-passive listener
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const on = (e: WheelEvent) => { e.preventDefault(); const r = c.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); };
    c.addEventListener('wheel', on, { passive: false }); return () => c.removeEventListener('wheel', on);
  }, []);

  // ---- draw loop ----
  const themeRef = useRef<{ T: Theme; at: number } | null>(null);
  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const c = ref.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
      const p = P.current, { w, h, dpr } = size.current;
      if (!themeRef.current || now - themeRef.current.at > 1500) themeRef.current = { T: readTheme(c), at: now };
      const T = themeRef.current.T, anim = !p.paused && !reduce, t = anim ? now * 0.001 : 0;
      const R = rot.current, tv = VIEWS[p.view];
      if (!R.user) { R.yaw += (tv.yaw - R.yaw) * 0.14; R.tilt += (tv.tilt - R.tilt) * 0.14; }
      R.gapF += (GAPF[p.view] - R.gapF) * 0.14;
      const W = p.planeW, H = p.planeH, base = { yaw: R.yaw, tilt: R.tilt, cx: W / 2, cy: H / 2, gap: Math.max(240, H * R.gapF) };
      const cm = cam.current;
      const proj: Proj = cm.touched ? { ...base, k: cm.k, ox: cm.ox, oy: cm.oy } : fitProj(base, W, H, w, h, 44);
      if (!cm.touched) { cm.k = proj.k; cm.ox = proj.ox; cm.oy = proj.oy; }
      lastProj.current = proj;
      const pct = Math.round(proj.k * 100); if (pct !== zoomPctRef.current) { zoomPctRef.current = pct; setZoomPct(pct); }
      const P3 = (x: number, y: number, z: number) => project(proj, x, y, z);
      const sc = clamp(Math.sqrt(proj.k), 0.62, 1.5);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
      sprites.current = [];
      const sp = sprites.current;
      const has = p.sel.kind !== 'none' && !!p.chain, ch = p.chain as Chain;
      const aEnt = (i: number) => (has ? (ch.ents.has(i) ? 1 : 0.14) : 1) * (p.lit(i) ? 1 : 0.3);
      const aAlert = (id: string) => (has ? (ch.alerts.has(id) ? 1 : 0.1) : 1);
      const aInc = (id: string) => (has ? (ch.incs.has(id) ? 1 : 0.25) : 1);
      const aGhost = (id: string) => (has ? (ch.ghosts.has(id) ? 1 : 0.2) : 0.85);

      const plane = (z: number, label: string, tint: string) => {
        const m = 26, cs = [[-m, -m], [W + m, -m], [W + m, H + m], [-m, H + m]].map(([x, y]) => P3(x, y, z));
        ctx.beginPath(); cs.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
        ctx.fillStyle = withAlpha(tint, T.dark ? 0.1 : 0.07); ctx.fill(); ctx.strokeStyle = withAlpha(tint, 0.55); ctx.lineWidth = 1.2; ctx.stroke();
        if (z === 0 && proj.k > 0.25) { ctx.strokeStyle = withAlpha(T.dim, 0.1); ctx.lineWidth = 1; for (let gx = 0; gx <= W; gx += 160) { const a = P3(gx, -m, 0), b = P3(gx, H + m, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } for (let gy = 0; gy <= H; gy += 160) { const a = P3(-m, gy, 0), b = P3(W + m, gy, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
        const lc = cs.reduce((a, q) => (q.x < a.x ? q : a), cs[0]);
        ctx.font = `600 ${11 * sc}px IBM Plex Mono, ui-monospace, monospace`; ctx.textAlign = 'left'; ctx.fillStyle = tint; ctx.fillText(label, lc.x + 4, lc.y - 7);
      };
      const mono = (px: number, wgt = 400) => `${wgt} ${px}px IBM Plex Mono, ui-monospace, monospace`;
      const sans = (px: number, wgt = 400) => `${wgt} ${px}px IBM Plex Sans, -apple-system, system-ui, sans-serif`;

      // ===== topology layer =====
      const ents = Array.from(p.vis);
      const ep = new Map<number, ReturnType<typeof P3>>();
      ents.forEach(i => ep.set(i, P3(p.layout.x[i], p.layout.y[i], 0)));
      const gp = new Map<string, ReturnType<typeof P3>>();
      p.ghosts.forEach(g => gp.set(g.g.id, P3(g.x, g.y, 0)));
      const posOf = (name: string) => { const i = p.model.index.get(name); return i !== undefined && ep.has(i) ? (ep.get(i) as ReturnType<typeof P3>) : gp.get(name); };
      if (p.layers.topo) {
        plane(0, 'TOPOLOGY', T.dark ? '#78a9ff' : '#0f62fe');
        const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(a.x - b.x, a.y - b.y) * 0.1; return { mx, my }; };
        const edge = (a: { x: number; y: number }, b: { x: number; y: number }, col: string, alpha: number, wd: number, dash: number[], flow: boolean, k: number) => {
          const { mx, my } = curve(a, b); ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = wd * sc; ctx.setLineDash(dash.map(d => d * sc));
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
          if (flow && anim) { const u = (t * 0.28 + k * 0.137) % 1, uu = 1 - u; ctx.fillStyle = col; ctx.globalAlpha = Math.min(1, alpha + 0.3); ctx.beginPath(); ctx.arc(uu * uu * a.x + 2 * uu * u * mx + u * u * b.x, uu * uu * a.y + 2 * uu * u * my + u * u * b.y, 2.6 * sc, 0, 7); ctx.fill(); }
          ctx.globalAlpha = 1;
        };
        p.model.links.forEach((l, k) => {
          const a = ep.get(l.a), b = ep.get(l.b); if (!a || !b) return;
          const on = has ? (ch.ents.has(l.a) && ch.ents.has(l.b) ? 1 : 0.07) : 1, lit = p.lit(l.a) && p.lit(l.b), hot = Math.min(p.h[l.a], p.h[l.b]) < 0.9;
          const col = l.kind === 'group' ? T.warn : l.kind === 'topology' ? T.dim : (l.inc ? p.incColor(l.inc) : T.ai);
          edge(a, b, col, (lit ? (hot ? 0.62 : 0.3) : 0.1) * on + (has && on === 1 ? 0.25 : 0), (has && on === 1 ? 2.4 : l.kind === 'causal' ? 1.4 : 1.2), l.kind === 'topology' ? [6, 5] : l.kind === 'group' ? [2, 3] : [], l.kind !== 'topology' && hot && lit && on > 0.5 && proj.k > 0.2, k);
        });
        p.ghostLinks.forEach((l, k) => { const a = posOf(l.a), b = posOf(l.b); if (!a || !b) return; const on = has ? (ch.ghosts.has(l.a) || ch.ghosts.has(l.b) || (p.model.index.has(l.a) && ch.ents.has(p.model.index.get(l.a) as number)) ? 1 : 0.07) : 0.7; edge(a, b, T.dim, 0.5 * on, 1.3, [4, 4], false, k); });
        // entities, far to near
        ents.sort((x, y) => (ep.get(x) as { depth: number }).depth - (ep.get(y) as { depth: number }).depth).forEach(i => {
          const q = ep.get(i) as ReturnType<typeof P3>, bad = p.h[i] < 0.9, col = bad ? sevColor(T, p.worst[i]) : T.ok, a = aEnt(i), r = 9.5 * sc;
          const selected = p.sel.kind === 'ent' && p.sel.i === i;
          ctx.globalAlpha = a;
          if (bad && a > 0.3) { const R2 = r * 3.2, g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, R2); g.addColorStop(0, withAlpha(col, T.dark ? 0.34 : 0.26)); g.addColorStop(1, withAlpha(col, 0)); ctx.fillStyle = g; ctx.fillRect(q.x - R2, q.y - R2, R2 * 2, R2 * 2); }
          const wf = p.litAge(i); if (wf >= 0 && wf < 1) { ctx.globalAlpha = (1 - wf) * 0.85; ctx.strokeStyle = col; ctx.lineWidth = 2 * sc; ctx.beginPath(); ctx.arc(q.x, q.y, r + wf * r * 3.2, 0, 7); ctx.stroke(); ctx.globalAlpha = a; }
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fillStyle = T.bg; ctx.fill(); ctx.lineWidth = (bad ? 2.4 : 1.6) * sc; ctx.strokeStyle = bad ? col : withAlpha(T.dim, 0.6); ctx.stroke();
          if (bad) { ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.h[i]); ctx.lineWidth = 2.4 * sc; ctx.strokeStyle = col; ctx.stroke(); }
          if (p.roots.has(i)) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(anim ? t * 1.1 : 0); ctx.strokeStyle = T.ai; ctx.lineWidth = 2 * sc; for (let s = 0; s < 4; s++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, r + 6 * sc, -0.35, 0.35); ctx.stroke(); } ctx.restore(); }
          if (selected || hover.current === `e${i}`) { ctx.setLineDash([3 * sc, 3 * sc]); ctx.strokeStyle = T.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, r + 5 * sc, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
          if (proj.k > 1.1 || selected || p.roots.has(i) || (has && ch.ents.has(i)) || hover.current === `e${i}`) { const nm = p.model.entities[i].name, mc = 22; ctx.font = mono(10.5 * sc); ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = withAlpha(T.bg, 0.92); const lt = nm.length > mc ? nm.slice(0, mc - 1) + '…' : nm; ctx.strokeText(lt, q.x, q.y + r + 12.5 * sc); ctx.fillStyle = bad ? T.ink : T.dim; ctx.fillText(nm.length > mc ? nm.slice(0, mc - 1) + '…' : nm, q.x, q.y + r + 12.5 * sc); }
          ctx.globalAlpha = 1;
          sp.push({ k: 'ent', key: String(i), x: q.x, y: q.y, r: r + 4 });
          const hk = p.hiddenKids.get(i);
          if (hk && a > 0.3) { const lbl = `+${hk}`, bw = (lbl.length * 6.2 + 10) * sc, bx = q.x + r + 4 * sc, by = q.y - r - 2 * sc; ctx.globalAlpha = a; ctx.fillStyle = T.ai; ctx.beginPath(); ctx.rect(bx - bw / 2, by - 8 * sc, bw, 16 * sc); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = mono(10 * sc, 600); ctx.textAlign = 'center'; ctx.fillText(lbl, bx, by + 3.6 * sc); ctx.globalAlpha = 1; sp.push({ k: 'more', key: String(i), x: bx, y: by, r: 9 * sc }); }
        });
        p.ghosts.forEach(({ g }) => {
          const q = gp.get(g.id) as ReturnType<typeof P3>, a = aGhost(g.id), r = 8 * sc, sev = g.sev && g.sev > 0 ? sevColor(T, g.sev) : null;
          ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fillStyle = T.bg; ctx.fill(); ctx.setLineDash([3 * sc, 3 * sc]); ctx.lineWidth = 1.5 * sc; ctx.strokeStyle = sev || withAlpha(T.dim, 0.9); ctx.stroke(); ctx.setLineDash([]);
          if (p.sel.kind === 'ghost' && p.sel.id === g.id) { ctx.strokeStyle = T.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, r + 5 * sc, 0, 7); ctx.stroke(); }
          if (proj.k > 0.35 || hover.current === `g${g.id}`) { ctx.font = mono(10 * sc); ctx.textAlign = 'center'; ctx.fillStyle = T.dim; const nm = (g.sample ? '~ ' : '') + g.name; ctx.fillText(nm.length > 22 ? nm.slice(0, 21) + '…' : nm, q.x, q.y + r + 12 * sc); }
          ctx.globalAlpha = 1; sp.push({ k: 'ghost', key: g.id, x: q.x, y: q.y, r: r + 4 });
        });
      }

      // ===== alert layer =====
      const spots = new Map<string, ReturnType<typeof P3>>();
      if (p.layers.alert) {
        const alertRows: Array<{ a: Alert; i: number; q: ReturnType<typeof P3>; e: ReturnType<typeof P3> }> = [];
        ents.forEach(i => {
          const list = p.alertsAt(i).slice().sort((x, y) => y.severity - x.severity).slice(0, 24), e = ep.get(i) as ReturnType<typeof P3>;
          list.forEach((a, n) => { const s = alertSpot(p.layout.x[i], p.layout.y[i], n, list.length), q = P3(s.x, s.y, 1); spots.set(a.id, q); alertRows.push({ a, i, q, e }); });
        });
        if (p.layers.topo) { // threads alert -> resource
          alertRows.forEach(({ a, q, e, i }) => { const on = aAlert(a.id) * (aEnt(i) > 0.3 ? 1 : 0.4); ctx.globalAlpha = (has && ch.alerts.has(a.id) ? 0.7 : 0.1) * on; ctx.strokeStyle = sevColor(T, a.severity); ctx.lineWidth = (has && ch.alerts.has(a.id) ? 1.6 : 1) * sc; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(e.x, e.y); ctx.stroke(); });
          ctx.globalAlpha = 1;
        }
        plane(1, 'ALERTS', T.dark ? '#ff9c43' : '#ba4e00');
        alertRows.forEach(({ a, q }) => { // alert group: child -> parent
          if (!a.parent) return; const pq = spots.get(a.parent); if (!pq) return; ctx.globalAlpha = aAlert(a.id) * 0.8; ctx.strokeStyle = T.warn; ctx.lineWidth = 1.2 * sc; ctx.setLineDash([2 * sc, 2 * sc]); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(pq.x, pq.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        });
        alertRows.sort((x, y) => x.q.depth - y.q.depth).forEach(({ a, q }) => {
          const ra = (a.children && a.children.length ? 5.4 : 3.8) * sc, col = sevColor(T, a.severity), on = aAlert(a.id), selected = p.sel.kind === 'alert' && p.sel.id === a.id;
          ctx.globalAlpha = on; ctx.beginPath(); ctx.arc(q.x, q.y, ra, 0, 7); ctx.fillStyle = col; ctx.fill();
          if (a.children && a.children.length) { ctx.strokeStyle = T.warn; ctx.lineWidth = 1.6 * sc; ctx.beginPath(); ctx.arc(q.x, q.y, ra + 2.4 * sc, 0, 7); ctx.stroke(); }
          if (selected || hover.current === `a${a.id}`) { ctx.strokeStyle = T.ink; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(q.x, q.y, ra + 4 * sc, 0, 7); ctx.stroke(); }
          ctx.globalAlpha = 1; sp.push({ k: 'alert', key: a.id, x: q.x, y: q.y, r: Math.max(ra + 3, 6) });
        });
      }

      // ===== incident layer =====
      if (p.layers.inc) {
        const rows = p.tiles.map(tl => ({ tl, q: P3(tl.x, tl.y, 2) }));
        if (p.layers.alert) { // threads incident -> alerts
          rows.forEach(({ tl, q }) => tl.im.inc.alertIds.forEach(id => { const s = spots.get(id); if (!s) return; const on = has && ch.incs.has(tl.im.inc.id) && ch.alerts.has(id); ctx.globalAlpha = on ? 0.65 : has ? 0.02 : (tl.im.inc.ranks[id] === 1 ? 0.55 : 0.05); ctx.strokeStyle = p.incColor(tl.im.inc.id); ctx.lineWidth = (tl.im.inc.ranks[id] === 1 ? 2 : on ? 1.4 : 1) * sc; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(s.x, s.y); ctx.stroke(); }));
          ctx.globalAlpha = 1;
        }
        plane(2, 'INCIDENTS', T.dark ? '#be95ff' : '#8a3ffc');
        rows.sort((x, y) => x.q.depth - y.q.depth).forEach(({ tl, q }) => {
          const a = aInc(tl.im.inc.id), selected = p.sel.kind === 'inc' && p.sel.id === tl.im.inc.id, hov = hover.current === `i${tl.im.inc.id}`, col = p.incColor(tl.im.inc.id), pr = tl.im.inc.priority, pc = pr === 1 ? T.crit : pr === 2 ? '#ff832b' : pr === 3 ? '#f1c21b' : '#4589ff';
          const r = clamp(15 * proj.k, 8, 26), ts = clamp(proj.k, 0.7, 1.3);
          ctx.globalAlpha = a; ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
          ctx.beginPath(); ctx.moveTo(q.x, q.y - r * 1.15); ctx.lineTo(q.x + r * 1.15, q.y); ctx.lineTo(q.x, q.y + r * 1.15); ctx.lineTo(q.x - r * 1.15, q.y); ctx.closePath(); ctx.fillStyle = T.bg; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
          ctx.lineWidth = selected || hov ? 3.2 : 2.4; ctx.strokeStyle = selected || hov ? T.ink : col; ctx.stroke();
          ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.5, 0, 7); ctx.fill();
          ctx.fillStyle = pr === 2 || pr === 3 ? '#161616' : '#ffffff'; ctx.font = sans(Math.max(8, r * 0.52), 700); ctx.textAlign = 'center'; ctx.fillText(`P${pr || '?'}`, q.x, q.y + r * 0.18);
          if (proj.k > 0.55 || selected || hov) { const t2 = tl.im.inc.title, lt = t2.length > 16 ? t2.slice(0, 15) + '…' : t2; ctx.font = sans(10.5 * ts, 600); ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = withAlpha(T.bg, 0.92); ctx.strokeText(lt, q.x, q.y - r * 1.15 - 6); ctx.fillStyle = T.ink; ctx.fillText(lt, q.x, q.y - r * 1.15 - 6); }
          ctx.globalAlpha = 1; sp.push({ k: 'inc', key: tl.im.inc.id, x: q.x, y: q.y, r: r * 1.2 });
        });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  const zoomPctRef = useRef(100);

  // ---- pointer ----
  const at = (e: { clientX: number; clientY: number }) => { const r = (ref.current as HTMLCanvasElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hit = (x: number, y: number): Sprite | null => {
    const s = sprites.current;
    for (let i = s.length - 1; i >= 0; i--) { const q = s[i]; if (q.k === 'inc' && q.w) { if (Math.abs(x - q.x) <= (q.w as number) / 2 && Math.abs(y - q.y) <= (q.h as number) / 2) return q; } else if (Math.hypot(x - q.x, y - q.y) <= q.r) return q; }
    return null;
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return; const m = at(e); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { x: m.x, y: m.y, sx: m.x, sy: m.y, rotate: e.altKey || e.shiftKey, moved: false }; setMenu(null); setTip(null);
  };
  const move = (e: React.PointerEvent) => {
    const m = at(e), g = gesture.current;
    if (g) {
      const dx = m.x - g.x, dy = m.y - g.y; g.x = m.x; g.y = m.y; if (Math.hypot(m.x - g.sx, m.y - g.sy) > 4) g.moved = true;
      if (g.moved) { if (g.rotate) { rot.current.user = true; rot.current.yaw += dx * 0.006; rot.current.tilt = clamp(rot.current.tilt - dy * 0.004, 0.16, 0.98); } else { cam.current.ox += dx; cam.current.oy += dy; cam.current.touched = true; } }
      return;
    }
    const s = hit(m.x, m.y), key = s ? spriteKey(s) : '';
    if (key !== hover.current) { hover.current = key; setTip(s && s.k !== 'more' ? { x: m.x, y: m.y, sel: selOf(s) } : null); }
  };
  const up = (e: React.PointerEvent) => {
    const g = gesture.current; gesture.current = null; if (!g) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (x) { /* already released */ }
    if (g.moved) return; const m = at(e), s = hit(m.x, m.y);
    if (s && s.k === 'more') P.current.onMore(Number(s.key)); else P.current.onSelect(s ? selOf(s) : { kind: 'none' });
  };
  const onCtx = (e: React.MouseEvent) => { e.preventDefault(); const m = at(e), s = hit(m.x, m.y); setTip(null); const sel = s ? selOf(s) : null; if (sel) P.current.onSelect(sel); setMenu({ x: m.x, y: m.y, sel }); };
  const dbl = (e: React.MouseEvent) => { const m = at(e), s = hit(m.x, m.y); if (s && s.k !== 'more') P.current.onOpen(selOf(s)); else if (!s) cam.current.touched = false; };

  useEffect(() => {
    if (!menu) return;
    const away = (ev: PointerEvent) => { if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenu(null); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    const first = menuRef.current && (menuRef.current.querySelector('button:not(:disabled)') as HTMLElement | null); if (first) first.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const menuKeys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault();
    const bs = Array.from((menuRef.current as HTMLElement).querySelectorAll('button:not(:disabled)')) as HTMLElement[], i = bs.indexOf(document.activeElement as HTMLElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus();
  };
  const entries = menu ? props.menuFor(menu.sel) : [];
  const { w: sw, h: sh } = size.current;
  return (
    <div className="blast__stage atlas__stage" ref={wrap}>
      <canvas ref={ref} style={{ cursor: gesture.current ? 'grabbing' : tip ? 'pointer' : 'grab' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onContextMenu={onCtx} onDoubleClick={dbl}
        onPointerLeave={() => { hover.current = ''; setTip(null); }} aria-label="Incident atlas: incidents, their alerts and the resources they sit on, drawn as three layers. Right-click an item for tools." role="img" />
      {tip && !menu && <div className="blast__tip atlas__tip" style={{ left: Math.min(tip.x, sw - 280), top: tip.y }}>{props.tipFor(tip.sel)}</div>}
      {menu && (
        <div className="blast__menu" ref={menuRef} role="menu" onKeyDown={menuKeys} onContextMenu={e => e.preventDefault()} style={{ left: Math.max(4, Math.min(menu.x, sw - 350)), top: Math.max(4, Math.min(menu.y, sh - Math.min(entries.length * 32 + 12, sh - 8))) }}>
          {entries.map((en, k) => en.sep ? <div key={k} className="sep" role="separator" /> : en.head ? <div key={k} className="head">{en.label}</div> : (
            <button key={k} role="menuitem" disabled={en.disabled} onClick={() => { setMenu(null); if (en.onClick) en.onClick(); }}><span>{en.label}</span>{en.hint && <small>{en.hint}</small>}</button>
          ))}
        </div>
      )}
      <div className="atlas__key" aria-hidden="true"><span><b>Top plane</b> incident nodes (P = priority)</span><span><b>Middle</b> alert dots (ringed = group parent)</span><span><b>Bottom</b> resources: ring colour = worst severity, purple spinner = probable cause, <b>+N</b> = hidden children</span></div>
      <div className="blast__hint">drag to pan · wheel to zoom · Alt/Shift-drag to rotate · click to follow a chain · right-click for tools · double-click to dive in</div>
      <div className="atlas__zoom" aria-hidden="true">{zoomPct}%</div>
    </div>
  );
}
