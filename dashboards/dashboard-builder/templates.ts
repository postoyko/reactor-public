/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Starter dashboards. Each one is built from the same widgets anyone can add by hand, so a template is only a head start:
 * every widget, wire and colour can be changed afterwards. Pure data, no React.
 */

import { defaultConfig, tileDef } from './registry';
import { newId } from './store';
import { Cond, FilterBarConfig, Widget, WidgetConfig, WidgetType } from './types';

export interface Template {
  id: string;
  name: string;
  tagline: string;
  /** What the person gets and where to go next. */
  detail: string;
  build: () => Widget[];
  /** Tiles this template needs; it is hidden when one is missing from the toolkit. */
  needs?: string[];
  /** Uses containers (split panes, tabs, accordions, carousel). */
  advanced?: boolean;
  /** Row height in px; compact by default, like the incident dashboard. */
  rowH?: number;
  /** The dashboard-wide filter bar the template turns on. */
  bar?: FilterBarConfig;
}

/**
 * While a starter template is being built, widgets get stable ids (w-<template>-<n>) instead of random ones, so building
 * the same template twice gives identical output: Publish all no longer rewrites every file, and git stays quiet.
 */
let stable: { prefix: string; n: number } | null = null;
const widgetId = (): string => (stable ? `w-${stable.prefix}-${++stable.n}` : newId('w'));
const stably = (id: string, build: () => Widget[]) => (): Widget[] => {
  const prev = stable;
  stable = { prefix: id, n: 0 };
  try { return build(); } finally { stable = prev; }
};

type Cfg = Partial<WidgetConfig> & { props?: Record<string, unknown> };

class Sheet {
  list: Widget[] = [];
  add(type: WidgetType, title: string, x: number, y: number, w: number, h: number, cfg: Cfg = {}, parent?: string): Widget {
    const base = defaultConfig(type, cfg.query || 'getAlerts');
    const widget: Widget = { id: widgetId(), type, title, x, y, w, h, config: { ...base, ...cfg } as WidgetConfig, ...(parent ? { parent } : {}) };
    this.list.push(widget);
    return widget;
  }
}

const A = (...f: string[]) => f.map(field => ({ query: 'getAlerts' as const, field }));
const S = (...f: string[]) => f.map(field => ({ query: 'getStories' as const, field }));
const bar = (fields: FilterBarConfig['fields'], extra: Partial<FilterBarConfig> = {}): FilterBarConfig => ({ fields, time: true, preset: 'all', ...extra });

const where = (field: string, value: string, op?: Cond['op']): Cond => ({ field, value, ...(op ? { op } : {}) });
const kpi = (s: Sheet, title: string, x: number, y: number, w: number, cfg: Cfg = {}, parent?: string) =>
  s.add('kpi', title, x, y, w, 3, { metric: 'count', emits: false, ...cfg }, parent);
/** A number with a plain-words caption, tinted when it asks for attention. */
const fig = (s: Sheet, title: string, caption: string, x: number, y: number, w: number, cfg: Cfg = {}, parent?: string) =>
  kpi(s, title, x, y, w, { text: caption, ...cfg }, parent);
const OPEN_INC = where('state', 'resolved', '!=');
const RED = { bg: '#da1e28', fg: '#ffffff' };   // severity 6 / priority 1: the palette's own red, white text
const ORANGE = { bg: '#ff832b', fg: '#161616' }; // severity 5 / priority 2
// Colour carries meaning: severity and priority tiles use the severity palette; counts and totals stay neutral so they are never mistaken for a severity.
const PURPLE = { bg: '#393939', fg: '#ffffff' };
const NAVY = { bg: '#262626', fg: '#ffffff' };
const GREEN = { bg: '#525252', fg: '#ffffff' };
/** The band across the top of a dashboard: what it is and who it is for. */
const head = (s: Sheet, title: string, sub: string) =>
  s.add('text', title, 0, 0, 12, 2, { text: `# ${title}\n${sub}`, emits: false, listens: false, bg: '#161616', fg: '#ffffff', chromeless: true });
const cc0 = (name: string) => `carbon:${name}` as WidgetType;
const attention = (c: Cfg = {}): Cfg => ({ where: where('severity', '5', '>='), also: [where('acknowledged', 'false')], sortBy: 'severity', sortDesc: true, ...c });

const operations = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Operations overview', 'Production alert posture across every monitoring source. Click a bar or slice to filter the rest; click a row for its details.');
  fig(s, 'Open alerts', 'Across all monitoring sources', 0, 2, 3, NAVY);
  fig(s, 'Critical', 'Act now', 3, 2, 3, { where: where('severityLabel', 'Critical'), ...RED });
  fig(s, 'Major', 'Service is degrading', 6, 2, 3, { where: where('severityLabel', 'Major'), ...ORANGE });
  fig(s, 'Not acknowledged', 'Nobody has picked these up', 9, 2, 3, { where: where('acknowledged', 'false') });
  s.add(cc0('StackedAreaChart'), 'Alert volume by severity', 0, 5, 8, 8, { seriesBy: 'severityLabel', props: { bins: 24, legend: 'bottom' } });
  s.add(cc0('StackedBarChart'), 'Severity by team', 8, 5, 4, 8, { groupBy: 'team', seriesBy: 'severityLabel' });
  s.add('table', 'Needs attention: Critical and Major, not yet acknowledged', 0, 13, 8, 10, attention({ columns: ['severityLabel', 'resource', 'summary', 'inIncident', 'runbookName', 'firstOccurrence'], limit: 50, drill: { mode: 'details' } }));
  s.add(cc0('SimpleBarChart'), 'Noisiest resources', 8, 13, 4, 10, { groupBy: 'resource', limit: 10, props: { horizontal: true } });
  return s.list;
};

const triage = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Alert triage', 'The work queue: find an alert, see who owns it, decide what to do next. Search narrows every figure, chart and row below.');
  const search = s.add('carbon:Search', 'Search summary', 0, 2, 12, 3, { props: { labelText: 'Search the alert summary', placeholder: 'For example: pod restarting, disk usage, checkout', size: 'lg' }, bind: { field: 'summary', op: 'contains', query: 'getAlerts' }, listens: false, chromeless: true });
  const out: Widget[] = [];
  out.push(fig(s, 'In the queue', 'Alerts matching the search and filters', 0, 5, 3, NAVY));
  out.push(fig(s, 'Critical and Major', 'Need a decision today', 3, 5, 3, { where: where('severity', '5', '>='), ...RED }));
  out.push(fig(s, 'Unassigned', 'No owner yet', 6, 5, 3, { where: where('owner', '(none)'), ...ORANGE }));
  out.push(fig(s, 'Not acknowledged', 'Nobody has looked at these', 9, 5, 3, { where: where('acknowledged', 'false') }));
  out.push(s.add('bar', 'By severity', 0, 8, 4, 5, { groupBy: 'severityLabel' }));
  out.push(s.add('bar', 'By team', 4, 8, 4, 5, { groupBy: 'team' }));
  out.push(s.add('bar', 'By monitoring source', 8, 8, 4, 5, { groupBy: 'sender', limit: 6 }));
  out.push(s.add('table', 'Alerts to work through', 0, 13, 12, 13, { columns: ['severityLabel', 'resource', 'summary', 'inIncident', 'runbookName', 'owner', 'acknowledged', 'firstOccurrence'], limit: 100, sortBy: 'severity', sortDesc: true, drill: { mode: 'details' } }));
  search.config.sendTo = out.map(w => w.id);
  return s.list;
};

const executive = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Executive summary', 'Service health in one page for leadership: what is broken, how big it is, who is on it, and whether it is getting better.');
  fig(s, 'Open incidents', 'Problems under investigation', 0, 2, 3, { query: 'getStories', where: OPEN_INC, ...PURPLE });
  fig(s, 'Critical alerts', 'Customer impact likely', 3, 2, 3, { where: where('severityLabel', 'Critical'), ...RED });
  fig(s, 'Open alerts', 'Total signal from monitoring', 6, 2, 3, NAVY);
  fig(s, 'Teams engaged', 'Teams with open work', 9, 2, 3, { metric: 'distinct', valueField: 'team', ...GREEN });
  s.add(cc0('DonutChart'), 'Severity mix', 0, 5, 4, 8, { groupBy: 'severityLabel' });
  s.add(cc0('StackedAreaChart'), 'Alert volume by severity', 4, 5, 8, 8, { seriesBy: 'severityLabel', props: { bins: 24 } });
  s.add('table', 'Incidents that need leadership attention (priority 1 and 2)', 0, 13, 8, 6, { query: 'getStories', where: where('priority', '2', '<='), also: [OPEN_INC], columns: ['priority', 'title', 'state', 'team', 'owner', 'created'], sortBy: 'priority', limit: 10, drill: { mode: 'details' } });
  s.add(cc0('SimpleBarChart'), 'Open incidents by team', 8, 13, 4, 6, { query: 'getStories', groupBy: 'team', where: OPEN_INC });
  return s.list;
};

