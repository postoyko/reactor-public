/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The list of fields a filter bar can offer, as checkboxes. Shared by the designer's Filters pop-over and by the
 * "Fields" button on the bar itself, so people who only view a dashboard can choose their own filters at runtime.
 */

import React from 'react';
import { BAR_CHOICES } from './FilterBar';
import { fieldLabel } from './rows';
import { SOURCES } from './sources';
import { BarField, FilterBarConfig, QueryName } from './types';

export const QNAME = Object.fromEntries(SOURCES.map(x => [x.id, x.id === 'getMetricSeries' ? 'Metrics' : x.label])) as Record<QueryName, string>;

export default function FilterFields({ bar, onChange }: { bar: FilterBarConfig; onChange: (b: FilterBarConfig) => void }) {
  const has = (f: BarField) => bar.fields.some(x => x.query === f.query && x.field === f.field);
  const toggle = (f: BarField) => onChange({ ...bar, fields: has(f) ? bar.fields.filter(x => !(x.query === f.query && x.field === f.field)) : [...bar.fields, f] });
  return (
    <>
      {(['getAlerts', 'getStories', 'getApplications'] as QueryName[]).map(q => (
        <fieldset key={q} className="db-checks">
          <legend>{QNAME[q]} fields</legend>
          {BAR_CHOICES.filter(f => f.query === q).map(f => (
            <label key={f.field} className="db-check"><input type="checkbox" checked={has(f)} onChange={() => toggle(f)} />{' '}{fieldLabel(f.query, f.field)}</label>
          ))}
        </fieldset>
      ))}
      <label className="db-check">
        <input type="checkbox" checked={Boolean(bar.time)} onChange={e => onChange({ ...bar, time: e.target.checked })} />{' '}Time range
      </label>
    </>
  );
}

/** The pop-over opened from the bar at runtime. */
export function FilterFieldsMenu({ bar, onChange, onReset, changed }: { bar: FilterBarConfig; onChange: (b: FilterBarConfig) => void; onReset: () => void; changed: boolean }) {
  return (
    <div className="db-fbset" role="dialog" aria-label="Choose filters">
      <p className="db-hint">Choose which filters show on this bar. This changes only what you see{changed ? ' (not the saved dashboard)' : ''}.</p>
      <FilterFields bar={bar} onChange={onChange} />
      {changed && <button type="button" className="db-link" onClick={onReset}>Back to this dashboard's filters</button>}
    </div>
  );
}
