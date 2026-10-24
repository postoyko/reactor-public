/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import './set-nonce';
import getReactRenderer from '@ibm/akora-renderer-react';
import React from 'react';
import ReactDOM from 'react-dom/client';

const ReactRenderer = getReactRenderer(React, ReactDOM);

export const SimpleSamplePanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/sample.panel')
  }
};

export const AlertsWorkflowPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/alerts-workflow.panel')
  }
};

export const TopNPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/top-n.panel')
  }
};

export const TopNIncidentsPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/top-n-incidents.panel')
  }
};

export const ApplicationHeatmapPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/application-heatmap.panel')
  }
};

export const AlertsTimelinePanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/alerts-timeline-panel')
  }
};

export const IncidentsPieChart = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/incidents-pie-chart.panel')
  }
};

export const MonitorBoxes = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/monitor-boxes.panel'),
    stateToPropMapper: (state) => (
      {...state}
    )
  }
};

export const CognitiveDeepDivePanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/cognitive-deep-dive.panel')
  }
};

export const IncidentDashboardPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/incident-dashboard.panel')
  }
};

export const TelcoCommandCenterPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/telco-command.panel')
  }
};

export const TelcoCausalMeshPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/telco-causal.panel')
  }
};

export const TelcoCausalMeshGen2Panel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/telco-causal-gen2.panel')
  }
};

window.registerCustomPanel('hello-world', SimpleSamplePanel);
window.registerCustomPanel('alerts-workflow', AlertsWorkflowPanel);
window.registerCustomPanel('top-n', TopNPanel);
window.registerCustomPanel('top-n-incidents', TopNIncidentsPanel);
window.registerCustomPanel('application-heatmap', ApplicationHeatmapPanel);
window.registerCustomPanel('alerts-timeline', AlertsTimelinePanel);
window.registerCustomPanel('incidents-pie-chart', IncidentsPieChart);
window.registerCustomPanel('monitor-boxes', MonitorBoxes);
window.registerCustomPanel('cognitive-deep-dive-dashboard', CognitiveDeepDivePanel);
window.registerCustomPanel('incident-dashboard', IncidentDashboardPanel);
window.registerCustomPanel('telco-command-center-dashboard', TelcoCommandCenterPanel);
window.registerCustomPanel('telco-causal-mesh-dashboard', TelcoCausalMeshPanel);
window.registerCustomPanel('telco-causal-mesh-gen2-dashboard', TelcoCausalMeshGen2Panel);





export const DashboardBuilderPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/dashboard-builder.panel')
  }
};
window.registerCustomPanel('dashboard-builder', DashboardBuilderPanel);

export const Studiotest1Panel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/studiotest1.panel')
  }
};
window.registerCustomPanel('studiotest1-dashboard', Studiotest1Panel);

export const ItestPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/itest.panel')
  }
};
window.registerCustomPanel('itest-dashboard', ItestPanel);

export const BlastRadiusPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/blast-radius.panel')
  }
};
window.registerCustomPanel('blast-radius', BlastRadiusPanel);

export const IncidentAtlasPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/incident-atlas.panel')
  }
};
window.registerCustomPanel('incident-atlas', IncidentAtlasPanel);

export const ForceGraph3DPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/force-graph-3d.panel'),
    // Route `state` (linkBy, maxNodes, refreshSeconds) is passed through as props.
    stateToPropMapper: (state) => (
      {...state}
    )
  }
};
window.registerCustomPanel('force-graph-3d', ForceGraph3DPanel);

export const ThreeDForceSamplePanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/3df-sample.panel'),
    stateToPropMapper: (state) => (
      {...state}
    )
  }
};
window.registerCustomPanel('3df_sample', ThreeDForceSamplePanel);
window.registerCustomPanel('3df-sample', ThreeDForceSamplePanel);

export const LayoutIncidentAtlasLayout6Panel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-incident-atlas-layout-6.panel')
  }
};
window.registerCustomPanel('layout-incident-atlas-layout-6', LayoutIncidentAtlasLayout6Panel);

