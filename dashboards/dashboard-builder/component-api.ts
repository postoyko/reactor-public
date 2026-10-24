/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * What every widget can SAY (events) and what can be DONE to it (actions). Plain data, no React, in the spirit of
 * Storybook's argTypes: a component's settings (carbon-specs.ts) are its "args", so every setting is automatically
 * something an action can change at run time; this file adds the events a component raises and the commands it
 * understands (open a dialog, choose a tab ...). The Designer's action wiring UI and the runtime read the same lists,
 * so they cannot drift apart.
 */

import { carbonSpec, Kind } from './carbon-specs';
import { ActionLink, Widget } from './types';
import { ArgPart, defaultParts, PLATFORM_ACTIONS, PlatformAction, ROW_ACTIONS } from './platform-actions';
import { isAlertSource, PLATFORM_ID } from './sources';

export interface EventSpec { id: string; label: string; /** What the event carries, for "only when the value is" and {value}. */ carries?: string }
/** `parts`: an action with several fields (kept in the link's arg as JSON, see platform-actions.ts). */
export interface ActionArg { kind: Kind; label: string; options?: string[]; def?: string; parts?: ArgPart[] }
export interface ActionSpec { id: string; label: string; group: 'Visibility' | 'Content' | 'Component' | 'Value' | 'Data' | 'Settings' | 'Concert Operate'; arg?: ActionArg }

/** The "Concert Operate" target: actions that call the platform itself rather than change a widget. */
export const PLATFORM: Widget = { id: PLATFORM_ID, type: 'platform' as Widget['type'], title: 'Concert Operate', x: 0, y: 0, w: 0, h: 0, config: { query: 'getAlerts' } };
/** A rule's target: a widget of the dashboard, or the platform. */
export const findTarget = (all: Widget[], id: string): Widget | undefined => (id === PLATFORM_ID ? PLATFORM : all.find(w => w.id === id));
const apiSpec = (a: PlatformAction): ActionSpec => ({ id: a.id, label: a.label, group: 'Concert Operate', arg: { kind: 'text', label: 'Details', parts: a.parts, def: defaultParts(a.parts) } });

type W = Pick<Widget, 'type' | 'config'>;
const name = (w: W): string => (w.type.startsWith('carbon:') ? w.type.slice(7) : '');

/** Components that hold a value other widgets can read and an action can set. */
export const VALUE_TYPES = new Set(['TextInput', 'Search', 'NumberInput', 'Slider', 'Toggle', 'Checkbox', 'Dropdown', 'Select', 'ComboBox', 'RadioButtonGroup', 'ContentSwitcher']);
const SWITCHES = new Set(['Toggle', 'Checkbox']);
const NOTICES = new Set(['InlineNotification', 'ToastNotification', 'ActionableNotification']);

/** A widget that sets a filter when something is picked in it (bars, slices, choosers on live values). */
export function isPickable(w: W): boolean {
  const c = w.config;
  if (!c.groupBy) return false;
  if (w.type === 'bar' || w.type === 'donut') return true;
  const s = carbonSpec(w.type);
  return !!s && (!!s.emits || (c.props || {}).source === 'field');
}

/** Events a widget raises, most specific first ("is clicked" last: every widget has it). */
export function eventsOf(w: W): EventSpec[] {
  const n = name(w);
  const out: EventSpec[] = [];
  if (VALUE_TYPES.has(n)) out.push({ id: 'change', label: SWITCHES.has(n) ? 'Is switched on or off' : 'Value changes', carries: SWITCHES.has(n) ? '“true” when on, empty when off' : 'the new value' });
  if (isPickable(w)) out.push({ id: 'select', label: 'A value is picked', carries: 'the picked value (empty when cleared)' });
  if (n === 'Tabs') out.push({ id: 'tab', label: 'Another tab is chosen', carries: 'the tab title' });
  if (n === 'Accordion') out.push({ id: 'toggle', label: 'An item is opened or closed', carries: 'the item title' });
  if (n === 'Modal') out.push({ id: 'open', label: 'Dialog opens' }, { id: 'close', label: 'Dialog closes' }, { id: 'submit', label: 'OK button is pressed' });
  if (n === 'Pagination') out.push({ id: 'page', label: 'Page changes', carries: 'the page number' });
  if (NOTICES.has(n)) out.push({ id: 'close', label: 'Is closed with ×' });
  out.push(
    { id: 'click', label: 'Is clicked' },
    { id: 'dblclick', label: 'Is double-clicked' },
    { id: 'hover', label: 'Pointer moves onto it' },
    { id: 'leave', label: 'Pointer moves off it' },
    { id: 'input', label: 'Something is typed in it', carries: 'the text typed' },
    { id: 'enter', label: 'Enter is pressed in it', carries: 'the text in the field' },
    { id: 'focus', label: 'Gets the keyboard focus' },
    { id: 'blur', label: 'Loses the keyboard focus' }
  );
  return out;
}

