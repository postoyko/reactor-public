/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useMesh } from '../MeshContext';
import type { MeshPart } from '../types';
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

/**
 * One region of the dashboard on its own (the `part` prop). Each region is wrapped in the same containers it has on the
 * full page (rail, centre column, inspector stack) so the existing styles apply unchanged.
 */
function Region({ part }: { part: MeshPart }): JSX.Element {
  switch (part) {
    case 'header':
      return <HeaderSection />;
    case 'incidents':
      return <aside className="tc-rail tc-rail-left"><IncidentsSection /></aside>;
    case 'topology':
      return <main className="tc-center"><TopologySection /></main>;
    case 'insights':
      return <main className="tc-center"><InsightsSection /></main>;
    case 'alarms':
      return <aside className="tc-rail tc-rail-right"><div className="causal-grid tc-stack"><AlarmsSection /></div></aside>;
    case 'blast':
      return <aside className="tc-rail tc-rail-right"><div className="causal-grid tc-stack"><div className="causal-right-stack"><BlastRadiusSection /></div></div></aside>;
    case 'ingest':
      return <aside className="tc-rail tc-rail-right"><div className="causal-grid tc-stack"><div className="causal-right-stack"><IngestSection /></div></div></aside>;
    case 'remediation':
      return <aside className="tc-rail tc-rail-right"><div className="causal-grid tc-stack"><RemediationSection /></div></aside>;
  }
}

export function PartView({ part }: { part: MeshPart }): JSX.Element {
  const { error, isHost, setContextMenu } = useMesh();
  return (
    <div className={`telco-causal-gen2-container tc-part tc-part--${part}`} onClick={() => setContextMenu(null)}>
      {part === 'header' || error ? <StatusBanners /> : null}
      <Region part={part} />
      {isHost ? <MeshOverlays /> : null}
    </div>
  );
}
