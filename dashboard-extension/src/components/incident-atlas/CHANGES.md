# Incident Atlas changes
- **v1.7.2** – A tile that asks for a section this dashboard does not have (for example `alerts` from an older layout) now shows a "Section not found" notice instead of the whole dashboard.
- **v1.7.1** – Sections added to the v1.2.7 page: with a `part` prop it shows one piece (header, kpis, tools, graph, playback, incidents, details, datacheck, help) so a Layout Editor layout works. Without `part` it is the same page as v1.7.0.
- **v1.7.0** – Re-issued from v1.2.7 as the current version. Nothing from v1.3.0 onwards is in it (graph + alert table split, menu bar, sections, narrow-region layout); those are kept in `_backup/` (v1.3.0 and v1.6.1) in the update bundle.

- **v1.2.7** – Alert groups built from the alert JSON: alerts sharing a causal-union (default), scope-policy, temporal or topology-group insight id form a group. Data check shows the group count for each method and a selector.
- **v1.2.6** – Saved alert views: Data check lists the views from Concert Operate (getFilters, same as Monitor Boxes) and applies the chosen one; honours ?filtername= in the URL.
- **v1.2.5** – Alert query now defaults to Last 24 hrs (first or last occurrence), like the Alerts page. Selector in Data check: 24 hrs / 7 days / All time.

## v1.2.4
- Cosmos: links are much easier to see (thicker, brighter; inferred same-incident links are dashed in the incident colour with streams cause → effect; real topology links solid and brightest).

## v1.2.3
- Open alerts KPI now counts every open alert returned (including ones with no resource name that cannot be drawn) and shows how many were returned and how many are closed/clear, so it can be compared with the Alerts page footer.

## v1.2.2
- Data check: says how many open alerts are drawn and why the rest are not (non-incident hidden, collapsed), and warns when the returned count is a round number (possible one-page API limit).

## v1.2.1
- **Data check** card: alerts returned by severity (same six levels as the Alerts page header), closed, group parents/children, rows with no resource, and what is counted as open; shows the filter in use and lets you paste the Alerts view's filter (kept in the browser) so the numbers can be matched to the official view.

## v1.2.0
- **Real topology links**: every visible resource's neighbours are read from the topology service (via Studio's proxy) and drawn as solid links; the inferred "same incident as the cause" links are now faint dotted lines. Topology links also drive the layout. Sample mode shows labelled sample links.
- **Trace the path from the cause**: right-click a resource (or the Trace button): the real shortest path lights up with a travelling comet and a hop count.
- **Impact**: how many of an incident's resources face a service (by entity type, else by name), with amber rings on the map; Find services reads neighbours from the topology service for downstream services.
- **Heat timeline**: alerts as they fired (by severity) with incident-start and change markers; drag to replay, click a marker to jump.
- **What changed**: change/deploy/maintenance events (alert type, or the new `changeEvents` property) shown on the timeline, as a Δ badge on resources, and as a "possible trigger" for the incident.
- **Similar incidents**: ranked by shared resources, same cause and title wording; the map draws dashed arcs to the similar incidents that are open.

## v1.1.1
- Layers view: incidents are now compact diamond nodes (priority inside, short title on hover or zoom) instead of tiles, with a richer hover tooltip (state, age, counts, probable cause).

## v1.1.0
- New **Cosmos** view (now the default): resources are stars in a live force-directed constellation that settles into glowing incident nebulae; alerts orbit their resource; causal links stream particles cause → effect; hover lights a resource's neighbours; drag a star to pull it; right-click → **Shockwave** ripples the blast radius out hop by hop. Layers (Stack / Flat / Side) is still there.

## v1.0.2
- Incident cards now sit on the incident layer (wrapped in rows, scaled with the zoom) instead of running off it; resource names show only for the cause, the selected chain and when zoomed in; a key explains the three layers.

## v1.0.1
- Severity colours use the Concert Operate / Netcool palette.
## v1.0.0
- First release: three-layer canvas (incidents, alerts, topology), chain highlighting, right-click tools, progressive expand, live topology neighbours, propagation replay, Deep Dive / Raw JSON / Remediation.
