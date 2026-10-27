/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * What each Carbon component widget is called and which settings it has. Plain data, no React: the Designer draws
 * the widgets from it (carbon-catalog.tsx) and Concert Workbench's Layout Editor reads the same file to build its
 * palette and settings form, so the two cannot drift apart.
 */

export type Kind = 'text' | 'area' | 'bool' | 'enum' | 'number' | 'lines';
export interface PropSpec { key: string; label: string; kind: Kind; def?: unknown; options?: string[]; help?: string }

/** When the widget reads rows: always, or only for some settings. */
export type DataRule = 'always' | 'showValue' | 'source=live' | 'source=field' | 'notice' | 'notFixed' | 'filterItems';

export interface CarbonSpec {
  name: string;
  label: string;
  group: string;
  description: string;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  props: PropSpec[];
  /** Which data controls to show: rows (columns), measure (metric + field), values (the field whose values are listed). */
  uses?: 'rows' | 'measure' | 'values' | 'chart';
  /** Charts and breakdowns: which of the data controls apply (what the bars / slices are grouped by, a second split, a time field). */
  chart?: { group?: boolean; series?: boolean; time?: boolean };
  /** Clicking something in it sets a filter other widgets follow (see Wiring). */
  emits?: boolean;
  data?: DataRule;
  /** The data source a new widget starts on (alerts when not set). */
  query?: 'getAlerts' | 'getStories' | 'getApplications' | 'getMetricSeries';
}

export function dataOn(rule: DataRule | undefined, p: Record<string, any>): boolean {
  switch (rule) {
    case 'always': return true;
    case 'showValue': return !!p.showValue;
    case 'source=live': return p.source === 'live';
    case 'source=field': return p.source === 'field';
    case 'notice': return (!!p.when && p.when !== 'always') || !!p.showValue;
    case 'notFixed': return !!p.source && p.source !== 'fixed';
    case 'filterItems': return String(Array.isArray(p.items) ? p.items.join('\n') : p.items || '').includes('filter:');
    default: return false;
  }
}

export const GROUPS = ['Content', 'Navigation', 'Data', 'Charts', 'Status', 'Actions', 'Inputs'];

const P = (key: string, label: string, kind: Kind, def?: unknown, extra?: Partial<PropSpec>): PropSpec => ({ key, label, kind, def, ...extra });
const SIZES = ['sm', 'md', 'lg'];
const SOURCE = P('source', 'Items come from', 'enum', 'list', { options: ['list', 'field'], help: '“list” uses the lines below; “field” lists the values of a field of the live data (set it under Data) and sets a filter other widgets follow.' });
const ITEMS = P('items', 'Items (one per line)', 'lines', ['First', 'Second', 'Third']);
const NOTICE_PROPS: PropSpec[] = [
  P('kind', 'Kind', 'enum', 'info', { options: ['info', 'info-square', 'success', 'warning', 'warning-alt', 'error'] }),
  P('title', 'Title', 'text', 'Heads up'), P('subtitle', 'Text', 'text', 'Something worth knowing.'),
  P('lowContrast', 'Low contrast', 'bool', false), P('hideClose', 'Hide the close button', 'bool', true),
  P('when', 'Show', 'enum', 'always', { options: ['always', 'above', 'below', 'equals'], help: 'Anything but “always” shows it only when the measure under Data compares to the number below.' }),
  P('threshold', 'Number to compare with', 'number', 0), P('showValue', 'Append the measure to the text', 'bool', false)
];


