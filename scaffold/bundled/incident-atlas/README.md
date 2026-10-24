# Incident Atlas

Incidents → alerts → topology as three stacked layers in one canvas. Route `/incident-atlas`.

- **Click** anything (incident, alert, resource) and its whole chain lights up; the rest dims. The side panel says why it is there.
- **Right-click** for tools: Deep Dive, Raw JSON (alert / topology resource), Remediation, pivot, isolate, open in Concert Operate, copy.
- **Expand out**: resources show the worst 6 children with a **+N** badge; "Expand everything below" goes all the way down; "Reach into live topology" pulls neighbours from the ASM topology service (via Concert Workbench's proxy) as dashed ghost nodes you can keep expanding.
- **Play propagation** replays how the incident spread, resource by resource.
- Views: Stack (3D), Flat, Side. Drag pans, wheel zooms, Alt/Shift-drag rotates.

Also: real topology links, trace path, impact, heat timeline, change overlay (`changeEvents`), similar incidents.

Properties: `changeEvents, refreshSeconds, windowMinutes, alertFilter, topologyLinks, sample, groupColumns, nodeLinks, updateUrl, netcoolWebGuiUrl, metricQueries, tenantId, onExecuteRemediation, topologyApiUrl, initialView, baseChildren`.

Live topology neighbour parsing (`parseNeighbourhood`) is unverified against a live service; if it finds nothing the toast says so.
