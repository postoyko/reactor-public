/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertItem, LayoutMode, Link3DGen2, MetricSeries, Node3DGen2, RunbookPolicyInfo, StoryInsightsDetail, TopologyResourceDetails } from '../logic';
import { ColorMode, FilterMode, IDLE, QueryStatus } from '../types';
import { TimeWindow } from '../AlertSwimlane';
import { ReplayState } from '../ReplayBar';
import { LayerSchemeId, allLayersOn } from '../classification';
import { SceneHandle, detectWebGL } from '../scene3d';
import * as THREE from 'three';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshScope } from './useMeshScope';
import { useSessionState } from '../session/MeshSession';

export function useMeshUiState(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshScope>) {
  const { forceNoWebGL, initialView, initialLayerScheme, session, isHost } = m;
  // Cross-filter & control state
  const [isAboutOpen, setIsAboutOpen] = useSessionState(session, 'isAboutOpen', false);
  const [selectedNodeId, setSelectedNodeId] = useSessionState<string | null>(session, 'selectedNodeId', null);
  const [hovered, setHovered] = useState<{ node: Node3DGen2; x: number; y: number } | null>(null);
  const [selectedLink, setSelectedLink] = useSessionState<Link3DGen2 | null>(session, 'selectedLink', null);
  const [breadcrumbTrail, setBreadcrumbTrail] = useSessionState<Node3DGen2[]>(session, 'breadcrumbTrail', []);
  const [autoRotate, setAutoRotate] = useSessionState(session, 'autoRotate', true);
  const [layerSpacing] = useState<number>(100);
  const [filterMode] = useState<FilterMode>('all');
  const [colorMode, setColorMode] = useSessionState<ColorMode>(session, 'colorMode', 'deviceType');
  const [layoutMode, setLayoutMode] = useSessionState<LayoutMode>(session, 'layoutMode', 'stratified');
  const [showIllustrative, setShowIllustrative] = useSessionState(session, 'showIllustrative', false);
  const [topPanelView, setTopPanelView] = useSessionState<'sankey' | 'triage' | 'sunburst' | 'swimlane' | 'adjacency'>(session, 'topPanelView', 'sankey');
  const [problemFilter, setProblemFilter] = useSessionState<{ label: string; nodeIds: Set<string> } | null>(session, 'problemFilter', null);
  const [timeWindow, setTimeWindow] = useSessionState<TimeWindow | null>(session, 'timeWindow', null);
  const [replay, setReplay] = useSessionState<ReplayState>(session, 'replay', { mode: 'off', pos: 0, playing: false });
  const [replayOpen, setReplayOpen] = useSessionState(session, 'replayOpen', false);
  // Workspace rails (incident triage on the left, inspector on the right); the choice is remembered in this browser.
  const readRail = (key: string) => { try { return window.localStorage.getItem(key) !== '0'; } catch { return true; } };
  const [leftOpen, setLeftOpen] = useState<boolean>(() => readRail('telco-causal-mesh:rail-left'));
  const [rightOpen, setRightOpen] = useState<boolean>(() => readRail('telco-causal-mesh:rail-right'));
  const toggleRail = (side: 'left' | 'right') => {
    const key = `telco-causal-mesh:rail-${side}`;
    const set = side === 'left' ? setLeftOpen : setRightOpen;
    set(prev => { try { window.localStorage.setItem(key, prev ? '0' : '1'); } catch { /* storage unavailable */ } return !prev; });
  };
  const [selectedProbeFilter, setSelectedProbeFilter] = useSessionState<string | null>(session, 'selectedProbeFilter', null);
  const [isRoutingMode, setIsRoutingMode] = useSessionState<boolean>(session, 'isRoutingMode', false);
  const [routeSourceId, setRouteSourceId] = useSessionState<string | null>(session, 'routeSourceId', null);
  const [routeTargetId, setRouteTargetId] = useSessionState<string | null>(session, 'routeTargetId', null);
  const [activeIncidentId, setActiveIncidentId] = useSessionState<string | null>(session, 'activeIncidentId', null);
  const [incidentFilter, setIncidentFilter] = useSessionState<'all' | 'p1' | 'p2' | 'inProgress'>(session, 'incidentFilter', 'all');
  const [topologyHops, setTopologyHops] = useSessionState<number>(session, 'topologyHops', 0);
  const [layerScheme, setLayerSchemeState] = useSessionState<LayerSchemeId>(session, 'layerScheme', initialLayerScheme);
  const [activeLayers, setActiveLayers] = useSessionState<Record<number, boolean>>(session, 'activeLayers', allLayersOn());
  /** Switch the layer scheme; every layer of the new scheme starts visible, the cached positions are dropped and nodes are coloured by layer. */
  const setLayerScheme = (next: LayerSchemeId) => {
    if (next === layerScheme) return;
    positionCache.current = new Map();
    setActiveLayers(allLayersOn());
    if (next !== 'telco') setColorMode('strata'); // so the new layers show as colours straight away
    setLayerSchemeState(next);
  };
  const [selectedSankeyNodeId, setSelectedSankeyNodeId] = useSessionState<string | null>(session, 'selectedSankeyNodeId', null);
  const [sankeyTooltip, setSankeyTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useSessionState(session, 'isDrawerOpen', false);
  const [drawerNode, setDrawerNode] = useSessionState<Node3DGen2 | null>(session, 'drawerNode', null);
  const [activeDrawerTab, setActiveDrawerTab] = useSessionState(session, 'activeDrawerTab', 0);
  const [contextMenu, setContextMenu] = useSessionState<{ x: number; y: number; node: Node3DGen2 } | null>(session, 'contextMenu', null);
  // Real Toolkit Query State
  const [drawerTopologyDetails, setDrawerTopologyDetails] = useSessionState<TopologyResourceDetails | null>(session, 'drawerTopologyDetails', null);
  const [topologyStatus, setTopologyStatus] = useSessionState<QueryStatus>(session, 'topologyStatus', IDLE);
  const [drawerMetrics, setDrawerMetrics] = useSessionState<MetricSeries[]>(session, 'drawerMetrics', []);
  const [metricsStatus, setMetricsStatus] = useSessionState<QueryStatus>(session, 'metricsStatus', IDLE);
  const [runbookStatus, setRunbookStatus] = useSessionState<QueryStatus>(session, 'runbookStatus', IDLE);
  const [drawerRunbookPolicies, setDrawerRunbookPolicies] = useSessionState<RunbookPolicyInfo[]>(session, 'drawerRunbookPolicies', []);
  const [activeStoryInsights, setActiveStoryInsights] = useSessionState<StoryInsightsDetail | null>(session, 'activeStoryInsights', null);
  const [activeRemediationAlert, setActiveRemediationAlert] = useSessionState<AlertItem | null>(session, 'activeRemediationAlert', null);
  const [terminalLogs, setTerminalLogs] = useSessionState<string[]>(session, 'terminalLogs', []);
  const [isExecutingRemediation, setIsExecutingRemediation] = useSessionState(session, 'isExecutingRemediation', false);
  const [executedPolicies, setExecutedPolicies] = useSessionState<Record<string, 'done' | 'simulated'>>(session, 'executedPolicies', {});
  const [glLost, setGlLost] = useState(false);
  const [glEpoch, setGlEpoch] = useState(0);
  const [glError, setGlError] = useState<string | null>(null);
  const webgl = useMemo(
    () => (forceNoWebGL ? { ok: false, reason: 'WebGL was disabled by the host application.' } : detectWebGL()),
    [forceNoWebGL]
  );
  const webglOk = webgl.ok && !glError;
  // 3D <-> 2D. The 3D scene (renderer, GPU buffers, render loop) exists only while the 3D view is shown, so
  // switching to 2D releases the GPU and switching back rebuilds the scene from the cached positions.
  const [viewMode, setViewMode] = useState<'2d' | '3d'>(initialView);
  const view: '2d' | '3d' = webglOk ? viewMode : '2d';
  const [hovered2DId, setHovered2DId] = useState<string | null>(null);
  // Camera
  const sphericalRef = session.ref('camera.spherical', () => new THREE.Spherical(470, Math.PI / 3, Math.PI / 4.2));
  const targetLookAtRef = session.ref('camera.target', () => new THREE.Vector3(0, 0, 0));
  const currentLookAtRef = session.ref('camera.current', () => new THREE.Vector3(0, 0, 0));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sankeyRef = useRef<SVGSVGElement | null>(null);
  const radarRef = useRef<SVGSVGElement | null>(null);
  const sparklineRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const positionCache = session.ref('graph.positions', () => new Map<string, { x: number; y: number; z: number }>());
  const remediationTimers = session.ref<number[]>('remediation.timers', () => []);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Remediation timers belong to the session: only the last component to leave it clears them.
      if (session.size === 0) {
        remediationTimers.current.forEach(t => window.clearTimeout(t));
        remediationTimers.current = [];
      }
    };
  }, []);

  return { isHost, session, activeDrawerTab, activeIncidentId, activeLayers, layerScheme, setLayerScheme, activeRemediationAlert, activeStoryInsights, autoRotate, breadcrumbTrail, canvasRef, colorMode, contextMenu, currentLookAtRef, drawerMetrics, drawerNode, drawerRunbookPolicies, drawerTopologyDetails, executedPolicies, filterMode, glEpoch, glError, glLost, hovered, hovered2DId, incidentFilter, isAboutOpen, isDrawerOpen, isExecutingRemediation, isRoutingMode, layerSpacing, layoutMode, leftOpen, metricsStatus, mountedRef, positionCache, problemFilter, radarRef, remediationTimers, replay, replayOpen, rightOpen, routeSourceId, routeTargetId, sankeyRef, sankeyTooltip, sceneRef, selectedLink, selectedNodeId, selectedProbeFilter, selectedSankeyNodeId, setActiveDrawerTab, setActiveIncidentId, setActiveLayers, setActiveRemediationAlert, setActiveStoryInsights, setAutoRotate, setBreadcrumbTrail, setColorMode, setContextMenu, setDrawerMetrics, setDrawerNode, setDrawerRunbookPolicies, setDrawerTopologyDetails, setExecutedPolicies, setGlEpoch, setGlError, setGlLost, setHovered, setHovered2DId, setIncidentFilter, setIsAboutOpen, setIsDrawerOpen, setIsExecutingRemediation, setIsRoutingMode, setLayoutMode, setMetricsStatus, setProblemFilter, setReplay, setReplayOpen, setRouteSourceId, setRouteTargetId, setRunbookStatus, setSankeyTooltip, setSelectedLink, setSelectedNodeId, setSelectedProbeFilter, setSelectedSankeyNodeId, setShowIllustrative, setTerminalLogs, setTimeWindow, setTopPanelView, setTopologyHops, setTopologyStatus, setViewMode, showIllustrative, sparklineRef, sphericalRef, targetLookAtRef, terminalLogs, timeWindow, toggleRail, topPanelView, topologyHops, topologyStatus, view, webgl, webglOk };
}
