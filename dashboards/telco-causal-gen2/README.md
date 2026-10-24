# Telco Causal Mesh (fixed copy)

A 3D view of alerts and incidents from IBM Cloud Pak for AIOps: resources are nodes in four estimated tiers
(core, transport, RAN, other), incidents draw causal links to their probable cause, and optional topology links
add SPOF, blast-island and route analysis. Five insight views (Sankey, Triage Insights, Sunburst/Treemap, Alert Timeline, Link Explorer) sit under the
topology, with an incident rail on the left and an inspector on the right. Also available as a 2D canvas.

This copy replaces the earlier version that read `process.env.DASHBOARD_API_KEY` and called the REST API directly.
It reads through the toolkit's `useQuery` instead, so it needs no API key and works with the signed-in session.

## Classification module (layers)
`classification/` decides which layer a resource sits on. Pick the scheme with the **Telco | OSI | OPS** switch in the topology toolbar (also in **Layers > Classification**), or start with `layerScheme`.

| Scheme | Layers |
| --- | --- |
| `telco` (default) | 5G Core, IP Transport, RAN Edge, Subscribers & Slices |
| `osi` | Abstraction, L7 Application, L6 Presentation, L5 Session, L4 Transport, L3 Network, L2 Data Link, L1 Physical, Unclassified |
| `ops` | Business User, Application Services, Platform Runtime, Network Fabric, Physical Infrastructure, Unclassified |

For OSI and OPS a resource is placed by its entity type first, then its name, then the alert text. Entity types come from the alert's topology insight, or, when that is empty, from the live topology service (`getTopologyResource`, asked once per resource). The type is turned into a layer by `classification/entity-layers.ts` (generated from `entity-layer-mappings.js`); names and text are searched with the canonical types and patterns in `classification/seed.ts`. Anything that matches nothing goes to Unclassified, and the legend shows how each resource was decided. To correct a placement, add the type to `LAYER_OVERRIDES` in `classification/types-map.ts`.

## Files

| File | Purpose |
| --- | --- |
| `telco-causal-gen2.panel.ts` | Panel. Whole dashboard: `useQuery('getAlerts')` + `useQuery('getStories')`. With `part`: the shared feed |
| `TelcoCausalMeshGen2Dashboard.tsx` | The component: picks the full or section view (props-driven, no network calls of its own) |
| `types.ts`, `MeshContext.tsx` | Props, shared types, and the context that feeds the sections |
| `hooks/` | 17 hooks composed by `useMeshController` (graph, analysis, replay, selection, remediation, 3D scene ...) |
| `sections/` | One component per region, plus `overlays/` (drawer, menus, modals) |
| `views/` | `FullView` (the whole page) and `PartView` (one region) |
| `session/MeshSession.ts` | State shared by section tiles, and the host election |
| `feed.ts` | One shared alert and incident query for all tiles on a page |
| `TopologyCanvas2D.tsx` | The 2D SVG view (tiers, hop rings, pods). Props-driven; shares nodes, links, selection and lens with the 3D scene |
| `logic.ts` | Pure logic: adapters, graph building, betweenness, SPOF, shortest path, probe analysis, and the three 2D layouts |
| `logic.test.ts` | Jest tests for `logic.ts` (including the 2D layouts) |
| `d3-sankey.d.ts` | Type stub (the package ships none and the toolkit compiles with `noImplicitAny`) |
| `telco-causal-gen2.scss` | Original styles plus a block at the end for the 2D canvas |

## 3D / 2D view

The topology card has a **View: 3D | 2D** switch. Both views draw the same nodes and links and share selection,
the Lens colours, strata toggles, ASM hops, incident / probe / Sankey focus, route tracing, the link modal, the
right-click menu and the deep-dive drawer. Switching to 2D frees the WebGL renderer; switching back rebuilds the
scene from the cached node positions. Without WebGL the 2D view is used automatically.

