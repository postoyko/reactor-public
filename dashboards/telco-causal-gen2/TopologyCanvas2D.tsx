/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * 2D structural view of the Telco Causal Mesh. Draws the same nodes and links as the 3D scene:
 * - Tiered hierarchy (estimated tiers, core at the top)
 * - Radial hop rings around the selected node
 * - Pod containment (topology group names when supplied, otherwise estimated tier)
 * Nothing here is invented: every figure shown comes from the node/link data (see logic.ts).
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Button, IconButton } from '@carbon/react';
import { CenterToFit, ZoomIn, ZoomOut, Reset, Layers, Radar, Group } from '@carbon/icons-react';
import { severityHex } from './severity';
import {
  Node3DGen2,
  Link3DGen2,
  Topology2DLayoutType,
  Layout2DResult,
  computeHierarchical2DLayout,
  computeCircular2DLayout,
  computePodContainment2DLayout,
  CARD_2D
} from './logic';
import { layerDef } from './classification';

export interface TopologyCanvas2DProps {
  nodes: Node3DGen2[];
  links: Link3DGen2[];
  selectedNodeId: string | null;
  hoveredNodeId?: string | null;
  spofNodeIds: Set<string>;
  /** False when no topology links were supplied, so "0 SPOF" would be misleading and "n/a" is shown. */
  spofAvailable?: boolean;
  activeRoutePath: Node3DGen2[] | null;
  activeLayers: Record<number, boolean>;
  filterMode: 'all' | 'critical' | 'probable-cause' | 'spof';
  /** When set, nodes (and links) outside this set are dimmed: incident, probe, Sankey and hop focus. */
  focusNodeIds?: Set<string> | null;
  /** CSS colour for a node's accent bar and border (the dashboard's "lens"). Defaults to severity colours. */
  getNodeColor?: (node: Node3DGen2) => string;
  isRoutingMode?: boolean;
  routeSourceId?: string | null;
  routeTargetId?: string | null;
  onSelectNode: (node: Node3DGen2) => void;
  onHoverNode?: (node: Node3DGen2 | null) => void;
  onOpenDeepDive: (node: Node3DGen2) => void;
  onSelectLink?: (link: Link3DGen2) => void;
  onNodeContextMenu?: (node: Node3DGen2, e: React.MouseEvent) => void;
  onSetRouteSource?: (id: string) => void;
  onSetRouteTarget?: (id: string) => void;
}


const layerIcon = (layer: number): string => layerDef(layer).glyph;

// ── Geometry (card size is shared with the layouts in logic.ts) ──
const CARD_W = CARD_2D.width;
const CARD_H = CARD_2D.height;
const HALF_W = CARD_W / 2;
const HALF_H = CARD_H / 2;
const MIN_K = 0.1;
const MAX_K = 3.2;
const FIT_PAD = 28;
const TOP_INSET = 60; // floating toolbar
const BOTTOM_INSET = 44; // HUD bar
const TIER_PAD = 40;

