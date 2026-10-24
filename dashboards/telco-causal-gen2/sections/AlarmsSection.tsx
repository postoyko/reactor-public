/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { severityHex, severityInk } from '../severity';
import React from 'react';
import { Button } from '@carbon/react';
import { Launch } from '@carbon/icons-react';
import { probeOf } from '../logic';
import { useMesh } from '../MeshContext';

export function AlarmsSection(): JSX.Element {
  const { alerts, handleFocusNode, handleOpenDeepDive, nodes3D, selectedNodeData, setTopologyHops, topologyHops } = useMesh();
  return (
    <div className="causal-card">
      <div className="card-title">
        <div>
          {selectedNodeData
            ? `Active Alarms on [${selectedNodeData.name}] (${selectedNodeData.alerts.length})`
            : 'Select a 3D Node to View Focused Alarms'}
        </div>
        {selectedNodeData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="khop-switcher">
              <span className="khop-label">Scope:</span>
              <button
                type="button"
                className={`khop-btn ${topologyHops === 1 ? 'active' : ''}`}
                onClick={() => setTopologyHops(1)}
                title="1-Hop Direct Neighbors"
              >
                1-Hop
              </button>
              <button
                type="button"
                className={`khop-btn ${topologyHops === 2 ? 'active' : ''}`}
                onClick={() => setTopologyHops(2)}
                title="2-Hop Extended Cascade"
              >
                2-Hops
              </button>
              <button
                type="button"
                className={`khop-btn ${topologyHops === 3 ? 'active' : ''}`}
                onClick={() => setTopologyHops(3)}
                title="Full 3-Tier Multi-Hop Radius"
              >
                3-Hops
              </button>
            </div>
            <Button
              size="sm"
              kind="tertiary"
              renderIcon={Launch}
              onClick={() => handleOpenDeepDive(selectedNodeData)}
            >
              Open Deep Dive
            </Button>
          </div>
        )}
      </div>

      <div className="tc-fill" style={{ maxHeight: '280px', overflowY: 'auto' }}>
        {(selectedNodeData ? selectedNodeData.alerts : alerts.slice(0, 5)).map((a) => {
          const resName = a.resource?.name || a.resource?.hostname || '';
          const cleanName = resName.split('/').pop()?.split(':::')[0] || resName;
          const matchingNode = nodes3D.find((n) => n.id === cleanName || n.name === cleanName);

          return (
            <div
              key={a.id}
              className="alarm-drill-row"
              onClick={() => {
                if (matchingNode) handleFocusNode(matchingNode);
              }}
              onDoubleClick={() => {
                if (matchingNode) {
                  handleFocusNode(matchingNode);
                  handleOpenDeepDive(matchingNode);
                }
              }}
              title={matchingNode ? `Click to fly to ${matchingNode.name} in 3D | Double-click for Deep Dive` : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '2px',
                    background: severityHex(a.severity),
                    color: severityInk(a.severity),
                  }}
                >
                  Sev {a.severity}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#525252' }}>
                  {probeOf(a)} {matchingNode ? `➔ [${matchingNode.name}]` : ''}
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#161616' }}>{a.summary}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
