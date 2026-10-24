/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { analyzeProbes, computeSpofAnalysis, findShortestPath, hopDistances, nodesInWindow, nodesSeenBy, probeOf, replayDomain, resourceKeyOf } from '../logic';
import { rootAlertIdOf } from '../incident-helpers';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';

export function useMeshAnalysis(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph>) {
  const { session, activeIncidentId, alerts, hasTopology, incidents, links3D, nodes3D, problemFilter, replay, routeSourceId, routeTargetId, selectedNodeId, selectedProbeFilter, selectedSankeyNodeId, subscribersByResource, timeWindow, topoLinks, topologyHops } = m;
  // ── Probe lead-time analysis (measured from alert timestamps) ───────────────

  const probeAnalysis = session.memo('probes', [alerts, incidents], () => analyzeProbes(alerts, incidents));
  // ── Topology analysis ───────────────────────────────────────────────────────

  const spofAnalysis = session.memo('spof', [nodes3D, topoLinks, subscribersByResource], () => computeSpofAnalysis(nodes3D, topoLinks, subscribersByResource));
  const activeRouteInfo = useMemo(() => {
    if (!routeSourceId || !routeTargetId || routeSourceId === routeTargetId) return null;
    return findShortestPath(routeSourceId, routeTargetId, nodes3D, topoLinks);
  }, [routeSourceId, routeTargetId, nodes3D, topoLinks]);
  const activeRoutePath = activeRouteInfo ? activeRouteInfo.nodes : null;
  const routeNotFound = Boolean(routeSourceId && routeTargetId && routeSourceId !== routeTargetId && !activeRouteInfo);
  // ── Incident isolation ──────────────────────────────────────────────────────

  const incidentBlastContext = useMemo(() => {
    if (!activeIncidentId) return null;
    const inc = incidents.find(i => i.id === activeIncidentId);
    if (!inc) return null;
    const alertIdSet = new Set(inc.alertIds);
    const incidentNodeNames = new Set<string>();
    alerts.forEach(a => {
      if (alertIdSet.has(a.id)) {
        const key = resourceKeyOf(a);
        if (key) incidentNodeNames.add(key);
      }
    });
    const rootId = rootAlertIdOf(inc);
    const rAlert = rootId ? alerts.find(a => a.id === rootId) : undefined;
    const rootNodeName = (rAlert && resourceKeyOf(rAlert)) || Array.from(incidentNodeNames)[0] || null;
    return { incident: inc, alertIdSet, incidentNodeNames, rootNodeName };
  }, [activeIncidentId, incidents, alerts]);
  const multiHopNodeIds = useMemo(() => {
    if (!selectedNodeId || topologyHops === 0) return null;
    const hopSet = new Set<string>([selectedNodeId]);
    let current = new Set<string>([selectedNodeId]);
    for (let h = 0; h < topologyHops; h++) {
      const next = new Set<string>();
      links3D.forEach(l => {
        if (current.has(l.source.id)) { hopSet.add(l.target.id); next.add(l.target.id); }
        if (current.has(l.target.id)) { hopSet.add(l.source.id); next.add(l.source.id); }
      });
      current = next;
    }
    return hopSet;
  }, [selectedNodeId, topologyHops, links3D]);
  const causalNeighborsSet = useMemo(() => {
    if (!selectedNodeId) return null;
    const set = new Set<string>([selectedNodeId]);
    links3D.forEach(l => {
      if (l.source.id === selectedNodeId) set.add(l.target.id);
      if (l.target.id === selectedNodeId) set.add(l.source.id);
    });
    return set;
  }, [selectedNodeId, links3D]);
  const probeActiveNodeIds = useMemo(() => {
    if (!selectedProbeFilter) return null;
    const set = new Set<string>();
    nodes3D.forEach(n => {
      if (n.alerts.some(a => probeOf(a) === selectedProbeFilter)) set.add(n.id);
    });
    return set.size > 0 ? set : null;
  }, [selectedProbeFilter, nodes3D]);
  const sankeyActiveNodeIds = useMemo(() => {
    if (!selectedSankeyNodeId) return null;
    const set = new Set<string>();
    const [kind, ...rest] = selectedSankeyNodeId.split('-');
    const value = rest.join('-');
    if (kind === 'src') {
      nodes3D.forEach(n => { if (n.alerts.some(a => probeOf(a) === value)) set.add(n.id); });
    } else if (kind === 'dom') {
      nodes3D.forEach(n => { if (String(n.layer) === value) set.add(n.id); });
    } else if (kind === 'inc') {
      const inc = incidents.find(i => i.id === value);
      if (inc) nodes3D.forEach(n => { if (n.alerts.some(a => inc.alertIds.includes(a.id))) set.add(n.id); });
    } else if (kind === 'pol') {
      nodes3D.forEach(n => { if (n.runbooks.some((r: any) => (r?.policyId || '') === value)) set.add(n.id); });
    }
    return set.size > 0 ? set : null;
  }, [selectedSankeyNodeId, nodes3D, incidents]);
  const spofBlastIslandNodeIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const report = spofAnalysis.spofMap.get(selectedNodeId);
    if (report && report.isCutVertex && report.blastPartitionIds.length > 0) {
      const set = new Set<string>(report.blastPartitionIds);
      set.add(selectedNodeId);
      return set;
    }
    return null;
  }, [selectedNodeId, spofAnalysis]);
  const baseActiveNodeIds = useMemo(() => {
    const incidentSet = incidentBlastContext && incidentBlastContext.incidentNodeNames.size > 0 ? incidentBlastContext.incidentNodeNames : null;
    if (multiHopNodeIds) return multiHopNodeIds;
    if (incidentSet) return incidentSet;
    if (problemFilter) return problemFilter.nodeIds;
    if (spofBlastIslandNodeIds) return spofBlastIslandNodeIds;
    if (selectedProbeFilter && probeActiveNodeIds) return probeActiveNodeIds;
    if (selectedNodeId && causalNeighborsSet) return causalNeighborsSet;
    if (selectedSankeyNodeId && sankeyActiveNodeIds) return sankeyActiveNodeIds;
    return null;
  }, [multiHopNodeIds, incidentBlastContext, problemFilter, spofBlastIslandNodeIds, selectedProbeFilter, probeActiveNodeIds, selectedNodeId, causalNeighborsSet, selectedSankeyNodeId, sankeyActiveNodeIds]);
  // ── Replay (incident timeline / blast shockwave) and the swimlane time window; both use loaded data only ──

  // Replay scope: the active incident's resources when one is selected, otherwise every resource.
  const replayScopeNodes = useMemo(() => {
    const inc = incidentBlastContext && incidentBlastContext.incidentNodeNames.size > 0 ? incidentBlastContext.incidentNodeNames : null;
    return inc ? nodes3D.filter(n => inc.has(n.id)) : nodes3D;
  }, [incidentBlastContext, nodes3D]);
  const replayTimeDomain = useMemo(() => replayDomain(replayScopeNodes), [replayScopeNodes]);
  const blastDistances = useMemo(
    () => (selectedNodeId && hasTopology ? hopDistances(selectedNodeId, nodes3D, topoLinks) : null),
    [selectedNodeId, hasTopology, nodes3D, topoLinks]
  );
  const blastMaxHop = useMemo(() => {
    let m = 0;
    blastDistances?.forEach(d => { if (d > m) m = d; });
    return m;
  }, [blastDistances]);
  const blastHop = replay.mode === 'blast' ? Math.min(Math.floor(replay.pos * (blastMaxHop + 1)), blastMaxHop) : 0;
  const replayTime = replayTimeDomain ? replayTimeDomain.start + replay.pos * (replayTimeDomain.end - replayTimeDomain.start) : null;
  const replayNodeIds = useMemo(() => {
    if (replay.mode === 'time' && replayTime !== null) return nodesSeenBy(replayScopeNodes, replayTime);
    if (replay.mode === 'blast' && blastDistances) {
      const s = new Set<string>();
      blastDistances.forEach((d, id) => { if (d <= blastHop) s.add(id); });
      return s;
    }
    return null;
  }, [replay.mode, replayTime, replayScopeNodes, blastDistances, blastHop]);
  const timeWindowNodeIds = useMemo(
    () => (timeWindow ? nodesInWindow(nodes3D, timeWindow.start, timeWindow.end) : null),
    [timeWindow, nodes3D]
  );
  const effectiveActiveNodeIds = useMemo(() => {
    if (replayNodeIds) return replayNodeIds;
    if (!timeWindowNodeIds) return baseActiveNodeIds;
    if (!baseActiveNodeIds) return timeWindowNodeIds;
    const both = new Set<string>();
    baseActiveNodeIds.forEach(id => { if (timeWindowNodeIds.has(id)) both.add(id); });
    return both;
  }, [replayNodeIds, timeWindowNodeIds, baseActiveNodeIds]);

  return { activeRouteInfo, activeRoutePath, blastDistances, blastHop, blastMaxHop, effectiveActiveNodeIds, incidentBlastContext, probeAnalysis, replayNodeIds, replayScopeNodes, replayTime, replayTimeDomain, routeNotFound, sankeyActiveNodeIds, spofAnalysis, timeWindowNodeIds };
}
