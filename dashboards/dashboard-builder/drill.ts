/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Drill-through: what happens when you click a bar, a slice, a table row or a number. The rows behind it open in a
 * side panel, or an address opens with the clicked values filled in ("/incidents/{id}").
 */

import { fieldsOf } from './rows';
import { Filter, QueryName, Row } from './types';

export interface Drill { mode: 'details' | 'link'; url?: string; newTab?: boolean }

export interface DrillRequest {
  title: string;
  query: QueryName;
  rows: Row[];
  columns?: string[];
  /** Address template for an Open button on each row (details) */
  url?: string;
  newTab?: boolean;
}

/** Only web and in-app addresses: never javascript: or data: */
export const safeUrl = (u: string): boolean => /^(https?:\/\/|\/|#)/i.test(u.trim());

/** Replaces {field} with the clicked value, encoded for use in an address. */
export function fillUrl(tpl: string, rec: Record<string, unknown>): string {
  return tpl.replace(/\{([A-Za-z0-9_.]+)\}/g, (_m, k: string) => encodeURIComponent(rec[k] === undefined || rec[k] === null ? '' : String(rec[k])));
}

export function openAddress(tpl: string, rec: Record<string, unknown>, newTab: boolean): void {
  const u = fillUrl(tpl, rec);
  if (!u || !safeUrl(u)) return;
  if (newTab) window.open(u, '_blank', 'noopener,noreferrer'); else window.location.assign(u);
}

/** "?db=severityLabel:Critical;state:open" opens the dashboard already filtered (for links from another dashboard). */
export function urlFilters(search: string): Filter[] {
  const raw = new URLSearchParams(search).get('db');
  if (!raw) return [];
  const out: Filter[] = [];
  raw.split(';').slice(0, 8).forEach(pair => {
    const i = pair.indexOf(':');
    if (i < 1) return;
    const field = pair.slice(0, i); const value = pair.slice(i + 1);
    (['getAlerts', 'getStories'] as const).forEach(q => { if (value && fieldsOf(q).some(f => f.key === field)) out.push({ from: '__url__', query: q, field, value }); });
  });
  return out;
}