interface Pt {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const severityColor = severityHex;

/** Point where the line from a card centre toward `toward` leaves the card rectangle. */
const clipToCard = (c: Pt, toward: Pt, gap: number): Pt => {
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const tx = dx === 0 ? Infinity : (HALF_W + gap) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (HALF_H + gap) / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
};

/**
 * Edge path that starts and ends on the card borders (so arrowheads are visible instead of hidden under the
 * opaque cards) plus the curve midpoint for the badge.
 */
const buildLinkPath = (s: Pt, t: Pt, hierarchical: boolean, off: number): { d: string; mid: Pt } => {
  const dx = t.x - s.x;
  const dy = t.y - s.y;

  if (hierarchical) {
    if (Math.abs(dy) > CARD_H) {
      // Different rows: leave through the bottom/top edge with vertical tangents.
      const dir = dy > 0 ? 1 : -1;
      const p0 = { x: s.x, y: s.y + dir * HALF_H };
      const p3 = { x: t.x, y: t.y - dir * (HALF_H + 3) };
      const my = (p0.y + p3.y) / 2;
      const c1 = { x: p0.x + off, y: my };
      const c2 = { x: p3.x + off, y: my };
      return {
        d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`,
        mid: { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: my }
      };
    }
    // Same row: arc over the top so the edge does not run through neighbouring cards.
    const dir = dx >= 0 ? 1 : -1;
    const p0 = { x: s.x + dir * HALF_W, y: s.y };
    const p3 = { x: t.x - dir * (HALF_W + 3), y: t.y };
    const lift = -(HALF_H + 24 + Math.min(Math.abs(dx) * 0.06, 36)) - Math.abs(off);
    const c1 = { x: p0.x + dir * 12, y: p0.y + lift };
    const c2 = { x: p3.x - dir * 12, y: p3.y + lift };
    return {
      d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`,
      mid: { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 }
    };
  }

  const len = Math.hypot(dx, dy) || 1;
  const bend = len * 0.08 + off;
  const q = {
    x: (s.x + t.x) / 2 + (-dy / len) * bend,
    y: (s.y + t.y) / 2 + (dx / len) * bend
  };
  const p0 = clipToCard(s, q, 0);
  const p3 = clipToCard(t, q, 3);
  return {
    d: `M ${p0.x} ${p0.y} Q ${q.x} ${q.y} ${p3.x} ${p3.y}`,
    mid: { x: 0.25 * p0.x + 0.5 * q.x + 0.25 * p3.x, y: 0.25 * p0.y + 0.5 * q.y + 0.25 * p3.y }
  };
};

export const TopologyCanvas2D: React.FC<TopologyCanvas2DProps> = ({
  nodes,
  links,
  selectedNodeId,
  hoveredNodeId,
  spofNodeIds,
  spofAvailable = true,
  activeRoutePath,
  activeLayers,
  filterMode,
  focusNodeIds,
  getNodeColor,
  isRoutingMode,
  routeSourceId,
  routeTargetId,
  onSelectNode,
  onHoverNode,
  onOpenDeepDive,
  onSelectLink,
  onNodeContextMenu,
  onSetRouteSource,
  onSetRouteTarget
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [layoutType, setLayoutType] = useState<Topology2DLayoutType>('hierarchical');
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 900, height: 540 });
  const [measured, setMeasured] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLinkKey, setSelectedLinkKey] = useState<string | null>(null);

