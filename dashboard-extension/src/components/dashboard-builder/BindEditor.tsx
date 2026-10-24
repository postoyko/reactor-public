/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings of a value input (text box, number, slider, switch, chooser): which field of which data its value filters,
 * and how it is compared. Which widgets it filters is set by wiring (Wire mode or the Wiring tab).
 */

import React from 'react';
import { Select, SelectItem, Toggle } from '@carbon/react';
import { defaultOp } from './bindings';
import { fieldsOf } from './rows';
import { COND_OPS, CondOp, QueryName, Widget } from './types';

interface Props { widget: Widget; onChange: (next: Widget, key: string) => void }

const OPS: Record<string, string> = { '=': 'is', '!=': 'is not', '<': 'is below', '<=': 'is at most', '>': 'is above', '>=': 'is at least', contains: 'contains' };

export default function BindEditor({ widget, onChange }: Props) {
  const b = widget.config.bind;
  const id = (s: string) => `db-${widget.id}-bind-${s}`;
  const set = (bind: Widget['config']['bind']) => {
    const cfg = { ...widget.config };
    if (bind) cfg.bind = bind; else { delete cfg.bind; delete cfg.sendTo; }
    onChange({ ...widget, config: cfg }, `${widget.id}:bind`);
  };
  const first = (q: QueryName) => { const f = fieldsOf(q); return (f.find(x => x.key === 'summary') || f.find(x => x.key === 'title') || f[0]).key; };
  return (
    <>
      <h3 className="db-section">Filter other widgets</h3>
      <Toggle id={id('on')} size="sm" labelText="Use this value as a filter" labelA="Off" labelB="On" toggled={!!b}
        onToggle={(on: boolean) => set(on ? { field: first('getAlerts'), op: defaultOp(widget.type) as CondOp, query: 'getAlerts' } : undefined)} />
      {b && (
        <>
          <Select id={id('q')} labelText="Data" size="sm" value={b.query} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { const q = e.target.value as QueryName; set({ ...b, query: q, field: first(q) }); }}>
            <SelectItem value="getAlerts" text="Alerts" />
            <SelectItem value="getStories" text="Incidents" />
            <SelectItem value="getApplications" text="Applications" />
          </Select>
          <Select id={id('f')} labelText="Rows where" size="sm" value={b.field} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set({ ...b, field: e.target.value })}>
            {fieldsOf(b.query).map(f => <SelectItem key={f.key} value={f.key} text={f.label} />)}
          </Select>
          <Select id={id('o')} labelText="Field" size="sm" value={b.op} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set({ ...b, op: e.target.value as CondOp })}>
            {COND_OPS.map(o => <SelectItem key={o} value={o} text={`${OPS[o]} the value`} />)}
          </Select>
          <p className="db-help">Nothing is filtered until you wire it: turn on Wire mode (W) and drag from this widget’s port to the widgets it should filter. An empty value filters nothing.</p>
        </>
      )}
    </>
  );
}
