/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { IncidentItem } from './logic';

export const MAX_INCIDENT_CARDS = 12;

export const rootAlertIdOf = (inc: IncidentItem): string | null => {
  let rootAlertId: string | null = null;
  inc.insights?.forEach(ins => {
    if (ins.type?.includes('probable-cause') && ins.details?.id) {
      if (!rootAlertId || ins.details.rank === 1) rootAlertId = ins.details.id;
    }
  });
  return rootAlertId;
};

export const formatOffset = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `t - ${m}m ${String(s).padStart(2, '0')}s` : `t - ${s}s`;
};
