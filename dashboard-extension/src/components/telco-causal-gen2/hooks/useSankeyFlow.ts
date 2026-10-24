/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useElementSize } from './useElementSize';
import { layerDef, schemeOf } from '../classification';
import { AlertItem, IncidentItem, Node3DGen2, asString, probeOf, resourceKeyOf } from '../logic';
import * as d3 from 'd3';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';

export function useSankeyFlow(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph>) {
  const { session, alerts, hasEventCounts, incidents, nodes3D, sankeyRef, selectedSankeyNodeId, setSankeyTooltip, setSelectedSankeyNodeId, topPanelView } = m;
  // ── Sankey dataset: probe -> estimated domain -> incident -> runbook policy ──

  const sankeyData = session.memo('sankey', [alerts, incidents, nodes3D, hasEventCounts], () => {
    const rawNodes: any[] = [];
    const nodeIndexMap = new Map<string, number>();
    const getNodeIdx = (id: string, name: string, color: string): number => {
      const known = nodeIndexMap.get(id);
      if (known !== undefined) return known;
      rawNodes.push({ id, name, color });
      nodeIndexMap.set(id, rawNodes.length - 1);
      return rawNodes.length - 1;
    };
    const linkMap = new Map<string, { source: number; target: number; value: number; rawEvents: number; highSev: number; lowSev: number; senders: Map<string, number> }>();
    const addLink = (s: number, t: number, a: AlertItem) => {
      const key = `${s}->${t}`;
      const count = hasEventCounts ? Math.max(a.eventCount || 1, 1) : 1;
      const high = a.severity >= 4;
      const sender = probeOf(a);
      const item = linkMap.get(key) || { source: s, target: t, value: 0, rawEvents: 0, highSev: 0, lowSev: 0, senders: new Map<string, number>() };
      item.value += 1;
      item.rawEvents += count;
      if (high) item.highSev += count; else item.lowSev += count;
      item.senders.set(sender, (item.senders.get(sender) || 0) + count);
      linkMap.set(key, item);
    };

    const incidentOfAlert = new Map<string, IncidentItem>();
    incidents.forEach(inc => inc.alertIds.forEach(id => { if (!incidentOfAlert.has(id)) incidentOfAlert.set(id, inc); }));
    const fallbackLayer = schemeOf(nodes3D[0]?.layer ?? 1).fallback;
    const nodeByKey = new Map(nodes3D.map(n => [n.id, n] as [string, Node3DGen2]));

    alerts.slice(0, 260).forEach(a => {
      const srcName = probeOf(a);
      const sIdx = getNodeIdx(`src-${srcName}`, srcName, '#0f62fe');

      const key = resourceKeyOf(a);
      const layer = (key && nodeByKey.get(key)?.layer) || fallbackLayer;
      const dIdx = getNodeIdx(`dom-${layer}`, `${layerDef(layer).name} (est.)`, layerDef(layer).color);
      addLink(sIdx, dIdx, a);

      const inc = incidentOfAlert.get(a.id);
      const iIdx = inc
        ? getNodeIdx(`inc-${inc.id}`, `INC: ${inc.title}`, '#da1e28')
        : getNodeIdx('inc-none', 'Not in an incident', '#8d8d8d');
      addLink(dIdx, iIdx, a);

      const rb = a.insights?.find(i => i.type?.includes('runbook'))?.details;
      const policyId = rb ? asString(rb.policyId) : '';
      const pIdx = rb
        ? getNodeIdx(`pol-${policyId}`, policyId ? `Policy: ${policyId.slice(0, 8)}…` : 'Runbook (no policy id)', '#0f62fe')
        : getNodeIdx('pol-', 'No runbook', '#8d8d8d');
      addLink(iIdx, pIdx, a);
    });

    const links = Array.from(linkMap.values()).map(l => {
      const snrVal = Math.round(10 * Math.log10(Math.max(l.highSev, 1) / Math.max(l.lowSev, 1)) * 10) / 10;
      let entropyVal = 0;
      l.senders.forEach(cnt => {
        const p = cnt / l.rawEvents;
        if (p > 0) entropyVal -= p * Math.log2(p);
      });
      return {
        source: l.source,
        target: l.target,
        value: l.value,
        snr: snrVal >= 0 ? `+${snrVal}` : `${snrVal}`,
        entropy: Math.round(entropyVal * 100) / 100,
        rawEvents: l.rawEvents,
      };
    });
    return { nodes: rawNodes, links };
  });
  // ── Render Active Interactive D3 Sankey Diagram ─────────────────────────────

  // Redraw to the size of the box the diagram is in (it changes when a divider is dragged).
  const box = useElementSize(() => sankeyRef.current?.parentElement, [topPanelView]);
  useEffect(() => {
    if (topPanelView !== 'sankey') return;
    if (!sankeyRef.current || sankeyData.nodes.length === 0 || sankeyData.links.length === 0) return;

    const width = sankeyRef.current.clientWidth || 900;
    const height = Math.max(box.h || 380, 220);

    const svg = d3.select(sankeyRef.current);
    svg.selectAll('*').remove();
    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%');

    const sankeyLayout = (d3Sankey as any)()
      .nodeWidth(18)
      .nodePadding(16)
      .extent([[16, 16], [width - 16, height - 20]]);

    try {
      const graph = sankeyLayout({
        nodes: sankeyData.nodes.map((d: any) => ({ ...d })),
        links: sankeyData.links.map((d: any) => ({ ...d })),
      });

      const activeNodeIds = new Set<string>();
      const activeLinkKeys = new Set<string>();

      if (selectedSankeyNodeId) {
        activeNodeIds.add(selectedSankeyNodeId);

        const queueForward = [selectedSankeyNodeId];
        while (queueForward.length > 0) {
          const curr = queueForward.shift()!;
          graph.links.forEach((l: any) => {
            if (l.source.id === curr) {
              activeLinkKeys.add(`${l.source.id}->${l.target.id}`);
              if (!activeNodeIds.has(l.target.id)) {
                activeNodeIds.add(l.target.id);
                queueForward.push(l.target.id);
              }
            }
          });
        }

        const queueBackward = [selectedSankeyNodeId];
        while (queueBackward.length > 0) {
          const curr = queueBackward.shift()!;
          graph.links.forEach((l: any) => {
            if (l.target.id === curr) {
              activeLinkKeys.add(`${l.source.id}->${l.target.id}`);
              if (!activeNodeIds.has(l.source.id)) {
                activeNodeIds.add(l.source.id);
                queueBackward.push(l.source.id);
              }
            }
          });
        }
      }

      const isPathActive = (d: any) => {
        if (!selectedSankeyNodeId) return true;
        return activeLinkKeys.has(`${d.source.id}->${d.target.id}`);
      };

      const link = svg.append('g')
        .attr('fill', 'none')
        .selectAll('path')
        .data(graph.links)
        .enter()
        .append('path')
        .attr('d', sankeyLinkHorizontal())
        .attr('stroke', (d: any) => d.source.color || '#334155')
        .attr('stroke-width', (d: any) => (selectedSankeyNodeId && isPathActive(d) ? Math.max(2.5, d.width * 1.15) : Math.max(1.4, d.width)))
        .attr('stroke-opacity', (d: any) => (selectedSankeyNodeId ? (isPathActive(d) ? 0.95 : 0.05) : 0.42))
        .style('cursor', 'pointer')
        .on('click', function (event: any, d: any) {
          event.stopPropagation();
          setSelectedSankeyNodeId((prev) => (prev === d.source.id ? null : d.source.id));
        })
        .on('mouseenter', function (event: any, d: any) {
          d3.select(this).attr('stroke-opacity', 0.98);
        })
        .on('mousemove', function (event: any, d: any) {
          const svgEl = sankeyRef.current;
          const rect = svgEl?.getBoundingClientRect();
          const w = rect?.width || width;
          const mouseX = event.clientX - (rect?.left || 0);
          const mouseY = event.clientY - (rect?.top || 0);

          const tooltipWidth = 280;
          let posX = mouseX + 15;
          if (mouseX + tooltipWidth > w - 10) {
            posX = Math.max(10, mouseX - tooltipWidth - 15);
          }
          const posY = Math.max(10, Math.min(height - 75, mouseY - 25));

          setSankeyTooltip({
            text: `Flow: ${d.source.name} → ${d.target.name} | Volume: ${d.value} Alarms (${d.rawEvents || d.value} Evts) | SNR: ${d.snr} dB | Shannon Entropy: ${d.entropy} bit`,
            x: posX,
            y: posY,
          });
        })
        .on('mouseleave', function (event: any, d: any) {
          d3.select(this).attr('stroke-opacity', selectedSankeyNodeId ? (isPathActive(d) ? 0.95 : 0.05) : 0.42);
          setSankeyTooltip(null);
        });

      const node = svg.append('g')
        .selectAll('g')
        .data(graph.nodes)
        .enter()
        .append('g')
        .attr('cursor', 'pointer')
        .attr('opacity', (d: any) => (selectedSankeyNodeId ? (activeNodeIds.has(d.id) ? 1.0 : 0.2) : 1.0))
        .on('click', (event: any, d: any) => {
          setSelectedSankeyNodeId((prev) => (prev === d.id ? null : d.id));
        });

      node.append('rect')
        .attr('x', (d: any) => d.x0)
        .attr('y', (d: any) => d.y0)
        .attr('height', (d: any) => Math.max(2, d.y1 - d.y0))
        .attr('width', (d: any) => d.x1 - d.x0)
        .attr('fill', (d: any) => d.color)
        .attr('stroke', (d: any) => (d.id === selectedSankeyNodeId ? '#0f62fe' : activeNodeIds.has(d.id) ? '#0043ce' : 'none'))
        .attr('stroke-width', (d: any) => (d.id === selectedSankeyNodeId ? 2.5 : 1))
        .attr('rx', 2);

      node.append('text')
        .attr('x', (d: any) => (d.x0 < width / 2 ? d.x1 + 8 : d.x0 - 8))
        .attr('y', (d: any) => (d.y1 + d.y0) / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', (d: any) => (d.x0 < width / 2 ? 'start' : 'end'))
        .attr('fill', '#161616')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text((d: any) => (d.name.length > 24 ? d.name.slice(0, 22) + '…' : d.name));
    } catch (e) {
      console.warn('Sankey error:', e);
    }
  }, [sankeyData, selectedSankeyNodeId, topPanelView, box.w, box.h]);

}
