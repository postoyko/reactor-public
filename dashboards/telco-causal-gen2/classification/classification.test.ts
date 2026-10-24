/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertItem, buildGraph, resourcesWithoutTypes } from '../logic';
import { CANONICAL_TYPES, LAYER_BY_ID, LAYER_OVERRIDES, SCHEMES, SCHEME_IDS, allLayersOn, classifyLayer, classifyResource, isAnchorLayer, layerZ, relaxBoundaries, resetClassificationCache } from './index';
import { ENTITY_TYPES, OPS_LAYER_OF, OSI_LAYER_OF } from './entity-layers';
import { PATTERN_ROWS } from './seed';

const keyOf = (scheme: 'osi' | 'ops', layer: number) => LAYER_BY_ID[layer].key;
const osi = (name: string, entityTypes: string[] = [], summary = '') => classifyResource('osi', { name, entityTypes, summary });
const ops = (name: string, entityTypes: string[] = [], summary = '') => classifyResource('ops', { name, entityTypes, summary });

describe('layer registry', () => {
  it('gives every layer a globally unique id and keeps ids ordered top to bottom within a scheme', () => {
    const ids = SCHEME_IDS.flatMap(s => SCHEMES[s].layers.map(l => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    SCHEME_IDS.forEach(s => {
      const ls = SCHEMES[s].layers;
      expect(ls.map(l => l.id)).toEqual([...ls.map(l => l.id)].sort((a, b) => a - b));
      expect(ls.map(l => l.index)).toEqual(ls.map((_, i) => i + 1));
      expect(LAYER_BY_ID[SCHEMES[s].anchor].scheme).toBe(s);
      expect(LAYER_BY_ID[SCHEMES[s].fallback].scheme).toBe(s);
    });
  });
  it('has 4, 9 and 6 layers for telco, OSI (abstraction, L7..L1, unclassified) and OPS (5 layers, unclassified)', () => {
    expect(SCHEMES.telco.layers).toHaveLength(4);
    expect(SCHEMES.osi.layers.map(l => l.key)).toEqual(['ABSTRACT', 'L7', 'L6', 'L5', 'L4', 'L3', 'L2', 'L1', 'OTHER']);
    expect(SCHEMES.ops.layers.map(l => l.key)).toEqual(['Business_User', 'Application_Services', 'Platform_Runtime', 'Network_Fabric', 'Physical_Infrastructure', 'OTHER']);
    expect(Object.keys(allLayersOn())).toHaveLength(19);
  });
  it('anchors OSI on L3 and OPS on the network fabric', () => {
    expect(LAYER_BY_ID[SCHEMES.osi.anchor].key).toBe('L3');
    expect(LAYER_BY_ID[SCHEMES.ops.anchor].key).toBe('Network_Fabric');
    expect(isAnchorLayer(SCHEMES.osi.layers[0].id)).toBe(false);
  });
  it('keeps the telco plane heights exactly as before and fits larger schemes in the same height', () => {
    [1, 2, 3, 4].forEach(l => expect(layerZ(l, 100)).toBe((2.5 - l) * 100));
    const ls = SCHEMES.osi.layers;
    const span = layerZ(ls[0].id, 100) - layerZ(ls[ls.length - 1].id, 100);
    expect(span).toBeLessThanOrEqual(400);
    expect(span).toBeGreaterThan(300);
  });
});

describe('telco scheme', () => {
  it('delegates to the original classifier', () => {
    const input = { name: 'amf-core-1', entityTypes: [] as string[] };
    expect(classifyResource('telco', input).layer).toBe(classifyLayer(input).layer);
  });
});

describe('unified entity-layer mappings', () => {
  it('maps every entity type to one OSI and one OPS layer, except the unmapped marker', () => {
    const missing = ENTITY_TYPES.filter(t => !OSI_LAYER_OF[t] || !OPS_LAYER_OF[t]);
    expect(missing).toEqual(['MissingFromTopology']);
    expect(ENTITY_TYPES.length).toBeGreaterThanOrEqual(218);
  });
  it('places each entity type on the layer the mappings give it', () => {
    ENTITY_TYPES.filter(t => OSI_LAYER_OF[t]).forEach(t => {
      expect([t, keyOf('osi', osi('x', [t]).layer)]).toEqual([t, OSI_LAYER_OF[t]]);
      expect([t, keyOf('ops', ops('x', [t]).layer)]).toEqual([t, OPS_LAYER_OF[t]]);
    });
  });
  it('leaves the unmapped marker and unknown types unclassified', () => {
    expect(osi('x', ['MissingFromTopology'])).toMatchObject({ layer: SCHEMES.osi.fallback });
    expect(ops('x', ['somethingNew'])).toMatchObject({ layer: SCHEMES.ops.fallback });
  });
  it('reaches every layer of both schemes', () => {
    const osiHit = new Set(ENTITY_TYPES.filter(t => OSI_LAYER_OF[t]).map(t => osi('x', [t]).layer));
    const opsHit = new Set(ENTITY_TYPES.filter(t => OPS_LAYER_OF[t]).map(t => ops('x', [t]).layer));
    SCHEMES.osi.layers.filter(l => l.key !== 'OTHER').forEach(l => expect(osiHit.has(l.id)).toBe(true));
    SCHEMES.ops.layers.filter(l => l.key !== 'OTHER').forEach(l => expect(opsHit.has(l.id)).toBe(true));
  });
});

describe('OSI scheme', () => {
  it('uses the entity type first, matching case-insensitively and by camelCase word', () => {
    expect(keyOf('osi', osi('x', ['router']).layer)).toBe('L3');
    expect(keyOf('osi', osi('x', ['CellTower']).layer)).toBe('L1');
    expect(keyOf('osi', osi('x', ['kubernetesPod']).layer)).toBe('L5');
    expect(osi('x', ['switch']).basis).toBe('type');
  });
  it('recognises a canonical type in a resource name, including a digit glued to the word', () => {
    const r = osi('LONDON01OLT1');
    expect(r).toMatchObject({ basis: 'name', canonical: 'OLT' });
    expect(keyOf('osi', r.layer)).not.toBe('OTHER');
  });
  it('lets the type win over a conflicting name', () => {
    expect(osi('core-router-switch', ['firewall']).basis).toBe('type');
    expect(keyOf('osi', osi('core-router-switch', ['firewall']).layer)).toBe('L3');
  });
  it('falls back to the scheme default when nothing matches', () => {
    expect(osi('zzz-qqq')).toMatchObject({ layer: SCHEMES.osi.fallback, basis: 'default' });
  });
  it('does not take common words in alert text for entity types', () => {
    expect(osi('zzz-qqq', [], 'Error written to the log, task failed on node').basis).toBe('default');
  });
});

describe('wording hints', () => {
  it('place resources with code names from what their alerts say', () => {
    expect(keyOf('osi', osi('RING_1080', [], 'Loss of signal on STM-1 port').layer)).toBe('L1');
    expect(keyOf('osi', osi('xq9', [], 'Link down on port 1/1/3').layer)).toBe('L2');
    expect(keyOf('osi', osi('loyalty', [], 'GET /loyalty - Erroneous call rate is too high').layer)).toBe('L7');
    expect(keyOf('ops', ops('canary', [], 'Pod is not ready').layer)).toBe('Platform_Runtime');
    expect(osi('xq9', [], 'Link down').basis).toBe('text');
  });
  it('do not apply to the resource name alone', () => {
    expect(osi('link-port-1').basis).toBe('default');
  });
});

describe('OPS scheme', () => {
  it('follows the OPS sets of the mappings, which differ from the OSI layer', () => {
    expect(keyOf('ops', ops('x', ['tenant']).layer)).toBe('Business_User');
    expect(keyOf('ops', ops('x', ['service']).layer)).toBe('Platform_Runtime');
    expect(keyOf('ops', ops('x', ['fqdn']).layer)).toBe('Platform_Runtime');
    expect(keyOf('ops', ops('x', ['tcpudpport']).layer)).toBe('Network_Fabric');
    expect(keyOf('ops', ops('x', ['database']).layer)).toBe('Application_Services');
    expect(keyOf('ops', ops('x', ['cell']).layer)).toBe('Physical_Infrastructure');
  });
  it('defaults to Unclassified', () => {
    expect(ops('zzz-qqq')).toMatchObject({ layer: SCHEMES.ops.fallback, basis: 'default' });
  });
});

describe('overrides', () => {
  it('apply before the mappings and can be removed again', () => {
    LAYER_OVERRIDES.osi.router = 'L7';
    resetClassificationCache();
    try {
      expect(keyOf('osi', osi('x', ['router']).layer)).toBe('L7');
    } finally {
      delete LAYER_OVERRIDES.osi.router;
      resetClassificationCache();
    }
    expect(keyOf('osi', osi('x', ['router', 'y']).layer)).toBe('L3');
  });
});

describe('seed patterns', () => {
  it('has the canonical types and every pattern compiles after boundary relaxation', () => {
    expect(CANONICAL_TYPES.length).toBeGreaterThan(150);
    expect(PATTERN_ROWS.length).toBeGreaterThan(300);
    PATTERN_ROWS.forEach(([source]) => expect(() => new RegExp(relaxBoundaries(source), 'i')).not.toThrow());
  });
  it('relaxBoundaries lets a word touch digits but not letters', () => {
    const re = new RegExp(relaxBoundaries('\\b(olt)\\b'), 'i');
    expect(re.test('LONDON01OLT1')).toBe(true);
    expect(re.test('bolter')).toBe(false);
  });
});

describe('live entity types in the graph', () => {
  const alert = (id: string, resource: string, extra: Partial<AlertItem> = {}): AlertItem => ({
    id, summary: 'Alarm raised', severity: 5, state: 'open', firstOccurrenceTime: '2026-01-01T00:00:00Z', lastOccurrenceTime: '2026-01-01T00:01:00Z',
    resource: { name: resource }, sender: { name: 'Netcool' }, ...extra
  });
  const build = (alerts: AlertItem[], layerScheme: 'telco' | 'osi' | 'ops', liveEntityTypes?: Record<string, string[]>) =>
    buildGraph(alerts, [], { layoutMode: 'stratified', layerSpacing: 100, topologyLinks: [], illustrativeLinks: false, layerScheme, liveEntityTypes });

  it('places an untyped resource from the live topology type', () => {
    const alerts = [alert('1', 'opaque-host-7')];
    const without = build(alerts, 'osi').nodes[0];
    expect(without).toMatchObject({ layerBasis: 'default', typeSource: 'none' });
    const withLive = build(alerts, 'osi', { 'opaque-host-7': ['router'] }).nodes[0];
    expect(withLive).toMatchObject({ layerBasis: 'type', typeSource: 'topology' });
    expect(LAYER_BY_ID[withLive.layer].key).toBe('L3');
    expect(LAYER_BY_ID[build(alerts, 'ops', { 'opaque-host-7': ['router'] }).nodes[0].layer].key).toBe('Network_Fabric');
  });
  it('prefers the entity types carried by the alert and uses every alert of the resource', () => {
    const typed = alert('2', 'r1', { resource: { name: 'r1', entityType: 'switch' } });
    const n = build([alert('1', 'r1'), typed], 'osi', { r1: ['router'] }).nodes[0];
    expect(n.typeSource).toBe('insight');
    expect(LAYER_BY_ID[n.layer].key).toBe('L2');
  });
  it('leaves the telco scheme as it was', () => {
    const alerts = [alert('1', 'opaque-host-7')];
    expect(build(alerts, 'telco', { 'opaque-host-7': ['router'] }).nodes[0].layer).toBe(build(alerts, 'telco').nodes[0].layer);
  });
  it('lists the resources that need a live lookup', () => {
    const list = resourcesWithoutTypes([alert('1', 'a'), alert('2', 'b', { resource: { name: 'b', entityType: 'router' } })]);
    expect(list.map(r => r.key)).toEqual(['a']);
  });
});
