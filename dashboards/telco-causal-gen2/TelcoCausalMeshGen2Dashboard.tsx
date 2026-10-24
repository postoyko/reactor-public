/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import './telco-causal-gen2.scss';
import { MeshErrorBoundary } from './MeshErrorBoundary';
import { MeshProvider } from './MeshContext';
import { useMeshController } from './hooks/useMeshController';
import { isMeshPart } from './types';
import type { TelcoCausalMeshProps } from './types';
import { FullView } from './views/FullView';
import { PartView } from './views/PartView';

export type { RemediationResult, TelcoCausalMeshProps, MeshPart } from './types';
export { MESH_PARTS } from './types';

/*
 * Telco Causal Mesh.
 *
 * A props-driven 3D view of alerts and incidents. Everything drawn comes from the props; where the data
 * needed for a figure is not available the panel says "n/a" instead of inventing a value. See README.md.
 *
 * Layout of the source:
 *   hooks/       state, derived models, effects and handlers (hooks/useMeshController.ts runs them all in order)
 *   session/     the shared state store that lets several section tiles act as one dashboard
 *   sections/    one component per region of the page; each reads what it needs with useMesh()
 *   sections/overlays/   right-click menu, deep-dive drawer and modals
 *   views/       FullView (the whole page) and PartView (one region, for the `part` prop)
 */
function TelcoCausalMeshInner(props: TelcoCausalMeshProps) {
  const ctx = useMeshController(props);
  return (
    <MeshProvider value={ctx}>
      {ctx.part ? <PartView part={ctx.part} /> : <FullView />}
    </MeshProvider>
  );
}

export default function TelcoCausalMeshGen2Dashboard(props: TelcoCausalMeshProps) {
  // A `part` this dashboard does not have (renamed or removed since a layout was saved) shows a notice, not the whole dashboard.
  const asked: unknown = props.part;
  if (typeof asked === 'string' && asked !== '' && !isMeshPart(asked)) {
    return (
      <div role="note" style={{ margin: 12, padding: 12, border: '1px dashed #da1e28', background: '#fff1f1', color: '#161616', font: '13px/1.45 system-ui, sans-serif' }}>
        <strong>Section “{asked}” not found.</strong> This tile asks for a section the dashboard does not have. Choose another section for the tile in Design, or remove the tile.
      </div>
    );
  }
  const part = isMeshPart(props.part) ? props.part : undefined;
  return (
    <MeshErrorBoundary>
      <TelcoCausalMeshInner {...props} part={part} />
    </MeshErrorBoundary>
  );
}
