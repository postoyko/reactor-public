/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * "When clicked" for a bar chart, donut, table or number: filter other widgets, show the rows behind it, open an
 * address, or nothing.
 */

import React from 'react';
import { Select, SelectItem, TextInput, Toggle } from '@carbon/react';
import { fieldsOf } from './rows';
import { Widget } from './types';

type Mode = 'filter' | 'details' | 'link' | 'none';

export default function DrillEditor({ widget, onChange }: { widget: Widget; onChange: (next: Widget, key: string) => void }) {
  const c = widget.config;
  const grouped = widget.type === 'bar' || widget.type === 'donut';
  const mode: Mode = c.drill ? c.drill.mode : grouped && c.emits !== false ? 'filter' : 'none';
  const id = (s: string) => `db-${widget.id}-drill-${s}`;
  const put = (cfg: Widget['config'], key: string) => onChange({ ...widget, config: cfg }, `${widget.id}:${key}`);
  const choose = (m: Mode) => {
    const cfg = { ...c };
    delete cfg.drill;
    if (m === 'filter') cfg.emits = true;
    else cfg.emits = false;
    if (m === 'details') cfg.drill = { mode: 'details', ...(c.drill && c.drill.url ? { url: c.drill.url } : {}), newTab: true };
    if (m === 'link') cfg.drill = { mode: 'link', url: (c.drill && c.drill.url) || '', newTab: true };
    put(cfg, 'drill');
  };
  const setUrl = (url: string) => c.drill && put({ ...c, drill: { ...c.drill, url: url.slice(0, 500) } }, 'drillUrl');
  const tokens = grouped ? `{${c.groupBy || ''}} {count}` : fieldsOf(c.query).slice(0, 6).map(f => `{${f.key}}`).join(' ');
  return (
    <>
      <h3 className="db-section">When clicked</h3>
      <Select id={id('mode')} labelText="Click on it to" size="sm" value={mode} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => choose(e.target.value as Mode)}>
        {grouped && <SelectItem value="filter" text="Filter other widgets" />}
        <SelectItem value="details" text="Show the rows behind it" />
        <SelectItem value="link" text="Open an address" />
        <SelectItem value="none" text="Do nothing" />
      </Select>
      {(mode === 'details' || mode === 'link') && c.drill && (
        <>
          <TextInput id={id('url')} size="sm" labelText={mode === 'link' ? 'Address' : 'Address for an Open button (optional)'} placeholder="https://example.com/incidents/{id}" value={c.drill.url || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} />
          <p className="db-help">Use {tokens} to put what was clicked into the address. Web and in-app addresses only. To land on another dashboard already filtered, add <code>?db=field:value</code> to its address, for example <code>?db=severityLabel:{'{'}severityLabel{'}'}</code>.</p>
          <Toggle id={id('tab')} size="sm" labelText="Open in a new tab" labelA="Off" labelB="On" toggled={c.drill.newTab !== false} onToggle={(on: boolean) => put({ ...c, drill: { ...(c.drill as NonNullable<typeof c.drill>), newTab: on } }, 'drillTab')} />
        </>
      )}
    </>
  );
}
