/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The dashboard-wide filter bar: a dropdown for each chosen field (listing the values found in the live data), an optional
 * time range and an optional auto-refresh. Everything on the dashboard that uses that data follows it, unless a widget opts out.
 */

import React, { useEffect, useMemo, useReducer } from 'react';
import { MultiSelect } from '@carbon/react';
import { Close } from '@carbon/icons-react';
import { DataHub, sourceKey } from './datahub';
import { fieldLabel, fieldsOf } from './rows';
import { shapeOf } from './sources';
import { BarField, FilterBarConfig, QueryName, Row, TIME_PRESETS, TimePreset } from './types';

export const selKey = (f: BarField) => `${f.query}|${f.field}`;
export interface Range { preset: TimePreset; from?: string; to?: string }
export const REFRESHES = [{ s: 0, label: 'Off' }, { s: 15, label: '15 s' }, { s: 30, label: '30 s' }, { s: 60, label: '1 min' }, { s: 300, label: '5 min' }];

/** The alert time a bar filters on; incidents always use their created time. */
export const barTimeField = (bar: FilterBarConfig, query: QueryName): string => (shapeOf(query) === 'stories' ? 'created' : bar.timeField || 'firstOccurrence');

/** Resolves a range to [from, to] in milliseconds (null = open end). */
export function rangeBounds(r: Range, now: number): [number | null, number | null] {
  if (r.preset === 'all') return [null, null];
  if (r.preset === 'custom') {
    const a = r.from ? Date.parse(r.from) : NaN, b = r.to ? Date.parse(r.to) : NaN;
    return [Number.isFinite(a) ? a : null, Number.isFinite(b) ? b : null];
  }
  const p = TIME_PRESETS.find(x => x.id === r.preset);
  return [p && p.ms ? now - p.ms : null, null];
}

/** Does this row pass the bar's selections and time range? */
export function passes(bar: FilterBarConfig, sel: Record<string, string[]>, range: Range, now: number, query: QueryName, row: Row): boolean {
  for (const f of bar.fields) {
    if (f.query !== query && !(shapeOf(f.query) === shapeOf(query) && (shapeOf(query) === 'alerts' || shapeOf(query) === 'stories'))) continue;
    const v = sel[selKey(f)];
    if (v && v.length && !v.includes(String(row[f.field] ?? ''))) return false;
  }
  if (bar.time && (shapeOf(query) === 'alerts' || shapeOf(query) === 'stories')) {
    const [a, b] = rangeBounds(range, now);
    if (a !== null || b !== null) {
      const t = Date.parse(String(row[barTimeField(bar, query)] ?? ''));
      if (!Number.isFinite(t) || (a !== null && t < a) || (b !== null && t > b)) return false;
    }
  }
  return true;
}

/** Fields worth filtering on (text fields with few distinct values), for the settings list. */
export const BAR_CHOICES: BarField[] = (['getAlerts', 'getStories', 'getApplications'] as QueryName[]).flatMap(q =>
  fieldsOf(q).filter(f => f.kind !== 'time' && !['id', 'summary', 'description', 'title', 'alertCount', 'severity', 'signature', 'causalGroup', 'runbookIds'].includes(f.key)).map(f => ({ query: q, field: f.key })));

interface Props {
  bar: FilterBarConfig;
  hub: DataHub;
  sel: Record<string, string[]>;
  onSel: (key: string, values: string[]) => void;
  range: Range;
  onRange: (r: Range) => void;
  refresh: number;
  onRefresh: (s: number) => void;
  onClear: () => void;
  /** Rendered at the end of the row (the runtime "Fields" button). */
  extra?: React.ReactNode;
}

