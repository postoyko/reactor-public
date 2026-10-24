/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import mockAlerts from '../../mocks/alerts.json';
import mockIncidents from '../../mocks/incidents.json';
import {
  adaptAlerts,
  adaptIncidents,
  adaptMetricManagerData,
  adaptRunbooksAndPolicy,
  adaptStoryAlertsInsights,
  adaptTopologyResource,
  analyzeProbes,
  AlertItem,
  buildGraph,
  alertSpan,
  buildAdjacency,
  buildLinkFlow,
  buildTriageInsights,
  normalizeSummary,
  linkedNodes,
  buildIncidentSubgraph,
  buildSwimlanes,
  buildTierHierarchy,
  CARD_2D,
  classifyLayer,
  hopDistances,
  nodeFirstSeen,
  NO_GROUP_LABEL,
  nodesInWindow,
  nodesSeenBy,
  replayDomain,
  cleanResourceName,
  computeBetweenness,
  computeCircular2DLayout,
  computeHierarchical2DLayout,
  computePodContainment2DLayout,
  computeSpofAnalysis,
  findShortestPath,
  IncidentItem,
  Link3DGen2,
  Node3DGen2,
  probableCauseRanks
} from './logic';

const alert = (id: string, resource: string | undefined, probe: string, tOffsetSec: number, extra: Partial<AlertItem> = {}): AlertItem => ({
  id,
  summary: 'something happened',
  severity: 4,
  state: 'open',
  firstOccurrenceTime: new Date(Date.UTC(2026, 0, 1, 0, 0, tOffsetSec)).toISOString(),
  lastOccurrenceTime: new Date(Date.UTC(2026, 0, 1, 0, 0, tOffsetSec)).toISOString(),
  sender: { name: probe },
  resource: { name: resource },
  ...extra
});

const mkNode = (id: string, layer: number): Node3DGen2 => ({
  id, name: id, entityType: '', entityTypes: [], topologyGroups: [], layer, layerName: `L${layer}`, severity: 1,
  isProbableCause: false, alertCount: 1, alerts: [], runbooks: [], degree: 0, betweenness: null,
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0
});
const mkLink = (source: Node3DGen2, target: Node3DGen2, latencyMs?: number): Link3DGen2 => (
  { source, target, kind: 'physical', isCausal: false, relType: 'connectedTo', value: 1, latencyMs }
);