const incidents = (): Widget[] => {
  const s = new Sheet();
  const q = { query: 'getStories' as const };
  head(s, 'Incident review', 'Incidents (correlated alert groups) by priority, team and state. Click a priority or team to focus the list.');
  fig(s, 'Open incidents', 'Not yet resolved', 0, 2, 3, { ...q, where: OPEN_INC, ...NAVY });
  fig(s, 'Priority 1', 'All hands', 3, 2, 3, { ...q, where: where('priority', '1'), also: [OPEN_INC], ...RED });
  fig(s, 'Priority 2', 'Work in progress', 6, 2, 3, { ...q, where: where('priority', '2'), also: [OPEN_INC], ...ORANGE });
  fig(s, 'Alerts in open incidents', 'Folded together by correlation', 9, 2, 3, { ...q, where: OPEN_INC, metric: 'sum', valueField: 'alertCount' });
  s.add(cc0('StackedBarChart'), 'Priority by team', 0, 5, 6, 7, { ...q, groupBy: 'team', seriesBy: 'priority' });
  s.add(cc0('DonutChart'), 'Incidents by state', 6, 5, 6, 7, { ...q, groupBy: 'state' });
  s.add('table', 'Incidents', 0, 12, 12, 7, { ...q, columns: ['priority', 'title', 'state', 'team', 'owner', 'alertCount', 'created'], sortBy: 'priority', limit: 50, drill: { mode: 'details' } });
  return s.list;
};

const telco = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Telco network operations', 'Causal mesh and command views on live alerts. The tabs below are your own dashboards, embedded.');
  fig(s, 'Open alerts', 'Network and service alarms', 0, 2, 4, NAVY);
  fig(s, 'Critical', 'Service-affecting', 4, 2, 4, { where: where('severityLabel', 'Critical'), ...RED });
  fig(s, 'Open incidents', 'Correlated faults', 8, 2, 4, { query: 'getStories', where: OPEN_INC, ...PURPLE });
  const tabs = s.add('carbon:Tabs', 'Network views', 0, 5, 12, 17, { props: { items: ['Causal mesh :: widgets', 'Command center :: widgets', 'Alerts :: widgets'] }, listens: false });
  const mesh = tileDef('tile:telco-causal-gen2');
  const cmd = tileDef('tile:telco-command');
  if (mesh) s.add('tile:telco-causal-gen2', mesh.label, 0, 0, 12, 14, {}, `${tabs.id}#0`);
  if (cmd) s.add('tile:telco-command', cmd.label, 0, 0, 12, 14, {}, `${tabs.id}#1`);
  s.add(cc0('SimpleBarChart'), 'Alerts by type', 0, 0, 5, 9, { groupBy: 'type' }, `${tabs.id}#2`);
  s.add('table', 'Alerts', 5, 0, 7, 12, { columns: ['severityLabel', 'resource', 'summary', 'firstOccurrence'], sortBy: 'severity', sortDesc: true, limit: 50, drill: { mode: 'details' } }, `${tabs.id}#2`);
  return s.list;
};

const workspace = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Investigation workspace', 'Search on the left, read the pattern on the right. Everything follows the search box and anything you click.');
  const sp = s.add('carbon:SplitPane', 'Investigation', 0, 2, 12, 19, { props: { direction: 'horizontal', first: 'widgets', second: 'widgets', size: 56 }, listens: false });
  const search = s.add('carbon:Search', 'Search summary', 0, 0, 12, 3, { props: { labelText: 'Search the alert summary', placeholder: 'Type to narrow the alerts' }, bind: { field: 'summary', op: 'contains', query: 'getAlerts' }, listens: false, chromeless: true }, `${sp.id}#0`);
  const table = s.add('table', 'Alerts', 0, 3, 12, 14, { columns: ['severityLabel', 'resource', 'summary', 'inIncident', 'runbookName', 'firstOccurrence'], limit: 100, sortBy: 'severity', sortDesc: true, drill: { mode: 'details' } }, `${sp.id}#0`);
  const a = s.add(cc0('DonutChart'), 'Severity', 0, 0, 6, 7, { groupBy: 'severityLabel' }, `${sp.id}#1`);
  const b = s.add(cc0('SimpleBarChart'), 'Team', 6, 0, 6, 7, { groupBy: 'team' }, `${sp.id}#1`);
  const c = s.add(cc0('StackedAreaChart'), 'Alerts over time', 0, 7, 12, 8, { seriesBy: 'severityLabel' }, `${sp.id}#1`);
  search.config.sendTo = [table.id, a.id, b.id, c.id];
  return s.list;
};

const noc = (): Widget[] => {
  const s = new Sheet();
  head(s, 'NOC command center', 'One screen for the shift: figures on top, views on the left, where-from breakdowns on the right.');
  fig(s, 'Open alerts', 'Right now', 0, 2, 3, NAVY);
  fig(s, 'Critical', 'Act now', 3, 2, 3, { where: where('severityLabel', 'Critical'), ...RED });
  fig(s, 'Major', 'Degrading', 6, 2, 3, { where: where('severityLabel', 'Major'), ...ORANGE });
  fig(s, 'Not acknowledged', 'Unowned', 9, 2, 3, { where: where('acknowledged', 'false') });
  const sp = s.add('carbon:SplitPane', 'Command center', 0, 5, 12, 20, { props: { direction: 'horizontal', first: 'widgets', second: 'widgets', size: 64 }, listens: false });
  const tabs = s.add('carbon:Tabs', 'Views', 0, 0, 12, 18, { props: { items: ['Overview :: widgets', 'Alerts :: widgets', 'Timeline :: widgets'] }, listens: false }, `${sp.id}#0`);
  s.add(cc0('StackedBarChart'), 'Severity by team', 0, 0, 6, 14, { groupBy: 'severityLabel', seriesBy: 'team' }, `${tabs.id}#0`);
  s.add(cc0('DonutChart'), 'By monitoring source', 6, 0, 6, 14, { groupBy: 'sender', limit: 6 }, `${tabs.id}#0`);
  s.add('table', 'Alerts', 0, 0, 12, 14, { columns: ['severityLabel', 'resource', 'summary', 'inIncident', 'runbookName', 'firstOccurrence'], limit: 100, sortBy: 'severity', sortDesc: true, drill: { mode: 'details' } }, `${tabs.id}#1`);
  s.add(cc0('StackedAreaChart'), 'Alert volume by severity', 0, 0, 12, 12, { seriesBy: 'severityLabel' }, `${tabs.id}#2`);
  const acc = s.add('carbon:Accordion', 'Breakdowns', 0, 0, 12, 18, { props: { items: ['By team :: widgets', 'Top monitoring sources :: widgets', 'Busiest resources :: widgets'], startOpen: true }, listens: false }, `${sp.id}#1`);
  s.add('bar', 'By team', 0, 0, 12, 3, { groupBy: 'team' }, `${acc.id}#0`);
  s.add('bar', 'Top sources', 0, 0, 12, 4, { groupBy: 'sender', limit: 6 }, `${acc.id}#1`);
  s.add('bar', 'Busiest resources', 0, 0, 12, 6, { groupBy: 'resource', limit: 8 }, `${acc.id}#2`);
  return s.list;
};

const service = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Service review', 'A periodic review pack: summary, incidents, alerts and notes. Use it in the weekly operations meeting.');
  const tabs = s.add('carbon:Tabs', 'Service review', 0, 2, 12, 22, { props: { items: ['Summary :: widgets', 'Incidents :: widgets', 'Alerts :: widgets', 'Notes :: widgets'] }, listens: false });
  const t = (i: number) => `${tabs.id}#${i}`;
  fig(s, 'Open alerts', 'In scope for this review', 0, 0, 3, NAVY, t(0));
  fig(s, 'Critical', 'Needs a post-incident look', 3, 0, 3, { where: where('severityLabel', 'Critical'), ...RED }, t(0));
  fig(s, 'Open incidents', 'Still unresolved', 6, 0, 3, { query: 'getStories', where: OPEN_INC, ...PURPLE }, t(0));
  fig(s, 'Teams involved', 'Who carried the load', 9, 0, 3, { metric: 'distinct', valueField: 'team', ...GREEN }, t(0));
  const sp = s.add('carbon:SplitPane', 'Breakdown', 0, 3, 12, 15, { props: { direction: 'horizontal', first: 'widgets', second: 'widgets', size: 45 }, listens: false }, t(0));
  s.add(cc0('DonutChart'), 'Severity mix', 0, 0, 12, 11, { groupBy: 'severityLabel' }, `${sp.id}#0`);
  const acc = s.add('carbon:Accordion', 'Where it comes from', 0, 0, 12, 13, { props: { items: ['By team :: widgets', 'By monitoring source :: widgets'], startOpen: true }, listens: false }, `${sp.id}#1`);
  s.add('bar', 'By team', 0, 0, 12, 4, { groupBy: 'team' }, `${acc.id}#0`);
  s.add('bar', 'By source', 0, 0, 12, 5, { groupBy: 'sender', limit: 6 }, `${acc.id}#1`);
  s.add(cc0('SimpleBarChart'), 'Incidents by team', 0, 0, 4, 9, { query: 'getStories', groupBy: 'team' }, t(1));
  s.add('table', 'Incidents', 4, 0, 8, 14, { query: 'getStories', columns: ['priority', 'title', 'state', 'team', 'alertCount', 'created'], sortBy: 'priority', limit: 50, drill: { mode: 'details' } }, t(1));
  const search = s.add('carbon:Search', 'Search summary', 0, 0, 12, 3, { props: { labelText: 'Search the alert summary', placeholder: 'Type to narrow the alerts' }, bind: { field: 'summary', op: 'contains', query: 'getAlerts' }, listens: false, chromeless: true }, t(2));
  const table = s.add('table', 'Alerts', 0, 3, 12, 14, { columns: ['severityLabel', 'resource', 'summary', 'inIncident', 'runbookName', 'firstOccurrence'], limit: 100, sortBy: 'severity', sortDesc: true, drill: { mode: 'details' } }, t(2));
  search.config.sendTo = [table.id];
  s.add('text', 'Review notes', 0, 0, 12, 8, { text: '# Review notes\nWhat changed this period?\n- Add the notable incidents and what caused them\nWhat is still open, and who owns it?\n- Name an owner and a date for each item\nWhat do we do differently next time?\n- One change per recurring cause', emits: false, listens: false }, t(3));
  return s.list;
};

