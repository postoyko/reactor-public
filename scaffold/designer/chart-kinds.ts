/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * "View as": the chart types a widget can switch to without changing its data. Charts that read the same settings
 * (source, group by, measure, time field, columns) form a family; within a family only the drawing changes, so a
 * switch never loses anything and switching back restores the original exactly.
 *
 * Grouped charts with a second split (stacked, heatmap ...) and plain grouped charts (bar, pie, word cloud ...) can
 * switch both ways: the split is simply not drawn by a chart that has none, and comes back with one that has. A heatmap
 * is the exception: without a second split it has nothing to compare, so it is offered only when the widget has one.
 */

import { carbonSpec } from './carbon-specs';
import { typeLabel } from './meta';
import { Widget } from './types';

const cc = (n: string) => `carbon:${n}`;

/** Families of interchangeable widget types, in the order the menu lists them. */
export const FAMILIES: Array<{ id: string; label: string; types: string[] }> = [
  { id: 'groups', label: 'Groups', types: ['bar', 'donut', cc('SimpleBarChart'), cc('LollipopChart'), cc('PieChart'), cc('DonutChart'), cc('TreemapChart'), cc('WordCloudChart'), cc('GroupedBarChart'), cc('StackedBarChart'), cc('HeatmapChart'), cc('RadarChart')] },
  { id: 'time', label: 'Over time', types: ['timeseries', cc('LineChart'), cc('AreaChart'), cc('StackedAreaChart'), cc('ScatterChart')] },
  { id: 'figure', label: 'One figure', types: ['kpi', cc('GaugeChart'), cc('MeterChart')] },
  { id: 'rows', label: 'Rows', types: ['table', cc('DataTable'), cc('StructuredList')] }
];

/** Types that exist in this Designer (a Carbon type must have a spec). */
const known = (t: string) => !t.startsWith('carbon:') || Boolean(carbonSpec(t));
/** Types that draw nothing without Data > Series by. */
const NEEDS_SERIES = [cc('HeatmapChart')];

export const familyOf = (type: string) => FAMILIES.find(f => f.types.includes(type));

/** The types this widget can be shown as, itself included (null when it has no alternatives). */
export function viewAsChoices(w: Pick<Widget, 'type' | 'config'>, original?: string): Array<{ type: string; label: string }> | null {
  const fam = familyOf(original || w.type);
  if (!fam) return null;
  const list = fam.types.filter(t => known(t) && (t === (original || w.type) || w.config.seriesBy || !NEEDS_SERIES.includes(t))).map(type => ({ type, label: typeLabel(type) }));
  return list.length > 1 ? list : null;
}

/** For the "Change its chart type" action: the choice by its label (what people type or pick), or by its type. */
export function viewAsByName(w: Pick<Widget, 'type' | 'config'>, name: string, original?: string): string | undefined {
  const list = viewAsChoices(w, original) || [];
  const n = name.trim().toLowerCase();
  const hit = list.find(x => x.type.toLowerCase() === n || x.label.toLowerCase() === n) || list.find(x => x.label.toLowerCase().startsWith(n));
  return hit ? hit.type : undefined;
}
