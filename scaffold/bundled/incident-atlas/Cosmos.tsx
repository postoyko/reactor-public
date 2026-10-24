/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cosmos: the topology as a living constellation. Resources are stars that settle into incident nebulae, alerts orbit the
 * resource they are on, causal links stream particles from cause to effect, and a Shockwave ripples out hop by hop to show
 * the blast radius. Same selection, chain, menu and tooltip behaviour as the Layers view.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert } from './logic';
import { Sel } from './atlas-logic';
import { MenuEntry } from './feed';
import { DARK, sevColor, withAlpha } from './theme';
import { StageProps } from './Stage';

export interface CosmosProps extends StageProps { wave: { i: number; n: number }; trace: { n: number; path: number[] }; impact: Set<number>; changeMarks: Map<number, number>; similar: Array<{ id: string; score: number }>; realTopo: boolean }
interface N { x: number; y: number; vx: number; vy: number; pin: boolean }
interface Sprite { k: 'ent' | 'alert' | 'inc' | 'ghost' | 'more'; key: string; x: number; y: number; r: number; w?: number; h?: number }
const T = DARK;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const selOf = (s: Sprite): Sel => (s.k === 'alert' ? { kind: 'alert', id: s.key } : s.k === 'inc' ? { kind: 'inc', id: s.key } : s.k === 'ghost' ? { kind: 'ghost', id: s.key } : { kind: 'ent', i: Number(s.key) });
const spriteKey = (s: Sprite) => (s.k === 'more' || s.k === 'ent' ? `e${s.key}` : `${s.k[0]}${s.key}`);
const STARS = Array.from({ length: 170 }, (_, i) => ({ x: hash('x' + i), y: hash('y' + i), z: 0.15 + hash('z' + i) * 0.85, s: 0.4 + hash('s' + i) * 1.3 }));

