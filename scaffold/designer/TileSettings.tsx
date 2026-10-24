/**
 * © Copyright IBM Corp. 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings of an existing dashboard (a "tile") inside the Designer, edited in Concert Operate. Studio reads each
 * dashboard's source and writes settings-schema.ts when the extension is built:
 *   - options = the component's props: saved in widget.config.props;
 *   - content = values written in the code (service domains, KPI lists, thresholds, refresh options): saved in
 *     widget.config.settings. They apply once an administrator has made the dashboard configurable in Studio.
 * Editing only changes this layout (in the person's own saved layout); the dashboard's code is not touched.
 */

import React from 'react';
import { Button, Select, SelectItem, TextInput } from '@carbon/react';
import { Widget } from './types';
import { SCHEMAS } from './settings-schema';

export interface PropInfo { name: string; kind: string; type?: string; doc?: string; default?: unknown; options?: Array<string | number>; numeric?: boolean }
export interface ColInfo { key: string; kind: string }
export interface ConstInfo { name: string; kind: string; value: unknown; doc?: string; shape?: ColInfo[]; of?: string }
export interface TileSchema { props: PropInfo[]; constants: ConstInfo[]; configurable: boolean; stateKeys: string[]; hidden?: number }

type Json = unknown;
type Rec = Record<string, any>;

const isRe = (v: any) => !!v && typeof v === 'object' && typeof v.$re === 'string';
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);
const show = (v: any): string => (isRe(v) ? `/${v.$re}/${v.flags || ''}` : v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function parseRe(t: string): Json | null {
  const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(t.trim());
  const src = m ? m[1] : t, flags = m ? m[2] : 'i';
  try { new RegExp(src, flags); } catch (e) { return null; }
  return { $re: src, flags };
}
function parseCell(kind: string, text: string, was: Json): Json {
  if (kind === 'number') { const n = Number(text); return text.trim() !== '' && Number.isFinite(n) ? n : was; }
  if (kind === 'boolean') return text === 'true';
  if (kind === 'regex') return parseRe(text) || was;
  return text;
}
const blank = (kind: string): Json => (kind === 'number' ? 0 : kind === 'boolean' ? false : kind === 'regex' ? { $re: '', flags: 'i' } : '');

/** Text box that keeps what is typed and saves on blur, so a half-typed value never reaches the dashboard. */
function Field({ value, onSave, id, label, type = 'text', placeholder, title }: { value: string; onSave: (t: string) => void; id: string; label: string; type?: string; placeholder?: string; title?: string }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <TextInput id={id} labelText={<span className="cds--visually-hidden">{label}</span>} size="sm" type={type} value={text} placeholder={placeholder} title={title}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onSave(text); }}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

function JsonBox({ id, value, onValue, rows = 4 }: { id: string; value: Json; onValue: (v: Json | undefined) => void; rows?: number }) {
  const start = value === undefined ? '' : JSON.stringify(value, null, 1);
  const [text, setText] = React.useState(start);
  const [bad, setBad] = React.useState(false);
  React.useEffect(() => { setText(start); setBad(false); }, [start]);
  return (
    <>
      <textarea id={id} className="db-textarea" rows={rows} spellCheck={false} style={{ fontFamily: 'monospace', fontSize: 12, borderColor: bad ? '#da1e28' : undefined }} value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => {
          const s = text.trim();
          if (!s) { setBad(false); onValue(undefined); return; }
          try { onValue(JSON.parse(s)); setBad(false); } catch (e) { setBad(true); }
        }} />
      {bad && <p className="db-help" role="alert">That is not valid JSON, so it was not saved.</p>}
    </>
  );
}

function Rows({ idp, rows, cols, onRows, keyed }: { idp: string; rows: Rec[]; cols: ColInfo[]; onRows: (r: Rec[]) => void; keyed?: boolean }) {
  const set = (i: number, k: string, v: Json) => onRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="db-tblwrap">
      <table className="db-tbl">
        <thead><tr>{cols.map(k => <th key={k.key}>{k.key}</th>)}<th /></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {cols.map(k => (
                <td key={k.key}>
                  {k.kind === 'boolean'
                    ? <select aria-label={k.key} value={String(!!row[k.key])} onChange={e => set(i, k.key, e.target.value === 'true')}><option value="true">yes</option><option value="false">no</option></select>
                    : <Field id={`${idp}-${i}-${k.key}`} label={k.key} value={show(row[k.key])} type={k.kind === 'number' ? 'number' : 'text'} title={k.kind === 'regex' ? 'Pattern: /text/flags (flags default to i)' : undefined} onSave={t => set(i, k.key, parseCell(k.kind, t, row[k.key]))} />}
                </td>
              ))}
              <td className="db-tbl-act">
                {!keyed && i > 0 && <Button kind="ghost" size="sm" onClick={() => { const n = rows.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; onRows(n); }}>↑</Button>}
                <Button kind="ghost" size="sm" onClick={() => onRows(rows.filter((_, j) => j !== i))}>×</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button kind="tertiary" size="sm" onClick={() => { const nr: Rec = {}; cols.forEach(k => { nr[k.key] = blank(k.kind); }); onRows([...rows, nr]); }}>Add row</Button>
    </div>
  );
}

