/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo } from 'react';
import { useElementSize } from './useElementSize';
import * as d3 from 'd3';
import { Node3DGen2 } from '../logic';
import { severityHex } from '../severity';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';
import { useMeshAnalysis } from './useMeshAnalysis';
import { useMeshActions } from './useMeshActions';

export function useBlastRadius(m: ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph> & ReturnType<typeof useMeshAnalysis> & ReturnType<typeof useMeshActions>) {
  const { hasTopology, incidentBlastContext, links3D, live, nodes3D, radarRef, rightOpen, selectedNodeId, spofAnalysis } = m;
  // ── Blast radius radar: real adjacency and (when computable) the SPOF blast island ──

  const rootCandidate = useMemo(() => {
    if (incidentBlastContext?.rootNodeName) {
      const rNode = nodes3D.find(n => n.id === incidentBlastContext.rootNodeName);
      if (rNode) return rNode;
    }
    if (selectedNodeId) return nodes3D.find(n => n.id === selectedNodeId) || null;
    return nodes3D.find(n => n.isProbableCause) || nodes3D[0] || null;
  }, [nodes3D, selectedNodeId, incidentBlastContext]);
  const rootSpofReport = rootCandidate ? spofAnalysis.spofMap.get(rootCandidate.id) || null : null;
  const box = useElementSize(() => radarRef.current?.parentElement, []);
  useEffect(() => {
    const el = radarRef.current;
    if (!el) return;
    const width = el.clientWidth || 460;
    const height = Math.max(box.h || 320, 160);
    const svg = d3.select(el);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', '100%');
    const g = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    const note = (text: string, y: number) => g.append('text')
      .attr('x', 0).attr('y', y).attr('text-anchor', 'middle').attr('fill', '#525252').attr('font-size', '10px').text(text);

    if (!rootCandidate) {
      note('No resource to analyse yet.', 0);
      return;
    }

    const neighborLinks = links3D.filter(l => l.source.id === rootCandidate.id || l.target.id === rootCandidate.id);
    const neighbors = neighborLinks.map(l => (l.source.id === rootCandidate.id ? l.target : l.source)).slice(0, 8);
    const blastIds = rootSpofReport && rootSpofReport.isCutVertex ? rootSpofReport.blastPartitionIds : [];

    const rings = [
      { r: 40, label: 'Root', color: '#da1e28' },
      { r: 95, label: `Directly linked (${neighborLinks.length})`, color: '#ba4e00' },
    ];
    if (blastIds.length > 0) rings.push({ r: 150, label: `Blast island (${blastIds.length})`, color: '#6929c4' });
    rings.forEach(ring => {
      g.append('circle').attr('r', ring.r).attr('fill', 'none').attr('stroke', ring.color).attr('stroke-width', 1.3)
        .attr('stroke-dasharray', ring.r > 40 ? '4,4' : 'none').attr('opacity', 0.55);
      g.append('text').attr('x', 0).attr('y', -ring.r - 4).attr('text-anchor', 'middle').attr('fill', ring.color)
        .attr('font-size', '9.5px').attr('font-weight', '700').text(ring.label);
    });

    neighbors.forEach((nbr, idx) => {
      const angle = (idx / Math.max(1, neighbors.length)) * Math.PI * 2;
      const nx = Math.cos(angle) * 95;
      const ny = Math.sin(angle) * 95;
      g.append('line').attr('x1', 0).attr('y1', 0).attr('x2', nx).attr('y2', ny)
        .attr('stroke', '#da1e28').attr('stroke-width', 1.5).attr('stroke-dasharray', '3,3').attr('opacity', 0.75);
      g.append('circle').attr('cx', nx).attr('cy', ny).attr('r', 6)
        .attr('fill', severityHex(nbr.severity)).attr('stroke', '#ffffff').attr('stroke-width', 1.5)
        .style('cursor', 'pointer').on('click', () => live.current.handleFocusNode(nbr));
      g.append('text').attr('x', nx).attr('y', ny + 14).attr('text-anchor', 'middle').attr('fill', '#161616')
        .attr('font-size', '9px').attr('font-weight', '600').text(nbr.name.slice(0, 12));
    });

    const blastNodes = blastIds.map(id => nodes3D.find(n => n.id === id)).filter((n): n is Node3DGen2 => Boolean(n)).slice(0, 16);
    blastNodes.forEach((bn, idx) => {
      const angle = (idx / Math.max(1, blastNodes.length)) * Math.PI * 2 + 0.2;
      const bx = Math.cos(angle) * 150;
      const by = Math.sin(angle) * 150;
      g.append('circle').attr('cx', bx).attr('cy', by).attr('r', 6).attr('fill', '#6929c4').attr('stroke', '#ffffff').attr('stroke-width', 1.5)
        .style('cursor', 'pointer').on('click', () => live.current.handleFocusNode(bn));
      g.append('text').attr('x', bx).attr('y', by + (by > 0 ? 15 : -9)).attr('text-anchor', 'middle').attr('fill', '#6929c4')
        .attr('font-size', '8.5px').attr('font-weight', '600').text(bn.name.slice(0, 12));
    });

    g.append('circle').attr('r', 18).attr('fill', '#da1e28').attr('stroke', '#0f62fe').attr('stroke-width', 2.5)
      .style('cursor', 'pointer').on('click', () => live.current.handleOpenDeepDive(rootCandidate));
    g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('fill', '#ffffff').attr('font-size', '8px').attr('font-weight', '800').text('ROOT');
    g.append('text').attr('text-anchor', 'middle').attr('y', 28).attr('fill', '#0f62fe').attr('font-size', '10px').attr('font-weight', '700').text(rootCandidate.name.slice(0, 16));

    if (!hasTopology) note('No topology links supplied: only incident (causal) links are shown.', height / 2 - 14);
    else if (!spofAnalysis.blastAvailable) note('Blast island unavailable: no core-layer resource in the data.', height / 2 - 14);
  }, [rootCandidate, links3D, rootSpofReport, spofAnalysis, hasTopology, nodes3D, rightOpen, box.w, box.h]);

}
