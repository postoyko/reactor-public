/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The time strip under the canvas: a heat history of alerts as they first fired (stacked by severity), incident start
 * markers, change markers and a draggable playhead. Dragging it replays the cascade; the right-hand end is "now".
 */

import React, { useRef } from 'react';
import { Alert } from './logic';
import { Change, heat } from './atlas-logic';
import { SEVERITY_COLORS } from './theme';

export interface TimelineProps {
  alerts: Alert[]; from: number; to: number; rt: number | null; playing: boolean;
  incs: Array<{ id: string; title: string; start: number; priority: number; color: string }>;
  changes: Change[]; selectedInc: string | null;
  onScrub: (v: number | null) => void; onSelectInc: (id: string) => void; onChange: (c: Change) => void;
}

const N = 72, W = 1000, H = 78, BASE = 52;
const BAND = [SEVERITY_COLORS[2], SEVERITY_COLORS[3], SEVERITY_COLORS[4], SEVERITY_COLORS[5], SEVERITY_COLORS[6]];

export function Timeline(p: TimelineProps) {
  const ref = useRef<SVGSVGElement>(null), dragging = useRef(false);
  const rows = heat(p.alerts, p.from, p.to, N), max = Math.max(1, ...rows.map(r => r.reduce((a, b) => a + b, 0))), span = Math.max(1, p.to - p.from);
  const xOf = (t: number) => ((t - p.from) / span) * W;
  const scrub = (e: React.PointerEvent) => { const r = (ref.current as SVGSVGElement).getBoundingClientRect(), v = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); p.onScrub(v >= 0.995 ? null : v); };
  const head = p.rt === null ? W : p.rt * W, fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="atlas__timeline">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="slider" aria-label="Time: drag to replay how the incidents unfolded" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((p.rt === null ? 1 : p.rt) * 100)} tabIndex={0}
        onPointerDown={e => { dragging.current = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); scrub(e); }} onPointerMove={e => { if (dragging.current) scrub(e); }} onPointerUp={() => { dragging.current = false; }}
        onKeyDown={e => { const v = p.rt === null ? 1 : p.rt; if (e.key === 'ArrowLeft') { e.preventDefault(); p.onScrub(Math.max(0, v - 0.02)); } else if (e.key === 'ArrowRight') { e.preventDefault(); p.onScrub(v + 0.02 >= 1 ? null : v + 0.02); } }}>
        <rect x={0} y={0} width={W} height={H} className="tl-bg" />
        {rows.map((r, i) => { let y = BASE; const bw = W / N; return r.map((c, b) => { if (!c) return null; const h = (c / max) * (BASE - 6); y -= h; return <rect key={`${i}-${b}`} x={i * bw + 0.6} y={y} width={bw - 1.2} height={h} fill={BAND[b]} opacity={head >= i * bw ? 0.95 : 0.35} />; }); })}
        <line x1={0} x2={W} y1={BASE} y2={BASE} className="tl-axis" />
        {p.incs.map(i => { const x = xOf(i.start); return <g key={i.id} className="tl-inc" onPointerDown={e => { e.stopPropagation(); p.onSelectInc(i.id); }}><title>{`P${i.priority} ${i.title} started ${fmt(i.start)}`}</title><path d={`M${x},${BASE + 4} l6,6 l-6,6 l-6,-6 z`} fill={i.color} stroke={p.selectedInc === i.id ? '#fff' : 'none'} strokeWidth={2} /></g>; })}
        {p.changes.map(c => { const x = xOf(c.time); if (x < 0 || x > W) return null; return <g key={c.id} className="tl-chg" onPointerDown={e => { e.stopPropagation(); p.onChange(c); }}><title>{`${c.sample ? '[sample] ' : ''}${c.label}${c.resource ? ` on ${c.resource}` : ''} · ${fmt(c.time)}`}</title><rect x={x - 4} y={BASE + 6} width={8} height={8} fill="#a56eff" transform={`rotate(45 ${x} ${BASE + 10})`} opacity={0} /><rect x={x - 4.5} y={BASE + 15} width={9} height={9} fill="#08bdba" /></g>; })}
        <line x1={head} x2={head} y1={0} y2={H} className="tl-head" />
        <circle cx={head} cy={5} r={5} className="tl-knob" />
      </svg>
      <div className="atlas__tlscale"><span>{fmt(p.from)}</span><span>{p.playing ? 'playing…' : p.rt === null ? 'now' : fmt(p.from + p.rt * span)}</span><span>{fmt(p.to)}</span></div>
      <div className="atlas__tlkey"><i style={{ background: SEVERITY_COLORS[6] }} />critical <i style={{ background: SEVERITY_COLORS[5] }} />major <i style={{ background: SEVERITY_COLORS[4] }} />minor <i style={{ background: SEVERITY_COLORS[3] }} />warning · <b>◆</b> incident starts · <b className="chg">■</b> change</div>
    </div>
  );
}