const THRESH: PropSpec[] = [
  P('warnAt', 'Warning at', 'number', 10, { help: 'The value at which it turns to warning. Thresholds read the measure under Data.' }),
  P('critAt', 'Critical at', 'number', 25),
  P('direction', 'Worse when the value is', 'enum', 'higher', { options: ['higher', 'lower'] })
];
/** Gauge and meter thresholds: none until someone sets them (the dial is neutral blue until then). */
const THRESH_OPT: PropSpec[] = [
  P('warnAt', 'Warning at', 'number', undefined, { help: 'Leave empty for no thresholds. Once set, the warning and critical colours win over a severity colour.' }),
  P('critAt', 'Critical at', 'number', undefined),
  P('direction', 'Worse when the value is', 'enum', 'higher', { options: ['higher', 'lower'] })
];
const BANDS = P('bands', 'Colour bands', 'enum', 'auto', { options: ['auto', 'none'], help: '“auto”: when a chart such as a pie sends its selections to this gauge, the dial is split into that chart’s groups, in its colours.' });
const SHAPE_KINDS = ['failed', 'critical', 'high', 'medium', 'low', 'cautious', 'undefined', 'stable', 'informative', 'incomplete', 'draft'];
const ICON_KINDS = ['failed', 'caution-major', 'caution-minor', 'undefined', 'succeeded', 'normal', 'in-progress', 'incomplete', 'not-started', 'pending', 'unknown', 'informative'];
const IND_SRC = (extra: string) => P('source', 'Status comes from', 'enum', 'live', { options: ['fixed', 'live', 'severity'], help: `“fixed” always shows the kind below. “live” turns warning / critical when the measure under Data crosses the thresholds. “severity” shows the worst ${extra} among the rows.` });
const LABEL = P('label', 'Label ({value} = the figure, {count} = rows)', 'text', '{value} open');
const STATUS_SPECS: CarbonSpec[] = [
  { name: 'ShapeIndicator', label: 'Status shape', group: 'Status', description: 'Carbon status shape and label. Fixed, or turns warning / critical from live data or the worst severity.', w: 3, h: 2, minW: 1, minH: 1, uses: 'measure', data: 'notFixed',
    props: [IND_SRC('severity (alerts) or priority (incidents)'), P('kind', 'Kind (fixed)', 'enum', 'stable', { options: SHAPE_KINDS }), LABEL, P('textSize', 'Text size', 'enum', '12', { options: ['12', '14'] }), P('compact', 'Shape only (label on hover)', 'bool', false), ...THRESH] },
  { name: 'IconIndicator', label: 'Status icon', group: 'Status', description: 'Carbon status icon and label. Fixed, or turns warning / critical from live data or the worst severity.', w: 3, h: 2, minW: 1, minH: 1, uses: 'measure', data: 'notFixed',
    props: [IND_SRC('severity (alerts) or priority (incidents)'), P('kind', 'Kind (fixed)', 'enum', 'succeeded', { options: ICON_KINDS }), LABEL, P('size', 'Size', 'enum', '16', { options: ['16', '20'] }), P('compact', 'Icon only (label on hover)', 'bool', false), ...THRESH] },
  { name: 'BadgeIndicator', label: 'Count badge', group: 'Status', description: 'A small count or dot. Shows the live number of rows (or a measure); can hide itself at zero.', w: 3, h: 2, minW: 1, minH: 1, uses: 'measure', data: 'notFixed',
    props: [P('label', 'Label', 'text', 'Open alerts'), P('source', 'Count comes from', 'enum', 'live', { options: ['fixed', 'live'], help: '“live” uses the measure under Data.' }), P('count', 'Count (fixed)', 'number', 3), P('display', 'Show', 'enum', 'count', { options: ['count', 'dot'], help: '“dot” shows a plain dot whenever the figure is above zero.' }), P('hideZero', 'Hide the badge at zero', 'bool', true)] },
  { name: 'Popover', label: 'Popover', group: 'Status', description: 'A button that opens a panel: a note, or a live breakdown whose entries set a filter other widgets follow.', w: 3, h: 2, minW: 2, minH: 1, uses: 'chart', chart: { group: true }, emits: true, data: 'always',
    props: [P('text', 'Button text', 'text', 'Breakdown'), P('showCount', 'Append the row count to the button', 'bool', true), P('content', 'Text shown above the breakdown', 'area', 'Where these come from'), P('breakdown', 'List the groups (Data > Group by) with counts', 'bool', true), P('align', 'Opens', 'enum', 'bottom', { options: ['bottom', 'top', 'left', 'right', 'bottom-start', 'bottom-end', 'top-start', 'top-end'] }), P('limit', 'Groups listed', 'number', 8)] },
  { name: 'ComboButton', label: 'Combo button', group: 'Actions', description: 'A button with a menu. Lines can open an address or set a filter other widgets follow.', w: 4, h: 2, minW: 2, minH: 1, data: 'filterItems',
    props: [P('items', 'Actions (first one is the button; Label :: target)', 'lines', ['Critical only :: filter:severityLabel=Critical', 'Open alerts only :: filter:state=open', 'Clear my filters :: clear', 'Documentation :: https://www.ibm.com/docs'], { help: 'Target is an address (opens in a new tab), filter:field=value (sets a filter on the widgets wired to this button), or clear (removes the filters this button set).' }), P('size', 'Size', 'enum', 'md', { options: ['sm', 'md', 'lg'] })] }
];

const CHART_LEGEND = P('legend', 'Legend', 'enum', 'bottom', { options: ['bottom', 'top', 'right', 'left', 'none'] });
const CHART_TITLE = P('title', 'Chart title (blank = none)', 'text', '');
const CH = (name: string, label: string, description: string, chart: CarbonSpec['chart'], props: PropSpec[], extra: Partial<CarbonSpec> = {}): CarbonSpec =>
  ({ name, label, group: 'Charts', description, w: 6, h: 7, minW: 3, minH: 4, uses: 'chart', chart, emits: true, data: 'always', props: [CHART_TITLE, CHART_LEGEND, ...props], ...extra });
