/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { EMPTY_ALERTS, EMPTY_INCIDENTS, EMPTY_TOPOLOGY } from '../types';
import { TelcoCausalMeshProps } from '../types';
import { DEFAULT_SCHEME, isSchemeId } from '../classification';

/** Applies the defaults for every prop; the rest of the code reads this resolved object. */
export function resolveMeshProps(props: TelcoCausalMeshProps) {
  const {
    alerts = EMPTY_ALERTS,
    incidents = EMPTY_INCIDENTS,
    loading,
    error,
    refetch,
    hasEventCounts = false,
    topologyLinks = EMPTY_TOPOLOGY,
    subscribersByResource,
    netcoolWebGuiUrl,
    onExecuteRemediation,
    forceNoWebGL,
    queryApi,
    metricQueries,
    initialView = '3d',
    layerScheme: initialLayerScheme,
    part,
  } = props;

  return { initialLayerScheme: isSchemeId(initialLayerScheme) ? initialLayerScheme : DEFAULT_SCHEME, alerts, error, forceNoWebGL, hasEventCounts, incidents, initialView, loading, metricQueries, netcoolWebGuiUrl, onExecuteRemediation, part, queryApi, refetch, subscribersByResource, topologyLinks };
}
