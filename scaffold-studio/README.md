# Scaffold Studio

Local web tool (http://127.0.0.1:4000) that generates a dashboard from a form, registers it, edits routes and runs the deploy.

## Where it goes

The server finds everything relative to its own folder, one level up:

    lithium/                         <- ROOT (contains deploy-dashboards.sh)
    ├── deploy-dashboards.sh
    ├── dashboards/
    ├── dashboard-extension/         <- the IBM toolkit (has target.json, src/index.js, config/routes.json)
    └── scaffold/                    <- THIS folder
        ├── server.mjs
        ├── templates.mjs
        ├── package.json
        └── public/index.html        <- must be here, not next to server.mjs

Start: `cd lithium/scaffold && npm start`, then open http://127.0.0.1:4000.

## What changed in this version

* `templates.mjs` now exports `generatePanelTS` (its absence was the startup error).
* Generated dashboards no longer read `process.env.DASHBOARD_API_KEY` or call REST endpoints with a key. They use the same
  signed-in query bridge as the toolkit's own dashboards (`getAlerts`, `getStories`) and `../constants`.
* Fixed generated code that did not compile (`refreshRate` was an undefined variable in the output). All component combinations
  were generated and type-checked (strict and `strictNullChecks` off).
* The title and filters are escaped before going into generated code.
* `server.mjs`: the cluster credential that was written in the source now comes from `dashboard-extension/target.json`;
  no wildcard CORS; Host/Origin must be this page; the slug is validated (`^[a-z][a-z0-9-]{1,48}$`); only one deploy at a time.

## Known limits (not changed)

* The "Causal Time-Slip Scrubber" slider only changes a label; it does not replay anything.
* The "Blast Radius Radar" and the 3D mesh place nodes by list position, not by real topology or blast radius.
* The alert and incident filters are free text. `getAlerts` filter syntax is not verified; incidents accept only `state = 'x'` / `state != 'x'` (applied in the browser).
* The Folder Sync tab always copies into `dashboards/telco-causal-gen2/`.
