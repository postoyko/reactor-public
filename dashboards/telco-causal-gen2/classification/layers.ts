/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * The layer schemes the topology can be stratified by, and the registry that everything else reads layer facts from
 * (name, colour, glyph, 3D shape, plane position).
 *
 * Every layer has a globally unique numeric id, so a node's `layer` field stays a plain number and the existing lookups
 * (`activeLayers[n.layer]`, colour tables, swim lanes ...) keep working whichever scheme is active:
 *
 *      telco   1 - 4     5G Core / IP Transport / RAN Edge / Subscribers & Slices   (the original, default)
 *      osi     11 - 19   Abstraction, L7 Application ... L1 Physical, then Unclassified
 *      ops     21 - 26   Business User ... Physical Infrastructure, then Unclassified
 *
 * Ids within a scheme run from the top plane to the bottom plane, so sorting by id gives the stack order.
 */

export type LayerSchemeId = 'telco' | 'osi' | 'ops';
export type LayerShape = 'octa' | 'cyl' | 'cone' | 'icosa' | 'box' | 'dodeca' | 'tetra' | 'sphere' | 'prism';

export interface LayerDef {
  /** Globally unique id stored on nodes (`node.layer`). */
  id: number;
  scheme: LayerSchemeId;
  /** Position in the stack, 1 = top plane. */
  index: number;
  /** Short key from the source model: `L7`, `Business_User`, `core` ... */
  key: string;
  name: string;
  /** Used where space is tight (tier bands, legends). */
  short: string;
  /** CSS colour of the layer (planes, swim lanes, Sankey, strata colour mode). */
  color: string;
  glyph: string;
  shape: LayerShape;
  /** Ring radius for the constellation layout. */
  ring: number;
  /** The entity-type name given to nodes of this layer (shown in the node drawer). */
  entityType: string;
  /** One line for the legend: what lands here. */
  blurb: string;
}

export interface LayerScheme {
  id: LayerSchemeId;
  label: string;
  description: string;
  layers: LayerDef[];
  /** Layer that SPOF / blast analysis treats as the "core" the other resources must stay connected to. */
  anchor: number;
  /** Layer that resources land in when nothing matched. */
  fallback: number;
}

const def = (d: Omit<LayerDef, 'index' | 'scheme'> & { scheme: LayerSchemeId; index: number }): LayerDef => d;

// ── Telco: the original four strata ─────────────────────────────────────────

const TELCO_LAYERS: LayerDef[] = [
  def({ id: 1, scheme: 'telco', index: 1, key: 'core', name: '5G Core Network', short: '5G Core', color: '#6929c4', glyph: '⚡', shape: 'octa', ring: 55, entityType: '5gCoreFunction', blurb: 'UPF, AMF, SMF, core pods and services' }),
  def({ id: 2, scheme: 'telco', index: 2, key: 'transport', name: 'IP Transport Fabric', short: 'Transport', color: '#ba4e00', glyph: '⇄', shape: 'cyl', ring: 130, entityType: 'transportRouter', blurb: 'routers, switches, LAGs' }),
  def({ id: 3, scheme: 'telco', index: 3, key: 'ran', name: 'RAN Edge (eNodeB/gNodeB)', short: 'RAN Edge', color: '#198038', glyph: '▲', shape: 'cone', ring: 205, entityType: 'ranCellTower', blurb: 'gNodeB, eNodeB, cells, sites' }),
  def({ id: 4, scheme: 'telco', index: 4, key: 'other', name: 'Subscribers & Network Slices', short: 'Subscribers', color: '#0043ce', glyph: '●', shape: 'icosa', ring: 275, entityType: 'networkSlice', blurb: 'anything not matched above' })
];

// ── OSI: seven layers, application at the top ───────────────────────────────

const ring = (index: number, count: number) => Math.round(55 + ((index - 1) * 220) / Math.max(count - 1, 1));

const osi = (id: number, index: number, key: string, name: string, color: string, glyph: string, shape: LayerShape, blurb: string): LayerDef =>
  def({ id, scheme: 'osi', index, key, name: key === 'OTHER' || key === 'ABSTRACT' ? name : `${key} ${name}`, short: key === 'OTHER' || key === 'ABSTRACT' ? name : `${key} ${name}`, color, glyph, shape, ring: ring(index, 9), entityType: `osi${key}`, blurb });

const OSI_LAYERS: LayerDef[] = [
  osi(11, 1, 'ABSTRACT', 'Abstraction', '#491d8b', '◇', 'octa', 'organisations, people, tenants, tickets, locations'),
  osi(12, 2, 'L7', 'Application', '#8a3ffc', '◆', 'dodeca', 'applications, APIs, databases, DNS names, messaging'),
  osi(13, 3, 'L6', 'Presentation', '#d12771', '■', 'box', 'files, configuration, policies, logs, pipelines'),
  osi(14, 4, 'L5', 'Session', '#0072c3', '◉', 'sphere', 'VMs, pods, containers, clusters, services, operating systems'),
  osi(15, 5, 'L4', 'Transport', '#007d79', '⇅', 'prism', 'TCP / UDP, ports, connections'),
  osi(16, 6, 'L3', 'Network', '#ba4e00', '⇄', 'cyl', 'routers, firewalls, gateways, load balancers, VRFs, subnets, VPNs'),
  osi(17, 7, 'L2', 'Data Link', '#198038', '▲', 'cone', 'switches, VLANs, bridges, interfaces'),
  osi(18, 8, 'L1', 'Physical', '#8e6a00', '⚡', 'tetra', 'servers, power, cooling, cells, antennas, optical gear'),
  osi(19, 9, 'OTHER', 'Unclassified', '#8d8d8d', '●', 'icosa', 'not recognised')
];

