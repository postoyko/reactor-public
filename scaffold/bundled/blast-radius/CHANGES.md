# Blast Radius changes

## v1.14.0
- Toolbar is now a compact menu bar: Layout and Actions menus plus small zoom buttons.

## v1.13.1
- Smaller KPI tiles and title.

## v1.13.0
- Graph and an alert table now share one container: graph on top, alert table below, movable divider (drag, arrow keys, double-click resets; remembered). The table follows the selection (resource, incident, or all open alerts), shows alert groups with expanders, and "Showing: N alerts, M groups". Props `alertTable` (default on), `syncAlertViewer` (default off now).

## v1.12.2
- Compact layout (the CSS for it was missing in 1.12.1): on /blast-radius-alerts the left column sets the height, the right column scrolls inside it, so the alertViewer sits right under the replay bar.

## v1.12.1
- Prop `fillWindow` (false on /blast-radius-alerts): the panel no longer stretches to the window height, so the alertViewer sits right under the replay bar; the right column stays and its stream scrolls.

## v1.12.0
- Alert viewer hook: selecting a resource or incident sets the page route (filtername / filterwhereclause) so the alertViewer panel filters to it; clearing the selection clears it. Prop `syncAlertViewer` (default on). Studio adds a route /blast-radius-alerts with the viewer below.

## v1.11.0
- Alert groups from the alert JSON (causal union / scope policy / temporal / topology insight ids), selector with group counts; the stream tab "By group" now shows these alert groups.
- Alert query defaults to Last 24 hrs (24 hrs / 7 days / All time); Saved view picker (getFilters), filter shown.


## v1.10.1
- Severity colours use the Concert Operate / Netcool palette (info blue, indeterminate purple, clear grey) instead of green for low severities.
## v1.10.0
- Raw JSON now uses Studio's new **Topology proxy** (default `http://127.0.0.1:4000/api/topology`): after `getTopologyResource`, the entity is found through the topology REST API (`uniqueId:` then `name=` filters), its full resource JSON is shown by `_id`, plus a **1-hop neighbourhood** pane (`/topology/{_id}`, with status severity). Pass `topologyApiUrl=""` to turn the REST lookups off.

## v1.9.3
- Raw JSON, from reading the topology Swagger and IBM docs (see `dashboards/TOPOLOGY-API.md`): `_id` and `uniqueId` are different ids, so the tab now tries every id in the alert's topology insight (`_id`/`resourceId`/`id`, then `uniqueId`) with `getTopologyResource` and lists what it tried. The same-origin URL guesses were removed: the topology REST service has its own route and login, so it is used only when `topologyApiUrl` is set (`_filter=uniqueId:<v>`, then `name=<n>`, then `/resources/{_id}`).

## v1.9.2
- Raw JSON: when no alert carries the ASM unique id, the resource is looked up by name in the topology REST API (`GET /resources?_filter=name=...`, tenant in `X-TenantID`). Common routes are tried; set `topologyApiUrl` (base ending `/1.0/topology`) to be exact. If it fails, the tab lists every URL tried with its HTTP status.

