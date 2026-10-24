/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useQuery } from '../helpers/useQuery';
import { ALERT_QUERY_PARAMS } from '../components/constants';
import createPanel from '../app/createPanel';
import ForceGraph3DView from '../components/force-graph-3d/ForceGraph3DView';

const ForceGraph3DPanel = (props: any) => {
  const query = useQuery('getAlerts', ALERT_QUERY_PARAMS);
  return React.createElement(ForceGraph3DView, { ...props, ...query });
};

export default createPanel(ForceGraph3DPanel);
