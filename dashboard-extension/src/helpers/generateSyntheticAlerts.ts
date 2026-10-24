/**
 * © Copyright IBM Corp. 2025
 * SPDX-License-Identifier: Apache-2.0
 */

import { ALERT_QUERY_PARAMS } from '../components/constants';

/**
 * Deterministic `getAlerts`-shaped data for stories and load tests.
 * Uses a small LCG so snapshots and benchmarks are repeatable.
 */
export default function generateSyntheticAlerts(resourceCount: number, alertsPerResource = 3, seed = 42) {
  const columns = ALERT_QUERY_PARAMS.columns;
  const idx = (name: string) => columns.indexOf(name);
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];

  const senders = Array.from({ length: Math.max(3, Math.round(resourceCount / 40)) }, (_, i) => `source-${i + 1}`);
  const teams = ['platform', 'network', 'database', 'security', 'sre'];
  const types = ['Utilization', 'Availability', 'Latency', 'Capacity', 'Configuration'];

  const rows: Array<{ fields: Array<string | null> }> = [];
  for (let r = 0; r < resourceCount; r++) {
    const resource = `resource-${r + 1}`;
    const count = 1 + Math.floor(rand() * alertsPerResource);
    for (let a = 0; a < count; a++) {
      const fields: Array<string | null> = columns.map((): string | null => null);
      fields[idx('severity')] = String(1 + Math.floor(rand() * 6));
      fields[idx('state')] = 'open';
      fields[idx('summary')] = `Synthetic alert ${r + 1}.${a + 1}`;
      fields[idx('resource.name')] = resource;
      fields[idx('sender.name')] = pick(senders);
      fields[idx('team')] = pick(teams);
      fields[idx('type.classification')] = pick(types);
      rows.push({ fields });
    }
  }

  return {
    tenant: {
      alerts: {
        columns: columns.map(name => ({ type: 'string', name })),
        rows
      }
    }
  };
}