export function Cosmos(props: CosmosProps) {
  const ref = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const P = useRef(props); P.current = props;
  const size = useRef({ w: 800, h: 520, dpr: 1 });
  const cam = useRef({ touched: false, k: 0.6, ox: 400, oy: 260 });
  const sim = useRef<{ nodes: Map<string, N>; alpha: number; sig: string }>({ nodes: new Map(), alpha: 1, sig: '' });
  const sprites = useRef<Sprite[]>([]);
  const hover = useRef('');
  const drag = useRef<{ key: string | null; x: number; y: number; sx: number; sy: number; moved: boolean } | null>(null);
  const traceRef = useRef<{ t0: number; keys: string[] } | null>(null);
  const waveRef = useRef<{ t0: number; dist: Map<string, number>; max: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; sel: Sel } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; sel: Sel | null } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const zp = useRef(100);
  const [, force] = useState(0);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); size.current = { w: Math.max(200, r.width), h: Math.max(200, r.height), dpr }; const c = ref.current; if (c) { c.width = size.current.w * dpr; c.height = size.current.h * dpr; } force(n => n + 1); };
    fit(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; if (ro) ro.observe(el); window.addEventListener('resize', fit);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  const zoomAt = (f: number, mx: number, my: number) => { const c = cam.current, k2 = clamp(c.k * f, 0.1, 5); c.ox = mx - (mx - c.ox) * (k2 / c.k); c.oy = my - (my - c.oy) * (k2 / c.k); c.k = k2; c.touched = true; };
  useEffect(() => { const c = props.cmd; if (!c.n) return; const { w, h } = size.current; if (c.type === 'in') zoomAt(1.3, w / 2, h / 2); else if (c.type === 'out') zoomAt(1 / 1.3, w / 2, h / 2); else if (c.type === 'fit') cam.current.touched = false; }, [props.cmd.n]);
  useEffect(() => {
    const f = props.flyTo; if (!f.n) return; const { w, h } = size.current; let key = '';
    if (f.sel.kind === 'ent') key = 'e' + f.sel.i; else if (f.sel.kind === 'ghost') key = 'g' + f.sel.id; else if (f.sel.kind === 'inc') { const t = props.tiles.find(q => q.im.inc.id === (f.sel as { id: string }).id); if (t) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; t.im.entities.forEach(e => { const n = sim.current.nodes.get('e' + e); if (n) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); } }); if (Number.isFinite(x0)) { const k3 = clamp(Math.min((w - 220) / Math.max(160, x1 - x0), (h - 220) / Math.max(160, y1 - y0)), 0.3, 1.6); cam.current = { touched: true, k: k3, ox: w / 2 - ((x0 + x1) / 2) * k3, oy: h / 2 - ((y0 + y1) / 2) * k3 }; return; } } }
    const n = sim.current.nodes.get(key); if (!n) return; const k2 = clamp(Math.max(cam.current.k, 1.1), 0.3, 2.4);
    cam.current = { touched: true, k: k2, ox: w / 2 - n.x * k2, oy: h / 2 - n.y * k2 };
  }, [props.flyTo.n]);
  useEffect(() => {
    const w = props.wave; if (!w.n) return; const p = P.current, keyOf = (name: string) => { const i = p.model.index.get(name); return i !== undefined && p.vis.has(i) ? 'e' + i : 'g' + name; };
    const adj = new Map<string, string[]>(), add = (a: string, b: string) => { (adj.get(a) || adj.set(a, []).get(a) as string[]).push(b); (adj.get(b) || adj.set(b, []).get(b) as string[]).push(a); };
    p.model.links.forEach(l => add('e' + l.a, 'e' + l.b)); p.ghostLinks.forEach(l => add(keyOf(l.a), keyOf(l.b)));
    const dist = new Map<string, number>([['e' + w.i, 0]]), q = ['e' + w.i]; let max = 0;
    while (q.length) { const u = q.shift() as string, d = dist.get(u) as number; (adj.get(u) || []).forEach(v => { if (!dist.has(v)) { dist.set(v, d + 1); max = Math.max(max, d + 1); q.push(v); } }); }
    waveRef.current = { t0: performance.now(), dist, max };
  }, [props.wave.n]);
  useEffect(() => { const t = props.trace; if (!t.n || t.path.length < 2) { traceRef.current = null; return; } traceRef.current = { t0: performance.now(), keys: t.path.map(i => 'e' + i) }; }, [props.trace.n]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const on = (e: WheelEvent) => { e.preventDefault(); const r = c.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); };
    c.addEventListener('wheel', on, { passive: false }); return () => c.removeEventListener('wheel', on);
  }, []);

  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const c = ref.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
      const p = P.current, { w, h, dpr } = size.current, S = sim.current, anim = !p.paused && !reduce, tt = anim ? now * 0.001 : 0;
      const ents = Array.from(p.vis), keyOfName = (name: string) => { const i = p.model.index.get(name); return i !== undefined && p.vis.has(i) ? 'e' + i : 'g' + name; };
      const gKeys = p.ghosts.map(g => 'g' + g.g.id);
      // ---- structure + simulation ----
      const sig = ents.join(',') + '|' + gKeys.join(',') + '|' + p.model.links.length + '|' + p.tiles.map(t => t.im.inc.id).join(',');
      const anchors = new Map<string, { x: number; y: number }>(), entInc = new Map<number, string>();
      p.tiles.forEach((tl, k) => { const a = k * 2.39996, r = k ? 260 * Math.sqrt(k + 0.2) : 0; anchors.set(tl.im.inc.id, { x: Math.cos(a) * r, y: Math.sin(a) * r }); tl.im.entities.forEach(e => { if (!entInc.has(e)) entInc.set(e, tl.im.inc.id); }); });
      if (sig !== S.sig) {
        S.sig = sig; S.alpha = 1; const keep = new Set<string>([...ents.map(i => 'e' + i), ...gKeys]);
        Array.from(S.nodes.keys()).forEach(k => { if (!keep.has(k)) S.nodes.delete(k); });
        const seed = (k: string, parent?: string) => { const par = parent ? S.nodes.get(parent) : undefined, inc = k[0] === 'e' ? anchors.get(entInc.get(Number(k.slice(1))) || '') : undefined, bx = par ? par.x : inc ? inc.x : 0, by = par ? par.y : inc ? inc.y : 0, a = hash(k) * 6.283, r = par ? 6 : 60 + hash(k + 'r') * 120; S.nodes.set(k, { x: bx + Math.cos(a) * r, y: by + Math.sin(a) * r, vx: 0, vy: 0, pin: false }); };
        const pending = ents.map(i => 'e' + i).filter(k => !S.nodes.has(k));
        pending.forEach(k => { const i = Number(k.slice(1)); let par: string | undefined; p.trees.forEach(t => { const pi = t.r.parent.get(i); if (pi !== undefined && S.nodes.has('e' + pi)) par = 'e' + pi; }); seed(k, par); });
        p.ghosts.forEach(g => { const k = 'g' + g.g.id; if (!S.nodes.has(k)) seed(k, S.nodes.has(keyOfName(g.g.from)) ? keyOfName(g.g.from) : undefined); });
      }
      type E = { a: string; b: string; kind: string; inc?: string; ghost?: boolean };
      const edges: E[] = [];
      p.model.links.forEach(l => { if (p.vis.has(l.a) && p.vis.has(l.b)) edges.push({ a: 'e' + l.a, b: 'e' + l.b, kind: l.kind, inc: l.inc }); });
      p.ghostLinks.forEach(l => { const a = keyOfName(l.a), b = keyOfName(l.b); if (S.nodes.has(a) && S.nodes.has(b)) edges.push({ a, b, kind: 'ghost', ghost: true }); });
      const nodes = Array.from(S.nodes.entries());
      if (S.alpha > 0.012) {
        const al = S.alpha, arr = nodes.map(([, n]) => n);
        for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
          const A = arr[i], B = arr[j]; let dx = A.x - B.x, dy = A.y - B.y, d2 = dx * dx + dy * dy; if (d2 > 250000) continue; if (d2 < 1) { dx = 1; dy = 0.5; d2 = 1.25; }
          const f = (9000 / (d2 + 500)) * (0.25 + al), d = Math.sqrt(d2); dx /= d; dy /= d; A.vx += dx * f; A.vy += dy * f; B.vx -= dx * f; B.vy -= dy * f;
        }
        edges.forEach(e => { const A = S.nodes.get(e.a), B = S.nodes.get(e.b); if (!A || !B) return; const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, L = e.kind === 'topology' ? 90 : e.kind === 'ghost' ? 100 : e.kind === 'group' ? 80 : 130, f = (d - L) * (e.kind === 'topology' ? 0.05 : e.kind === 'causal' ? 0.006 : 0.03); A.vx += (dx / d) * f; A.vy += (dy / d) * f; B.vx -= (dx / d) * f; B.vy -= (dy / d) * f; });
        nodes.forEach(([k, n]) => { const inc = k[0] === 'e' ? anchors.get(entInc.get(Number(k.slice(1))) || '') : undefined, tx = inc ? inc.x : 0, ty = inc ? inc.y : 0, g = inc ? 0.007 : 0.004; n.vx += (tx - n.x) * g * (0.4 + al); n.vy += (ty - n.y) * g * (0.4 + al); });
        arr.forEach(n => { if (n.pin) { n.vx = 0; n.vy = 0; return; } n.vx *= 0.8; n.vy *= 0.8; n.x += clamp(n.vx, -22, 22); n.y += clamp(n.vy, -22, 22); });
        S.alpha *= 0.992;
      }
      // ---- camera ----
      const cm = cam.current;
      if (!cm.touched && nodes.length) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; nodes.forEach(([, n]) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
        const pad = 60, k2 = clamp(Math.min((w - pad * 2) / Math.max(120, x1 - x0), (h - pad * 2) / Math.max(120, y1 - y0)), 0.12, 1.5), tx = w / 2 - ((x0 + x1) / 2) * k2, ty = h / 2 - ((y0 + y1) / 2) * k2;
        cm.k += (k2 - cm.k) * 0.1; cm.ox += (tx - cm.ox) * 0.1; cm.oy += (ty - cm.oy) * 0.1;
      }
      const K = cm.k, pct = Math.round(K * 100); if (pct !== zp.current) { zp.current = pct; setZoomPct(pct); }
      const X = (x: number) => x * K + cm.ox, Y = (y: number) => y * K + cm.oy;
      // ---- background ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over';
      const bg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75); bg.addColorStop(0, '#111a2e'); bg.addColorStop(1, '#04060b'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      STARS.forEach(s => { const x = ((s.x * w + cm.ox * s.z * 0.12) % w + w) % w, y = ((s.y * h + cm.oy * s.z * 0.12) % h + h) % h, tw = 0.5 + 0.5 * Math.sin(tt * (0.6 + s.z) + s.x * 40); ctx.fillStyle = `rgba(190,205,255,${0.1 + 0.4 * s.z * tw})`; ctx.fillRect(x, y, s.s, s.s); });
      sprites.current = []; const sp = sprites.current;
      const has = p.sel.kind !== 'none' && !!p.chain, ch = p.chain as { ents: Set<number>; alerts: Set<string>; incs: Set<string>; ghosts: Set<string> };
      const hv = hover.current, adj = new Map<string, Set<string>>(); if (hv) edges.forEach(e => { (adj.get(e.a) || adj.set(e.a, new Set()).get(e.a) as Set<string>).add(e.b); (adj.get(e.b) || adj.set(e.b, new Set()).get(e.b) as Set<string>).add(e.a); });
      const hn = hv ? adj.get(hv) : undefined;
      const inChain = (k: string) => (k[0] === 'e' ? ch.ents.has(Number(k.slice(1))) : ch.ghosts.has(k.slice(1)));
      const nodeA = (k: string) => { let a = 1; if (has) a = inChain(k) ? 1 : 0.13; else if (hv && k !== hv && !(hn && hn.has(k))) a = 0.4; if (k[0] === 'e' && !p.lit(Number(k.slice(1)))) a *= 0.3; return a; };
      const wv = waveRef.current, front = wv ? Math.max(0, now - wv.t0) / 480 : -1; if (wv && front > wv.max + 4) waveRef.current = null;
      // ---- nebulae ----
      const cent = new Map<string, { x: number; y: number }>();
      if (p.layers.inc) {
        ctx.globalCompositeOperation = 'lighter';
        p.tiles.forEach(tl => {
          const mem = tl.im.entities.filter(e => S.nodes.has('e' + e)); if (!mem.length) return;
          let cx = 0, cy = 0; mem.forEach(e => { const n = S.nodes.get('e' + e) as N; cx += n.x; cy += n.y; }); cx /= mem.length; cy /= mem.length;
          cent.set(tl.im.inc.id, { x: cx, y: cy });
          let R = 70; mem.forEach(e => { const n = S.nodes.get('e' + e) as N; R = Math.max(R, Math.hypot(n.x - cx, n.y - cy) + 55); });
          const col = p.incColor(tl.im.inc.id), on = has ? (ch.incs.has(tl.im.inc.id) ? 1 : 0.2) : 1, pulse = 1 + 0.04 * Math.sin(tt * 1.3 + hash(tl.im.inc.id) * 6), g = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), R * K * pulse);
          g.addColorStop(0, withAlpha(col, 0.34 * on)); g.addColorStop(0.55, withAlpha(col, 0.15 * on)); g.addColorStop(1, withAlpha(col, 0)); ctx.fillStyle = g; ctx.fillRect(X(cx) - R * K * 1.1, Y(cy) - R * K * 1.1, R * K * 2.2, R * K * 2.2);
        });
        ctx.globalCompositeOperation = 'source-over';
      }
      // ---- similar incidents: arcs between nebulae ----
      if (p.sel.kind === 'inc' && p.similar.length) {
        const from = cent.get(p.sel.id);
        if (from) p.similar.forEach(sm => { const to = cent.get(sm.id); if (!to) return; const ax = X(from.x), ay = Y(from.y), bx = X(to.x), by = Y(to.y), mx = (ax + bx) / 2, my = (ay + by) / 2 - Math.hypot(ax - bx, ay - by) * 0.25;
          ctx.globalAlpha = 0.85; ctx.strokeStyle = '#be95ff'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -tt * 20; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
          const lx = 0.25 * ax + 0.5 * mx + 0.25 * bx, ly = 0.25 * ay + 0.5 * my + 0.25 * by, lbl = `${Math.round(sm.score * 100)}% similar`; ctx.font = '600 11px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(4,6,11,.9)'; ctx.strokeText(lbl, lx, ly); ctx.fillStyle = '#e4d3ff'; ctx.fillText(lbl, lx, ly); ctx.globalAlpha = 1; });
      }
      // ---- edges ----
      const NP = (k: string) => S.nodes.get(k) as N;
      edges.forEach((e, ei) => {
        if (!p.layers.topo && e.kind === 'topology') return;
        const A = NP(e.a), B = NP(e.b), ax = X(A.x), ay = Y(A.y), bx = X(B.x), by = Y(B.y), mx = (ax + bx) / 2, my = (ay + by) / 2 - Math.hypot(ax - bx, ay - by) * 0.12;
        const col = e.kind === 'group' ? T.warn : e.kind === 'causal' ? p.incColor(e.inc || '') : e.kind === 'ghost' ? '#8d93a6' : '#8fa3d6', a = Math.min(nodeA(e.a), nodeA(e.b)), real = e.kind === 'topology', bad = (k: string) => k[0] === 'e' && p.h[Number(k.slice(1))] < 0.9, hot = (real || e.kind === 'group' || (e.kind === 'causal' && !p.realTopo)) && a > 0.5 && (bad(e.a) || bad(e.b));
        let boost = 0, wd = real ? 2.2 : e.kind === 'causal' ? 1.8 : 1.6;
        if (wv) { const da = wv.dist.get(e.a), db = wv.dist.get(e.b); if (da !== undefined && db !== undefined) { const h2 = Math.max(da, db), age = front - (h2 - 1); if (age > 0 && age < 3) { boost = 1 - age / 3; wd += boost * 2.6; } } }
        ctx.globalAlpha = clamp((real ? (hot ? 0.95 : 0.7) : e.kind === 'causal' ? (p.realTopo ? 0.25 : hot ? 0.8 : 0.55) : 0.65) * a + boost * 0.7, 0, 1); ctx.strokeStyle = boost > 0 ? '#ffffff' : col; ctx.lineWidth = wd; ctx.setLineDash(e.kind === 'causal' ? [8, 5] : e.kind === 'group' ? [3, 4] : e.kind === 'ghost' ? [4, 4] : []);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke(); ctx.setLineDash([]);
        if (hot && anim && K > 0.2) { ctx.globalCompositeOperation = 'lighter'; for (let q = 0; q < 2; q++) { const u = (tt * 0.32 + ei * 0.137 + q * 0.5) % 1, uu = 1 - u, px = uu * uu * ax + 2 * uu * u * mx + u * u * bx, py = uu * uu * ay + 2 * uu * u * my + u * u * by; ctx.globalAlpha = 0.9; ctx.fillStyle = real ? '#cfe0ff' : col; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill(); } ctx.globalCompositeOperation = 'source-over'; }
        ctx.globalAlpha = 1;
      });
      // ---- trace: the real path from the cause, with a comet ----
      const tr = traceRef.current;
      if (tr) {
        const el = Math.max(0, now - tr.t0) / 1000, pts = tr.keys.map(k => S.nodes.get(k)).filter((n): n is N => !!n).map(n => ({ x: X(n.x), y: Y(n.y) }));
        if (el > 14 || pts.length < 2) traceRef.current = null; else {
          const fade = el > 11 ? 1 - (el - 11) / 3 : 1, segs = pts.length - 1, cp = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.hypot(a.x - b.x, a.y - b.y) * 0.12 });
          ctx.globalCompositeOperation = 'lighter';
          for (let sI = 0; sI < segs; sI++) { const a0 = pts[sI], b0 = pts[sI + 1], c0 = cp(a0, b0), reached = clamp(el / 0.8 - sI, 0, 1); if (!reached) continue; ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = '#d9c7ff'; ctx.lineWidth = 3.2; ctx.shadowColor = '#a56eff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.quadraticCurveTo(c0.x, c0.y, a0.x + (b0.x - a0.x) * reached, a0.y + (b0.y - a0.y) * reached); ctx.stroke(); ctx.shadowBlur = 0; }
          const prog = ((el * 0.9) % (segs)), sI = Math.min(segs - 1, Math.floor(prog)), u = prog - sI, a1 = pts[sI], b1 = pts[sI + 1], c1 = cp(a1, b1), uu = 1 - u, cx = uu * uu * a1.x + 2 * uu * u * c1.x + u * u * b1.x, cy = uu * uu * a1.y + 2 * uu * u * c1.y + u * u * b1.y;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22); g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`); g.addColorStop(1, 'rgba(165,110,255,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(cx - 22, cy - 22, 44, 44);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade; ctx.font = '600 11px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#e4d3ff'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(4,6,11,.9)'; const mid = pts[Math.floor(pts.length / 2)], lbl = `${segs} hop${segs === 1 ? '' : 's'} from the cause`; ctx.strokeText(lbl, mid.x, mid.y - 18); ctx.fillText(lbl, mid.x, mid.y - 18); ctx.globalAlpha = 1;
        }
      }
      // ---- nodes ----
      const spots = new Map<string, { x: number; y: number }>(), alertDraw: Array<{ a: Alert; x: number; y: number; on: number }> = [];
      const order = nodes.slice().sort((a, b) => a[1].y - b[1].y);
      order.forEach(([k, n]) => {
        const x = X(n.x), y = Y(n.y), a = nodeA(k), isE = k[0] === 'e', idx = isE ? Number(k.slice(1)) : -1;
        if (x < -80 || y < -80 || x > w + 80 || y > h + 80) return;
        if (isE) {
          const open = p.alertsAt(idx), bad = p.h[idx] < 0.9, col = bad ? sevColor(T, p.worst[idx]) : "#6b7692", isRoot = p.roots.has(idx), rw = 11 + Math.min(9, open.length * 1.1) + (isRoot ? 5 : 0), r = Math.max(3, rw * K), selected = p.sel.kind === 'ent' && p.sel.i === idx;
          ctx.globalAlpha = a;
          let fl = 0; if (wv) { const d = wv.dist.get(k); if (d !== undefined) { const age = front - d; if (age > 0 && age < 2.4) fl = 1 - age / 2.4; } }
          const wf = p.litAge(idx);
          if (bad || fl) { ctx.globalCompositeOperation = 'lighter'; const GR = r * (isRoot ? 5 : 3.4) * (1 + fl * 0.8), g = ctx.createRadialGradient(x, y, 0, x, y, GR), beat = 0.75 + 0.25 * Math.sin(tt * (isRoot ? 3 : 1.8) + idx); g.addColorStop(0, withAlpha(fl ? '#ffffff' : col, (isRoot ? 0.7 : 0.45) * beat * a + fl * 0.5)); g.addColorStop(1, withAlpha(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - GR, y - GR, GR * 2, GR * 2); ctx.globalCompositeOperation = 'source-over'; }
          if (fl) { ctx.strokeStyle = '#fff'; ctx.globalAlpha = fl * 0.9 * a; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + (1 - fl) * r * 4, 0, 7); ctx.stroke(); ctx.globalAlpha = a; }
          if (wf >= 0 && wf < 1) { ctx.strokeStyle = col; ctx.globalAlpha = (1 - wf) * 0.9 * a; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + wf * r * 5, 0, 7); ctx.stroke(); ctx.globalAlpha = a; }
          if (bad && anim && a > 0.5 && p.worst[idx] >= 5) { const ph = (tt * 0.7 + idx * 0.37) % 1; ctx.strokeStyle = col; ctx.globalAlpha = (1 - ph) * 0.5 * a; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, r + ph * r * 3.2, 0, 7); ctx.stroke(); ctx.globalAlpha = a; }
          const cg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); cg.addColorStop(0, bad ? '#ffffff' : '#8f9ab8'); cg.addColorStop(0.35, col); cg.addColorStop(1, withAlpha(col, 0.7)); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = cg; ctx.fill();
          if (isRoot) { ctx.save(); ctx.translate(x, y); ctx.rotate(anim ? tt * 1.2 : 0); ctx.strokeStyle = T.ai; ctx.lineWidth = 2; ctx.globalAlpha = a; for (let s = 0; s < 3; s++) { ctx.rotate(2.0944); ctx.beginPath(); ctx.arc(0, 0, r + 7, -0.5, 0.5); ctx.stroke(); } ctx.restore(); ctx.strokeStyle = withAlpha('#ffffff', 0.35 * a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - r * 3.2, y); ctx.lineTo(x + r * 3.2, y); ctx.moveTo(x, y - r * 3.2); ctx.lineTo(x, y + r * 3.2); ctx.stroke(); }
          if (p.impact.has(idx)) { ctx.save(); ctx.translate(x, y); ctx.rotate(anim ? -tt * 0.5 : 0); ctx.setLineDash([5, 5]); ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 2; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(0, 0, r + 15, 0, 7); ctx.stroke(); ctx.restore(); ctx.setLineDash([]); ctx.fillStyle = '#ffb000'; ctx.font = '700 9px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.globalAlpha = a; ctx.fillText('SERVICE AT RISK', x, y - r - 19); }
          if (p.changeMarks.has(idx)) { ctx.globalAlpha = a; ctx.fillStyle = '#08bdba'; ctx.fillRect(x - r - 14, y - r - 10, 14, 14); ctx.fillStyle = '#04060b'; ctx.font = '700 11px IBM Plex Sans, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Δ', x - r - 7, y - r + 1); }
          if (selected || hv === k) { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x, y, r + 9, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
          // orbiting alerts
          if (p.layers.alert && open.length) {
            const list = open.slice().sort((q, z) => z.severity - q.severity).slice(0, 10), m = list.length;
            list.forEach((al, j) => { const orb = r + (9 + (j % 2) * 5) * Math.max(0.7, Math.min(1.4, K)), ang = tt * (0.5 + (j % 3) * 0.15) * (j % 2 ? -1 : 1) + (j * 6.283) / m, ax = x + Math.cos(ang) * orb, ay = y + Math.sin(ang) * orb; spots.set(al.id, { x: ax, y: ay }); alertDraw.push({ a: al, x: ax, y: ay, on: a }); });
            if (open.length > 10 && K > 0.5) { ctx.fillStyle = withAlpha('#ffffff', 0.6 * a); ctx.font = '600 9px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(`+${open.length - 10}`, x, y + r + 24); }
          }
          const showLabel = K > 1.25 || selected || isRoot || hv === k || (has && inChain(k)) || (hn && hn.has(k)) || (K > 0.7 && bad && p.worst[idx] >= 5);
          if (showLabel) { const nm = p.model.entities[idx].name, lt = nm.length > 24 ? nm.slice(0, 23) + '…' : nm; ctx.font = `${isRoot ? 600 : 400} 11px IBM Plex Mono, monospace`; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(4,6,11,.9)'; ctx.strokeText(lt, x, y + r + 14); ctx.fillStyle = isRoot ? '#e4d3ff' : '#e8eaf0'; ctx.fillText(lt, x, y + r + 14); }
          ctx.globalAlpha = 1; sp.push({ k: 'ent', key: String(idx), x, y, r: r + 7 });
          const hk = p.hiddenKids.get(idx);
          if (hk && a > 0.3) { const lbl = `+${hk}`, bw = lbl.length * 6.4 + 12, bx = x + r + 6, by = y - r - 6; ctx.fillStyle = T.ai; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - bw / 2, by - 8, bw, 16, 8) : ctx.rect(bx - bw / 2, by - 8, bw, 16); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '600 10px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(lbl, bx, by + 3.6); sp.push({ k: 'more', key: String(idx), x: bx, y: by, r: 10 }); }
        } else {
          const g = p.ghosts.find(q => 'g' + q.g.id === k); if (!g) return; const r = Math.max(3, 7 * K), sev = g.g.sev && g.g.sev > 0 ? sevColor(T, g.g.sev) : '#8d93a6', selected = p.sel.kind === 'ghost' && p.sel.id === g.g.id;
          ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#0b1220'; ctx.fill(); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.6; ctx.strokeStyle = sev; ctx.stroke(); ctx.setLineDash([]);
          if (selected) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 7); ctx.stroke(); }
          if (K > 0.9 || hv === k || selected) { ctx.font = '400 10px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#aab0c4'; const nm = (g.g.sample ? '~ ' : '') + g.g.name; ctx.fillText(nm.length > 22 ? nm.slice(0, 21) + '…' : nm, x, y + r + 13); }
          ctx.globalAlpha = 1; sp.push({ k: 'ghost', key: g.g.id, x, y, r: r + 6 });
        }
      });
      // alert group lines + dots
      if (p.layers.alert) {
        alertDraw.forEach(({ a, x, y, on }) => { if (!a.parent) return; const q = spots.get(a.parent); if (!q) return; ctx.globalAlpha = 0.7 * on; ctx.strokeStyle = T.warn; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.globalAlpha = 1; });
        alertDraw.forEach(({ a, x, y, on }) => {
          const col = sevColor(T, a.severity), ra = Math.max(2.2, (a.children && a.children.length ? 4.2 : 3) * Math.min(1.5, Math.max(0.8, K))), dim = has ? (ch.alerts.has(a.id) ? 1 : 0.15) : 1, selected = p.sel.kind === 'alert' && p.sel.id === a.id;
          ctx.globalAlpha = on * dim; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = withAlpha(col, 0.35); ctx.beginPath(); ctx.arc(x, y, ra * 2.4, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, ra, 0, 7); ctx.fill(); if (a.children && a.children.length) { ctx.strokeStyle = T.warn; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, ra + 2.4, 0, 7); ctx.stroke(); }
          if (selected || hv === 'a' + a.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, ra + 4, 0, 7); ctx.stroke(); }
          ctx.globalAlpha = 1; sp.push({ k: 'alert', key: a.id, x, y, r: Math.max(ra + 3, 6) });
        });
      }
      // incident banners above their nebula
      if (p.layers.inc) p.tiles.forEach(tl => {
        const mem = tl.im.entities.filter(e => S.nodes.has('e' + e)); if (!mem.length) return;
        let cx = 0, top = Infinity; mem.forEach(e => { const n = S.nodes.get('e' + e) as N; cx += n.x; top = Math.min(top, n.y); }); cx /= mem.length;
        const x = X(cx), y = Y(top) - 34 * Math.max(0.6, Math.min(1.2, K)) - 12, col = p.incColor(tl.im.inc.id), on = has ? (ch.incs.has(tl.im.inc.id) ? 1 : 0.25) : 1, selected = p.sel.kind === 'inc' && p.sel.id === tl.im.inc.id, ts = clamp(K, 0.7, 1.25);
        const title = `P${tl.im.inc.priority || '?'}  ${tl.im.inc.title}`, mc = 34, txt = title.length > mc ? title.slice(0, mc - 1) + '…' : title; ctx.font = `600 ${12 * ts}px IBM Plex Sans, system-ui, sans-serif`; const tw = ctx.measureText(txt).width, wd = tw + 26 * ts, ht = 34 * ts;
        ctx.globalAlpha = on; ctx.fillStyle = 'rgba(10,14,24,.88)'; ctx.fillRect(x - wd / 2, y - ht / 2, wd, ht); ctx.strokeStyle = selected || hv === 'i' + tl.im.inc.id ? '#fff' : col; ctx.lineWidth = selected ? 2.2 : 1.3; ctx.strokeRect(x - wd / 2, y - ht / 2, wd, ht); ctx.fillStyle = tl.im.inc.priority === 1 ? T.crit : tl.im.inc.priority === 2 ? '#ff832b' : tl.im.inc.priority === 3 ? '#f1c21b' : '#4589ff'; ctx.fillRect(x - wd / 2, y - ht / 2, 4 * ts, ht);
        ctx.textAlign = 'left'; ctx.fillStyle = '#f4f4f4'; ctx.fillText(txt, x - wd / 2 + 12 * ts, y - 3 * ts); ctx.font = `400 ${9.5 * ts}px IBM Plex Mono, monospace`; ctx.fillStyle = '#9aa1b8'; ctx.fillText(`${tl.alerts} alerts · ${tl.resources} res · cause ${Math.round(tl.share * 100)}%`, x - wd / 2 + 12 * ts, y + 11 * ts);
        ctx.globalAlpha = 1; sp.push({ k: 'inc', key: tl.im.inc.id, x, y, r: 0, w: wd, h: ht });
      });
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, []);

  // ---- pointer ----
  const at = (e: { clientX: number; clientY: number }) => { const r = (ref.current as HTMLCanvasElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hit = (x: number, y: number): Sprite | null => { const s = sprites.current; for (let i = s.length - 1; i >= 0; i--) { const q = s[i]; if (q.k === 'inc') { if (Math.abs(x - q.x) <= (q.w as number) / 2 && Math.abs(y - q.y) <= (q.h as number) / 2) return q; } else if (Math.hypot(x - q.x, y - q.y) <= q.r) return q; } return null; };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return; const m = at(e); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const s = hit(m.x, m.y);
    drag.current = { key: s && (s.k === 'ent' || s.k === 'ghost') ? (s.k === 'ent' ? 'e' + s.key : 'g' + s.key) : null, x: m.x, y: m.y, sx: m.x, sy: m.y, moved: false }; setMenu(null); setTip(null);
  };
  const move = (e: React.PointerEvent) => {
    const m = at(e), g = drag.current;
    if (g) {
      const dx = m.x - g.x, dy = m.y - g.y; g.x = m.x; g.y = m.y; if (Math.hypot(m.x - g.sx, m.y - g.sy) > 4) g.moved = true;
      if (g.moved) { const c = cam.current; if (g.key && sim.current.nodes.has(g.key)) { const n = sim.current.nodes.get(g.key) as N; n.x += dx / c.k; n.y += dy / c.k; n.pin = true; n.vx = 0; n.vy = 0; sim.current.alpha = Math.max(sim.current.alpha, 0.35); } else { c.ox += dx; c.oy += dy; c.touched = true; } }
      return;
    }
    const s = hit(m.x, m.y), key = s ? spriteKey(s) : ''; if (key !== hover.current) { hover.current = key; setTip(s && s.k !== 'more' ? { x: m.x, y: m.y, sel: selOf(s) } : null); }
  };
  const up = (e: React.PointerEvent) => {
    const g = drag.current; drag.current = null; if (!g) return; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (x) { /* released */ }
    if (g.moved) { if (g.key && sim.current.nodes.has(g.key)) (sim.current.nodes.get(g.key) as N).pin = false; return; }
    const m = at(e), s = hit(m.x, m.y); if (s && s.k === 'more') P.current.onMore(Number(s.key)); else P.current.onSelect(s ? selOf(s) : { kind: 'none' });
  };
  const onCtx = (e: React.MouseEvent) => { e.preventDefault(); const m = at(e), s = hit(m.x, m.y); setTip(null); const sel = s ? selOf(s) : null; if (sel) P.current.onSelect(sel); setMenu({ x: m.x, y: m.y, sel }); };
  const dbl = (e: React.MouseEvent) => { const m = at(e), s = hit(m.x, m.y); if (s && s.k !== 'more') P.current.onOpen(selOf(s)); else if (!s) cam.current.touched = false; };
  useEffect(() => {
    if (!menu) return; const away = (ev: PointerEvent) => { if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenu(null); }, esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc); const first = menuRef.current && (menuRef.current.querySelector('button:not(:disabled)') as HTMLElement | null); if (first) first.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const menuKeys = (e: React.KeyboardEvent) => { if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault(); const bs = Array.from((menuRef.current as HTMLElement).querySelectorAll('button:not(:disabled)')) as HTMLElement[], i = bs.indexOf(document.activeElement as HTMLElement); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); };
  const entries = menu ? props.menuFor(menu.sel) : [];
  const { w: sw, h: sh } = size.current;
  return (
    <div className="blast__stage atlas__stage atlas__cosmos" ref={wrap}>
      <canvas ref={ref} style={{ cursor: drag.current ? 'grabbing' : tip ? 'pointer' : 'grab' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onContextMenu={onCtx} onDoubleClick={dbl}
        onPointerLeave={() => { hover.current = ''; setTip(null); }} aria-label="Incident cosmos: resources as stars grouped into incident nebulae, with their alerts orbiting. Right-click an item for tools." role="img" />
      {tip && !menu && <div className="blast__tip atlas__tip" style={{ left: Math.min(tip.x + 14, sw - 280), top: tip.y + 14 }}>{props.tipFor(tip.sel)}</div>}
      {menu && (
        <div className="blast__menu" ref={menuRef} role="menu" onKeyDown={menuKeys} onContextMenu={e => e.preventDefault()} style={{ left: Math.max(4, Math.min(menu.x, sw - 350)), top: Math.max(4, Math.min(menu.y, sh - Math.min(entries.length * 32 + 12, sh - 8))) }}>
          {entries.map((en: MenuEntry, k: number) => en.sep ? <div key={k} className="sep" role="separator" /> : en.head ? <div key={k} className="head">{en.label}</div> : (
            <button key={k} role="menuitem" disabled={en.disabled} onClick={() => { setMenu(null); if (en.onClick) en.onClick(); }}><span>{en.label}</span>{en.hint && <small>{en.hint}</small>}</button>
          ))}
        </div>
      )}
      <div className="atlas__key is-dark" aria-hidden="true"><span><b>Glowing nebula</b> = one incident; its card floats above</span><span><b>Stars</b> = resources (colour = worst severity); <b>purple spinner</b> = probable cause</span><span><b>Orbiting dots</b> = that resource's alerts; <b>streams</b> = cause → effect</span><span><b>Solid grey links</b> = real topology · <b>dashed coloured</b> = inferred (same incident) · <b>Δ</b> = a change preceded the alerts · <b>amber dashed ring</b> = service at risk</span><span>Hover lights a resource's neighbours · drag a star to pull it · right-click → <b>Shockwave</b></span></div>
      <div className="blast__hint">drag background to pan · drag a star to move it · wheel to zoom · click to follow a chain · right-click for tools · double-click to dive in</div>
      <div className="atlas__zoom" aria-hidden="true">{zoomPct}%</div>
    </div>
  );
}
