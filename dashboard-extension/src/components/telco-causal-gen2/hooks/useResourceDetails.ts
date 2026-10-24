/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { IDLE, QueryStatus } from '../types';
import { MetricSeries, adaptMetricManagerData, adaptRunbooksAndPolicy, adaptStoryAlertsInsights, adaptTopologyResource } from '../logic';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshUiState } from './useMeshUiState';

export function useResourceDetails(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshUiState>) {
  const { isHost, activeIncidentId, drawerNode, metricQueries, queryApi, setActiveStoryInsights, setDrawerMetrics, setDrawerRunbookPolicies, setDrawerTopologyDetails, setMetricsStatus, setRunbookStatus, setTopologyStatus } = m;
  // ── Resource details from the toolkit's queries (drawer open / incident selected) ──

  const queryApiRef = useRef(queryApi);
  queryApiRef.current = queryApi;
  const metricQueriesKey = JSON.stringify(metricQueries || []);
  const callApi = async (name: string, options: Record<string, unknown>) => {
    const api = queryApiRef.current;
    if (!api) throw new Error('No query API is connected to this panel.');
    const res = await api(name, options);
    if (res && Array.isArray(res.errors) && res.errors.length > 0) {
      throw new Error(String(res.errors[0]?.message || `${name} returned an error`));
    }
    return res;
  };
  const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
  // Queries run once per session, in the host, whichever tile opened the drawer.
  useEffect(() => {
    if (!isHost) return undefined;
    if (!drawerNode) {
      setDrawerTopologyDetails(null);
      setDrawerMetrics([]);
      setDrawerRunbookPolicies([]);
      setTopologyStatus(IDLE);
      setMetricsStatus(IDLE);
      setRunbookStatus(IDLE);
      return undefined;
    }
    let live = true;
    const unavailable: QueryStatus = { state: 'unavailable', message: 'No query API is connected to this panel.' };

    // 1. Topology resource (entity types, properties)
    setDrawerTopologyDetails(null);
    if (!queryApiRef.current) {
      setTopologyStatus(unavailable);
    } else {
      setTopologyStatus({ state: 'loading' });
      callApi('getTopologyResource', { resourceId: drawerNode.uniqueId || drawerNode.id })
        .then(res => {
          if (!live) return;
          const details = adaptTopologyResource(res);
          setDrawerTopologyDetails(details);
          setTopologyStatus(details ? { state: 'ok' } : { state: 'empty', message: 'The topology service returned no resource for this id.' });
        })
        .catch(e => { if (live) setTopologyStatus({ state: 'error', message: messageOf(e) }); });
    }

    // 2. Metrics: only the ones the host configured
    setDrawerMetrics([]);
    const configured: Array<{ group: string; metric: string; label?: string }> = JSON.parse(metricQueriesKey);
    if (!queryApiRef.current) {
      setMetricsStatus(unavailable);
    } else if (configured.length === 0) {
      setMetricsStatus({ state: 'idle', message: 'No metrics are configured. Set `metricQueries` ([{ group, metric }]) in the route state.' });
    } else {
      setMetricsStatus({ state: 'loading' });
      const endTime = Date.now();
      Promise.allSettled(configured.map(mq => callApi('getMetricManagerData', {
        resource: drawerNode.name, group: mq.group, metric: mq.metric, startTime: endTime - 3600 * 1000, endTime
      }))).then(results => {
        if (!live) return;
        const series: MetricSeries[] = [];
        const failures: string[] = [];
        results.forEach((res, i) => {
          if (res.status === 'rejected') { failures.push(messageOf(res.reason)); return; }
          adaptMetricManagerData(res.value).forEach(s => series.push({ ...s, metricName: configured[i].label || s.metricName }));
        });
        setDrawerMetrics(series);
        if (series.length > 0) setMetricsStatus({ state: 'ok', message: failures.length ? `${failures.length} of ${configured.length} queries failed: ${failures[0]}` : undefined });
        else if (failures.length > 0) setMetricsStatus({ state: 'error', message: failures[0] });
        else setMetricsStatus({ state: 'empty', message: 'The queries succeeded but returned no data points for this resource in the last hour.' });
      });
    }

    // 3. Runbook and policy names (only with a real policy id)
    setDrawerRunbookPolicies([]);
    const rbIds = drawerNode.runbooks.map((r: any) => r?.runbookId).filter(Boolean);
    const polId = drawerNode.runbooks.find((r: any) => r?.policyId)?.policyId;
    if (!polId || !queryApiRef.current) {
      setRunbookStatus(IDLE);
    } else {
      setRunbookStatus({ state: 'loading' });
      callApi('getRunbooksAndPolicy', { runbookIds: rbIds, policyId: polId, includePolicy: true, includePolicies: true, includeRunbooks: true })
        .then(res => {
          if (!live) return;
          const list = adaptRunbooksAndPolicy(res);
          setDrawerRunbookPolicies(list);
          setRunbookStatus(list.length ? { state: 'ok' } : { state: 'empty' });
        })
        .catch(e => { if (live) setRunbookStatus({ state: 'error', message: messageOf(e) }); });
    }
    return () => { live = false; };
  }, [isHost, drawerNode, metricQueriesKey]);
  // Probable-cause score for the selected incident (shown only when the query returns a real score)
  useEffect(() => {
    if (!isHost) return undefined;
    setActiveStoryInsights(null);
    if (!activeIncidentId || !queryApiRef.current) return undefined;
    let live = true;
    callApi('getStoryAlertsInsights', { storyId: activeIncidentId })
      .then(res => { if (live) setActiveStoryInsights(adaptStoryAlertsInsights(res, activeIncidentId)); })
      .catch(() => { /* optional decoration; the card simply shows no score */ });
    return () => { live = false; };
  }, [isHost, activeIncidentId]);

}