// ── OPS: five operational layers, business at the top ───────────────────────

const ops = (id: number, index: number, key: string, name: string, color: string, glyph: string, shape: LayerShape, blurb: string): LayerDef =>
  def({ id, scheme: 'ops', index, key, name, short: name, color, glyph, shape, ring: ring(index, 6), entityType: `ops${key}`, blurb });

const OPS_LAYERS: LayerDef[] = [
  ops(21, 1, 'Business_User', 'Business User', '#1192e8', '◆', 'dodeca', 'tenants, subscriptions, customers, users'),
  ops(22, 2, 'Application_Services', 'Application Services', '#24a148', '■', 'box', 'applications, services, reports'),
  ops(23, 3, 'Platform_Runtime', 'Platform Runtime', '#f1c21b', '◉', 'sphere', 'pods, containers, VMs, databases, operating systems'),
  ops(24, 4, 'Network_Fabric', 'Network Fabric', '#ff832b', '⇄', 'cyl', 'routers, switches, VLANs, firewalls, subnets'),
  ops(25, 5, 'Physical_Infrastructure', 'Physical Infrastructure', '#da1e28', '⚡', 'octa', 'servers, power, cooling, cells, optical gear'),
  ops(26, 6, 'OTHER', 'Unclassified', '#8d8d8d', '●', 'icosa', 'conceptual, abstract or not recognised')
];

export const SCHEMES: Record<LayerSchemeId, LayerScheme> = {
  telco: {
    id: 'telco', label: 'Telco (4 strata)',
    description: '5G Core, IP Transport, RAN Edge, Subscribers & Slices. The original estimate from entity types, names and alert text.',
    layers: TELCO_LAYERS, anchor: 1, fallback: 4
  },
  osi: {
    id: 'osi', label: 'OSI (7 layers)',
    description: 'Abstraction, then Application down to Physical, from the entity type or from the canonical telco type recognised in the name or alert text.',
    layers: OSI_LAYERS, anchor: 16, fallback: 19
  },
  ops: {
    id: 'ops', label: 'OPS (5 layers)',
    description: 'Business User down to Physical Infrastructure, from the entity type or the canonical telco type recognised in the name or alert text.',
    layers: OPS_LAYERS, anchor: 24, fallback: 26
  }
};

export const SCHEME_IDS: LayerSchemeId[] = ['telco', 'osi', 'ops'];
export const DEFAULT_SCHEME: LayerSchemeId = 'telco';
export const isSchemeId = (v: unknown): v is LayerSchemeId => typeof v === 'string' && (SCHEME_IDS as string[]).includes(v);

/** Every layer of every scheme by id. */
export const LAYER_BY_ID: Record<number, LayerDef> = {};
SCHEME_IDS.forEach(s => SCHEMES[s].layers.forEach(l => { LAYER_BY_ID[l.id] = l; }));

/** Layer facts for an id, with a neutral fallback so an unknown id never throws. */
export function layerDef(id: number): LayerDef {
  return LAYER_BY_ID[id] || { id, scheme: 'telco', index: id, key: String(id), name: `Tier ${id}`, short: `Tier ${id}`, color: '#525252', glyph: '●', shape: 'icosa', ring: 275, entityType: 'unknown', blurb: '' };
}

export const schemeOf = (id: number): LayerScheme => SCHEMES[(LAYER_BY_ID[id]?.scheme) || DEFAULT_SCHEME];

/** `activeLayers` with every layer of every scheme switched on. */
export function allLayersOn(): Record<number, boolean> {
  const on: Record<number, boolean> = {};
  Object.keys(LAYER_BY_ID).forEach(k => { on[Number(k)] = true; });
  return on;
}

/** Height of a layer's plane. Telco keeps its original `(2.5 - layer) * spacing`; larger schemes are squeezed to a similar total height. */
export function layerZ(id: number, spacing: number): number {
  const d = LAYER_BY_ID[id];
  if (!d) return (2.5 - id) * spacing;
  const count = SCHEMES[d.scheme].layers.length;
  const step = spacing * (4 / Math.max(4, count));
  return ((count + 1) / 2 - d.index) * step;
}

/** The 3D plane colours of a scheme as numbers (three.js). */
export const layerColorHex = (id: number): number => parseInt(layerDef(id).color.replace('#', ''), 16);

/** The core-layer test for SPOF and blast analysis. */
export const isAnchorLayer = (id: number): boolean => schemeOf(id).anchor === id;

/** Telco names, kept for code and tests that read them by number. */
export const TELCO_LAYER_NAMES: Record<number, string> = Object.fromEntries(TELCO_LAYERS.map(l => [l.id, l.name]));
export const TELCO_LAYER_ENTITY: Record<number, string> = Object.fromEntries(TELCO_LAYERS.map(l => [l.id, l.entityType]));
