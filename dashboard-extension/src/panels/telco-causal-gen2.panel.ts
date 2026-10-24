/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '../helpers/useQuery';
import { ALERT_QUERY_PARAMS, INCIDENT_QUERY_PARAMS } from '../components/constants';
import createPanel from '../app/createPanel';
import TelcoCausalMeshGen2Dashboard from '../components/telco-causal-gen2/TelcoCausalMeshGen2Dashboard';
import { adaptAlerts, adaptIncidents } from '../components/telco-causal-gen2/logic';
import { useSharedMeshFeed } from '../components/telco-causal-gen2/feed';

// useQuery re-runs when its options object changes, so these must be stable module-level objects.
const BASE_ALERT_PARAMS = ALERT_QUERY_PARAMS;
// UNVERIFIED: the GraphQL column name for the deduplicated event count. It is opt-in (route state `includeEventCount`)
// so that a wrong name cannot break the default query. Without it, deduplication figures show n/a.
const ALERT_PARAMS_WITH_EVENT_COUNT = { ...ALERT_QUERY_PARAMS, columns: [...ALERT_QUERY_PARAMS.columns, 'eventCount'] };

/**
 * Props (all optional, set from the route's `state`):
 *  - refreshSeconds          poll both queries every N seconds (0 disables, the default)
 *  - includeEventCount       also request the `eventCount` column
 *  - topologyLinks           [{ source, target, relType?, latencyMs? }] real adjacencies between resource names
 *  - subscribersByResource   { "<resource>": <subscribers> } to size blast islands
 *  - netcoolWebGuiUrl        adds a "View in Netcool / WebGUI" item to the node menu
 *  - tenantId                tenant for the drawer's on-demand queries (default: the toolkit sample tenant, so SET IT)
 *  - metricQueries           [{ group, metric, label? }] metrics to chart in the drawer. Group/metric names are
 *                            installation specific (see getMetricGroups / getMetrics), so none are guessed.
 *  - part                    show one region only: header, incidents, topology, insights, alarms, blast, ingest or
 *                            remediation. Every panel with a `part` shares one alert query, one incident query, one
 *                            refresh timer and one selection (see components/telco-causal-gen2/feed.ts). Used by
 *                            Concert Workbench's section tiles. Without it the whole dashboard is drawn, as before.
 *
 * UNVERIFIED against a live cluster: the response shapes of getTopologyResource, getMetricManagerData,
 * getRunbooksAndPolicy and getStoryAlertsInsights. The adapters return nothing rather than invent data.
 */
const MeshFullPanel = (props: any) => {
  const alertQuery = useQuery<any>('getAlerts', props.includeEventCount ? ALERT_PARAMS_WITH_EVENT_COUNT : BASE_ALERT_PARAMS);
  const incidentQuery = useQuery<any>('getStories', INCIDENT_QUERY_PARAMS);

  const adaptedAlerts = useMemo(() => adaptAlerts(alertQuery.data), [alertQuery.data]);
  const incidents = useMemo(() => adaptIncidents(incidentQuery.data), [incidentQuery.data]);

  const refetchAll = () => {
    alertQuery.refetch();
    incidentQuery.refetch();
  };
  const refetchRef = useRef(refetchAll);
  refetchRef.current = refetchAll;

  const refreshSeconds = Number(props.refreshSeconds) || 0;
  useEffect(() => {
    if (refreshSeconds <= 0) return undefined;
    const timer = window.setInterval(() => refetchRef.current(), refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [refreshSeconds]);

  const tenantId = props.tenantId || ALERT_QUERY_PARAMS.tenantId;
  // Stable identity so the dashboard's effects do not re-run on every render.
  const queryApi = useCallback((name: string, options: Record<string, unknown>) => {
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.[name];
    if (typeof fn !== 'function') return Promise.reject(new Error(`The ${name} query is not available in this environment.`));
    return fn({ tenantId, ...options });
  }, [tenantId]);

  return React.createElement(TelcoCausalMeshGen2Dashboard, {
    alerts: adaptedAlerts.alerts,
    hasEventCounts: adaptedAlerts.hasEventCounts,
    incidents,
    loading: Boolean(alertQuery.loading || incidentQuery.loading),
    error: alertQuery.error || incidentQuery.error,
    refetch: refetchAll,
    topologyLinks: props.topologyLinks,
    subscribersByResource: props.subscribersByResource,
    netcoolWebGuiUrl: props.netcoolWebGuiUrl,
    queryApi,
    metricQueries: props.metricQueries,
    initialView: props.initialView,
    layerScheme: props.layerScheme,
  });
};

// One region of the dashboard (the `part` option). Data comes from a feed shared by every part on the page.
const FEED_KEYS = { base: 'telco-causal-gen2', withEventCount: 'telco-causal-gen2+eventCount' };
const MeshPartPanel = (props: any) => {
  const withEventCount = Boolean(props.includeEventCount);
  const feed = useSharedMeshFeed(
    withEventCount
      ? { key: FEED_KEYS.withEventCount, alertParams: ALERT_PARAMS_WITH_EVENT_COUNT, incidentParams: INCIDENT_QUERY_PARAMS }
      : { key: FEED_KEYS.base, alertParams: BASE_ALERT_PARAMS, incidentParams: INCIDENT_QUERY_PARAMS },
    Number(props.refreshSeconds) || 0
  );

  const tenantId = props.tenantId || ALERT_QUERY_PARAMS.tenantId;
  const queryApi = useCallback((name: string, options: Record<string, unknown>) => {
    const fn = (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI?.[name];
    if (typeof fn !== 'function') return Promise.reject(new Error(`The ${name} query is not available in this environment.`));
    return fn({ tenantId, ...options });
  }, [tenantId]);

  return React.createElement(TelcoCausalMeshGen2Dashboard, {
    alerts: feed.alerts,
    hasEventCounts: feed.hasEventCounts,
    incidents: feed.incidents,
    loading: feed.loading,
    error: feed.error,
    refetch: feed.refetch,
    topologyLinks: props.topologyLinks,
    subscribersByResource: props.subscribersByResource,
    netcoolWebGuiUrl: props.netcoolWebGuiUrl,
    queryApi,
    metricQueries: props.metricQueries,
    initialView: props.initialView,
    layerScheme: props.layerScheme,
    part: props.part,
  });
};

const TelcoCausalMeshPanel = (props: any) =>
  props.part ? React.createElement(MeshPartPanel, props) : React.createElement(MeshFullPanel, props);

export default createPanel(TelcoCausalMeshPanel);
