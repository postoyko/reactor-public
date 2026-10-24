/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Modal } from '@carbon/react';
import { useMesh } from '../../MeshContext';

export function RemediationModal(): JSX.Element {
  const { activeRemediationAlert, closeRemediation, handleRunRemediation, isExecutingRemediation, onExecuteRemediation, terminalLogs } = useMesh();
  return (
    <>
      {activeRemediationAlert && (
        <Modal
          open={Boolean(activeRemediationAlert)}
          modalHeading={onExecuteRemediation ? 'Remediation Console' : 'Remediation Console (simulation)'}
          primaryButtonText={isExecutingRemediation ? 'Running...' : onExecuteRemediation ? 'Confirm & Execute Action' : 'Run simulation'}
          secondaryButtonText="Dismiss"
          onRequestClose={closeRemediation}
          onRequestSubmit={handleRunRemediation}
          primaryButtonDisabled={isExecutingRemediation}
          size="lg"
        >
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '6px' }}>
              Target Alarm: <strong>{activeRemediationAlert.summary}</strong>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Resource: {activeRemediationAlert.resource?.name || 'Network Element'} | Severity: Sev {activeRemediationAlert.severity}
            </div>
          </div>

          <div
            style={{
              background: '#f4f4f4',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              padding: '12px 14px',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              color: '#0f62fe',
              maxHeight: '220px',
              overflowY: 'auto',
              lineHeight: 1.6,
            }}
          >
            {terminalLogs.map((log, idx) => (
              <div key={idx} style={{ color: log.includes('COMPLETED') ? '#198038' : log.includes('FAILED') ? '#da1e28' : log.includes('SIMULATION') ? '#0f62fe' : '#525252' }}>
                {log}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