describe('adapters (real toolkit mock shapes)', () => {
  it('converts the getAlerts mock without losing rows or insights', () => {
    const { alerts, hasEventCounts, skipped } = adaptAlerts(mockAlerts.data);
    expect(alerts).toHaveLength(mockAlerts.data.tenant.alerts.rows.length);
    expect(skipped).toBe(0);
    expect(hasEventCounts).toBe(false);
    expect(typeof alerts[0].severity).toBe('number');
    expect(alerts[0].sender?.name).toBe('generated-1');
    expect(alerts.some(a => (a.insights || []).some(i => i.type?.includes('insight-type/runbook')))).toBe(true);
    expect(alerts.some(a => (a.insights || []).some(i => i.type?.includes('topology/group')))).toBe(true);
  });

  it('survives empty, malformed and id-less input', () => {
    expect(adaptAlerts(undefined).alerts).toEqual([]);
    expect(adaptAlerts({ tenant: { alerts: { columns: [{ name: 'id' }], rows: [{ fields: [null] }, { fields: ['a1'] }, null] } } }).alerts.map(a => a.id)).toEqual(['a1']);
    const bad = adaptAlerts({ tenant: { alerts: { columns: [{ name: 'id' }, { name: '@insights.type=\'x\'' }], rows: [{ fields: ['a1', '{not json'] }] } } });
    expect(bad.alerts[0].insights).toEqual([]);
  });

  it('converts the getStories mock and tolerates missing titles', () => {
    const incidents = adaptIncidents(mockIncidents.data);
    expect(incidents).toHaveLength(mockIncidents.data.tenant.stories.length);
    expect(incidents[0].alertIds.length).toBeGreaterThan(0);
    expect(adaptIncidents({ tenant: { stories: [{ id: 'x', priority: '2' }] } })[0]).toMatchObject({ id: 'x', title: 'Untitled incident', priority: 2, alertIds: [] });
    expect(adaptIncidents(null)).toEqual([]);
  });

  it('converts getTopologyResource response safely', () => {
    const topo = adaptTopologyResource({
      tenant: {
        resource: {
          id: 'res-1',
          uniqueId: 'asm-res-1',
          name: '5G-UPF-01',
          entityTypes: ['networkElement', 'upf'],
          matchTokens: ['5G-UPF-01', '10.240.10.1'],
          properties: { ipAddress: '10.240.10.1', macAddress: '00:1A:2B:3C:4D:5E' }
        }
      }
    });
    expect(topo).not.toBeNull();
    expect(topo?.name).toBe('5G-UPF-01');
    expect(topo?.entityTypes).toEqual(['networkElement', 'upf']);
    expect(topo?.properties.ipAddress).toBe('10.240.10.1');

    expect(adaptTopologyResource(null)).toBeNull();
    expect(adaptTopologyResource({})).toBeNull();
    // an arbitrary object or an error payload must not pass for a resource
    expect(adaptTopologyResource({ id: 'x', name: 'looks like a resource' })).toBeNull();
    expect(adaptTopologyResource({ errors: [{ message: 'boom' }], tenant: { resource: { id: 'a' } } })).toBeNull();
  });

  it('converts getMetricManagerData response safely', () => {
    const series = adaptMetricManagerData({
      tenant: {
        metricData: [
          {
            metric: 'latencyMs',
            unit: 'ms',
            points: [{ timestamp: 1000, value: 12.5 }, { timestamp: 2000, value: 14.1 }]
          }
        ]
      }
    });
    expect(series).toHaveLength(1);
    expect(series[0].metricName).toBe('latencyMs');
    expect(series[0].currentValue).toBe(14.1);
    expect(series[0].points).toHaveLength(2);

    expect(adaptMetricManagerData(null)).toEqual([]);
  });

  it('converts getRunbooksAndPolicy response safely', () => {
    const res = adaptRunbooksAndPolicy({
      tenant: {
        policies: [
          { id: 'pol-1', name: 'BGP Drain Policy', runbookIds: ['rb-1'], isAutomated: true }
        ],
        runbooks: [
          { id: 'rb-1', name: 'Drain UPF BGP Sessions', description: 'Executes bgp session teardown' }
        ]
      }
    });
    expect(res).toHaveLength(1);
    expect(res[0].policyName).toBe('BGP Drain Policy');
    expect(res[0].runbookName).toBe('Drain UPF BGP Sessions');
    expect(res[0].isAutomated).toBe(true);

    expect(adaptRunbooksAndPolicy(null)).toEqual([]);
  });

  it('converts getStoryAlertsInsights response safely', () => {
    const insights = adaptStoryAlertsInsights({
      tenant: {
        storyAlertsInsights: [
          {
            type: 'aiops.ibm.com/insight-type/relationship/probable-cause',
            details: { id: 'alert-1', score: 0.94 }
          }
        ]
      }
    }, 'story-123');
    expect(insights).not.toBeNull();
    expect(insights?.probableCauseAlertId).toBe('alert-1');
    expect(insights?.confidencePercent).toBe(94);

    expect(adaptStoryAlertsInsights(null)).toBeNull();
  });

  it('never turns a probable-cause rank into a confidence', () => {
    const mk = (details: any) => adaptStoryAlertsInsights({
      tenant: { storyAlertsInsights: [{ type: 'aiops.ibm.com/insight-type/probable-cause', details }] }
    }, 's');
    // the real toolkit shape has id/rank/time and no score
    const real = mk({ id: 'alert-1', rank: 1, time: 1700000000 });
    expect(real?.probableCauseAlertId).toBe('alert-1');
    expect(real?.confidencePercent).toBeUndefined();
    expect(real?.probableCauseScore).toBeUndefined();
    // a 0-1 fraction becomes a percentage; other scales are kept raw and not shown as a percentage
    expect(mk({ id: 'a', score: 0.5 })?.confidencePercent).toBe(50);
    expect(mk({ id: 'a', score: 87 })?.confidencePercent).toBeUndefined();
    expect(mk({ id: 'a', score: 87 })?.probableCauseScore).toBe(87);
    expect(mk({ id: 'a', score: null })?.probableCauseScore).toBeUndefined();
  });
});

describe('cleanResourceName', () => {
  it('strips path and suffix and rejects blanks', () => {
    expect(cleanResourceName('host/part:::suffix')).toBe('part');
    expect(cleanResourceName('plain')).toBe('plain');
    expect(cleanResourceName('  ')).toBeNull();
    expect(cleanResourceName(undefined)).toBeNull();
    expect(cleanResourceName(42)).toBeNull();
  });
});

describe('classifyLayer', () => {
  it('does not match keywords inside other words', () => {
    // These were mis-classified by substring matching: "interface" contains "ace", "critical" contains "cr".
    expect(classifyLayer({ name: 'edge-router-7', summary: 'Interface down' }).layer).toBe(2);
    expect(classifyLayer({ name: 'tower-17', summary: 'Backhaul interface flapping' }).layer).toBe(3);
    expect(classifyLayer({ name: 'enb-9001', summary: 'Critical alarm: link degraded' }).layer).toBe(3);
    expect(classifyLayer({ name: 'host-9', summary: 'Interface down, critical' })).toMatchObject({ layer: 4, basis: 'default' });
  });

  it('matches real tokens, including trailing digits', () => {
    expect(classifyLayer({ name: 'upf-01' }).layer).toBe(1);
    expect(classifyLayer({ name: 'gnb12' }).layer).toBe(3);
    expect(classifyLayer({ name: 'agg-lag-11' }).layer).toBe(2);
  });

  it('lets topology entity types win over names', () => {
    expect(classifyLayer({ name: 'tower-1', entityTypes: ['wasApplication'] })).toMatchObject({ layer: 1, basis: 'type' });
  });
});

