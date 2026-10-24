# Alerts map (OpenStreetMap)

Open Concert alerts placed on an OpenStreetMap map, one circle per site. The circle colour is the worst severity at that site (Concert Operate palette). The circle size grows with the number of alerts. Follows `scaffold/DASHBOARD-CONTRACT.md`.

## Blocks

| Block | Shows |
|---|---|
| Header | Title, version, "Sample data" switch, Refresh button |
| Data status | Loading, query error, "No sites configured", "No open alerts", or the last update time |
| Summary numbers | Open alerts, Alerts on the map, Sites with alerts, Not placed on a site |
| Map | OpenStreetMap with one circle per site; click a circle for its worst alerts (5 shown, "Showing 5 of N" if more) |
| Sites with alerts | Table of sites (worst severity, alert count); click a site name to fly to it. Shows up to 25 rows with "Showing 25 of N sites" |

## Concert APIs used

- `window.akoraConfig.baseState.API.contentAnalyticsAPI.getAlerts` with `format: 'AIOPS'`, the columns `id, severity, state, summary, sender.name, resource.name, lastOccurrenceTime`, and the shared filter `ALERT_QUERY_PARAMS.filter` from `../constants` (`state != 'clear'`). Refreshed every 30 seconds.

No API key, token or tenant ID is written in this folder. The tenant ID comes from `ALERT_QUERY_PARAMS` in `src/components/constants.ts`, the one setting shared by all dashboards.

## Placing alerts on the map

Concert alerts have no coordinates. Edit `sites.ts`:

```ts
export const SITES: Site[] = [
  { id: 'lon', name: 'London data centre', lat: 51.5072, lng: -0.1276, match: ['lon-', 'london'] },
];
```

An alert goes on the first site where any `match` word appears in the alert's `resource.name` (not case sensitive). Alerts that match no site are counted under "Not placed on a site". A site with invalid coordinates (outside -90..90 or -180..180) is ignored.

The "Sample data" switch shows made-up alerts and sites so you can preview the map.

## Needs

- npm packages in `dashboard-extension`: `leaflet@1.9.4`, `react-leaflet@4.2.1` (v4 is the release line for React 18; v5 needs React 19) and `@types/leaflet`.
- The browser must reach `https://tile.openstreetmap.org` (images). If Concert Operate sets a content security policy, `img-src` must allow it.
- OpenStreetMap tiles are for light use. For heavy use, change `OSM_URL` in `MapView.tsx` to a tile provider or your own tile server. Keep the attribution.
- Run in `dashboard-extension`: `npm install leaflet@1.9.4 react-leaflet@4.2.1 && npm install -D @types/leaflet`.

## Files

`OsmMapDashboard.tsx` (layout), `MapView.tsx` (map), `feed.ts` (data), `logic.ts` (placing alerts on sites), `sites.ts` (your sites), `sample.ts`, `theme.ts`, `osm-map.scss`, `osm-map.panel.ts`, `version.ts`.
