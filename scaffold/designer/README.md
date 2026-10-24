# Dashboard Designer

A page where people build their own dashboards inside Concert Operate / Cloud Pak for AIOps: add widgets, bind them to
live queries, drag and resize them, link them so a click in one filters the others, and save the result.

> **Important: turn on the filter bar.** **Filters** in the bar adds one strip at the top of the dashboard (dropdowns for the
> fields people filter by, a time range, auto-refresh) that narrows every widget at once. It is what makes a dashboard usable
> for anyone other than its author, so switch it on for every dashboard you share. All nineteen templates already have it.

## What a user can do

| Action | How |
| --- | --- |
| Add a widget | **Edit** → **Add widget** → pick one. It lands in the first free space. |
| Move / resize | Drag the title bar; drag the corner. Others are pushed down and the page floats up, so nothing overlaps. Keyboard: select a widget, arrows move, Shift+arrows resize, Delete removes. |
| Bind to data | Select a widget → **Settings**: source (alerts or incidents), an optional alert filter, an optional "only rows where field = value", the field to group or measure, refresh interval. |
| Link widgets | Click a bar or donut slice: other widgets on the same source follow. Click again, or a chip above the grid, to clear. Each widget has *Click sets a filter* and *Follows filters* switches. |
| Start from a template | **Templates** in the bar (or the start screen of an empty dashboard): nineteen starters, including layouts with split panes, tabs, accordions and a carousel. Replaces the canvas; Undo brings it back. |
| Put widgets inside widgets | Containers (Container, Tabs, Accordion, Split pane, Scroll pane, Carousel, Toolbar) hold other widgets. Drag a widget or a library item onto one (click a tab first to choose it), or use **Place in** in the widget's settings. Up to three levels deep. |
| Wire widgets | **Wire** (key W): drag from a widget's port to the widgets it should drive; click a line for its menu (type, comparison, cut). Inputs such as Search or Dropdown can filter other widgets by what is typed or chosen. |
| Action flows | **Flows** in the bar: a visual editor for what happens when people click, change or pick something. Drag from a trigger's port onto the widget that should react, then choose the action from tiles. Suggestions are offered from the widgets on the dashboard. |
| Concert Operate actions | In Action flows, drag onto **Concert Operate** (or onto a widget that shows alerts) to create an incident, add alerts to one, or activate, lock, deploy, reject, restore or rename policies. Always confirmed by the person using the dashboard before anything is sent. |
| What a click does | A bar, slice, table row or number can filter the others, show the rows behind it in a side panel, or open an address filled from the row. `?db=field:value` in an address opens a dashboard already filtered. |
| View as | While using a dashboard, the *as …* menu on a chart shows it as another chart of the same kind (bar, pie, treemap, word cloud …; line, area …; number, gauge …), only for you. *Reset changes* puts it back. |
| Colours | A widget's background and text colour, with six ready pairs. |
| Charts and status widgets | **Carbon Charts** (17: bar, grouped and stacked bar, lollipop, line, area, stacked area, scatter, pie, donut, gauge, meter, heatmap, treemap, radar, word cloud, flow) plus status shape, status icon, count badge, popover and combo button. See *Charts and status widgets* below. |
| Filter bar and time range | **Filters** in the bar: one strip of dropdowns (alert and incident fields), a time range (15 minutes to 30 days, or custom) and auto-refresh that narrows every widget on that data. Chips show what is active; **Clear all** resets. A widget opts out with *Follows the dashboard filter bar*. Saved with the dashboard. |
| Learn the tool | **Tour** in the bar: a one-minute guided tour (also runs once on a first empty dashboard). |
| Undo / redo | Buttons in the bar (last 50 steps; typing in one field counts as one step). |
| Several dashboards | Pick from the list; **New**, **Duplicate**, **Rename**, **Delete**. |
| Save / share | Saved automatically in this browser. **Export** downloads a JSON file; **Import** loads one (as a new dashboard). |

## Widgets

Data widgets (all computed from the loaded rows, nothing invented):

| Widget | Shows |
| --- | --- |
| Number | Count, distinct count, max, average or sum of a field, optionally for rows matching a condition. Shows **n/a** when a field has no numeric values. |
| Bar chart / Donut | Rows grouped by a field (severity, state, resource, team, …), top N plus "Other". Click to filter. |
| Timeline | Rows counted over a time field. Rows with no time are counted in a note, not dropped silently. |
| Table | Chosen columns, sortable, row limit. |
| Note | Free text. |

**Existing dashboards as tiles:** Telco Causal Mesh (Gen 2 and original), Telco Command Center, Incident & Alert Dashboard,
Cognitive Deep Dive, Top N, Heatmap, Pie chart, Monitor boxes, Alerts workflow.
A tile is the existing panel unchanged. It fetches its own data and does **not** take part in linking. Give big ones room
(the Gen 2 mesh wants roughly 8 × 14 cells or more).

## Data and honesty

* Alerts come from `getAlerts`, incidents from `getStories`: the same queries and tenant constant the other dashboards use
  (`ALERT_QUERY_PARAMS.tenantId` in `src/components/constants.ts`).
* One request per distinct source and filter is shared by every widget that uses it; a failed refresh keeps the last result
  on screen with a notice.
* A missing field is shown as **(none)** or **n/a**, never as zero or a guess.
* The *Alert filter* box is sent to the server unchanged. Its syntax has **not** been verified against a cluster from here;
  the *Only rows where* condition is applied in the browser and always works.
* Linking works between widgets on the same source (alerts with alerts, incidents with incidents). It is exact-match on one field.
* The Operations overview dashboard that appears on first use is built only from live-bound widgets.