export default function FilterBar({ bar, hub, sel, onSel, range, onRange, refresh, onRefresh, onClear, extra }: Props) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const queries = Array.from(new Set(bar.fields.map(f => f.query)));
  const qKey = queries.join(',');
  useEffect(() => {
    hub.directory().then(bump);
    const stops = qKey.split(',').filter(Boolean).map(q => hub.acquire(q as QueryName, undefined, 0, bump));
    return () => stops.forEach(s => s());
  }, [hub, qKey]);

  const options = (f: BarField): string[] => {
    const rows = hub.snapshot(sourceKey(f.query, undefined)).rows;
    const n = new Map<string, number>();
    rows.forEach(r => { const v = r[f.field]; if (v !== undefined && v !== '') n.set(String(v), (n.get(String(v)) || 0) + 1); });
    const known = hub.directoryNames(f.field).filter(v => !n.has(v)); // real people and teams, even those with no alerts yet
    const have = (sel[selKey(f)] || []).filter(v => !n.has(v) && !known.includes(v));
    return [...Array.from(n.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 200).map(x => x[0]), ...known, ...have];
  };

  const chips = bar.fields.flatMap(f => (sel[selKey(f)] || []).map(v => ({ f, v })));
  const timeActive = bar.time && range.preset !== 'all';
  const active = chips.length > 0 || Boolean(timeActive);
  const live = useMemo(() => new Date().toLocaleTimeString(), [range, sel]);

  return (
    <section className="db-filterbar" aria-label="Dashboard filters">
      <div className="db-fb-row">
        {bar.fields.map(f => (
          <div key={selKey(f)} className="db-fb-field">
            <MultiSelect
              id={`db-fb-${selKey(f).replace(/\W/g, '_')}`}
              titleText={fieldLabel(f.query, f.field)}
              hideLabel
              label={`Any ${fieldLabel(f.query, f.field).toLowerCase()}`}
              size="sm"
              items={options(f)}
              itemToString={(i: string) => String(i)}
              selectedItems={sel[selKey(f)] || []}
              onChange={(e: { selectedItems?: string[] | null }) => onSel(selKey(f), (e.selectedItems || []) as string[])}
            />
          </div>
        ))}
        {extra}
        {bar.time && (
          <div className="db-fb-field db-fb-time">
            <label htmlFor="db-fb-range">Time range</label>
            <select id="db-fb-range" value={range.preset} onChange={e => onRange({ ...range, preset: e.target.value as TimePreset })}>
              {TIME_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        )}
        {bar.time && range.preset === 'custom' && (
          <>
            <div className="db-fb-field"><label htmlFor="db-fb-from">From</label><input id="db-fb-from" type="datetime-local" value={range.from || ''} onChange={e => onRange({ ...range, from: e.target.value })} /></div>
            <div className="db-fb-field"><label htmlFor="db-fb-to">To</label><input id="db-fb-to" type="datetime-local" value={range.to || ''} onChange={e => onRange({ ...range, to: e.target.value })} /></div>
          </>
        )}
        <div className="db-fb-field db-fb-end">
          <label htmlFor="db-fb-refresh">Refresh</label>
          <select id="db-fb-refresh" value={refresh} onChange={e => onRefresh(Number(e.target.value))}>
            {REFRESHES.map(r => <option key={r.s} value={r.s}>{r.label}</option>)}
          </select>
        </div>
      </div>
      {active && (
        <div className="db-fb-chips" aria-live="polite">
          {chips.map(({ f, v }) => (
            <button key={`${selKey(f)}=${v}`} type="button" className="db-fb-chip" title="Remove this filter" onClick={() => onSel(selKey(f), (sel[selKey(f)] || []).filter(x => x !== v))}>
              {fieldLabel(f.query, f.field)}: {v} <Close size={12} aria-hidden="true" />
            </button>
          ))}
          {timeActive && (
            <button type="button" className="db-fb-chip" title="Back to all time" onClick={() => onRange({ preset: 'all' })}>
              {TIME_PRESETS.find(p => p.id === range.preset)?.label} <Close size={12} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="db-link" onClick={onClear}>Clear all</button>
          <span className="db-fb-live" title="When the filters were last changed">{live}</span>
        </div>
      )}
    </section>
  );
}