const arg = (kind: Kind, label: string, extra?: Partial<ActionArg>): ActionArg => ({ kind, label, ...extra });

/** Things that can be done to a widget: for every widget, plus its commands and a "set" for each of its settings. */
export function actionsOf(w: W): ActionSpec[] {
  if (w.type === PLATFORM.type) return PLATFORM_ACTIONS.map(apiSpec);
  const n = name(w);
  const out: ActionSpec[] = [
    { id: 'show', label: 'Show it', group: 'Visibility' },
    { id: 'hide', label: 'Hide it', group: 'Visibility' },
    { id: 'toggleVisible', label: 'Show or hide it (flip)', group: 'Visibility' },
    { id: 'title', label: 'Set its title', group: 'Content', arg: arg('text', 'Title') }
  ];
  if (w.type === 'text') out.push({ id: 'set:text', label: 'Set its text', group: 'Content', arg: arg('area', 'Text') });
  if (n === 'Modal') out.push({ id: 'cmd:open', label: 'Open the dialog', group: 'Component' }, { id: 'cmd:close', label: 'Close the dialog', group: 'Component' });
  if (n === 'Tabs') out.push({ id: 'cmd:select', label: 'Choose a tab', group: 'Component', arg: arg('text', 'Tab number (1, 2 ...) or title', { def: '1' }) });
  if (n === 'Accordion') out.push({ id: 'cmd:expand', label: 'Open every item', group: 'Component' }, { id: 'cmd:collapse', label: 'Close every item', group: 'Component' }, { id: 'cmd:open', label: 'Open one item', group: 'Component', arg: arg('text', 'Item number or title', { def: '1' }) });
  if (n === 'Carousel') out.push({ id: 'cmd:go', label: 'Go to a slide', group: 'Component', arg: arg('text', 'Slide number or title', { def: '1' }) });
  if (SWITCHES.has(n)) out.push({ id: 'on', label: 'Switch it on', group: 'Value' }, { id: 'off', label: 'Switch it off', group: 'Value' }, { id: 'flip', label: 'Flip it', group: 'Value' });
  else if (n === 'Slider' || n === 'NumberInput') out.push({ id: 'addValue', label: 'Add to its value', group: 'Value', arg: arg('number', 'Amount to add (negative subtracts)', { def: '1' }) }, { id: 'value', label: 'Set its value', group: 'Value', arg: arg('text', 'Value', { def: '{value}' }) }, { id: 'clear', label: 'Clear its value', group: 'Value' });
  else if (VALUE_TYPES.has(n)) out.push({ id: 'value', label: 'Set its value', group: 'Value', arg: arg('text', 'Value', { def: '{value}' }) }, { id: 'clear', label: 'Clear its value', group: 'Value' });
  if (isPickable(w)) out.push({ id: 'pick', label: 'Pick a value (filters the others)', group: 'Data', arg: arg('text', 'Value to pick', { def: '{value}' }) }, { id: 'clearPick', label: 'Clear its pick', group: 'Data' });
  if (CFG_TYPES.has(w.type) || (carbonSpec(w.type) || { uses: undefined }).uses) {
    CFG.forEach(c => out.push({ id: `cfg:${c.key}`, label: c.label, group: 'Data', arg: arg(c.kind, c.hint, { options: c.options, ...(c.def !== undefined ? { def: c.def } : {}) }) }));
    if (isAlertSource(w.config.query)) ROW_ACTIONS.forEach(a => out.push(apiSpec(a)));
  }
  const spec = carbonSpec(w.type);
  if (spec) {
    spec.props.forEach(p => {
      out.push({
        id: `set:${p.key}`,
        label: `Set “${p.label}”`,
        group: 'Settings',
        arg: arg(p.kind, p.label, { options: p.options, def: p.kind === 'bool' ? 'true' : undefined })
      });
      if (p.kind === 'number') out.push({ id: `add:${p.key}`, label: `Add to “${p.label}”`, group: 'Settings', arg: arg('number', 'Amount to add (negative subtracts)', { def: '10' }) });
    });
  }
  out.push(
    { id: 'prop', label: 'Set any property by name…', group: 'Settings', arg: arg('text', 'Value') },
    { id: 'addprop', label: 'Add to any number property by name…', group: 'Settings', arg: arg('number', 'Amount to add', { def: '1' }) }
  );
  return out;
}