const BINS = P('bins', 'Time slots', 'number', 24);
const CURVE = P('curve', 'Line style', 'enum', 'smooth', { options: ['smooth', 'straight', 'step'] });
const CHART_SPECS: CarbonSpec[] = [
  CH('SimpleBarChart', 'Simple bar chart', 'One bar per group (Data > Group by) with the measure. Click a bar to filter other widgets.', { group: true }, [P('horizontal', 'Horizontal bars', 'bool', false)]),
  CH('GroupedBarChart', 'Grouped bar chart', 'Bars side by side: Group by on one axis, Series by splitting each group.', { group: true, series: true }, [P('horizontal', 'Horizontal bars', 'bool', false)]),
  CH('StackedBarChart', 'Stacked bar chart', 'Bars stacked: Group by on one axis, Series by splitting each bar.', { group: true, series: true }, [P('horizontal', 'Horizontal bars', 'bool', false), P('percent', 'Show as 100%', 'bool', false)]),
  CH('LollipopChart', 'Lollipop chart', 'Like a bar chart, drawn as dots on stems. Good for ranked lists.', { group: true }, []),
  CH('LineChart', 'Line chart', 'The measure over time (Data > Time field), one line per Series by value.', { time: true, series: true }, [BINS, CURVE]),
  CH('AreaChart', 'Area chart', 'The measure over time, filled in.', { time: true, series: true }, [BINS, CURVE]),
  CH('StackedAreaChart', 'Stacked area chart', 'The measure over time, one band per Series by value, stacked.', { time: true, series: true }, [BINS, CURVE]),
  CH('ScatterChart', 'Scatter chart', 'One dot per row: time across, a number (Data > Field) up.', { time: true, series: true }, [P('maxPoints', 'Most dots', 'number', 400)]),
  CH('PieChart', 'Pie chart', 'Share per group. Click a slice to filter other widgets.', { group: true }, []),
  CH('DonutChart', 'Donut chart', 'Share per group with the total in the middle.', { group: true }, []),
  CH('GaugeChart', 'Gauge', 'A dial for one figure against a maximum. Changes colour at the warning and critical values.', undefined, [P('max', 'Maximum', 'number', undefined, { help: 'Leave empty to measure a count against every row before click filters (for example 116 of 364), anything else against 100.' }), P('type', 'Shape', 'enum', 'semi', { options: ['semi', 'full'] }), P('unit', 'Unit shown after the figure', 'text', ''), ...THRESH_OPT, BANDS],
    { uses: 'measure', emits: false, w: 4, h: 7, minW: 3, minH: 4 }),
  CH('MeterChart', 'Meter', 'A horizontal bar for one figure against a maximum, with coloured ranges.', undefined, [P('label', 'Label', 'text', 'Utilisation'), P('max', 'Maximum', 'number', undefined, { help: 'Leave empty to measure a count against every row before click filters (for example 116 of 364), anything else against 100.' }), ...THRESH_OPT, BANDS],
    { uses: 'measure', emits: false, w: 6, h: 3, minW: 3, minH: 2 }),
  CH('HeatmapChart', 'Heatmap', 'A grid: Group by across, Series by down, colour = the measure. Click a cell to filter by both.', { group: true, series: true }, [], { w: 8, h: 8 }),
  CH('TreemapChart', 'Treemap', 'Rectangles sized by the measure for each group. Click one to filter.', { group: true }, [], { w: 8, h: 8 }),
  CH('RadarChart', 'Radar chart', 'Group by around the edge, one shape per Series by value.', { group: true, series: true }, [], { w: 6, h: 8 }),
  CH('WordCloudChart', 'Word cloud', 'Group values as words sized by the measure. Click a word to filter.', { group: true }, [P('limit', 'Words', 'number', 30)], { w: 6, h: 7 }),
  CH('AlluvialChart', 'Flow chart (alluvial)', 'How rows flow from one field (Group by) to another (Series by). Click a node to filter.', { group: true, series: true }, [], { w: 10, h: 9, minW: 5, minH: 6 })
];

