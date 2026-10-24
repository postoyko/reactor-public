/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Action wiring controls: "when this widget <event>, then <action> on <widget>". One rule is a row of dropdowns; a
 * widget can have several. The same row is used in the settings panel, the Wiring list and the wire menu on the canvas.
 */

import React from 'react';
import { ActionLink, Widget } from './types';
import { ActionSpec, actionsOf, eventsOf, newLink, suggestAction } from './component-api';
import { treeOrder } from './nesting';
import { Glyph } from './Glyph';

const GROUP_ORDER: ActionSpec['group'][] = ['Component', 'Visibility', 'Value', 'Data', 'Content', 'Settings'];

interface RuleProps {
  source: Widget;
  all: Widget[];
  link: ActionLink;
  onChange: (next: ActionLink) => void;
  onRemove?: () => void;
  /** Hide the target picker (the wire already says where it goes). */
  fixedTarget?: boolean;
}

export function RuleFields({ source, all, link, onChange, onRemove, fixedTarget }: RuleProps) {
  const target = all.find(x => x.id === link.to);
  const events = eventsOf(source);
  const ev = events.find(e => e.id === link.event) || events[0];
  const acts = target ? actionsOf(target) : [];
  // "set:name" / "add:name" that the component does not list: a property chosen by name
  const custom = /^(set|add):/.test(link.do) && !acts.some(a => a.id === link.do) ? (link.do.startsWith('set:') ? 'prop' : 'addprop') : '';
  const act = acts.find(a => a.id === (custom || link.do));
  const others = treeOrder(all).filter(x => x.id !== source.id);
  const items = (() => { const it = (source.config.props || {}).items; const l = Array.isArray(it) ? it : typeof it === 'string' ? it.split('\n') : []; return l.map(x => String(x).split('::')[0].trim()).filter(Boolean); })();
  const listId = `db-act-items-${source.id}`;
  const retarget = (id: string) => {
    const t = all.find(x => x.id === id);
    if (!t) return;
    const keep = actionsOf(t).some(a => a.id === link.do);
    const d = keep ? link.do : suggestAction(t);
    const spec = actionsOf(t).find(a => a.id === d);
    const next: ActionLink = { ...link, to: id, do: d };
    if (!keep) { if (spec && spec.arg && spec.arg.def) next.arg = spec.arg.def; else delete next.arg; }
    onChange(next);
  };
  const redo = (d: string) => {
    const spec = acts.find(a => a.id === d);
    const next: ActionLink = { ...link, do: d === 'prop' ? 'set:' : d === 'addprop' ? 'add:' : d };
    if (spec && spec.arg && spec.arg.def !== undefined) next.arg = spec.arg.def; else delete next.arg;
    onChange(next);
  };
  const groups = GROUP_ORDER.map(g => ({ g, list: acts.filter(a => a.group === g) })).filter(x => x.list.length);
  const argEl = act && act.arg ? (() => {
    const a = act.arg;
    const v = link.arg === undefined ? '' : link.arg;
    const set = (x: string) => onChange({ ...link, arg: x });
    if (a.kind === 'bool') return <select aria-label={a.label} value={/^(true|yes|on|1)$/i.test(v) ? 'true' : 'false'} onChange={e => set(e.target.value)}><option value="true">On</option><option value="false">Off</option></select>;
    if (a.kind === 'enum' && a.options) return <select aria-label={a.label} value={v} onChange={e => set(e.target.value)}>{!a.options.includes(v) && <option value={v}>{v || '(choose)'}</option>}{a.options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
    if (a.kind === 'area' || a.kind === 'lines') return <textarea aria-label={a.label} rows={3} value={v} placeholder={a.label} onChange={e => set(e.target.value)} />;
    return <input aria-label={a.label} type={a.kind === 'number' ? 'number' : 'text'} value={v} placeholder={a.label} onChange={e => set(e.target.value)} />;
  })() : null;
  return (
    <div className="db-act-rule">
      <label>When it
        <select value={ev.id} onChange={e => onChange({ ...link, event: e.target.value, when: undefined })}>
          {events.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      {ev.carries && (
        <label>only if the value is
          <input type="text" value={link.when || ''} list={items.length ? listId : undefined} placeholder="(any)" onChange={e => onChange({ ...link, when: e.target.value || undefined })} />
          {items.length > 0 && <datalist id={listId}>{items.map(i => <option key={i} value={i} />)}</datalist>}
        </label>
      )}
      {!fixedTarget && (
        <label>then, on
          <select value={link.to} onChange={e => retarget(e.target.value)}>
            {!target && <option value={link.to}>(missing widget)</option>}
            {others.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </label>
      )}
      <label>{fixedTarget ? 'then' : 'do'}
        <select value={custom || link.do} onChange={e => redo(e.target.value)}>
          {!act && <option value={link.do}>{link.do}</option>}
          {groups.map(x => <optgroup key={x.g} label={x.g}>{x.list.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</optgroup>)}
        </select>
      </label>
      {custom && <label>Property name<input type="text" value={link.do.slice(4)} placeholder="for example value, disabled, kind, limit" onChange={e => onChange({ ...link, do: `${link.do.slice(0, 4)}${e.target.value.trim()}` })} /></label>}
      {argEl && <label className="db-act-arg">{act && act.arg ? act.arg.label : ''}{argEl}</label>}
      {argEl && ev.carries && <p className="db-help">Use <code>{'{value}'}</code> for {ev.carries}.</p>}
      {onRemove && <button type="button" className="db-link db-act-rm" onClick={onRemove}>Remove this action</button>}
    </div>
  );
}

interface Props { widget: Widget; all: Widget[]; onChange: (next: Widget, key: string) => void }

/** The settings-panel list of a widget's action rules. */
export function ActionRules({ widget, all, onChange }: Props) {
  const rules = widget.config.on || [];
  const others = all.filter(x => x.id !== widget.id);
  const put = (on: ActionLink[]) => {
    const cfg = { ...widget.config };
    if (on.length) cfg.on = on; else delete cfg.on;
    onChange({ ...widget, config: cfg }, `${widget.id}:on`);
  };
  return (
    <div className="db-act">
      {rules.length === 0 && <p className="db-help">Nothing happens yet. Add an action to make another widget react: open a dialog, show a panel, choose a tab, set a value or a setting.</p>}
      {rules.map((l, i) => {
        const t = all.find(x => x.id === l.to);
        return (
          <div key={i} className="db-act-item">
            <div className="db-act-head">{t ? <Glyph type={t.type} size={16} /> : null}<strong>{i + 1}</strong></div>
            <RuleFields source={widget} all={all} link={l} onChange={n => put(rules.map((x, j) => (j === i ? n : x)))} onRemove={() => put(rules.filter((_, j) => j !== i))} />
          </div>
        );
      })}
      <button type="button" className="db-link" disabled={others.length === 0} onClick={() => put([...rules, newLink(widget, others[0])])}>+ Add an action</button>
      {others.length === 0 && <p className="db-help">Add another widget first: an action needs something to act on.</p>}
    </div>
  );
}