2D layouts (buttons inside the canvas): **Tiers** (estimated tier per row, core at the top), **Radial** (hop rings
around the selected node; nodes with no path to it sit on a ring labelled "Not linked to centre"), **Pods** (boxes per
topology group name from topology insights, or per estimated tier when none is supplied). Drag to pan, wheel to
zoom, double-click a card for the deep dive. Only causal links have arrowheads; physical adjacency is undirected.

Paths follow the original layout: the panel imports `../components/telco-causal-gen2/...`, so put
`telco-causal-gen2.panel.ts` in `src/panels/` and the other files in `src/components/telco-causal-gen2/`.
Add a route and registration the same way as for the other panels.

## Route state (all optional)

| Prop | Meaning |
| --- | --- |
| `initialView` | `'3d'` (default) or `'2d'`: which topology view opens first. |
| `layerScheme` | `'telco'` (default), `'osi'` or `'ops'`: which layer scheme classifies the resources at start. |
| `refreshSeconds` | Poll both queries every N seconds. Default 0 (manual "Refresh Mesh"). |
| `topologyLinks` | `[{ source, target, relType?, latencyMs? }]` using resource names as they appear on alerts. |
| `subscribersByResource` | `{ "<resource>": <count> }`. Only used to size blast islands. |
| `netcoolWebGuiUrl` | Adds "View in Netcool / WebGUI" to the node menu. |
| `includeEventCount` | Also requests an `eventCount` column. **Unverified column name**: if the query fails, leave it off. |

The component also takes `onExecuteRemediation(alert) => Promise<{ ok, message }>` as a prop. If you wrap it in your
own panel you can connect a real remediation call there.

## What is real, and what shows "n/a"

Real, computed from the loaded data: node and link counts, severities, probable-cause ranks (from incident and alert
insights), incident causal links, recurring problems, correlation gaps, root-cause counts and per-probe counts (counted from loaded alerts and incidents), ingest velocity,
source entropy, severity ratio, runbook policies attached to alerts.

Estimated: the **tier** of each resource. It comes from topology entity types when present, otherwise from whole-word
matches on the resource name and alert text. It is a heuristic and the UI says "est." where it matters.

Shown as **n/a** until you supply the data:

| Figure | Needs |
| --- | --- |
| SPOFs, blast island, route tracing, betweenness | `topologyLinks` (real adjacencies). Without them nothing is invented. |
| Link latency | `latencyMs` on each supplied link. A path shows latency only if every link has one. |
| Subscribers at risk | `subscribersByResource` |
| Deduplication ratio | the `eventCount` column |
| Interface, IP, MAC, firmware, per-resource metrics | `getTopologyResource` / `getMetricManagerData` (not wired) |

The **Demo links** button draws invented links between tiers so the layout has something to show. It is off by default,
labelled, and never feeds the SPOF or route analysis in a way you should trust.

## Remediation

There is no remediation API in the toolkit's `useQuery` list, so the console runs a clearly labelled **simulation**:
it prints what it would do and changes nothing. Pass `onExecuteRemediation` to run something real; its result is
reported as returned.

## Checks that were run

- `tsc` (toolkit settings, `noImplicitAny`): no errors in these files. `eslint`: clean.
- `jest`: 22 passed.
- Chromium (SwiftShader WebGL) with the bundle built **without** any `process.env` define: normal data, missing
  policy id, alert without a resource name, null incident title, no WebGL, query error, no topology, remediation
  simulation, closing the console mid-run, unmount, GPU context loss and restore, React StrictMode, and the toolkit's
  own mock payloads through the adapters.
- Not tested: a real cluster, real topology data, and any `eventCount` column.

## Route state added in v2
- `tenantId`: tenant for the drawer queries. If omitted, the toolkit's sample tenant is used, so set it.
- `metricQueries`: `[{ "group": "...", "metric": "...", "label": "Latency" }]`. Find the names with `getMetricGroups` / `getMetrics`.

**Unverified:** the response shapes of `getTopologyResource`, `getMetricManagerData`, `getRunbooksAndPolicy` and `getStoryAlertsInsights` could not be checked without a cluster. If a shape differs, the drawer shows "No data" rather than invented values; adjust the adapters in `logic.ts`.

## Insight views