const workbench = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Triage workbench', 'Charts above for the shape of the problem, queues below for the work. Critical first.');
  const sp = s.add('carbon:SplitPane', 'Workbench', 0, 2, 12, 24, { props: { direction: 'vertical', first: 'widgets', second: 'widgets', size: 34 }, listens: false });
  s.add(cc0('SimpleBarChart'), 'By severity', 0, 0, 4, 7, { groupBy: 'severityLabel' }, `${sp.id}#0`);
  s.add(cc0('DonutChart'), 'By monitoring source', 4, 0, 4, 7, { groupBy: 'sender', limit: 6 }, `${sp.id}#0`);
  s.add(cc0('SimpleBarChart'), 'By team', 8, 0, 4, 7, { groupBy: 'team' }, `${sp.id}#0`);
  const tabs = s.add('carbon:Tabs', 'Work queues', 0, 0, 12, 15, { props: { items: ['Critical :: widgets', 'Major :: widgets', 'Everything else :: widgets'] }, listens: false }, `${sp.id}#1`);
  const cols = ['severityLabel', 'resource', 'summary', 'inIncident', 'runbookName', 'owner', 'firstOccurrence'];
  s.add('table', 'Critical alerts', 0, 0, 12, 12, { columns: cols, where: where('severityLabel', 'Critical'), limit: 100, drill: { mode: 'details' } }, `${tabs.id}#0`);
  s.add('table', 'Major alerts', 0, 0, 12, 12, { columns: cols, where: where('severityLabel', 'Major'), limit: 100, drill: { mode: 'details' } }, `${tabs.id}#1`);
  s.add('table', 'Everything else', 0, 0, 12, 12, { columns: cols, where: where('severity', '5', '<'), limit: 100, sortBy: 'severity', sortDesc: true, drill: { mode: 'details' } }, `${tabs.id}#2`);
  return s.list;
};

const wall = (): Widget[] => {
  const s = new Sheet();
  const c = s.add('carbon:Carousel', 'Wall display', 0, 0, 12, 21, { props: { items: ['Right now :: widgets', 'Where it hurts :: widgets', 'Incidents :: widgets', 'Trend :: widgets'], auto: 12, dots: true, loop: true }, listens: false });
  const at = (i: number) => `${c.id}#${i}`;
  const big = (title: string, caption: string, x: number, cfg: Cfg) => s.add('kpi', title, x, 0, 3, 6, { metric: 'count', emits: false, text: caption, ...cfg }, at(0));
  big('Open alerts', 'Across all sources', 0, { ...NAVY });
  big('Critical', 'Act now', 3, { where: where('severityLabel', 'Critical'), ...RED });
  big('Major', 'Degrading', 6, { where: where('severityLabel', 'Major'), ...ORANGE });
  big('Open incidents', 'Under investigation', 9, { query: 'getStories', where: OPEN_INC, ...PURPLE });
  s.add(cc0('DonutChart'), 'Severity mix', 0, 6, 5, 11, { groupBy: 'severityLabel' }, at(0));
  s.add(cc0('StackedAreaChart'), 'Alert volume by severity', 5, 6, 7, 11, { seriesBy: 'severityLabel' }, at(0));
  s.add(cc0('StackedBarChart'), 'Severity by team', 0, 0, 7, 17, { groupBy: 'team', seriesBy: 'severityLabel' }, at(1));
  s.add(cc0('SimpleBarChart'), 'Busiest resources', 7, 0, 5, 17, { groupBy: 'resource', limit: 8, props: { horizontal: true } }, at(1));
  s.add('table', 'Incidents by priority', 0, 0, 12, 16, { query: 'getStories', columns: ['priority', 'title', 'team', 'state', 'alertCount'], sortBy: 'priority', limit: 12 }, at(2));
  s.add(cc0('StackedAreaChart'), 'Alerts over time by team', 0, 0, 12, 16, { seriesBy: 'team' }, at(3));
  return s.list;
};

const teamReport = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Team report', 'A readout for one team or one period: the figures, then each section opened in turn.');
  fig(s, 'Open alerts', 'In this report', 0, 2, 3, NAVY);
  fig(s, 'Critical', 'Highest severity', 3, 2, 3, { where: where('severityLabel', 'Critical'), ...RED });
  fig(s, 'Major', 'Next highest', 6, 2, 3, { where: where('severityLabel', 'Major'), ...ORANGE });
  fig(s, 'Open incidents', 'Correlated problems', 9, 2, 3, { query: 'getStories', where: OPEN_INC, ...PURPLE });
  const acc = s.add('carbon:Accordion', 'Report', 0, 5, 12, 22, { props: { items: ['Critical alerts :: widgets', 'Major alerts :: widgets', 'Incidents by team :: widgets', 'Alerts by monitoring source :: widgets'], startOpen: true }, listens: false });
  const cols = ['resource', 'summary', 'inIncident', 'runbookName', 'owner', 'firstOccurrence'];
  s.add('table', 'Critical alerts', 0, 0, 12, 7, { columns: cols, where: where('severityLabel', 'Critical'), limit: 50, drill: { mode: 'details' } }, `${acc.id}#0`);
  s.add('table', 'Major alerts', 0, 0, 12, 7, { columns: cols, where: where('severityLabel', 'Major'), limit: 50, drill: { mode: 'details' } }, `${acc.id}#1`);
  s.add(cc0('StackedBarChart'), 'Incident priority by team', 0, 0, 5, 8, { query: 'getStories', groupBy: 'team', seriesBy: 'priority' }, `${acc.id}#2`);
  s.add('table', 'Incidents', 5, 0, 7, 8, { query: 'getStories', columns: ['priority', 'title', 'team', 'created'], sortBy: 'priority', limit: 20 }, `${acc.id}#2`);
  s.add(cc0('SimpleBarChart'), 'Alerts by monitoring source', 0, 0, 12, 8, { groupBy: 'sender', limit: 8 }, `${acc.id}#3`);
  return s.list;
};

