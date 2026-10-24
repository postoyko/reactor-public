/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Button, Dropdown, InlineNotification, MultiSelect, Search, SkeletonText, Toggle } from '@carbon/react';

// @ts-ignore
import getReactRenderer from '@ibm/akora-renderer-react';

import ForceGraph3DRenderer, { ForceGraph3DHandle } from './ForceGraph3DRenderer';
import {
  AlertGraph,
  buildAlertGraph,
  buildFilterClause,
  DEFAULT_LINK_BY,
  focusSet,
  GraphNode,
  KIND_LABELS,
  LINK_DIMENSIONS,
  LinkDimension,
  preservePositions,
  severityLabel
} from './graph';
import { detectWebGL } from './webgl';
import { SEVERITIES } from '../constants';

import './force-graph-3d.scss';

const ReactRenderer = getReactRenderer(React, ReactDOM);
const { useAkoraState, setUrlParameters } = ReactRenderer.components;

const className = 'force-graph-3d';

const SEVERITY_ITEMS = SEVERITIES.map((label, value) => ({
  label: value === 0 ? 'All severities' : `${label} and above`,
  value
}));

export interface ForceGraph3DViewProps {
  /** `getAlerts` response (from the toolkit's useQuery hook). */
  data?: any;
  loading?: boolean;
  error?: any;
  refetch?: (options?: object) => void;
  /** Initial hub dimensions; can be set from the route's `state`. */
  linkBy?: LinkDimension[] | string;
  maxNodes?: number | string;
  /** Poll for fresh alerts every N seconds (0 disables). */
  refreshSeconds?: number | string;
  /** Test/story hook to force the non-WebGL fallback. */
  forceFallback?: boolean;
}

const asArray = (value: unknown): LinkDimension[] => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const valid = LINK_DIMENSIONS.map(d => d.value);
  const result = raw.map(v => String(v).trim()).filter((v): v is LinkDimension => (valid as string[]).includes(v));
  return result.length ? result : DEFAULT_LINK_BY;
};

const asNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const useAkora = (): { state?: any; app?: any } => {
  try {
    return useAkoraState() || {};
  } catch (e) {
    return {};
  }
};

