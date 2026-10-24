# Installing the Dashboard Designer

1. Copy this folder to `dashboards/dashboard-builder/` (next to your other dashboards), including
   `dashboard-builder.panel.ts`.

2. Add the line below to `deploy-dashboards.sh` with the other `sync_dashboard` lines (the updated script in this zip already has it):

       sync_dashboard "dashboard-builder" "dashboard-builder" "dashboard-builder.panel.ts"

3. Register the panel in `dashboard-extension/src/index.js` (anywhere before the `registerCustomPanel` calls end):

       export const DashboardBuilderPanel = {
         renderer: ReactRenderer,
         state: {
           component: () => import('./panels/dashboard-builder.panel')
         }
       };
       window.registerCustomPanel('dashboard-builder', DashboardBuilderPanel);

4. Add the route to `dashboard-extension/config/routes.json`: one entry in `spec.routes` and its path in the menu category.

       { "path": "/dashboard-builder",
         "bundlePath": "bundles/alerts-examples/files/alerts-examples-bundle.js",
         "panelId": "dashboard-builder",
         "title": "Dashboard Designer" }

       "routes": [ ..., "/dashboard-builder" ]      <- inside menuRoutes[0]

5. Run `./deploy-dashboards.sh`. The updated script stops with a clear message if step 3 or 4 is missing.
   Then hard-refresh (Cmd+Shift+R). A rollout can take a couple of minutes.

Notes
* Every panel named in `Tiles.tsx` must exist in `src/panels/` or the webpack build fails. If you removed one of the
  example dashboards, delete its line in `Tiles.tsx` and its entry in `registry.ts` (`TILES`).
* No new npm packages are needed (React, Carbon and d3 are already dependencies).
