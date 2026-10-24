/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
// @ts-ignore - ships its own types, but they pull in three's ESM typings
import ForceGraph3DLib from 'react-force-graph-3d';

import { BACKGROUND, dimColor, endpointId, GraphLink, GraphNode, nodeTooltip, severityColor } from './graph';
import { getQualityProfile } from './webgl';

export interface ForceGraph3DHandle {
  zoomToFit: (ms?: number) => void;
  focusNode: (id: string, ms?: number) => void;
  pause: () => void;
  resume: () => void;
}

export interface ForceGraph3DRendererProps {
  nodes: GraphNode[];
  links: GraphLink[];
  /** When set, nodes outside the set are dimmed. */
  focus?: Set<string> | null;
  selectedId?: string | null;
  showParticles?: boolean;
  paused?: boolean;
  backgroundColor?: string;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  onBackgroundClick?: () => void;
  /** Fired when the GPU drops the WebGL context (driver reset, tab throttling, etc.). */
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

const MAX_PIXEL_RATIO = 2;

const ForceGraph3DRenderer = forwardRef<ForceGraph3DHandle, ForceGraph3DRendererProps>((props, ref) => {
  const {
    nodes,
    links,
    focus = null,
    selectedId = null,
    showParticles = true,
    paused = false,
    backgroundColor = BACKGROUND,
    onNodeClick,
    onNodeHover,
    onBackgroundClick,
    onContextLost,
    onContextRestored
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [contextLost, setContextLost] = useState(false);
  const [instanceKey, setInstanceKey] = useState(0);
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden);

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);
  const profile = useMemo(() => getQualityProfile(nodes.length, links.length), [nodes.length, links.length]);

  // Track container size so the canvas fills whatever region the route gives us.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize(prev => (
        Math.round(prev.width) === Math.round(rect.width) && Math.round(prev.height) === Math.round(rect.height)
          ? prev
          : { width: rect.width, height: rect.height }
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Don't burn GPU in background tabs.
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // pauseAnimation() cancels the whole frame loop (render + orbit controls), so it is only used when
  // nothing can be shown anyway. A "frozen layout" instead stops the physics via cooldownTicks below.
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    if (hidden || contextLost) fg.pauseAnimation?.();
    else fg.resumeAnimation?.();
  }, [hidden, contextLost, instanceKey]);

  // Resuming the layout needs an explicit reheat because the engine has already cooled down.
  const wasPaused = useRef(paused);
  useEffect(() => {
    if (wasPaused.current && !paused) graphRef.current?.d3ReheatSimulation?.();
    wasPaused.current = paused;
  }, [paused]);

  // Keep the latest callbacks without re-subscribing the canvas listeners on every parent render.
  const contextLostCb = useRef(onContextLost);
  const contextRestoredCb = useRef(onContextRestored);
  contextLostCb.current = onContextLost;
  contextRestoredCb.current = onContextRestored;

  // Cap device pixel ratio and tune the physics once the renderer exists.
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    try {
      fg.renderer?.()?.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      fg.d3Force?.('charge')?.strength(-70);
      fg.d3Force?.('link')?.distance((link: GraphLink) => 30 + Math.min(40, 8 * Math.log2((link.weight || 1) + 1)));
      fg.d3ReheatSimulation?.();
    } catch (e) {
      // Tuning is best-effort; the graph still works with library defaults.
    }
  }, [instanceKey, nodes.length]);

  // WebGL context loss handling. The canvas must stay mounted while the context is lost: calling
  // preventDefault() tells the browser it may restore it, and a restored event only fires on a live canvas.
  // Once restored, remount the graph so every GPU resource is rebuilt from scratch.
  // (GPU teardown on unmount is handled by the library's own destructor, which disposes the renderer.)
  useEffect(() => {
    const canvas: HTMLCanvasElement | undefined = graphRef.current?.renderer?.()?.domElement;
    if (!canvas) return undefined;
    const lost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
      contextLostCb.current?.();
    };
    const restored = () => {
      setContextLost(false);
      setInstanceKey(k => k + 1);
      contextRestoredCb.current?.();
    };
    canvas.addEventListener('webglcontextlost', lost, false);
    canvas.addEventListener('webglcontextrestored', restored, false);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost, false);
      canvas.removeEventListener('webglcontextrestored', restored, false);
    };
  }, [instanceKey]);

  useImperativeHandle(ref, () => ({
    zoomToFit: (ms = 600) => graphRef.current?.zoomToFit?.(ms, 60),
    pause: () => graphRef.current?.pauseAnimation?.(),
    resume: () => graphRef.current?.resumeAnimation?.(),
    focusNode: (id: string, ms = 800) => {
      const node = graphData.nodes.find(n => n.id === id);
      if (!node || node.x === undefined || !graphRef.current) return;
      const distance = 120;
      const length = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
      const ratio = 1 + distance / length;
      graphRef.current.cameraPosition(
        { x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio },
        node,
        ms
      );
    }
  }), [graphData]);

  const inFocus = useCallback((id: string) => !focus || focus.has(id), [focus]);

  const nodeColor = useCallback((node: GraphNode) => {
    if (node.id === selectedId) return '#ffffff';
    return inFocus(node.id) ? node.color : dimColor(node.color);
  }, [inFocus, selectedId]);

  const linkActive = useCallback(
    (link: any) => !focus || (focus.has(endpointId(link.source)) && focus.has(endpointId(link.target))),
    [focus]
  );

  const linkColor = useCallback((link: any) => {
    const active = linkActive(link);
    const src = typeof link.source === 'object' ? link.source : undefined;
    const base = src?.kind === 'resource' ? severityColor(src.severity) : '#8d8d8d';
    return active ? base : dimColor(base, 0.9);
  }, [linkActive]);

  const linkWidth = useCallback((link: any) => (linkActive(link) ? 0.6 : 0.1), [linkActive]);

  const particlesOn = showParticles && profile.linkParticlesAllowed;
  const linkParticles = useCallback(
    (link: any) => (particlesOn && focus && linkActive(link) ? 2 : 0),
    [particlesOn, focus, linkActive]
  );

  const handleNodeClick = useCallback((node: GraphNode) => onNodeClick?.(node), [onNodeClick]);
  const handleNodeHover = useCallback((node: GraphNode | null) => onNodeHover?.(node || null), [onNodeHover]);

  const rendererConfig = useMemo(
    () => ({ antialias: nodes.length < 4000, alpha: false, powerPreference: 'high-performance' as const }),
    // Only read when the WebGL renderer is created, so size changes must not churn the prop.
    [instanceKey]
  );

  const width = size.width || 800;
  const height = size.height || 600;

  return (
    <div className='force-graph-3d__canvas' ref={containerRef} data-testid='force-graph-3d-canvas'>
      <ForceGraph3DLib
        key={instanceKey}
        ref={graphRef}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor={backgroundColor}
        rendererConfig={rendererConfig}
        nodeId='id'
        nodeVal='val'
        nodeColor={nodeColor}
        nodeLabel={nodeTooltip}
        nodeResolution={profile.nodeResolution}
        nodeOpacity={0.95}
        nodeRelSize={4}
        linkColor={linkColor}
        linkOpacity={0.55}
        linkWidth={linkWidth}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleWidth={1.6}
        warmupTicks={profile.warmupTicks}
        cooldownTicks={paused ? 0 : profile.cooldownTicks}
        d3AlphaDecay={profile.alphaDecay}
        d3VelocityDecay={0.3}
        enableNodeDrag={nodes.length < 4000}
        controlType='orbit'
        showNavInfo={false}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={onBackgroundClick}
      />
      {contextLost && (
        <div className='force-graph-3d__overlay' role='alert'>
          The GPU context was lost. Waiting for the browser to restore it…
        </div>
      )}
    </div>
  );
});

ForceGraph3DRenderer.displayName = 'ForceGraph3DRenderer';

export default ForceGraph3DRenderer;