describe('buildGraph', () => {
  const alerts = [
    alert('a1', 'upf-01', 'p1', 0), alert('a2', 'edge-router-7', 'p2', 10), alert('a3', 'gnb-site-14', 'p1', 20),
    alert('a4', undefined, 'p1', 30), alert('a5', 'upf-01', 'p3', 40)
  ];
  const opts = { layoutMode: 'stratified' as const, layerSpacing: 100 };

  it('invents nothing: no resource-less node and no links without data', () => {
    const g = buildGraph(alerts, [], opts);
    expect(g.nodes.map(n => n.id).sort()).toEqual(['edge-router-7', 'gnb-site-14', 'upf-01']);
    expect(g.skippedAlerts).toBe(1);
    expect(g.links).toHaveLength(0);
    expect(g.topologyLinkCount).toBe(0);
    expect(g.nodes.every(n => n.betweenness === null)).toBe(true);
    expect(g.nodes.find(n => n.id === 'upf-01')!.alertCount).toBe(2);
  });

  it('builds causal links from the incident probable cause and physical links from the host', () => {
    const incidents: IncidentItem[] = [{
      id: 'i1', title: 't', priority: 1, state: 'inProgress', team: 'x', alertIds: ['a1', 'a2', 'a3'],
      insights: [{ type: 'aiops.ibm.com/insight-type/probable-cause', details: { id: 'a1', rank: 1 } }]
    }];
    const g = buildGraph(alerts, incidents, { ...opts, topologyLinks: [{ source: 'upf-01', target: 'edge-router-7', latencyMs: 3 }, { source: 'nope', target: 'upf-01' }] });
    expect(g.nodes.find(n => n.id === 'upf-01')!.isProbableCause).toBe(true);
    expect(g.links.filter(l => l.kind === 'causal')).toHaveLength(2);
    const physical = g.links.filter(l => l.kind === 'physical');
    expect(physical).toHaveLength(1);
    expect(physical[0].latencyMs).toBe(3);
    expect(g.topologyLinkCount).toBe(1);
    expect(g.nodes.find(n => n.id === 'upf-01')!.betweenness).not.toBeNull();
  });

  it('only creates illustrative links when asked, and tags them', () => {
    const g = buildGraph(alerts, [], { ...opts, illustrativeLinks: true });
    expect(g.links.length).toBeGreaterThan(0);
    expect(g.links.every(l => l.kind === 'illustrative' && l.latencyMs === undefined)).toBe(true);
  });

  it('is deterministic and keeps cached positions across rebuilds', () => {
    const first = buildGraph(alerts, [], opts);
    const again = buildGraph(alerts, [], opts);
    expect(again.nodes.map(n => [n.x, n.y, n.z])).toEqual(first.nodes.map(n => [n.x, n.y, n.z]));
    const cache = new Map(first.nodes.map(n => [n.id, { x: n.x + 5, y: n.y + 6, z: n.z + 7 }]));
    const restored = buildGraph(alerts, [], { ...opts, positionCache: cache });
    expect(restored.restoredPositions).toBe(first.nodes.length);
    expect(restored.nodes[0].x).toBe(first.nodes[0].x + 5);
  });

  it('survives malformed alert fields', () => {
    const weird = [{ id: 'z', summary: undefined as unknown as string, severity: NaN, state: '', firstOccurrenceTime: '', lastOccurrenceTime: '', resource: { name: 12 as unknown as string } }];
    expect(() => buildGraph(weird as AlertItem[], [], opts)).not.toThrow();
  });
});

describe('probableCauseRanks', () => {
  it('takes the lowest rank from incident and alert insights', () => {
    const incidents: IncidentItem[] = [{ id: 'i', title: 't', priority: 1, state: '', team: '', alertIds: [], insights: [
      { type: 'x/probable-cause', details: { id: 'a', rank: 2 } }, { type: 'x/probable-cause', details: { id: 'a', rank: 1 } }] }];
    expect(probableCauseRanks([], incidents).get('a')).toBe(1);
  });
});