interface Props { widget: Widget; onChange: (next: Widget, coalesceKey: string) => void }

export default function TileSettings({ widget, onChange }: Props) {
  const tile = widget.type.startsWith('tile:') ? widget.type.slice(5) : '';
  const schema = SCHEMAS[tile];
  const c = widget.config;
  const id = (s: string) => `db-${widget.id}-${s}`;

  const upd = (kind: 'props' | 'settings', name: string, value: Json | undefined) => {
    const o: Rec = { ...((c as Rec)[kind] || {}) };
    if (value === undefined) delete o[name]; else o[name] = value;
    const cfg: Rec = { ...c };
    if (Object.keys(o).length) cfg[kind] = o; else delete cfg[kind];
    onChange({ ...widget, config: cfg as any }, `${widget.id}:${kind}:${name}`);
  };

  if (!schema) return null;
  const nothing = !schema.props.length && !schema.constants.length;
  const props = (c.props || {}) as Rec;
  const settings = (c.settings || {}) as Rec;

  const propRow = (p: PropInfo) => {
    const cur = props[p.name];
    const def = p.default;
    const defText = def !== undefined ? ` (${show(def)})` : '';
    let ctl: React.ReactNode;
    if (p.kind === 'boolean') {
      ctl = (
        <Select id={id('p-' + p.name)} labelText={p.name} size="sm" value={cur === undefined ? '' : String(cur)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => upd('props', p.name, e.target.value === '' ? undefined : e.target.value === 'true')}>
          <SelectItem value="" text={`default${defText}`} /><SelectItem value="true" text="on" /><SelectItem value="false" text="off" />
        </Select>
      );
    } else if (p.kind === 'enum') {
      ctl = (
        <Select id={id('p-' + p.name)} labelText={p.name} size="sm" value={cur === undefined ? '' : String(cur)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => upd('props', p.name, e.target.value === '' ? undefined : p.numeric ? Number(e.target.value) : e.target.value)}>
          <SelectItem value="" text={`default${defText}`} />
          {(p.options || []).map(o => <SelectItem key={String(o)} value={String(o)} text={String(o)} />)}
        </Select>
      );
    } else if (p.kind === 'number') {
      ctl = <Field id={id('p-' + p.name)} label={p.name} type="number" value={cur === undefined ? '' : String(cur)} placeholder={def !== undefined ? String(def) : ''} onSave={t => upd('props', p.name, t === '' || !Number.isFinite(Number(t)) ? undefined : Number(t))} />;
    } else if (p.kind === 'string') {
      ctl = <Field id={id('p-' + p.name)} label={p.name} value={cur === undefined ? '' : String(cur)} placeholder={def !== undefined ? String(def) : ''} onSave={t => upd('props', p.name, t === '' ? undefined : t)} />;
    } else {
      ctl = <><label className="cds--label" htmlFor={id('p-' + p.name)}>{p.name}</label><JsonBox id={id('p-' + p.name)} value={cur} rows={3} onValue={v => upd('props', p.name, v)} /></>;
    }
    return (
      <div className="cds--form-item" key={p.name} title={p.type}>
        {ctl}
        {p.doc && <p className="db-help">{p.doc}</p>}
        {cur !== undefined && <Button kind="ghost" size="sm" onClick={() => upd('props', p.name, undefined)}>Back to the default</Button>}
      </div>
    );
  };

  const constRow = (k: ConstInfo) => {
    const edited = settings[k.name] !== undefined;
    const v: any = edited ? settings[k.name] : k.value;
    const save = (nv: Json) => upd('settings', k.name, same(nv, k.value) ? undefined : nv);
    let ed: React.ReactNode;
    if (k.kind === 'string' || k.kind === 'number') {
      ed = <Field id={id('c-' + k.name)} label={k.name} type={k.kind === 'number' ? 'number' : 'text'} value={show(v)} onSave={t => save(k.kind === 'number' ? (t === '' ? k.value : Number(t)) : t)} />;
    } else if (k.kind === 'boolean') {
      ed = <Select id={id('c-' + k.name)} labelText={k.name} size="sm" value={String(v === true)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => save(e.target.value === 'true')}><SelectItem value="true" text="yes" /><SelectItem value="false" text="no" /></Select>;
    } else if (k.kind === 'regex') {
      ed = <Field id={id('c-' + k.name)} label={k.name} value={show(v)} title="Pattern: /text/flags (flags default to i)" onSave={t => { const r = parseRe(t); if (r) save(r); }} />;
    } else if (k.kind === 'array' && k.shape && k.of === 'record') {
      ed = <Rows idp={id('c-' + k.name)} rows={Array.isArray(v) ? v : []} cols={k.shape} onRows={r => save(r)} />;
    } else if (k.kind === 'array' && k.of !== 'record' && (Array.isArray(v) ? v : []).every((x: any) => typeof x !== 'object')) {
      ed = (
        <>
          <ListBox id={id('c-' + k.name)} value={Array.isArray(v) ? v : []} numeric={k.of === 'number'} onValue={r => save(r)} />
          <p className="db-help">One per line.</p>
        </>
      );
    } else if (k.kind === 'record' && k.of !== 'record') {
      const entries = Object.keys(v || {}).map(key => ({ key, value: v[key] }));
      const kind = k.of === 'number' || k.of === 'boolean' ? k.of : 'string';
      ed = <Rows idp={id('c-' + k.name)} rows={entries} keyed cols={[{ key: 'key', kind: 'string' }, { key: 'value', kind }]} onRows={rows => { const o: Rec = {}; rows.forEach(r => { if (String(r.key).trim()) o[String(r.key).trim()] = r.value; }); save(o); }} />;
    } else {
      ed = <JsonBox id={id('c-' + k.name)} value={v} rows={6} onValue={nv => { if (nv === undefined) upd('settings', k.name, undefined); else save(nv); }} />;
    }
    const count = Array.isArray(v) ? ` · ${v.length}` : k.kind === 'record' ? ` · ${Object.keys(v || {}).length}` : '';
    return (
      <details className="db-det" key={k.name} open={edited}>
        <summary><code>{k.name}</code>{count}{edited && <b className="db-edited"> · edited</b>}</summary>
        {k.doc && <p className="db-help">{k.doc}</p>}
        {ed}
        {edited && <Button kind="ghost" size="sm" onClick={() => upd('settings', k.name, undefined)}>Reset to the value in the code</Button>}
      </details>
    );
  };

  return (
    <div className="db-tile-settings">
      {schema.props.length > 0 && (
        <details className="db-det" open>
          <summary>Options ({schema.props.length})</summary>
          {schema.props.map(propRow)}
        </details>
      )}
      {schema.constants.length > 0 && (
        <>
          <h3 className="db-h3">Content written in the dashboard</h3>
          {schema.constants.map(constRow)}
          <p className="db-help">Saved in your layout and applied to this dashboard when it runs. The dashboard’s code is not changed.</p>
        </>
      )}
      {!schema.configurable && (schema.hidden || 0) > 0 && (
        <p className="db-help">This dashboard has {schema.hidden} value(s) written into its code (lists, thresholds, service domains) that an administrator can make editable in Concert Workbench’s Layout Editor.</p>
      )}
      {schema.stateKeys.length > 0 && !schema.props.length && (
        <p className="db-help">This dashboard takes its settings from the route’s own state ({schema.stateKeys.join(', ')}), not from options.</p>
      )}
      {nothing && !(schema.hidden || 0) && schema.stateKeys.length === 0 && <p className="db-help">No options or editable values were found in this dashboard’s source.</p>}
    </div>
  );
}

function ListBox({ id, value, numeric, onValue }: { id: string; value: any[]; numeric: boolean; onValue: (v: Json[]) => void }) {
  const start = value.map(show).join('\n');
  const [text, setText] = React.useState(start);
  React.useEffect(() => setText(start), [start]);
  return (
    <textarea id={id} className="db-textarea" rows={Math.min(8, Math.max(3, value.length + 1))} value={text} onChange={e => setText(e.target.value)}
      onBlur={() => { const lines = text.split('\n').map(s => s.trim()).filter(Boolean); onValue(numeric ? lines.map(Number).filter(Number.isFinite) : lines); }} />
  );
}
