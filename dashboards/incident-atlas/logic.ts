/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure logic for Blast Radius: turns getAlerts / getStories results into a graph of affected resources, works out which
 * resource is the likely cause of each incident, and rebuilds past states for replay. No React, no network.
 *
 * Where the links come from (nothing here is invented):
 *   - causal links: IBM's own incident correlation. Every alert in an incident points from the incident's probable-cause
 *     alert (rank 1) to the other alerts' resources. Without a ranking, the earliest alert in the incident is used.
 *   - topology links: only when the host passes `topologyLinks` (real adjacency, resource names).
 */

export const SEV_LABEL = ['Clear', 'Indeterminate', 'Information', 'Warning', 'Minor', 'Major', 'Critical'];
/** Health of a resource whose worst open alert has this severity (index = severity). */
export const SEV_HEALTH = [1, 0.95, 0.92, 0.75, 0.6, 0.35, 0.1];
export const sevLabel = (s: number) => SEV_LABEL[Math.min(Math.max(Math.round(s), 0), 6)];

export interface Alert {
  id: string;
  summary: string;
  severity: number;
  state: string;
  first: number;
  last: number;
  closed?: number;
  sender?: string;
  resource?: string;
  type?: string;
  team?: string;
  rank?: number;
  /** Topology service id of the resource, from the alert's topology insight. */
  uniqueId?: string;
  /** Runbook / policy details attached to this alert (runbook insights). */
  runbooks?: any[];
  entityTypes?: string[];
  /** Alert group: id of the parent (group) alert this alert belongs to, when Concert Operate reports one. */
  parent?: string;
  /** Alert group: ids of the child alerts under this parent alert. */
  children?: string[];
  /** Causal-insight ids this alert shares with others (how Concert Operate groups alerts). */
  gk?: { union?: string; scope: string[]; temporal: string[]; topo: string[] };
}

export interface Incident {
  id: string;
  title: string;
  priority: number;
  state: string;
  alertIds: string[];
  created?: number;
  /** alertId -> probable-cause rank (1 = most likely) */
  ranks: Record<string, number>;
}

export interface TopologyLink { source: string; target: string; relType?: string }

const PROBABLE_CAUSE = 'probable-cause';

export const cleanName = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  const last = t.split('/').pop() || t;
  return (last.split(':::')[0] || last).trim() || t;
};

const toMs = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e11) return n;
  if (Number.isFinite(n) && n > 1e8) return n * 1000;
  const d = Date.parse(String(v));
  return Number.isFinite(d) ? d : undefined;
};
const safeJson = (v: unknown): any => { if (typeof v !== 'string' || !v) return undefined; try { return JSON.parse(v); } catch (e) { return undefined; } };

/** `data.tenant.alerts.{columns,rows}` -> alerts (same envelope as the toolkit's getAlerts). */
export const PARENT_COLUMNS = ['parentId', 'parent.id', 'parentAlertId', 'groupParentId', 'alertGroupParentId', 'parentAlert'];
export const CHILD_COLUMNS = ['childIds', 'children', 'childAlertIds', 'childAlerts', 'groupChildren'];
const idList = (v: string | undefined): string[] => {
  if (!v) return [];
  const j = safeJson(v);
  if (Array.isArray(j)) return j.map(x => (x && typeof x === 'object' ? String((x as any).id ?? '') : String(x))).filter(Boolean);
  return v.split(/[,;\s]+/).filter(Boolean);
};

/** Keeps only group links that point at an alert we have, never at itself, and never in a loop. Fills `children`. */
export function resolveGroups(alerts: Alert[]): Alert[] {
  const byId = new Map(alerts.map(a => [a.id, a] as [string, Alert]));
  alerts.forEach(a => (a.children || []).forEach(c => { const k = byId.get(c); if (k && k.id !== a.id && !k.parent) k.parent = a.id; }));
  alerts.forEach(a => { if (a.parent && (a.parent === a.id || !byId.has(a.parent))) a.parent = undefined; });
  alerts.forEach(a => {
    let p = a.parent; const seen = new Set<string>([a.id]);
    while (p) { if (seen.has(p)) { a.parent = undefined; break; } seen.add(p); p = (byId.get(p) as Alert).parent; }
  });
  alerts.forEach(a => { a.children = []; });
  alerts.forEach(a => { if (a.parent) (byId.get(a.parent) as Alert).children?.push(a.id); });
  return alerts;
}

