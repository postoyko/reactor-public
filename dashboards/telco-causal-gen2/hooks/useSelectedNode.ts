/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';
import { useMeshAnalysis } from './useMeshAnalysis';

export function useSelectedNode(m: ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph> & ReturnType<typeof useMeshAnalysis>) {
  const { drawerNode, nodes3D, selectedNodeId, spofAnalysis } = m;
  const selectedNodeData = useMemo(() => nodes3D.find(n => n.id === selectedNodeId) || null, [nodes3D, selectedNodeId]);
  const selectedNodeSpofReport = useMemo(() => (selectedNodeId ? spofAnalysis.spofMap.get(selectedNodeId) || null : null), [selectedNodeId, spofAnalysis]);
  const drawerNodeSpofReport = useMemo(() => (drawerNode ? spofAnalysis.spofMap.get(drawerNode.id) || null : null), [drawerNode, spofAnalysis]);

  return { drawerNodeSpofReport, selectedNodeData, selectedNodeSpofReport };
}