describe('graph algorithms', () => {
  it('betweenness is highest for the middle of a chain', () => {
    const [a, b, c] = [mkNode('a', 1), mkNode('b', 2), mkNode('c', 3)];
    const scores = computeBetweenness([a, b, c], [mkLink(a, b), mkLink(b, c)]);
    expect(scores.get('b')).toBe(100);
    expect(scores.get('a')).toBe(0);
  });

  it('shortest path follows measured latency, not hop count', () => {
    const [a, b, c] = [mkNode('A', 1), mkNode('B', 2), mkNode('C', 2)];
    const path = findShortestPath('A', 'C', [a, b, c], [mkLink(a, c, 50), mkLink(a, b, 1), mkLink(b, c, 1)])!;
    expect(path.nodes.map(n => n.id)).toEqual(['A', 'B', 'C']);
    expect(path.hops).toBe(2);
    expect(path.latencyMs).toBe(2);
  });

  it('reports no latency when links are unmeasured, avoids a node, and returns null when unreachable', () => {
    const [a, b, c] = [mkNode('A', 1), mkNode('B', 2), mkNode('C', 3)];
    const links = [mkLink(a, b), mkLink(b, c)];
    expect(findShortestPath('A', 'C', [a, b, c], links)!.latencyMs).toBeNull();
    expect(findShortestPath('A', 'C', [a, b, c], links, 'B')).toBeNull();
    expect(findShortestPath('A', 'A', [a, b, c], links)).toBeNull();
  });

  it('finds cut vertices and only counts nodes that were connected to the core', () => {
    const [core, transport, ran, orphan] = [mkNode('core', 1), mkNode('transport', 2), mkNode('ran', 3), mkNode('orphan', 4)];
    const r = computeSpofAnalysis([core, transport, ran, orphan], [mkLink(core, transport), mkLink(transport, ran)]);
    expect(Array.from(r.spofNodeIds)).toEqual(['transport']);
    expect(r.spofMap.get('transport')!.blastPartitionIds).toEqual(['ran']);
    expect(r.spofMap.get('transport')!.severedSubscribers).toBeNull();
    expect(r.blastAvailable).toBe(true);
  });

  it('sums subscribers only when an inventory is supplied', () => {
    const [core, transport, ran] = [mkNode('core', 1), mkNode('transport', 2), mkNode('ran', 3)];
    const r = computeSpofAnalysis([core, transport, ran], [mkLink(core, transport), mkLink(transport, ran)], { transport: 100, ran: 25 });
    expect(r.spofMap.get('transport')!.severedSubscribers).toBe(125);
  });

  it('has no cut vertices in a triangle, and no blast islands without links or without a core', () => {
    const [c, t, u] = [mkNode('c', 1), mkNode('t', 2), mkNode('u', 2)];
    expect(computeSpofAnalysis([c, t, u], [mkLink(c, t), mkLink(t, u), mkLink(u, c)]).spofNodes).toHaveLength(0);
    expect(computeSpofAnalysis([c, t], []).blastAvailable).toBe(false);
    const [x, y, z] = [mkNode('x', 2), mkNode('y', 2), mkNode('z', 3)];
    const noCore = computeSpofAnalysis([x, y, z], [mkLink(x, y), mkLink(y, z)]);
    expect(noCore.blastAvailable).toBe(false);
    expect(noCore.spofMap.get('y')!.blastNodeCount).toBe(0);
    expect(Array.from(noCore.spofNodeIds)).toEqual(['y']);
  });
});

describe('analyzeProbes', () => {
  it('measures lead times and never invents values', () => {
    const alerts = [
      alert('1', 'X', 'A', 0), alert('2', 'X', 'B', 120),
      alert('3', 'Y', 'A', 0), alert('4', 'Y', 'B', 60), alert('5', 'Y', 'C', 300),
      alert('6', 'Z', 'D', 0)
    ];
    const r = analyzeProbes(alerts, []);
    expect(r.probes).toEqual(['A', 'B', 'C', 'D']);
    expect(r.pairwiseMap.get('A')!.get('B')).toMatchObject({ coOccurCount: 2, avgLeadSec: 90, leadPercentA: 100 });
    expect(r.pairwiseMap.get('B')!.get('A')).toMatchObject({ avgLeadSec: -90, leadPercentA: 0 });
    expect(r.pairwiseMap.get('D')!.get('A')).toBeUndefined();
    expect(r.totalCrossCorrelations).toBe(2);
    const a = r.horizonSequence.find(h => h.probe === 'A')!;
    expect(a).toMatchObject({ samples: 2, firstSharePercent: 100, rank: 1 });
    expect(a.avgLeadSec).toBeGreaterThan(0);
    expect(r.horizonSequence.find(h => h.probe === 'D')).toMatchObject({ samples: 0, avgLeadSec: null, firstSharePercent: null });
    expect(r.fastestProbe).toBe('A');
    expect(r.maxEarlyLeadMin).toBeGreaterThan(0);
  });

  it('reports nothing (not 12 or +8.2m) when there is no data', () => {
    const r = analyzeProbes([], []);
    expect(r).toMatchObject({ probes: [], totalCrossCorrelations: 0, maxEarlyLeadMin: null, fastestProbe: null });
    const single = analyzeProbes([alert('1', 'X', 'A', 0), alert('2', 'Y', 'B', 5)], []);
    expect(single.totalCrossCorrelations).toBe(0);
    expect(single.maxEarlyLeadMin).toBeNull();
  });

  it('groups by incident as well as by resource', () => {
    const incidents: IncidentItem[] = [{ id: 'i', title: 't', priority: 1, state: '', team: '', alertIds: ['1', '2'] }];
    const r = analyzeProbes([alert('1', 'X', 'A', 0), alert('2', 'Y', 'B', 30)], incidents);
    expect(r.totalCrossCorrelations).toBe(1);
    expect(r.pairwiseMap.get('A')!.get('B')!.avgLeadSec).toBe(30);
  });
});

