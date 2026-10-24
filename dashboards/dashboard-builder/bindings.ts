/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Value inputs: a text box, number, slider, switch or chooser can hold a value, and wired to a widget it filters that
 * widget's rows by it (`config.bind` says on which field and how; `config.sendTo` says which widgets).
 */

import { carbonSpec } from './carbon-specs';
import { QueryName, Widget } from './types';

const NAMES = ['TextInput', 'Search', 'NumberInput', 'Slider', 'Toggle', 'Checkbox', 'Dropdown', 'Select', 'ComboBox', 'RadioButtonGroup', 'ContentSwitcher'];

export const isValueInput = (type: string): boolean => type.startsWith('carbon:') && NAMES.includes(type.slice(7));

export interface Bind { field: string; op: string; query: QueryName }

/** What the input holds before anyone touches it: numbers show their start value, a switch shows on or off. */
export function inputDefault(w: Widget): string {
  const n = w.type.slice(7);
  const p = (w.config.props || {}) as Record<string, unknown>;
  const def = (k: string) => { const s = carbonSpec(w.type); const x = s ? s.props.find(y => y.key === k) : undefined; return x ? x.def : undefined; };
  if (n === 'NumberInput' || n === 'Slider') return String(p.value !== undefined ? p.value : def('value') ?? 0);
  if (n === 'Toggle' || n === 'Checkbox') return (p.on !== undefined ? p.on : def('on')) ? 'true' : '';
  return '';
}

/** A sensible way to compare, by kind of input. */
export const defaultOp = (type: string): string => {
  const n = type.slice(7);
  return n === 'NumberInput' || n === 'Slider' ? '>=' : n === 'TextInput' || n === 'Search' ? 'contains' : '=';
};

/** The query a widget's selections apply to. */
export const queryOf = (w: Widget): QueryName => (w.config.bind ? w.config.bind.query : w.config.query);
