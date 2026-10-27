/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Which chart drives a gauge's colour bands (carbon-charts.tsx draws them). Plain data, no React, so it can be tested.
 */

import { DEFAULT_GROUP } from './rows';
import { Widget } from './types';
import { canSend } from './Wiring';

/**
 * The field a gauge's colour bands follow: that of the chart which sends its selections to the gauge (a pie, donut,
 * bar chart ...: same data, grouped by a field, and wired to the gauge or to every widget). One wired to this gauge
 * by name wins over one that reaches every widget.
 */
export function bandFieldFor(all: Widget[], gauge: Widget): string | undefined {
  if (gauge.config.listens === false) return undefined;
  const drivers = all.filter(s => s.id !== gauge.id && s.config.query === gauge.config.query && canSend(s) && !s.config.bind
    && (!s.config.sendTo || s.config.sendTo.includes(gauge.id)) && (s.config.groupBy || DEFAULT_GROUP[s.config.query]) && !/Gauge|Meter/.test(s.type));
  const s = drivers.find(x => x.config.sendTo) || drivers[0];
  return s ? (s.config.groupBy || DEFAULT_GROUP[s.config.query]) : undefined;
}
