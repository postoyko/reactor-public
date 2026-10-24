/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure logic for Incident Atlas: the 2.5D projection of the three layers (incidents, alerts, topology), which resources
 * are shown (progressive disclosure), which items belong to a selected item's chain, live-topology neighbour parsing
 * and the time used by the propagation replay. No React, no network.
 */

import { Alert, IncModel, Link, Model, Reach } from './logic';

/* ---------- projection ---------- */
export interface Proj { yaw: number; tilt: number; k: number; ox: number; oy: number; cx: number; cy: number; gap: number }
export interface Pt { x: number; y: number; depth: number }
/** World (x, y) on layer `z` (0 topology, 1 alerts, 2 incidents) -> screen. tilt 1 looks straight down, small values look along the layers. */
export function project(p: Proj, wx: number, wy: number, z: number): Pt {
  const dx = wx - p.cx, dy = wy - p.cy, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const rx = dx * c - dy * s, ry = dx * s + dy * c;
  return { x: p.ox + rx * p.k, y: p.oy + (ry * p.tilt - z * p.gap) * p.k, depth: ry };
}
export const VIEWS = {
  stack: { yaw: -0.62, tilt: 0.52, label: 'Stack', hint: 'Three layers in perspective' },
  flat: { yaw: 0, tilt: 0.94, label: 'Flat', hint: 'Layers as bands, easiest to read' },
  side: { yaw: -1.2, tilt: 0.3, label: 'Side', hint: 'Edge-on, shows the threads between layers' }
} as const;
export type ViewId = keyof typeof VIEWS;

