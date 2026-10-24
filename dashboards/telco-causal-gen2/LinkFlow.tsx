/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sankey of the links between resources. Left to right follows the link direction (causal links keep theirs,
 * topology links run from the lower tier to the higher one). Node colour is the estimated tier, link colour is the
 * link kind. Built from buildLinkFlow (logic.ts), so only real links are drawn; links that would form a loop are
 * left out and counted by the caller.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { LinkFlowModel, Link3DGen2 } from './logic';
import { TIER_HEX, severityHex, SEVERITY_LABEL } from './insight-utils';

interface Props {
  model: LinkFlowModel;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onSelectLink: (link: Link3DGen2) => void;
}

const KIND_COLOR: Record<string, string> = { causal: '#da1e28', physical: '#0043ce', illustrative: '#8d8d8d' };
const KIND_LABEL: Record<string, string> = { causal: 'causal (incident → probable cause)', physical: 'topology link', illustrative: 'illustrative demo link' };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function LinkFlow({ model, selectedNodeId, onSelectNode, onSelectLink }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [fillH, setFillH] = useState(0); // height of the box when the explorer is stretched to fill a pane or tile (0 = natural height)
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
      setFillH(el.closest('.tc-pane--bottom, .tc-part--insights') ? Math.floor(entries[0].contentRect.height) : 0);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (model.links.length === 0) return null;
    const LABEL = 170;
    const run = (height: number) => {
      const gen = d3Sankey()
        .nodeId((d: any) => d.id)
        .nodeWidth(12)
        .nodePadding(6)
        .nodeSort(null)
        .extent([[LABEL, 8], [Math.max(width - LABEL, LABEL + 120), height - 8]]);
      return gen({
        nodes: model.nodes.map(n => ({ ...n })),
        links: model.links.map(l => ({ source: l.source, target: l.target, value: l.value, kind: l.kind, link: l.link }))
      });
    };
    // First pass finds the busiest column, the second sizes the chart so every resource gets a readable bar.
    const first = run(400);
    const cols = new Map<number, number>();
    first.nodes.forEach((n: any) => cols.set(n.depth, (cols.get(n.depth) || 0) + 1));
    const busiest = Math.max(...Array.from(cols.values()), 1);
    const height = Math.min(Math.max(busiest * 22 + 24, 320, fillH), 1600);
    return { graph: run(height), height };
  }, [model, width, fillH]);

  if (!layout) return <div className="insight-empty">No links to draw for this selection.</div>;
  const { graph, height } = layout;
  const pathOf = sankeyLinkHorizontal();
  const focusId = hoverNode || selectedNodeId;

  const touches = (l: any, id: string | null) => Boolean(id) && (l.source.id === id || l.target.id === id);

  const move = (e: React.MouseEvent, lines: string[]) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (box) setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top + 12 + (wrapRef.current?.scrollTop || 0), lines });
  };

  return (
    <div className="link-flow-scroll" ref={wrapRef} onMouseLeave={() => { setTip(null); setHoverNode(null); }}>
      <svg width={width} height={height} role="img" aria-label="Sankey of links between resources">
        <g fill="none">
          {graph.links.map((l: any, i: number) => {
            const dim = focusId !== null && !touches(l, focusId);
            return (
              <path
                key={i}
                d={pathOf(l)}
                stroke={KIND_COLOR[l.kind] || '#8d8d8d'}
                strokeWidth={Math.max(l.width, 2)}
                strokeOpacity={dim ? 0.07 : touches(l, focusId) ? 0.65 : 0.32}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectLink(l.link)}
                onMouseMove={e => move(e, [`${l.source.name} → ${l.target.name}`, `${KIND_LABEL[l.kind] || l.kind}${l.value > 1 ? ` · ${l.value} parallel links` : ''}`, 'Click to inspect the link'])}
              />
            );
          })}
        </g>
        {graph.nodes.map((n: any) => {
          const h = Math.max(n.y1 - n.y0, 4);
          const left = n.x0 > width / 2;
          const selected = n.id === selectedNodeId;
          const dim = focusId !== null && n.id !== focusId && !graph.links.some((l: any) => touches(l, focusId) && (l.source.id === n.id || l.target.id === n.id));
          return (
            <g key={n.id} opacity={dim ? 0.35 : 1} style={{ cursor: 'pointer' }}
              onClick={() => onSelectNode(n.id)}
              onMouseEnter={() => setHoverNode(n.id)}
              onMouseLeave={() => setHoverNode(null)}
              onMouseMove={e => move(e, [n.name, `${n.layerName} (est.)`, `${n.alertCount} alert${n.alertCount === 1 ? '' : 's'} · worst severity: ${SEVERITY_LABEL(n.severity)}`, 'Click to select in the mesh'])}
            >
              <rect x={n.x0} y={n.y0} width={n.x1 - n.x0} height={h} rx={2} fill={TIER_HEX[n.layer] || '#525252'} stroke={selected ? '#161616' : 'none'} strokeWidth={2} />
              <circle cx={left ? n.x0 - 5 : n.x1 + 5} cy={n.y0 + h / 2} r={0} />
              <text
                x={left ? n.x0 - 6 : n.x1 + 6}
                y={n.y0 + h / 2}
                dy="0.35em"
                textAnchor={left ? 'end' : 'start'}
                className={`flow-label${selected ? ' selected' : ''}`}
              >
                <tspan fill={severityHex(n.severity)}>●</tspan> {clip(n.name, 24)}
              </text>
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="insight-tooltip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.lines[0]}</strong>
          {tip.lines.slice(1).map((t, i) => <div key={i} className={i === tip.lines.length - 2 ? 'tip-hint' : undefined}>{t}</div>)}
        </div>
      )}
    </div>
  );
}
