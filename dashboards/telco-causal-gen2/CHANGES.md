# What changed from the original

## v6.6.1
- A tile that asks for a section the dashboard does not have now shows a "Section not found" notice instead of the whole dashboard.


## v6.6.0
- Severity colours now match Concert Operate / Netcool (0 grey, 1 purple, 2 light blue, 3 blue, 4 yellow, 5 orange, 6 red) in the 3D lens, 2D mesh, insight charts, legends, alarms list, Deep Dive and incident priority chips. Info/clear is no longer green. One palette in `severity.ts`.
## v6.5.0
- Raw JSON now uses Studio's new **Topology proxy** (default `http://127.0.0.1:4000/api/topology`): after `getTopologyResource`, the entity is found through the topology REST API (`uniqueId:` then `name=` filters), its full resource JSON is shown by `_id`, plus a **1-hop neighbourhood** pane (`/topology/{_id}`, with status severity). Pass `topologyApiUrl=""` to turn the REST lookups off.

## v6.4.3
- Raw JSON, from reading the topology Swagger and IBM docs (see `dashboards/TOPOLOGY-API.md`): `_id` and `uniqueId` are different ids, so the tab now tries every id in the alert's topology insight (`_id`/`resourceId`/`id`, then `uniqueId`) with `getTopologyResource` and lists what it tried. The same-origin URL guesses were removed: the topology REST service has its own route and login, so it is used only when `topologyApiUrl` is set (`_filter=uniqueId:<v>`, then `name=<n>`, then `/resources/{_id}`).

## v6.4.2
- Raw JSON: when no alert carries the ASM unique id, the resource is looked up by name in the topology REST API (`GET /resources?_filter=name=...`, tenant in `X-TenantID`). Common routes are tried; set `topologyApiUrl` (base ending `/1.0/topology`) to be exact. If it fails, the tab lists every URL tried with its HTTP status.

