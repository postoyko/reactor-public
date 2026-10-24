# Blast Radius

A live view of what an incident is taking down. Resources with open alerts are drawn as a graph that arranges itself: the likely cause on the left, the resources it affects to the right. Drag the timeline to replay the last hour. It reads `getAlerts` and `getStories` through the toolkit API, like the other dashboards, and refreshes every 20 seconds.

## What is real and what is not
- **Resources, severities, times, incidents**: from your alerts and incidents.
- **Links**: from Concert Operate's own incident correlation. Every alert in an incident points from the incident's probable-cause alert (rank 1) to the other alerts' resources. If an incident has no ranking, the earliest alert is used and the card says so.
- **Real topology links**: pass them as `topologyLinks` (`[{ source, target }]`, resource names as in `resource.name`) and they are drawn as dashed lines and used in the blast radius. Without them the graph uses incident correlation only. Nothing is invented.
- **Replay**: rebuilt from each alert's first-occurrence and closed times, so it works the moment the page opens. Alerts the query does not return (for example already cleared ones, with the default filter) are not in the replay.
- **Likely-cause percentages**: a share computed from the probable-cause rank (70%) and how early the resource alerted (30%). It is a readability aid, not a probability from Concert Operate.
- **Sample data**: "Load sample data" (shown when the environment cannot be read) fills the page with clearly labelled example alerts.

## Options (panel props)
| Prop | Default | Meaning |
|---|---|---|
| `refreshSeconds` | 20 | How often to re-read |
| `windowMinutes` | 60 | Replay length |
| `alertFilter` | toolkit default | Filter sent to `getAlerts` |
| `topologyLinks` | none | Real adjacency |
| `sample` | false | Start with example data |

## Files
```
src/components/blast-radius/   BlastRadiusDashboard.tsx, logic.ts, sample.ts, version.ts, blast-radius.scss
src/panels/                    blast-radius.panel.ts
```
`deploy-dashboards.sh` copies them. Register the panel like the others:
```js
export const BlastRadiusPanel = { renderer: ReactRenderer, state: { component: () => import('./panels/blast-radius.panel') } };
window.registerCustomPanel('blast-radius', BlastRadiusPanel);
```
Route: `"path": "/blast-radius", "panelId": "blast-radius", "title": "Blast Radius"`.

## What was checked
`logic.ts` and `sample.ts` type-check under `tsc --strict`. The whole panel was bundled and run in a browser against a stand-in for the `getAlerts` / `getStories` API (envelopes as the other dashboards read them). It was not built inside your toolkit and has not seen a real environment, so check the first live load: if the alert envelope differs, the page shows "No data" or an empty graph rather than wrong numbers.

Studio's "Make splittable" can turn this into tiles (graph, incident card, alert stream) for the Dashboard Designer.


## v1.2.0 additions
Props: `layout` ('lanes' | 'tree' | 'radial' | 'grid'), `groupColumns` (extra alert columns to request, e.g. `['parentId']`; the name of the parent-alert column is installation specific, so none is requested unless you set it; parent columns `parentId`, `parent.id`, `parentAlertId`, `groupParentId` and child columns `childIds`, `children`, `childAlertIds` are read when present), `nodeLinks` (`[{ label, url }]`, url may use `{name}`, `{encodedName}`, `{incidentId}`, `{tenant}`, `{origin}`).
Right-click a resource for the menu. Collapse with the − / + badge. Alert groups draw as a dotted blue link from the parent alert's resource to each child alert's resource.
Checked in headless Chromium against stubbed data; the alert-group column names have not been checked against a real environment.

## v1.5.0 additions
Props: `netcoolWebGuiUrl`, `metricQueries` (`[{ group, metric, label? }]`; names are installation specific, none are guessed), `tenantId`, `onExecuteRemediation(alert) => Promise<{ ok, message }>` (a function, so it can only be set by a host that renders the panel from code; from route state the console is a simulation).
Right-click or double-click a resource for Deep Dive and Remediation Console. Runbook and topology details appear when the alert query returns the runbook and topology insight columns (the same ones the Telco Causal Mesh reads).
