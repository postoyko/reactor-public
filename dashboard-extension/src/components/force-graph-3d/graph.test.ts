/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import mockAlerts from '../../mocks/alerts.json';
import generateSyntheticAlerts from '../../helpers/generateSyntheticAlerts';
import {
  buildAlertGraph,
  buildFilterClause,
  dimColor,
  endpointId,
  escapeHtml,
  focusSet,
  nodeTooltip,
  preservePositions,
  quoteFilterValue,
  severityColor,
  severityLabel
} from './graph';

const { rows, columns } = mockAlerts.data.tenant.alerts as any;

describe('buildAlertGraph', () => {
  it('creates one resource node per resource and counts every alert', () => {
    const graph = buildAlertGraph(rows, columns);
    const resourceNodes = graph.nodes.filter(n => n.kind === 'resource');
    const uniqueResources = new Set(rows.map((r: any) => r.fields[6]).filter(Boolean));
    expect(resourceNodes).toHaveLength(uniqueResources.size);
    expect(resourceNodes.reduce((sum, n) => sum + n.count, 0)).toBe(graph.stats.alerts);
    expect(graph.stats.alerts + graph.stats.skipped).toBe(rows.length);
  });

  it('links every resource to its hubs and keeps links consistent with nodes', () => {
    const graph = buildAlertGraph(rows, columns, { linkBy: ['sender.name'] });
    const ids = new Set(graph.nodes.map(n => n.id));
    graph.links.forEach(l => {
      expect(ids.has(l.source)).toBe(true);
      expect(ids.has(l.target)).toBe(true);
    });
    expect(graph.nodes.filter(n => n.kind === 'sender.name').length).toBe(graph.stats.hubs);
    expect(graph.stats.links).toBe(graph.links.length);
  });

  it('filters by minimum severity', () => {
    const all = buildAlertGraph(rows, columns);
    const critical = buildAlertGraph(rows, columns, { minSeverity: 6 });
    expect(critical.stats.alerts).toBeLessThan(all.stats.alerts);
    critical.nodes.filter(n => n.kind === 'resource').forEach(n => expect(n.severity).toBe(6));
  });

  it('searches resources and hub values case-insensitively', () => {
    const graph = buildAlertGraph(rows, columns, { search: 'GENERATED-1' });
    expect(graph.nodes.some(n => n.kind === 'resource' && n.name === 'generated-1')).toBe(true);
    expect(graph.nodes.filter(n => n.kind === 'resource').every(n => n.name.toLowerCase().includes('generated-1'))).toBe(true);
  });

  it('caps resource nodes, keeping the most severe first', () => {
    const graph = buildAlertGraph(rows, columns, { maxNodes: 3 });
    const resources = graph.nodes.filter(n => n.kind === 'resource');
    expect(resources).toHaveLength(3);
    expect(graph.stats.truncated).toBeGreaterThan(0);
    const full = buildAlertGraph(rows, columns).nodes.filter(n => n.kind === 'resource');
    const topSeverity = Math.max(...full.map(n => n.severity));
    expect(resources[0].severity).toBe(topSeverity);
  });

  it('falls back to the toolkit column order when the response has no column metadata', () => {
    const withColumns = buildAlertGraph(rows, columns);
    const without = buildAlertGraph(rows, undefined);
    expect(without.stats).toEqual(withColumns.stats);
  });

  it('handles empty and malformed input', () => {
    expect(buildAlertGraph(undefined, undefined).nodes).toEqual([]);
    expect(buildAlertGraph([], []).stats.alerts).toBe(0);
    expect(buildAlertGraph([{ fields: [] } as any], undefined).stats.skipped).toBe(1);
  });

  it('treats explicitly undefined options as defaults', () => {
    const graph = buildAlertGraph(rows, columns, { linkBy: undefined, search: undefined, maxNodes: undefined, minSeverity: undefined });
    expect(graph.stats).toEqual(buildAlertGraph(rows, columns).stats);
  });

  it('builds large graphs quickly', () => {
    const data = generateSyntheticAlerts(5000, 3).tenant.alerts;
    const start = Date.now();
    const graph = buildAlertGraph(data.rows, data.columns, { maxNodes: 5000 });
    expect(Date.now() - start).toBeLessThan(5000);
    expect(graph.nodes.length).toBeGreaterThan(5000);
  });
});

describe('graph helpers', () => {
  it('computes focus sets from neighbours', () => {
    const graph = buildAlertGraph(rows, columns);
    const resource = graph.nodes.find(n => n.kind === 'resource')!;
    const focus = focusSet(graph, resource.id)!;
    expect(focus.has(resource.id)).toBe(true);
    graph.neighbors.get(resource.id)!.forEach(n => expect(focus.has(n)).toBe(true));
    expect(focusSet(graph, null)).toBeNull();
  });

  it('preserves positions across rebuilds', () => {
    const first = buildAlertGraph(rows, columns).nodes;
    first.forEach((n, i) => Object.assign(n, { x: i, y: i * 2, z: i * 3 }));
    const next = buildAlertGraph(rows, columns).nodes;
    const kept = preservePositions(next, new Map(first.map(n => [n.id, n])));
    expect(kept).toBe(next.length);
    expect(next[1].y).toBe(2);
    expect(preservePositions(next, undefined)).toBe(0);
  });

  it('builds alert filters and quotes values', () => {
    expect(buildFilterClause({ kind: 'resource', name: 'web-01' })).toBe('resource.name = \'web-01\'');
    expect(buildFilterClause({ kind: 'team', name: 'sre' })).toBe('team = \'sre\'');
    expect(quoteFilterValue('o\'brien')).toBe('\'o\'\'brien\'');
  });

  it('escapes HTML in tooltips', () => {
    const html = nodeTooltip({
      id: 'x', name: '<img src=x onerror=alert(1)>', kind: 'resource', severity: 6, count: 1, val: 1, color: '#fff'
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(escapeHtml(null)).toBe('');
  });

  it('maps severities and colours', () => {
    expect(severityColor(6)).toBe('#da1e28');
    expect(severityColor(0)).toBe('#c6c6c6');
    expect(severityColor(99)).toBe('#da1e28');
    expect(severityLabel(6)).toBe('Critical');
    expect(severityLabel(NaN)).toBe('Clear');
  });

  it('dims colours towards the background', () => {
    expect(dimColor('#ffffff', 0)).toBe('#ffffff');
    expect(dimColor('#ffffff', 1)).toBe('#262626');
    expect(dimColor('#f00')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('reads endpoint ids before and after the force engine runs', () => {
    expect(endpointId('a')).toBe('a');
    expect(endpointId({ id: 'b' })).toBe('b');
  });
});