## v6.4.1
- Raw JSON: the topology entity is now looked up by its ASM unique id (read from the alert's topology insight) instead of the resource name, which gave a 404. If no alert carries the id, the tab says so.

## v6.4.0: Raw JSON tab in the deep dive
A new **Raw JSON** tab pulls the selected alert back from the alerts API and pretty-prints it (JSON inside cells, such as insights, is opened up), and pulls the topology entity back from the topology API (`getTopologyResource`) and pretty-prints that. Each has Copy JSON. With sample data, or no query API, it shows the panel's own copy of the alert.

## v6.3.0: open an incident in Concert Operate
Each incident card in Incident triage has an **Open in Concert Operate** link that opens that incident's page in a new tab (same address Blast Radius uses). Clicking it does not select the incident.

## v6.2.3: narrower layer legend
The legend in the 3D view is capped at 300 px wide (it grew with its longest line) and its notes are shorter. The topology lookup message is cut to one line, with the full text on hover.

## v6.2.2: a visible Telco / OSI / OPS switch, and better placement of live resources
| Area | Change |
| --- | --- |
| Switch | The topology toolbar has a **Telco | OSI | OPS** switch next to Lens. Choosing OSI or OPS also colours the nodes by layer. The same choice is still in the Layers menu, which lists the layers of the chosen scheme. |
| Live names | Live resources often have vendor or site codes as names (`ALCATEL5520AMS`, `RING_1080`) and nothing the patterns recognise. For OSI and OPS, all the alerts of a resource are now read (not only the first), together with the alert type, and a short list of wording hints (`TEXT_HINTS` in `classification/types-map.ts`: SDH or loss of signal, link or port, BGP, pod, queue, database, API call rate ...) turns what they say into an entity type. The sender is not used: it names the monitoring tool, not the entity. |
| Limit | The hints are my heuristics, not part of the TSA seed or your mappings. Check the placements against your network and edit or remove any rule that is wrong. |
| Tests | 25 module tests (new: wording hints). Telco output is identical to v6.2.1 apart from the new switch. |

## v6.2.1: real entity-layer mappings and live entity types
The OSI and OPS layers now come from your `entity-layer-mappings.js`, and the types they need are read from the live topology rather than guessed.

| Area | Change |
| --- | --- |
| Mappings | `classification/entity-layers.ts` is generated from `entity-layer-mappings.js` (219 entity types, each on one OSI and one OPS layer). It replaces the OSI/OPS sets I had reconstructed. The OPS sets are now exactly yours (for example `service` and `fqdn` are Platform Runtime, `tcpudpport` is Network Fabric). Regenerate with `node classification/gen-entity-layers.cjs <path to mappings>`. |
| OSI layers | Nine planes: Abstraction (your `ABSTRACT` set: organisations, tenants, tickets, locations ...), L7 down to L1, and Unclassified. L3 is the core layer for SPOF and blast analysis. |
| Live entity types | For the OSI and OPS schemes, a resource whose alerts carry no entity type is looked up in the topology service with `getTopologyResource` (the query the inspector already uses), once per resource per session, six at a time, up to 300 per refresh. The graph is rebuilt with what comes back. The Telco scheme does not ask. |
| Whole-resource decision | OSI/OPS now use every alert of a resource plus the live types, not only its first alert. Telco keeps its original first-alert decision. |
| Legend | Shows how each resource was decided (entity type, name, alert text, unclassified), where the types came from (alerts, topology, none) and the result of the topology lookup. |
| Names and text | Search stays the TSA patterns first. Whole-word matching of entity-type words in names and alert text is limited to words that are not everyday English (`log`, `task`, `node` and about 100 more are excluded). |
| Source gap | `MissingFromTopology` is in `ENTITY_TYPES` but in no OSI or OPS set in the source file, so it lands in Unclassified. |
| Tests | 23 module tests (every entity type lands where the mappings say, overrides, live types in the graph); 44 logic, 27 tile and 14 feed checks unchanged; Telco renders as before. |
| Limit | The topology lookup was tested against a simulated `getTopologyResource`, not a live tenant. If the real query returns another shape, or no entity types, the legend says so and resources stay on name/text matching. |

## v6.2.0: classification module and the Layers menu
Telco stays the default and renders exactly as before (same 30-step click-through as v6.1.0). The Layers menu can now classify the same resources by the OSI model or by the OPS stack.

| Area | Change |
| --- | --- |
| `classification/` | New module. `layers.ts` is the layer registry (ids, names, colours, glyphs, 3D shapes, which layer is the "core"). `engine.ts` classifies one resource for a chosen scheme. `types-map.ts` holds the OSI and OPS mappings and the editable `LAYER_OVERRIDES`. `seed.ts` is generated from the TSA seed: 209 canonical types and 372 search patterns. `telco.ts` is the original classifier, unchanged. |
| Schemes | `telco` (4 strata, default), `osi` (L7 Application down to L1 Physical, plus Unclassified) and `ops` (Business User, Application Services, Platform Runtime, Network Fabric, Physical Infrastructure, plus Unclassified). |
| How a resource is placed (OSI / OPS) | In order, stopping at the first hit: the topology entity type; then the resource name; then the alert summary and sender; otherwise Unclassified. Name and text are searched with the seed patterns, so `LONDON01OLT1` is found as an OLT. Each node records how it was decided (`layerBasis`) and the canonical type found. |
| Layers menu | New **Classification** choice (Telco / OSI / OPS). The layer checkboxes, the count on the button and the summary follow the chosen scheme. Changing it rebuilds the graph and turns every layer of the new scheme on. The menu scrolls when it is taller than the card. |
| 3D and 2D | One plane per layer of the scheme (squeezed to the same total height for 7 or 8 layers), a shape and glyph per layer, colours from the registry. The legend lists each layer with its count and says how many resources could not be classified. Sankey, swimlane, matrix, Link Explorer and the 2D tier bands follow the scheme. |
| Props | New `layerScheme` property (`telco`, `osi`, `ops`) sets the starting scheme. It is a single value, so it can be set on a Designer tile. |
| Tests | 14 unit tests for the module (registry, telco unchanged, OSI, OPS, every seed pattern compiles, digit-tolerant boundaries). The 44 existing logic tests, 27 tile checks and 14 feed checks still pass. |
| Limits | The OPS type sets are derived from the OSI placement plus a few overrides, because `entity-layer-mappings.js` was not supplied. OSI colours are chosen here. `network_layer` is only a hint for generic types. Demo data uses names such as `ran-site-01` that no pattern knows, so most of it lands in Unclassified. |

## v6.1.0: modular code and section tiles
Nothing you see on the full dashboard changed. The 3,494-line component was split into small modules, and every region can now be placed on its own as a tile.

| Area | Change |
| --- | --- |
| Structure | `TelcoCausalMeshGen2Dashboard.tsx` is now a thin shell. The logic moved into 17 hooks (`hooks/`), nine sections and six overlays (`sections/`), two views (`views/`) and a shared session (`session/`). `logic.ts` and the visual components are unchanged. |
| `part` prop | `part` shows one region: `header`, `incidents`, `topology`, `insights`, `alarms`, `blast`, `ingest` or `remediation`. Without it, or with an unknown value, the whole dashboard is drawn. |
| Shared session | All tiles on a page share one session: the selection, active incident, filters, replay, drawer and console stay in step. Tiles that are not the full dashboard use one page-wide session; each full dashboard keeps its own private one. |
| Shared data | Tiles share one `getAlerts` and one `getStories` query and one refresh timer (`feed.ts`), instead of one pair per tile. The full dashboard still uses `useQuery` as before. |
| One set of overlays | The drawer, context menu, link modal, About and remediation dialogs are drawn once per page by whichever tile is the host, and the next tile takes over if it is removed. |
| Studio | Layout Editor: **Decompose** on this dashboard now creates eight section tiles (frame hidden) rather than widgets plus a surrogate. |
| Limit | Tile properties in the Designer are single values, so `topologyLinks`, `metricQueries` and `subscribersByResource` (lists) cannot be set on a tile. SPOF, blast-island and route features show as unavailable there, as they already did in the whole-dashboard tile. |
| Resizable layout | The whole dashboard has draggable dividers: topology / insight views in the centre (starts 50:50), the width of the incident rail and of the inspector, and the height of each inspector card (alarms, blast radius, ingest, remediation). Drag, use the arrow keys, or double-click to reset. Sizes are remembered in the browser. Minimum sizes keep every region usable; below 1100 px wide the page stacks and the dividers are hidden. |
| Fill on resize | Everything in a resized region follows its size: the insight views (Sankey and the d3 diagram redraw to the new height, Sunburst / Treemap, timeline, triage list, Link Explorer), and the inspector cards (alarm and remediation lists, the blast-radius radar, the ingest sparkline). Section tiles do the same inside their Designer tile. Only the 3D scene did this before. |
| Tests | Apart from the divider wrappers, rendering of the whole dashboard is identical to v6.0.3 over a 30-step click-through (all views, replay, drawer, context menu, refresh). 27 checks for tiles (shared selection, one host, state dropped after the last tile leaves) and 14 for the shared feed (one query pair for eight tiles, timer, refresh, error, clean-up). |

## Crashes and blank pages
| Problem | Fix |
| --- | --- |
| `process.env.DASHBOARD_API_KEY` read at module scope throws `process is not defined` in the browser, and defining it would ship the key in the bundle | Removed. Data comes from `useQuery` using the user's session. |
| No WebGL = blank page | WebGL is probed first; without it a ranked table is shown. Renderer creation errors fall back the same way. |
| `rb.policyId.slice(...)` and `inc.title.slice(...)` throw on missing values | Adapters normalise; missing values get a label. |
| Any render error blanked the page | Error boundary with "Try again". |
| `loading` and `error` were never shown, so a 401 looked like an empty dashboard with real-looking KPIs | Error, loading, empty and skipped-alert banners. |
| TS7016 for `d3-sankey` | `d3-sankey.d.ts`. |

## GPU and performance
| Problem | Before | After (measured in Chromium) |
| --- | --- | --- |
| Scene rebuilt on every selection, lens change and refresh | 6 lens clicks = 6 new renderers; 386 GL buffers and 102 textures created, none deleted | 6 lens clicks = 0 rebuilds, 4 buffers, 0 textures |
| Geometries, materials and label textures never freed (`renderer.dispose()` does not do it) | leak | freed when objects are rebuilt and on unmount; 3 data refreshes created and deleted matching counts |
| Mouse-down rebuilt the scene (`autoRotate` was a dependency) | rebuild | none |
| `setState` every frame for hover | React re-render at 60 fps | hover is raycast on mouse move only |
| Positions reset on refresh | yes | cached by resource name |
| Click after a drag selected a node | yes | ignored if the pointer moved |
| Raycast used the width captured at mount; no resize handling | stale after resize | uses the live canvas size; `ResizeObserver` |
| Context loss not handled | blank | banner, rebuild on restore |
| Timers in the remediation flow not cleaned up | state set after unmount | cleared on close and unmount |
| Selected node that disappears dimmed the whole mesh | yes | selection is cleared |

## Data that was made up
| Was | Now |
| --- | --- |
| Probe lead times, `+8.2 min` fallback, `12` correlation floor | measured from timestamps; none shown without overlap |
| `$12.4k` exposure, `14,200 subscribers`, outage-growth multipliers, `x0.16` slice isolation, four named slices | removed; subscribers only from `subscribersByResource` |
| Remediation log ending in "SUCCESS ... alert cleared" | labelled simulation, or the real handler's result |
| Invented topology links (`idx % length`) and random latencies | only supplied links; demo links are opt-in and labelled |
| "Dijkstra" that ignored weights; latency = nodes x 1.1 ms | weighted by supplied latency; latency shown only when measured |
| Blast radius counted nodes that were never linked | measured from the core layer before and after removal |
| Layer guess by substring ("ace" in "interface", "cr" in "critical") | whole-word match, entity types first |
| Precursor timeline, product, IP, MAC, firmware, ports, golden-signal bars, link optics, "READY_FOR_DISPATCH" | replaced with the resource's real alerts and runbooks, or a note saying what to connect |
| Hard-coded `kea1.fyre.ibm.com` Netcool host | `netcoolWebGuiUrl` prop |
| "100% mathematically authentic" | reworded |

## Removed
- Time-slip player (it changed a number nothing read).
- "Simulate Slice Isolation" and the outage-duration slider (they scaled invented numbers).

## Still open
- Real topology edges: the toolkit has `getTopologyResource` but no edge list in the mocks; you need to feed `topologyLinks`.
- `eventCount` column name is unverified.
- Matrix cells isolate the row probe; the column probe is not used.
- `renderer.forceContextLoss()` is not called on unmount: it breaks React StrictMode remounts. Browsers release the context when the canvas is garbage collected.

## v2 — fixes to the drawer queries (on top of the peer-AI version)

| # | Problem | Fix |
|---|---------|-----|
| 1 | Incident card showed a fake "100%" (probable-cause `rank` treated as a confidence, then clamped) | `rank` is never a confidence. A percentage is shown only for a real 0-1 `score`/`confidence`; any other scale is shown as raw `score N`; no score shows nothing |
| 3 | Metrics tab said "0 time-series points returned" for any failure | Each query now has a status: loading / ok / empty / error / unavailable, with the real error text |
| 5 | "ASM Query Live" / "Live Stream Active" tags regardless of outcome | Tags follow the status ("From topology service", "Last hour", "Query failed", "Not connected", "No data") |
| 6 | Hard-coded tenant id and `window.akoraConfig` read inside the component | The component takes a `queryApi` prop; the panel builds it and injects `tenantId` (route state `tenantId`) |
| 8 | `policyId: ''` sent when no policy was known | Runbook/policy query is skipped without a real policy id |
| 2 | Invented metric group `network-kpis` / metric `latencyMs` | Replaced by the `metricQueries` route state `[{ group, metric, label? }]`. Without it the tab says "not configured" |
| 4 | Guessed response shapes | `adaptTopologyResource` accepts only the `tenant.resource` / `resource` envelope and rejects error payloads. **Shapes of the four queries are still UNVERIFIED against a live cluster** |

Tests: 27 (5 new). Browser: S1–S8 pass; fake `akoraConfig` modes absent / rejecting / ok / no-metrics checked.

## v3 — 2D topology canvas and a 3D / 2D switch

| Change | Detail |
| --- | --- |
| New `TopologyCanvas2D.tsx` | Tiers / Radial / Pods views of the same graph. The peer-AI version imported layout functions that did not exist in `logic.ts` and had no styles in the SCSS, so it could not render properly. |
| 2D layouts in `logic.ts` | `computeHierarchical2DLayout` (barycentre-ordered tiers, wraps to the width), `computeCircular2DLayout` (BFS hop rings, radii grow so cards never overlap, unlinked ring labelled), `computePodContainment2DLayout` (topology groups, else estimated tier; shelf-packed). Pure and deterministic; 3 new tests (no overlaps, containment, determinism). |
| SCSS | Block appended for the 2D classes (toolbar, tier bands, clusters, rings, edges, cards, HUD bar). |
| View switch | **View: 3D / 2D** in the topology card. The 3D scene (renderer, GPU buffers, render loop) exists only while 3D is shown. 3D-only controls (3D layout, camera, orbit) hide in 2D. `initialView` route state. Without WebGL the 2D view replaces the old ranked table. |
| Shared state | Selection, lens colours, strata toggles, hops, incident / probe / Sankey dimming, route tracing, link modal, context menu and deep-dive drawer work in both views. |
| Layout bugs fixed in the canvas | No auto-fit (nodes off-screen); fit clamped at 0.4 so large graphs were cropped; tier lines at hard-coded fractions of the height; edges ran centre to centre so arrowheads hid under cards and same-tier edges crossed cards; link badges on every edge; overlapping card text; passive wheel handler with child-relative `offsetX`; drag stuck after leaving the canvas; search ignored when a filter mode was set. |
| Removed from the canvas | Anything not in the data model: ports / LAG counts, IP and MAC search, "Healthy (Transit)", `onExpandHops`, `colorMode` (replaced by the dashboard's lens via `getNodeColor`). Arrowheads on physical links (adjacency is undirected). |

**Not run:** the full Jest suite (needs the toolkit's `mocks/*.json`; only the 2D tests were run, in isolation), the
dashboard in a browser, and the SCSS inside the toolkit's Carbon build (the new block compiles standalone).
`tsc` over `logic.ts`, `TopologyCanvas2D.tsx` and the dashboard shows no errors in the changed code; it was run with
Carbon's types stubbed, which hides 4 callback-parameter errors in unchanged drawer code that would resolve with the
real types.

## v4 — insight views on live data

- Added sunburst/treemap, alert swimlane timeline with brush filtering, adjacency matrix, incident mini-graphs, replay (timeline and blast shockwave) and a severity pulse in 3D.
- New pure helpers in `logic.ts` (`buildTierHierarchy`, `buildSwimlanes`, `buildAdjacency`, `buildIncidentSubgraph`, `hopDistances`, `nodesInWindow`, `nodesSeenBy`, `replayDomain`) with 6 new tests.
- `effectiveActiveNodeIds` now = replay set, else base selection intersected with the time window.

- Replaced the row of topology buttons with a collapsible control bar (`TopologyToolbar.tsx`); replay bar now opens from it.

- Context menu, deep-dive drawer and link inspector are portalled to <body> (Overlay.tsx) and the menu is clamped to the window and closes on Esc/scroll/resize, so they no longer land in the wrong place inside the host page.

- Page layout redesigned into a three-column workspace (incident rail, topology + insight views, inspector rail). The 3D renderer now follows its container height instead of a fixed 540px.

## v5.0

Version label added next to the "Concert Operate" tag (`version.ts`). v5.0 covers the insight views, control bar, floating-panel fix and the three-column page layout above. Bump `PANEL_VERSION` with each release.

## v5.1

- Adjacency Matrix replaced by **Link Explorer**: Sankey over real links (`buildLinkFlow`, `linkedNodes` in `logic.ts`, 3 new tests) with the matrix as a second mode. Unlinked resources are hidden (and counted); links that would close a loop are left out of the flow and counted. Matrix cells have a 9px minimum and scroll instead of shrinking.

## v5.2

- Incident filters (All / P1 / P2 / Active) are now one segmented toolbar with count badges instead of four stacked buttons.

## v5.3

- Removed the four KPI tiles (mostly "n/a" with no data to back them). The header subtitle now shows live counts: alerts, critical alerts, resources, incidents.

## v6.0

- The probe lead-time matrix is replaced by **Triage Insights** with four tabs, all counted from loaded alerts/incidents (`buildTriageInsights` in `logic.ts`, 5 new tests): Recurring problems (alerts grouped by wording, click to filter the mesh), Correlation gaps (alerts in no incident, unassigned incidents, no probable cause, runbook coverage), Root causes (resources most often named as probable cause) and Sources (alerts per probe by severity, click to filter).
- `analyzeProbes` stays in `logic.ts` (the timeline uses its probe colours) but its lead-time numbers are no longer shown.

## v6.0.1

- Fixed: the Alert Timeline brush called the parent's state setter from inside a React state updater (React warning, and it could fire twice under StrictMode). The drag is now tracked in a ref and the filter is set once on mouse-up.

## v6.0.2

- Fixed a TS7018 build error in `buildTriageInsights` (`maxScore: null` widened to `any` when `strictNullChecks` is off). Now explicitly typed.

## v6.0.3

- Rewrote the in-app **About** help (now shows the version) and the README insight-view section to match the current page: 2D/3D, control bar, rails, Triage Insights, Link Explorer, timeline brush, replay, and what each feature needs. Removed all lead-time matrix references. No logic changes.
