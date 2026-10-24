/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A tiny picture of one incident: the resources behind its alerts and the links that exist between them.
 * Built by buildIncidentSubgraph from the loaded data.
 */

import React from 'react';
import { MiniGraph } from './logic';
import { severityHex } from './insight-utils';

interface Props {
  graph: MiniGraph | undefined;
}

export default function IncidentMiniGraph({ graph }: Props) {
  if (!graph || graph.nodes.length === 0) return null;
  const pos = new Map(graph.nodes.map(n => [n.id, n]));
  const label = `${graph.nodes.length + graph.hidden} resources${graph.hidden ? ` (${graph.hidden} not drawn)` : ''}`;
  return (
    <div className="incident-mini-graph" title={label}>
      <svg viewBox="0 0 100 60" role="img" aria-label={`Incident subgraph: ${label}`}>
        <defs>
          <marker id="mini-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#da1e28" />
          </marker>
        </defs>
        {graph.links.map((l, i) => {
          const a = pos.get(l.source);
          const b = pos.get(l.target);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={l.isCausal ? '#da1e28' : '#8d8d8d'}
              strokeWidth={l.isCausal ? 1.1 : 0.8}
              strokeDasharray={l.isCausal ? '2.5 1.8' : l.kind === 'illustrative' ? '1 2' : undefined}
              markerEnd={l.isCausal ? 'url(#mini-arrow)' : undefined}
              opacity={0.85}
            />
          );
        })}
        {graph.nodes.map(n => (
          <g key={n.id}>
            <title>{`${n.name}${n.isRoot ? ' (probable cause)' : ''}`}</title>
            {n.isRoot && <circle cx={n.x} cy={n.y} r={6.4} fill="none" stroke="#6929c4" strokeWidth={1} />}
            <circle cx={n.x} cy={n.y} r={n.isRoot ? 4.4 : 3} fill={severityHex(n.severity)} stroke="#fff" strokeWidth={0.8} />
          </g>
        ))}
        {graph.hidden > 0 && (
          <text x={98} y={58} textAnchor="end" fontSize={6} fill="#525252">+{graph.hidden}</text>
        )}
      </svg>
    </div>
  );
}