/** Two levels of containment: tabs on the outside, an accordion or split pane inside each tab. */
const hub = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Operations hub', 'Health, investigation and reports in one place. Tabs on the outside; accordions and split panes inside.');
  const tabs = s.add('carbon:Tabs', 'Operations hub', 0, 2, 12, 26, { props: { items: ['Health :: widgets', 'Investigate :: widgets', 'Reports :: widgets'] }, listens: false });
  const t = (i: number) => `${tabs.id}#${i}`;
  const health = s.add('carbon:Accordion', 'Health sections', 0, 0, 12, 24, { props: { items: ['Headline figures :: widgets', 'Severity and source :: widgets', 'Trend :: widgets'], startOpen: true }, listens: false }, t(0));
  const h = (i: number) => `${health.id}#${i}`;
  fig(s, 'Open alerts', 'All sources', 0, 0, 3, NAVY, h(0));
  fig(s, 'Critical', 'Act now', 3, 0, 3, { where: where('severityLabel', 'Critical'), ...RED }, h(0));
  fig(s, 'Major', 'Degrading', 6, 0, 3, { where: where('severityLabel', 'Major'), ...ORANGE }, h(0));
  fig(s, 'Open incidents', 'Under investigation', 9, 0, 3, { query: 'getStories', where: OPEN_INC, ...PURPLE }, h(0));
  s.add(cc0('SimpleBarChart'), 'By severity', 0, 0, 6, 8, { groupBy: 'severityLabel' }, h(1));
  s.add(cc0('DonutChart'), 'By monitoring source', 6, 0, 6, 8, { groupBy: 'sender', limit: 6 }, h(1));
  s.add(cc0('StackedAreaChart'), 'Alert volume by severity', 0, 0, 12, 8, { seriesBy: 'severityLabel' }, h(2));
  const sp = s.add('carbon:SplitPane', 'Investigation', 0, 0, 12, 22, { props: { direction: 'horizontal', first: 'widgets', second: 'widgets', size: 58 }, listens: false }, t(1));
  const search = s.add('carbon:Search', 'Search summary', 0, 0, 12, 3, { props: { labelText: 'Search the alert summary', placeholder: 'Type to narrow the alerts' }, bind: { field: 'summary', op: 'contains', query: 'getAlerts' }, listens: false, chromeless: true }, `${sp.id}#0`);
  const table = s.add('table', 'Alerts', 0, 3, 12, 15, { columns: ['severityLabel', 'resource', 'summary', 'inIncident', 'runbookName', 'firstOccurrence'], limit: 100, sortBy: 'severity', sortDesc: true, drill: { mode: 'details' } }, `${sp.id}#0`);
  const a = s.add(cc0('SimpleBarChart'), 'By team', 0, 0, 12, 8, { groupBy: 'team' }, `${sp.id}#1`);
  const b = s.add(cc0('SimpleBarChart'), 'By monitoring source', 0, 8, 12, 8, { groupBy: 'sender', limit: 6 }, `${sp.id}#1`);
  search.config.sendTo = [table.id, a.id, b.id];
  const rep = s.add('carbon:Accordion', 'Report sections', 0, 0, 12, 24, { props: { items: ['Critical alerts :: widgets', 'Incidents :: widgets'], startOpen: true }, listens: false }, t(2));
  s.add('table', 'Critical alerts', 0, 0, 12, 9, { columns: ['resource', 'summary', 'team', 'owner', 'firstOccurrence'], where: where('severityLabel', 'Critical'), limit: 50, drill: { mode: 'details' } }, `${rep.id}#0`);
  s.add('table', 'Incidents', 0, 0, 12, 9, { query: 'getStories', columns: ['priority', 'title', 'team', 'alertCount', 'created'], sortBy: 'priority', limit: 20 }, `${rep.id}#1`);
  return s.list;
};

const insight = (): Widget[] => {
  const s = new Sheet();
  const c = (name: string) => `carbon:${name}` as WidgetType;
  s.add(c('ShapeIndicator'), 'Worst severity', 0, 0, 3, 2, { props: { source: 'severity', label: 'Worst: {value}' } });
  s.add(c('IconIndicator'), 'Critical alerts', 3, 0, 3, 2, { where: where('severityLabel', 'Critical'), props: { source: 'live', label: '{value} critical', warnAt: 1, critAt: 5 } });
  s.add(c('BadgeIndicator'), 'Open alerts', 6, 0, 2, 2, { props: { label: 'Open', source: 'live' } });
  s.add(c('Popover'), 'By team', 8, 0, 2, 2, { groupBy: 'team', props: { text: 'Teams', content: 'Pick a team to filter the whole board.', limit: 8 } });
  s.add(c('ComboButton'), 'Quick filters', 10, 0, 2, 2, { props: { items: ['Critical only :: filter:severityLabel=Critical', 'Major only :: filter:severityLabel=Major', 'Clear my filters :: clear', 'Documentation :: https://www.ibm.com/docs'] } });
  s.add(c('GaugeChart'), 'Alert load', 0, 2, 3, 7, { props: { max: 150, warnAt: 60, critAt: 100, type: 'semi' } });
  s.add(c('StackedBarChart'), 'Severity by team', 3, 2, 5, 7, { groupBy: 'severityLabel', seriesBy: 'team', limit: 7 });
  s.add(c('DonutChart'), 'By source', 8, 2, 4, 7, { groupBy: 'sender', limit: 6 });
  s.add(c('AreaChart'), 'Alerts over time by severity', 0, 9, 6, 8, { seriesBy: 'severityLabel', props: { bins: 24 } });
  s.add(c('HeatmapChart'), 'Team and severity', 6, 9, 6, 8, { groupBy: 'team', seriesBy: 'severityLabel' });
  s.add(c('AlluvialChart'), 'Severity to team', 0, 17, 7, 9, { groupBy: 'severityLabel', seriesBy: 'team', limit: 7 });
  s.add(c('TreemapChart'), 'Busiest resources', 7, 17, 5, 9, { groupBy: 'resource', limit: 12 });
  s.add('table', 'Alerts', 0, 26, 12, 9, { columns: ['severityLabel', 'resource', 'summary', 'inIncident', 'runbookName', 'firstOccurrence'], limit: 50, drill: { mode: 'details' } });
  return s.list;
};

const cc = (name: string) => `carbon:${name}` as WidgetType;

/** Chart gallery 1: comparing categories. Every chart reads live alerts; click any of them and the others follow. */
const galleryCompare = (): Widget[] => {
  const s = new Sheet();
  s.add(cc('SimpleBarChart'), 'Alerts by severity', 0, 0, 4, 7, { groupBy: 'severityLabel' });
  s.add(cc('GroupedBarChart'), 'Severity by team', 4, 0, 4, 7, { groupBy: 'severityLabel', seriesBy: 'team' });
  s.add(cc('StackedBarChart'), 'Source by severity', 8, 0, 4, 7, { groupBy: 'sender', seriesBy: 'severityLabel', limit: 6, props: { horizontal: true } });
  s.add(cc('LollipopChart'), 'Busiest resources', 0, 7, 4, 7, { groupBy: 'resource', limit: 8 });
  s.add(cc('PieChart'), 'Alerts by type', 4, 7, 4, 7, { groupBy: 'type', limit: 6 });
  s.add(cc('DonutChart'), 'Alerts by team', 8, 7, 4, 7, { groupBy: 'team' });
  s.add(cc('TreemapChart'), 'Resources by alert count', 0, 14, 6, 8, { groupBy: 'resource', limit: 14 });
  s.add(cc('WordCloudChart'), 'Alert types', 6, 14, 6, 8, { groupBy: 'type', props: { limit: 30 } });
  return s.list;
};

/** Chart gallery 2: change over time and relationships. */
const galleryPatterns = (): Widget[] => {
  const s = new Sheet();
  s.add(cc('LineChart'), 'Alerts over time by severity', 0, 0, 6, 8, { seriesBy: 'severityLabel' });
  s.add(cc('AreaChart'), 'Alerts over time by team', 6, 0, 6, 8, { seriesBy: 'team' });
  s.add(cc('StackedAreaChart'), 'Stacked by severity', 0, 8, 6, 8, { seriesBy: 'severityLabel' });
  s.add(cc('ScatterChart'), 'Each alert: when and how severe', 6, 8, 6, 8, { seriesBy: 'team' });
  s.add(cc('HeatmapChart'), 'Team and severity', 0, 16, 6, 8, { groupBy: 'team', seriesBy: 'severityLabel' });
  s.add(cc('RadarChart'), 'Severity profile by team', 6, 16, 6, 8, { groupBy: 'severityLabel', seriesBy: 'team' });
  s.add(cc('AlluvialChart'), 'Type to team', 0, 24, 8, 9, { groupBy: 'type', seriesBy: 'team', limit: 6 });
  s.add(cc('GaugeChart'), 'Alert load', 8, 24, 4, 6, { props: { max: 150, warnAt: 60, critAt: 100 } });
  s.add(cc('MeterChart'), 'Critical budget', 8, 30, 4, 3, { where: where('severityLabel', 'Critical'), props: { label: 'Critical (budget 20)', max: 20, warnAt: 5, critAt: 12 } });
  return s.list;
};

