/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { Node3DGen2 } from '../logic';
import { useEffect, useRef } from 'react';
import { useMeshUiState } from './useMeshUiState';

export function useMeshActions(m: ReturnType<typeof useMeshUiState>) {
  const { isHost, autoRotate, contextMenu, isRoutingMode, layerSpacing, layoutMode, routeSourceId, routeTargetId, setAutoRotate, setBreadcrumbTrail, setContextMenu, setDrawerNode, setHovered, setIsDrawerOpen, setRouteSourceId, setRouteTargetId, setSelectedLink, setSelectedNodeId, sphericalRef, targetLookAtRef } = m;
  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFocusNode = (node: Node3DGen2) => {
    setSelectedNodeId(node.id);
    targetLookAtRef.current.set(node.x, node.y, node.z);
    sphericalRef.current.radius = 180;
    setAutoRotate(false);
    setBreadcrumbTrail(prev => {
      const existingIdx = prev.findIndex(n => n.id === node.id);
      if (existingIdx !== -1) return prev.slice(0, existingIdx + 1);
      return [...prev.slice(-4), node];
    });
  };
  const handleTraverseNeighbor = (node: Node3DGen2) => {
    handleFocusNode(node);
    setDrawerNode(node);
  };
  // The context menu is a floating panel: Escape, resize and scroll dismiss it.
  useEffect(() => {
    if (!isHost || !contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [isHost, contextMenu]);
  const handleOpenDeepDive = (node: Node3DGen2) => {
    setDrawerNode(node);
    setIsDrawerOpen(true);
    setContextMenu(null);
  };
  // The scene's event listeners are registered once; they read the latest values through this ref.
  const live = useRef<any>({});
  live.current = {
    autoRotate,
    layoutMode,
    layerSpacing,
    isRoutingMode,
    routeSourceId,
    routeTargetId,
    handleFocusNode,
    handleOpenDeepDive,
    setSelectedLink,
    setContextMenu,
    setHovered,
    setAutoRotate,
    setRouteSourceId,
    setRouteTargetId,
  };

  return { handleFocusNode, handleOpenDeepDive, handleTraverseNeighbor, live };
}