## v1.9.1
- Raw JSON: the topology entity is now looked up by its ASM unique id (read from the alert's topology insight, or from any alert of that resource) instead of the resource name, which the topology service answers with 404. If no alert carries the id, the tab says so.

## v1.9.0
- Deep dive has a **Raw JSON** tab: the selected alert pulled back from the alerts API and the topology entity pulled back from the topology API, each pretty-printed with Copy JSON. Sample data shows the panel's own copy.

## v1.8.0
- New layout **Combined**: one Sankey for all incidents. Shared resources are drawn once (column = deepest hop from any cause), ribbons are tinted per incident with a legend in the header, and selecting an incident fades the others. Resources outside incidents sit in a grid beside it (or hide them with Hide non-incident). Fit shows the whole graph.

## v1.7.1
- Toolbar toggle **Hide / Show non-incident** (also in the right-click menu) hides every resource that is not part of an incident, leaving only the incident tiles.

## v1.7.0
- New layout **Lineage** (Sankey): inside each incident tile, resources are columns by hops from the cause, bars are as tall as their alert count, and ribbons show how the fault flows downstream (coloured by severity; amber = alert group). Choose it in the layout bar, the right-click menu, or `layout="sankey"`.

## v1.6.0
- Alert groups are now discovered from the live alert data: any returned column or alert insight that points at other alert ids (parent/child/group/members) is detected, classified by name and shape, and used. A toolbar chip shows how many links were found and from which field; hover for the columns seen. Columns/insight types are also logged once to the browser console. `groupColumns` remains as a manual override.
- Asks the alerts API for `parentId`, `childIds`, `groupId` once; falls back silently if refused.

## v1.0.0
- First release: self-arranging graph of affected resources, incident correlation card, alert stream (raw / correlated), one-hour replay, sample data.

## v1.1.0
- IBM Carbon look and feel; colours follow the host Carbon theme.
- Graph: one lane per incident (cause on the left, effects in columns by hops), then a grid for resources outside any incident. Larger world with pan (scroll or drag), zoom (Ctrl/⌘ + scroll, buttons), fit, widen, and a jump to the selected incident.

## v1.2.0
- Right-click a resource: show its alerts, focus what it affects, focus the path from the cause, collapse/expand its effects, open the incident in Concert Operate, your own links (`nodeLinks`), copy name, copy details for a ticket. Right-click empty canvas: layout, collapse/expand all, reset dragged positions.
- Four layouts: Lanes, Tree, Radial, Grid (prop `layout` sets the start).
- Collapsible resources: − / + badge on every resource that has effects; "+N" shows how many are hidden. Collapse / Expand all in the toolbar.
- Alert groups (parent alert with child alerts): the child's resource hangs under the parent's resource with a dotted blue link and a ×N badge; the alert stream nests children under the parent (▸ group · N child alerts).
  The parent column name is installation specific and UNVERIFIED: set `groupColumns` (e.g. ['parentId']) to request it. Parent/child columns already in the alert query are also read.
- Toolbar and legend moved out of the canvas (no more overlap).

## v1.3.0
- "New version available" banner: the panel asks Concert Workbench (default http://127.0.0.1:4000/api/panel-version/blast-radius, prop `updateUrl`, '' turns it off) which version is newest and shows a banner when it is newer than the running one. Silent when Studio is not running.
- Graph, side panel, feeds and replay timeline resize with the window (side panel is 28% of the width, 300–480 px).

## v1.3.1
- Fix: TypeScript build error (collapsed state typed as Set<number> but holds names). The whole panel now passes `tsc --strict` against the React types.

## v1.3.2
- Page fills the window height: graph and replay grow, the alert stream scrolls inside the remaining height.
- Selecting an incident tab no longer dims the other incidents (only selecting a resource or a focus does); dimmed resources are at 50% instead of 30%.
- Resources with only information-level alerts show no glow; the legend now says so.
- Taller lane header so the "likely cause" label no longer overlaps the lane subtitle; lanes are at least 400 wide so long titles fit; fit view can zoom to 140%.

## v1.3.3
- Clicking an incident's lane in the graph (its title or any empty part of it) makes it the selected incident: the correlation card switches to it and its lane gets a blue outline.

## v1.3.4
- Text and node sizes behave on zoom: on screen they stay between a readable minimum and a maximum instead of shrinking to nothing or growing huge. Resource names appear from 40% zoom (at least 8 px, cut to fit the column); "LIKELY CAUSE" labels from 40%; lane titles are cut to the lane width.

## v1.4.0
- More lanes on the surface: lanes are packed side by side and wrap into rows to fit the window, so many incidents are visible at once.
- Selecting an incident (its tab or a click on its lane) enlarges that lane to fill the view and softens the other lanes; "… · show all ✕" (or Fit, or double-click) goes back to the overview.

## v1.4.1
- Fills the window height by measuring the space below the panel's top edge (the host page does not give the panel a height). Re-measured on resize and every 1.5 s.

## v1.5.0
- Same resource tools as the Telco Causal Mesh. Right-click a resource (or double-click it): "Fly-To & Focus Node", "Open Deep Dive Diagnostics", "View in Netcool / WebGUI" (when `netcoolWebGuiUrl` is set) and "Open Remediation Console". The selected-resource card has Deep dive and Remediation buttons.
- Deep Dive drawer: alert timeline (precursors, alert groups), topology service metadata and 1-hop neighbours with Traverse, golden-signal metrics (`metricQueries`), runbook policies. Uses getTopologyResource, getMetricManagerData and getRunbooksAndPolicy like the mesh does.
- Remediation console: calls `onExecuteRemediation` when the host provides one, otherwise a clearly labelled simulation that executes nothing.
- Alerts now carry the topology unique id, entity types and runbook insights when the alert query returns them.