export const LayoutTplOperationsPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-operations.panel')
  }
};
window.registerCustomPanel('layout-tpl-operations', LayoutTplOperationsPanel);

export const LayoutTplTriagePanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-triage.panel')
  }
};
window.registerCustomPanel('layout-tpl-triage', LayoutTplTriagePanel);

export const LayoutTplExecutivePanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-executive.panel')
  }
};
window.registerCustomPanel('layout-tpl-executive', LayoutTplExecutivePanel);

export const LayoutTplIncidentsPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-incidents.panel')
  }
};
window.registerCustomPanel('layout-tpl-incidents', LayoutTplIncidentsPanel);

export const LayoutTplTelcoPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-telco.panel')
  }
};
window.registerCustomPanel('layout-tpl-telco', LayoutTplTelcoPanel);

export const LayoutTplWorkspacePanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-workspace.panel')
  }
};
window.registerCustomPanel('layout-tpl-workspace', LayoutTplWorkspacePanel);

export const LayoutTplNocPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-noc.panel')
  }
};
window.registerCustomPanel('layout-tpl-noc', LayoutTplNocPanel);

export const LayoutTplServicePanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-service.panel')
  }
};
window.registerCustomPanel('layout-tpl-service', LayoutTplServicePanel);

export const LayoutTplWorkbenchPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-workbench.panel')
  }
};
window.registerCustomPanel('layout-tpl-workbench', LayoutTplWorkbenchPanel);

export const LayoutTplWallPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-wall.panel')
  }
};
window.registerCustomPanel('layout-tpl-wall', LayoutTplWallPanel);

export const LayoutTplReportPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-report.panel')
  }
};
window.registerCustomPanel('layout-tpl-report', LayoutTplReportPanel);

export const LayoutTplHubPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-hub.panel')
  }
};
window.registerCustomPanel('layout-tpl-hub', LayoutTplHubPanel);

export const LayoutTplInsightPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-insight.panel')
  }
};
window.registerCustomPanel('layout-tpl-insight', LayoutTplInsightPanel);

export const LayoutTplGallery1Panel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-gallery1.panel')
  }
};
window.registerCustomPanel('layout-tpl-gallery1', LayoutTplGallery1Panel);

export const LayoutTplGallery2Panel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-gallery2.panel')
  }
};
window.registerCustomPanel('layout-tpl-gallery2', LayoutTplGallery2Panel);

export const LayoutTplStatusPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-status.panel')
  }
};
window.registerCustomPanel('layout-tpl-status', LayoutTplStatusPanel);

export const LayoutTplControlPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-control.panel')
  }
};
window.registerCustomPanel('layout-tpl-control', LayoutTplControlPanel);

export const LayoutTplIncdeskPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-incdesk.panel')
  }
};
window.registerCustomPanel('layout-tpl-incdesk', LayoutTplIncdeskPanel);

export const LayoutTplScorecardPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-scorecard.panel')
  }
};
window.registerCustomPanel('layout-tpl-scorecard', LayoutTplScorecardPanel);

export const LayoutTplIncidentopsPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-incidentops.panel')
  }
};
window.registerCustomPanel('layout-tpl-incidentops', LayoutTplIncidentopsPanel);

export const LayoutTplApphealthPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-apphealth.panel')
  }
};
window.registerCustomPanel('layout-tpl-apphealth', LayoutTplApphealthPanel);

export const LayoutTplMetricsPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-metrics.panel')
  }
};
window.registerCustomPanel('layout-tpl-metrics', LayoutTplMetricsPanel);

export const LayoutTplInsightsPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-insights.panel')
  }
};
window.registerCustomPanel('layout-tpl-insights', LayoutTplInsightsPanel);

export const OsmMapPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/osm-map.panel')
  }
};
window.registerCustomPanel('osm-map', OsmMapPanel);

export const LayoutTplActionsPanel = {
  renderer: ReactRenderer,
  state: {
    component: () => import('./panels/layout-tpl-actions.panel')
  }
};
window.registerCustomPanel('layout-tpl-actions', LayoutTplActionsPanel);
