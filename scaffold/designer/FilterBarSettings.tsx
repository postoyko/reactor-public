/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The toolbar's Filters pop-over: turn the dashboard-wide filter bar on, choose its fields, the time range and the refresh.
 */

import React, { useState } from 'react';
import { Filter as FilterIcon } from '@carbon/icons-react';
import Menu from './Menu';
import { REFRESHES } from './FilterBar';
import FilterFields from './FilterFields';
import { FilterBarConfig, TIME_PRESETS, TimePreset } from './types';

const DEFAULT_BAR: FilterBarConfig = { fields: [{ query: 'getAlerts', field: 'severityLabel' }, { query: 'getAlerts', field: 'team' }], time: true, preset: 'all' };

const SEEN = 'db-filters-seen';
const wasSeen = (): boolean => { try { return window.localStorage.getItem(SEEN) === '1'; } catch (e) { return true; } };

export default function FilterBarSettings({ bar, onChange }: { bar?: FilterBarConfig; onChange: (b: FilterBarConfig | undefined) => void }) {
  const [seen, setSeen] = useState(wasSeen);
  const mark = () => { try { window.localStorage.setItem(SEEN, '1'); } catch (e) { /* no storage */ } setSeen(true); };
  return (
    <Menu align="left" trigger={({ open, toggle: t }) => (
      <button type="button" data-tour="filters" className={`db-tb${open || bar ? ' is-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} title="Dashboard-wide filter bar and time range" onClick={() => { mark(); t(); }}>
        <FilterIcon size={16} aria-hidden="true" />Filters
        {!bar && !seen && <span className="db-tb-new">Turn on</span>}
      </button>
    )}>
      {() => (
        <div className="db-fbset" role="dialog" aria-label="Filter bar settings">
          <label className="db-check">
            <input type="checkbox" checked={Boolean(bar)} onChange={e => onChange(e.target.checked ? DEFAULT_BAR : undefined)} />{' '}
            <strong>Show a filter bar on this dashboard</strong>
          </label>
          <p className="db-hint"><strong>Recommended for every shared dashboard.</strong> One strip at the top that narrows every widget at once, so people can slice what they see by severity, team, type or time. A widget can opt out in its own settings.</p>
          {bar && (
            <>
              <FilterFields bar={bar} onChange={onChange} />
              {bar.time && (
                <div className="db-fbset-row">
                  <label>Alerts are filtered by
                    <select value={bar.timeField || 'firstOccurrence'} onChange={e => onChange({ ...bar, timeField: e.target.value as FilterBarConfig['timeField'] })}>
                      <option value="firstOccurrence">First occurrence</option>
                      <option value="lastOccurrence">Last occurrence</option>
                    </select>
                  </label>
                  <label>Opens on
                    <select value={bar.preset || 'all'} onChange={e => onChange({ ...bar, preset: e.target.value as TimePreset })}>
                      {TIME_PRESETS.filter(p => p.id !== 'custom').map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <div className="db-fbset-row">
                <label>Auto-refresh
                  <select value={bar.refresh || 0} onChange={e => onChange({ ...bar, refresh: Number(e.target.value) || undefined })}>
                    {REFRESHES.map(r => <option key={r.s} value={r.s}>{r.label}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}
        </div>
      )}
    </Menu>
  );
}
