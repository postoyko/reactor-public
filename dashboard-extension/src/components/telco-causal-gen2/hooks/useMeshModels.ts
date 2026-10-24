/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildSwimlanes, buildTierHierarchy, buildTriageInsights } from '../logic';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshGraph } from './useMeshGraph';
import { useMeshAnalysis } from './useMeshAnalysis';
import { useMeshUiState } from './useMeshUiState';

export function useMeshModels(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshUiState> & ReturnType<typeof useMeshGraph> & ReturnType<typeof useMeshAnalysis>) {
  const { session, alerts, incidents, nodes3D, probeAnalysis } = m;
  const tierHierarchy = session.memo('tiers', [nodes3D], () => buildTierHierarchy(nodes3D));
  const swimlanes = session.memo('swimlanes', [nodes3D], () => buildSwimlanes(nodes3D));
  const triageModel = session.memo('triage', [alerts, incidents], () => buildTriageInsights(alerts, incidents));
  const probeColorOf = (probe: string) => probeAnalysis.horizonSequence.find(h => h.probe === probe)?.color || '#8d8d8d';

  return { probeColorOf, swimlanes, tierHierarchy, triageModel };
}
