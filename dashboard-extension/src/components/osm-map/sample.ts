/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Made-up alerts and sites, shown only when the user chooses "Use sample data".
 */

import { Alert, Site } from './logic';

export const SAMPLE_SITES: Site[] = [
  { id: 'lon', name: 'London', lat: 51.5072, lng: -0.1276, match: ['lon-'] },
  { id: 'par', name: 'Paris', lat: 48.8566, lng: 2.3522, match: ['par-'] },
  { id: 'fra', name: 'Frankfurt', lat: 50.1109, lng: 8.6821, match: ['fra-'] },
  { id: 'mad', name: 'Madrid', lat: 40.4168, lng: -3.7038, match: ['mad-'] },
  { id: 'mil', name: 'Milan', lat: 45.4642, lng: 9.19, match: ['mil-'] },
];

const A = (n: number, severity: number, resource: string, summary: string): Alert =>
  ({ id: `sample-${n}`, severity, state: 'open', summary, resource, sender: 'sample' });

export const SAMPLE_ALERTS: Alert[] = [
  A(1, 6, 'lon-core-01', 'Link down on uplink 3'),
  A(2, 5, 'lon-core-02', 'High CPU on routing engine'),
  A(3, 3, 'lon-edge-07', 'Packet loss above threshold'),
  A(4, 5, 'par-agg-01', 'BGP session flapping'),
  A(5, 4, 'par-agg-02', 'Fan speed low'),
  A(6, 6, 'fra-core-01', 'Power supply failed'),
  A(7, 4, 'fra-edge-03', 'Interface errors increasing'),
  A(8, 2, 'mad-edge-02', 'Configuration changed'),
  A(9, 3, 'mil-agg-01', 'Latency above baseline'),
  A(10, 4, 'unknown-host-9', 'Disk usage above 85%'),
];
