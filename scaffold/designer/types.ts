/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

export const GRID_COLS = 12;

export type QueryName =
  | 'getAlerts' | 'getStories' | 'getApplications' | 'getMetricSeries'
  | 'getRawAlerts' | 'getStoriesByAlerts' | 'getIncidentAlerts' | 'getStoryAlertsGroups' | 'getRelatedStories' | 'getTopologyResource'
  | 'getPeople' | 'getGroups' | 'getActions' | 'getTools' | 'getFiltersViews'
  | 'getPolicies' | 'getAlertCount' | 'getIncidentCount';
export type Row = Record<string, string | number | undefined>;

export type NativeType = 'kpi' | 'bar' | 'donut' | 'timeseries' | 'table' | 'text' | 'image' | 'group';
/** A tile embeds one of the toolkit's existing panels as it is (it fetches its own data and does not cross-filter). */
export type WidgetType = NativeType | `tile:${string}` | `carbon:${string}`;

/** `op` defaults to '='. Comparisons are numeric when both sides are numbers. */
export type CondOp = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'contains';
export interface Cond { field: string; value: string; op?: CondOp }
export const COND_OPS: CondOp[] = ['=', '!=', '<', '<=', '>', '>=', 'contains'];

export type Metric = 'count' | 'distinct' | 'max' | 'avg' | 'sum';

/**
 * One action wire: when this widget's `event` happens (and, if `when` is set, carries exactly that value), do `do` to the
 * widget `to`, with `arg` (which may contain {value}, the value the event carried). See component-api.ts for the lists.
 */
export interface ActionLink { event: string; to: string; do: string; arg?: string; when?: string }

export interface WidgetConfig {
  query: QueryName;
  /** Server-side filter (alerts only), e.g. severity >= 5. Empty means the default (state != 'clear'). */
  filter?: string;
  /** Fixed client-side condition: only rows where `field` equals `value` are used. */
  where?: Cond;
  /** More conditions, all of which must hold (AND). */
  also?: Cond[];
  groupBy?: string;
  /** Charts: a second field that splits each group (stacks, lines, heatmap rows, flow targets). */
  seriesBy?: string;
  metric?: Metric;
  valueField?: string;
  timeField?: string;
  columns?: string[];
  limit?: number;
  sortBy?: string;
  sortDesc?: boolean;
  refreshSeconds?: number;
  /** Clicking a bar / slice sets a filter that other widgets on the same query can follow. */
  emits?: boolean;
  /** Follow the filters set by other widgets on the same query. */
  listens?: boolean;
  /** Wiring: when set, this widget's selections only reach these widgets. Unset means every widget on the same query. */
  sendTo?: string[];
  /** Action wires: what happens to other widgets when something happens in this one (a click, a value, a tab...). */
  on?: ActionLink[];
  /** Start hidden while viewing; an action wire can show it. */
  hidden?: boolean;
  /** Follow the dashboard's filter bar (default yes). */
  followBar?: boolean;
  /** Viewers can regroup this chart with the "by ..." dropdown (default yes). */
  pivot?: boolean;
  /** false: viewers cannot switch this chart to another type ("View as" menu). */
  viewAs?: boolean;
  /** Viewers can drag this widget's corner to resize it while using the dashboard (default yes). */
  resize?: boolean;
  /** Viewers can set a "notify me" threshold on this number (default yes). */
  notify?: boolean;
  /** Value inputs: filter the widgets in `sendTo` by this input's value, on this field of this query. */
  /** What a click does: show the rows behind it in a side panel, or open an address with the clicked values filled in. */
  drill?: { mode: 'details' | 'link'; url?: string; newTab?: boolean };
  bind?: { field: string; op: CondOp; query: QueryName };
  text?: string;
  /** Tiles only: what this tile stands in for when a dashboard was split into widgets (shown in Concert Workbench). */
  part?: string;
  /** Tiles only: while viewing, show no frame and no title bar (the embedded panel has its own heading). Editing still shows them. */
  chromeless?: boolean;
  /** Colours (#rrggbb): the widget's background and the colour of its text. Unset keeps the theme. */
  bg?: string;
  fg?: string;
  /** Tiles only: options passed to the embedded panel as props (for example { part: 'services' } shows one section of a dashboard that supports it). */
  props?: Record<string, unknown>;
  /** Tiles only: values that replace constants written in the dashboard's code (service domains, KPI lists, thresholds...). Passed as the `settings` prop; see scaffold/config-runtime.ts. */
  settings?: Record<string, unknown>;
  /** Float on top of the grid: ignores collisions and gap-closing, so it can sit over another widget (for example a logo on a dashboard tile). */
  overlay?: boolean;
  /** Image widgets: the picture as a data URI (see image.ts). */
  src?: string;
  alt?: string;
  fit?: 'contain' | 'cover' | 'fill';
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: WidgetConfig;
  /** Set when the widget sits inside another: "<containerId>#<panel>". Its x, y, w and h are on that panel's own grid. */
  parent?: string;
}

/** The dashboard-wide filter bar: dropdowns for chosen fields, an optional time range, an optional refresh. */
export interface BarField { query: QueryName; field: string }
export type TimePreset = 'all' | '15m' | '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';
export const TIME_PRESETS: Array<{ id: TimePreset; label: string; ms: number }> = [
  { id: 'all', label: 'All time', ms: 0 }, { id: '15m', label: 'Last 15 minutes', ms: 15 * 60e3 }, { id: '1h', label: 'Last hour', ms: 3600e3 },
  { id: '6h', label: 'Last 6 hours', ms: 6 * 3600e3 }, { id: '24h', label: 'Last 24 hours', ms: 24 * 3600e3 }, { id: '7d', label: 'Last 7 days', ms: 7 * 86400e3 },
  { id: '30d', label: 'Last 30 days', ms: 30 * 86400e3 }, { id: 'custom', label: 'Custom range', ms: 0 }
];
export interface FilterBarConfig {
  fields: BarField[];
  /** Offer a time range. `timeField` is the alert time it filters on (incidents always use their created time). */
  time?: boolean;
  timeField?: 'firstOccurrence' | 'lastOccurrence';
  /** The range the dashboard opens with. */
  preset?: TimePreset;
  /** Seconds between automatic refreshes (0 or unset = off). */
  refresh?: number;
}

export interface Dashboard {
  id: string;
  name: string;
  updated: number;
  widgets: Widget[];
  /** Row height in pixels (24 to 96, default 48). */
  rowH?: number;
  /** The dashboard-wide filter bar (absent = none). */
  bar?: FilterBarConfig;
}

export interface Filter {
  /** Widget that set it (it highlights instead of filtering itself). */
  from: string;
  query: QueryName;
  field: string;
  value: string;
}

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
