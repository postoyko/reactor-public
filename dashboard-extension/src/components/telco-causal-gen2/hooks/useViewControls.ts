/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { Node3DGen2 } from '../logic';
import { nodeColorHex } from '../scene3d';
import { useMeshUiState } from './useMeshUiState';
import { useMeshAnalysis } from './useMeshAnalysis';

export function useViewControls(m: ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshAnalysis>) {
  const { colorMode, setHovered, setHovered2DId, setViewMode, spofAnalysis } = m;
  // ── Early states ────────────────────────────────────────────────────────────

  const changeView = (next: '2d' | '3d') => {
    setHovered(null);
    setHovered2DId(null);
    setViewMode(next);
  };
  // Same colours as the 3D lens, so switching view keeps the meaning of every colour.
  const nodeColor2D = (n: Node3DGen2) => `#${nodeColorHex(n, colorMode, spofAnalysis.spofNodeIds.has(n.id)).toString(16).padStart(6, '0')}`;

  return { changeView, nodeColor2D };
}
