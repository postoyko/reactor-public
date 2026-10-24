/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { IncidentItem, MiniGraph, Node3DGen2, buildIncidentSubgraph, resourceKeyOf } from '../logic';
import { MAX_INCIDENT_CARDS, rootAlertIdOf } from '../incident-helpers';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';
import { useMeshActions } from './useMeshActions';

export function useIncidentModel(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph> & ReturnType<typeof useMeshActions>) {
  const { activeIncidentId, alerts, handleFocusNode, incidentFilter, incidents, links3D, nodes3D, setActiveIncidentId, setSelectedSankeyNodeId, targetLookAtRef } = m;
  // ── Incident selection ──────────────────────────────────────────────────────

  const filteredIncidents = useMemo(() => {
    if (incidentFilter === 'p1') return incidents.filter(i => i.priority === 1);
    if (incidentFilter === 'p2') return incidents.filter(i => i.priority === 2);
    if (incidentFilter === 'inProgress') return incidents.filter(i => i.state === 'inProgress' || i.state === 'investigating');
    return incidents;
  }, [incidents, incidentFilter]);
  // Tiny per-incident subgraph for the war-room cards (loaded alerts + links only).
  const incidentMini = useMemo(() => {
    const alertById = new Map(alerts.map(a => [a.id, a] as [string, (typeof alerts)[number]]));
    const nodeById = new Map(nodes3D.map(n => [n.id, n] as [string, Node3DGen2]));
    const out = new Map<string, MiniGraph>();
    filteredIncidents.slice(0, MAX_INCIDENT_CARDS).forEach(inc => {
      const rId = rootAlertIdOf(inc);
      const rAlert = rId ? alertById.get(rId) : undefined;
      out.set(inc.id, buildIncidentSubgraph(inc, alertById, nodeById, links3D, rAlert ? resourceKeyOf(rAlert) : null));
    });
    return out;
  }, [filteredIncidents, alerts, nodes3D, links3D]);
  const handleSelectIncident = (inc: IncidentItem) => {
    if (activeIncidentId === inc.id) {
      setActiveIncidentId(null);
      setSelectedSankeyNodeId(null);
      targetLookAtRef.current.set(0, 0, 0);
      return;
    }
    setActiveIncidentId(inc.id);
    setSelectedSankeyNodeId(`inc-${inc.id}`);
    const rootId = rootAlertIdOf(inc);
    const rAlert = rootId ? alerts.find(a => a.id === rootId) : undefined;
    const key = rAlert ? resourceKeyOf(rAlert) : null;
    const targetNode = key ? nodes3D.find(n => n.id === key) : undefined;
    if (targetNode) handleFocusNode(targetNode);
  };

  return { filteredIncidents, handleSelectIncident, incidentMini };
}
