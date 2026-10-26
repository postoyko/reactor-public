/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * What a typed field can offer from live data, so nobody has to find an id by hand: open incidents for an incident
 * id. Plain data, no React; PickInput.tsx draws the list.
 */

import { QueryName, Row } from './types';

export type PickKind = 'incident' | 'filterType';

export interface PickOption { value: string; label: string; sub?: string }

interface PickSpec {
  /** The source the options come from; none = a fixed list. */
  query?: QueryName;
  fixed?: PickOption[];
  /** Fields that hold several values separated by commas: picking adds to the list. */
  multi?: boolean;
  options: (rows: Row[]) => PickOption[];
}

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

export const PICKS: Record<PickKind, PickSpec> = {
  incident: {
    query: 'getStories',
    options: rows => rows.filter(r => text(r.id)).map(r => ({
      value: text(r.id),
      label: text(r.title) || text(r.id),
      sub: [text(r.id), r.priority !== undefined && r.priority !== '' ? `P${text(r.priority)}` : '', text(r.state)].filter(Boolean).join(' · ')
    }))
  },
  filterType: {
    fixed: [{ value: 'alert', label: 'alert', sub: 'alert filters' }, { value: 'incident', label: 'incident', sub: 'incident filters' }],
    options: () => []
  }
};

/** The part of the field being typed: all of it, or for a list the text after the last comma. */
export function currentTerm(value: string, multi?: boolean): string {
  if (!multi) return value.trim();
  const i = value.lastIndexOf(',');
  return (i < 0 ? value : value.slice(i + 1)).trim();
}

/** The field after picking `chosen`: replaces the whole value, or for a list the term being typed. */
export function applyPick(value: string, chosen: string, multi?: boolean): string {
  if (!multi) return chosen;
  const i = value.lastIndexOf(',');
  const head = i < 0 ? '' : `${value.slice(0, i + 1).trimEnd()} `;
  return `${head}${chosen}`;
}

/**
 * Options that match what is being typed, best first: those starting with it, then those containing it (in the
 * label, value or detail line). Values already in a list are left out. At most `limit`.
 */
export function matchOptions(all: PickOption[], value: string, multi?: boolean, limit = 50): PickOption[] {
  const term = currentTerm(value, multi).toLowerCase();
  const taken = new Set(multi ? value.split(',').slice(0, -1).map(x => x.trim().toLowerCase()).filter(Boolean) : []);
  const seen = new Set<string>();
  const starts: PickOption[] = [];
  const contains: PickOption[] = [];
  for (const o of all) {
    const key = o.value.toLowerCase();
    if (seen.has(key) || taken.has(key)) continue;
    seen.add(key);
    const hay = `${o.label} ${o.value} ${o.sub || ''}`.toLowerCase();
    if (!term || o.label.toLowerCase().startsWith(term) || key.startsWith(term)) starts.push(o);
    else if (hay.includes(term)) contains.push(o);
  }
  return [...starts, ...contains].slice(0, limit);
}
