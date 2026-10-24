/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * One lane per resource (grouped by estimated tier), one bar per alert from first to last occurrence, and a
 * marker on each lane for the probe that saw it first. Drag across the time axis to brush a window; the mesh
 * is filtered to the resources with an alert in that window. Click the chart to clear the brush.
 * Everything is drawn from the loaded alerts (buildSwimlanes in logic.ts).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Swimlanes, SwimBar, SwimLane } from './logic';
import { severityHex, TIER_HEX, formatDateTime } from './insight-utils';

export interface TimeWindow {
  start: number;
  end: number;
}

interface Props {
  model: Swimlanes;
  brush: TimeWindow | null;
  onBrush: (w: TimeWindow | null) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  /** Probe name -> colour (taken from the dashboard's probe palette). */
  probeColor: (probe: string) => string;
}

const LABEL_W = 170;
const LANE_H = 20;
const HEAD_H = 18;
const AXIS_H = 26;
const PAD_R = 14;

type Row = { kind: 'head'; layer: number; name: string; count: number } | { kind: 'lane'; lane: SwimLane };

export default function AlertSwimlane({ model, brush, onBrush, selectedNodeId, onSelectNode, probeColor }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const dragRef = useRef<{ a: number; b: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lane: SwimLane; bar?: SwimBar } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let last = -1;
    model.lanes.forEach(l => {
      if (l.layer !== last) {
        last = l.layer;
        out.push({ kind: 'head', layer: l.layer, name: l.layerName, count: model.lanes.filter(x => x.layer === l.layer).length });
      }
      out.push({ kind: 'lane', lane: l });
    });
    return out;
  }, [model]);

  const probes = useMemo(() => Array.from(new Set(model.lanes.map(l => l.firstProbe).filter((p): p is string => Boolean(p)))), [model]);

  if (!model.domain) {
    return <div className="insight-view insight-empty">None of the loaded alerts has an occurrence time, so there is no timeline to draw.</div>;
  }

  const [lo, hi] = model.domain;
  // Give a single-instant domain some width so the axis is still valid.
  const span = hi > lo ? [lo, hi] : [lo - 30000, hi + 30000];
  const plotW = Math.max(width - LABEL_W - PAD_R, 120);
  const x = d3.scaleTime().domain(span.map(t => new Date(t))).range([0, plotW]);
  const ticks = x.ticks(Math.max(Math.floor(plotW / 110), 2));
  const fmt = x.tickFormat();

  let y = 0;
  const placed = rows.map(r => {
    const top = y;
    y += r.kind === 'head' ? HEAD_H : LANE_H;
    return { r, top };
  });
  const bodyH = y;

  const toTime = (clientX: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    const px = Math.min(Math.max(clientX - (box ? box.left : 0) - LABEL_W, 0), plotW);
    return +x.invert(px);
  };

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const t = toTime(e.clientX);
    // The drag lives in a ref as well as in state: the window listeners below must read the latest value
    // without calling the parent's setState from inside a state updater.
    dragRef.current = { a: t, b: t };
    setDrag(dragRef.current);
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      dragRef.current = { a: dragRef.current.a, b: toTime(ev.clientX) };
      setDrag(dragRef.current);
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      const end = toTime(ev.clientX);
      const s = Math.min(d.a, end);
      const f = Math.max(d.a, end);
      // A bare click (under 4px) clears the window instead of creating an empty one.
      if (Math.abs(x(new Date(f)) - x(new Date(s))) < 4) onBrush(null);
      else onBrush({ start: s, end: f });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const win = drag ? { start: Math.min(drag.a, drag.b), end: Math.max(drag.a, drag.b) } : brush;
  const showTip = (e: React.MouseEvent, lane: SwimLane, bar?: SwimBar) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (box) setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top + 12, lane, bar });
  };

  return (
    <div className="insight-view insight-swimlane">
      <div className="insight-toolbar">
        <span className="insight-hint">
          {win ? `Window: ${formatDateTime(win.start)} → ${formatDateTime(win.end)}` : 'Drag across the timeline to filter the mesh to that window. Click to clear.'}
        </span>
        <div className="insight-legend">
          <span className="legend-chip"><i className="legend-diamond" />first probe to see the resource</span>
          {probes.slice(0, 6).map(p => (
            <span key={p} className="legend-chip"><i style={{ background: probeColor(p) }} />{p}</span>
          ))}
        </div>
      </div>
      <div className="swimlane-scroll" ref={wrapRef} onMouseLeave={() => setTip(null)}>
        <div className="swimlane-axis" style={{ height: AXIS_H, width: width }}>
          <svg width={width} height={AXIS_H}>
            <g transform={`translate(${LABEL_W},${AXIS_H - 4})`}>
              <line x1={0} x2={plotW} y1={0} y2={0} stroke="#8d8d8d" />
              {ticks.map(t => (
                <g key={+t} transform={`translate(${x(t)},0)`}>
                  <line y2={-5} stroke="#8d8d8d" />
                  <text y={-8} textAnchor="middle" className="swimlane-tick">{fmt(t)}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>
        <svg width={width} height={bodyH} onMouseDown={onDown} className="swimlane-body" role="img" aria-label="Alert timeline, one lane per resource">
          {placed.map(({ r, top }) => {
            if (r.kind === 'head') {
              return (
                <g key={`h${r.layer}`} transform={`translate(0,${top})`}>
                  <rect width={width} height={HEAD_H} fill={`${TIER_HEX[r.layer] || '#525252'}18`} />
                  <rect width={3} height={HEAD_H} fill={TIER_HEX[r.layer] || '#525252'} />
                  <text x={10} y={12.5} className="swimlane-head">{r.name} (est.) · {r.count}</text>
                </g>
              );
            }
            const { lane } = r;
            const selected = lane.id === selectedNodeId;
            return (
              <g key={lane.id} transform={`translate(0,${top})`} onMouseMove={e => showTip(e, lane)}>
                {selected && <rect width={width} height={LANE_H} fill="#d0e2ff" opacity={0.6} />}
                <line x1={LABEL_W} x2={LABEL_W + plotW} y1={LANE_H - 0.5} y2={LANE_H - 0.5} stroke="#e0e0e0" />
                <text
                  x={LABEL_W - 8}
                  y={13.5}
                  textAnchor="end"
                  className={`swimlane-label${selected ? ' selected' : ''}`}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => onSelectNode(lane.id)}
                >
                  {lane.name.length > 24 ? `${lane.name.slice(0, 23)}…` : lane.name}
                </text>
                <g transform={`translate(${LABEL_W},0)`}>
                  {lane.bars.map(b => {
                    const bx = x(new Date(b.start));
                    const bw = Math.max(x(new Date(b.end)) - bx, 3);
                    return (
                      <rect
                        key={b.alertId}
                        x={bx}
                        y={4}
                        width={bw}
                        height={LANE_H - 8}
                        rx={2}
                        fill={severityHex(b.severity)}
                        opacity={0.88}
                        onMouseMove={e => { e.stopPropagation(); showTip(e, lane, b); }}
                      />
                    );
                  })}
                  {lane.firstTime !== null && lane.firstProbe && (
                    <path
                      d="M 0 -5 L 5 0 L 0 5 L -5 0 z"
                      transform={`translate(${x(new Date(lane.firstTime))},${LANE_H / 2})`}
                      fill={probeColor(lane.firstProbe)}
                      stroke="#161616"
                      strokeWidth={1}
                      pointerEvents="none"
                    />
                  )}
                </g>
              </g>
            );
          })}
          {win && (
            <rect
              x={LABEL_W + x(new Date(win.start))}
              width={Math.max(x(new Date(win.end)) - x(new Date(win.start)), 1)}
              y={0}
              height={bodyH}
              fill="#0f62fe"
              opacity={0.14}
              stroke="#0f62fe"
              strokeOpacity={0.7}
              pointerEvents="none"
            />
          )}
        </svg>
        {tip && (
          <div className="insight-tooltip" style={{ left: tip.x, top: tip.y }}>
            <strong>{tip.lane.name}</strong>
            {tip.bar ? (
              <>
                <div>{tip.bar.summary || 'Alert'}</div>
                <div>{formatDateTime(tip.bar.start)}{tip.bar.end > tip.bar.start ? ` → ${formatDateTime(tip.bar.end)}` : ''}</div>
                <div>Probe: {tip.bar.probe} · {tip.bar.state}</div>
              </>
            ) : (
              <div>{tip.lane.bars.length} alert{tip.lane.bars.length === 1 ? '' : 's'}{tip.lane.firstProbe ? ` · first seen by ${tip.lane.firstProbe}` : ''}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