  const [transform, setTransform] = useState<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Pt>({ x: 0, y: 0 });
  const dragOriginRef = useRef<Pt>({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);

  // Only the radial layout depends on the selected node; other layouts must not re-run on every click.
  const centerId = layoutType === 'circular' ? selectedNodeId : null;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
          setMeasured(true);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Layer, filter mode and search combine (the search used to be ignored whenever a filter mode was active).
  const visibleNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return nodes.filter(n => {
      if (!activeLayers[n.layer]) return false;
      if (filterMode === 'critical' && n.severity !== 6) return false;
      if (filterMode === 'probable-cause' && !n.isProbableCause) return false;
      if (filterMode === 'spof' && !spofNodeIds.has(n.id)) return false;
      if (q) {
        return (
          n.name.toLowerCase().includes(q) ||
          n.id.toLowerCase().includes(q) ||
          n.entityType.toLowerCase().includes(q) ||
          n.layerName.toLowerCase().includes(q) ||
          n.entityTypes.some(t => t.toLowerCase().includes(q)) ||
          n.topologyGroups.some(g => g.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [nodes, activeLayers, filterMode, spofNodeIds, searchQuery]);

  const visibleNodeIdSet = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

  const visibleLinks = useMemo(
    () => links.filter(l => visibleNodeIdSet.has(l.source.id) && visibleNodeIdSet.has(l.target.id)),
    [links, visibleNodeIdSet]
  );

  const layoutResult: Layout2DResult = useMemo(() => {
    if (layoutType === 'circular') {
      return computeCircular2DLayout(visibleNodes, visibleLinks, dimensions.width, dimensions.height, centerId || undefined);
    }
    if (layoutType === 'containment') return computePodContainment2DLayout(visibleNodes, visibleLinks, dimensions.width);
    return computeHierarchical2DLayout(visibleNodes, visibleLinks, dimensions.width);
  }, [layoutType, visibleNodes, visibleLinks, dimensions, centerId]);

  const nodePosMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    layoutResult.nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [layoutResult.nodes]);

  const routeIdSet = useMemo(() => new Set((activeRoutePath || []).map(n => n.id)), [activeRoutePath]);

  // Tier bands follow where the layout actually put each tier.
  const tierBands = useMemo(() => {
    if (layoutType !== 'hierarchical' || layoutResult.nodes.length === 0) return null;
    const layerOf = new Map<string, number>(visibleNodes.map(n => [n.id, n.layer]));
    const groups = new Map<number, { min: number; max: number }>();
    let minX = Infinity;
    let maxX = -Infinity;
    layoutResult.nodes.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      const layer = layerOf.get(p.id);
      if (layer === undefined) return;
      const g = groups.get(layer);
      if (!g) groups.set(layer, { min: p.y, max: p.y });
      else {
        g.min = Math.min(g.min, p.y);
        g.max = Math.max(g.max, p.y);
      }
    });
    const bands = Array.from(groups.entries())
      .map(([layer, g]) => ({ layer, minY: g.min, maxY: g.max, top: g.min - HALF_H - TIER_PAD, bottom: g.max + HALF_H + TIER_PAD }))
      .sort((a, b) => a.minY + a.maxY - (b.minY + b.maxY));
    for (let i = 1; i < bands.length; i++) {
      const prev = bands[i - 1];
      const cur = bands[i];
      if (prev.bottom > cur.top) {
        const mid = (prev.maxY + HALF_H + (cur.minY - HALF_H)) / 2;
        prev.bottom = mid;
        cur.top = mid;
      }
    }
    const x0 = minX - HALF_W - 40;
    const x1 = Math.max(maxX + HALF_W + 40, x0 + 280);
    return { bands, x0, x1 };
  }, [layoutType, layoutResult.nodes, visibleNodes]);

  const contentBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    layoutResult.nodes.forEach(p => {
      minX = Math.min(minX, p.x - HALF_W - FIT_PAD);
      maxX = Math.max(maxX, p.x + HALF_W + FIT_PAD);
      minY = Math.min(minY, p.y - HALF_H - FIT_PAD);
      maxY = Math.max(maxY, p.y + HALF_H + FIT_PAD);
    });
    (layoutResult.clusters || []).forEach(c => {
      minX = Math.min(minX, c.x - 8);
      minY = Math.min(minY, c.y - 8);
      maxX = Math.max(maxX, c.x + c.width + 8);
      maxY = Math.max(maxY, c.y + c.height + 8);
    });
    if (layoutResult.center && layoutResult.rings) {
      const { center, rings } = layoutResult;
      rings.forEach(r => {
        minX = Math.min(minX, center.x - r.radius);
        maxX = Math.max(maxX, center.x + r.radius + 90); // room for the ring label
        minY = Math.min(minY, center.y - r.radius);
        maxY = Math.max(maxY, center.y + r.radius);
      });
    }
    if (tierBands) {
      minX = Math.min(minX, tierBands.x0);
      maxX = Math.max(maxX, tierBands.x1);
      tierBands.bands.forEach(b => {
        minY = Math.min(minY, b.top);
        maxY = Math.max(maxY, b.bottom);
      });
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }, [layoutResult, tierBands]);

  // ── Pan / zoom ──
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setTransform(prev => {
      const k = clamp(prev.k * factor, MIN_K, MAX_K);
      const r = k / prev.k;
      return { k, x: cx - (cx - prev.x) * r, y: cy - (cy - prev.y) * r };
    });
  }, []);

  // Native non-passive listener: React's onWheel is passive, so preventDefault() was ignored (the page scrolled
  // while zooming) and offsetX was relative to whichever child element was under the cursor.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragMovedRef.current = false;
    dragOriginRef.current = { x: e.clientX, y: e.clientY };
    dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    if (Math.hypot(e.clientX - dragOriginRef.current.x, e.clientY - dragOriginRef.current.y) > 3) dragMovedRef.current = true;
    setTransform(prev => ({ ...prev, x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y }));
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleCenterToFit = useCallback(() => {
    if (!contentBounds) return;
    const { minX, minY, maxX, maxY } = contentBounds;
    const gw = Math.max(maxX - minX, 100);
    const gh = Math.max(maxY - minY, 100);
    const availH = Math.max(dimensions.height - TOP_INSET - BOTTOM_INSET, 120);
    const k = clamp(Math.min(dimensions.width / gw, availH / gh), MIN_K, 1.25);
    setTransform({
      k,
      x: dimensions.width / 2 - ((minX + maxX) / 2) * k,
      y: TOP_INSET + availH / 2 - ((minY + maxY) / 2) * k
    });
  }, [contentBounds, dimensions]);

  // Fit when first measured and whenever the layout mode, visible set or radial centre changes.
  const fitRef = useRef(handleCenterToFit);
  fitRef.current = handleCenterToFit;
  const fitKey = `${layoutType}|${visibleNodes.length}|${centerId ?? ''}`;
  useEffect(() => {
    if (measured) fitRef.current();
  }, [fitKey, measured]);

  const handleNodeClick = (e: React.MouseEvent, node: Node3DGen2) => {
    e.stopPropagation();
    if (dragMovedRef.current) return; // it was a pan, not a click
    if (isRoutingMode) {
      if (!routeSourceId) onSetRouteSource?.(node.id);
      else if (!routeTargetId && routeSourceId !== node.id) onSetRouteTarget?.(node.id);
      else onSetRouteSource?.(node.id);
      return;
    }
    onSelectNode(node);
  };

  // Spread parallel / bidirectional links so they do not draw on top of each other.
  const linkOffsets = useMemo(() => {
    const groups = new Map<string, number[]>();
    visibleLinks.forEach((l, i) => {
      const key = [l.source.id, l.target.id].sort().join('|');
      const arr = groups.get(key) || [];
      arr.push(i);
      groups.set(key, arr);
    });
    const out = new Array<number>(visibleLinks.length).fill(0);
    groups.forEach(idxs => {
      if (idxs.length < 2) return;
      idxs.forEach((li, n) => {
        out[li] = (n - (idxs.length - 1) / 2) * 26;
      });
    });
    return out;
  }, [visibleLinks]);

  // Edge geometry is computed once per change; highlighted edges are drawn last so they sit on top.
  const linkViews = useMemo(() => {
    const hierarchical = layoutType === 'hierarchical';
    const views: Array<{
      key: string;
      link: Link3DGen2;
      d: string;
      mid: Pt;
      isSelected: boolean;
      isInRoute: boolean;
      hasMetric: boolean;
      priority: number;
    }> = [];
    visibleLinks.forEach((link, i) => {
      const s = nodePosMap.get(link.source.id);
      const t = nodePosMap.get(link.target.id);
      if (!s || !t) return;
      const isSelected =
        selectedLinkKey === `${link.source.id}->${link.target.id}` ||
        selectedNodeId === link.source.id ||
        selectedNodeId === link.target.id;
      const isInRoute = routeIdSet.has(link.source.id) && routeIdSet.has(link.target.id) && !link.isCausal;
      // Offsets are in the canonical (sorted-id) frame so opposite-direction links separate instead of coinciding.
      const sign = link.source.id < link.target.id ? 1 : -1;
      const off = hierarchical ? linkOffsets[i] : linkOffsets[i] * sign;
      const { d, mid } = buildLinkPath(s, t, hierarchical, off);
      views.push({
        key: `link-${i}`,
        link,
        d,
        mid,
        isSelected,
        isInRoute,
        hasMetric: typeof link.latencyMs === 'number',
        priority: isInRoute ? 2 : isSelected ? 1 : 0
      });
    });
    return views.sort((a, b) => a.priority - b.priority);
  }, [visibleLinks, nodePosMap, layoutType, selectedLinkKey, selectedNodeId, routeIdSet, linkOffsets]);

  const zoomCenter = (factor: number) => zoomAt(factor, dimensions.width / 2, dimensions.height / 2);

  return (
    <div className="topology-2d-container" ref={containerRef}>
      {/* ── Floating control bar ── */}
      <div className="topology-2d-toolbar">
        <div className="toolbar-group layout-group">
          <Button size="sm" kind={layoutType === 'hierarchical' ? 'primary' : 'ghost'} renderIcon={Layers} onClick={() => setLayoutType('hierarchical')} title="Tiers: core at the top, access at the bottom (tiers are estimated)">
            Tiers
          </Button>
          <Button size="sm" kind={layoutType === 'circular' ? 'primary' : 'ghost'} renderIcon={Radar} onClick={() => setLayoutType('circular')} title="Hop rings around the selected node">
            Radial
          </Button>
          <Button size="sm" kind={layoutType === 'containment' ? 'primary' : 'ghost'} renderIcon={Group} onClick={() => setLayoutType('containment')} title="Boxes per topology group (or per estimated tier when no groups are supplied)">
            Pods
          </Button>
        </div>

        <div className="toolbar-group search-group">
          <input
            type="text"
            className="topo-search-input"
            placeholder="Search name, type, group…"
            aria-label="Search network elements"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="clear-search-btn" aria-label="Clear search" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>

        <div className="toolbar-group zoom-group">
          <IconButton label="Zoom In" size="sm" kind="ghost" onClick={() => zoomCenter(1.2)}>
            <ZoomIn />
          </IconButton>
          <IconButton label="Zoom Out" size="sm" kind="ghost" onClick={() => zoomCenter(1 / 1.2)}>
            <ZoomOut />
          </IconButton>
          <IconButton label="Fit All" size="sm" kind="ghost" onClick={handleCenterToFit}>
            <CenterToFit />
          </IconButton>
          <IconButton label="Reset Zoom" size="sm" kind="ghost" onClick={() => setTransform({ x: 0, y: 0, k: 1 })}>
            <Reset />
          </IconButton>
        </div>
      </div>

      {/* ── Canvas ── */}
      <svg
        ref={svgRef}
        className="topology-2d-svg"
        width="100%"
        height="100%"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', display: 'block', userSelect: 'none', touchAction: 'none' }}
      >
        <defs>
          {/* Only causal links are directional (alert -> probable cause); physical adjacency has no arrow. */}
          <marker id="topo2d-arrow-causal" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#da1e28" />
          </marker>
          <linearGradient id="topo2d-grad-spof" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#da1e28" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ba4e00" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="topo2d-grad-root" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6929c4" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#0f62fe" stopOpacity="0.10" />
          </linearGradient>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Containment boxes */}
          {layoutType === 'containment' && layoutResult.clusters && (
            <g className="clusters-layer">
              {layoutResult.clusters.map(cluster => {
                const title = `${cluster.name} (${cluster.nodeIds.length} ${cluster.nodeIds.length === 1 ? 'node' : 'nodes'})`;
                const maxChars = Math.max(8, Math.floor((cluster.width - 24) / 7));
                return (
                  <g key={cluster.id} className="cluster-box">
                    <rect x={cluster.x} y={cluster.y} width={cluster.width} height={cluster.height} rx="8" className="cluster-rect" />
                    <rect x={cluster.x} y={cluster.y} width={cluster.width} height="28" rx="8" className="cluster-header-bg" />
                    <text x={cluster.x + 12} y={cluster.y + 18} className="cluster-title">
                      <title>{title}</title>
                      {truncate(title, maxChars)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Hop rings: centre and radii come from the layout */}
          {layoutType === 'circular' && layoutResult.center && layoutResult.rings && (
            <g className="circular-rings-layer">
              {layoutResult.rings.map(ring => (
                <g key={`ring-${ring.rank}`}>
                  <circle cx={layoutResult.center!.x} cy={layoutResult.center!.y} r={ring.radius} className="circular-ring" />
                  <text x={layoutResult.center!.x + ring.radius + 6} y={layoutResult.center!.y - 4} className="circular-ring-label">
                    {ring.label}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Tier bands (follow the real rows) */}
          {tierBands && (
            <g className="hierarchy-tier-labels">
              {tierBands.bands.map((b, i) => (
                <g key={`tier-${b.layer}`}>
                  <rect
                    x={tierBands.x0}
                    y={b.top}
                    width={tierBands.x1 - tierBands.x0}
                    height={Math.max(b.bottom - b.top, 0)}
                    rx="6"
                    fill={i % 2 === 0 ? 'rgba(141, 141, 141, 0.07)' : 'rgba(141, 141, 141, 0.03)'}
                    pointerEvents="none"
                  />
                  <line x1={tierBands.x0} y1={b.top} x2={tierBands.x1} y2={b.top} className="tier-divider-line" />
                  <text x={tierBands.x0 + 12} y={b.top + 16} className="tier-label">
                    {layerIcon(b.layer)} {layerDef(b.layer).name} (est.)
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Edges */}
          <g className="links-layer">
            {linkViews.map(v => {
              const { link, isSelected, isInRoute } = v;
              const isCausal = link.isCausal;
              const illustrative = link.kind === 'illustrative';
              const dimmed = focusNodeIds
                ? !(focusNodeIds.has(link.source.id) && focusNodeIds.has(link.target.id))
                : Boolean(selectedNodeId) && !isSelected && !isInRoute;
              const showBadge = isSelected || isInRoute || (transform.k >= 1 && v.hasMetric);
              const label = typeof link.latencyMs === 'number' ? `${link.latencyMs}ms` : link.relType || 'link';
              const badgeW = Math.max(40, label.length * 6.2 + 14);

              return (
                <g
                  key={v.key}
                  className="topo-link-group"
                  opacity={dimmed ? 0.18 : illustrative ? 0.6 : 1}
                  onClick={() => {
                    if (dragMovedRef.current) return;
                    setSelectedLinkKey(`${link.source.id}->${link.target.id}`);
                    onSelectLink?.(link);
                  }}
                >
                  {/* Wide invisible target so thin edges are easy to click */}
                  <path d={v.d} fill="none" stroke="transparent" strokeWidth={12} />
                  <path
                    d={v.d}
                    fill="none"
                    pointerEvents="none"
                    className={`topo-link-path ${isCausal ? 'causal' : 'physical'} ${isInRoute ? 'in-route' : ''} ${isSelected ? 'selected' : ''}`}
                    stroke={isInRoute ? '#0f62fe' : isCausal ? '#da1e28' : isSelected ? '#0043ce' : '#8d8d8d'}
                    strokeWidth={isInRoute ? 3.5 : isSelected ? 2.5 : isCausal ? 2 : 1.4}
                    strokeDasharray={isCausal ? '5,4' : illustrative ? '2,4' : undefined}
                    markerEnd={isCausal ? 'url(#topo2d-arrow-causal)' : undefined}
                  />
                  {showBadge && (
                    <g transform={`translate(${v.mid.x}, ${v.mid.y})`} className="link-badge" pointerEvents="none">
                      <rect x={-badgeW / 2} y="-9" width={badgeW} height="18" rx="4" className="link-badge-bg" />
                      <text x="0" y="4" textAnchor="middle" className="link-badge-text">{label}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* Network element cards */}
          <g className="nodes-layer">
            {visibleNodes.map(node => {
              const pos = nodePosMap.get(node.id);
              if (!pos) return null;

              const isSelected = selectedNodeId === node.id;
              const isHovered = hoveredNodeId === node.id;
              const isSpof = spofNodeIds.has(node.id);
              const isRouteNode = routeIdSet.has(node.id);
              const isRouteSrc = routeSourceId === node.id;
              const isRouteTgt = routeTargetId === node.id;
              const dimmed = Boolean(focusNodeIds) && !focusNodeIds!.has(node.id);

              const sev = severityColor(node.severity);
              const accent = getNodeColor ? getNodeColor(node) : sev;
              const subtext = node.entityTypes[0] || node.layerName;

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  opacity={dimmed ? 0.25 : 1}
                  className={`topo-node-card ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${node.isProbableCause ? 'root-cause' : ''} ${isSpof ? 'spof' : ''}`}
                  onClick={e => handleNodeClick(e, node)}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onOpenDeepDive(node);
                  }}
                  onContextMenu={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    onNodeContextMenu?.(node, e);
                  }}
                  onMouseEnter={() => onHoverNode?.(node)}
                  onMouseLeave={() => onHoverNode?.(null)}
                >
                  {(node.isProbableCause || isSpof || isSelected || isRouteNode) && (
                    <rect
                      x={-HALF_W - 5}
                      y={-HALF_H - 5}
                      width={CARD_W + 10}
                      height={CARD_H + 10}
                      rx="10"
                      className={`node-halo ${node.isProbableCause ? 'root-halo' : isSpof ? 'spof-halo' : 'select-halo'}`}
                    />
                  )}

                  <rect
                    x={-HALF_W}
                    y={-HALF_H}
                    width={CARD_W}
                    height={CARD_H}
                    rx="6"
                    className="node-card-body"
                    fill="#ffffff"
                    stroke={isSelected ? '#0f62fe' : isRouteSrc ? '#24a148' : isRouteTgt ? '#6929c4' : accent}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <rect x={-HALF_W} y={-HALF_H} width="6" height={CARD_H} rx="3" fill={accent} />

                  <text x={-HALF_W + 14} y={-HALF_H + 18} className="node-glyph">{layerIcon(node.layer)}</text>
                  <text x={-HALF_W + 28} y={-HALF_H + 18} className="node-name">
                    <title>{node.name}</title>
                    {truncate(node.name, 16)}
                  </text>
                  <text x={-HALF_W + 14} y={-HALF_H + 34} className="node-subtext">
                    <title>{subtext}</title>
                    {truncate(subtext, 22)}
                  </text>

                  {/* Bottom row: alert count on the left, link count right-aligned (both real data) */}
                  <g transform={`translate(${-HALF_W + 14}, ${-HALF_H + 42})`}>
                    <g className="alarm-badge">
                      <circle cx="4" cy="4" r="3.5" fill={sev} />
                      <text x="11" y="7" className="alarm-badge-text">
                        {node.alertCount > 0 ? `${node.alertCount} alert${node.alertCount > 1 ? 's' : ''}` : 'No alerts'}
                      </text>
                    </g>
                    {node.degree > 0 && (
                      <text x={CARD_W - 28} y="7" textAnchor="end" className="port-badge-text">
                        {node.degree} link{node.degree > 1 ? 's' : ''}
                      </text>
                    )}
                  </g>

                  {node.isProbableCause && (
                    <g transform={`translate(${HALF_W - 20}, ${-HALF_H - 8})`} className="badge-crown">
                      <title>Probable cause</title>
                      <rect x="-4" y="-2" width="22" height="16" rx="4" fill="#6929c4" />
                      <text x="7" y="10" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">★</text>
                    </g>
                  )}
                  {isSpof && !node.isProbableCause && (
                    <g transform={`translate(${HALF_W - 20}, ${-HALF_H - 8})`} className="badge-spof">
                      <title>Single point of failure</title>
                      <rect x="-4" y="-2" width="22" height="16" rx="4" fill="#da1e28" />
                      <text x="7" y="10" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">⚠</text>
                    </g>
                  )}

                  {isHovered && (
                    <g
                      transform={`translate(${HALF_W - 4}, ${HALF_H - 4})`}
                      className="node-hover-action"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenDeepDive(node);
                      }}
                    >
                      <title>Open resource deep dive</title>
                      <circle cx="0" cy="0" r="10" fill="#0f62fe" />
                      <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="11">🔍</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* ── Bottom summary bar ── */}
      <div className="topology-2d-hud">
        <span className="hud-metric"><strong>{visibleNodes.length}</strong> Network elements</span>
        <span className="hud-sep">|</span>
        <span className="hud-metric"><strong>{visibleLinks.filter(l => !l.isCausal).length}</strong> Topology links</span>
        <span className="hud-sep">|</span>
        <span className="hud-metric"><strong>{visibleLinks.filter(l => l.isCausal).length}</strong> Causal links</span>
        <span className="hud-sep">|</span>
        <span className="hud-metric" style={{ color: spofAvailable && spofNodeIds.size > 0 ? '#da1e28' : undefined }}>
          <strong>{spofAvailable ? spofNodeIds.size : 'n/a'}</strong> SPOF
        </span>
      </div>
    </div>
  );
};

export default TopologyCanvas2D;