/** Status board: tags, notifications, indicators, progress bars and a badge, all counting live alerts. */
const statusBoard = (): Widget[] => {
  const s = new Sheet();
  const tag = (text: string, type: string, x: number, sev: string) =>
    s.add(cc('Tag'), text, x, 0, 2, 2, { where: where('severityLabel', sev), props: { text, type, showValue: true } });
  tag('Critical', 'auto', 0, 'Critical'); tag('Major', 'auto', 2, 'Major'); tag('Minor', 'auto', 4, 'Minor');
  tag('Warning', 'auto', 6, 'Warning'); tag('Information', 'auto', 8, 'Information'); tag('Indeterminate', 'auto', 10, 'Indeterminate');
  s.add(cc('InlineNotification'), 'Critical alert banner', 0, 2, 6, 2, { where: where('severityLabel', 'Critical'), props: { kind: 'error', title: 'Critical alerts are open.', subtitle: 'Count now:', when: 'above', threshold: 0, showValue: true, hideClose: true } });
  s.add(cc('InlineNotification'), 'Major alert banner', 6, 2, 6, 2, { where: where('severityLabel', 'Major'), props: { kind: 'warning', title: 'Major alerts are piling up.', subtitle: 'Count now:', when: 'above', threshold: 10, showValue: true, hideClose: true } });
  s.add(cc('ShapeIndicator'), 'Worst severity', 0, 4, 3, 2, { props: { source: 'severity', label: 'Worst: {value}' } });
  s.add(cc('IconIndicator'), 'Critical', 3, 4, 3, 2, { where: where('severityLabel', 'Critical'), props: { source: 'live', label: '{value} critical', warnAt: 1, critAt: 5 } });
  s.add(cc('IconIndicator'), 'Major', 6, 4, 3, 2, { where: where('severityLabel', 'Major'), props: { source: 'live', label: '{value} major', warnAt: 10, critAt: 25 } });
  s.add(cc('BadgeIndicator'), 'Not acknowledged', 9, 4, 3, 2, { where: where('acknowledged', 'false'), props: { label: 'Not acknowledged', source: 'live' } });
  s.add(cc('ProgressBar'), 'Critical against target', 0, 6, 6, 3, { where: where('severityLabel', 'Critical'), props: { label: 'Critical alerts (target: under 20)', source: 'live', max: 20, size: 'big' } });
  s.add(cc('ProgressBar'), 'Major against budget', 6, 6, 6, 3, { where: where('severityLabel', 'Major'), props: { label: 'Major alerts (budget: 60)', source: 'live', max: 60, size: 'big' } });
  s.add(cc('Popover'), 'By team', 0, 9, 3, 2, { groupBy: 'team', props: { text: 'Teams', content: 'Choose a team to filter the table and chart.' } });
  s.add(cc('ComboButton'), 'Quick filters', 3, 9, 4, 2, { props: { items: ['Critical only :: filter:severityLabel=Critical', 'Major only :: filter:severityLabel=Major', 'Clear my filters :: clear'] } });
  s.add(cc('DataTable'), 'Open alerts', 0, 11, 8, 10, { columns: ['severityLabel', 'resource', 'summary', 'team'], limit: 100, props: { pageSize: 8 } });
  s.add(cc('DonutChart'), 'By severity', 8, 11, 4, 10, { groupBy: 'severityLabel' });
  return s.list;
};

/** Control room: Carbon inputs on the left drive everything on the right. */
const controlRoom = (): Widget[] => {
  const s = new Sheet();
  const out: Widget[] = [];
  out.push(kpi(s, 'Alerts shown', 3, 0, 3));
  out.push(kpi(s, 'Teams', 6, 0, 3, { metric: 'distinct', valueField: 'team' }));
  out.push(kpi(s, 'Resources', 9, 0, 3, { metric: 'distinct', valueField: 'resource' }));
  out.push(s.add(cc('StackedBarChart'), 'Severity by team', 3, 3, 5, 7, { groupBy: 'severityLabel', seriesBy: 'team' }));
  out.push(s.add(cc('DonutChart'), 'By source', 8, 3, 4, 7, { groupBy: 'sender', limit: 6 }));
  out.push(s.add(cc('DataTable'), 'Alerts', 3, 10, 9, 10, { columns: ['severityLabel', 'resource', 'summary', 'state', 'team'], limit: 200 }));
  s.add(cc('Dropdown'), 'Severity', 0, 0, 3, 3, { groupBy: 'severityLabel', props: { source: 'field', titleText: 'Severity', placeholder: 'Any severity' } });
  s.add(cc('MultiSelect'), 'Team', 0, 3, 3, 3, { groupBy: 'team', props: { source: 'field', titleText: 'Teams', placeholder: 'Any team' } });
  s.add(cc('RadioButtonGroup'), 'State', 0, 6, 3, 4, { groupBy: 'state', props: { source: 'field', legendText: 'State' } });
  s.add(cc('ComboBox'), 'Resource', 0, 10, 3, 3, { groupBy: 'resource', props: { source: 'field', titleText: 'Resource', placeholder: 'Type or choose' } });
  const search = s.add(cc('Search'), 'Search summary', 0, 13, 3, 3, { props: { labelText: 'Search the summary', placeholder: 'Type to narrow' }, bind: { field: 'summary', op: 'contains', query: 'getAlerts' }, listens: false });
  const slider = s.add(cc('Slider'), 'Minimum severity', 0, 16, 3, 3, { props: { labelText: 'Minimum severity (0 to 6)', min: 0, max: 6, step: 1, value: 0 }, bind: { field: 'severity', op: '>=', query: 'getAlerts' }, listens: false });
  search.config.sendTo = out.map(w => w.id);
  slider.config.sendTo = out.map(w => w.id);
  return s.list;
};

/** Action wiring showcase: buttons, a toggle and a chart make other widgets react. */
const actionsDemo = (): Widget[] => {
  const s = new Sheet();
  const status = s.add('text', 'What is picked', 9, 0, 3, 4, { text: 'Nothing picked yet. Click a bar, or use the buttons.', emits: false, listens: false });
  const prog = s.add(cc('ProgressBar'), 'Progress', 0, 4, 12, 2, { props: { label: 'Progress: press Add 10%', value: 0, max: 100, source: 'fixed' } });
  const chart = s.add(cc('SimpleBarChart'), 'Alerts by severity', 0, 6, 6, 8, { groupBy: 'severityLabel' });
  s.add(cc('DonutChart'), 'By source', 6, 6, 6, 8, { groupBy: 'sender', limit: 6 });
  const table = s.add(cc('DataTable'), 'Alerts', 0, 14, 12, 10, { columns: ['severityLabel', 'resource', 'summary', 'state', 'team'], limit: 200, hidden: true });
  s.add(cc('Toggle'), 'Show the alert table', 0, 0, 3, 4, { props: { labelText: 'Show the alert table', labelA: 'Hidden', labelB: 'Shown' }, on: [{ event: 'change', to: table.id, do: 'toggleVisible' }] });
  s.add(cc('Button'), 'Critical only', 3, 0, 2, 4, { props: { text: 'Critical only', kind: 'primary' }, on: [{ event: 'click', to: chart.id, do: 'pick', arg: 'Critical' }] });
  s.add(cc('Button'), 'Clear', 5, 0, 2, 4, { props: { text: 'Clear', kind: 'tertiary' }, on: [{ event: 'click', to: chart.id, do: 'clearPick' }] });
  s.add(cc('Button'), 'Add 10%', 7, 0, 2, 4, { props: { text: 'Add 10%', kind: 'secondary' }, on: [{ event: 'click', to: prog.id, do: 'add:value', arg: '10' }] });
  chart.config.on = [{ event: 'select', to: status.id, do: 'set:text', arg: 'Picked: {value}' }];
  return s.list;
};

/** Incident desk: the same components on incidents (getStories). */
const incidentDesk = (): Widget[] => {
  const s = new Sheet();
  const q = { query: 'getStories' as const };
  const tag = (text: string, type: string, x: number, pr: string) =>
    s.add(cc('Tag'), text, x, 0, 2, 2, { ...q, where: where('priority', pr), props: { text, type, showValue: true } });
  tag('Priority 1', 'auto', 0, '1'); tag('Priority 2', 'auto', 2, '2'); tag('Priority 3', 'auto', 4, '3'); tag('Priority 4', 'auto', 6, '4');
  s.add(cc('BadgeIndicator'), 'Alerts inside incidents', 8, 0, 4, 2, { ...q, metric: 'sum', valueField: 'alertCount', props: { label: 'Alerts inside incidents', source: 'live' } });
  s.add(cc('InlineNotification'), 'Priority 1 banner', 0, 2, 8, 2, { ...q, where: where('priority', '1'), props: { kind: 'error', title: 'Priority 1 incidents are open.', subtitle: 'Count now:', when: 'above', threshold: 0, showValue: true, hideClose: true } });
  s.add(cc('Popover'), 'By team', 8, 2, 2, 2, { ...q, groupBy: 'team', props: { text: 'Teams', content: 'Choose a team.' } });
  s.add(cc('ComboButton'), 'Quick filters', 10, 2, 2, 2, { ...q, props: { items: ['Priority 1 :: filter:priority=1', 'Priority 2 :: filter:priority=2', 'Clear my filters :: clear'] } });
  s.add(cc('StackedBarChart'), 'Priority by team', 0, 4, 4, 7, { ...q, groupBy: 'team', seriesBy: 'priority' });
  s.add(cc('AreaChart'), 'Incidents opened over time', 4, 4, 4, 7, { ...q, seriesBy: 'priority' });
  s.add(cc('DonutChart'), 'By state', 8, 4, 4, 7, { ...q, groupBy: 'state' });
  s.add(cc('StructuredList'), 'Incident queue', 0, 11, 5, 9, { ...q, columns: ['priority', 'title', 'team', 'state'], limit: 30 });
  s.add(cc('DataTable'), 'Incidents', 5, 11, 7, 9, { ...q, columns: ['priority', 'title', 'state', 'team', 'owner', 'alertCount'], limit: 100, props: { pageSize: 8 } });
  return s.list;
};