describe('2D layouts', () => {
  const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) => (
    Math.abs(a.x - b.x) < CARD_2D.width && Math.abs(a.y - b.y) < CARD_2D.height
  );
  const expectNoOverlap = (pts: Array<{ x: number; y: number }>) => {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(overlap(pts[i], pts[j])).toBe(false);
  };

  // 3 core, 6 transport, 40 RAN, 5 other; transport hangs off core, RAN off transport
  const nodes: Node3DGen2[] = [];
  ([['c', 1, 3], ['t', 2, 6], ['r', 3, 40], ['o', 4, 5]] as Array<[string, number, number]>).forEach(([p, layer, n]) => {
    for (let i = 0; i < n; i++) nodes.push(mkNode(`${p}${i}`, layer));
  });
  const get = (id: string) => nodes.find(n => n.id === id)!;
  const links: Link3DGen2[] = [];
  for (let i = 0; i < 6; i++) links.push(mkLink(get(`t${i}`), get(`c${i % 3}`)));
  for (let i = 0; i < 40; i++) links.push(mkLink(get(`r${i}`), get(`t${i % 6}`)));

  it('hierarchical: tiers run top to bottom, wrap to the width, never overlap and are deterministic', () => {
    const r = computeHierarchical2DLayout(nodes, links, 1000);
    expect(r.nodes).toHaveLength(nodes.length);
    expectNoOverlap(r.nodes);
    const meanY = (p: string) => {
      const ys = r.nodes.filter(n => n.id.startsWith(p)).map(n => n.y);
      return ys.reduce((s, y) => s + y, 0) / ys.length;
    };
    expect(meanY('c')).toBeLessThan(meanY('t'));
    expect(meanY('t')).toBeLessThan(meanY('r'));
    expect(meanY('r')).toBeLessThan(meanY('o'));
    const perRow = new Map<number, number>();
    r.nodes.filter(n => n.id.startsWith('r')).forEach(n => perRow.set(n.y, (perRow.get(n.y) || 0) + 1));
    expect(Math.max(...Array.from(perRow.values()))).toBeLessThanOrEqual(Math.floor((1000 - 80) / 176));
    expect(computeHierarchical2DLayout(nodes, links, 1000)).toEqual(r);
    expect(computeHierarchical2DLayout([], [], 800).nodes).toEqual([]);
  });

  it('circular: ranks are hop distances, ring radii match, unlinked nodes get their own labelled ring', () => {
    const r = computeCircular2DLayout(nodes, links, 1000, 700, 't0');
    expect(r.nodes).toHaveLength(nodes.length);
    expectNoOverlap(r.nodes);
    expect(r.center).toEqual({ x: 500, y: 350 });
    expect(r.nodes.filter(n => n.rank === 0).map(n => n.id)).toEqual(['t0']);
    const ring1 = r.nodes.filter(n => n.rank === 1).map(n => n.id);
    expect(ring1).toEqual(expect.arrayContaining(['c0', 'r0']));
    r.nodes.filter(n => n.rank).forEach(n => {
      const ring = r.rings!.find(x => x.rank === n.rank)!;
      expect(Math.hypot(n.x - 500, n.y - 350)).toBeCloseTo(ring.radius, 6);
    });
    expect(r.rings!.some(x => x.label === 'Not linked to centre')).toBe(true);

    const none = computeCircular2DLayout(nodes, [], 800, 600);
    expect(none.rings).toHaveLength(1);
    expect(none.rings![0].label).toBe('Not linked to centre');
    expectNoOverlap(none.nodes);
    expect(computeCircular2DLayout([mkNode('solo', 1)], [], 800, 600).nodes).toHaveLength(1);
  });

  it('containment: every node sits inside exactly one box, below its header, and boxes do not overlap', () => {
    const grouped = nodes.map((n, i) => (i % 3 === 0 ? { ...n, topologyGroups: ['pod-a'] } : i % 3 === 1 ? { ...n, topologyGroups: ['pod-b'] } : n));
    const r = computePodContainment2DLayout(grouped, [], 1000);
    expect(r.nodes).toHaveLength(grouped.length);
    expectNoOverlap(r.nodes);
    const seen = new Set<string>();
    r.clusters!.forEach(c => c.nodeIds.forEach(id => { expect(seen.has(id)).toBe(false); seen.add(id); }));
    expect(seen.size).toBe(grouped.length);
    r.nodes.forEach(n => {
      const c = r.clusters!.find(k => k.id === n.clusterId)!;
      expect(n.x - CARD_2D.width / 2).toBeGreaterThanOrEqual(c.x);
      expect(n.x + CARD_2D.width / 2).toBeLessThanOrEqual(c.x + c.width);
      expect(n.y - CARD_2D.height / 2).toBeGreaterThanOrEqual(c.y + 30);
      expect(n.y + CARD_2D.height / 2).toBeLessThanOrEqual(c.y + c.height);
    });
    const cs = r.clusters!;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const separate = cs[i].x + cs[i].width <= cs[j].x || cs[j].x + cs[j].width <= cs[i].x
          || cs[i].y + cs[i].height <= cs[j].y || cs[j].y + cs[j].height <= cs[i].y;
        expect(separate).toBe(true);
      }
    }
    // without topology groups it falls back to the estimated tier, and says so
    expect(computePodContainment2DLayout(nodes, [], 1000).clusters!.every(c => c.name.endsWith('(est.)'))).toBe(true);
    expect(computePodContainment2DLayout([], [], 800)).toEqual({ nodes: [], clusters: [] });
  });
});

