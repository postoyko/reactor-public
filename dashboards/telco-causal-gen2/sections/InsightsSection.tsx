/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Activity, Diagram, Layers } from '@carbon/icons-react';
import { Button, Tag } from '@carbon/react';
import TriageInsights from '../TriageInsights';
import SunburstTreemap from '../SunburstTreemap';
import AlertSwimlane from '../AlertSwimlane';
import LinkExplorer from '../LinkExplorer';
import { useMesh } from '../MeshContext';

export function InsightsSection(): JSX.Element {
  const { activeIncidentId, handleFocusNode, handleSelectIncident, incidents, links3D, nodes3D, probeColorOf, problemFilter, sankeyRef, sankeyTooltip, selectedNodeId, selectedProbeFilter, selectedSankeyNodeId, setProblemFilter, setSelectedLink, setSelectedProbeFilter, setSelectedSankeyNodeId, setTimeWindow, setTopPanelView, swimlanes, tierHierarchy, timeWindow, topPanelView, triageModel } = useMesh();
  return (
    <div className="sankey-panel-full">
      <div className="sankey-header">
        <div className="sankey-title">
          {topPanelView === 'sankey' ? (
            <>
              <Diagram size={20} />
              <span>Active Signal Trajectory Lineage (Click any Stage to Isolate Path)</span>
            </>
          ) : topPanelView === 'triage' ? (
            <>
              <Activity size={20} style={{ color: '#0f62fe' }} />
              <span>Triage insights: what keeps happening, what is not handled</span>
            </>
          ) : topPanelView === 'sunburst' ? (
            <>
              <Layers size={20} />
              <span>Where the pain is: tier (est.) → topology group → resource, sized by alert count</span>
            </>
          ) : topPanelView === 'swimlane' ? (
            <>
              <Activity size={20} />
              <span>Alert Timeline by Resource (drag to filter the mesh to a time window)</span>
            </>
          ) : (
            <>
              <Diagram size={20} />
              <span>Link Explorer: how resources connect, by tier (est.)</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedProbeFilter && (
            <Tag
              filter
              type="cyan"
              title="Click to clear probe filter"
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedProbeFilter(null)}
              onClose={() => setSelectedProbeFilter(null)}
            >
              Probe Filter: {selectedProbeFilter} (✕ Clear)
            </Tag>
          )}

          {selectedSankeyNodeId && topPanelView === 'sankey' && (
            <Tag
              filter
              type="cyan"
              title="Click to clear Sankey path filter"
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedSankeyNodeId(null)}
              onClose={() => setSelectedSankeyNodeId(null)}
            >
              Path Filter: {selectedSankeyNodeId.replace(/^(src|dom|inc|pol)-/, '')} (✕ Clear)
            </Tag>
          )}

          {/* View Switcher Tabs */}
          <div className="top-view-switcher">
            <Button
              size="sm"
              kind={topPanelView === 'sankey' ? 'primary' : 'ghost'}
              renderIcon={Diagram}
              onClick={() => setTopPanelView('sankey')}
            >
              Sankey Lineage
            </Button>
            <Button
              size="sm"
              kind={topPanelView === 'triage' ? 'primary' : 'ghost'}
              renderIcon={Activity}
              onClick={() => setTopPanelView('triage')}
            >
              Triage Insights
            </Button>
            <Button size="sm" kind={topPanelView === 'sunburst' ? 'primary' : 'ghost'} renderIcon={Layers} onClick={() => setTopPanelView('sunburst')}>
              Sunburst / Treemap
            </Button>
            <Button size="sm" kind={topPanelView === 'swimlane' ? 'primary' : 'ghost'} renderIcon={Activity} onClick={() => setTopPanelView('swimlane')}>
              Alert Timeline
            </Button>
            <Button size="sm" kind={topPanelView === 'adjacency' ? 'primary' : 'ghost'} renderIcon={Diagram} onClick={() => setTopPanelView('adjacency')}>
              Link Explorer
            </Button>
          </div>
        </div>
      </div>

      {topPanelView === 'sankey' ? (
        <div className="sankey-svg-wrapper" style={{ position: 'relative' }}>
          <svg ref={sankeyRef} />
          {sankeyTooltip && (
            <div
              className="sankey-tooltip-box"
              style={{ left: `${sankeyTooltip.x}px`, top: `${sankeyTooltip.y}px` }}
            >
              {sankeyTooltip.text}
            </div>
          )}
        </div>
      ) : topPanelView === 'triage' ? (
        <TriageInsights
          model={triageModel}
          selectedProbe={selectedProbeFilter}
          onSelectProbe={setSelectedProbeFilter}
          activeFilter={problemFilter ? problemFilter.label : null}
          onFilterNodes={(label, ids) => setProblemFilter({ label, nodeIds: new Set(ids) })}
          onClearFilter={() => setProblemFilter(null)}
          onSelectNode={id => { const n = nodes3D.find(x => x.id === id); if (n) handleFocusNode(n); }}
          onSelectIncident={id => { const inc = incidents.find(x => x.id === id); if (inc && activeIncidentId !== inc.id) handleSelectIncident(inc); }}
        />
      ) : topPanelView === 'sunburst' ? (
        <SunburstTreemap data={tierHierarchy} selectedNodeId={selectedNodeId} onSelectNode={id => { const n = nodes3D.find(x => x.id === id); if (n) handleFocusNode(n); }} />
      ) : topPanelView === 'swimlane' ? (
        <AlertSwimlane
          model={swimlanes}
          brush={timeWindow}
          onBrush={setTimeWindow}
          selectedNodeId={selectedNodeId}
          onSelectNode={id => { const n = nodes3D.find(x => x.id === id); if (n) handleFocusNode(n); }}
          probeColor={probeColorOf}
        />
      ) : (
        <LinkExplorer
          nodes={nodes3D}
          links={links3D}
          selectedNodeId={selectedNodeId}
          onSelectNode={id => { const n = nodes3D.find(x => x.id === id); if (n) handleFocusNode(n); }}
          onSelectLink={setSelectedLink}
        />
      )}
    </div>
  );
}