/** Severity scorecard: a gauge, a meter and a status shape for each severity, with live thresholds. */
const scorecard = (): Widget[] => {
  const s = new Sheet();
  const rows: Array<[string, number, number, number]> = [['Critical', 30, 5, 15], ['Major', 60, 20, 40], ['Minor', 60, 25, 45], ['Warning', 60, 25, 45]];
  rows.forEach(([sev, max, warn, crit], i) => {
    const x = i * 3;
    s.add(cc('ShapeIndicator'), `${sev} status`, x, 0, 3, 2, { where: where('severityLabel', sev), props: { source: 'live', label: `${sev}: {value}`, warnAt: warn, critAt: crit } });
    s.add(cc('GaugeChart'), `${sev} load`, x, 2, 3, 6, { where: where('severityLabel', sev), props: { max, warnAt: warn, critAt: crit, type: 'semi' } });
    s.add(cc('MeterChart'), `${sev} budget`, x, 8, 3, 3, { where: where('severityLabel', sev), props: { label: `${sev} (budget ${max})`, max, warnAt: warn, critAt: crit } });
  });
  s.add(cc('AlluvialChart'), 'Severity to team', 0, 11, 7, 9, { groupBy: 'severityLabel', seriesBy: 'team', limit: 7 });
  s.add(cc('HeatmapChart'), 'Team and severity', 7, 11, 5, 9, { groupBy: 'team', seriesBy: 'severityLabel' });
  return s.list;
};

/** Puts the title band above a finished layout, pushing everything else down. */
const headed = (title: string, sub: string, build: () => Widget[]) => (): Widget[] => {
  const list = build();
  list.forEach(w => { if (!w.parent) w.y += 2; });
  const s = new Sheet();
  const h = head(s, title, sub);
  return [h, ...list];
};

/** The incident-alert-dashboard rebuilt from components: KPIs, four analytic cards, incidents beside a tabbed intelligence panel, and an alert stream in tabs inside an accordion. */
const incidentOps = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Incident command center', 'Open incidents, severity, sources and the live alert stream. Click any bar, slice or tile to filter everything else; click a row for details.');
  // Executive KPIs
  fig(s, 'Open incidents', 'Under investigation', 0, 2, 2, { query: 'getStories', where: OPEN_INC, ...NAVY });
  fig(s, 'Priority 1 and 2', 'Leadership attention', 2, 2, 2, { query: 'getStories', where: where('priority', '2', '<='), also: [OPEN_INC], ...RED });
  fig(s, 'Critical alerts', 'Severity 6, act now', 4, 2, 2, { where: where('severityLabel', 'Critical'), ...RED });
  fig(s, 'Major alerts', 'Severity 5, degrading', 6, 2, 2, { where: where('severityLabel', 'Major'), ...ORANGE });
  fig(s, 'Not acknowledged', 'Nobody has picked these up', 8, 2, 2, { where: where('acknowledged', 'false') });
  fig(s, 'Resources affected', 'Distinct hosts and services', 10, 2, 2, { metric: 'distinct', valueField: 'resource', ...GREEN });
  // Business application health, as Concert Operate sees it
  const appRow: Widget[] = [];
  appRow.push(s.add('table', 'Application health', 0, 5, 8, 7, { query: 'getApplications', columns: ['name', 'severityLabel', 'alerts', 'critical', 'major', 'incidents', 'criticality'], sortBy: 'criticalityValue', sortDesc: true, limit: 50 }));
  appRow.push(s.add(cc0('SimpleBarChart'), 'Alerts by application', 8, 5, 4, 7, { query: 'getApplications', groupBy: 'name', metric: 'sum', valueField: 'alerts', props: { horizontal: true } }));
  // Four analytic cards
  s.add(cc0('DonutChart'), 'Incidents by priority', 0, 5, 3, 8, { query: 'getStories', groupBy: 'priority', where: OPEN_INC });
  s.add(cc0('SimpleBarChart'), 'Critical alert categories', 3, 5, 3, 8, { groupBy: 'type', where: where('severityLabel', 'Critical'), limit: 6, props: { horizontal: true } });
  s.add(cc0('SimpleBarChart'), 'Major alert categories', 6, 5, 3, 8, { groupBy: 'type', where: where('severityLabel', 'Major'), limit: 6, props: { horizontal: true } });
  s.add(cc0('DonutChart'), 'Alert ingestion sources', 9, 5, 3, 8, { groupBy: 'sender', limit: 6 });
  // Incidents (left) beside the intelligence panel (right)
  const sp = s.add('carbon:SplitPane', 'Incidents and intelligence', 0, 13, 12, 17, { props: { direction: 'horizontal', first: 'widgets', second: 'widgets', size: 62 }, listens: false });
  const isearch = s.add('carbon:Search', 'Search incidents', 0, 0, 12, 2, { props: { labelText: 'Search incidents', placeholder: 'Search incident titles' }, bind: { field: 'title', op: 'contains', query: 'getStories' }, listens: false, chromeless: true }, `${sp.id}#0`);
  const inc = s.add('table', 'Active incidents', 0, 2, 12, 15, { query: 'getStories', where: OPEN_INC, columns: ['priority', 'title', 'state', 'team', 'owner', 'alertCount', 'runbooks', 'created'], sortBy: 'priority', limit: 50, drill: { mode: 'details' } }, `${sp.id}#0`);
  isearch.config.sendTo = [inc.id];
  const intel = s.add('carbon:Tabs', 'Operational intelligence', 0, 0, 12, 17, { props: { items: ['Top resources :: widgets', 'Services health :: widgets', 'Critical stream :: widgets', 'Patterns :: widgets', 'Metrics :: widgets', 'Incident insights :: widgets'] }, listens: false }, `${sp.id}#1`);
  const t = (i: number) => `${intel.id}#${i}`;
  s.add(cc0('SimpleBarChart'), 'Most affected resources', 0, 0, 12, 14, { groupBy: 'resource', limit: 10, props: { horizontal: true } }, t(0));
  s.add(cc0('StackedBarChart'), 'Severity by team', 0, 0, 7, 14, { groupBy: 'team', seriesBy: 'severityLabel' }, t(1));
  s.add(cc0('HeatmapChart'), 'Team and severity', 7, 0, 5, 14, { groupBy: 'team', seriesBy: 'severityLabel' }, t(1));
  s.add('table', 'Critical alerts', 0, 0, 12, 14, { columns: ['resource', 'summary', 'firstOccurrence'], where: where('severityLabel', 'Critical'), sortBy: 'firstOccurrence', sortDesc: true, limit: 30, drill: { mode: 'details' } }, t(2));
  fig(s, 'Alerts with no incident', 'Not in an incident', 0, 0, 4, { where: where('inIncident', 'No'), ...GREEN }, t(3));
  fig(s, 'Anomalies', 'Metric anomaly', 4, 0, 4, { where: where('anomaly', 'Yes') }, t(3));
  fig(s, 'Seasonal', 'Repeating pattern', 8, 0, 4, { where: where('seasonal', 'Yes') }, t(3));
  s.add(cc0('SimpleBarChart'), 'Golden signals', 0, 3, 5, 11, { groupBy: 'goldenSignal', where: where('goldenSignal', 'None', '!=') }, t(3));
  s.add(cc0('SimpleBarChart'), 'Alerts that keep recurring', 5, 3, 7, 11, { groupBy: 'summary', where: where('recurrence', '2', '>='), limit: 8, props: { horizontal: true } }, t(3));
  s.add(cc0('LineChart'), 'Node CPU: actual and forecast', 0, 0, 12, 14, { query: 'getMetricSeries', filter: 'kubernetesNode|required_cpu_percentage|', seriesBy: 'kind', metric: 'avg', valueField: 'value', props: { bins: 48, legend: 'bottom' } }, t(4));
  s.add(cc0('IncidentInsights'), 'Incident insights', 0, 0, 12, 14, { query: 'getStories', where: OPEN_INC }, t(5));
  // Alert stream: severity tabs, then trend, inside an accordion
  const acc = s.add('carbon:Accordion', 'Alerts', 0, 30, 12, 32, { props: { items: ['Recent alerts stream :: widgets', 'Trend and breakdown :: widgets'], startOpen: true }, listens: false });
  const a = (i: number) => `${acc.id}#${i}`;
  const stream = s.add('carbon:Tabs', 'Alert stream', 0, 0, 12, 18, { props: { items: ['All :: widgets', 'Critical :: widgets', 'Major :: widgets', 'Minor and below :: widgets'] }, listens: false }, a(0));
  const st = (i: number) => `${stream.id}#${i}`;
  const cols = ['severityLabel', 'resource', 'summary', 'inIncident', 'eventCount', 'recurrence', 'runbookName', 'runbookAutomated', 'firstOccurrence'];
  const asearch = s.add('carbon:Search', 'Search alerts', 0, 0, 12, 2, { props: { labelText: 'Search alerts', placeholder: 'Summary, resource, source' }, bind: { field: 'summary', op: 'contains', query: 'getAlerts' }, listens: false, chromeless: true }, st(0));
  const all = s.add('table', 'All alerts', 0, 2, 12, 14, { columns: cols, sortBy: 'severity', sortDesc: true, limit: 200, drill: { mode: 'details' } }, st(0));
  asearch.config.sendTo = [all.id];
  s.add('table', 'Critical alerts', 0, 0, 12, 16, { columns: cols, where: where('severityLabel', 'Critical'), limit: 200, drill: { mode: 'details' } }, st(1));
  s.add('table', 'Major alerts', 0, 0, 12, 16, { columns: cols, where: where('severityLabel', 'Major'), limit: 200, drill: { mode: 'details' } }, st(2));
  s.add('table', 'Minor and below', 0, 0, 12, 16, { columns: cols, where: where('severity', '5', '<'), sortBy: 'severity', sortDesc: true, limit: 200, drill: { mode: 'details' } }, st(3));
  s.add(cc0('StackedAreaChart'), 'Alert volume by severity', 0, 0, 8, 9, { seriesBy: 'severityLabel', props: { bins: 24, legend: 'bottom' } }, a(1));
  s.add(cc0('DonutChart'), 'Severity mix', 8, 0, 4, 9, { groupBy: 'severityLabel' }, a(1));
  s.list.forEach(w => { if (!w.parent && w.y >= 5 && !appRow.includes(w)) w.y += 7; });
  return s.list;
};

