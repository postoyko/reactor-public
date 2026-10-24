# 3D force-directed graph panel

A custom panel that renders open alerts as a GPU-accelerated 3D force graph. It follows the toolkit's
conventions: a React component in `src/components`, a panel in `src/panels`, registration in
`src/index.js`, and a route in `config/routes.json`.

## What it shows

- **Resource nodes**: one per `resource.name`. Colour is the highest alert severity, size grows with alert count.
- **Hub nodes**: shared alert source (`sender.name`), `team` and `type.classification`. Resources link to the hubs
  they share, so related resources cluster together.
- **Interaction**: orbit/zoom/pan, hover to focus a node and its neighbours, click to select. A click also applies
  an alert-list filter (the same `setUrlParameters` + `replaceRoute` mechanism the Top-N panel uses), so the
  `alertViewer` panel in the lower region follows the selection. Click again, or use *Clear selection*, to remove it.
- **Controls**: group-by hubs, minimum severity, search, particle flow on/off, freeze/resume layout, fit view.

## Rendering stack

| Concern | Choice |
| --- | --- |
| Renderer | `react-force-graph-3d` → `3d-force-graph` → three.js `WebGLRenderer` |
| Physics | `d3-force-3d` (bundled by `3d-force-graph`) |
| GPU hints | `powerPreference: 'high-performance'`, pixel ratio capped at 2, antialiasing off above 4000 nodes |
| Adaptive quality | `getQualityProfile` (`webgl.ts`) lowers sphere resolution, shortens layout and disables particles as graphs grow |
| Resilience | WebGL probe with a ranked-table fallback; context loss/restore handling; animation paused in hidden tabs; renderer disposed on unmount |

## Files

```
src/components/force-graph-3d/
  graph.ts                    pure data model: alerts -> nodes/links, filters, focus, tooltips
  webgl.ts                    WebGL detection and quality tiers
  ForceGraph3DRenderer.tsx    thin wrapper around react-force-graph-3d (sizing, GPU lifecycle)
  ForceGraph3DView.tsx        Carbon controls, alert-list wiring, loading/error/empty/fallback states
  force-graph-3d.scss
  *.test.ts(x), *.stories.tsx
src/panels/force-graph-3d.panel.ts      useQuery('getAlerts') + view
src/helpers/generateSyntheticAlerts.ts  deterministic data for stories and load tests
```

## Routes

Two routes are added to `config/routes.json`:

- `/alerts-force-graph-3d` – graph in the `top` region, `alertViewer` in `bottom` (so node clicks filter the list).
- `/force-graph-3d` – full page, using root-level `bundlePath` / `panelId`.

Route `state` is passed to the panel as props:

| Prop | Default | Meaning |
| --- | --- | --- |
| `linkBy` | `["sender.name","type.classification"]` | Hub dimensions (`sender.name`, `team`, `type.classification`) |
| `maxNodes` | `1500` | Cap on resource nodes (most severe, then busiest, kept) |
| `refreshSeconds` | `0` | Poll interval; the console's `alertsrefresh` message also triggers a refetch |

## Setup

```
npm install            # picks up react-force-graph-3d, three, d3-force-3d
npm run deploy -- -n <AIOps namespace>
npm start              # local dev against your cluster
npm run storybook      # stories include 1k and 8k-resource synthetic graphs
npm test
```

## Notes and assumptions

- Data comes from `useQuery('getAlerts', ALERT_QUERY_PARAMS)`. `ALERT_QUERY_PARAMS.tenantId` is the toolkit's
  sample tenant; set it (and `target.json`) to your own, as for the other examples.
- Filter values are quoted by doubling single quotes (`quoteFilterValue`). Confirm against your cluster's filter
  grammar if resource names can contain quotes.
- Tooltips are HTML strings, so all alert-derived text is escaped (`escapeHtml`).
- WebGL is not available in jsdom: unit tests stub `react-force-graph-3d`. Rendering, GPU behaviour and frame rate
  need a manual pass in a real browser (Storybook *Large* story is the quickest check).
- `package-lock.json` is not regenerated here; run `npm install` in your fork to lock the new dependencies.
