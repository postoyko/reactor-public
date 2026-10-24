/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { useQuery } from '../helpers/useQuery';
import { ALERT_QUERY_PARAMS, INCIDENT_QUERY_PARAMS } from '../components/constants';
import createPanel from '../app/createPanel';
import ThreeDForceSampleDashboard from '../components/3df-sample/ThreeDForceSampleDashboard';

const ThreeDForceSamplePanel = (props: any) => {
  const alertsQuery = useQuery<any>('getAlerts', ALERT_QUERY_PARAMS);
  const storiesQuery = useQuery<any>('getStories', INCIDENT_QUERY_PARAMS);

  const refetchAll = () => {
    alertsQuery.refetch();
    storiesQuery.refetch();
  };
  const refetchRef = useRef(refetchAll);
  refetchRef.current = refetchAll;

  const refreshSeconds = Number(props.refreshSeconds) || 0;
  useEffect(() => {
    if (refreshSeconds <= 0) return undefined;
    const timer = window.setInterval(() => refetchRef.current(), refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [refreshSeconds]);

  return React.createElement(ThreeDForceSampleDashboard, {
    alertsData: alertsQuery.data,
    storiesData: storiesQuery.data,
    loading: Boolean(alertsQuery.loading || storiesQuery.loading),
    error: alertsQuery.error || storiesQuery.error,
    refetch: refetchAll,
    initialLinkBy: props.linkBy,
    maxNodes: props.maxNodes,
    refreshSeconds: props.refreshSeconds,
    ...props
  });
};

export default createPanel(ThreeDForceSamplePanel);