/** Business applications as Concert Operate tracks them: alerts by severity, open incidents, criticality. */
const appHealth = (): Widget[] => {
  const s = new Sheet();
  const q = { query: 'getApplications' as const };
  head(s, 'Application health', 'The business applications and services Concert Operate tracks, with their alerts, open incidents and business criticality.');
  fig(s, 'Applications', 'Tracked by Concert', 0, 2, 3, { ...q, ...NAVY });
  fig(s, 'Critical alerts', 'Across all applications', 3, 2, 3, { ...q, metric: 'sum', valueField: 'critical', ...RED });
  fig(s, 'Major alerts', 'Across all applications', 6, 2, 3, { ...q, metric: 'sum', valueField: 'major', ...ORANGE });
  fig(s, 'Open incidents', 'Across all applications', 9, 2, 3, { ...q, metric: 'sum', valueField: 'incidents', ...PURPLE });
  s.add(cc0('ApplicationCards'), 'Applications', 0, 5, 12, 6, { ...q });
  s.add(cc0('DonutChart'), 'Applications by worst severity', 0, 11, 4, 8, { ...q, groupBy: 'severityLabel' });
  s.add(cc0('SimpleBarChart'), 'Alerts by application', 4, 11, 4, 8, { ...q, groupBy: 'name', metric: 'sum', valueField: 'alerts', props: { horizontal: true } });
  s.add(cc0('SimpleBarChart'), 'Open incidents by application', 8, 11, 4, 8, { ...q, groupBy: 'name', metric: 'sum', valueField: 'incidents', props: { horizontal: true } });
  s.add('table', 'Applications', 0, 19, 8, 10, { ...q, columns: ['name', 'type', 'severityLabel', 'alerts', 'critical', 'major', 'minor', 'incidents', 'priority', 'criticality'], sortBy: 'criticalityValue', sortDesc: true, limit: 100 });
  s.add(cc0('DonutChart'), 'By business criticality', 8, 19, 4, 10, { ...q, groupBy: 'criticality' });
  return s.list;
};

/** Metrics and their forecast: pick a group, metric and resource in each chart's settings. */
const metricsBoard = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Metrics explorer', 'Six hours of a metric and what is forecast. Choose the group, metric and resource in each chart’s settings.');
  const line = (title: string, spec: string, x: number, y: number) => s.add(cc0('LineChart'), title, x, y, 6, 9, { query: 'getMetricSeries', filter: spec, seriesBy: 'kind', metric: 'avg', valueField: 'value', props: { bins: 48, legend: 'bottom' } });
  line('Node CPU (percent of request)', 'kubernetesNode|required_cpu_percentage|', 0, 2);
  line('Node memory (percent of request)', 'kubernetesNode|required_mem_percentage|', 6, 2);
  line('Node CPU requested', 'kubernetesNode|required_cpu|', 0, 11);
  line('Node CPU: expected range', 'kubernetesNode|required_cpu_percentage|', 6, 11);
  s.add('table', 'Anomalous points', 0, 20, 12, 7, { query: 'getMetricSeries', filter: 'kubernetesNode|required_cpu_percentage|', where: where('anomalous', 'Yes'), columns: ['time', 'resource', 'metric', 'value', 'expected', 'min', 'max'], limit: 50 });
  return s.list;
};

/** What Concert knows about each alert: incident link, anomaly, seasonality, golden signal, topology, runbooks. */
const insightsBoard = (): Widget[] => {
  const s = new Sheet();
  head(s, 'Alert insights', 'Which alerts belong to an incident, which are anomalies or repeats, and which have a runbook, automated or not.');
  s.add(cc0('PeoplePicker'), 'Owner', 0, 2, 3, 2, { groupBy: 'owner', chromeless: true, props: { titleText: 'Owner', placeholder: 'Anyone', size: 'md' } });
  s.add(cc0('PeoplePicker'), 'Team', 3, 2, 3, 2, { groupBy: 'team', chromeless: true, props: { titleText: 'Team', placeholder: 'Any team', size: 'md' } });
  fig(s, 'Alerts with no incident', 'Not in an incident', 0, 4, 3, { where: where('inIncident', 'No'), ...GREEN });
  fig(s, 'Anomalies', 'Metric anomaly', 3, 4, 3, { where: where('anomaly', 'Yes') });
  fig(s, 'Seasonal', 'Repeating pattern', 6, 4, 3, { where: where('seasonal', 'Yes') });
  fig(s, 'Automated runbooks', 'Can run by themselves', 9, 4, 3, { where: where('runbookAutomated', 'Automated'), ...NAVY });
  s.add(cc0('DonutChart'), 'Runbook coverage', 0, 7, 4, 8, { groupBy: 'runbookAutomated' });
  s.add(cc0('SimpleBarChart'), 'Runbooks used', 4, 7, 4, 8, { groupBy: 'runbookName', where: where('runbookName', '(none)', '!='), limit: 8, props: { horizontal: true } });
  s.add(cc0('SimpleBarChart'), 'Golden signals', 8, 7, 4, 8, { groupBy: 'goldenSignal', where: where('goldenSignal', 'None', '!=') });
  s.add(cc0('SimpleBarChart'), 'Entity types', 0, 15, 4, 8, { groupBy: 'entityType', limit: 8, props: { horizontal: true } });
  s.add(cc0('SimpleBarChart'), 'Alerts that keep recurring', 4, 15, 4, 8, { groupBy: 'summary', where: where('recurrence', '2', '>='), limit: 8, props: { horizontal: true } });
  s.add(cc0('DonutChart'), 'In an incident', 8, 15, 4, 8, { groupBy: 'inIncident' });
  s.add('table', 'Alerts worth a look: anomalies and repeats', 0, 23, 12, 9, { where: where('anomaly', 'Yes'), columns: ['severityLabel', 'resource', 'summary', 'goldenSignal', 'entityType', 'recurrence', 'runbookName', 'firstOccurrence'], sortBy: 'severity', sortDesc: true, limit: 100, drill: { mode: 'details' } });
  s.add(cc0('RunbookActivity'), 'Runbook activity', 0, 32, 6, 13, {});
  s.add(cc0('IncidentInsights'), 'Incident insights', 6, 32, 6, 13, { query: 'getStories', where: OPEN_INC });
  return s.list;
};

/** Adds widgets below a finished layout. */
const plus = (build: () => Widget[], more: (s: Sheet, y: number) => void) => (): Widget[] => {
  const list = build();
  const bottom = list.filter(w => !w.parent).reduce((m, w) => Math.max(m, w.y + w.h), 0);
  const s = new Sheet();
  more(s, bottom);
  return [...list, ...s.list];
};
const appCards = (s: Sheet, y: number) => s.add(cc0('ApplicationCards'), 'Applications', 0, y, 12, 6, { query: 'getApplications' });
const incInsights = (s: Sheet, y: number) => s.add(cc0('IncidentInsights'), 'Incident insights', 0, y, 12, 13, { query: 'getStories', where: OPEN_INC });

/** The title band is about 100px tall whatever the row height: taller in rows on compact dashboards, so the text is not clipped. */
const fitBand = (list: Widget[], rowH?: number): Widget[] => {
  const row = rowH || 48, h = Math.max(2, Math.ceil(106 / (row + 6)));
  const band = list.find(w => !w.parent && w.type === 'text' && w.y === 0 && w.h === 2 && w.config.bg === '#161616' && w.config.chromeless);
  if (!band || h === 2) return list;
  list.forEach(w => { if (!w.parent) w.y += h - 2; });
  band.y = 0; band.h = h;
  return list;
};

