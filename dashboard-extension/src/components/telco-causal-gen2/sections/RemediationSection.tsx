/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Tag } from '@carbon/react';
import { CheckmarkOutline, Play } from '@carbon/icons-react';
import { useMesh } from '../MeshContext';

export function RemediationSection(): JSX.Element {
  const { alerts, executedPolicies, handleFocusNode, handleOpenRemediationModal, nodes3D, selectedNodeData } = useMesh();
  return (
    <div className="causal-card">
      <div className="card-title">
        {selectedNodeData && selectedNodeData.runbooks.length > 0
          ? `Automated Remediation Policies for [${selectedNodeData.name}]`
          : 'Autonomous Closed-Loop Remediation Flight Deck'}
      </div>

      <div className="tc-fill" style={{ maxHeight: '280px', overflowY: 'auto' }}>
        {alerts
          .filter((a) => a.insights?.some((i) => i.type?.includes('runbook')))
          .slice(0, 4)
          .map((a) => {
            const rb = a.insights?.find((i) => i.type?.includes('runbook'))?.details;
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
                title={matchingNode ? `Click to fly to ${matchingNode.name} in 3D` : undefined}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#0f62fe', fontWeight: 700 }}>
                    Policy: {rb?.policyId || '(no policy id)'}
                  </span>
                  <Tag type={rb?.isAutomated ? 'green' : 'blue'}>
                    {rb?.isAutomated ? 'Automated' : 'Assisted'}
                  </Tag>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#161616', marginBottom: '6px' }}>
                  {a.summary}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: '#525252' }}>
                    Target: {a.resource?.name || 'Network Element'} {matchingNode ? `➔ [${matchingNode.name}]` : ''}
                  </div>
                  <Button
                    size="sm"
                    kind={executedPolicies[a.id] ? 'secondary' : 'primary'}
                    renderIcon={executedPolicies[a.id] ? CheckmarkOutline : Play}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenRemediationModal(a);
                    }}
                  >
                    {executedPolicies[a.id] === 'done' ? 'Remediated' : executedPolicies[a.id] === 'simulated' ? 'Simulated' : 'Open console'}
                  </Button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