/** Data settings every data widget has, whatever it is: an action can change what it reads and how it groups. */
const CFG_TYPES = new Set(['kpi', 'bar', 'donut', 'timeseries', 'table']);
const CFG: Array<{ key: string; label: string; kind: Kind; hint: string; options?: string[]; def?: string }> = [
  { key: 'filter', label: 'Change its source parameter', kind: 'text', hint: 'Incident id, resource id or filter ({value} = what was picked)', def: '{value}' },
  { key: 'groupBy', label: 'Change what it groups by', kind: 'text', hint: 'Field name (severityLabel, team, state ...)' },
  { key: 'seriesBy', label: 'Change its second split', kind: 'text', hint: 'Field name' },
  { key: 'metric', label: 'Change its measure', kind: 'enum', hint: 'Measure', options: ['count', 'distinct', 'max', 'avg', 'sum'] },
  { key: 'valueField', label: 'Change the field it measures', kind: 'text', hint: 'Field name' },
  { key: 'timeField', label: 'Change its time field', kind: 'text', hint: 'Field name' },
  { key: 'where', label: 'Narrow its rows to field = value', kind: 'text', hint: 'field=value (empty removes it)' },
  { key: 'sortBy', label: 'Change what it sorts by', kind: 'text', hint: 'Field name' },
  { key: 'sortDesc', label: 'Sort high to low', kind: 'bool', hint: 'High to low' },
  { key: 'limit', label: 'Change how many rows it shows', kind: 'number', hint: 'Rows' }
];

/** What to preselect when a wire from a widget lands on `target`. */
export function suggestAction(target: W): string {
  if (target.type === PLATFORM.type) return 'api:createIncident';
  const n = name(target);
  if (n === 'Modal') return 'cmd:open';
  if (SWITCHES.has(n)) return 'flip';
  if (n === 'Tabs') return 'cmd:select';
  return 'toggleVisible';
}

export function actionLabel(target: W, id: string): string {
  const a = actionsOf(target).find(x => x.id === id);
  if (a) return a.label;
  if (id.startsWith('set:')) return `set “${id.slice(4)}”`;
  if (id.startsWith('add:')) return `add to “${id.slice(4)}”`;
  return id;
}

/** Replaces {value} in an action's text with what the event carried. */
export function fill(text: string | undefined, value: string): string { return String(text === undefined ? '' : text).replace(/\{value\}/g, value); }

/** The arg type of an action id on a widget (for coercing what a wire sends). */
export function argKind(target: W, id: string): Kind | undefined {
  const a = actionsOf(target).find(x => x.id === id);
  return a && a.arg ? a.arg.kind : undefined;
}

export function newLink(source: W, target: Widget): ActionLink {
  const ev = eventsOf(source)[0];
  const act = suggestAction(target);
  const spec = actionsOf(target).find(x => x.id === act);
  return { event: ev.id, to: target.id, do: act, ...(spec && spec.arg && spec.arg.def ? { arg: spec.arg.def } : {}) };
}