export const TEMPLATES: Template[] = [
  { id: 'incidentops', rowH: 28, bar: bar(A('severityLabel', 'team', 'type', 'sender'), { refresh: 60 }), name: 'Incident command center', advanced: true, tagline: 'The incident-alert-dashboard, built from components',
    detail: 'KPI tiles, four analytic cards, incidents beside a tabbed intelligence panel (split pane + tabs), and the alert stream in severity tabs inside an accordion. Every chart filters the rest; search boxes narrow their own tables.', build: incidentOps },
  { id: 'apphealth', rowH: 28, bar: bar(A('severityLabel', 'team')), name: 'Application health', tagline: 'Business applications from Concert',
    detail: 'The applications and services Concert Operate tracks: alerts by severity, open incidents, top priority and business criticality.', build: appHealth },
  { id: 'metrics', rowH: 28, name: 'Metrics explorer', tagline: 'Metrics and their forecast',
    detail: 'Six hours of node CPU and memory, with the forecast. Choose a different group, metric or resource in each chart\u2019s settings.', build: metricsBoard },
  { id: 'insights', rowH: 28, bar: bar(A('severityLabel', 'team', 'type')), name: 'Alert insights', tagline: 'Incident link, anomalies, runbooks',
    detail: 'Which alerts belong to an incident, which are anomalies or repeats, golden signals, topology entity types, and runbook coverage.', build: insightsBoard },
  { id: 'operations', rowH: 28, bar: bar(A('severityLabel', 'state', 'sender', 'team')), name: 'Operations overview', tagline: 'Alerts at a glance',
    detail: 'Counts, severity and state charts, a timeline, and a table whose rows open a details panel. Click a bar to filter the rest.', build: plus(operations, appCards) },
  { id: 'triage', rowH: 28, bar: bar(A('severityLabel', 'team', 'type', 'state')), name: 'Alert triage', tagline: 'Search, filter, work the list',
    detail: 'A toolbar with a search box and two dropdowns wired to charts and a table sorted by severity.', build: triage },
  { id: 'executive', rowH: 28, bar: bar(A('severityLabel', 'team')), name: 'Executive summary', tagline: 'Big numbers, one headline',
    detail: 'Four colourful headline figures, an editable headline, the severity mix and the incidents that matter.', build: plus(executive, appCards) },
  { id: 'incidents', rowH: 28, bar: bar(S('priority', 'state', 'team')), name: 'Incident review', tagline: 'Priority, team and state',
    detail: 'Everything about incidents (stories): totals, priority, team, state, a timeline and the list.', build: plus(incidents, incInsights) },
  { id: 'telco', rowH: 28, bar: bar(A('severityLabel', 'type', 'sender')), name: 'Telco network', tagline: 'Mesh and command views in tabs',
    detail: 'Your causal mesh and command center dashboards in tabs, with alert figures above and an alerts tab.', build: telco, needs: ['telco-causal-gen2'] },
  { id: 'workspace', rowH: 28, bar: bar(A('severityLabel', 'team')), name: 'Investigation workspace', tagline: 'Split screen: list left, charts right',
    detail: 'A resizable split pane: search and table on the left, charts on the right, all following each other.', build: workspace },
  { id: 'noc', rowH: 28, bar: bar(A('severityLabel', 'team', 'type', 'sender')), name: 'NOC command center', advanced: true, tagline: 'Split pane + tabs + accordion + filter bar',
    detail: 'A filter toolbar over a split pane: tabs (overview, alerts, timeline) on the left, an accordion of breakdowns on the right. Three levels of nesting.', build: noc },
  { id: 'service', rowH: 28, bar: bar(A('severityLabel', 'team')), name: 'Service review', advanced: true, tagline: 'Tabs holding split panes and accordions',
    detail: 'Summary, incidents, alerts and notes in tabs. The summary tab has a split pane with an accordion inside it.', build: service },
  { id: 'workbench', rowH: 28, bar: bar(A('team', 'type', 'state')), name: 'Triage workbench', advanced: true, tagline: 'Vertical split: charts above, queues below',
    detail: 'A vertical split pane: charts on top, and tabs below with a work queue each for Critical, Major and everything else.', build: workbench },
  { id: 'wall', rowH: 40, bar: bar([], { refresh: 60 }), name: 'Wall display', advanced: true, tagline: 'Carousel that rotates by itself',
    detail: 'A carousel that advances every 12 seconds through figures, hot spots, incidents and a timeline. For a screen on the wall.', build: wall },
  { id: 'report', rowH: 28, bar: bar(A('team', 'type', 'state')), name: 'Team report', advanced: true, tagline: 'Accordion report with headline figures',
    detail: 'Headline figures above an accordion of sections: critical alerts, major alerts, incidents by team, alerts by source.', build: plus(teamReport, (s2, y) => { s2.add(cc0('RunbookActivity'), 'Runbook activity', 0, y, 12, 10, {}); }) },
  { id: 'hub', rowH: 28, bar: bar(A('severityLabel', 'team')), name: 'Operations hub', advanced: true, tagline: 'Tabs with an accordion or split pane in each tab',
    detail: 'Two levels of containment: tabs on the outside; inside, an accordion of health sections, a split pane for investigation, an accordion of report sections.', build: hub },
  { id: 'insight', rowH: 28, bar: bar(A('severityLabel', 'team', 'type')), name: 'Insight board', tagline: 'Carbon charts, status indicators and quick filters',
    detail: 'Status shape and icon, count badge, a team popover and a combo button of quick filters, over a gauge, stacked bars, donut, area chart, heatmap, flow chart and treemap. Click anything and every chart follows.', build: headed('Insight board', 'Status at the top, then the shape of the problem in six different charts. Everything is clickable and everything follows.', insight) },
  { id: 'gallery1', rowH: 28, bar: bar(A('severityLabel', 'team', 'type')), name: 'Chart gallery: compare', tagline: 'Eight Carbon charts for comparing categories',
    detail: 'Bar, grouped bar, stacked bar, lollipop, pie, donut, treemap and word cloud on live alerts. Click any one and the rest follow.', build: headed('Chart gallery: compare', 'Eight ways to compare categories on live alerts. Click any one and the rest follow.', galleryCompare) },
  { id: 'gallery2', rowH: 28, bar: bar(A('severityLabel', 'team', 'type')), name: 'Chart gallery: patterns', tagline: 'Time, relationships and thresholds',
    detail: 'Line, area, stacked area, scatter, heatmap, radar, flow, gauge and meter on live alerts, with the time range and filter bar driving all of them.', build: headed('Chart gallery: patterns', 'Change over time, relationships and thresholds. The time range and filter bar drive every chart.', galleryPatterns) },
  { id: 'status', rowH: 28, bar: bar(A('severityLabel', 'team')), name: 'Status board', tagline: 'Tags, banners, indicators, progress and badge',
    detail: 'Live counts as Carbon tags, banners that appear only when a number crosses a line, status shapes and icons that change colour, progress bars against targets, a count badge, a team popover and quick filters.', build: headed('Status board', 'Live counts as tags, banners that appear only when a number crosses a line, indicators and targets.', statusBoard) },
  { id: 'control', rowH: 28, bar: bar(A('severityLabel', 'team', 'type')), name: 'Control room', tagline: 'Carbon inputs driving charts and a table',
    detail: 'A dropdown, multi-select, radio buttons, combo box, search box and slider, wired to figures, a stacked bar, a donut and a data table.', build: headed('Control room', 'Inputs on the left drive the figures, charts and table on the right.', controlRoom) },
  { id: 'actions', rowH: 28, bar: bar(A('severityLabel', 'team')), name: 'Interactive controls', tagline: 'Buttons, a toggle and a chart that make other widgets react',
    detail: 'Action wiring in use: a toggle shows a hidden table, buttons pick a severity on the chart, a button adds 10% to a progress bar each press, and picking a bar rewrites a text widget. Open Wire mode, choose Actions, and see (or change) every wire.', build: headed('Interactive controls', 'Wires between widgets: a toggle shows the table, buttons pick a severity, a chart click updates the text.', actionsDemo) },
  { id: 'incdesk', rowH: 28, bar: bar(S('team', 'state'), { }), name: 'Incident desk', tagline: 'The same components on incidents',
    detail: 'Priority tags, a banner for priority 1, charts by team, priority and time, a structured list queue and a data table, all on live incidents.', build: plus(headed('Incident desk', 'The same components on incidents: priorities, teams, trend and the queue.', incidentDesk), incInsights) },
  { id: 'scorecard', rowH: 28, bar: bar(A('team', 'type')), name: 'Severity scorecard', tagline: 'Gauge, meter and status per severity',
    detail: 'For each of Critical, Major, Minor and Warning: a status shape, a gauge and a meter with warning and critical thresholds, then a flow chart and heatmap.', build: headed('Severity scorecard', 'Each severity against its own warning and critical thresholds.', scorecard) }
];
TEMPLATES.forEach(t => { const b = t.build; t.build = () => fitBand(b(), t.rowH); });

/** The templates that can be built with this toolkit. */
TEMPLATES.forEach(t => { t.build = stably(t.id, t.build); });

export const availableTemplates = (): Template[] => TEMPLATES.filter(t => !t.needs || t.needs.every(id => Boolean(tileDef(`tile:${id}`))));