The panel under the topology switches between five views. All are computed from the alerts, incidents and links
the panel already loaded. Nothing is generated; when the data is missing the view says so.

| View | What it shows | Needs |
| --- | --- | --- |
| Sankey Lineage | Probes -> tiers (est.) -> incidents -> runbook policies. Click a node to focus the mesh. | alerts |
| Triage Insights | Four tabs. **Recurring problems**: alerts grouped by wording (click a row to show only those resources). **Correlation gaps**: alerts in no incident, unassigned incidents, incidents without probable cause, runbook coverage. **Root causes**: resources most often named as probable cause. **Sources**: alerts per probe by severity (click to filter). | alerts, incidents |
| Sunburst / Treemap | Tier (est.) -> topology group -> resource. Size = alert count, colour = worst severity (pastel). Click to zoom, click a resource to select it. | alerts |
| Alert Timeline | One lane per resource grouped by tier, one bar per alert, a diamond for the probe that saw it first. Drag across the axis to filter the mesh to that window; click to clear. | occurrence times |
| Link Explorer | Sankey (default) or Matrix of the links between resources, filter All / Causal / Topology. Only linked resources are drawn; hidden unlinked resources and links skipped to avoid loops are counted. | links |

Also: an incident mini-graph on each incident card, and the **replay bar** (*Incident timeline* reveals resources in
order of first alert; *Blast shockwave* expands hop by hop from the selected resource over topology links). Severe
resources pulse in 3D (off with `prefers-reduced-motion`). Active filters show as chips above the topology.

Tiers are estimated and labelled "(est.)" everywhere they appear.

Files: `SunburstTreemap.tsx`, `AlertSwimlane.tsx`, `LinkExplorer.tsx`, `LinkFlow.tsx`, `AdjacencyMatrix.tsx`,
`TriageInsights.tsx`, `IncidentMiniGraph.tsx`, `ReplayBar.tsx`, `TopologyToolbar.tsx`, `Overlay.tsx`, `insight-utils.ts`, `version.ts`.

## Control bar

The topology panel's buttons are one collapsible bar (`TopologyToolbar.tsx`): View (3D | 2D), Lens, Layers (strata + ASM hops),
Layout and Camera (3D only), Trace route, Replay and Options (demo links). Active filters appear as chips under the bar.
"Controls" collapses it to a one-line summary; the choice is remembered in this browser. The replay bar only appears when Replay is on.

## Page layout

Three columns under a slim header (live counts, version tag, no KPI tiles):

- **Left rail, Incident triage:** the war room as a vertical list (up to 12 incidents, each with its mini-graph).
- **Centre:** the topology (control bar + 3D/2D canvas, now sized to the window height) with the insight views (Sankey, Triage Insights, Sunburst/Treemap, Alert Timeline, Link Explorer) beneath it.
- **Right rail, Inspector:** focused alarms, blast radius, ingest velocity, remediation.

"Incidents" and "Inspector" in the header hide or show the rails (remembered in this browser). Below 1100px wide the columns stack with the topology first.


## Section tiles (`part`)
Set the `part` prop to show one region: `header`, `incidents`, `topology`, `insights`, `alarms`, `blast`, `ingest` or `remediation`. In Concert Workbench use the Layout Editor and **Decompose**; it places all eight with live data and hides the frame.

* Tiles on one page act as one dashboard: pick an incident in the list and the topology, alarms and blast radius follow.
* They share one query pair and one refresh timer (the shortest `refreshSeconds` among them wins).
* Drawers, menus and dialogs are drawn by one tile only, so there are never duplicates.
* Lists (`topologyLinks`, `metricQueries`, `subscribersByResource`) cannot be set from a tile, so SPOF, blast-island and route features are unavailable there. Use the whole dashboard for those.

## Resizable layout
The whole dashboard has dividers you can drag: between the topology and the insight views (centre, 50:50 to start), on either side of the centre column (rail widths), and between the cards of the inspector (their heights). Arrow keys move a focused divider by 24 px; double-click (or Home) restores the default. Sizes are kept in this browser (`telco-causal-mesh:layout`). Section tiles are sized by the Designer instead.
