/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * The settings form of a Carbon component widget, built from the catalog entry: text, switches, choices and
 * one-per-line lists. Values are saved in `config.props`.
 */

import React from 'react';
import { Select, SelectItem, TextInput, Toggle } from '@carbon/react';
import { Widget } from './types';
import { carbonDef } from './carbon-catalog';
import { PropSpec } from './carbon-specs';
import BindEditor from './BindEditor';
import { isValueInput } from './bindings';
import { ItemsEditor, PanelEditor, PartsFor } from './ContentEditor';

interface Props {
  widget: Widget;
  onChange: (next: Widget, coalesceKey: string) => void;
  partsFor?: PartsFor;
}

export default function CarbonSettings({ widget, onChange, partsFor }: Props) {
  const def = carbonDef(widget.type);
  if (!def) return null;
  const cur = widget.config.props || {};
  const value = (s: PropSpec) => (cur[s.key] !== undefined ? cur[s.key] : s.def);
  // undefined removes the setting (an optional number left empty)
  const set = (s: PropSpec, v: unknown) => {
    const props: Record<string, unknown> = { ...cur, [s.key]: v };
    if (v === undefined) delete props[s.key];
    onChange({ ...widget, config: { ...widget.config, props } }, `${widget.id}:cp:${s.key}`);
  };
  const id = (s: PropSpec) => `db-${widget.id}-cp-${s.key}`;

  const field = (s: PropSpec) => {
    const v = value(s);
    // Tabs and accordions hold text or one of your dashboards: pick it instead of typing tile:id#part.
    if (s.kind === 'lines' && s.key === 'items' && (def.name === 'Tabs' || def.name === 'Accordion' || def.name === 'Carousel')) {
      const arr = Array.isArray(v) ? (v as unknown[]).map(x => String(x)) : String(v ?? '').split('\n').filter(x => x.trim() !== '');
      return <ItemsEditor key={s.key} id={id(s)} label={def.name === 'Tabs' ? 'Tabs' : def.name === 'Carousel' ? 'Slides' : 'Sections'} noun={def.name === 'Tabs' ? 'Tab' : def.name === 'Carousel' ? 'Slide' : 'Section'} value={arr.length ? arr : ['Item 1 :: ']} partsFor={partsFor} onChange={x => set(s, x)} />;
    }
    if (s.kind === 'area' && (def.name === 'SplitPane' || s.key === 'content')) {
      return <PanelEditor key={s.key} id={id(s)} label={s.key === 'first' ? 'First panel' : s.key === 'second' ? 'Second panel' : 'Content'} value={String(v ?? '')} partsFor={partsFor} onChange={x => set(s, x)} />;
    }
    switch (s.kind) {
      case 'bool':
        return <Toggle key={s.key} id={id(s)} size="sm" labelText={s.label} labelA="Off" labelB="On" toggled={Boolean(v)} onToggle={(on: boolean) => set(s, on)} />;
      case 'enum':
        return (
          <Select key={s.key} id={id(s)} labelText={s.label} value={String(v ?? '')} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set(s, e.target.value)}>
            {(s.options || []).map(o => <SelectItem key={o} value={o} text={o} />)}
          </Select>
        );
      case 'number':
        return <TextInput key={s.key} id={id(s)} labelText={s.label} type="number" value={String(v ?? '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(s, e.target.value === '' ? (s.def === undefined ? undefined : 0) : Number(e.target.value))} />;
      case 'lines': {
        const text = Array.isArray(v) ? (v as unknown[]).join('\n') : String(v ?? '');
        return (
          <div className="cds--form-item" key={s.key}>
            <label className="cds--label" htmlFor={id(s)}>{s.label}</label>
            <textarea id={id(s)} className="db-textarea" rows={Math.min(Math.max((Array.isArray(v) ? v.length : 3) + 1, 3), 10)} value={text} onChange={e => set(s, e.target.value.split('\n').slice(0, 60))} />
          </div>
        );
      }
      case 'area':
        return (
          <div className="cds--form-item" key={s.key}>
            <label className="cds--label" htmlFor={id(s)}>{s.label}</label>
            <textarea id={id(s)} className="db-textarea" rows={4} value={String(v ?? '')} onChange={e => set(s, e.target.value.slice(0, 500))} />
          </div>
        );
      default:
        return <TextInput key={s.key} id={id(s)} labelText={s.label} value={String(v ?? '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(s, e.target.value.slice(0, 500))} />;
    }
  };

  return (
    <>
      <h3 className="db-section">{def.label}</h3>
      <p className="db-help">{def.description}</p>
      {def.props.map(s => (
        <React.Fragment key={s.key}>
          {field(s)}
          {s.help && <p className="db-help">{s.help}</p>}
        </React.Fragment>
      ))}
      {isValueInput(widget.type) && cur.source !== 'field' && <BindEditor widget={widget} onChange={onChange} />}
    </>
  );
}
