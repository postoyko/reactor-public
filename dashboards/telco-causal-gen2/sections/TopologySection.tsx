/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChartNetwork, EdgeNodeAlt, Layers, RouterWifi, ServerDns, TransmissionLte } from '@carbon/icons-react';
import { SCHEMES } from '../classification';
import TopologyToolbar from '../TopologyToolbar';
import { Button, InlineNotification, Tag } from '@carbon/react';
import { formatDateTime, formatTime } from '../insight-utils';
import { severityHex, severityInk } from '../severity';
import ReplayBar from '../ReplayBar';
import TopologyCanvas2D from '../TopologyCanvas2D';
import React from 'react';
import { useMesh } from '../MeshContext';

export function TopologySection(): JSX.Element {
  const { layerScheme, liveTypesStatus, setLayerScheme, activeLayers, activeRouteInfo, activeRoutePath, autoRotate, blastHop, blastMaxHop, breadcrumbTrail, canvasRef, changeLayout, changeView, colorMode, effectiveActiveNodeIds, filterMode, glError, glLost, handleFocusNode, handleOpenDeepDive, hasTopology, hovered, hovered2DId, incidentBlastContext, isDrawerOpen, isRoutingMode, layoutMode, links3D, nodeColor2D, nodes3D, problemFilter, replay, replayNodeIds, replayOpen, replayScopeNodes, replayTime, replayTimeDomain, routeNotFound, routeSourceId, routeTargetId, selectedNodeData, selectedNodeId, selectedNodeSpofReport, setActiveIncidentId, setActiveLayers, setAutoRotate, setBreadcrumbTrail, setColorMode, setContextMenu, setDrawerNode, setHovered2DId, setIsRoutingMode, setProblemFilter, setReplay, setReplayOpen, setRouteSourceId, setRouteTargetId, setSelectedLink, setSelectedNodeId, setSelectedSankeyNodeId, setShowIllustrative, setTimeWindow, setTopologyHops, showIllustrative, sphericalRef, spofAnalysis, targetLookAtRef, timeWindow, timeWindowNodeIds, topoLinks, topologyHops, view, webgl, webglOk } = useMesh();
  return (
    <div className="force3d-panel" style={{ marginBottom: 0 }}>
      <div className="force3d-header">
        <div className="force3d-title">
          <Layers size={18} />
          {view === '3d'
            ? 'Interactive 3D Multi-Layer Stratified Topology Mesh (ASM Crawler & SPOF Engine)'
            : 'Structural 2D Topology Canvas (tiers, hop rings, pods)'}
        </div>
      </div>

      <TopologyToolbar
        view={view}
        webglOk={webglOk}
        webglReason={glError || webgl.reason}
        onView={changeView}
        lens={colorMode}
        onLens={setColorMode}
        layout={layoutMode}
        onLayout={changeLayout}
        layerScheme={layerScheme}
        onLayerScheme={setLayerScheme}
        activeLayers={activeLayers}
        onToggleLayer={layer => setActiveLayers(prev => ({ ...prev, [layer]: !prev[layer] }))}
        topologyHops={topologyHops}
        onHops={setTopologyHops}
        hasTopology={hasTopology}
        routeActive={isRoutingMode}
        routeHasPath={Boolean(activeRoutePath)}
        routeLabel={
          isRoutingMode
            ? !routeSourceId ? '1. Click source' : !routeTargetId ? '2. Click target' : 'Route active (reset)'
            : 'Trace route'
        }
        onToggleRoute={() => {
          if (isRoutingMode) {
            setIsRoutingMode(false);
            setRouteSourceId(null);
            setRouteTargetId(null);
          } else {
            setIsRoutingMode(true);
          }
        }}
        replayOpen={replayOpen}
        replayActive={replay.mode !== 'off'}
        onToggleReplay={() => {
          if (replayOpen || replay.mode !== 'off') {
            setReplayOpen(false);
            setReplay({ mode: 'off', pos: 0, playing: false });
          } else {
            setReplayOpen(true);
          }
        }}
        showIllustrative={showIllustrative}
        onToggleIllustrative={() => setShowIllustrative(v => !v)}
        autoRotate={autoRotate}
        onToggleAutoRotate={() => setAutoRotate(v => !v)}
        onCamera={preset => {
          const sph = sphericalRef.current;
          if (preset === 'iso') { sph.radius = 470; sph.phi = Math.PI / 3; sph.theta = Math.PI / 4.2; }
          else if (preset === 'profile') { sph.radius = 490; sph.phi = Math.PI / 2; sph.theta = 0; }
          else { sph.radius = 460; sph.phi = 0.05; sph.theta = 0; }
          targetLookAtRef.current.set(0, 0, 0);
        }}
        chipCount={[selectedNodeData, selectedNodeSpofReport?.isCutVertex, activeRoutePath, incidentBlastContext, timeWindow, problemFilter].filter(Boolean).length}
        chips={(
          <>
          {selectedNodeData && (
            <Tag
              filter
              type="cyan"
              title="Click to clear focused node"
              style={{ cursor: 'pointer' }}
              onClick={() => { setSelectedNodeId(null); targetLookAtRef.current.set(0, 0, 0); }}
              onClose={() => { setSelectedNodeId(null); targetLookAtRef.current.set(0, 0, 0); }}
            >
              Focused NE: {selectedNodeData.name} ({selectedNodeData.layerName})
            </Tag>
          )}

          {selectedNodeSpofReport?.isCutVertex && (
            <Tag
              filter
              type="red"
              title="Click to clear SPOF blast island isolation"
              style={{ cursor: 'pointer' }}
              onClick={() => { setSelectedNodeId(null); targetLookAtRef.current.set(0, 0, 0); }}
              onClose={() => { setSelectedNodeId(null); targetLookAtRef.current.set(0, 0, 0); }}
            >
              SPOF Blast Island: {selectedNodeSpofReport.blastNodeCount} NEs Severed
            </Tag>
          )}

          {activeRoutePath && (
            <Tag
              filter
              type="teal"
              title="Click to clear route tracer"
              style={{ cursor: 'pointer' }}
              onClick={() => { setRouteSourceId(null); setRouteTargetId(null); setIsRoutingMode(false); }}
              onClose={() => { setRouteSourceId(null); setRouteTargetId(null); setIsRoutingMode(false); }}
            >
              Route: {activeRoutePath[0].name} ➔ {activeRoutePath[activeRoutePath.length - 1].name} ({activeRoutePath.length - 1} Hops)
            </Tag>
          )}

          {incidentBlastContext && (
            <Tag
              filter
              type="red"
              title="Click to clear incident blast isolation"
              style={{ cursor: 'pointer' }}
              onClick={() => { setActiveIncidentId(null); setSelectedSankeyNodeId(null); }}
              onClose={() => { setActiveIncidentId(null); setSelectedSankeyNodeId(null); }}
            >
              Incident Blast: {incidentBlastContext.incident.id.slice(0, 8)}... ({incidentBlastContext.incidentNodeNames.size} NEs)
            </Tag>
          )}

          {problemFilter && (
            <Tag
              filter
              type="purple"
              title="Click to clear the triage filter"
              style={{ cursor: 'pointer' }}
              onClick={() => setProblemFilter(null)}
              onClose={() => setProblemFilter(null)}
            >
              {problemFilter.label} ({problemFilter.nodeIds.size} NEs) (✕ Clear)
            </Tag>
          )}

          {timeWindow && (
            <Tag
              filter
              type="blue"
              title="Click to clear the time window"
              style={{ cursor: 'pointer' }}
              onClick={() => setTimeWindow(null)}
              onClose={() => setTimeWindow(null)}
            >
              Window: {formatTime(timeWindow.start)}–{formatTime(timeWindow.end)} ({timeWindowNodeIds ? timeWindowNodeIds.size : 0} NEs) (✕ Clear)
            </Tag>
          )}
          </>
        )}
      />

      {!webglOk && (

        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="3D view unavailable"
          subtitle={`${glError || webgl.reason || 'WebGL is not available.'} Showing the 2D view instead.`}
        />
      )}

      {(replayOpen || replay.mode !== 'off') && (<ReplayBar
        state={replay}
        onChange={setReplay}
        timeDisabledReason={replayTimeDomain ? undefined : 'Needs at least two different alert times in scope'}
        blastDisabledReason={!selectedNodeId ? 'Select an element first' : !hasTopology ? 'Needs topology links' : undefined}
        position={
          replay.mode === 'time' && replayTime !== null ? formatDateTime(replayTime)
            : replay.mode === 'blast' ? `hop ${blastHop} of ${blastMaxHop}` : undefined
        }
        summary={
          replayNodeIds
            ? replay.mode === 'time'
              ? `${replayNodeIds.size} of ${replayScopeNodes.length} elements reporting`
              : `${replayNodeIds.size} of ${nodes3D.length} elements reached`
            : undefined
        }
      />)}

      <div className={`force3d-canvas-container${view === '2d' ? ' is-2d' : ''}`}>
        {view === '3d' ? (
          <canvas ref={canvasRef} />
        ) : (
          <TopologyCanvas2D
            nodes={nodes3D}
            links={links3D}
            selectedNodeId={selectedNodeId}
            hoveredNodeId={hovered2DId}
            spofNodeIds={spofAnalysis.spofNodeIds}
            spofAvailable={hasTopology}
            activeRoutePath={activeRoutePath}
            activeLayers={activeLayers}
            filterMode={filterMode}
            focusNodeIds={effectiveActiveNodeIds}
            getNodeColor={nodeColor2D}
            isRoutingMode={isRoutingMode}
            routeSourceId={routeSourceId}
            routeTargetId={routeTargetId}
            onSelectNode={handleFocusNode}
            onHoverNode={n => setHovered2DId(n ? n.id : null)}
            onOpenDeepDive={handleOpenDeepDive}
            onSelectLink={setSelectedLink}
            onNodeContextMenu={(node, e) => setContextMenu({ x: e.clientX, y: e.clientY, node })}
            onSetRouteSource={id => {
              setRouteSourceId(id);
              if (routeTargetId) setRouteTargetId(null);
            }}
            onSetRouteTarget={setRouteTargetId}
          />
        )}
        {view === '3d' && glLost && (
          <div className="webgl-lost" style={{ position: 'absolute', top: 8, right: 8, background: '#fff1f1', border: '1px solid #da1e28', padding: '6px 10px', fontSize: '0.78rem' }}>
            GPU context lost, waiting for it to be restored…
          </div>
        )}

        {/* HUD Layer Stratum & ASM Topology Density Legend */}
        {view === '3d' && (
        <div className="hud-layers">
          <div className="topology-density-badge">
            {nodes3D.length} NEs | {topoLinks.length} topology links | {links3D.length - topoLinks.length} causal links | SPOFs: {hasTopology ? spofAnalysis.spofNodes.length : 'n/a'}
          </div>
          {layerScheme === 'telco' ? (
            <>
              <div className="hud-layer-item">
                <ServerDns size={14} style={{ color: '#a56eff' }} /> Layer 1: 5G Core Network (UPF, AMF, SMF)
              </div>
              <div className="hud-layer-item">
                <RouterWifi size={14} style={{ color: '#ff832b' }} /> Layer 2: IP Transport Fabric (routers, switches)
              </div>
              <div className="hud-layer-item">
                <TransmissionLte size={14} style={{ color: '#198038' }} /> Layer 3: RAN Edge (cells, gNodeB)
              </div>
              <div className="hud-layer-item">
                <EdgeNodeAlt size={14} style={{ color: '#0043ce' }} /> Layer 4: Subscribers &amp; Slices (anything not matched above)
              </div>
            </>
          ) : (
            SCHEMES[layerScheme].layers.map(def => {
              const members = nodes3D.filter(n => n.layer === def.id);
              return (
                <div className="hud-layer-item" key={def.id} title={def.blurb}>
                  <span style={{ color: def.color, display: 'inline-block', width: 14, textAlign: 'center' }}>{def.glyph}</span> {def.name} ({members.length})
                </div>
              );
            })
          )}
          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #e0e0e0', fontSize: '0.68rem', color: '#525252' }}>
            <span style={{ color: '#0f62fe' }}>● routesTo</span> &nbsp;
            <span style={{ color: '#0043ce' }}>● connectedTo</span> &nbsp;
            <span style={{ color: '#ba4e00' }}>● dependsOn</span> &nbsp;
            <span style={{ color: '#da1e28' }}>● causalUnion</span>
            <div style={{ marginTop: '4px' }}>{layerScheme === 'telco' ? 'Tiers are estimated from entity types, names and alert text.' : (() => {
              const by = (k: string) => nodes3D.filter(n => n.layerBasis === k).length;
              const src = (k: string) => nodes3D.filter(n => n.typeSource === k).length;
              return `By entity type ${by('type')}, name ${by('name')}, alert text ${by('text')}, unclassified ${by('default')}. Types from alerts ${src('insight')}, topology ${src('topology')}, none ${src('none')}.`;
            })()}</div>
            {layerScheme !== 'telco' && liveTypesStatus?.message && <div style={{ marginTop: '4px' }} title={liveTypesStatus.message}>{liveTypesStatus.message.length > 90 ? `${liveTypesStatus.message.slice(0, 90)}…` : liveTypesStatus.message}</div>}
          </div>
        </div>

        )}

        {/* Topological Navigation Breadcrumb Stack */}
        {breadcrumbTrail.length > 0 && (
          <div className="hud-breadcrumb-trail">
            <span className="breadcrumb-label"><ChartNetwork size={12} /> Trail:</span>
            <button
              type="button"
              className="breadcrumb-pill reset-pill"
              onClick={() => {
                setSelectedNodeId(null);
                targetLookAtRef.current.set(0, 0, 0);
                sphericalRef.current.radius = 320;
                setBreadcrumbTrail([]);
              }}
              title="Reset 3D Camera & Clear Trail"
            >
              Origin
            </button>
            {breadcrumbTrail.map((bNode, idx) => {
              const isLast = idx === breadcrumbTrail.length - 1;
              return (
                <React.Fragment key={bNode.id}>
                  <span className="breadcrumb-arrow">➔</span>
                  <button
                    type="button"
                    className={`breadcrumb-pill ${isLast ? 'active' : ''}`}
                    onClick={() => {
                      handleFocusNode(bNode);
                      if (isDrawerOpen) setDrawerNode(bNode);
                    }}
                    title={`Focus ${bNode.name} (${bNode.layerName})`}
                  >
                    {bNode.name.length > 15 ? bNode.name.slice(0, 14) + '…' : bNode.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Active Route Tracer HUD Banner */}
        {(isRoutingMode || activeRoutePath) && (
          <div className="route-tracer-hud">
            <div className="route-info">
              <span className="route-badge">Route Tracer</span>
              {activeRoutePath ? (
                <>
                  <span className="route-hops">
                    {activeRoutePath.map((n) => n.name).join(' ➔ ')}
                  </span>
                  <span className="route-metrics">
                    ({activeRouteInfo ? activeRouteInfo.hops : 0} hops | {activeRouteInfo && activeRouteInfo.latencyMs !== null ? `${activeRouteInfo.latencyMs.toFixed(1)} ms measured` : 'latency not measured'})
                  </span>
                </>
              ) : routeNotFound ? (
                <span className="route-hops">No path exists between these two nodes in the supplied topology.</span>
              ) : routeSourceId ? (
                <span className="route-hops">
                  Source Node: <strong style={{ color: '#0f62fe' }}>{routeSourceId}</strong> ➔ Click Destination Node in {view === '3d' ? '3D' : '2D'}...
                </span>
              ) : (
                <span className="route-hops">Click Any Node to Set Route Source</span>
              )}
            </div>
            <Button
              size="sm"
              kind="ghost"
              onClick={() => {
                setRouteSourceId(null);
                setRouteTargetId(null);
                setIsRoutingMode(false);
              }}
            >
              Clear Route
            </Button>
          </div>
        )}

        {/* Hover Tooltip HUD */}
        {hovered && (
          <div
            className="node-tooltip-hud"
            style={{
              left: `${Math.min(hovered.x + 15, 450)}px`,
              top: `${Math.min(hovered.y - 15, 320)}px`,
            }}
          >
            <div className="hud-node-title">{hovered.node.name}</div>
            <div className="hud-node-meta">Stratum: {hovered.node.layerName}</div>
            <div className="hud-node-meta">Active Alarms: {hovered.node.alertCount}</div>
            <div className="hud-node-meta">Entity types: {hovered.node.entityTypes.length ? hovered.node.entityTypes.join(', ') : 'n/a'}</div>
            {spofAnalysis.spofNodeIds.has(hovered.node.id) && (
              <div style={{ color: '#ff832b', fontWeight: 700, fontSize: '0.72rem', marginTop: '2px' }}>
                ⚠️ Single Point of Failure (cut vertex in the supplied topology)
              </div>
            )}
            <div
              className="hud-node-sev"
              style={{
                background: severityHex(hovered.node.severity),
                color: severityInk(hovered.node.severity),
              }}
            >
              Max Severity: Sev {hovered.node.severity}
            </div>
            {hovered.node.isProbableCause && (
              <div style={{ color: '#6929c4', fontWeight: 700, marginTop: '4px' }}>
                ★ AI Probable Cause Root
              </div>
            )}
            <div style={{ fontSize: '0.7rem', color: '#0f62fe', marginTop: '6px' }}>
              Right-Click for Deep Dive Diagnostics
            </div>
          </div>
        )}

        <div className="hud-instructions">
          Left-Click: Focus | Right-Click: Deep Dive | Scroll: Zoom
        </div>
      </div>
    </div>
  );
}