export const SPECS: CarbonSpec[] = [
  { name: 'Heading', label: 'Heading', group: 'Content', description: 'A heading at the right level.', w: 4, h: 2, minW: 1, minH: 1,
    props: [P('text', 'Text', 'text', 'Heading'), P('level', 'Level', 'enum', '2', { options: ['1', '2', '3', '4', '5', '6'] })] },
  { name: 'Link', label: 'Link', group: 'Content', description: 'A text link.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('text', 'Text', 'text', 'Open the documentation'), P('href', 'Address', 'text', 'https://www.ibm.com/docs'), P('inline', 'Inline', 'bool', false), P('size', 'Size', 'enum', 'md', { options: SIZES })] },
  { name: 'UnorderedList', label: 'Bulleted list', group: 'Content', description: 'A bulleted list.', w: 4, h: 4,
    props: [ITEMS, P('expressive', 'Expressive', 'bool', false)] },
  { name: 'OrderedList', label: 'Numbered list', group: 'Content', description: 'A numbered list.', w: 4, h: 4,
    props: [ITEMS, P('expressive', 'Expressive', 'bool', false)] },
  { name: 'CodeSnippet', label: 'Code snippet', group: 'Content', description: 'Code or a command with a copy button.', w: 6, h: 3,
    props: [P('text', 'Code', 'area', 'kubectl get pods -n cp4aiops'), P('type', 'Style', 'enum', 'multi', { options: ['single', 'multi', 'inline'] })] },
  { name: 'Tile', label: 'Tile', group: 'Content', description: 'A plain card with a title and text.', w: 4, h: 4,
    props: [P('title', 'Title', 'text', 'Title'), P('body', 'Text', 'area', 'Text goes here.')] },
  { name: 'ClickableTile', label: 'Clickable tile', group: 'Content', description: 'A card that opens a link.', w: 4, h: 3,
    props: [P('text', 'Text', 'text', 'Open the runbook'), P('href', 'Address', 'text', 'https://www.ibm.com/docs')] },
  { name: 'SelectableTile', label: 'Selectable tile', group: 'Content', description: 'A card that can be ticked.', w: 4, h: 3,
    props: [P('text', 'Text', 'text', 'Select me')] },
  { name: 'ExpandableTile', label: 'Expandable tile', group: 'Content', description: 'A card that opens to show more.', w: 4, h: 4,
    props: [P('above', 'Always shown', 'text', 'Summary'), P('below', 'Shown when open', 'area', 'More detail.')] },
  { name: 'TileGroup', label: 'Tile choice', group: 'Content', description: 'Choose one of several tiles.', w: 6, h: 4,
    props: [P('legend', 'Legend', 'text', 'Pick one'), ITEMS] },
  { name: 'ScrollPane', label: 'Scroll pane', group: 'Content', description: 'A panel that scrolls when what is inside is taller (or wider) than it. Holds any widgets.', w: 6, h: 8, minW: 2, minH: 3,
    props: [P('direction', 'Scrolls', 'enum', 'vertical', { options: ['vertical', 'horizontal', 'both'], help: 'Vertical: taller content scrolls up and down. Horizontal and both make the inside wider than the pane.' }), P('width', 'Inside width when scrolling sideways (% of the pane)', 'number', 200), P('content', 'Content', 'area', 'widgets')] },
  { name: 'Carousel', label: 'Carousel', group: 'Content', description: 'Slides with arrows and dots. Each slide holds widgets, text or a dashboard. Can advance by itself.', w: 12, h: 10, minW: 3, minH: 4,
    props: [P('items', 'Slides (Label :: text)', 'lines', ['Slide 1 :: widgets', 'Slide 2 :: widgets', 'Slide 3 :: widgets']), P('auto', 'Advance by itself every (seconds, 0 = off)', 'number', 0, { help: 'Only while viewing, never while editing.' }), P('dots', 'Show dots', 'bool', true), P('loop', 'Go round again after the last slide', 'bool', true)] },
  { name: 'Toolbar', label: 'Toolbar', group: 'Content', description: 'A slim strip for inputs: a search box, dropdowns, toggles. Wire them to the widgets below.', w: 12, h: 4, minW: 3, minH: 2,
    props: [P('label', 'Label (optional)', 'text', ''), P('content', 'Content', 'area', 'widgets')] },
  { name: 'SplitPane', label: 'Split pane (resizable)', group: 'Content', description: 'Two panels with a draggable divider. Each holds widgets, text or a dashboard.', w: 12, h: 10, minW: 3, minH: 3,
    props: [P('direction', 'Direction', 'enum', 'horizontal', { options: ['horizontal', 'vertical'], help: 'Horizontal puts the panels side by side.' }), P('first', 'First panel (text or tile:id#part)', 'area', 'widgets'), P('second', 'Second panel (text or tile:id#part)', 'area', 'widgets'), P('size', 'First panel size (%)', 'number', 60), P('min', 'Smallest panel (%)', 'number', 15)] },
  { name: 'Accordion', label: 'Accordion', group: 'Content', description: 'Sections that open and close. Each holds widgets, text or a dashboard.', w: 6, h: 6,
    props: [P('items', 'Sections (Title :: text)', 'lines', ['Overview :: widgets', 'Details :: widgets']), P('align', 'Arrow', 'enum', 'end', { options: ['start', 'end'] }), P('size', 'Size', 'enum', 'md', { options: SIZES }), P('flush', 'Flush', 'bool', false), P('single', 'One section open at a time', 'bool', false), P('startOpen', 'Start with every section open', 'bool', false)] },
  { name: 'Tabs', label: 'Tabs', group: 'Content', description: 'Tabs; each holds widgets, text or a dashboard.', w: 12, h: 10, minW: 3, minH: 3,
    props: [P('items', 'Tabs (Label :: text)', 'lines', ['Overview :: widgets', 'Details :: widgets']), P('contained', 'Contained', 'bool', false), P('size', 'Size', 'enum', 'md', { options: ['md', 'lg'] })] },
  { name: 'Breadcrumb', label: 'Breadcrumb', group: 'Navigation', description: 'A trail of links. Each line: Label :: address.', w: 6, h: 2, minW: 2, minH: 1,
    props: [P('items', 'Crumbs (Label :: address)', 'lines', ['Home :: #', 'Dashboards :: #', 'This one']), P('noTrailingSlash', 'No trailing slash', 'bool', false)] },
  { name: 'ContainedList', label: 'Contained list', group: 'Content', description: 'A boxed list with a heading.', w: 4, h: 6,
    props: [P('label', 'Heading', 'text', 'Items'), ITEMS, P('kind', 'Style', 'enum', 'on-page', { options: ['on-page', 'disclosed'] }), P('size', 'Size', 'enum', 'md', { options: SIZES })] },
  { name: 'TreeView', label: 'Tree', group: 'Content', description: 'A tree. Indent a line by two spaces to nest it.', w: 4, h: 8,
    props: [P('label', 'Label', 'text', 'Services'), P('items', 'Nodes (indent 2 spaces per level)', 'lines', ['Platform', '  ingress', '  openshift-node', 'Digital', '  payments', '  orders'])] },
  { name: 'DataTable', label: 'Data table', group: 'Data', description: 'Carbon data table of the rows: sorting, search, paging.', w: 8, h: 10, minW: 3, minH: 4, uses: 'rows', data: 'always',
    props: [P('size', 'Row height', 'enum', 'md', { options: ['xs', 'sm', 'md', 'lg', 'xl'] }), P('sortable', 'Sortable columns', 'bool', true), P('search', 'Search box', 'bool', true), P('zebra', 'Zebra stripes', 'bool', false), P('pagination', 'Paging', 'bool', true), P('pageSize', 'Rows per page', 'number', 10)] },
  { name: 'StructuredList', label: 'Structured list', group: 'Data', description: 'The rows as a Carbon structured list.', w: 6, h: 8, minW: 3, minH: 3, uses: 'rows', data: 'always',
    props: [P('condensed', 'Condensed', 'bool', false), P('flush', 'Flush', 'bool', false)] },
  { name: 'Tag', label: 'Tag', group: 'Status', description: 'A coloured label, optionally with a live figure.', w: 2, h: 2, minW: 1, minH: 1, uses: 'measure', data: 'showValue',
    props: [P('text', 'Text', 'text', 'Critical'), P('type', 'Colour', 'enum', 'auto', { help: '“auto” uses the severity or priority colour when this tag counts one severity or priority (set under Data).', options: ['auto', 'red', 'magenta', 'purple', 'blue', 'cyan', 'teal', 'green', 'gray', 'cool-gray', 'warm-gray', 'high-contrast', 'outline'] }), P('size', 'Size', 'enum', 'md', { options: SIZES }), P('showValue', 'Show the measure after the text', 'bool', false)] },
  { name: 'ProgressBar', label: 'Progress bar', group: 'Status', description: 'A bar toward a target, fixed or from live data.', w: 4, h: 2, minW: 2, minH: 1, uses: 'measure', data: 'source=live',
    props: [P('label', 'Label', 'text', 'Progress'), P('helperText', 'Helper text', 'text', ''), P('source', 'Value', 'enum', 'fixed', { options: ['fixed', 'live'], help: '“live” uses the measure under Data.' }), P('value', 'Value (fixed)', 'number', 40), P('max', 'Maximum', 'number', 100), P('status', 'Status', 'enum', 'active', { options: ['active', 'finished', 'error'] }), P('size', 'Size', 'enum', 'big', { options: ['small', 'big'] })] },
  { name: 'ProgressIndicator', label: 'Progress steps', group: 'Status', description: 'Steps with the current one marked.', w: 8, h: 3, minW: 3, minH: 2,
    props: [P('items', 'Steps', 'lines', ['Detect', 'Correlate', 'Resolve']), P('current', 'Current step (from 0)', 'number', 1), P('vertical', 'Vertical', 'bool', false), P('spaceEqually', 'Space equally', 'bool', true)] },
  { name: 'InlineNotification', label: 'Notification (inline)', group: 'Status', description: 'A banner; can appear only when a measure crosses a number.', w: 6, h: 2, minW: 2, minH: 1, uses: 'measure', data: 'notice',
    props: NOTICE_PROPS },
  { name: 'ToastNotification', label: 'Notification (toast)', group: 'Status', description: 'A toast card.', w: 4, h: 3, minW: 2, minH: 2, uses: 'measure', data: 'notice',
    props: NOTICE_PROPS },
  { name: 'ActionableNotification', label: 'Notification (with action)', group: 'Status', description: 'A banner with an action button.', w: 6, h: 2, minW: 2, minH: 1, uses: 'measure', data: 'notice',
    props: [...NOTICE_PROPS, P('actionLabel', 'Button text', 'text', 'View')] },
  { name: 'InlineLoading', label: 'Inline loading', group: 'Status', description: 'A spinner with text.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('description', 'Text', 'text', 'Loading…'), P('status', 'Status', 'enum', 'active', { options: ['active', 'inactive', 'finished', 'error'] })] },
  { name: 'Loading', label: 'Loading spinner', group: 'Status', description: 'A spinner.', w: 2, h: 3, minW: 1, minH: 1,
    props: [P('small', 'Small', 'bool', false), P('description', 'Description', 'text', 'Loading')] },
  { name: 'SkeletonText', label: 'Skeleton text', group: 'Status', description: 'Grey placeholder lines.', w: 4, h: 3,
    props: [P('lineCount', 'Lines', 'number', 3), P('heading', 'Heading', 'bool', false), P('paragraph', 'Paragraph', 'bool', true)] },
  { name: 'SkeletonPlaceholder', label: 'Skeleton block', group: 'Status', description: 'A grey placeholder block.', w: 4, h: 4,
    props: [] },
  { name: 'Button', label: 'Button', group: 'Actions', description: 'A button, optionally a link.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('text', 'Text', 'text', 'Open'), P('kind', 'Kind', 'enum', 'primary', { options: ['primary', 'secondary', 'tertiary', 'ghost', 'danger', 'danger--tertiary', 'danger--ghost'] }), P('size', 'Size', 'enum', 'md', { options: ['sm', 'md', 'lg', 'xl', '2xl'] }), P('href', 'Address (makes it a link)', 'text', ''), P('disabled', 'Disabled', 'bool', false)] },
  { name: 'ButtonSet', label: 'Button set', group: 'Actions', description: 'Buttons side by side. Each line: Label :: address.', w: 6, h: 2, minW: 2, minH: 1,
    props: [P('items', 'Buttons (Label :: address)', 'lines', ['Cancel', 'Save']), P('stacked', 'Stacked', 'bool', false)] },
  { name: 'CopyButton', label: 'Copy button', group: 'Actions', description: 'Copies a text to the clipboard.', w: 2, h: 2, minW: 1, minH: 1,
    props: [P('text', 'Text to copy', 'text', 'kubectl get pods'), P('feedback', 'Message', 'text', 'Copied')] },
  { name: 'OverflowMenu', label: 'Overflow menu', group: 'Actions', description: 'A three-dot menu with links. Each line: Label :: address.', w: 1, h: 2, minW: 1, minH: 1,
    props: [P('items', 'Items (Label :: address)', 'lines', ['Documentation :: https://www.ibm.com/docs', 'Support :: https://www.ibm.com/support']), P('flipped', 'Open to the left', 'bool', false), P('size', 'Size', 'enum', 'md', { options: SIZES })] },
  { name: 'MenuButton', label: 'Menu button', group: 'Actions', description: 'A button that opens a menu. Each line: Label :: address.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('text', 'Text', 'text', 'Actions'), P('items', 'Items (Label :: address)', 'lines', ['Documentation :: https://www.ibm.com/docs']), P('kind', 'Kind', 'enum', 'primary', { options: ['primary', 'tertiary', 'ghost'] })] },
  { name: 'Modal', label: 'Modal (opens from a button)', group: 'Actions', description: 'A button that opens a dialog.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('buttonLabel', 'Button text', 'text', 'Show details'), P('kind', 'Button kind', 'enum', 'primary', { options: ['primary', 'secondary', 'tertiary', 'ghost'] }), P('heading', 'Dialog heading', 'text', 'Details'), P('modalLabel', 'Small label', 'text', ''), P('body', 'Dialog text', 'area', 'Text goes here.'), P('passive', 'Close button only', 'bool', true), P('primaryText', 'OK button text', 'text', 'OK'), P('secondaryText', 'Cancel button text', 'text', 'Cancel'), P('size', 'Size', 'enum', 'sm', { options: ['xs', 'sm', 'md', 'lg'] })] },
  { name: 'Tooltip', label: 'Tooltip', group: 'Actions', description: 'A button that explains itself on hover.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('text', 'Button text', 'text', 'Hover me'), P('content', 'Tooltip text', 'text', 'More about this.'), P('align', 'Position', 'enum', 'bottom', { options: ['top', 'bottom', 'left', 'right'] })] },
  { name: 'Toggletip', label: 'Toggletip', group: 'Actions', description: 'A button that opens a small note.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('text', 'Button text', 'text', 'Info'), P('content', 'Note', 'area', 'More about this.'), P('align', 'Position', 'enum', 'bottom', { options: ['top', 'bottom', 'left', 'right'] })] },
  { name: 'DefinitionTooltip', label: 'Definition tooltip', group: 'Actions', description: 'A term with its definition on hover.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('text', 'Term', 'text', 'Causal union'), P('definition', 'Definition', 'text', 'Alerts joined into one incident because of a shared cause.')] },
  { name: 'Dropdown', label: 'Dropdown', group: 'Inputs', description: 'A chooser; can list the values of a field and filter other widgets.', w: 3, h: 2, minW: 2, minH: 1, uses: 'values', data: 'source=field',
    props: [SOURCE, P('titleText', 'Label', 'text', 'Severity'), P('placeholder', 'Placeholder', 'text', 'Choose'), P('size', 'Size', 'enum', 'md', { options: SIZES }), ITEMS] },
  { name: 'Select', label: 'Select', group: 'Inputs', description: 'A native select; can list the values of a field and filter other widgets.', w: 3, h: 2, minW: 2, minH: 1, uses: 'values', data: 'source=field',
    props: [SOURCE, P('labelText', 'Label', 'text', 'State'), P('size', 'Size', 'enum', 'md', { options: SIZES }), ITEMS] },
  { name: 'ComboBox', label: 'Combo box', group: 'Inputs', description: 'A chooser you can type into.', w: 3, h: 2, minW: 2, minH: 1, uses: 'values', data: 'source=field',
    props: [SOURCE, P('titleText', 'Label', 'text', 'Resource'), P('placeholder', 'Placeholder', 'text', 'Type or choose'), P('size', 'Size', 'enum', 'md', { options: SIZES }), ITEMS] },
  { name: 'MultiSelect', label: 'Multi-select', group: 'Inputs', description: 'Choose several; can filter other widgets.', w: 3, h: 2, minW: 2, minH: 1, uses: 'values', data: 'source=field',
    props: [SOURCE, P('titleText', 'Label', 'text', 'Teams'), P('placeholder', 'Placeholder', 'text', 'Choose options'), P('size', 'Size', 'enum', 'md', { options: SIZES }), ITEMS] },
  { name: 'RadioButtonGroup', label: 'Radio buttons', group: 'Inputs', description: 'Pick one; can filter other widgets.', w: 3, h: 4, minW: 2, minH: 2, uses: 'values', data: 'source=field',
    props: [SOURCE, P('legendText', 'Legend', 'text', 'View'), P('orientation', 'Direction', 'enum', 'vertical', { options: ['vertical', 'horizontal'] }), ITEMS] },
  { name: 'ContentSwitcher', label: 'Content switcher', group: 'Inputs', description: 'Segmented control; can filter other widgets, or show text per segment (Label :: text).', w: 6, h: 2, minW: 2, minH: 1, uses: 'values', data: 'source=field',
    props: [SOURCE, P('size', 'Size', 'enum', 'md', { options: SIZES }), P('items', 'Segments (Label :: text)', 'lines', ['Day :: Last 24 hours', 'Week :: Last 7 days'])] },
  { name: 'Toggle', label: 'Toggle', group: 'Inputs', description: 'An on/off switch.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('labelText', 'Label', 'text', 'Auto refresh'), P('labelA', 'Off text', 'text', 'Off'), P('labelB', 'On text', 'text', 'On'), P('size', 'Size', 'enum', 'md', { options: ['sm', 'md'] }), P('on', 'On at start', 'bool', false)] },
  { name: 'Checkbox', label: 'Checkbox', group: 'Inputs', description: 'A tick box.', w: 3, h: 2, minW: 1, minH: 1,
    props: [P('labelText', 'Label', 'text', 'Include cleared alerts'), P('helperText', 'Helper text', 'text', ''), P('on', 'Ticked at start', 'bool', false)] },
  { name: 'CheckboxGroup', label: 'Checkbox group', group: 'Inputs', description: 'Several tick boxes.', w: 3, h: 4,
    props: [P('legendText', 'Legend', 'text', 'Show'), ITEMS, P('orientation', 'Direction', 'enum', 'vertical', { options: ['vertical', 'horizontal'] })] },
  { name: 'Search', label: 'Search', group: 'Inputs', description: 'A search box.', w: 4, h: 2, minW: 2, minH: 1,
    props: [P('labelText', 'Label', 'text', 'Search'), P('placeholder', 'Placeholder', 'text', 'Search'), P('size', 'Size', 'enum', 'md', { options: SIZES })] },
  { name: 'TextInput', label: 'Text input', group: 'Inputs', description: 'A one-line text box.', w: 4, h: 2, minW: 2, minH: 1,
    props: [P('labelText', 'Label', 'text', 'Name'), P('placeholder', 'Placeholder', 'text', ''), P('helperText', 'Helper text', 'text', ''), P('size', 'Size', 'enum', 'md', { options: SIZES })] },
  { name: 'PasswordInput', label: 'Password input', group: 'Inputs', description: 'A masked text box.', w: 4, h: 2, minW: 2, minH: 1,
    props: [P('labelText', 'Label', 'text', 'Password'), P('size', 'Size', 'enum', 'md', { options: SIZES })] },
  { name: 'TextArea', label: 'Text area', group: 'Inputs', description: 'A multi-line text box.', w: 4, h: 4, minW: 2, minH: 2,
    props: [P('labelText', 'Label', 'text', 'Notes'), P('placeholder', 'Placeholder', 'text', ''), P('rows', 'Rows', 'number', 4), P('maxCount', 'Character limit (0 = none)', 'number', 0)] },
  { name: 'NumberInput', label: 'Number input', group: 'Inputs', description: 'A number box with steppers.', w: 3, h: 2, minW: 2, minH: 1,
    props: [P('label', 'Label', 'text', 'Count'), P('value', 'Start at', 'number', 0), P('min', 'Smallest', 'number', 0), P('max', 'Largest', 'number', 100), P('step', 'Step', 'number', 1), P('size', 'Size', 'enum', 'md', { options: SIZES })] },
  { name: 'Slider', label: 'Slider', group: 'Inputs', description: 'A slider.', w: 4, h: 2, minW: 2, minH: 1,
    props: [P('labelText', 'Label', 'text', 'Threshold'), P('value', 'Start at', 'number', 50), P('min', 'Smallest', 'number', 0), P('max', 'Largest', 'number', 100), P('step', 'Step', 'number', 1)] },
  { name: 'DatePicker', label: 'Date picker', group: 'Inputs', description: 'A date or date range.', w: 4, h: 2, minW: 2, minH: 1,
    props: [P('type', 'Type', 'enum', 'single', { options: ['simple', 'single', 'range'] }), P('labelText', 'Label', 'text', 'Date'), P('placeholder', 'Placeholder', 'text', 'mm/dd/yyyy')] },
  { name: 'TimePicker', label: 'Time picker', group: 'Inputs', description: 'A time box.', w: 3, h: 2, minW: 2, minH: 1,
    props: [P('labelText', 'Label', 'text', 'Time'), P('placeholder', 'Placeholder', 'text', 'hh:mm')] },
  { name: 'FileUploader', label: 'File uploader', group: 'Inputs', description: 'Choose files.', w: 4, h: 4, minW: 2, minH: 2,
    props: [P('title', 'Title', 'text', 'Upload files'), P('description', 'Description', 'text', 'Any file, up to 500 MB'), P('buttonLabel', 'Button text', 'text', 'Add file'), P('multiple', 'Several files', 'bool', true)] },
  { name: 'Pagination', label: 'Pagination', group: 'Navigation', description: 'Page controls.', w: 8, h: 2, minW: 3, minH: 1,
    props: [P('totalItems', 'Total items', 'number', 120), P('pageSize', 'Items per page', 'number', 10)] },
  { name: 'PaginationNav', label: 'Page numbers', group: 'Navigation', description: 'Numbered page links.', w: 6, h: 2, minW: 3, minH: 1,
    props: [P('totalItems', 'Pages', 'number', 12), P('itemsShown', 'Numbers shown', 'number', 5)] },
  ...STATUS_SPECS,
  ...CHART_SPECS,
  // Widgets for the Concert Operate queries that are not plain rows.
  { name: 'IncidentInsights', label: 'Incident insights', group: 'Data', description: 'Probable cause and similar earlier incidents for the incident you choose from its list. Follows other widgets\u2019 filters.', w: 6, h: 12, minW: 4, minH: 6, uses: 'rows', data: 'always', query: 'getStories',
    props: [P('show', 'Show', 'enum', 'both', { options: ['both', 'probable cause', 'similar incidents'] }), P('labelText', 'Chooser label', 'text', 'Incident')] },
  { name: 'RunbookActivity', label: 'Runbook activity', group: 'Data', description: 'Recent runs of the runbooks attached to the alerts shown: runbook, status, when, and which alert.', w: 6, h: 10, minW: 4, minH: 5, uses: 'rows', data: 'always', query: 'getAlerts',
    props: [P('rows', 'Runs to list', 'number', 10), P('statusTags', 'Status counts on top', 'bool', true)] },
  { name: 'PeoplePicker', label: 'People and teams', group: 'Inputs', description: 'Choose real people or teams from the tenant\u2019s users and groups. Set "Values of field" under Data to Owner (people) or Team (teams); other widgets filter to the choice.', w: 3, h: 2, minW: 2, minH: 1, uses: 'values', data: 'always', emits: true,
    props: [P('titleText', 'Label', 'text', 'Owner'), P('placeholder', 'Placeholder', 'text', 'Anyone'), P('size', 'Size', 'enum', 'md', { options: SIZES })] },
  { name: 'ApplicationCards', label: 'Application cards', group: 'Data', description: 'One card per business application: worst severity, alert counts, open incidents and criticality. Click a card to filter other widgets.', w: 12, h: 6, minW: 3, minH: 3, uses: 'rows', data: 'always', emits: true, query: 'getApplications',
    props: [P('minWidth', 'Card width (px)', 'number', 190)] }
];

const BY_NAME = new Map(SPECS.map(x => [x.name, x]));

/** The spec for a `carbon:<Name>` widget type, or undefined. */
export function carbonSpec(type: string): CarbonSpec | undefined {
  return type.startsWith('carbon:') ? BY_NAME.get(type.slice(7)) : undefined;
}

/** The settings a new widget starts with, as the form shows them. */
export function carbonDefaults(spec: CarbonSpec): Record<string, any> {
  const o: Record<string, any> = {};
  spec.props.forEach(x => { if (x.def !== undefined) o[x.key] = x.def; });
  return o;
}
