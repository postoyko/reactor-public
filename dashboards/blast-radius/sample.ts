/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Example alerts and incidents, used only when the person clicks "Load sample data" (for a look at the dashboard outside
 * a Concert Operate environment). The dashboard labels it as sample data whenever it is shown.
 */

import { Alert, Incident, resolveGroups } from './logic';

const MIN = 60000;

export function sampleData(now: number): { alerts: Alert[]; incidents: Incident[] } {
  let n = 0;
  const alerts: Alert[] = [];
  const mk = (res: string, sev: number, summary: string, minAgo: number, opts: { closedMin?: number; sender?: string; rank?: number; parent?: string } = {}) => {
    const id = `sample-a${++n}`;
    const first = now - minAgo * MIN;
    alerts.push({ id, summary, severity: sev, state: opts.closedMin !== undefined ? 'clear' : 'open', first, last: first + Math.min(minAgo, 6) * MIN * 0.8, closed: opts.closedMin !== undefined ? now - opts.closedMin * MIN : undefined, sender: opts.sender || ['Instana', 'Prometheus', 'SevOne', 'Netcool'][n % 4], resource: res, type: 'Problem', parent: opts.parent });
    return id;
  };
  // Incident 1: a core router fault spreads outward.
  const i1: string[] = [];
  const rootA = mk('core-rtr-fra-02', 6, 'Interface Te0/1/0/3 down, BGP session lost', 38, { sender: 'SevOne' });
  i1.push(rootA, mk('core-rtr-fra-02', 6, 'Packet loss 38% on uplink', 37), mk('core-rtr-fra-02', 5, 'CPU 97% for 5 min', 36));
  const effects1: Array<[string, number, string, number]> = [
    ['agg-sw-fra-11', 5, 'Uplink to core-rtr-fra-02 flapping', 35], ['agg-sw-fra-12', 5, 'Uplink to core-rtr-fra-02 flapping', 35],
    ['bng-fra-01', 6, 'PPPoE sessions dropped by 61%', 33], ['olt-fra-07', 5, 'ONT loss of signal, 212 subscribers', 31],
    ['olt-fra-09', 4, 'ONT loss of signal, 48 subscribers', 30], ['dns-res-fra-01', 5, 'Query timeouts to upstream resolvers', 29],
    ['api-gw-eu-1', 5, 'Upstream 5xx rate 14%', 27], ['auth-svc-eu', 4, 'Login latency p95 4.1 s', 26], ['cdn-edge-fra', 4, 'Origin fetch errors', 25]
  ];
  let aggId = '';
  const under11 = ['olt-fra-07', 'olt-fra-09'];
  effects1.forEach(([r, s, t, m]) => {
    const id = mk(r, s, t, m, { parent: under11.includes(r) ? aggId : undefined }); i1.push(id); if (r === 'agg-sw-fra-11') aggId = id;
    if (s >= 5) i1.push(mk(r, 4, t.replace(/\d+/, x => String(Number(x) + 3)), m - 1));
  });
  // Incident 2: a database problem with a smaller blast radius.
  const i2: string[] = [];
  const rootB = mk('billing-db-01', 6, 'Replication lag 480 s, connections exhausted', 14);
  i2.push(rootB, mk('billing-db-01', 5, 'Disk latency 220 ms', 13));
  let apiId = '';
  [['billing-api', 5, 'DB timeouts on /invoice', 12], ['usage-collector', 4, 'Write queue backing up', 11], ['crm-portal', 4, 'Slow page loads', 9], ['payments-svc', 5, 'Charge requests failing', 8]].forEach(([r, s, t, m]) => {
    const id = mk(r as string, s as number, t as string, m as number, { parent: r === 'usage-collector' || r === 'payments-svc' ? apiId : undefined }); i2.push(id); if (r === 'billing-api') apiId = id;
  });
  // Unrelated noise, some already cleared.
  mk('k8s-node-w12', 3, 'Memory pressure on node', 22, { closedMin: 12 }); mk('k8s-node-w07', 4, 'Pod restarts: 6 in 10 min', 19);
  mk('backup-nas-02', 3, 'Backup job exceeded window', 45, { closedMin: 30 }); mk('ups-fra-03', 4, 'Battery self-test failed', 52);
  mk('cdn-edge-ams', 3, 'Cache hit ratio below 70%', 6); mk('mail-relay-01', 4, 'Queue depth 3,200', 17, { closedMin: 4 });
  const ranks = (ids: string[], root: string): Record<string, number> => { const r: Record<string, number> = {}; ids.forEach((id, k) => { r[id] = id === root ? 1 : k + 2; }); return r; };
  const incidents: Incident[] = [
    { id: 'sample-inc-1', title: 'Frankfurt access network degraded', priority: 1, state: 'open', alertIds: i1, created: now - 34 * MIN, ranks: ranks(i1, rootA) },
    { id: 'sample-inc-2', title: 'Billing and payments slow or failing', priority: 2, state: 'open', alertIds: i2, created: now - 11 * MIN, ranks: ranks(i2, rootB) }
  ];
  return { alerts: resolveGroups(alerts), incidents };
}