## Severity and priority colours

One palette, everywhere (`semanticColor` in `rows.ts`; the same values as the Telco, Incident Atlas and Blast Radius dashboards):

| Severity | Colour | Text on it |
|---|---|---|
| 0 Clear | #8d8d8d grey | dark |
| 1 Indeterminate | #a56eff purple | white |
| 2 Information | #78a9ff light blue | dark |
| 3 Warning | #4589ff blue | white |
| 4 Minor | #f1c21b yellow | dark |
| 5 Major | #ff832b orange | dark |
| 6 Critical | #da1e28 red | white |

Incident priority is a separate scale: P1 #da1e28, P2 #ff832b, P3 #f1c21b, P4 #4589ff, P5 #57606a. Charts, tags (colour "auto"), tiles, table cells and status indicators use these whenever a field is severity or priority, so Critical is the same red everywhere. Counts and totals use neutral dark tiles so they are never read as a severity.

## Files

| File | Purpose |
| --- | --- |
| `DashboardBuilder.tsx` | The page: toolbar, dashboards, undo, import/export, filter chips |
| `GridCanvas.tsx` | 12-column drag / resize / keyboard surface |
| `Widgets.tsx`, `Tiles.tsx` | Data widgets and the embedded existing panels |
| `Inspector.tsx` | Settings for the selected widget |
| `FilterBar.tsx`, `FilterBarSettings.tsx` | The dashboard-wide filter bar (dropdowns, time range, refresh) and its settings pop-over |
| `templates.ts`, `StartScreen.tsx`, `Tour.tsx` | Starter templates, the start screen that offers them, the guided tour |
| `nest.tsx`, `nesting.ts`, `dnd.ts` | Containers, the tree rules, drag and drop between panels |
| `Wiring.tsx`, `WireLayer.tsx`, `drill.ts`, `DrillDrawer.tsx` | Wiring, the wire lines and menu, drill-through |
| `grid.ts` | Pure layout rules (collision, push-down, float-up) |
| `rows.ts` | Query response → rows; grouping, measures, time bins, filters |
| `datahub.ts` | Shared, de-duplicated, refreshable queries |
| `store.ts` | Saved dashboards, validation of anything read back, JSON import/export, starter dashboard |
| `registry.ts`, `types.ts`, `context.ts`, `version.ts` | Widget catalogue and shared types |
| `dashboard-builder.panel.ts` | Panel (goes in `src/panels/`) |
| `logic.test.ts` | 25 tests for the pure files |

## Not included (yet)

* Saved dashboards are per browser. Sharing is by JSON file. A shared store would need a backend or cluster write path.
* Tiles do not take part in linking, and widgets do not link across different sources.
* No per-user permissions, no scheduled export, no free-form SQL or custom queries (only `getAlerts` and `getStories`).
* The panel options `tenantId` and `readOnly` exist, but this toolkit version does not pass route state to panels, so they only matter if you wrap the panel yourself.

## Checked, and not checked

Checked here: strict and loose (`strictNullChecks` off) TypeScript, 25 unit tests, SCSS compile, and a scripted jsdom run
(mount, live-bound numbers, cross-filtering, add / drag / keyboard move / undo / redo / delete, import with a bad item,
read-only mode, autosave). **Not** checked: real Carbon components and styling, a real browser's pointer and layout
behaviour, touch input, the embedded tiles inside the grid, and a real cluster response. Treat the first deploy as the test.

## Charts and status widgets

All of them are ordinary widgets: they read the same data, follow the same filters and take part in the same wiring as the Bar chart and Number.

**Where the data comes from.** Pick the source (alerts or incidents) under *Data*. The widget then narrows those rows by, in order: the dashboard filter bar (unless the widget opts out), its own condition (*only rows where…*), and the filters other widgets have sent it. Under *Data* you choose what is drawn:

| Setting | Meaning |
| --- | --- |
| Measure | What is counted or averaged per bar, slice, point or cell: rows, distinct values, highest, average or total of a numeric field. |
| Group by | The categories: bars, slices, heatmap columns, the "from" side of a flow. |
| Series by | A second split: stack segments, one line per value, heatmap rows, the "to" side of a flow. |
| Time field | Line, area and scatter charts: which time the horizontal axis uses. |

**Wiring.** Clicking a bar, slice, heatmap cell, treemap box, word, flow node or a popover entry sets a filter on the field it stands for, and every widget on the same source follows. Choose which widgets with **Wire** or *Settings > Wiring*. Clicking again clears it. If the widget has a *drill-through* (Settings), a click opens the rows (or an address) instead. The chart highlights what it selected. The gauge, meter, indicators and badge open the rows when they have a drill-through. Line, area and scatter charts send a filter only when *Series by* is set (clicking a point selects that series).

**Filters.** Because they read through the same path, the filter bar and time range narrow every chart. A chart that should ignore it switches off *Follows the dashboard filter bar*; one that should ignore other widgets switches off *Follows filters from other widgets*.

**Thresholds.** Gauge, meter, status shape and status icon share one rule: *Warning at* and *Critical at* compare with the measure (*Worse when the value is* higher or lower). The status shape and icon can also take the worst severity of the rows (priority for incidents). The count badge shows the measure and can hide itself at zero.

**Popover and combo button.** The popover lists the groups of its data with counts; choosing one sets a filter. The combo button's menu lines are `Label :: target`, where the target is an address, `filter:field=value` (sets a filter on the widgets wired to it) or `clear` (removes the filters that button set). The first line is the button itself.