export interface GroupInfo { columns: string[]; insights: string[]; seenColumns: string[]; seenInsightTypes: string[]; links: number }
const RE_CHILD = /child|member|sub(?!ject)|descend/i, RE_PARENT = /parent|group|root|master|correl|aggregat|summary-?of/i;
const idsIn = (v: unknown): string[] => {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v.flatMap(idsIn);
  if (typeof v === 'object') { const o = v as any; return o.id !== undefined ? idsIn(o.id) : []; }
  const s = String(v), j = safeJson(s);
  if (j !== undefined && typeof j === 'object') return idsIn(j);
  return s.split(/[,;\s]+/).filter(Boolean);
};

/** Reads alerts and works out, from the data itself, which fields carry alert groups (parent / children). */
export function adaptAlertsEx(data: any, extraParentColumns: string[] = []): { alerts: Alert[]; groups: GroupInfo } {
  const alerts = adaptAlertsBase(data, extraParentColumns);
  const src = data?.tenant?.alerts;
  const columns: Array<{ name?: string }> = Array.isArray(src?.columns) ? src.columns : [];
  const rows: Array<{ fields?: Array<string | null> }> = Array.isArray(src?.rows) ? src.rows : [];
  const info: GroupInfo = { columns: [], insights: [], seenColumns: columns.map(c => (c && c.name) || '').filter(Boolean), seenInsightTypes: [], links: 0 };
  const idCol = columns.findIndex(c => c && c.name === 'id');
  if (idCol < 0) return { alerts, groups: info };
  const all = new Set(rows.map(r => String(((r && r.fields) || [])[idCol] ?? '')).filter(Boolean));
  const byId = new Map(alerts.map(a => [a.id, a] as [string, Alert]));
  const types = new Set<string>();
  // relation -> {parent id for child id}
  const rel = new Map<string, { kind: 'parent' | 'child' | 'unknown'; pairs: Array<[string, string]> }>();
  const note = (key: string, kind: 'parent' | 'child' | 'unknown', self: string, other: string) => {
    if (other === self || !all.has(other)) return;
    let r = rel.get(key); if (!r) { r = { kind, pairs: [] }; rel.set(key, r); }
    r.pairs.push([self, other]);
  };
  rows.forEach(r => {
    const f = (r && r.fields) || [], self = String(f[idCol] ?? '');
    if (!self) return;
    columns.forEach((c, i) => {
      const n = (c && c.name) || '';
      if (!n || n === 'id' || n === 'summary') return;
      if (n.startsWith('@insights.type=')) {
        const parsed = safeJson(f[i]);
        const walk = (o: any, type: string, depth: number) => {
          if (!o || typeof o !== 'object' || depth > 4) return;
          if (Array.isArray(o)) { o.forEach(x => walk(x, type, depth + 1)); return; }
          const t = typeof o.type === 'string' ? o.type : type; if (depth === 1 && typeof o.type === 'string') types.add(o.type);
          Object.keys(o).forEach(k => {
            const v = o[k];
            if (v && typeof v === 'object') { walk(v, t, depth + 1); if (!RE_CHILD.test(k) && !RE_PARENT.test(k)) return; }
            if (k === 'type' || t.includes(PROBABLE_CAUSE)) return;
            const typed = /group|parent|child|correl/i.test(t);
            const kind = RE_CHILD.test(k) ? 'child' : RE_PARENT.test(k) ? 'parent' : typed ? 'unknown' : undefined;
            if (kind) idsIn(v).forEach(x => note('insight ' + t.replace(/^.*insight-type\//, '') + ' . ' + k, kind, self, x));
          });
        };
        walk(parsed, '', 0);
        return;
      }
      const v = f[i]; if (v === null || v === undefined || v === '') return;
      const s = String(v); if (s.length > 4000) return;
      const toks = idsIn(s);
      if (toks.length > 40) return;
      toks.forEach(x => note(n, RE_CHILD.test(n) ? 'child' : RE_PARENT.test(n) ? 'parent' : 'unknown', self, x));
    });
  });
  rel.forEach((r, key) => {
    let kind = r.kind;
    if (kind === 'unknown') {
      const per = new Map<string, number>(), tgt = new Map<string, number>();
      r.pairs.forEach(([a, b]) => { per.set(a, (per.get(a) || 0) + 1); tgt.set(b, (tgt.get(b) || 0) + 1); });
      const multi = Array.from(per.values()).some(n => n > 1), shared = Array.from(tgt.values()).some(n => n > 1);
      if (multi && !shared) kind = 'child'; else if (shared && !multi) kind = 'parent'; else if (!multi && !shared) return; // 1:1 pairs: too ambiguous (could be any cross reference)
      else kind = 'parent';
    }
    let used = 0;
    r.pairs.forEach(([self, other]) => {
      const child = kind === 'parent' ? self : other, par = kind === 'parent' ? other : self;
      const c = byId.get(child); if (c && !c.parent && child !== par) { c.parent = par; used++; }
    });
    if (used) { info.links += used; (key.startsWith('insight ') ? info.insights : info.columns).push(key.replace(/^insight /, '') + (kind === 'child' ? ' (children)' : ' (parent)')); }
  });
  info.seenInsightTypes = Array.from(types);
  if (info.links) resolveGroups(alerts);
  return { alerts, groups: info };
}

export function adaptAlerts(data: any, extraParentColumns: string[] = []): Alert[] { return adaptAlertsEx(data, extraParentColumns).alerts; }

function adaptAlertsBase(data: any, extraParentColumns: string[] = []): Alert[] {
  const src = data?.tenant?.alerts;
  const columns: Array<{ name?: string }> = Array.isArray(src?.columns) ? src.columns : [];
  const rows: Array<{ fields?: Array<string | null> }> = Array.isArray(src?.rows) ? src.rows : [];
  const index = new Map<string, number>();
  columns.forEach((c, i) => { if (c && c.name) index.set(c.name, i); });
  const insightCols = columns.map((c, i) => ({ i, name: (c && c.name) || '' })).filter(c => c.name.startsWith('@insights.type='));
  const out: Alert[] = [];
  rows.forEach(r => {
    const f = (r && r.fields) || [];
    const get = (n: string): string | undefined => { const i = index.get(n); const v = i === undefined ? undefined : f[i]; return v === null || v === undefined || v === '' ? undefined : String(v); };
    const id = get('id');
    if (!id) return;
    const sev = Number(get('severity'));
    const first = toMs(get('firstOccurrenceTime')) ?? toMs(get('lastOccurrenceTime')) ?? Date.now();
    const gk = { union: undefined as string | undefined, scope: [] as string[], temporal: [] as string[], topo: [] as string[] };
    let rank: number | undefined; let uniqueId: string | undefined; const runbooks: any[] = []; const entityTypes = new Set<string>();
    insightCols.forEach(({ i }) => {
      const parsed = safeJson(f[i]);
      (Array.isArray(parsed) ? parsed : []).forEach((p: any) => {
        if (!p || typeof p.type !== 'string') return;
        if (p.type.endsWith('/relationship/causal-union') && p.id) gk.union = String(p.id);
        else if (p.type.endsWith('/relationship/causal') && p.id && typeof p.source === 'string') {
          if (p.source.endsWith('/causal/custom')) gk.scope.push(String(p.id));
          else if (p.source.endsWith('/causal/temporal') || p.source.endsWith('/causal/temporal-pattern')) gk.temporal.push(String(p.id));
          else if (p.source.endsWith('/causal/topological-group')) gk.topo.push(String(p.id));
        }
        if (p.type.includes(PROBABLE_CAUSE)) { const rk = Number(p.details && p.details.rank); rank = Math.min(rank ?? Infinity, Number.isFinite(rk) && rk > 0 ? rk : 1); }
        else if (p.type.includes('insight-type/runbook') && p.details) runbooks.push(p.details);
        else if (p.type.includes('insight-type/topology/')) {
          if (p.type.endsWith('/resource') && p.details && typeof p.details.uniqueId === 'string' && p.details.uniqueId) uniqueId = p.details.uniqueId;
          const et = p.details && p.details.entityTypes; if (Array.isArray(et)) et.forEach((x: unknown) => entityTypes.add(String(x)));
        }
      });
    });
    let parent: string | undefined; let children: string[] = [];
    [...extraParentColumns, ...PARENT_COLUMNS].forEach(n => { if (!parent) { const v = get(n); if (v) { const j = safeJson(v); parent = j && typeof j === 'object' && !Array.isArray(j) ? String((j as any).id ?? '') || undefined : v; } } });
    CHILD_COLUMNS.forEach(n => { children = children.concat(idList(get(n))); });
    out.push({
      parent, children: children.length ? children : undefined, gk, uniqueId, runbooks: runbooks.length ? runbooks : undefined, entityTypes: entityTypes.size ? Array.from(entityTypes) : undefined,
      id, summary: get('summary') || '', severity: Number.isFinite(sev) ? sev : 0, state: get('state') || '',
      first, last: toMs(get('lastOccurrenceTime')) ?? first, closed: toMs(get('closedTime')),
      sender: get('sender.name'), resource: get('resource.name'), type: get('type.classification'), team: get('team'), rank
    });
  });
  return resolveGroups(out);
}

/** `data.tenant.stories` -> incidents (same envelope as the toolkit's getStories). */
export function adaptIncidents(data: any): Incident[] {
  const raw = data?.tenant?.stories;
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.stories) ? raw.stories : [];
  const out: Incident[] = [];
  list.forEach(s => {
    if (!s || typeof s !== 'object' || !s.id) return;
    const insights = Array.isArray(s.insights) ? s.insights : safeJson(s.insights);
    const ranks: Record<string, number> = {};
    (Array.isArray(insights) ? insights : []).forEach((ins: any) => {
      if (ins && typeof ins.type === 'string' && ins.type.includes(PROBABLE_CAUSE) && ins.details && ins.details.id) {
        const rk = Number(ins.details.rank);
        const id = String(ins.details.id);
        ranks[id] = Math.min(ranks[id] ?? Infinity, Number.isFinite(rk) && rk > 0 ? rk : 1);
      }
    });
    const pr = Number(s.priority);
    out.push({
      id: String(s.id), title: s.title ? String(s.title) : 'Untitled incident', priority: Number.isFinite(pr) ? pr : 0,
      state: s.state ? String(s.state) : '', alertIds: Array.isArray(s.alertIds) ? s.alertIds.map(String) : [], created: toMs(s.createdTime), ranks
    });
  });
  return out;
}

export interface Entity { id: string; name: string; alerts: Alert[]; uniqueId?: string }
export interface Link { a: number; b: number; kind: 'causal' | 'topology' | 'group'; inc?: string }
export interface IncModel { inc: Incident; entities: number[]; root: number; source: 'ranking' | 'timing'; start: number }
export interface Model { entities: Entity[]; index: Map<string, number>; links: Link[]; incs: IncModel[]; unattributed: number }

export function buildModel(alerts: Alert[], incidents: Incident[], topology: TopologyLink[] = []): Model {
  const entities: Entity[] = [], index = new Map<string, number>();
  let unattributed = 0;
  const entOf = new Map<string, number>(); // alert id -> entity
  const ent = (name: string) => { let i = index.get(name); if (i === undefined) { i = entities.length; index.set(name, i); entities.push({ id: name, name, alerts: [] }); } return i; };
  alerts.forEach(a => {
    const n = cleanName(a.resource) || cleanName(a.sender);
    if (!n) { unattributed++; return; }
    const i = ent(n); entities[i].alerts.push(a); entOf.set(a.id, i); if (a.uniqueId && !entities[i].uniqueId) entities[i].uniqueId = a.uniqueId;
  });
  const links: Link[] = [], keys = new Set<string>();
  const add = (a: number, b: number, kind: Link['kind'], inc?: string) => {
    if (a === b) return;
    const k = `${kind}|${a}>${b}`; if (keys.has(k)) return; keys.add(k); links.push({ a, b, kind, inc });
  };
  const byId = new Map(alerts.map(a => [a.id, a] as [string, Alert]));
  // Alert groups: parent alert's resource -> child alert's resource. A resource with a group parent hangs under it.
  const gpar = new Map<number, number>();
  alerts.forEach(a => {
    if (!a.parent) return; const c = entOf.get(a.id), p = entOf.get(a.parent);
    if (c === undefined || p === undefined || c === p || gpar.has(c)) return;
    let q: number | undefined = p; const seen = new Set<number>([c]); let loop = false;
    while (q !== undefined) { if (seen.has(q)) { loop = true; break; } seen.add(q); q = gpar.get(q); }
    if (!loop) { gpar.set(c, p); add(p, c, 'group'); }
  });
  const incs: IncModel[] = [];
  incidents.forEach(inc => {
    const present = inc.alertIds.filter(id => entOf.has(id));
    if (!present.length) return;
    let rootId = present.filter(id => inc.ranks[id] !== undefined).sort((x, y) => inc.ranks[x] - inc.ranks[y])[0];
    const source: IncModel['source'] = rootId ? 'ranking' : 'timing';
    if (!rootId) rootId = present.slice().sort((x, y) => (byId.get(x) as Alert).first - (byId.get(y) as Alert).first)[0];
    const root = entOf.get(rootId) as number;
    const ents = Array.from(new Set(present.map(id => entOf.get(id) as number)));
    ents.forEach(e => { if (e !== root && gpar.has(e) && ents.includes(gpar.get(e) as number)) { add(gpar.get(e) as number, e, 'group', inc.id); return; } add(root, e, 'causal', inc.id); });
    incs.push({ inc, entities: ents, root, source, start: Math.min(...present.map(id => (byId.get(id) as Alert).first)) });
  });
  topology.forEach(l => {
    const a = index.get(cleanName(l.source) || ''), b = index.get(cleanName(l.target) || '');
    if (a !== undefined && b !== undefined) add(a, b, 'topology');
  });
  return { entities, index, links, incs, unattributed };
}

export const openAt = (a: Alert, t: number): boolean => {
  if (a.first > t) return false;
  const closed = a.closed ?? (a.state.toLowerCase() === 'clear' ? a.last : undefined);
  return closed === undefined || closed > t;
};

export interface Frame { t: number; h: Float32Array; worst: Uint8Array; open: number; critical: number; entities: number; incidents: number }
export function frameAt(m: Model, t: number): Frame {
  const h = new Float32Array(m.entities.length).fill(1), worst = new Uint8Array(m.entities.length);
  let open = 0, critical = 0, ents = 0;
  m.entities.forEach((e, i) => {
    e.alerts.forEach(a => {
      if (!openAt(a, t)) return;
      open++; if (a.severity >= 6) critical++;
      const s = Math.min(6, Math.max(0, Math.round(a.severity)));
      if (s > worst[i]) worst[i] = s;
    });
    h[i] = SEV_HEALTH[worst[i]];
    if (h[i] < 0.9) ents++;
  });
  const incidents = m.incs.filter(x => x.start <= t && x.entities.some(e => h[e] < 0.9)).length;
  return { t, h, worst, open, critical, entities: ents, incidents };
}

/** Evenly spaced replay times from the first alert in the window up to now. */
export function frameTimes(alerts: Alert[], now: number, windowMin: number, count = 120): number[] {
  const from = now - windowMin * 60000;
  const firsts = alerts.map(a => a.first).filter(t => t >= from);
  const start = Math.max(from, firsts.length ? Math.min(...firsts) - 60000 : from);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(start + (now - start) * (i / (count - 1)));
  return out;
}

export interface Suspect { entity: number; share: number; rank?: number }
/** Likely cause ranking for an incident: IBM's rank when it exists, earliness otherwise. Shares add up to 1. */
export function suspects(m: Model, im: IncModel, t: number): Suspect[] {
  const raw = im.entities.map(e => {
    const as = m.entities[e].alerts.filter(a => im.inc.alertIds.includes(a.id));
    const ranks = as.map(a => im.inc.ranks[a.id]).filter(r => r !== undefined);
    const rank = ranks.length ? Math.min(...ranks) : undefined;
    const first = Math.min(...as.map(a => a.first));
    return { e, rank, first };
  });
  const mn = Math.min(...raw.map(r => r.first)), mx = Math.max(...raw.map(r => r.first));
  const sc = raw.map(r => (r.rank !== undefined ? 1 / r.rank : 0.2) * 0.7 + (1 - (r.first - mn) / (mx - mn + 1)) * 0.3);
  const ex = sc.map(s => Math.exp(s * 5)), tot = ex.reduce((a, b) => a + b, 0);
  return raw.map((r, i) => ({ entity: r.e, share: ex[i] / tot, rank: r.rank })).sort((a, b) => b.share - a.share);
}

export interface Reach { depth: Map<number, number>; parent: Map<number, number> }
/**
 * Entities reachable from `root` (cause -> effect along causal and group links, either way along topology links) with their
 * hop count and the resource they were reached from. A node in `collapsed` is reached but not expanded.
 */
export function reach(m: Model, root: number, collapsed?: Set<number>): Reach {
  const depth = new Map<number, number>([[root, 0]]), parent = new Map<number, number>();
  const q = [root];
  while (q.length) {
    const u = q.shift() as number;
    if (collapsed && collapsed.has(u)) continue;
    m.links.forEach(l => {
      let v = -1;
      if (l.a === u) v = l.b; else if (l.kind === 'topology' && l.b === u) v = l.a;
      if (v >= 0 && !depth.has(v)) { depth.set(v, (depth.get(u) as number) + 1); parent.set(v, u); q.push(v); }
    });
  }
  return { depth, parent };
}
export const blastRadius = (m: Model, root: number, collapsed?: Set<number>): Map<number, number> => reach(m, root, collapsed).depth;

/** Root -> node chain (node last), or just [node] when the node is not reachable from `root`. */
export function pathTo(m: Model, root: number, node: number): number[] {
  const r = reach(m, root), out = [node]; let p = r.parent.get(node);
  while (p !== undefined) { out.unshift(p); p = r.parent.get(p); }
  return out;
}

/* ---------- layout ---------- */
export type LayoutMode = 'lanes' | 'tree' | 'radial' | 'grid' | 'sankey' | 'combined';
export const LAYOUT_MODES: Array<{ id: LayoutMode; label: string; hint: string }> = [
  { id: 'lanes', label: 'Lanes', hint: 'Columns by hops from the cause' },
  { id: 'tree', label: 'Tree', hint: 'Each resource beside the one it hangs under' },
  { id: 'radial', label: 'Radial', hint: 'Rings around the cause' },
  { id: 'grid', label: 'Grid', hint: 'Compact, worst first' },
  { id: 'sankey', label: 'Lineage', hint: 'Sankey: how the fault flows from the cause downstream; bar height = alerts' },
  { id: 'combined', label: 'Combined', hint: 'One Sankey for every incident; shared resources drawn once, ribbons tinted by incident' }
];
export const LAYOUT = { colW: 196, rowH: 64, rows: 8, head: 66, padX: 30, padY: 24, gap: 30 };
export interface LaneBox { title: string; inc: string | null; x: number; y: number; w: number; h: number; count: number; priority: number }
export interface Layout { x: Float32Array; y: Float32Array; lanes: LaneBox[]; width: number; height: number; lane: Int32Array; bar: Float32Array }
interface Placed { pos: Map<number, [number, number]>; w: number; h: number; bar?: Map<number, number> }
export const SANKEY_BAR_W = 14;

function gridPlace(list: number[], cols: number): Placed {
  const L = LAYOUT, pos = new Map<number, [number, number]>(), rows = Math.ceil(list.length / cols);
  list.forEach((e, i) => pos.set(e, [L.padX + (i % cols) * L.colW + L.colW / 2, L.head + Math.floor(i / cols) * L.rowH + L.rowH / 2]));
  return { pos, w: L.padX * 2 + cols * L.colW, h: L.head + rows * L.rowH + L.padY };
}

function placeLane(mode: LayoutMode, members: number[], dep: Int32Array, par: Map<number, number> | undefined, byName: (a: number, b: number) => number, weight: (e: number) => number = () => 1): Placed {
  const L = LAYOUT, pos = new Map<number, [number, number]>();
  if ((mode === 'sankey' || mode === 'combined')) {
    // columns by hops from the cause; bar height grows with alert count; each column ordered under its parent to cut crossings
    const bar = new Map<number, number>(), GAP = 14, cols = new Map<number, number[]>();
    members.forEach(e => { const l = cols.get(dep[e]) || []; l.push(e); cols.set(dep[e], l); bar.set(e, Math.min(110, 18 + 9 * weight(e))); });
    const depths = Array.from(cols.keys()).sort((a, b) => a - b), cy = new Map<number, number>(), colH = (d: number) => (cols.get(d) as number[]).reduce((t, e) => t + (bar.get(e) as number) + GAP, -GAP);
    const tall = Math.max(60, ...depths.map(colH));
    depths.forEach(d => {
      const list = (cols.get(d) as number[]).sort((a, b) => ((par?.get(a) !== undefined ? cy.get(par?.get(a) as number) ?? 0 : 0) - (par?.get(b) !== undefined ? cy.get(par?.get(b) as number) ?? 0 : 0)) || byName(a, b));
      let y = L.head + (mode === 'combined' ? 26 : 0) + (tall - colH(d)) / 2;
      list.forEach(e => { const hh = bar.get(e) as number; pos.set(e, [L.padX + depths.indexOf(d) * L.colW + L.colW / 2 - 30, y + hh / 2]); cy.set(e, y + hh / 2); y += hh + GAP; });
    });
    return { pos, bar, w: L.padX * 2 + depths.length * L.colW, h: L.head + (mode === 'combined' ? 26 : 0) + tall + L.padY };
  }
  const root = members.find(e => dep[e] === 0);
  if (mode === 'grid') return gridPlace(members.slice().sort(byName), Math.max(2, Math.min(8, Math.ceil(Math.sqrt(members.length * 1.1)))));
  if (mode === 'tree' && par && root !== undefined) {
    const kids = new Map<number, number[]>(); members.forEach(e => { const p = par.get(e); if (p !== undefined && e !== root) { const l = kids.get(p) || []; l.push(e); kids.set(p, l); } });
    let leaf = 0, maxD = 0; const RH = 56;
    const walk = (e: number, d: number): number => {
      maxD = Math.max(maxD, d); const ch = (kids.get(e) || []).sort(byName);
      let y: number;
      if (!ch.length) y = leaf++ * RH; else { const ys = ch.map(c => walk(c, d + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; }
      pos.set(e, [L.padX + d * L.colW + L.colW / 2, L.head + y + RH / 2]); return y;
    };
    walk(root, 0);
    return { pos, w: L.padX * 2 + (maxD + 1) * L.colW, h: L.head + Math.max(1, leaf) * RH + L.padY };
  }
  if (mode === 'radial' && root !== undefined) {
    const rings = new Map<number, number[]>(); members.forEach(e => { const l = rings.get(dep[e]) || []; l.push(e); rings.set(dep[e], l); });
    const ang = new Map<number, number>([[root, -Math.PI / 2]]), rad = new Map<number, number>([[root, 0]]);
    let prevR = 0, maxR = 0;
    Array.from(rings.keys()).filter(d => d > 0).sort((a, b) => a - b).forEach(d => {
      const list = (rings.get(d) as number[]).sort((a, b) => ((ang.get(par?.get(a) ?? root) ?? 0) - (ang.get(par?.get(b) ?? root) ?? 0)) || byName(a, b));
      const r = Math.max(prevR + 150, list.length * 118 / (2 * Math.PI), 150);
      list.forEach((e, i) => { const a = -Math.PI / 2 + (i / list.length) * Math.PI * 2 + (d % 2 ? 0 : Math.PI / list.length); ang.set(e, a); rad.set(e, r); });
      prevR = r; maxR = r;
    });
    const w = Math.max(L.colW * 2.4, 2 * (maxR + 110)), cx = w / 2, cy = L.head + maxR + 50;
    members.forEach(e => { const r = rad.get(e) ?? 0, a = ang.get(e) ?? 0; pos.set(e, [cx + Math.cos(a) * r, cy + Math.sin(a) * r]); });
    return { pos, w, h: L.head + 2 * (maxR + 50) + L.padY };
  }
  // lanes: columns by hops
  const byDepth = new Map<number, number[]>(); members.forEach(e => { const l = byDepth.get(dep[e]) || []; l.push(e); byDepth.set(dep[e], l); });
  const cols: number[][] = [];
  Array.from(byDepth.keys()).sort((a, b) => a - b).forEach(d => {
    const list = (byDepth.get(d) as number[]).sort(byName);
    for (let i = 0; i < list.length; i += L.rows) cols.push(list.slice(i, i + L.rows));
  });
  const tallest = Math.max(1, ...cols.map(c => c.length));
  cols.forEach((c, ci) => { const off = ci === 0 ? (tallest - c.length) / 2 : 0; c.forEach((e, ri) => pos.set(e, [L.padX + ci * L.colW + L.colW / 2, L.head + (ri + off) * L.rowH + L.rowH / 2])); });
  return { pos, w: L.padX * 2 + Math.max(1, cols.length) * L.colW, h: L.head + tallest * L.rowH + L.padY };
}

/**
 * One lane per active incident, then a compact grid for every resource that is not part of an incident. How the resources
 * are arranged inside a lane depends on `mode`. Positions are fixed and readable; nothing overlaps. Resources in `hidden`
 * (under a collapsed node) are left out.
 */
export function layoutLanes(m: Model, lanes: Array<{ im: IncModel; depth: Map<number, number>; parent?: Map<number, number> }>, worst: Uint8Array, mode: LayoutMode = 'lanes', hidden: Set<number> = new Set(), wrapW = 0): Layout {
  const L = LAYOUT, n = m.entities.length;
  const BAR = new Float32Array(n), X = new Float32Array(n), Y = new Float32Array(n), laneOf = new Int32Array(n).fill(-1), dep = new Int32Array(n);
  const combined = mode === 'combined';
  lanes.forEach((ln, k) => ln.depth.forEach((d, e) => { if (hidden.has(e)) return; if (combined) { dep[e] = laneOf[e] < 0 ? d : Math.max(dep[e], d); laneOf[e] = 0; } else if (laneOf[e] < 0) { laneOf[e] = k; dep[e] = d; } }));
  if (combined) {
    const par = new Map<number, number>(); lanes.forEach(ln => ln.parent && ln.parent.forEach((p, e) => { if (!par.has(e) && dep[p] < dep[e]) par.set(e, p); }));
    const members: number[] = [], rest: number[] = [];
    for (let e = 0; e < n; e++) if (!hidden.has(e)) (laneOf[e] === 0 ? members : rest).push(e);
    rest.forEach(e => { laneOf[e] = 0; });
    const byN = (a: number, b: number) => worst[b] - worst[a] || m.entities[a].name.localeCompare(m.entities[b].name);
    const pl = placeLane('combined', members, dep, par, byN, e => m.entities[e].alerts.length);
    pl.pos.forEach(([px, py], e) => { X[e] = px; Y[e] = py; BAR[e] = (pl.bar && pl.bar.get(e)) || 0; });
    let w = Math.max(pl.w, 400), h = pl.h;
    if (rest.length) { // resources outside any incident: a compact grid to the right of the lineage
      const g = gridPlace(rest.sort(byN), Math.max(3, Math.min(5, Math.ceil(Math.sqrt(rest.length * 1.1)))));
      g.pos.forEach(([px, py], e) => { X[e] = w + px; Y[e] = py; });
      w += g.w; h = Math.max(h, g.h);
    }
    return { x: X, y: Y, lanes: [{ title: lanes.length ? 'All incidents' : 'Resources with open alerts', inc: null, x: 0, y: 0, w, h, count: members.length + rest.length, priority: 0 }], width: w, height: Math.max(h, 200), lane: laneOf, bar: BAR };
  }
  const byName = (a: number, b: number) => worst[b] - worst[a] || m.entities[a].name.localeCompare(m.entities[b].name);
  type Item = { box: Omit<LaneBox, 'x' | 'y'>; pl: Placed };
  const items: Item[] = [];
  lanes.forEach((ln, k) => {
    const members: number[] = []; for (let e = 0; e < n; e++) if (laneOf[e] === k) members.push(e);
    const pl = placeLane(mode, members, dep, ln.parent, byName, e => m.entities[e].alerts.length);
    pl.w = Math.max(pl.w, 400);
    items.push({ box: { title: ln.im.inc.title, inc: ln.im.inc.id, w: pl.w, h: pl.h, count: members.length, priority: ln.im.inc.priority }, pl });
  });
  const rest: number[] = []; for (let e = 0; e < n; e++) if (laneOf[e] < 0 && !hidden.has(e)) rest.push(e);
  if (rest.length) {
    const pl = gridPlace(rest.sort(byName), Math.max(3, Math.min(6, Math.ceil(Math.sqrt(rest.length * 1.1)))));
    items.push({ box: { title: lanes.length ? 'Not part of an incident' : 'Resources with open alerts', inc: null, w: pl.w, h: pl.h, count: rest.length, priority: 0 }, pl });
  }
  // Shelf packing: lanes go left to right until the row is full (wrapW), then a new row starts, so many lanes are visible at once.
  const boxes: LaneBox[] = [];
  let x0 = 0, y0 = 0, rowH = 0, width = 0;
  items.forEach(it => {
    if (wrapW > 0 && x0 > 0 && x0 + it.box.w > wrapW) { y0 += rowH + L.gap; x0 = 0; rowH = 0; }
    const ox = x0, oy = y0;
    it.pl.pos.forEach(([px, py], e) => { X[e] = ox + px; Y[e] = oy + py; BAR[e] = (it.pl.bar && it.pl.bar.get(e)) || 0; });
    boxes.push({ ...it.box, x: ox, y: oy });
    x0 += it.box.w + L.gap; rowH = Math.max(rowH, it.box.h); width = Math.max(width, ox + it.box.w);
    if (wrapW <= 0) { y0 += rowH + L.gap; x0 = 0; rowH = 0; }
  });
  const height = wrapW > 0 ? y0 + rowH : Math.max(0, y0 - L.gap);
  return { x: X, y: Y, lanes: boxes, width, height: Math.max(height, 200), lane: laneOf, bar: BAR };
}

export type GroupMethod = 'api' | 'union' | 'scope' | 'temporal' | 'topo';
const keyOf = (a: Alert, m: GroupMethod): string | undefined => {
  const g = a.gk; if (!g) return undefined;
  if (m === 'union') return g.union;
  const l = m === 'scope' ? g.scope : m === 'temporal' ? g.temporal : g.topo;
  return l.length ? [...l].sort()[0] : undefined;
};
/** Alert groups by a shared causal insight id: { groups with 2+ alerts, alerts inside them }. */
export function groupStats(alerts: Alert[], m: GroupMethod): { groups: number; inGroups: number } {
  const c = new Map<string, number>();
  alerts.forEach(a => { const k = keyOf(a, m); if (k) c.set(k, (c.get(k) || 0) + 1); });
  let groups = 0, inGroups = 0; c.forEach(n => { if (n > 1) { groups++; inGroups += n; } });
  return { groups, inGroups };
}
/** Copies the alerts and sets parent/children from the chosen grouping ('api' keeps what the data said). */
export function regroup(alerts: Alert[], m: GroupMethod): Alert[] {
  if (m === 'api') return alerts;
  const out = alerts.map(a => ({ ...a, parent: undefined as string | undefined, children: [] as string[] }));
  const by = new Map<string, Alert[]>();
  out.forEach(a => { const k = keyOf(a, m); if (k) { const l = by.get(k); if (l) l.push(a); else by.set(k, [a]); } });
  by.forEach(l => {
    if (l.length < 2) return;
    const head = l.reduce((p, q) => (q.severity > p.severity || (q.severity === p.severity && q.first < p.first) ? q : p));
    l.forEach(a => { if (a !== head) { a.parent = head.id; head.children?.push(a.id); } });
  });
  return out;
}
