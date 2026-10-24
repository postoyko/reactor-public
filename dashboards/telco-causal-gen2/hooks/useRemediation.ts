/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertItem } from '../logic';
import { resolveMeshProps } from './resolveMeshProps';
import { useMeshUiState } from './useMeshUiState';

export function useRemediation(m: ReturnType<typeof resolveMeshProps> & ReturnType<typeof useMeshUiState>) {
  const { activeRemediationAlert, isExecutingRemediation, mountedRef, onExecuteRemediation, remediationTimers, setActiveRemediationAlert, setExecutedPolicies, setIsExecutingRemediation, setTerminalLogs } = m;
  // ── Remediation console ─────────────────────────────────────────────────────

  const stamp = () => `[${new Date().toISOString()}]`;
  const appendLog = (...lines: string[]) => {
    if (mountedRef.current) setTerminalLogs(prev => [...prev, ...lines]);
  };
  const closeRemediation = () => {
    remediationTimers.current.forEach(t => window.clearTimeout(t));
    remediationTimers.current = [];
    setIsExecutingRemediation(false);
    setActiveRemediationAlert(null);
  };
  const handleOpenRemediationModal = (alert: AlertItem) => {
    setActiveRemediationAlert(alert);
    const rb = alert.insights?.find(i => i.type?.includes('runbook'))?.details;
    setTerminalLogs([
      `${stamp()} Remediation console opened.`,
      `${stamp()} Target resource: ${alert.resource?.name || 'unknown'}`,
      `${stamp()} Runbook policy: ${rb?.policyId || 'none attached to this alert'}`,
      onExecuteRemediation
        ? `${stamp()} A remediation handler is configured. Confirming will call it.`
        : `${stamp()} SIMULATION MODE: no remediation handler is configured, so confirming runs nothing on the network.`,
    ]);
  };
  const handleRunRemediation = async () => {
    const alert = activeRemediationAlert;
    if (!alert || isExecutingRemediation) return;
    setIsExecutingRemediation(true);

    if (onExecuteRemediation) {
      appendLog(`${stamp()} Calling the remediation handler...`);
      try {
        const result = await onExecuteRemediation(alert);
        appendLog(`${stamp()} ${result.ok ? 'COMPLETED' : 'FAILED'}: ${result.message}`);
        if (result.ok && mountedRef.current) setExecutedPolicies(prev => ({ ...prev, [alert.id]: 'done' }));
      } catch (e) {
        appendLog(`${stamp()} FAILED: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (mountedRef.current) setIsExecutingRemediation(false);
      }
      return;
    }

    const rb = alert.insights?.find(i => i.type?.includes('runbook'))?.details;
    remediationTimers.current.push(window.setTimeout(() => {
      appendLog(`${stamp()} SIMULATION: would dispatch runbook policy ${rb?.policyId || '(none)'} for ${alert.resource?.name || 'the resource'}.`);
    }, 600));
    remediationTimers.current.push(window.setTimeout(() => {
      appendLog(`${stamp()} SIMULATION COMPLETE: nothing was executed and no alert was changed.`);
      if (mountedRef.current) {
        setIsExecutingRemediation(false);
        setExecutedPolicies(prev => ({ ...prev, [alert.id]: 'simulated' }));
      }
    }, 1400));
  };

  return { closeRemediation, handleOpenRemediationModal, handleRunRemediation };
}
