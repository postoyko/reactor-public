/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { useMesh } from '../MeshContext';
import { HeaderSection } from '../sections/HeaderSection';
import { StatusBanners } from '../sections/StatusBanners';
import { IncidentsSection } from '../sections/IncidentsSection';
import { TopologySection } from '../sections/TopologySection';
import { InsightsSection } from '../sections/InsightsSection';
import { AlarmsSection } from '../sections/AlarmsSection';
import { BlastRadiusSection } from '../sections/BlastRadiusSection';
import { IngestSection } from '../sections/IngestSection';
import { RemediationSection } from '../sections/RemediationSection';
import { MeshOverlays } from '../sections/overlays/MeshOverlays';
import { PaneId, useSplitLayout } from '../hooks/useSplitLayout';
import { Splitter, SplitPhase } from './Splitter';

const MIN_CENTER = 360; // px kept for the centre column
const MIN_PANE = 90; // px kept for a card in the inspector
const MIN_SPLIT = 140; // px kept for each half of the centre column
const GAP = 12;
const bound = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The whole dashboard: header, incident rail, topology and insight views, inspector rail, with draggable dividers. */
export function FullView(): JSX.Element {
  const { leftOpen, rightOpen, setContextMenu } = useMesh();
  const { layout, update } = useSplitLayout();

  const workspace = useRef<HTMLDivElement>(null);
  const leftRail = useRef<HTMLElement>(null);
  const rightRail = useRef<HTMLElement>(null);
  const center = useRef<HTMLElement>(null);
  const topPane = useRef<HTMLDivElement>(null);
  const panes = useRef<Partial<Record<PaneId, HTMLDivElement | null>>>({});
  const start = useRef<Record<string, number>>({});

  // ── widths ──
  const dragLeft = (dx: number, phase: SplitPhase) => {
    if (phase === 'start') start.current = { w: leftRail.current?.getBoundingClientRect().width ?? 300 };
    if (phase !== 'move') return;
    const total = workspace.current?.getBoundingClientRect().width ?? 1400;
    const rightW = rightOpen ? rightRail.current?.getBoundingClientRect().width ?? 380 : 0;
    const max = total - rightW - MIN_CENTER - GAP * (rightOpen ? 2 : 1);
    update(p => ({ ...p, left: Math.round(bound(start.current.w + dx, 200, Math.min(640, max))) }));
  };
  const dragRight = (dx: number, phase: SplitPhase) => {
    if (phase === 'start') start.current = { w: rightRail.current?.getBoundingClientRect().width ?? 380 };
    if (phase !== 'move') return;
    const total = workspace.current?.getBoundingClientRect().width ?? 1400;
    const leftW = leftOpen ? leftRail.current?.getBoundingClientRect().width ?? 300 : 0;
    const max = total - leftW - MIN_CENTER - GAP * (leftOpen ? 2 : 1);
    update(p => ({ ...p, right: Math.round(bound(start.current.w - dx, 260, Math.min(900, max))) }));
  };

  // ── centre column: topology above, insight views below ──
  const dragSplit = (dy: number, phase: SplitPhase) => {
    if (phase === 'start') start.current = { top: topPane.current?.getBoundingClientRect().height ?? 400, all: center.current?.getBoundingClientRect().height ?? 800 };
    if (phase !== 'move') return;
    const { top, all } = start.current;
    const usable = all - GAP;
    update(p => ({ ...p, split: bound((top + dy) / usable, MIN_SPLIT / usable, 1 - MIN_SPLIT / usable) }));
  };

  // ── inspector: the height of one card trades off against the next ──
  const dragPane = (a: PaneId, b: PaneId) => (dy: number, phase: SplitPhase) => {
    if (phase === 'start') start.current = { a: panes.current[a]?.getBoundingClientRect().height ?? 200, b: panes.current[b]?.getBoundingClientRect().height ?? 200 };
    if (phase !== 'move') return;
    const { a: ha, b: hb } = start.current;
    const na = Math.round(bound(ha + dy, MIN_PANE, ha + hb - MIN_PANE));
    update(p => ({ ...p, heights: { ...p.heights, [a]: na, [b]: Math.round(ha + hb - na) } }));
  };
  const resetPanes = (...ids: PaneId[]) => update(p => { const h = { ...p.heights }; ids.forEach(i => delete h[i]); return { ...p, heights: h }; });

  const pane = (id: PaneId, child: React.ReactNode) => {
    const h = layout.heights?.[id];
    return (
      <div className={`tc-pane${h ? ' tc-pane--sized' : ''}`} ref={el => { panes.current[id] = el; }} style={h ? { height: h, flex: 'none' } : undefined}>
        {child}
      </div>
    );
  };

  const split = layout.split ?? 0.5;
  const vars: Record<string, string> = {};
  if (layout.left) vars['--tc-left-w'] = `${layout.left}px`;
  if (layout.right) vars['--tc-right-w'] = `${layout.right}px`;

  return (
    <div className="telco-causal-gen2-container" onClick={() => setContextMenu(null)}>
      <HeaderSection />
      <StatusBanners />

      <div ref={workspace} className={`tc-workspace${leftOpen ? '' : ' no-left'}${rightOpen ? '' : ' no-right'}`} style={vars as React.CSSProperties}>
        <aside ref={leftRail} className="tc-rail tc-rail-left" hidden={!leftOpen} aria-label="Incident triage">
          <IncidentsSection />
        </aside>

        <main ref={center} className="tc-center tc-center--split">
          <div ref={topPane} className="tc-pane tc-pane--top" style={{ flexGrow: split }}>
            <TopologySection />
          </div>
          <Splitter direction="row" label="Resize topology and insight views" onResize={dragSplit} onReset={() => update(p => ({ ...p, split: undefined }))} />
          <div className="tc-pane tc-pane--bottom" style={{ flexGrow: 1 - split }}>
            <InsightsSection />
          </div>
        </main>

        <aside ref={rightRail} className="tc-rail tc-rail-right" hidden={!rightOpen} aria-label="Inspector">
          <div className="causal-grid tc-stack">
            {pane('alarms', <AlarmsSection />)}
            <Splitter direction="row" label="Resize alarms and blast radius" onResize={dragPane('alarms', 'blast')} onReset={() => resetPanes('alarms', 'blast')} />
            <div className="causal-right-stack">
              {pane('blast', <BlastRadiusSection />)}
              <Splitter direction="row" label="Resize blast radius and ingest" onResize={dragPane('blast', 'ingest')} onReset={() => resetPanes('blast', 'ingest')} />
              {pane('ingest', <IngestSection />)}
            </div>
            <Splitter direction="row" label="Resize ingest and remediation" onResize={dragPane('ingest', 'remediation')} onReset={() => resetPanes('ingest', 'remediation')} />
            {pane('remediation', <RemediationSection />)}
          </div>
        </aside>

        {leftOpen && <Splitter direction="col" className="tc-splitter--left" label="Resize incident rail" onResize={dragLeft} onReset={() => update(p => ({ ...p, left: undefined }))} />}
        {rightOpen && <Splitter direction="col" className="tc-splitter--right" label="Resize inspector" onResize={dragRight} onReset={() => update(p => ({ ...p, right: undefined }))} />}
      </div>

      <MeshOverlays />
    </div>
  );
}
