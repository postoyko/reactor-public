/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Where is the pain? Tier (estimated) -> topology group -> resource, sized by alert count and coloured by the
 * worst severity underneath. Click a tier or group to zoom in, click a resource to select it in the mesh.
 * The data comes from buildTierHierarchy (logic.ts), i.e. from the loaded alerts only.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Button } from '@carbon/react';
import { HierarchyDatum } from './logic';
import { severityPastel, severityPastelEdge, SEVERITY_LABEL } from './insight-utils';

type RNode = d3.HierarchyRectangularNode<HierarchyDatum>;

interface Props {
  data: HierarchyDatum;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

const DEPTH_OPACITY = [0, 0.7, 0.85, 1];
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(n - 1, 1))}…` : s);

function findById(d: HierarchyDatum, id: string): HierarchyDatum | null {
  if (d.id === id) return d;
  for (const c of d.children || []) {
    const hit = findById(c, id);
    if (hit) return hit;
  }
  return null;
}

/** Ids from the root down to `id` (inclusive); empty when not found. */
function pathTo(d: HierarchyDatum, id: string): HierarchyDatum[] {
  if (d.id === id) return [d];
  for (const c of d.children || []) {
    const sub = pathTo(c, id);
    if (sub.length) return [d, ...sub];
  }
  return [];
}

const makeHierarchy = (focus: HierarchyDatum) => d3
  .hierarchy<HierarchyDatum>(focus)
  .sum(d => (d.children ? 0 : d.value))
  .sort((a, b) => (b.value || 0) - (a.value || 0));

export default function SunburstTreemap({ data, selectedNodeId, onSelectNode }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 340 });
  const [mode, setMode] = useState<'sunburst' | 'treemap'>('sunburst');
  const [focusId, setFocusId] = useState('root');
  const [tip, setTip] = useState<{ x: number; y: number; d: HierarchyDatum } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // A focus that no longer exists (data refreshed) falls back to the root.
  const focus = useMemo(() => findById(data, focusId) || data, [data, focusId]);
  const trail = useMemo(() => pathTo(data, focus.id), [data, focus]);
  const total = focus.value;

  const sunburst = useMemo(() => {
    const root = d3.partition<HierarchyDatum>().size([2 * Math.PI, 1])(makeHierarchy(focus));
    return { root, levels: Math.max(root.height, 1) };
  }, [focus]);

  const treemap = useMemo(() => {
    const root = makeHierarchy(focus);
    d3.treemap<HierarchyDatum>()
      .size([size.w, size.h])
      .paddingInner(2)
      .paddingOuter(3)
      .paddingTop(d => (d.depth >= 1 && d.children ? 16 : 3))
      .round(true)(root);
    return root as RNode;
  }, [focus, size.w, size.h]);

  const activate = (d: HierarchyDatum) => {
    if (d.kind === 'resource' && d.nodeId) onSelectNode(d.nodeId);
    else setFocusId(d.id);
  };
  const hover = (e: React.MouseEvent, d: HierarchyDatum) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (box) setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top + 12, d });
  };
  const kindLabel = (d: HierarchyDatum) => (d.kind === 'tier' ? 'Tier (estimated)' : d.kind === 'group' ? 'Topology group' : d.kind === 'resource' ? 'Resource' : 'All resources');

  const body = () => {
    if (!total) return <div className="insight-empty">No alerts are loaded, so there is nothing to size.</div>;

    if (mode === 'treemap') {
      const nodes = treemap.descendants().filter(d => d.depth >= 1);
      return (
        <svg width={size.w} height={size.h} role="img" aria-label="Treemap of alerts by tier, group and resource">
          {nodes.map(d => {
            const w = d.x1 - d.x0;
            const h = d.y1 - d.y0;
            const color = severityPastel(d.data.severity);
            const edge = severityPastelEdge(d.data.severity);
            const leaf = !d.children;
            const selected = leaf && d.data.nodeId === selectedNodeId;
            return (
              <g key={d.data.id} transform={`translate(${d.x0},${d.y0})`} className="insight-cell" onClick={() => activate(d.data)} onMouseMove={e => hover(e, d.data)} onMouseLeave={() => setTip(null)}>
                <rect width={Math.max(w, 0)} height={Math.max(h, 0)} rx={2} fill={leaf ? color : `${color}66`} stroke={selected ? '#161616' : leaf ? '#ffffff' : edge} strokeWidth={selected ? 2.5 : 1} />
                {!leaf && w > 40 && <text x={5} y={12} className="insight-cell-head">{truncate(d.data.name, Math.floor(w / 6))} · {d.value}</text>}
                {leaf && w > 46 && h > 18 && <text x={5} y={13} className="insight-cell-leaf">{truncate(d.data.name, Math.floor(w / 6.2))}</text>}
              </g>
            );
          })}
        </svg>
      );
    }

    const { root, levels } = sunburst;
    const R = Math.max(60, Math.min(size.w, size.h) / 2 - 8);
    const hole = R * 0.26;
    const thickness = (R - hole) / levels;
    const arc = d3.arc<RNode>()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.006))
      .innerRadius(d => hole + (d.depth - 1) * thickness)
      .outerRadius(d => hole + d.depth * thickness - 1.5);
    const arcs = root.descendants().filter(d => d.depth >= 1 && d.x1 > d.x0);
    return (
      <svg width={size.w} height={size.h} role="img" aria-label="Sunburst of alerts by tier, group and resource">
        <g transform={`translate(${size.w / 2},${size.h / 2})`}>
          {arcs.map(d => {
            const selected = !d.children && d.data.nodeId === selectedNodeId;
            const mid = (d.x0 + d.x1) / 2;
            const rm = hole + (d.depth - 0.5) * thickness;
            const showLabel = (d.x1 - d.x0) * rm >= 11 && thickness >= 16;
            return (
              <g key={d.data.id} className="insight-cell insight-arc" onClick={() => activate(d.data)} onMouseMove={e => hover(e, d.data)} onMouseLeave={() => setTip(null)}>
                <path d={arc(d) || ''} fill={severityPastel(d.data.severity)} fillOpacity={DEPTH_OPACITY[Math.min(d.depth, 3)]} stroke={selected ? '#161616' : '#ffffff'} strokeWidth={selected ? 2.5 : 0.8} />
                {showLabel && (
                  <text
                    transform={`rotate(${(mid * 180) / Math.PI - 90}) translate(${rm},0) rotate(${mid < Math.PI ? 0 : 180})`}
                    textAnchor="middle"
                    dy="0.32em"
                    className="insight-arc-label"
                    pointerEvents="none"
                  >
                    {truncate(d.data.name, Math.floor(thickness / 5.6))}
                  </text>
                )}
              </g>
            );
          })}
          <g className="insight-center" onClick={() => { if (trail.length > 1) setFocusId(trail[trail.length - 2].id); }} style={{ cursor: trail.length > 1 ? 'pointer' : 'default' }}>
            <circle r={hole - 3} fill="#ffffff" stroke="#e0e0e0" />
            <text textAnchor="middle" y={-6} className="insight-center-title">{truncate(focus.name, Math.floor((hole * 2) / 6.5))}</text>
            <text textAnchor="middle" y={10} className="insight-center-sub">{total} alert{total === 1 ? '' : 's'}</text>
            {trail.length > 1 && <text textAnchor="middle" y={24} className="insight-center-hint">click to go up</text>}
          </g>
        </g>
      </svg>
    );
  };

  return (
    <div className="insight-view insight-sunburst">
      <div className="insight-toolbar">
        <div className="insight-crumbs">
          {trail.map((t, i) => (
            <React.Fragment key={t.id}>
              {i > 0 && <span className="crumb-sep">›</span>}
              <button type="button" className={`crumb${i === trail.length - 1 ? ' current' : ''}`} onClick={() => setFocusId(t.id)}>{truncate(t.name, 26)}</button>
            </React.Fragment>
          ))}
        </div>
        <div className="insight-legend">
          {[6, 5, 4, 3, 2, 1, 0].map(s => (
            <span key={s} className="legend-chip"><i style={{ background: severityPastel(s), border: `1px solid ${severityPastelEdge(s)}` }} />{SEVERITY_LABEL(s)}</span>
          ))}
        </div>
        <div className="insight-switch">
          <Button size="sm" kind={mode === 'sunburst' ? 'primary' : 'ghost'} onClick={() => setMode('sunburst')}>Sunburst</Button>
          <Button size="sm" kind={mode === 'treemap' ? 'primary' : 'ghost'} onClick={() => setMode('treemap')}>Treemap</Button>
        </div>
      </div>
      <div className="insight-canvas" ref={wrapRef}>
        {body()}
        {tip && (
          <div className="insight-tooltip" style={{ left: tip.x, top: tip.y }}>
            <strong>{tip.d.name}</strong>
            <div>{kindLabel(tip.d)}</div>
            <div>{tip.d.value} alert{tip.d.value === 1 ? '' : 's'} · worst severity: {SEVERITY_LABEL(tip.d.severity)}</div>
            <div className="tip-hint">{tip.d.kind === 'resource' ? 'Click to select in the mesh' : 'Click to zoom in'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
