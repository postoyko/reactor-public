/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Picks what goes inside a tab, an accordion section or a split-pane panel: plain text, or one of your dashboards
 * (optionally just one section of it). Saved in the same text form the components already read:
 * "Label :: text" or "Label :: tile:id#part".
 */

import React from 'react';
import { Button, Select, SelectItem, TextInput } from '@carbon/react';
import { Add, TrashCan } from '@carbon/icons-react';
import { TILES } from './registry';

export type PartsFor = ((tile: string) => { id: string; label: string }[]) | undefined;

const TILE = /^tile:([a-z0-9-]+)(?:#([A-Za-z0-9_-]+))?$/;

interface Parsed { tile: string; part: string; text: string; widgets?: boolean }
const parse = (content: string): Parsed => {
  const m = TILE.exec(content.trim());
  if (content.trim() === 'widgets') return { tile: '', part: '', text: '', widgets: true };
  return m ? { tile: m[1], part: m[2] || '', text: '' } : { tile: '', part: '', text: content };
};
const build = (p: Parsed): string => (p.widgets ? 'widgets' : p.tile ? `tile:${p.tile}${p.part ? '#' + p.part : ''}` : p.text);

interface RowProps { value: Parsed; partsFor: PartsFor; id: string; onChange: (p: Parsed) => void }

function ContentPick({ value, partsFor, id, onChange }: RowProps) {
  const parts = value.tile && partsFor ? partsFor(value.tile) : [];
  return (
    <>
      <Select id={`${id}-k`} size="sm" labelText="Shows" value={value.widgets ? '@widgets' : value.tile} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => (e.target.value === '@widgets' ? onChange({ tile: '', part: '', text: '', widgets: true }) : onChange({ tile: e.target.value, part: '', text: value.text }))}>
        <SelectItem value="@widgets" text="Widgets (place them here)" />
        <SelectItem value="" text="Text" />
        {TILES.map(t => <SelectItem key={t.id} value={t.id} text={`Dashboard: ${t.label}`} />)}
        {value.tile && !TILES.some(t => t.id === value.tile) && <SelectItem value={value.tile} text={`Dashboard: ${value.tile} (not installed)`} />}
      </Select>
      {!value.tile && !value.widgets && (
        <TextInput id={`${id}-t`} size="sm" labelText="Text" value={value.text} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, text: e.target.value.slice(0, 500) })} />
      )}
      {value.tile && parts.length > 0 && (
        <Select id={`${id}-p`} size="sm" labelText="Section" value={value.part} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...value, part: e.target.value })}>
          <SelectItem value="" text="Whole dashboard" />
          {parts.map(x => <SelectItem key={x.id} value={x.id} text={x.label} />)}
          {value.part && !parts.some(x => x.id === value.part) && <SelectItem value={value.part} text={`${value.part} (missing)`} />}
        </Select>
      )}
      {value.tile && parts.length === 0 && (
        <TextInput id={`${id}-p`} size="sm" labelText="Section (optional)" value={value.part} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, part: e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) })} />
      )}
    </>
  );
}

/** A list of "Label :: content" entries (tabs, accordion sections). */
export function ItemsEditor({ label, value, partsFor, id, onChange, noun }: { label: string; value: string[]; partsFor: PartsFor; id: string; onChange: (v: string[]) => void; noun: string }) {
  const rows = value.map(line => { const i = line.indexOf('::'); return { label: i < 0 ? line.trim() : line.slice(0, i).trim(), content: parse(i < 0 ? '' : line.slice(i + 2).trim()) }; });
  const emit = (next: { label: string; content: Parsed }[]) => onChange(next.slice(0, 40).map(r => `${r.label} :: ${build(r.content)}`));
  const upd = (i: number, r: { label: string; content: Parsed }) => emit(rows.map((x, j) => (j === i ? r : x)));
  return (
    <div className="cds--form-item db-citems">
      <span className="cds--label">{label}</span>
      {rows.map((r, i) => (
        <div className="db-crow" key={i}>
          <div className="db-crow-head">
            <TextInput id={`${id}-l${i}`} size="sm" labelText={`${noun} ${i + 1} name`} value={r.label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => upd(i, { ...r, label: e.target.value.replace(/::/g, ':').slice(0, 80) })} />
            <button type="button" className="db-iconbtn" title={`Remove this ${noun.toLowerCase()}`} aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`} disabled={rows.length <= 1} onClick={() => emit(rows.filter((_, j) => j !== i))}><TrashCan size={16} /></button>
          </div>
          <ContentPick id={`${id}-${i}`} value={r.content} partsFor={partsFor} onChange={c => upd(i, { ...r, content: c })} />
        </div>
      ))}
      <Button kind="tertiary" size="sm" renderIcon={Add} onClick={() => emit([...rows, { label: `${noun} ${rows.length + 1}`, content: { tile: '', part: '', text: '', widgets: true } }])}>Add {noun.toLowerCase()}</Button>
    </div>
  );
}

/** One panel's content (split pane). */
export function PanelEditor({ label, value, partsFor, id, onChange }: { label: string; value: string; partsFor: PartsFor; id: string; onChange: (v: string) => void }) {
  return (
    <div className="cds--form-item db-citems">
      <span className="cds--label">{label}</span>
      <div className="db-crow"><ContentPick id={id} value={parse(value)} partsFor={partsFor} onChange={c => onChange(build(c))} /></div>
    </div>
  );
}
