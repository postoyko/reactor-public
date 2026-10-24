/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pivoting: while viewing, a chart can be regrouped by another field without opening the designer.
 */

import { carbonSpec } from './carbon-specs';
import { DEFAULT_GROUP, fieldsOf } from './rows';
import { Widget } from './types';

/** The same ordered list for every chart on a data source, so the dropdowns agree: everything worth grouping by, without ids, hashes and free text. */
const CHOICES: Record<string, string[]> = {
  getAlerts: ['severityLabel', 'state', 'sender', 'type', 'team', 'service', 'resource', 'owner', 'acknowledged', 'inIncident', 'incidentCount',
    'runbookName', 'runbookAutomated', 'runbooks', 'criticality', 'entityType', 'topologyGroup', 'anomaly', 'seasonal', 'goldenSignal', 'logFixes', 'causalLinks', 'eventCount', 'recurrence', 'summary'],
  getStories: ['priority', 'state', 'team', 'service', 'owner', 'runbooks', 'title'],
  getApplications: ['name', 'severityLabel', 'type', 'criticality', 'priority'],
  getMetricSeries: []
};

/** The fields a chart can be regrouped by (null when the widget is not a grouped chart). */
export function pivotFields(w: Widget): Array<{ key: string; label: string }> | null {
  return w.config.pivot === false ? null : pivotChoices(w);
}

/** Like pivotFields, ignoring the designer's "viewers can regroup" switch (for the settings panel). */
export function pivotChoices(w: Widget): Array<{ key: string; label: string }> | null {
  const grouped = w.type === 'bar' || w.type === 'donut' || Boolean(carbonSpec(w.type)?.chart?.group);
  const q = w.config.query;
  if (!grouped || !q) return null;
  const all = fieldsOf(q);
  const keys = [...(CHOICES[q] || [])];
  const cur = w.config.groupBy || DEFAULT_GROUP[q];
  if (cur && !keys.includes(cur)) keys.push(cur); // a chart grouped by something unusual keeps it selectable, at the end so the order never shifts
  const list = keys.map(k => all.find(f => f.key === k)).filter((f): f is NonNullable<typeof f> => Boolean(f)).map(f => ({ key: f.key, label: f.label }));
  return list.length > 1 ? list : null;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A pivoted chart's title follows the pivot: "Incidents by priority" becomes "Incidents by team"; a title that does not name the field gets " by Team" added. */
export function retitle(title: string, oldLabel: string, newLabel: string): string {
  const m = new RegExp(`\\bby\\s+${escRe(oldLabel)}\\b`, 'i').exec(title);
  if (m) {
    const lower = m[0].slice(3).trim() === m[0].slice(3).trim().toLowerCase();
    return title.slice(0, m.index) + 'by ' + (lower ? newLabel.toLowerCase() : newLabel) + title.slice(m.index + m[0].length);
  }
  return `${title.replace(/\s+by\s+[^()]+$/i, '')} by ${newLabel.toLowerCase()}`;
}
