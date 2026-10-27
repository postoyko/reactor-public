/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The state behind a dashboard's filter bar: what is chosen in each field, the time range, the refresh interval, and
 * the fields a viewer added or removed for themselves (kept in this browser, localStorage 'db-bar-fields', per
 * dashboard). `gate` is what every widget that follows the bar tests its rows with.
 */

import { useEffect, useMemo, useState } from 'react';
import { DataHub } from './datahub';
import { passes, Range } from './FilterBar';
import { Dashboard, FilterBarConfig, QueryName, Row } from './types';

export type BarFields = Pick<FilterBarConfig, 'fields' | 'time'>;

const FIELDS_KEY = 'db-bar-fields';

export function useFilterBarState(active: Dashboard, designing: boolean, hub: DataHub) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [range, setRange] = useState<Range>({ preset: 'all' });
  const [refreshS, setRefreshS] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // People who only view a dashboard can still choose their own filter fields; kept in this browser, per dashboard.
  const [barOver, setBarOver] = useState<Record<string, BarFields>>(() => { try { return JSON.parse(window.localStorage.getItem(FIELDS_KEY) || '{}'); } catch (e) { return {}; } });
  const saveOver = (id: string, v: BarFields | undefined) => setBarOver(cur => {
    const next = { ...cur }; if (v) next[id] = v; else delete next[id];
    try { window.localStorage.setItem(FIELDS_KEY, JSON.stringify(next)); } catch (e) { /* no storage */ }
    return next;
  });
  const over = active.bar && !designing ? barOver[active.id] : undefined;
  const bar = useMemo(() => (active.bar && over ? { ...active.bar, fields: over.fields, time: over.time } : active.bar), [active.bar, over]);

  // another dashboard, or a bar with another default: start from its defaults
  const barPreset = bar ? bar.preset : undefined;
  const barRefresh = bar ? bar.refresh : undefined;
  useEffect(() => {
    setSel({});
    setRange({ preset: barPreset || 'all' });
    setRefreshS(barRefresh || 0);
    setNow(Date.now());
  }, [active.id, barPreset, barRefresh]);
  useEffect(() => { setNow(Date.now()); }, [range]);
  useEffect(() => {
    if (!bar || refreshS <= 0) return undefined;
    const id = window.setInterval(() => { hub.refresh(); setNow(Date.now()); }, refreshS * 1000);
    return () => window.clearInterval(id);
  }, [bar, refreshS, hub]);

  const gate = useMemo(() => (bar ? { key: JSON.stringify([sel, range, bar.fields, bar.time, bar.timeField, range.preset === 'all' ? 0 : now]), pass: (q: QueryName, r: Row) => passes(bar, sel, range, now, q, r) } : undefined), [bar, sel, range, now]);

  return { bar, over, barOver, saveOver, sel, setSel, range, setRange, refreshS, setRefreshS, gate };
}
