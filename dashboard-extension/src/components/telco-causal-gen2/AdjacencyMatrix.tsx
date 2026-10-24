/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adjacency matrix: rows and columns are resources ordered by (estimated) tier, a filled cell is a link.
 * Topology links are symmetric; causal links are directional (row = source, column = target).
 * Stays readable at hundreds of resources where a node-link drawing becomes a hairball.
 * Drawn only from the links the dashboard already holds (buildAdjacency in logic.ts).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdjacencyModel, Link3DGen2 } from './logic';
import { TIER_HEX } from './insight-utils';

interface Props {
  model: AdjacencyModel;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectLink: (link: Link3DGen2) => void;
}

const HEADER = 120;
const GUTTER = 120;
const COLORS = { physical: '#0043ce', causal: '#da1e28', illustrative: '#8d8d8d' } as const;

export default function AdjacencyMatrix({ model, selectedNodeId, onSelectNode, onSelectLink }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 640, h: 340 });
  const [hover, setHover] = useState<{ row: number; col: number; x: number; y: number } | null>(null);

  const n = model.order.length;
  // Cells never shrink below 9px: a crowded matrix scrolls instead of turning into a postage stamp.
  const cell = Math.max(9, Math.min(18, Math.floor(Math.min((box.w - GUTTER - 12) / Math.max(n, 1), (box.h - HEADER - 8) / Math.max(n, 1)))));
  const side = cell * n;
  const labelled = cell >= 12;

  const grid = useMemo(() => {
    const m = new Map<number, (typeof model.cells)[number]>();
    model.cells.forEach(c => m.set(c.row * Math.max(n, 1) + c.col, c));
    return m;
  }, [model, n]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setBox({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const selIdx = selectedNodeId ? model.index.get(selectedNodeId) : undefined;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || n === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = GUTTER + side + 4;
    const H = HEADER + side + 4;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // Tier bands + separators
    model.tiers.forEach(t => {
      const color = TIER_HEX[t.layer] || '#525252';
      g.fillStyle = `${color}14`;
      g.fillRect(GUTTER, HEADER + t.start * cell, side, (t.end - t.start + 1) * cell);
      g.fillStyle = color;
      g.fillRect(GUTTER - 4, HEADER + t.start * cell, 3, (t.end - t.start + 1) * cell);
      g.fillRect(GUTTER + t.start * cell, HEADER - 4, (t.end - t.start + 1) * cell, 3);
    });

    // Grid lines when there is room
    if (cell >= 6) {
      g.strokeStyle = '#e8e8e8';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        g.moveTo(GUTTER + i * cell + 0.5, HEADER);
        g.lineTo(GUTTER + i * cell + 0.5, HEADER + side);
        g.moveTo(GUTTER, HEADER + i * cell + 0.5);
        g.lineTo(GUTTER + side, HEADER + i * cell + 0.5);
      }
      g.stroke();
    }
    g.strokeStyle = '#8d8d8d';
    g.strokeRect(GUTTER + 0.5, HEADER + 0.5, side, side);

    // Selected row/column highlight
    if (selIdx !== undefined) {
      g.fillStyle = '#d0e2ff99';
      g.fillRect(GUTTER, HEADER + selIdx * cell, side, cell);
      g.fillRect(GUTTER + selIdx * cell, HEADER, cell, side);
    }

    // Cells
    const pad = cell >= 6 ? 1 : 0;
    model.cells.forEach(c => {
      g.fillStyle = COLORS[c.kind] || COLORS.physical;
      g.fillRect(GUTTER + c.col * cell + pad, HEADER + c.row * cell + pad, cell - pad * 2, cell - pad * 2);
    });

    // Hover crosshair
    if (hover) {
      g.fillStyle = '#16161614';
      g.fillRect(GUTTER, HEADER + hover.row * cell, side, cell);
      g.fillRect(GUTTER + hover.col * cell, HEADER, cell, side);
    }

    // Labels
    if (labelled) {
      g.font = '11px IBM Plex Sans, sans-serif';
      g.fillStyle = '#161616';
      g.textBaseline = 'middle';
      const clip = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);
      model.order.forEach((node, i) => {
        g.textAlign = 'right';
        g.fillText(clip(node.name), GUTTER - 8, HEADER + i * cell + cell / 2);
        g.save();
        g.translate(GUTTER + i * cell + cell / 2, HEADER - 8);
        g.rotate(-Math.PI / 2);
        g.textAlign = 'left';
        g.fillText(clip(node.name), 0, 0);
        g.restore();
      });
    }
  }, [model, n, cell, side, labelled, selIdx, hover]);

  if (n === 0) return <div className="insight-view insight-empty">No resources are loaded.</div>;

  const locate = (e: React.MouseEvent) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return null;
    const col = Math.floor((e.clientX - r.left - GUTTER) / cell);
    const row = Math.floor((e.clientY - r.top - HEADER) / cell);
    if (row < 0 || col < 0 || row >= n || col >= n) return null;
    return { row, col, x: e.clientX - r.left + 12, y: e.clientY - r.top + 12 };
  };

  const hit = hover ? grid.get(hover.row * n + hover.col) : undefined;
  const density = n > 1 ? (model.physicalCount + model.causalCount) / ((n * (n - 1)) / 2) : 0;

  return (
    <div className="insight-view insight-adjacency">
      <div className="insight-toolbar">
        <div className="insight-legend">
          <span className="legend-chip"><i style={{ background: COLORS.physical }} />topology link (symmetric)</span>
          <span className="legend-chip"><i style={{ background: COLORS.causal }} />causal (row → column)</span>
          {model.cells.some(c => c.kind === 'illustrative') && <span className="legend-chip"><i style={{ background: COLORS.illustrative }} />illustrative</span>}
        </div>
        <div className="insight-stats">
          <span>{n} resources</span>
          <span>{model.physicalCount} topology</span>
          <span>{model.causalCount} causal</span>
          <span>density {(density * 100).toFixed(density < 0.01 ? 2 : 1)}%</span>
        </div>
      </div>
      {model.cells.length === 0 && (
        <div className="insight-note">No links are available for these resources, so the matrix is empty rather than guessed.</div>
      )}
      <div className="insight-canvas matrix-scroll" ref={wrapRef}>
        <div style={{ position: 'relative', width: GUTTER + side + 4, height: HEADER + side + 4, margin: '0 auto' }}>
          <canvas
            ref={canvasRef}
            onMouseMove={e => setHover(locate(e))}
            onMouseLeave={() => setHover(null)}
            onClick={e => {
              const p = locate(e);
              if (p) {
                const c = grid.get(p.row * n + p.col);
                if (c) onSelectLink(c.link);
                return;
              }
              const r = canvasRef.current?.getBoundingClientRect();
              if (r && e.clientX - r.left < GUTTER) {
                const row = Math.floor((e.clientY - r.top - HEADER) / cell);
                if (row >= 0 && row < n) onSelectNode(model.order[row].id);
              } else if (r && e.clientY - r.top < HEADER) {
                const col = Math.floor((e.clientX - r.left - GUTTER) / cell);
                if (col >= 0 && col < n) onSelectNode(model.order[col].id);
              }
            }}
            style={{ cursor: hit ? 'pointer' : 'default' }}
          />
          {hover && (
            <div className="insight-tooltip" style={{ left: hover.x, top: hover.y }}>
              <strong>{model.order[hover.row].name}</strong> → <strong>{model.order[hover.col].name}</strong>
              <div>{hit ? `${hit.kind}${hit.link.relType ? ` · ${hit.link.relType}` : ''}${hit.link.isCausal ? '' : ' (both directions)'}` : 'no link'}</div>
              {hit && <div className="tip-hint">Click to inspect the link</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