describe('insight-view data', () => {
  // three resources, alerts at known times: X (probe A at 0s, B at 120s), Y (probe B at 60s..90s), Z (probe C at 300s)
  const alerts = [
    alert('1', 'X', 'A', 0, { severity: 6 }),
    alert('2', 'X', 'B', 120, { severity: 3 }),
    alert('3', 'Y', 'B', 60, { severity: 4, lastOccurrenceTime: new Date(Date.UTC(2026, 0, 1, 0, 0, 90)).toISOString() }),
    alert('4', 'Z', 'C', 300, { severity: 2 }),
    alert('5', undefined, 'C', 10)
  ];
  const g = buildGraph(alerts, [], { layoutMode: 'stratified', layerSpacing: 100 });
  const byId = (id: string) => g.nodes.find(n => n.id === id)!;

  it('derives alert spans and first-seen times from the real timestamps', () => {
    expect(alertSpan(alerts[2])).toEqual({ start: Date.UTC(2026, 0, 1, 0, 1, 0), end: Date.UTC(2026, 0, 1, 0, 1, 30) });
    expect(alertSpan({ ...alerts[0], firstOccurrenceTime: '', lastOccurrenceTime: '' })).toBeNull();
    expect(nodeFirstSeen(byId('X'))).toBe(Date.UTC(2026, 0, 1));
  });

  it('replay: domain, arrival order, windows and hop distances', () => {
    expect(replayDomain(g.nodes)).toEqual({ start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 0, 1, 0, 5, 0) });
    expect(replayDomain([byId('X')])).toBeNull();
    expect(Array.from(nodesSeenBy(g.nodes, Date.UTC(2026, 0, 1, 0, 1, 0))).sort()).toEqual(['X', 'Y']);
    expect(Array.from(nodesSeenBy(g.nodes, Date.UTC(2025, 0, 1)))).toEqual([]);
    // Y's alert spans 60s..90s, so a 70s..80s window overlaps it but not X's alerts at 0s / 120s
    expect(Array.from(nodesInWindow(g.nodes, Date.UTC(2026, 0, 1, 0, 1, 10), Date.UTC(2026, 0, 1, 0, 1, 20)))).toEqual(['Y']);
    expect(Array.from(nodesInWindow(g.nodes, Date.UTC(2026, 0, 1, 0, 1, 20), Date.UTC(2026, 0, 1, 0, 1, 10)))).toEqual(['Y']);

    const [a, b, c, d] = [mkNode('a', 1), mkNode('b', 2), mkNode('c', 3), mkNode('d', 3)];
    const dist = hopDistances('a', [a, b, c, d], [mkLink(a, b), mkLink(b, c)]);
    expect(Array.from(dist.entries())).toEqual([['a', 0], ['b', 1], ['c', 2]]);
    expect(dist.has('d')).toBe(false);
    expect(hopDistances('missing', [a], []).size).toBe(0);
  });

  it('hierarchy: tier -> group -> resource, sums alerts and keeps the worst severity', () => {
    const grouped = g.nodes.map(n => (n.id === 'X' ? { ...n, topologyGroups: ['pod-1'] } : n));
    const tree = buildTierHierarchy(grouped);
    expect(tree.value).toBe(4);
    expect(tree.severity).toBe(6);
    const leaves: string[] = [];
    const walk = (d: typeof tree) => (d.children ? d.children.forEach(walk) : leaves.push(d.nodeId as string));
    walk(tree);
    expect(leaves.sort()).toEqual(['X', 'Y', 'Z']);
    const xGroup = tree.children!.flatMap(t => t.children!).find(gr => gr.name === 'pod-1')!;
    expect(xGroup.value).toBe(2);
    expect(xGroup.severity).toBe(6);
    expect(tree.children!.flatMap(t => t.children!).some(gr => gr.name === NO_GROUP_LABEL)).toBe(true);
    expect(buildTierHierarchy([])).toMatchObject({ value: 0, children: [] });
  });

  it('swimlanes: one lane per resource, first probe from the earliest alert, domain from all bars', () => {
    const s = buildSwimlanes(g.nodes);
    expect(s.lanes).toHaveLength(3);
    const x = s.lanes.find(l => l.id === 'X')!;
    expect(x.bars).toHaveLength(2);
    expect(x.firstProbe).toBe('A');
    expect(s.lanes.find(l => l.id === 'Y')!.firstProbe).toBe('B');
    expect(s.domain).toEqual([Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 1, 0, 5, 0)]);
    expect(buildSwimlanes([]).domain).toBeNull();
    const untimed = buildSwimlanes([{ ...byId('X'), alerts: [{ ...alerts[0], firstOccurrenceTime: '', lastOccurrenceTime: '' }] }]);
    expect(untimed.lanes[0].firstProbe).toBeNull();
    expect(untimed.domain).toBeNull();
  });

  it('adjacency: tier-ordered, symmetric for topology links, directional for causal links', () => {
    const [core, tr, ran] = [mkNode('core', 1), mkNode('tr', 2), mkNode('ran', 3)];
    const causal: Link3DGen2 = { source: ran, target: core, kind: 'causal', isCausal: true, relType: 'causalUnion', value: 3 };
    const m = buildAdjacency([ran, core, tr], [mkLink(core, tr), mkLink(tr, ran), causal]);
    expect(m.order.map(n => n.id)).toEqual(['core', 'tr', 'ran']);
    expect(m.physicalCount).toBe(2);
    expect(m.causalCount).toBe(1);
    expect(m.cells).toHaveLength(2 * 2 + 1);
    const has = (r: number, c: number, kind: string) => m.cells.some(x => x.row === r && x.col === c && x.kind === kind);
    expect(has(0, 1, 'physical') && has(1, 0, 'physical')).toBe(true);
    expect(has(2, 0, 'causal')).toBe(true);
    expect(has(0, 2, 'causal')).toBe(false);
    expect(m.tiers).toEqual([{ layer: 1, start: 0, end: 0 }, { layer: 2, start: 1, end: 1 }, { layer: 3, start: 2, end: 2 }]);
    expect(buildAdjacency([], []).cells).toEqual([]);
  });

  it('incident subgraph: probable cause in the middle, only real links, capped with a hidden count', () => {
    const incident: IncidentItem = { id: 'i', title: 't', priority: 1, state: '', team: '', alertIds: ['1', '2', '3', '4', 'nope'] };
    const alertById = new Map(alerts.map(a => [a.id, a] as [string, AlertItem]));
    const nodeById = new Map(g.nodes.map(n => [n.id, n] as [string, Node3DGen2]));
    const links = [mkLink(byId('X'), byId('Y'))];
    const mg = buildIncidentSubgraph(incident, alertById, nodeById, links, 'X');
    expect(mg.nodes.map(n => n.id).sort()).toEqual(['X', 'Y', 'Z']);
    expect(mg.nodes.find(n => n.isRoot)).toMatchObject({ id: 'X', x: 50, y: 30 });
    expect(mg.links).toEqual([{ source: 'X', target: 'Y', isCausal: false, kind: 'physical' }]);
    expect(mg.hidden).toBe(0);
    expect(buildIncidentSubgraph(incident, alertById, nodeById, links, null, 2)).toMatchObject({ hidden: 1 });
    expect(buildIncidentSubgraph({ ...incident, alertIds: [] }, alertById, nodeById, links).nodes).toEqual([]);
  });
});