const ForceGraph3DView = (props: ForceGraph3DViewProps) => {
  const { data, loading, error, refetch, forceFallback = false } = props;
  const maxNodes = asNumber(props.maxNodes, 1500);
  const refreshSeconds = Number(props.refreshSeconds) || 0;
  const { state, app } = useAkora();

  const [linkBy, setLinkBy] = useState<LinkDimension[]>(() => asArray(props.linkBy));
  const [minSeverity, setMinSeverity] = useState(SEVERITY_ITEMS[0]);
  const [search, setSearch] = useState('');
  const [showParticles, setShowParticles] = useState(true);
  const [paused, setPaused] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [gpuMessage, setGpuMessage] = useState<string | null>(null);

  const rendererRef = useRef<ForceGraph3DHandle>(null);
  const previousNodes = useRef<Map<string, GraphNode>>();
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const webgl = useMemo(() => (forceFallback ? { supported: false, version: 0 as const, reason: 'Fallback forced.' } : detectWebGL()), [forceFallback]);

  const alerts = data?.tenant?.alerts;

  const graph: AlertGraph = useMemo(() => {
    const built = buildAlertGraph(alerts?.rows, alerts?.columns, {
      linkBy,
      minSeverity: minSeverity.value,
      search,
      maxNodes
    });
    // Read-only use of the ref keeps this memo pure (safe under StrictMode double invocation).
    preservePositions(built.nodes, previousNodes.current);
    return built;
  }, [alerts, linkBy, minSeverity, search, maxNodes]);

  // Remember the committed layout (the force engine mutates these node objects in place).
  useEffect(() => {
    previousNodes.current = new Map(graph.nodes.map(n => [n.id, n]));
  }, [graph]);

  const focus = useMemo(() => focusSet(graph, hoverId || selectedId), [graph, hoverId, selectedId]);
  const selected = useMemo(() => graph.nodes.find(n => n.id === selectedId) || null, [graph, selectedId]);

  // Refresh with the rest of the console, matching the toolkit's other panels.
  useEffect(() => {
    const onRefresh = (e: MessageEvent) => {
      if (e.data === 'alertsrefresh' && e.origin === state?.clientConfiguration?.publicurl) {
        refetchRef.current?.();
      }
    };
    window.addEventListener('message', onRefresh, false);
    return () => window.removeEventListener('message', onRefresh);
  }, [state?.clientConfiguration?.publicurl]);

  useEffect(() => {
    if (refreshSeconds <= 0) return undefined;
    const timer = window.setInterval(() => refetchRef.current?.(), refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [refreshSeconds]);

  const applyAlertFilter = useCallback((whereClause: string | null) => {
    if (!app || !state) return;
    const route = setUrlParameters(state.resolvedFullPath || state.fullPath, {
      filtername: 'All alerts',
      filterwhereclause: whereClause
    });
    app.replaceRoute(route);
  }, [app, state]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    const next = node.id === selectedId ? null : node.id;
    setSelectedId(next);
    applyAlertFilter(next ? buildFilterClause(node) : null);
  }, [selectedId, applyAlertFilter]);

  // Clearing must also lift the alert-list filter, otherwise the list stays filtered to a node
  // the graph no longer shows as selected.
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    applyAlertFilter(null);
  }, [applyAlertFilter]);

  // A selection that disappears (severity/search filter, refresh) must release its alert filter too.
  useEffect(() => {
    if (selectedId && !graph.neighbors.has(selectedId)) clearSelection();
  }, [graph, selectedId, clearSelection]);

  const hasRows = (alerts?.rows?.length ?? 0) > 0;
  const initialLoad = loading && !data;
  const { stats } = graph;

  const renderControls = () => (
    <div className={`${className}__controls`}>
      <MultiSelect
        id={`${className}-link-by`}
        label='Group by'
        titleText=''
        type='inline'
        size='md'
        items={LINK_DIMENSIONS}
        itemToString={(item: any) => item?.label || ''}
        initialSelectedItems={LINK_DIMENSIONS.filter(d => linkBy.includes(d.value))}
        onChange={({ selectedItems }: any) => setLinkBy(selectedItems.length ? selectedItems.map((i: any) => i.value) : DEFAULT_LINK_BY)}
      />
      <Dropdown
        id={`${className}-severity`}
        items={SEVERITY_ITEMS}
        itemToString={(item: any) => item?.label || ''}
        label=''
        titleText=''
        type='inline'
        selectedItem={minSeverity}
        onChange={({ selectedItem }: any) => selectedItem && setMinSeverity(selectedItem)}
      />
      <Search
        id={`${className}-search`}
        size='md'
        labelText='Search resources'
        placeholder='Search resources, sources, teams'
        value={search}
        onChange={(e: any) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
      />
      <Toggle
        id={`${className}-particles`}
        size='sm'
        labelText='Flow'
        labelA='Off'
        labelB='On'
        toggled={showParticles}
        onToggle={(checked: boolean) => setShowParticles(checked)}
      />
      <Toggle
        id={`${className}-pause`}
        size='sm'
        labelText='Layout'
        labelA='Frozen'
        labelB='Live'
        toggled={!paused}
        onToggle={(checked: boolean) => setPaused(!checked)}
      />
      <Button kind='ghost' size='md' onClick={() => rendererRef.current?.zoomToFit()}>
        Fit view
      </Button>
      <Button kind='ghost' size='md' disabled={!selectedId} onClick={clearSelection}>
        Clear selection
      </Button>
    </div>
  );

  const renderStats = () => (
    <div className={`${className}__stats`} role='status' aria-live='polite'>
      {stats.resources} resources · {stats.hubs} groups · {stats.alerts} alerts · {stats.links} links
      {stats.truncated > 0 && ` · ${stats.truncated} lower-priority resources hidden (limit ${maxNodes})`}
      {webgl.supported && ` · WebGL ${webgl.version}`}
    </div>
  );

  const renderLegend = () => (
    <div className={`${className}__legend`} aria-hidden='true'>
      {SEVERITIES.slice(1).map((label, i) => (
        <span key={label} className={`${className}__legend-item ${className}__legend-item--sev-${i + 1}`}>{label}</span>
      ))}
    </div>
  );

  const renderDetails = () => selected && (
    <div className={`${className}__details`} role='region' aria-label='Selected node'>
      <strong>{selected.name}</strong>
      <span>{KIND_LABELS[selected.kind]}</span>
      {selected.kind === 'resource'
        ? <span>{selected.count} open alerts · highest {severityLabel(selected.severity)}</span>
        : <span>{selected.count} linked resources</span>}
      <span>{graph.neighbors.get(selected.id)?.size || 0} direct connections</span>
    </div>
  );

  const renderFallback = () => (
    <div className={`${className}__fallback`}>
      <InlineNotification
        kind='warning'
        lowContrast
        hideCloseButton
        title='3D view unavailable'
        subtitle={`${webgl.reason || 'WebGL is not available.'} Showing a ranked list instead.`}
      />
      <table className={`${className}__table`}>
        <caption>Top nodes by connections</caption>
        <thead>
          <tr><th>Name</th><th>Type</th><th>Alerts / resources</th><th>Highest severity</th></tr>
        </thead>
        <tbody>
          {[...graph.nodes]
            .sort((a, b) => (graph.neighbors.get(b.id)?.size || 0) - (graph.neighbors.get(a.id)?.size || 0))
            .slice(0, 25)
            .map(n => (
              <tr key={n.id}>
                <td>{n.name}</td>
                <td>{KIND_LABELS[n.kind]}</td>
                <td>{n.count}</td>
                <td>{n.kind === 'resource' ? severityLabel(n.severity) : '–'}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const renderBody = () => {
    if (initialLoad) return <SkeletonText paragraph lineCount={6} />;
    if (error) {
      return (
        <InlineNotification
          kind='error'
          lowContrast
          hideCloseButton
          title='Unable to load alerts'
          subtitle={String(error?.message || 'The alert query failed.')}
        />
      );
    }
    if (!hasRows) return <div className={`${className}__empty`}>No open alerts to graph.</div>;
    if (graph.nodes.length === 0) return <div className={`${className}__empty`}>No resources match the current filters.</div>;
    if (!webgl.supported) return renderFallback();
    return (
      <ForceGraph3DRenderer
        ref={rendererRef}
        nodes={graph.nodes}
        links={graph.links}
        focus={focus}
        selectedId={selectedId}
        showParticles={showParticles}
        paused={paused}
        onNodeClick={handleNodeClick}
        onNodeHover={(n: GraphNode | null) => setHoverId(n ? n.id : null)}
        onBackgroundClick={() => { if (selectedId) clearSelection(); }}
        onContextLost={() => setGpuMessage('GPU context lost — recovering')}
        onContextRestored={() => setGpuMessage(null)}
      />
    );
  };

  return (
    <div className={className} role='contentinfo'>
      {renderControls()}
      {renderStats()}
      {gpuMessage && (
        <InlineNotification kind='warning' lowContrast hideCloseButton title={gpuMessage} subtitle='' />
      )}
      <div className={`${className}__stage`}>
        {renderBody()}
        {webgl.supported && hasRows && renderLegend()}
        {renderDetails()}
      </div>
    </div>
  );
};

export default ForceGraph3DView;
