# Dashboard Designer changes

## v1.64.2
- The title band is the top of the dashboard: while viewing it is drawn above the active filters and the filter bar, at the height its text needs (grid.ts `titleBand`). Editing keeps it on the grid so it can still be moved or changed. Templates build it two rows tall.
- Clicking a segment of a stacked bar chart filters again (on the bar and on the segment's series). Carbon reports a stacked segment differently from a plain bar, so these clicks were ignored.
- Clicking a treemap tile filters again (Carbon reports a tile as a tree node, with the name one level down).

## v1.64.1
- The side panel (rows behind a click, Explain) opens below whatever sits above the dashboard, so Concert Operate's header no longer hides its title and Close button. Drag its title bar to move it, double-click the title bar to dock it on the right again, drag its left edge (or arrow keys on it) to resize; the width is remembered.

## v1.64.0
**Explain this.** Right-click any widget that shows alerts or incidents (Shift+right-click keeps the browser's menu), or open the rows behind a click: the panel starts with an explanation of those rows.
- *What*: how many, by severity or priority, since when; for alerts, how many started in the last hour against the usual hourly rate of the day before.
- *Where*: the top resources, services and types.
- *Why*: how many alerts are in incidents, and for the top three incidents Concert's own probable cause (rank, score, classification), read once per session; anomaly, seasonal, golden-signal and log-fix counts.
- *What to do*: runbooks attached (and how many are automated); similar past incidents on request.
- Everything is worked out from the rows or read from Concert; nothing is guessed (explanation.ts).

**Incident replay.** The incident timeline in the drill panel uses Concert's own incident record when there is one: each alert at the moment it was added, with its severity then (and its severity now when different). A slider and Play step through it; later events are dimmed.

- sync-designer.sh removes files from the build copy that were removed or renamed in the master copy.

## v1.63.2
- API check probes, after the first run on the tenant: the incident diagnosis is called with `contextId` (what the server asked for), `getSimilarIncidents` is tried, and the incident timeline found in the alert groups answer is summarised (kinds of entry, their fields, the time span; never the content).

## v1.63.1
- API check: new read-only probes for planned features. `getIncidentDiagnosis` and `getIncidentDiagnosisStatus` (for *Explain this*), `getEventData` and `getIncidentAlertDetails` (for time travel) are each asked which parameters they require, then called with the first incident and alert; the report shows what they return.

## v1.63.0
**Data snapshot for the Workbench.** The API check (⋮ › Check the Concert Operate API) has *Record and download*: it records the answers of the data sources, plus the alerts, alert groups and related incidents of the first 10 incidents, into a file. Uploaded in the Workbench (Setup › Real data for Design), it replaces the sample data in Design, so dashboards are designed on the tenant's real data. Read-only; answers are matched by their parameters (snapshot.ts, `callKey`).

## v1.62.0
**Pick instead of typing ids.** Fields that need an id offer values from live data as you type: the incident id of *Alerts of an incident*, *Alert groups of an incident* and *Related incidents* (open incidents by title, with id, priority and state), the policy fields of the policy actions in Action flows (policy names; a list adds to what is there), and the filter type of *Saved filters*. Typing stays free ({value}, any id). A list loads only when its field is first used, so thousands of policies cost nothing until then. Arrow keys, Enter and Escape work in the list.

## v1.61.1
- View as: *heatmap* is offered only when the chart has a second split (Data > Series by). Without one it had nothing to compare and asked for Series by.

## v1.61.0
**View as.** While a dashboard is used, a chart can be shown as another kind of chart that reads the same data: an *as …* menu on the widget (shown on hover, and kept visible once switched).
- Families: groups (bar, donut, simple bar, lollipop, pie, Carbon donut, treemap, word cloud, grouped and stacked bar, heatmap, radar), over time (timeline, line, area, stacked area, scatter), one figure (number, gauge, meter) and rows (table, data table, structured list). A chart only offers its own family, so nothing is lost and switching back restores it.
- The choice is kept per person and dashboard, like Arrange widgets; *Reset changes* puts every chart back. Designers can turn it off per widget (Interact > *Viewers can show it as another chart*).
- New action *Change its chart type* (Data) in Flows, for example a toggle that flips a chart between bars and a word cloud.

## v1.60.0
**Policies by name.** Policy actions (activate, deploy, stop deploying, reject, restore, rename) take policy names as well as ids. Names are looked up in the Policies source (fetched once if no widget shows it); names that match no policy are listed in the confirmation and left out. Names keep their spaces: several are separated by commas. New template **Policy manager**: every policy in a searchable table, with a box per action.

**Large tenants.**
- A source keeps at most 5,000 rows; the widget says so when an answer had more ("Showing the first 5,000 of 12,345 rows").
- A query that has not answered after 60 seconds counts as failed; the last good rows stay on screen.
- One load at a time per source: a refresh (timer or button) while a load still runs waits for it instead of stacking requests.
- No refreshing while the browser tab is hidden; what went stale refreshes when the tab comes back.
- A slow source is not refreshed more often than ten times its own load time (Policies takes about 12 seconds, so at most every two minutes).

**Tidy.** The code is lint-clean. `scaffold/designer` is the master copy: `./sync-designer.sh` copies it to `dashboards/dashboard-builder`, and deploying stops if the two differ.

## v1.59.1
- Topology resource (checked against a real Concert Operate): the row takes its `_id` as its id, and epoch-millisecond times such as beginTime and observedTime are read as times, so they show as dates and can drive a timeline.

## v1.59.0
Concert Operate actions checked against the parameters a real Concert Operate requires (API check probe, 2026-10-24):
- Confirmed: create an incident (alertIds, priority), add alerts to an incident (alertIds), activate / reject / restore policies (policyIds), deploy / stop deploying a policy (policyId, deployed), rename a policy (policyId, name). Tests now pin each action to those parameters.
- *Lock policies* and *Unlock policies* are no longer offered: Concert Operate's own setPolicyLock sends an argument its server does not accept, so they cannot work from any client on this version. A dashboard that still has one says so when it runs, instead of failing silently. The *Incident and policy actions* template now has Reject and Restore in their place.

## v1.58.0
- API check: new opt-in *Ask the server which parameters each incident and policy action needs*. Concert Operate does not allow GraphQL introspection (checked 2026-10-24), but it names every missing required parameter when it refuses a request. The check sends each change action a request with an invalid tenant id, which the server refuses while checking variables, before anything runs, and reports the parameters it named. If a server ever accepted such a request, the check says so in capitals.

## v1.57.0
From the second API check against a real Concert Operate (every source now reads correctly):
- New sources: **Policies** (getPoliciesMetadata: id and name of every policy, so the policy actions get real ids), **Open alert count** and **Open incident count** (getStandingAlertCount / getStandingStoryCount: one number straight from Concert, much faster than counting rows; show it with Sum of Quantity).
- *Related incidents* leaves out the incident it was asked about (Concert lists it among its own relations).
- Generic sources take a record's name from `metadata.name` when it has no name of its own (policies).
- API check: `graphql` takes the query as text, so the check now sends the description request as text, tries smaller requests when it is refused, and reports the server's own reason. Errors from every source include the server's reason too.

## v1.56.0
Fixes from the first API check against a real Concert Operate (2026-10-24):
- *Incidents of matching alerts* and *Related incidents* read the incidents themselves, not the insight records inside each one. Generic sources take the outermost list of an answer, so *User groups* lists the groups (with their members) rather than the users inside them.
- *Alerts of an incident* reads through getAlerts with the incident id (getIncidentAlerts fails inside Concert Operate) and includes cleared alerts.
- *Saved filters* uses getFilters with a type (alert by default), as the toolkit's Monitor Box does; getFiltersViews without a type is refused on tenants with inventory filters.
- *Resource groups* is renamed *User groups*: that is what getGroups returns.
- Raw alerts give Acknowledged and Suppressed as true / false like the other alert sources, and get the insight fields (topology group, anomaly, seasonal, golden signal, causal links, incident link, runbooks) from their records.
- Applications whose severity counts Concert does not send show *Not reported* instead of *Healthy*. People show their full names. GraphQL `__typename` fields no longer appear as columns.
- The API check picks an incident that has alerts, calls the extra read functions the tenant offers (getIncident, getAlertSummary, getPoliciesSummary, getTickets …) and asks the API to describe itself (GraphQL introspection) for the exact parameters of every mutation.

## v1.55.2
- A first visit opens an empty *New dashboard* with the start screen (templates or a blank page) instead of a ready-made dashboard. The shared layout set in Concert Workbench is still one click away: ⋮ > Add the shared layout. Dashboards people saved still reopen where they left off.

## v1.55.1
- Fixes the squeezed Preview / Edit switch in the toolbar: the widget library's list / grid switch (v1.51.0) reused its class name.

## v1.55.0
- Action flows: the tiles have dropdowns as well as the side panel. On a trigger, the widget's name changes the trigger (its actions move with it) and each event changes that event; on an action, its name changes what happens (grouped and searchable) and *on …* changes the widget it acts on; on a target, its name points every action that changes it at another widget.
- **Check the Concert Operate API** (⋮ menu): calls each data source once against the real Concert Operate and records the shape of every answer (keys, types, list lengths), how many rows the Designer read from it and which fields. Helper functions and the incident and policy mutations are only looked up, never called. Sample values and the start of each function's code are optional. *Copy report* or *Download* gives a Markdown report to send back so the readers can be fixed against real responses.

## v1.54.0
- Four new templates that show the v1.53 sources and actions at work:
  - **Incident drill-down**: a dropdown of incident ids drives *Alerts of an incident*, *Alert groups of an incident* and *Related incidents* through *Change its source parameter* (master and detail).
  - **Incident and policy actions**: a button creates a P2 incident from the alerts a table shows; boxes add them to an incident, create one from alert ids, and lock, unlock or activate policies. Each asks for confirmation.
  - **Alert filter lab**: one alert filter, typed once, drives figures, charts and tables on raw alerts and on the incidents that contain them.
  - **Tenant configuration**: people and teams, automation actions, tools, saved views, resource groups, and a topology resource looked up by id.
- A widget whose source still needs an incident id or filter now says *Waiting for a value* instead of *Query failed*.
- *Create an incident from the alerts it shows* now uses exactly the rows the widget shows: its extra conditions and the filter bar are applied too.

## v1.53.0
- **Eleven more data sources** (Data tab > Source, now grouped): *Alerts (raw, any filter)* (getRawAlerts), *Incidents of matching alerts* (getStoriesByAlerts), *Alerts of an incident* (getIncidentAlerts), *Alert groups of an incident* (getStoryAlertsGroups), *Related incidents* (getRelatedStories), *Topology resource* (getTopologyResource), *People and teams* (getUsersAndGroups), *Resource groups* (getGroups), *Automation actions* (getActions), *Tools* (getTools) and *Saved filters and views* (getFiltersViews). Sources that need an id or a filter ask for it in the Data tab and say so on the widget until it is given.
- Alert and incident sources get the same fields, colours, filter bar and drill-down as the main ones. The others are read generically (the largest list of records, flattened one level) and their fields are learnt from the first answer, so they can be grouped, measured and shown as columns.
- Master and detail: the new action *Change its source parameter* (Data) sets a widget's incident id, resource id or filter, usually to {value}, so picking an incident in one widget shows its alerts in another.
- **Concert Operate actions** in Action flows: a *Concert Operate* target (offered while dragging and in the On list) with *Create an incident*, *Add alerts to an incident*, and *Activate*, *Lock*, *Unlock*, *Deploy*, *Stop deploying*, *Reject*, *Restore* and *Rename* policies (createIncidentMutation, updateIncidentMutation and the policy mutations). Widgets that show alerts also get *Create an incident from the alerts it shows* and *Add the alerts it shows to an incident*, which use the alerts the widget shows after its filters.
- Actions with several fields (alert ids, priority, description) are edited field by field, with + value for what the event carried. They always ask the person using the dashboard to confirm before anything is sent, and report the result at the top of the dashboard.

## v1.52.0
- **Action flows**: a full-screen visual editor for action wiring (**Flows** in the toolbar, or *Edit in Action flows* in a widget's Interact tab). Three lanes read as a sentence: **When** (the trigger widget and its events), **Then** (one card per action), **On** (the widgets they change), joined by animated connectors that light up on hover and selection.
- Drag from a trigger's port onto any widget to add an action (every widget is offered as a drop target while dragging); the action that suits the target is preselected. Clicking the port adds one too.
- The side panel edits the selected action as tiles instead of dropdowns: the trigger's own events first (clicks, pointer and keyboard under *More events*), the target, then only the actions that target understands, grouped and searchable, with On / Off and option chips for settings and a *+ value* token that inserts what the event carries.
- Suggested flows are proposed from the dashboard (a button and a dialog, a widget hidden at start, a chooser and tabs, a chart and a note, a search box and a table) and added with one click.
- Delete removes the selected action, Ctrl+Z undoes, Esc closes. The settings panel now lists a widget's actions as sentences. Saved data is unchanged.

## v1.51.0
- Widget library (Add): a list / grid switch (grid shows three icon cards per row, the description is in the tooltip; the choice is remembered), a Recently used group with the last six widgets added, Expand all / Collapse all, and a result count.
- Search matches every word anywhere in the name, description or group ("chart bar", "status") and highlights the matches.
- Every Carbon component now has its own icon (charts, tabs, accordion, inputs, toggles, notifications, status, buttons and so on) instead of one shared one, in the library, the layers list, title bars and the settings header.

## v1.50.1
- Widget settings: long explanations under Frame, Linking, Actions and Wiring are folded behind an (i) button next to the section heading, so the settings themselves stay in view. "Follows filters from other widgets" is now a checkbox like the other on/off options.

## v1.50.0
- Widget settings are now split into tabs instead of one long scrolling panel: **General** (title, placement, the component's own options and content), **Data** (source, row filter, measure, grouping, refresh; only for widgets that show data), **Style** (colours, frame, float on top) and **Interact** (viewer options, what a click does, linking, actions, wiring). The header and tabs stay put while the panel scrolls, the last tab used stays open when another widget is selected, arrow keys move between tabs, and a dot on Data marks a measure that still needs a field.

## v1.49.2
- Starter templates now build with stable widget ids (w-<template>-<n>), so building one twice gives identical output. Combined with Studio writing generated files only when their content changed, "Publish all starter templates" run twice changes no file. The first run after upgrading rewrites the template files once.

## v1.49.1
- Runtime arranging: "Resize widgets" is now "Arrange widgets". Drag a widget by its title to move it (the others make room), drag its corner to resize. Kept per person and dashboard; "Reset changes" undoes it. The per-widget switch is now "Viewers can move and resize this widget".

## v1.49.0
- Runtime resizing. While a dashboard is used, "Resize widgets" in the toolbar shows a corner handle on every widget; drag it to make the widget bigger or smaller and the widgets around it move out of the way. Sizes are kept in this browser for this dashboard, never change the saved one, and "Reset changes" (with the links) puts everything back.
- Designers can turn it off for a widget: "Viewers can resize this widget" in its settings (on by default).

## v1.48.1
- Squished widgets fixed. On compact dashboards (short rows) banners, tags, indicators, progress bars, buttons, toggles and inputs got fewer rows than their content needs and were clipped. Loading a dashboard (Designer and Concert Operate alike) and applying a template now grow such widgets to fit and move the widgets below them down, keeping the spacing they had.

## v1.48.0
- Action wiring is now generic, so new or unlisted components need no special support.
- Events: every widget can raise is clicked, double-clicked, pointer on / off, something typed (carries the text), Enter pressed (carries the text), focus and blur, in addition to the component-specific ones.
- Actions: every data widget (charts, KPIs, tables, Carbon charts and lists) can have its grouping, second split, measure, field, time field, row narrowing (field = value), sort and row limit changed by a wire. Every widget has "Set any property by name" and "Add to any number property by name": type the property (value, disabled, kind, limit, label ...) and a value; true / false and numbers keep their type. Embedded panels receive them as props.

## v1.47.1
- Actions can add to a number: every numeric setting gets "Add to ..." (a progress bar's Value, a step counter, a Slider or Number input's value). Wire a button to a progress bar with "Add to Value (fixed)" and each press moves it on (stops at the Maximum). The Interactive controls template shows it.

## v1.47.0
- Action wiring. Besides data filters, a widget can now make another widget react: "when this is clicked / its value changes / a tab is chosen / a dialog closes / a bar is picked, then show or hide that widget, set its title, text, value or any of its settings, open or close a dialog, choose a tab, open an accordion item, go to a slide, or pick a value on a chart".
- Where: Wire mode now has "Data filters" and "Actions" (drag from any widget to the widget it should change; click a line for event, action and value); a new Actions section in every widget's settings; and the Wiring list shows every action wire.
- What each widget can raise and receive is described in component-api.ts, built from each component's settings (the Storybook argTypes idea), so every setting of every Carbon component is automatically something an action can change.
- "Hidden at start" for any widget; an action wire shows it. {value} in an action's text stands for what the event carried.
- Wires run only while a dashboard is used (Preview and published), never while designing. New template: Interactive controls.

## v1.46.5
- Creating an empty dashboard is now obvious: a "Blank dashboard" card is first in the template picker, with a button at the top. Works from Templates on a non-empty canvas too (Undo restores).

## v1.46.4
- Team and owner now follow what Concert really holds: its "-" for nobody is treated as empty (shown as "(none)", so "unassigned" counts work), and an alert or incident that has an owner but no team takes the owner's user group from getUsersAndGroups (a real group in preference to the catch-all "All Users"). Groups that only appear as a user's membership are offered in the Team filter too.
- Found on a real cluster: one group ("All Users") holding every user, and incidents with no team or owner, so team charts show nothing useful there until groups and owners are set up in Concert.

## v1.46.3
- Pivot: Summary (alerts) and Title (incidents) are in the standard lists, and an unusual saved grouping is added at the end, so every chart on the same data shows the identical list in the identical order.

## v1.46.2
- Wiring lines and ports are no longer drawn while people use a dashboard (hover, selection and "live" lines). They show in the designer, in Wire mode, and in the runtime "Link widgets" mode.

## v1.46.1
- Pivot: the lists are complete again (the last release dropped Entity type, Topology group, Anomaly, Seasonal, Golden signal, Log-analysis fixes, Causal links, Business criticality, Runbooks attached, Incidents, Event count, Times seen). Still the same ordered list for every chart on the same data; only ids, hashes and free text are left out.

## v1.46.0
- Per-widget switches in the designer (on by default): "Viewers can regroup this chart" (the "by ..." menu) and, on numbers, "Viewers can set a notification" (the bell).

## v1.45.3
- Pivot: the widget title follows the pivot ("Incidents by priority" becomes "Incidents by team"; a title that does not name the field gets " by team" added).

## v1.45.2
- Pivot: every chart on the same data now offers the same short, ordered list of fields (alerts: severity, state, source, type, team, service, resource, owner, acknowledged, in an incident, runbook, runbook type) instead of every field.
- Notify me: the pop-over opens above the bell (below only when there is no room) and is no longer clipped by the widget.

## v1.45.1
- Fixed TS7011 build error in IncidentTimeline.tsx.

## v1.45.0
- Saved views: a "Views" menu while viewing. Name the current filters, bar fields, links and groupings, switch back with one click, copy a share code, import one. Kept in the person's browser per dashboard.
- Pivot a chart: bar, donut and grouped carbon charts get a "by ..." dropdown in their header while viewing, to regroup by another field.
- Notify me: a bell on number (KPI) widgets. Set "above/below N"; crossing it outlines the number and sends a browser notification if allowed.
- Incident timeline: opening an incident in the drill panel shows its created time, each alert as it arrived (probable cause marked) and every runbook run on those alerts.
- Runbook panel: opening an alert shows each attached runbook (automated/manual, success rate, runs on this alert) and a Run button with confirmation. Run is only switched on where the exact API call is confirmed (the Studio sample has one); otherwise the panel says so and lists any run-like APIs it found.

## v1.44.0
- Link widgets at runtime: a "Link widgets" button in the view toolbar. While it is on, every chart or choice that can filter shows a dot: drag from it to the widgets it should filter, click a line to cut it. Each widget gets a "Filter bar" chip to follow or ignore the filter bar above. Kept in the person's browser per dashboard, not saved into the dashboard; "Reset links" goes back to the saved wiring.

## v1.43.5
- Filter bar: filters are added and removed only from the "Add or remove filters" menu; the per-filter x and repeated title above each dropdown are gone (the dropdown itself says "Any severity", "Any team"...).

## v1.43.4
- Published (read-only) dashboards: no Tour button or menu item (the tour is for the designer); the title band keeps its dark, frameless look (the saved layout was dropping its "no frame" flag, so a duplicate title bar showed and the text was clipped); the band is taller on compact dashboards.
- Tighter spacing: 6 px between widgets on compact dashboards (rows up to 32 px), 8 px otherwise (was 10).

## v1.43.3
- The "Add or remove filters" button is now an outlined blue button, readable on the light filter bar (it had inherited the dark toolbar's pale text).

## v1.43.2
- Filter bar: the runtime button is now "Add or remove filters" and sits right after the filters; every filter also has its own x to remove it.

## v1.43.1
- The "Incident & alert operations" template is now "Incident command center", so it is not confused with the incident-alert-dashboard.

## v1.43.0
- The filter bar has a "Fields" button: anyone viewing a dashboard can choose which filters (and the time range) show, at runtime. Kept in their browser per dashboard, with "Back to this dashboard's filters". In the designer it edits the saved bar. Shared checklist moved to FilterFields.tsx.

## v1.42.2
- Fixed TS7011 build errors in datahub.ts (metric list helpers lacked return types).

## v1.42.1
- Existing templates use the new fields and widgets: alert tables show "In an incident" and the runbook name (the Team column was empty on clusters without teams); Operations overview and Executive summary end with Application cards; Incident review and Incident desk with Incident insights; Team report with Runbook activity.

## v1.42.0
- Four new components in the palette: Incident insights (pick an incident; probable cause and similar earlier incidents), Runbook activity (recent runs of the runbooks on the alerts in view), People and teams (real users or groups from `getUsersAndGroups`, filters other widgets), Application cards (one card per business application, click to filter).
- Used in the templates: Application health (cards), Alert insights (pickers, runbook activity, incident insights), Incident & alert operations (an Incident insights tab).

## v1.41.0
- Three new templates: Application health, Metrics explorer, Alert insights.
- The filter bar can now use Applications fields (severity, type, criticality).

## v1.40.0
- Similar incidents: the incident panel lists earlier incidents like this one (title, match score, how it was resolved, link to the ticket), from `getSimilarIncidents`. Verified against your cluster: it searches the whole tenant when the application and group are empty.

## v1.39.0
- Incident insights: opening an incident in the drill panel now shows its probable cause (ranked alerts with score, severity score and class) and a count of the other insights on its alerts, read with `getStoryAlertsInsights`.

## v1.38.0
- New data source "Metric over time" (`getMetricManagerData`, `getMetricForecastData`): the last six hours of one metric of one resource, plus its forecast, as rows (value, expected, bounds, anomalous). A Metric group / Metric / Resource picker in the settings lists your tenant's real groups, metrics and resources. Incident & alert operations has a Metrics tab with a node CPU line chart.

## v1.37.0
- Runbook names and type: alerts now show the name of their runbook (read with `getRunbook`, one call per distinct runbook) and whether it is Automated, Manual or absent. Matches the real insight shape (`details.runbookId`, `isAutomated`).

## v1.36.0
- New data source "Applications" (`getImpactedApplications`): the business applications and services Concert Operate itself tracks, with alert counts by severity, open incidents, top incident priority and business criticality. Any widget can use it. Verified against a real response shape.
- Incident & alert operations: the word-matched service tiles are replaced by an Application health table and an Alerts by application chart from that source.
- Users and groups: the real response shape is now handled (groups by id, users by id).

## v1.35.0
- New alert fields, read from the toolkit's own alerts query: In an incident, Incidents, Business criticality, Entity type, Topology group, Anomaly, Seasonal, Golden signal, Log-analysis fixes, Causal group, Causal links, Signature, and Times seen (alerts with the same signature). The optional columns step down (all, then runbooks and event count, then none) if the server refuses them.
- Team and Owner filters now also list the real teams and people from `getUsersAndGroups`; the sample uses the same lists.
- Incident & alert operations: a Patterns tab (alerts with no incident, anomalies, seasonal, golden signals, recurring alerts) and incident, recurrence columns in the alert tables.

## v1.34.1
- Runbooks now come from the same GraphQL alerts query the toolkit uses (the `runbook` insight column, quoted as the toolkit does), not a separate REST call. New field "Event count". Both columns are optional: if the server rejects them the query is retried without.

## v1.34.0
- New field "Runbooks attached" on alerts and incidents. Inside Concert Operate the Designer reads it from the alerts REST call (`insights`), the same source the incident-alert-dashboard uses; if that call is unavailable the column stays empty. The Incident & alert operations template shows it.

## v1.33.1
- New field "Business service" on alerts and incidents (Banking & Payments, Microservices, Mainframe & MQ, Telecom, OpenShift, Database), worked out from the text like the incident-alert-dashboard. The Incident & alert operations template now has a service health tile row.

## v1.33.0
- New template "Incident & alert operations": the incident-alert-dashboard rebuilt from components (KPIs, four analytic cards, split pane, tabs, accordion, severity-tabbed alert stream).

## v1.32.0
- Templates are compact: a 28px row (40px on the wall display) instead of 48px, matching the incident dashboard. Tiles, charts and tables are about 40% smaller, so a template fits more on one screen.

## v1.31.4
- Fix: the template picker was see-through, so the dashboard behind it showed as a ghost image. It now has a solid background.

## v1.31.3
- Heatmap and radar charts say why they are empty when every row has the same value on one side (for example every alert has the same team), instead of drawing one meaningless band.

## v1.31.2
- Severity and priority colours in the remaining widgets: lollipop charts colour by category; progress bars and count badges that count one severity wear its colour; a number that counts one severity gets its colour as a stripe; the breakdown popover and the drill-through panel show severity dots and P-tags.

## v1.31.1
- Fix: a bar chart by severity with one series (for example when the team field is empty) drew every bar in one colour. The bars now take the category's colour, so Critical is red and Major orange. Carbon data tables and lists show severity with its colour dot and priority as a coloured P-tag too.

## v1.31.0
- Templates redesigned to look and work like real operations dashboards: a title band saying what the screen is for, headline figures with a plain-words caption ("Nobody has picked these up"), real Carbon charts instead of bar lists (alert volume by severity, severity by team), tighter sizes with no big empty boxes, a "Needs attention" queue (Critical and Major, not yet acknowledged), "Open incidents" that no longer count resolved ones, and plain search boxes instead of boxes inside boxes.
- Tables show what an operator reads: severity with a colour dot, priority as P1 to P5 tags, times as "21 Oct 07:52 · 14h ago", Yes/No for flags, numbers right-aligned, row highlight on hover.
- One severity colour convention everywhere: 0 Clear grey #8d8d8d, 1 Indeterminate purple #a56eff, 2 Information light blue #78a9ff, 3 Warning blue #4589ff, 4 Minor yellow #f1c21b, 5 Major orange #ff832b, 6 Critical red #da1e28, with dark text on yellow, orange, light blue and grey and white text on the rest. Incident priority has its own scale (P1 red #da1e28, P2 orange, P3 yellow, P4 blue, P5 grey #57606a). Every Designer chart, tag, tile, table cell and status indicator now takes its colour from this (`semanticColor` in rows.ts), including numeric severity and priority fields. Tag colour "auto" picks the severity or priority colour from what the tag counts; severity indicators use the same colours; neutral tiles (counts, totals) are dark grey so they are never mistaken for a severity.
- Incident & Alert dashboard: severity badges are solid palette colours (Major and Critical no longer look alike), priority badges follow the priority scale, the Critical and Major category bars use the severity colour, and the Netcool source is no longer red. Incident Atlas and Blast Radius: severity pills use the palette, and Critical stays #da1e28 in dark mode. Generated dashboards (Concert Workbench templates) use the palette too.
- Number widgets take a caption (Settings > Caption under the number).
- Text widgets understand `# Heading`, `- bullet` and paragraphs.

## v1.30.3
- Fix: published dashboards and shared layouts showed "Nothing here." in every tab, accordion section, split pane and container. Opening a layout gave each widget a new id but did not rename the `parent` links, so nested widgets lost their container. This affected every template that uses containers (Telco network, Investigation workspace, NOC command center, Service review, Triage workbench, Wall display, Team report, Operations hub).

## v1.30.2
- Fix: flow chart no longer fails when the two fields share values (it drew a loop); line, area and scatter charts show a gap, not zero, for an empty slot of an average or maximum; no stack overflow on very large row sets.

## v1.30.1
- Fix: the build failed on `carbon-charts.tsx` (TS7011, implicit any[] return type) under the toolkit's `noImplicitAny` setting. The Designer is now checked against the toolkit's own compiler options.

## v1.30.0
- Six more templates, all on live data, that show the Carbon components working together: Chart gallery: compare (8 charts), Chart gallery: patterns (9 charts incl. gauge and meter), Status board (tags, banners, status shapes and icons, progress bars, badge, popover, combo button, data table), Control room (dropdown, multi-select, radio, combo box, search and slider driving charts and a table), Incident desk (the same on incidents, with a structured list) and Severity scorecard (gauge, meter and status per severity).
- Treemap boxes now show their labels.

## v1.29.0
- Carbon Charts (17), in a new Charts group: simple, grouped and stacked bar, lollipop, line, area, stacked area, scatter, pie, donut, gauge, meter, heatmap, treemap, radar, word cloud and flow (alluvial). They read the same data as every other widget (filter bar, own condition, filters from other widgets), take Group by, Series by and Time field under Data, and send a filter when clicked (or open the drill-through). Selected values stay highlighted.
- Status shape, status icon, count badge, breakdown popover and combo button. Shape, icon, gauge and meter share a warning / critical threshold rule; shape and icon can also show the worst severity. The popover lists groups and filters on click; the combo button can set or clear filters or open an address.
- New setting `seriesBy`. Template 13, Insight board, uses all of them wired together.
- Fix: the wire layer re-rendered in a loop when no wire was showing. A chart that cannot draw now reports it in its own box instead of breaking the dashboard.

## v1.28.0
- Filter bar. Toolbar > Filters: show a filter bar, pick its fields (alerts and incidents), a time range (alerts by first or last occurrence; incidents by created), the range it opens on and auto-refresh. Selected values show as removable chips with Clear all. Saved with the dashboard and kept by Studio Save / Publish.
- Widget setting "Follows the dashboard filter bar" (on by default) lets one widget opt out.
- Templates: all twelve turn on a filter bar; Alert triage and NOC command center no longer carry their own dropdowns.

## v1.27.0
- Template 12: Operations hub. Two levels of containment: tabs holding an accordion (health), a split pane with a search box (investigate) and an accordion (reports).
- Accordion content uses the full width (Carbon left a quarter empty).

## v1.26.1
- The Designer opens in Edit mode instead of Preview. Picking a template switches to Edit.

## v1.26.0
- Advanced templates: NOC command center (filter toolbar + split pane + tabs + accordion), Service review (tabs holding a split pane and accordion), Triage workbench (vertical split, tabs of work queues), Wall display (self-advancing carousel), Team report (accordion). The start screen shows nested layouts in its thumbnails.
- Accordion: "Start with every section open".

## v1.25.0
- Studio can open the template picker and the tour from its own toolbar (Templates, Tour next to Save).

## v1.24.2
- A Tour button in the top bar (left of Refresh) starts the guided tour at any time.

## v1.24.1
- Templates button in the toolbar (next to Add widget): start from a template on any dashboard, not only an empty one. It replaces the canvas; Undo (Ctrl+Z) restores it.

## v1.24.0
- Start screen on an empty dashboard: six starter templates built from ordinary widgets (wired, coloured, with details panels), or start blank. The Telco template needs the Telco Causal Mesh tile.
- Guided tour: spotlights the library, canvas, settings, Wire and Preview. Runs on first visit; reopen from the ⋯ menu.

## v1.23.0
- Colours. In a widget's settings, set its background and text colour, or pick one of six ready-made pairs. Reset goes back to the theme. Saved with the dashboard.

## v1.22.1
- Edit mode: tabs, accordion headings and carousel arrows are clickable, so you can pick the tab or slide to drop onto. Accordion sections are open while editing.

## v1.22.0
- Scroll pane (vertical, horizontal or both), Carousel (slides with arrows, dots and optional auto-advance) and Toolbar (a strip for inputs). Each holds widgets: drag them in, or use Place in.
- Accordion: "One section open at a time".

## v1.21.0
- Wire menu. In Wire mode, click a line (or finish a new one) to see its type (Filter: what is picked, Value: what is typed), change the comparison of a value wire, or cut it. The Wire mode hint now explains the line colours.

## v1.20.0
- Drag and drop between panels. Drag a library item onto the canvas or into a tab, accordion section, split pane or container (clicking still adds it). Drag any widget by its title bar into another panel or back to the dashboard; the target outlines in blue and the widget lands where you let go.
- Widgets inside a panel can now be grabbed and moved while editing.

## v1.19.0
- Drill-through. In a chart, table or KPI, set "When clicked" to show the rows behind it (side panel with search and all fields) or open an address with {field} tokens (https only, optional new tab).
- Dashboard addresses accept ?db=field:value;field:value to open with filters applied.

## v1.18.0
- Value inputs. Text input, Search, Number input, Slider, Toggle, Checkbox, Dropdown, Select, Combo box, Radio buttons and Content switcher now hold a value and can filter other widgets by it: turn on "Use this value as a filter" in the input's settings (data, field, and how to compare: is, contains, at least ...), then wire it to widgets in Wire mode (purple lines). Typing or choosing filters them live; lines pulse while the input has a value.
- New comparison "contains" (case-insensitive) in every condition.

## v1.17.0
- Visual wiring. **Wire** button (or `W`) in the toolbar: every widget that can send selections gets a port; drag from it to a widget to connect them, click a line to cut it. Dashed lines are automatic (every widget on the same data); the first cut or drag makes a widget's wiring explicit, and "Make … automatic again" undoes that.
- Lines are drawn over the dashboard as curves that leave the side facing the target. Hover or select a widget to see its lines; while a widget has something selected its lines pulse and a dot travels to the widgets it filters, in Edit and Preview. A line to a widget inside a hidden tab ends at the container that is showing, faded.
- The Wiring tab and the settings section stay as the keyboard-friendly list.

## v1.16.0
- Widgets inside widgets. New **Container** widget, and Tabs, Accordion and Split pane panels can hold widgets (new default: "Widgets (place them here)"). Each panel is its own 12-column grid: use "Add a widget here…" in the panel, drag, resize and wire widgets inside it like any other, or move any widget with "Place in" in its settings. Containers can nest three deep; removing or duplicating a container includes what is inside it. Saved as `parent` ("<containerId>#<panel>") on each widget.
- Wiring. New **Wiring** tab in the left dock and a Wiring section in settings: for a bar chart, donut or chooser, pick which widgets its selections reach (default: every widget on the same data). The widgets it feeds are outlined while it is selected. Saved as `sendTo`.

## v1.15.0
- Tabs, Accordion and Split pane: choose what goes in each tab, section or panel from a list (text, or any of your dashboards, or one section of it) instead of typing `tile:id#part`. Add and remove tabs and sections with buttons.
- Studio's embedded Designer has the Preview / Edit switch again.

## v1.14.0
- Concert Workbench now hosts this Designer itself (new `authoring` prop): the Design tab in Studio is this editor, not a separate copy, so it looks and behaves the same as in Concert Operate. In that mode the host owns the dashboard (no browser storage, no dashboard switcher or Preview / Edit switch), reports every change and selection, and tiles get a "Show" menu to pick one section of an embedded dashboard. Nothing changes in Concert Operate.

## v1.13.0
- New editing workbench. Dark toolbar with the dashboard switcher, undo and redo, a Preview / Edit switch and a More menu (export, import, shared layout). Left dock: a searchable library of every widget (press `/`) and a Layers list. Right dock: the settings of the selected widget, or the shortcut list when nothing is selected. Status bar: save state, widget count and the selected widget's position.
- The canvas is an artboard on a dotted workspace. A selected widget shows a name and size tag and a square resize handle; its Duplicate and Remove buttons appear on hover. Widget types have their own icons, tinted by kind (data, Carbon, dashboard, content).
- Shortcuts while editing: Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo, Ctrl+D duplicate, Del remove, Esc deselect, `/` search.
- Colors follow Carbon's theme tokens; the toolbar and status bar stay dark.
- Hardens two Carbon prop types in `carbon-catalog.tsx` against stricter typings.

## v1.12.0
- New widget "Split pane (resizable)": two panels with a draggable divider (pointer, arrow keys, double-click to reset; the ratio is remembered). Each panel holds text or a dashboard section (`tile:id#part`).

## v1.11.1
- Fixes the production build: the Clickable tile no longer passes `target`/`rel` as typed props (Carbon's types reject them).

## v1.11.0
- Carbon React components as widgets: 57 of them (tabs, accordion, data table, structured list, tags, progress, notifications, buttons, menus, tooltips, modal, dropdown, select, combo box, multi-select, radio buttons, content switcher, toggle, inputs, pickers and more), each with its own settings form. Choosers can list the values of a field of the live data and filter the other widgets; Tag, Progress bar and the notifications can show a live measure; Data table and Structured list show the rows. Tabs, Accordion and Content switcher can hold a whole dashboard or one section (`tile:id#part`).
- `carbon-specs.ts` is the plain-data catalog (names, settings); Studio's Layout Editor reads it through `designer-core.js`.

## v1.10.0
- Settings of an existing dashboard can be edited inside Concert Operate: its options, and (once an administrator has made it configurable in Studio) the values written in its code, as typed forms in the Settings panel. Studio writes `settings-schema.ts` at build time.

## v1.9.0
- Tiles carry `settings` (values written in a dashboard's code, edited in the Layout Editor) and richer `props` (lists, records, up to 24 keys).

## v1.8.0
- Version aligned with Concert Workbench v1.13.0. No functional change to the Designer.

## v1.7.0
- "Only rows where" takes an operator (=, !=, <, <=, >, >=; numeric when both sides are numbers) and can carry extra AND conditions (`config.also`), so a widget can express filters like `priority <= 2 and state = open`.

## v1.6.0
- Widgets can float on top of others (`config.overlay`): they ignore collisions and gap-closing, so an image can sit on a dashboard tile.
- Dashboards can set their row height (`rowH`, 24 to 96 px, default 48).

## v1.5.0
- Version aligned with Concert Workbench v1.5.0. No functional change to the Designer.

## v1.4.0
- The built-in tile list no longer includes ARK, ARK Dashboard and 5G RAN Slicing Demo (those dashboards were removed, and a tile for a missing panel breaks the build). Any other panel in `src/panels/` still appears as a tile through `tiles-extra.ts`.
- Tiles can hide their frame and title bar while viewing (`config.chromeless`), because a section of a dashboard already has its own heading. Editing still shows them. Tiles can now be as small as 2 x 2 grid units (was 3 x 3).
- Tiles accept options: `config.props` (up to 8 flat string / number / boolean values) is passed to the embedded panel as props. Concert Workbench uses it to place one section of a dashboard in its own tile (for example `{ part: 'services' }` on the Incident & Alert dashboard).

## v1.3.1
- Fix: the build failed with TS2322 in `Tiles.tsx` when the toolkit's tsconfig uses `module: NodeNext` (TypeScript then types `import()` of a panel as the module object, not its default export). The tile loaders now state the type explicitly. No behaviour change.

## v1.3.0
- Image widget: PNG, JPEG, GIF, WebP, SVG or BMP kept inside the dashboard as a data URI (max 3 MB), with description and fit. TIFF must be converted first (Concert Workbench's Layout Editor converts it).

## v1.2.1
- Tile widgets keep an optional `part` note (what the tile stands in for after Studio split a dashboard into widgets).

## v1.2.0
- `layout` prop: a fixed, read-only layout published from Concert Workbench (its own page in the sidebar). It never reads or writes the browser's saved dashboards.
- `tiles-extra.ts` (generated by Studio): any other panel in `src/panels/` can be embedded as a tile, not just the built-in 14.

## v1.1.0
- Shared default layout: `default-layout.ts` (written by Concert Workbench's Layout Editor) is used as the first dashboard on a browser's first visit, and a "Shared layout" button adds a copy of it at any time.

## v1.0.0
- First release: drag / resize grid, six data widgets, 14 embeddable existing panels, per-widget query binding, click-to-filter linking, undo / redo, several dashboards, browser autosave, JSON export / import.