/** Scale and offset that fit the three layers into a w x h screen. */
export function fitProj(base: Pick<Proj, 'yaw' | 'tilt' | 'cx' | 'cy' | 'gap'>, width: number, height: number, w: number, h: number, pad = 36): Proj {
  const probe: Proj = { ...base, k: 1, ox: 0, oy: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  [0, 2].forEach(z => [[0, 0], [width, 0], [0, height], [width, height]].forEach(([x, y]) => { const q = project(probe, x, y, z); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }));
  const k = Math.max(0.05, Math.min((w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0), 2));
  return { ...base, k, ox: w / 2 - ((x0 + x1) / 2) * k, oy: h / 2 - ((y0 + y1) / 2) * k };
}

/* ---------- progressive disclosure ---------- */
export interface Disclosure {
  /** Children shown under an open resource before "+N more". */
  base: number;
  /** Extra children revealed per resource (Infinity = all of them, all the way down). */
  more: Map<number, number>;
  /** Resources the person collapsed. */
  shut: Set<number>;
}
export interface Tree { im: IncModel; r: Reach }

/** Children of each node in a reach tree, worst first. */
export function childrenOf(r: Reach, worst: Uint8Array, name: (e: number) => string): Map<number, number[]> {
  const kids = new Map<number, number[]>();
  r.parent.forEach((p, c) => { const l = kids.get(p) || []; l.push(c); kids.set(p, l); });
  kids.forEach(l => l.sort((a, b) => worst[b] - worst[a] || name(a).localeCompare(name(b))));
  return kids;
}

/** Resources to draw: each incident's cause, then children breadth first while a node is open. Also returns how many children each node hides. */
export function visibleEntities(trees: Tree[], d: Disclosure, worst: Uint8Array, name: (e: number) => string): { vis: Set<number>; hiddenKids: Map<number, number> } {
  const vis = new Set<number>(), hiddenKids = new Map<number, number>();
  trees.forEach(({ im, r }) => {
    const kids = childrenOf(r, worst, name);
    vis.add(im.root);
    const q = [im.root];
    while (q.length) {
      const u = q.shift() as number, list = kids.get(u) || [];
      if (!list.length) continue;
      if (d.shut.has(u)) { hiddenKids.set(u, Math.max(hiddenKids.get(u) || 0, list.length)); continue; }
      const extra = d.more.get(u) || 0, n = Math.min(list.length, d.base + extra);
      list.slice(0, n).forEach(c => { vis.add(c); q.push(c); });
      if (n < list.length) hiddenKids.set(u, Math.max(hiddenKids.get(u) || 0, list.length - n));
    }
  });
  // a node can be visible through one incident and still hide children in another; only report ones that stay hidden
  hiddenKids.forEach((v, e) => { if (!vis.has(e)) hiddenKids.delete(e); });
  return { vis, hiddenKids };
}

/** Everything below `e` in the union of trees (for "expand all below" and "collapse"). */
export function descendants(trees: Tree[], e: number): Set<number> {
  const out = new Set<number>();
  trees.forEach(({ r }) => {
    const kids = new Map<number, number[]>(); r.parent.forEach((p, c) => { const l = kids.get(p) || []; l.push(c); kids.set(p, l); });
    const q = [e]; while (q.length) { const u = q.shift() as number; (kids.get(u) || []).forEach(c => { if (!out.has(c)) { out.add(c); q.push(c); } }); }
  });
  return out;
}

/** Pivot: the full chain up to the causes and down to everything affected, plus topology neighbours two hops out. */
export function pivotSet(m: Model, e: number): Set<number> {
  const out = new Set<number>([e]);
  const walk = (dir: 'up' | 'down') => {
    const seen = new Set<number>([e]), q = [e];
    while (q.length) {
      const u = q.shift() as number;
      m.links.forEach(l => {
        if (l.kind === 'topology') return;
        const v = dir === 'down' ? (l.a === u ? l.b : -1) : (l.b === u ? l.a : -1);
        if (v >= 0 && !seen.has(v)) { seen.add(v); out.add(v); q.push(v); }
      });
    }
  };
  walk('up'); walk('down');
  const q: Array<[number, number]> = [[e, 0]], seen = new Set<number>([e]);
  while (q.length) {
    const [u, d] = q.shift() as [number, number]; if (d >= 2) continue;
    m.links.forEach(l => { if (l.kind !== 'topology') return; const v = l.a === u ? l.b : l.b === u ? l.a : -1; if (v >= 0 && !seen.has(v)) { seen.add(v); out.add(v); q.push([v, d + 1]); } });
  }
  return out;
}

/* ---------- selection chain ---------- */
export type Sel = { kind: 'none' } | { kind: 'inc'; id: string } | { kind: 'alert'; id: string } | { kind: 'ent'; i: number } | { kind: 'ghost'; id: string };
export interface Chain { incs: Set<string>; alerts: Set<string>; ents: Set<number>; ghosts: Set<string> }

/** The incidents, alerts and resources that belong with the selected item. */
export function chainOf(m: Model, sel: Sel, byId: Map<string, Alert>, trees: Tree[], ghostLinks: GhostLink[] = []): Chain {
  const c: Chain = { incs: new Set(), alerts: new Set(), ents: new Set(), ghosts: new Set() };
  const entOfAlert = new Map<string, number>(); m.entities.forEach((e, i) => e.alerts.forEach(a => entOfAlert.set(a.id, i)));
  const addPath = (im: IncModel, e: number) => { const r = trees.find(t => t.im === im); let p: number | undefined = e; while (p !== undefined) { c.ents.add(p); p = r ? r.r.parent.get(p) : undefined; } };
  if (sel.kind === 'inc') {
    const im = m.incs.find(x => x.inc.id === sel.id); if (!im) return c;
    c.incs.add(im.inc.id); im.inc.alertIds.forEach(id => { if (entOfAlert.has(id)) { c.alerts.add(id); c.ents.add(entOfAlert.get(id) as number); } });
  } else if (sel.kind === 'alert') {
    const a = byId.get(sel.id); if (!a) return c;
    c.alerts.add(a.id); const e = entOfAlert.get(a.id); if (e !== undefined) c.ents.add(e);
    if (a.parent) c.alerts.add(a.parent); (a.children || []).forEach(x => c.alerts.add(x));
    m.incs.forEach(im => { if (im.inc.alertIds.includes(a.id)) { c.incs.add(im.inc.id); if (e !== undefined) addPath(im, e); } });
  } else if (sel.kind === 'ent') {
    c.ents.add(sel.i); m.entities[sel.i].alerts.forEach(a => c.alerts.add(a.id));
    m.incs.forEach(im => { if (im.entities.includes(sel.i)) { c.incs.add(im.inc.id); addPath(im, sel.i); } });
    ghostLinks.forEach(l => { if (l.a === m.entities[sel.i].name) c.ghosts.add(l.b); else if (l.b === m.entities[sel.i].name) c.ghosts.add(l.a); });
  } else if (sel.kind === 'ghost') {
    c.ghosts.add(sel.id); ghostLinks.forEach(l => { if (l.a === sel.id) { c.ghosts.add(l.b); const i = m.index.get(l.b); if (i !== undefined) c.ents.add(i); } else if (l.b === sel.id) { c.ghosts.add(l.a); const i = m.index.get(l.a); if (i !== undefined) c.ents.add(i); } });
  }
  return c;
}

/* ---------- layer layouts ---------- */
/** Alert dots around their resource (sunflower spiral, so any count stays tight and never overlaps its neighbours much). */
export function alertSpot(ex: number, ey: number, i: number, n: number): { x: number; y: number } {
  if (n <= 1) return { x: ex, y: ey };
  const r = 5.4 * Math.sqrt(i + 0.6), a = i * 2.39996;
  return { x: ex + Math.cos(a) * r, y: ey + Math.sin(a) * r };
}

/** Incident tiles along the top layer, near the middle of their resources, pushed apart so none overlaps. */
export function placeTiles(wants: Array<{ id: string; x: number }>, minGap: number, minX: number, maxX: number): Map<string, number> {
  const s = wants.slice().sort((a, b) => a.x - b.x), out = new Map<string, number>();
  let prev = -Infinity; s.forEach(w => { const x = Math.max(w.x, prev + minGap); out.set(w.id, x); prev = x; });
  // pull the whole row back inside the layer if the sweep pushed it out
  const over = (s.length ? (out.get(s[s.length - 1].id) as number) : 0) - maxX;
  if (over > 0) s.forEach(w => out.set(w.id, Math.max(minX + (s.indexOf(w)) * minGap, (out.get(w.id) as number) - over)));
  return out;
}

/* ---------- live topology neighbours ---------- */
export interface Ghost { id: string; name: string; types: string[]; sev?: number; sample?: boolean; from: string }
export interface GhostLink { a: string; b: string; type?: string }

/**
 * Reads a `/topology/{_id}` answer defensively: `_vertices` (each with `_id`, `name`, `entityTypes`, `_hasStatus`) and `_edges`
 * (each with `_fromId`/`_toId`/`_edgeType`, possibly under `edge`). UNVERIFIED against a live service: unknown shapes give no neighbours.
 */
export function parseNeighbourhood(json: any, seedId: string): { nodes: Array<{ id: string; name: string; types: string[]; sev?: number }>; edges: Array<{ from: string; to: string; type?: string }> } {
  const vs: any[] = Array.isArray(json?._vertices) ? json._vertices : Array.isArray(json?.vertices) ? json.vertices : Array.isArray(json?._items) ? json._items : [];
  const es: any[] = Array.isArray(json?._edges) ? json._edges : Array.isArray(json?.edges) ? json.edges : [];
  const nodes = vs.map(v => { const x = v && (v.mainVertex && typeof v.mainVertex === 'object' ? v.mainVertex : v); const id = x && (x._id || x.id); if (!id) return null;
    const sev = Number(x._hasStatus && typeof x._hasStatus === 'object' ? x._hasStatus.severity ?? x._hasStatus : x._hasStatus);
    return { id: String(id), name: String(x.name || x.displayName || x.uniqueId || id), types: Array.isArray(x.entityTypes) ? x.entityTypes.map(String) : x.entityType ? [String(x.entityType)] : [], sev: Number.isFinite(sev) ? sev : undefined };
  }).filter((x): x is { id: string; name: string; types: string[]; sev: number | undefined } => !!x && x.id !== seedId);
  const edges = es.map(e => { const x = e && (e.edge && typeof e.edge === 'object' ? { ...e, ...e.edge } : e); const from = x && (x._fromId || x.fromId || x.from), to = x && (x._toId || x.toId || x.to);
    return from && to ? { from: String(from), to: String(to), type: x._edgeType ? String(x._edgeType) : x.edgeType ? String(x.edgeType) : undefined } : null;
  }).filter((x): x is { from: string; to: string; type: string | undefined } => !!x);
  return { nodes, edges };
}

/** Deterministic example neighbours so the feature can be shown with sample data. Labelled as sample wherever they are drawn. */
export function sampleNeighbours(name: string): { nodes: Array<{ id: string; name: string; types: string[]; sev?: number }>; edges: Array<{ from: string; to: string; type?: string }> } {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const n = 2 + (h % 3), types = ['router', 'switch', 'host', 'service', 'database'], nodes: Array<{ id: string; name: string; types: string[] }> = [], edges: Array<{ from: string; to: string; type?: string }> = [];
  for (let i = 0; i < n; i++) { const id = `~${name}~n${i}`; nodes.push({ id, name: `${name.split(/[-_]/).slice(0, -1).join('-') || name}-peer-${i + 1}`, types: [types[(h + i) % types.length]] }); edges.push(i % 2 ? { from: id, to: `~${name}~`, type: 'dependsOn' } : { from: `~${name}~`, to: id, type: 'connectedTo' }); }
  return { nodes, edges };
}

/* ---------- propagation replay ---------- */
/** Time span of the selected incident (or all open ones): first alert to last first-occurrence. */
export function spanOf(alerts: Alert[]): { from: number; to: number } {
  if (!alerts.length) return { from: 0, to: 1 };
  const f = alerts.map(a => a.first); const from = Math.min(...f), to = Math.max(...f);
  return { from, to: to > from ? to : from + 1 };
}

/* ---------- paths, similarity, impact, change events, heat ---------- */

/** Shortest path between two resources over the given link kinds (undirected). */
export function shortestPath(m: Model, from: number, to: number, kinds: Array<Link['kind']>): number[] | null {
  if (from === to) return [from];
  const adj = new Map<number, number[]>(); m.links.forEach(l => { if (!kinds.includes(l.kind)) return; (adj.get(l.a) || adj.set(l.a, []).get(l.a) as number[]).push(l.b); (adj.get(l.b) || adj.set(l.b, []).get(l.b) as number[]).push(l.a); });
  const prev = new Map<number, number>([[from, -1]]), q = [from];
  while (q.length) { const u = q.shift() as number; for (const v of adj.get(u) || []) { if (prev.has(v)) continue; prev.set(v, u); if (v === to) { const out = [to]; let c = to; while (prev.get(c) !== -1) { c = prev.get(c) as number; out.unshift(c); } return out; } q.push(v); } }
  return null;
}

export interface Similar { im: IncModel; score: number; shared: string[]; sameCause: boolean; open: boolean }
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w)));
const jac = <T,>(a: Set<T>, b: Set<T>) => { let n = 0; a.forEach(x => { if (b.has(x)) n++; }); return a.size + b.size - n ? n / (a.size + b.size - n) : 0; };
/** Other incidents that look like this one: same resources, same cause, similar words in the title. */
export function similarIncidents(m: Model, id: string, now: number, limit = 4): Similar[] {
  const me = m.incs.find(x => x.inc.id === id); if (!me) return [];
  const mine = new Set(me.entities.map(e => m.entities[e].name)), w0 = words(me.inc.title);
  return m.incs.filter(x => x !== me).map(x => {
    const theirs = new Set(x.entities.map(e => m.entities[e].name)), shared = Array.from(mine).filter(n => theirs.has(n)), same = x.root === me.root;
    const score = Math.min(1, jac(mine, theirs) * 0.6 + jac(w0, words(x.inc.title)) * 0.25 + (same ? 0.15 : 0));
    const open = x.entities.some(e => m.entities[e].alerts.some(a => a.severity > 0 && (a.closed === undefined || a.closed > now)));
    return { im: x, score, shared, sameCause: same, open };
  }).filter(s => s.score >= 0.12).sort((a, b) => b.score - a.score).slice(0, limit);
}

