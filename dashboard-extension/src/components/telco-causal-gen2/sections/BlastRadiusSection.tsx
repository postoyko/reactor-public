/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Radar } from '@carbon/icons-react';
import { useMesh } from '../MeshContext';

export function BlastRadiusSection(): JSX.Element {
  const { radarRef } = useMesh();
  return (
    <div className="sankey-panel" style={{ marginBottom: 0 }}>
      <div className="sankey-header">
        <div className="sankey-title">
          <Radar size={18} />
          Blast Radius: linked resources &amp; SPOF island
        </div>

      </div>

      <div style={{ padding: '6px 12px', background: '#f4f4f4', border: '1px solid #e0e0e0', borderRadius: '4px', marginBottom: '10px', fontSize: '0.75rem', color: '#525252' }}>
        Shows the resource at the centre (selected, incident root or first probable cause), its direct links, and the resources cut off from the core layer if it fails. No impact growth is modelled.
      </div>

      <div className="sankey-svg-wrapper tc-fill-radar" style={{ display: 'flex', justifyContent: 'center', height: '320px', minHeight: '320px', background: '#ffffff' }}>
        <svg ref={radarRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
