/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TelcoCausalMeshProps } from '../types';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshScope } from './useMeshScope';
import { useMeshUiState } from './useMeshUiState';
import { useMeshGraph } from './useMeshGraph';
import { useLiveEntityTypes } from './useLiveEntityTypes';
import { useIngestSparkline } from './useIngestSparkline';
import { useMeshAnalysis } from './useMeshAnalysis';
import { useReplayDriver } from './useReplayDriver';
import { useMeshModels } from './useMeshModels';
import { useSelectionGuard } from './useSelectionGuard';
import { useResourceDetails } from './useResourceDetails';
import { useMeshActions } from './useMeshActions';
import { useScene3D } from './useScene3D';
import { useSankeyFlow } from './useSankeyFlow';
import { useBlastRadius } from './useBlastRadius';
import { useIncidentModel } from './useIncidentModel';
import { useSelectedNode } from './useSelectedNode';
import { useRemediation } from './useRemediation';
import { useViewControls } from './useViewControls';

/**
 * Runs every hook of the mesh, in dependency order, and returns everything the sections read through useMesh().
 * Each step takes the object built so far and adds its own results; hooks that only have side effects add nothing.
 *
 *   props -> session -> UI state -> graph -> analysis -> models -> actions -> per-section models
 */
export function useMeshController(props: TelcoCausalMeshProps) {
  const resolved = resolveMeshProps(props);
  const scoped = { ...resolved, ...useMeshScope(resolved) };
  const withState = { ...scoped, ...useMeshUiState(scoped) };
  const withLive = { ...withState, ...useLiveEntityTypes(withState) };
  const withGraph = { ...withLive, ...useMeshGraph(withLive) };
  useIngestSparkline(withGraph);
  const withAnalysis = { ...withGraph, ...useMeshAnalysis(withGraph) };
  useReplayDriver(withAnalysis);
  const withModels = { ...withAnalysis, ...useMeshModels(withAnalysis) };
  useSelectionGuard(withModels);
  useResourceDetails(withModels);
  const withActions = { ...withModels, ...useMeshActions(withModels) };
  useScene3D(withActions);
  useSankeyFlow(withActions);
  useBlastRadius(withActions);
  const withIncidents = { ...withActions, ...useIncidentModel(withActions) };
  const withSelection = { ...withIncidents, ...useSelectedNode(withIncidents) };
  const withRemediation = { ...withSelection, ...useRemediation(withSelection) };
  return { ...withRemediation, ...useViewControls(withRemediation) };
}