export const SERVICE_TYPE = /service|application|app\b|slice|customer|vnf|cnf|api|database|\bdb\b|queue|tenant|gateway|portal/i;
export const SERVICE_NAME = /svc|service|api|portal|gateway|\bgw\b|billing|crm|payments|auth|dns|cdn|db\b|database/i;
export interface Impact { services: Array<{ i: number; name: string; why: string }>; types: Array<[string, number]>; share: number }
/** Which of an incident's resources face a service, by their topology entity types (or, failing that, their names). */
export function impactOf(m: Model, im: IncModel): Impact {
  const counts = new Map<string, number>(), services: Impact['services'] = [];
  im.entities.forEach(e => {
    const ent = m.entities[e], types = Array.from(new Set(ent.alerts.flatMap(a => a.entityTypes || [])));
    types.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
    const byType = types.find(t => SERVICE_TYPE.test(t));
    if (byType) services.push({ i: e, name: ent.name, why: byType }); else if (!types.length && SERVICE_NAME.test(ent.name)) services.push({ i: e, name: ent.name, why: 'by name' });
  });
  return { services, types: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]), share: im.entities.length ? services.length / im.entities.length : 0 };
}

export interface Change { id: string; time: number; resource?: string; label: string; kind: string; sample?: boolean }
const CHANGE_RE = /change|deploy|maintenance|config|upgrade|patch|rollout|release|restart/i;
/** Change-like events already in the alert feed (alert type or summary says change / deploy / maintenance ...). */
export function changeAlerts(alerts: Alert[]): Change[] {
  return alerts.filter(a => CHANGE_RE.test(a.type || '') && !/problem/i.test(a.type || '')).map(a => ({ id: a.id, time: a.first, resource: a.resource || a.sender, label: a.summary, kind: a.type || 'change' }));
}
/** Changes on a resource in the window before its first alert. */
export function changesBefore(changes: Change[], name: string, firstAlert: number, windowMs = 45 * 60000): Change[] {
  return changes.filter(c => c.resource === name && c.time <= firstAlert + 60000 && c.time >= firstAlert - windowMs).sort((a, b) => b.time - a.time);
}

/** Alerts first seen per time bucket, split into 5 severity bands (info, warning, minor, major, critical). */
export function heat(alerts: Alert[], from: number, to: number, n: number): number[][] {
  const out = Array.from({ length: n }, () => [0, 0, 0, 0, 0]), span = Math.max(1, to - from);
  alerts.forEach(a => { if (a.severity <= 0 || a.first < from || a.first > to) return; const b = Math.min(n - 1, Math.floor(((a.first - from) / span) * n)), s = a.severity >= 6 ? 4 : a.severity === 5 ? 3 : a.severity === 4 ? 2 : a.severity === 3 ? 1 : 0; out[b][s]++; });
  return out;
}
