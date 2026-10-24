/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';

export function useSelectionGuard(m: ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph>) {
  const { isHost, drawerNode, nodes3D, routeSourceId, routeTargetId, selectedNodeId, setBreadcrumbTrail, setDrawerNode, setIsDrawerOpen, setRouteSourceId, setRouteTargetId, setSelectedNodeId } = m;
  // A selection that no longer exists (refresh, filter) must not keep dimming the mesh.
  useEffect(() => {
    if (!isHost) return;
    const ids = new Set(nodes3D.map(n => n.id));
    if (selectedNodeId && !ids.has(selectedNodeId)) setSelectedNodeId(null);
    if (routeSourceId && !ids.has(routeSourceId)) setRouteSourceId(null);
    if (routeTargetId && !ids.has(routeTargetId)) setRouteTargetId(null);
    if (drawerNode && !ids.has(drawerNode.id)) { setDrawerNode(null); setIsDrawerOpen(false); }
    setBreadcrumbTrail(prev => (prev.every(n => ids.has(n.id)) ? prev : prev.filter(n => ids.has(n.id))));
  }, [isHost, nodes3D]);

}