describe('link flow', () => {
  const [a, b, c, d] = [mkNode('a', 1), mkNode('b', 2), mkNode('c', 3), mkNode('d', 3)];
  const causal = (s: typeof a, t: typeof a) => ({ ...mkLink(s, t), kind: 'causal' as const, isCausal: true, relType: 'causalUnion' });

  it('orients topology links low tier -> high tier, keeps causal direction and merges parallel links', () => {
    const m = buildLinkFlow([a, b, c, d], [mkLink(b, a), mkLink(a, b), causal(c, b)]);
    expect(m.links.map(l => [l.source, l.target, l.kind, l.value])).toEqual([['c', 'b', 'causal', 1], ['a', 'b', 'physical', 2]]);
    expect(m.nodes.map(n => n.id)).toEqual(['a', 'b', 'c']);
    expect(m.unlinked).toBe(1);
    expect(m.dropped).toBe(0);
  });

  it('drops a link that would close a loop, preferring causal links, and counts it', () => {
    const m = buildLinkFlow([a, b, c], [causal(a, b), causal(b, c), causal(c, a)]);
    expect(m.links).toHaveLength(2);
    expect(m.dropped).toBe(1);
  });

  it('filters by kind and finds linked resources', () => {
    const links = [mkLink(a, b), causal(c, d)];
    expect(buildLinkFlow([a, b, c, d], links, ['causal']).links).toHaveLength(1);
    expect(buildLinkFlow([a, b, c, d], [], undefined)).toMatchObject({ nodes: [], links: [], dropped: 0, unlinked: 4 });
    expect(linkedNodes([a, b, c, d], links).map(n => n.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(linkedNodes([a, b, c, d], [mkLink(a, b)]).map(n => n.id)).toEqual(['a', 'b']);
  });
});

describe('triage insights', () => {
  const inc = (id: string, alertIds: string[], extra: Record<string, any> = {}): IncidentItem => ({
    id, title: `inc ${id}`, priority: 3, state: 'inProgress', team: 'ops', alertIds, ...extra
  });
  const alerts = [
    alert('1', 'host-a', 'syslog', 0, { summary: 'Network error rate high on eth1', severity: 5 }),
    alert('2', 'host-b', 'prom', 30, { summary: 'Network error rate high on eth2', severity: 6 }),
    alert('3', 'host-a', 'syslog', 60, { summary: 'Disk 91% full', severity: 4, insights: [{ type: 'insight-type/runbook', details: { policyId: 'p', isAutomated: true } }] }),
    alert('4', 'host-c', 'prom', 90, { summary: 'Disk 95% full', severity: 3, insights: [{ type: 'insight-type/runbook', details: { policyId: 'q', isAutomated: false } }] }),
    alert('5', 'host-d', 'prom', 120, { summary: 'CPU hot', severity: 2 })
  ];
  const incidents = [
    inc('i1', ['1', '2'], { insights: [{ type: 'insight-type/probable-cause', details: { id: '2', rank: 1, score: 0.82 } }] }),
    inc('i2', ['3'], { team: '-', state: 'unassigned', insights: [{ type: 'insight-type/probable-cause', details: { id: '3', rank: 1 } }] }),
    inc('i3', ['1'], { insights: [{ type: 'insight-type/probable-cause', details: { id: '2', rank: 2, score: 5 } }] })
  ];
  const m = buildTriageInsights(alerts, incidents);

  it('normalizes numbers so variants of one problem group together', () => {
    expect(normalizeSummary('Network error rate high on eth1')).toBe(normalizeSummary('network  error rate high on ETH22'));
    expect(normalizeSummary('from 10.0.0.1:443')).toBe('from <ip>');
    expect(normalizeSummary('   ')).toBe('(no summary)');
  });

  it('recurring problems: counts, resources, worst severity, ordering', () => {
    expect(m.problems.map(p => [p.count, p.resourceIds, p.worstSeverity])).toEqual([
      [2, ['host-a', 'host-b'], 6], [2, ['host-a', 'host-c'], 4], [1, ['host-d'], 2]
    ]);
    expect(m.problems[0].label).toBe('Network error rate high on eth1');
    expect(m.problems[0].probes).toEqual(['prom', 'syslog']);
  });

  it('gaps: orphan alerts, unassigned incidents, runbook coverage', () => {
    expect(m.gaps.orphanAlertIds).toEqual(['4', '5']);
    expect(m.gaps.orphanResourceIds).toEqual(['host-c', 'host-d']);
    expect(m.gaps.alertsInIncident).toBe(3);
    expect(m.gaps.unassigned.map(i => i.id)).toEqual(['i2']);
    expect(m.gaps.noProbableCause).toEqual([]);
    expect([m.gaps.alertsWithRunbook, m.gaps.runbookAutomated, m.gaps.runbookAssisted]).toEqual([2, 1, 1]);
    expect(m.gaps.incidentsWithoutRunbook.map(i => i.id)).toEqual(['i1', 'i3']);
  });

  it('root causes: counts incidents per resource, rank-one share, and only a 0..1 score as confidence', () => {
    const b = m.rootCauses.find(r => r.resourceId === 'host-b')!;
    expect(b.incidents.map(i => i.id)).toEqual(['i1', 'i3']);
    expect(b.rankOne).toBe(1);
    expect(b.maxConfidencePercent).toBe(82);
    expect(m.rootCauses.find(r => r.resourceId === 'host-a')!.maxConfidencePercent).toBeNull();
  });

  it('sources: per-probe severity buckets', () => {
    expect(m.sources).toEqual([
      { probe: 'prom', total: 3, critical: 1, major: 0, minor: 0, warning: 1, info: 1 },
      { probe: 'syslog', total: 2, critical: 0, major: 1, minor: 1, warning: 0, info: 0 }
    ]);
    expect(buildTriageInsights([], [])).toMatchObject({ problems: [], rootCauses: [], sources: [] });
  });
});
