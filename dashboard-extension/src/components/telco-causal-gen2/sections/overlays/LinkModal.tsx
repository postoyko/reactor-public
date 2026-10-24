/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Portal } from '../../Overlay';
import { Button, Modal } from '@carbon/react';
import { useMesh } from '../../MeshContext';

export function LinkModal(): JSX.Element {
  const { handleFocusNode, selectedLink, setIsRoutingMode, setRouteSourceId, setRouteTargetId, setSelectedLink } = useMesh();
  return (
    <>
      {selectedLink && (
        <Portal>
        <Modal
          open={Boolean(selectedLink)}
          modalHeading={`Interconnect Cable Inspection: [${selectedLink.source.name}] ↔ [${selectedLink.target.name}]`}
          passiveModal
          onRequestClose={() => setSelectedLink(null)}
          size="md"
        >
          <div className="link-modal-content">
            <div className="link-endpoints-row">
              <div className="endpoint-box">
                <div className="ep-label">Source NE</div>
                <div className="ep-name">{selectedLink.source.name}</div>
                <div className="ep-layer">{selectedLink.source.layerName}</div>
                <Button size="sm" kind="tertiary" onClick={() => { handleFocusNode(selectedLink.source); setSelectedLink(null); }}>
                  Fly To Source
                </Button>
              </div>
              <div className="link-arrow-box">
                <span className="link-type-pill">{selectedLink.relType}</span>
                <span className="link-latency-tag">{selectedLink.latencyMs === undefined ? 'latency n/a' : `${selectedLink.latencyMs} ms`}</span>
              </div>
              <div className="endpoint-box">
                <div className="ep-label">Target NE</div>
                <div className="ep-name">{selectedLink.target.name}</div>
                <div className="ep-layer">{selectedLink.target.layerName}</div>
                <Button size="sm" kind="tertiary" onClick={() => { handleFocusNode(selectedLink.target); setSelectedLink(null); }}>
                  Fly To Target
                </Button>
              </div>
            </div>

            <div className="link-metrics-grid">
              <div className="prop-item"><span className="p-key">Relation:</span><span className="p-val" style={{ color: '#0f62fe' }}>{selectedLink.relType}</span></div>
              <div className="prop-item">
                <span className="p-key">Link kind:</span>
                <span className="p-val">
                  {selectedLink.kind === 'physical' ? 'Topology adjacency (supplied by the host)' : selectedLink.kind === 'causal' ? 'Causal: from an incident to its probable cause' : 'Illustrative demo link (not real topology)'}
                </span>
              </div>
              <div className="prop-item"><span className="p-key">Latency:</span><span className="p-val">{selectedLink.latencyMs === undefined ? 'n/a (not measured)' : `${selectedLink.latencyMs} ms`}</span></div>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#525252', marginTop: '8px' }}>
              Optical power, error rate and bandwidth need interface metrics, which this panel does not have.
            </p>

            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <Button
                size="sm"
                kind="primary"
                onClick={() => {
                  setRouteSourceId(selectedLink.source.id);
                  setRouteTargetId(selectedLink.target.id);
                  setIsRoutingMode(true);
                  setSelectedLink(null);
                }}
              >
                Trace Path Between Endpoints
              </Button>
              <Button size="sm" kind="ghost" onClick={() => setSelectedLink(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
        </Portal>
      )}
    </>
  );
}
