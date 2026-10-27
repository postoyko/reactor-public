/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * What the widget library offers, in its sections: the Designer's own widgets, the Carbon components by group, and
 * the toolkit's existing dashboards as tiles.
 */

import { CARBON, GROUPS } from './carbon-catalog';
import { LibSection } from './Library';
import { NATIVE, TILES } from './registry';
import { Widget } from './types';

export type AddWidget = (type: Widget['type'], title?: string, size?: { w: number; h: number }) => void;

export function librarySections(add: AddWidget): LibSection[] {
  return [
    {
      id: 'data', cluster: 'Widgets', title: 'Data and content',
      items: NATIVE.map(n => ({ key: n.type, type: n.type, label: n.label, description: n.description, onAdd: () => add(n.type), w: n.w }))
    },
    ...GROUPS.map(g => ({
      id: `c-${g}`, cluster: 'Carbon components', title: g,
      items: CARBON.filter(c => c.group === g).map(c => ({ key: c.name, type: `carbon:${c.name}`, label: c.label, description: c.description, onAdd: () => add(`carbon:${c.name}`, c.label, c), w: c.w }))
    })),
    {
      id: 'tiles', cluster: 'Your dashboards', title: 'Existing dashboards',
      items: TILES.map(t => ({ key: t.id, type: `tile:${t.id}`, label: t.label, description: t.description, onAdd: () => add(`tile:${t.id}`, t.label, t), w: t.w }))
    }
  ];
}
