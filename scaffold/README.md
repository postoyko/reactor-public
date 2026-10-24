# Concert Workbench

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
        ├── designer/                <- the Dashboard Designer files (installed from the Setup tab)
        └── public/index.html        <- must be here, not next to server.mjs

Start: `cd lithium/scaffold && npm start`, then open http://127.0.0.1:4000.

## Setup tab: Dashboard Designer

The **Setup** tab installs a page where *end users* build their own dashboards inside Concert Operate: drag and
resize widgets, bind them to alerts or incidents, click a bar to filter the others, undo/redo, several dashboards, export/import JSON.
"Generate from components" (Pages > New page) writes a fixed hand-coded layout; for drag-and-resize use the **Design** tab.

1. Open Setup and click **Install / Update Designer**. It copies `scaffold/designer/` into `dashboards/dashboard-builder/` and the build
   folder, registers the panel in `src/index.js` and adds the `/dashboard-builder` route. Safe to repeat.
2. Click **Build & Deploy**, wait a couple of minutes, hard-refresh Concert Operate (Cmd+Shift+R).
3. If the tab reports missing panels, a tile it offers points at a dashboard that is not in your toolkit: add it, or delete its lines in
   `designer/Tiles.tsx` and `designer/registry.ts` (`TILES`).

See `designer/README.md` for what the Designer does and what was and was not checked.

## What changed in this version

- **v1.77.0** – Designer v1.63.0. **Real data for Design**: Setup has a new card to upload a data snapshot recorded in Concert Operate (Designer › ⋮ › Check the Concert Operate API › Record and download). Design then answers from it instead of sample data, and says so; a value the snapshot does not hold (an incident outside the first ten) is refused with the reason. Only answers of read functions are accepted, changes stay sample, nothing is sent to Concert Operate. The file is kept in `.studio/data-snapshot.json` (owner-only, ignored by git). Tests: `node --test scaffold/snapshot.test.mjs`, also on GitHub. Designer v1.62.0 is in it too: incident and policy fields offer values from the data while typing.
- **v1.76.0** – Dashboard versions in git. Setup > **Git** shows the repository, remote and branch, sets the commit author, the branches Studio may commit to (the branch checked out the first time, until changed) and an option to commit on Publish. Design > **Versions** commits the changed dashboard files (layouts, published copies, sidebar entries; never code, and never files staged by hand), pushes, pulls (fast-forward, else a merge; on a conflict it undoes the merge and names the files) and lists a dashboard's committed versions: opening one puts it in the editor as unsaved changes, so history is never rewritten. No force push, rebase, reset or branch switching. git runs with your own login; settings are in `.studio/git.json` (now ignored by git, as is the topology password file). Tests: `node --test scaffold/git.test.mjs`, also run on GitHub.
- **v1.75.2** – Designer v1.49.2: Publish is repeatable. Starter templates build with stable widget ids and a stable dashboard id, and Studio writes a layout, published data file, panel file or route list only when its content really changed (the timestamp is ignored). Publish all twice now leaves every file untouched, so git shows only real edits. The first run after upgrading rewrites the template files once (ids become stable).
- **v1.75.1** – Designer v1.49.1: viewers can also drag widgets around ("Arrange widgets": drag a title to move, a corner to resize). Per-widget switch: "Viewers can move and resize this widget".
- **v1.75.0** – Designer v1.49.0: viewers can resize widgets at run time ("Resize widgets" in the toolbar, drag a corner; "Reset changes" undoes it). Kept per person and dashboard. Designers can switch it off per widget.
- **v1.74.1** – Designer v1.48.1: widgets that are too short for their content (banners, tags, indicators, progress bars, buttons, inputs) are grown to fit when a dashboard loads or a template is applied, and what is below moves down. Fixes content clipped in Concert Operate on compact dashboards.
- **v1.74.0** – Designer v1.48.0: **generic action wiring**. Any widget (native, Carbon or embedded panel) can raise click, double-click, hover, leave, typed, Enter, focus and blur; any widget can be told to change a data setting (group by, measure, narrow rows, sort, limit) or to set / add to any property by name. No per-component work is needed.
- **v1.73.1** – Designer v1.47.1: actions can add to a number ("Add to Value" on a progress bar, Slider, Number input, any numeric setting): a button that adds 10% per press.
- **v1.73.0** – Designer v1.47.0: **action wiring**. Every widget lists the events it raises (click, value changes, tab chosen, dialog closed, bar picked ...) and what can be done to it (show/hide, set any of its settings, set its value, open a dialog, choose a tab ...). Wire them in Wire mode → Actions, in a widget's settings, or see them all under Wiring. New template: Interactive controls.
- **v1.72.1** – Designer v1.46.5: "Blank dashboard" is now the first card (and a button at the top) of the template picker.
- **v1.72.0** – **Check** on every dashboard in Setup (Split dashboards into tiles): a read-only report saying whether it can be taken apart automatically (Ready / Mostly automatic / Tiles only / Needs manual work), the tiles found, the widgets they could become, and findings (API keys, hardcoded tenant, absolute hosts, REST calls). New `DASHBOARD-CONTRACT.md` (linked from the same card, also at the bundle root): the authoring rules and an AI prompt for dashboards that split in one click.
- **v1.71.5** – Designer v1.46.4: team and owner follow Concert's real data (owner's user group, "-" as empty).
- **v1.71.4** – Designer v1.46.3: pivot lists identical per data source.
- **v1.71.3** – Designer v1.46.2: wiring display off when using a dashboard.
- **v1.71.2** – Designer v1.46.1: pivot lists restored.
- **v1.71.1** – The Dashboard library tab shows how many updates and new dashboards are waiting, without opening it.
- **v1.71.0** – Designer v1.46.0: choose per widget whether viewers can pivot or set notifications.
- **v1.70.3** – Designer v1.45.3: pivoted chart titles follow the pivot.
- **v1.70.2** – Designer v1.45.2: consistent pivot options; bell pop-over opens above.
- **v1.70.1** – Designer v1.45.1: build fix.
- **v1.70.0** – Designer v1.45.0: saved views, pivot a chart, KPI notifications, incident timeline, runbook panel.
- **v1.69.0** – Designer v1.44.0: runtime "Link widgets" for people viewing a dashboard.
- **v1.68.4** – Designer v1.43.5: filter bar without per-filter titles and x buttons.
- **v1.68.3** – Designer v1.43.4: read-only dashboards have no Tour, the title band is fixed, spacing is tighter.
- **v1.68.2** – Designer v1.43.3: the filter bar button is readable.
- **v1.68.1** – Designer v1.43.2: "Add or remove filters" button and per-filter remove on the bar.
- **v1.68.0** – Pages is now three sub-tabs: Pages in Concert Operate, Dashboard library and Other panels (with counts).
- **v1.67.1** – Designer v1.43.1: template renamed "Incident command center".
- **v1.67.0** – Designer v1.43.0: runtime "Fields" button on the filter bar.
- **v1.66.3** – Designer v1.42.2: fixes the datahub.ts build errors.
- **v1.66.2** – Scaffold Studio is now Concert Workbench.
- **v1.66.1** – Designer v1.42.1: existing templates use the new fields and widgets.
- **v1.66.0** – Designer v1.42.0: Incident insights, Runbook activity, People and teams, Application cards.
- **v1.65.0** – Designer v1.41.0: templates Application health, Metrics explorer, Alert insights.
- **v1.64.0** – Designer v1.40.0: similar incidents in the incident panel.
- **v1.63.0** – Designer v1.39.0: probable cause and insights for an incident in the drill panel.
- **v1.62.0** – Designer v1.38.0: Metric over time data source (metrics and forecast) with a group/metric/resource picker.
- **v1.61.0** – Designer v1.37.0: runbook names and automated/manual on alerts.
- **v1.60.0** – Designer v1.36.0: Applications data source (getImpactedApplications); real application health in the Incident & alert operations template.
- **v1.59.0** – Designer v1.35.0: alert insight fields (incident link, criticality, topology, anomaly, seasonal, golden signal, causal, signature), real teams and people from getUsersAndGroups.
- **v1.58.1** – Designer v1.34.1: runbooks from the GraphQL alerts query; "Event count" field.
- **v1.58.0** – Designer v1.34.0: "Runbooks attached" field from the alerts REST call.
- **v1.57.1** – Designer v1.33.1: "Business service" field and service health tiles.
- **v1.57.0** – Designer v1.33.0: new template "Incident & alert operations" (the incident-alert-dashboard from components).
- **v1.56.0** – Designer v1.32.0: templates use a compact 28px row, like the incident dashboard.
- **v1.55.4** – Designer v1.31.4: the template picker no longer shows the dashboard behind it as a ghost.
- **v1.55.3** – Designer v1.31.3: heatmap and radar explain themselves when there is nothing to compare.
- **v1.55.2** – Designer v1.31.2: severity and priority colours also in lollipop charts, progress bars, count badges, number tiles, the breakdown popover and the drill-through panel.
- **v1.55.1** – Designer v1.31.1: stacked and grouped bar charts with a single series now colour by category (severity colours stay correct).
- **v1.55.0** – Designer v1.31.0: all 19 templates redesigned to look like real operations screens (title band, captioned figures, real charts, a needs-attention queue); tables show severity dots, P1 to P5 tags and "14h ago" times. Publish all starter templates again to refresh the sidebar pages.
- **v1.54.2** – Designer v1.30.3: fixes empty ("Nothing here.") tabs, panes and containers in published dashboards.
- **v1.54.1** – Designer v1.30.2: chart fixes (flow chart loop, gaps in averages). "Publish all starter templates" now reports any widget a template lost on the way.
- **v1.54.0** – Design tab ⋯ menu: **Publish all starter templates…** saves every template as its own layout (`tpl-<name>`), puts each in the Concert Operate sidebar as a live dashboard and deploys. Run it again to refresh them.
- **v1.53.1** – Designer v1.30.1: fixes a TypeScript build error (TS7011) in the chart widgets under the toolkit's `noImplicitAny` setting.
- **v1.53.0** – Designer v1.30.0: six more templates on live data that show the Carbon components together (two chart galleries, Status board, Control room, Incident desk, Severity scorecard), 19 in all. Treemap boxes show labels.
- **v1.52.0** – Designer v1.29.0: 17 Carbon Charts (bar, grouped and stacked bar, lollipop, line, area, stacked area, scatter, pie, donut, gauge, meter, heatmap, treemap, radar, word cloud, flow) and five new components (status shape, status icon, count badge, breakdown popover, combo button). They read data like every other widget, follow the filter bar and the filters other widgets send, and send a filter (or drill through) when clicked. Thirteenth template, Insight board. Fixes a re-render loop in the wire layer.
- **v1.51.1** – Designer v1.28.1: the filter bar and time range are now called out as the key feature. The tour step is flagged "Key feature", the Filters button shows a pulsing "Turn on" badge until first opened, the Filters popover recommends it for every shared dashboard, and the Designer README leads with a note on it.
- **v1.51.0** – Designer v1.28.0: dashboard-wide filter bar and time range. A Filters button (Edit mode) turns on a bar of dropdowns for chosen alert and incident fields, a time range (15 minutes to 30 days, or custom) and auto-refresh; every widget on that data follows it unless it opts out. All twelve templates now come with a filter bar, and Alert triage and NOC command center use it instead of their own dropdowns. Studio keeps the bar when saving and publishing.
- **v1.50.0** – Designer v1.27.0: twelfth template, Operations hub (tabs on the outside, an accordion or split pane inside each tab). Accordion sections use the full width.
- **v1.49.1** – Designer v1.26.1: opens in Edit mode (Preview is one click away); picking a template switches to Edit.
- **v1.49.0** – Designer v1.26.0: five advanced templates (NOC command center, Service review, Triage workbench, Wall display, Team report) using split panes, tabs, accordions and a carousel up to three levels deep; Accordion option "Start with every section open".
- **v1.48.0** – Designer v1.25.0: Templates and Tour buttons in Studio's Design toolbar (next to Save), as well as inside the Designer bar.
- **v1.47.2** – Designer v1.24.2: a visible Tour button in the top bar.
- **v1.47.1** – Designer v1.24.1: a Templates button in the toolbar opens the starter templates on any dashboard (replaces the canvas; Undo brings it back).
- **v1.47.0** – Designer v1.24.0: starter templates (Operations, Alert triage, Executive, Incident review, Telco, Investigation workspace) on every empty dashboard, and a 1-minute guided tour (first visit, or ⋯ menu > Take the tour).
- **v1.46.0** – Designer v1.23.0: widget colours. Each widget has a background and a text colour (colour pickers, six quick pairs, Reset).
- **v1.45.1** – Designer v1.22.1: in Edit mode you can click a tab (or a carousel arrow) to choose where to drop, and accordion sections start open so every section is a drop target.
- **v1.45.0** – Designer v1.22.0: new containers Scroll pane, Carousel and Toolbar; Accordion can keep one section open at a time. All accept drag and drop.
- **v1.44.0** – Designer v1.21.0: wire menu. Click a wire in Wire mode (or drop a new one) for its type (filter or typed value), the comparison for typed values, and Cut.
- **v1.43.0** – Designer v1.20.0: drag and drop. Drag a library item onto the canvas or straight into a tab, accordion section, split pane or container; drag widgets between panels and back out. Panels outline blue when they will accept the drop.
- **v1.42.0** – Designer v1.19.0: drill-through. Click a bar, slice, table row or KPI to open a side panel with the rows behind it, or open an address filled from the row. `?db=field:value` in a dashboard address pre-applies filters.
- **v1.41.0** – Designer v1.18.0: value inputs. A text box, number, slider, switch or chooser can filter other widgets by its value (wired like a chart, purple lines).
- **v1.40.0** – Designer v1.17.0: visual wiring. Wire mode with ports and drag-to-connect curves, lines that pulse when a selection travels, hover to trace a widget's connections.
- **v1.39.0** – Designer v1.16.0: widgets inside Containers, tabs, accordion sections and split panes (grid inside a grid), and a Wiring tab to choose which widgets a chart or chooser filters. Layouts keep `parent` and `sendTo`; designer-core.js rebuilt. Splitting or converting a dashboard tile that sits inside a container stays inside it.
- **v1.38.0** – Design uses the same words as Concert Operate (dashboards, "New dashboard"), has the Preview / Edit switch, and Designer v1.15.0 lets you put dashboards (or one section) into tabs, accordions and split panes from a list.
- **v1.37.4** – In Design the Designer's toolbar and status bar stay put; only the canvas scrolls.
- **v1.37.3** – Fixes "Could not resolve #src/helpers/..." when the Designer starts in Design: it no longer pulls in the extension's panels (embedded dashboards run in their own preview frames).
- **v1.37.2** – The Designer frame shows a "starting" message while it loads, and its bundle is minified (smaller, faster first load).
- **v1.37.1** – Design opens straight into the Designer (starting layout, else the first saved one, else a blank layout) instead of an empty page.
- **v1.37.0** – Design is now the real Dashboard Designer (v1.14.0), the same editor users get in Concert Operate, running with sample data; the separate editor Studio had is gone. Studio keeps the layout side (Layouts menu, name, Save, Publish, starting layout) and shows split / convert actions for the selected tile.
- **v1.36.3** – Fixes the production build of Telco Causal Mesh Gen 2 v6.6.1 (TS2367 on the new "section not found" check).
- **v1.36.2** – One way to ship from Design: **Publish** (Republish once it is a page) saves, puts the page in the sidebar and deploys. The ▾ menu is gone; its other actions (starting layout for every user, remove from sidebar) are in the ⋯ menu. The header Deploy button is hidden on the Design tab so there is only one deploy button there.
- **v1.36.1** – A tile that names a section its dashboard no longer has (for example `alerts` from an older Atlas) used to show the whole dashboard. Incident Atlas v1.7.2 and Telco Causal Mesh Gen 2 v6.6.1 now show a "Section not found" notice, and Design marks such tiles in red with a button to remove them.
- **v1.36.0** – Studio reorganised around one workflow: **Pages** (what is in the sidebar, what each page is made with, New page menu), **Design** (the former Layout Editor), **Deploy**, and **Setup** (end-user Dashboard Designer install, topology proxy, split dashboards, folder import). "Generate from components" moved under Pages > New page. One Build & Deploy button in the header on every tab. Messages and docs use the new tab names.
- **v1.35.1** – Layout Editor toolbar reduced to one row: Layouts menu (open, new, import, duplicate, export, delete), layout name, undo/redo, Live preview, a ⋯ menu (row height, convert sections), Save, and one Publish button (saves, adds the sidebar page and deploys) with a ▾ menu for deploy-later, default layout, unpublish and clear default. Ctrl+S saves.
- **v1.35.0** – Dashboard Designer v1.13.0: a professional editing workbench (dark toolbar, searchable widget library, Layers list, settings dock, status bar, artboard canvas with selection tags and keyboard shortcuts).
- **v1.34.5** – A route that has a panel but no `bundlePath` (it made every Custom Dashboards page fail in Concert Operate with "can't access property path, e is undefined") is repaired automatically: at Studio start, when routes are saved, when a held route is stored, and just before each deploy.
- **v1.34.4** – Incident Atlas v1.7.1 (your v1.2.7 look) now has sections, so layouts built from Atlas show the right piece in each tile instead of the whole page repeated. The Layout Editor lists its 9 sections (no alert-table / split sections: that needs v1.3.0 or later).
- **v1.34.3** – Bundled Incident Atlas is now v1.7.0, re-issued from your v1.2.7 copy so it counts as the newest version. The previous v1.3.0 and v1.6.1 are in `_backup/`.
- **v1.34.2** – Bundled Incident Atlas put back to v1.3.0 (the copy you supplied) for a demo. The newer v1.6.1 (sections for the Layout Editor, menu bar, narrow-region layout) is kept in `_backup/incident-atlas-v1.6.1/`. v1.3.0 has no sections, so a layout made from Atlas sections shows the whole page in each tile: unpublish it for the demo.
- **v1.34.1** – Incident Atlas v1.6.1: layout follows the width of its region (stacks when narrow), graph + table height capped, honours fillWindow:false.
- **v1.34.0** – "Split pane (resizable)" Carbon widget (two panels, draggable divider, each holding text or a dashboard section such as `tile:incident-atlas#graph`), and a new Incident Atlas section "Graph + alert table (resizable divider)" (Atlas v1.6.0).
- **v1.33.2** – "Edit in Layout Editor" on a route now reopens the layout you saved for it instead of splitting the dashboard again, so edits are no longer lost (and no more incident-atlas-layout-2, -3, -4 copies). Delete the saved layout to start from the original split.
- **v1.33.1** – Fixes a TypeScript error in the Carbon widgets (Clickable tile) that failed the production build.
- **v1.33.0** – Carbon React components as widgets (Dashboard Designer v1.11.0): 57 of them, in the Layout Editor palette and in the Designer, each with a settings form built from one catalog (`designer/carbon-specs.ts`). Choosers (Dropdown, Select, Combo box, Multi-select, Radio buttons, Content switcher) can list the values of a data field and filter the other widgets; Tag, Progress bar and notifications can show a live measure; Data table and Structured list show the rows. Tabs, Accordion and Content switcher can hold a dashboard section.
- **v1.32.0** – Incident Atlas v1.5.0 has sections, so in the Layout Editor you can place its header, KPIs, filters, graph, alert table, replay bar, incidents list, details, data check and help separately, resize them and add widgets around them (Show: list, or start from the route). All sections share one data feed and one selection.
- **v1.31.2** – Routes with several regions (left/right, top/bottom) now resolve to their panel file, so "Edit in Layout Editor" works for them instead of saying "this route has no panel file".
- **v1.31.1** – "Cannot be embedded as a tile" now says why (no panel file, bad file name, or no matching line in src/index.js).
- **v1.31.0** – Designer v1.10.0: people can edit a dashboard's settings inside Concert Operate (Settings panel of a tile: options and, once made configurable, the values written in its code). Studio writes `settings-schema.ts` into the Designer at build time. Fix: after "Make these editable" the form lists only the values that were actually wired up.
- **v1.30.0** – Live preview now covers data widgets (Number, Bar, Donut, Timeline, Table), sections and surrogate tiles. "Convert to widgets" reads field names from the Designer's own field list and the toolkit's columns (`catalog.mjs`) instead of a hand-typed table: a field a widget cannot use is reported and dropped, not mapped to a look-alike. Where the code does not say, the alert filter comes from the dashboard's own path constant (e.g. ALERTS_PATH) and severity names from its own constants; items that cannot be traced and name an unknown field are no longer suggested.
- **v1.29.0** – Layout Editor live preview: dashboard tiles render the real component (bundled with the esbuild, react and sass already in dashboard-extension/node_modules) on generated sample alerts and incidents, and update as you edit the "Content written in the dashboard" forms. Switch it off with the "Live preview" box. Data widgets are still placeholders.
- **v1.28.0** – Layout Editor: "Content written in the dashboard" forms. Studio reads each dashboard's props and module-level constants (service domains, KPI lists, thresholds, refresh options) with the TypeScript compiler; "Make these editable" turns them into overridable settings, edited as typed forms and applied at deploy. Undo restores the file. Designer v1.9.0.
- **v1.27.15** – Blast Radius v1.14.0 and Incident Atlas v1.4.0: compact menu-bar toolbars.
- **v1.27.14** – Blast Radius v1.13.1 and Incident Atlas v1.3.1: smaller KPI tiles and title.
- **v1.27.13** – Incident Atlas v1.3.0: alert table beside the graph with a movable divider.
- **v1.27.12** – Blast Radius v1.13.0: alert table under the graph in one split container with a movable divider. Studio no longer adds the /blast-radius-alerts route.
- **v1.27.11** – Blast Radius v1.12.2: the compact layout CSS (viewer directly under the replay bar; right column scrolls).
- **v1.27.10** – Blast Radius v1.12.1: compact layout on /blast-radius-alerts (viewer directly under the replay bar). Update also fixes an existing /blast-radius-alerts route.
- **v1.27.9** – Blast Radius v1.12.0: alert viewer hook; Install / Update also adds the route /blast-radius-alerts (Blast Radius over the alertViewer).
- **v1.27.8** – Blast Radius v1.11.0: alert groups from causal insight ids, 24 hr window and saved views (as in Incident Atlas).
- **v1.27.7** – Incident Atlas v1.2.7: alert groups from shared causal insight ids (union / scope / temporal / topology), counts per method in Data check.
- **v1.27.6** – Incident Atlas v1.2.6: saved alert views picker (getFilters), as on the Alerts page.
- **v1.27.5** – Incident Atlas v1.2.5: alert query defaults to Last 24 hrs like the Alerts page (selector in Data check).
- **v1.27.4** – Incident Atlas v1.2.4: links much more visible in Cosmos.
- **v1.27.3** – Incident Atlas v1.2.3: Open alerts KPI shows returned vs closed and counts alerts with no resource.
- **v1.27.2** – Incident Atlas v1.2.2: Data check explains drawn vs returned alerts and flags a possible page limit.
- **v1.27.1** – Incident Atlas v1.2.1: Data check card (severity totals as on the Alerts page, filter in use, editable filter).
- **v1.27.0** – Incident Atlas v1.2.0: real topology links, trace path from the cause, impact, heat timeline, change overlay, similar incidents.
- **v1.26.1** – Incident Atlas v1.1.1: Layers view shows incidents as nodes with hover tooltip.
- **v1.26.0** – Incident Atlas v1.1.0: new Cosmos view (living constellation, incident nebulae, orbiting alerts, causal streams, Shockwave blast radius).
- **v1.25.2** – Incident Atlas v1.0.2: incident cards stay on their layer, fewer overlapping labels, on-canvas key.
- **v1.25.1** – Severity colours aligned with Concert Operate / Netcool in Telco Causal Mesh Gen2 (v6.6.0), Blast Radius (v1.10.1), Incident Atlas (v1.0.1) and incident priority colours.
- **v1.25.0** – New bundled dashboard: Incident Atlas v1.0.0 (incidents → alerts → topology layers, chain highlight, right-click tools, expand to related, live topology neighbours, propagation replay).
- **v1.24.1** – Topology proxy starts with the host and tenant from your Swagger page and extract script (scaffold/topology.defaults.json); only user, password and the Concert Operate origin are left to enter.
- **v1.24.0** – Topology proxy: Studio holds the ASM topology address and login and forwards read-only requests for dashboards (Raw JSON entity + neighbourhood). Ships Blast Radius v1.10.0 and Telco v6.5.0.
- **v1.23.3** – Raw JSON topology lookup reworked from the topology Swagger (Blast Radius v1.9.3, Telco v6.4.3).
- **v1.23.2** – Raw JSON: topology REST lookup by name (Blast Radius v1.9.2, Telco v6.4.2).
- **v1.23.1** – Raw JSON topology lookup uses the ASM unique id (Blast Radius v1.9.1, Telco v6.4.1).
- **v1.23.0** – Blast Radius v1.9.0 and Telco Causal Mesh Gen2 v6.4.0: Raw JSON tab in deep dive.
- **v1.22.0** – Telco Causal Mesh Gen2 v6.3.0 (Open in Concert Operate on incident cards).
- **v1.21.0** – ships Blast Radius v1.8.0 (Combined Sankey layout).
- **v1.20.1** – ships Blast Radius v1.7.1 (hide/show non-incident resources).
- **v1.20.0** – ships Blast Radius v1.7.0 (Sankey "Lineage" layout).
- **v1.19.0** – ships Blast Radius v1.6.0 (alert groups discovered from the live alerts API).
**v1.18.0**: Blast Radius v1.5.0 (Deep Dive and Remediation Console from the resource menu, like the Telco Causal Mesh).

**v1.17.1**: Blast Radius v1.4.1 (fills the window height by measuring).

**v1.17.0**: Blast Radius v1.4.0 (lanes packed side by side; selecting an incident enlarges it and softens the others).

**v1.16.8**: Blast Radius v1.3.4 (text and node sizes on zoom).

**v1.16.7**: Blast Radius v1.3.3 (click an incident lane to select that incident).

**v1.16.6**: Blast Radius v1.3.2 (fills window height, no dimming on incident tab, info-only legend, lane header fix).

**v1.16.5**: the Build & Deploy button on the Build & Deploy tab is now small, at the top next to Clear.

**v1.16.4**: Blast Radius v1.3.1 (fixes a TypeScript build error in the extension build).

**v1.16.3**: small Build & Deploy button at the top of the Bundled dashboards card.

**v1.16.2**: Studio now carries a copy of Blast Radius in `scaffold/bundled/`. When it is newer than `dashboards/blast-radius`, the Bundled dashboards card shows "Update available" and Update copies it in (the old folder is backed up to `.backups/`) and into the extension. Updating `scaffold/` alone is enough.

**v1.16.1**: Bundled dashboards now show "Update available v1.2.0 → v1.3.0" with an Update button when the source in `dashboards/` differs from the copy in the extension (a version number is shown when the dashboard has a `version.ts`).

**v1.16.0**: Blast Radius v1.3.0 — "new version available" banner (Studio now answers `/api/panel-version/<dashboard>`, a version string only; everything else still locked to Studio's own page); graph, side panel and timeline resize with the window.

**v1.15.0**: Blast Radius panel v1.2.0 — right-click node menu (deep dive, links, copy), four layouts (lanes, tree, radial, grid), collapsible nodes, alert groups (parent with child alerts). Re-run "Install & add route".

**v1.14.0**: Blast Radius panel v1.1.0 — IBM Carbon light look (follows host theme), one lane per incident, pan (scroll/drag), zoom (Ctrl/⌘+scroll, +/−, Fit), larger canvas with widen toggle. Re-run "Install & add route" to push it.

**v1.13.3**: The "Bundled dashboards" card is now at the top of the Active Routes Switchboard and always shown: every dashboard in `dashboards/` with its status, and an error message if the server cannot answer.

**v1.13.2**: The start-up line now shows the version (`Concert Workbench v1.13.2 running at …`), so you can tell a restarted server from an old one.

**v1.13.1**: The "Bundled dashboards not in your extension yet" card now lists every folder in `dashboards/` that has a panel file, instead of relying on the list in `deploy-dashboards.sh` (an older script left Blast Radius out).

**v1.13.0**: Version bump (Designer v1.8.0). No functional change.

**v1.12.0**: Active Routes Switchboard: "Bundled dashboards not in your extension yet" lists dashboards that are in `dashboards/` but not yet copied into `dashboard-extension/src/` (such as Blast Radius). **Install & add route** copies the files, registers the panel in `src/index.js` and adds the sidebar route, so the Composer, Layout Editor and Switchboard can see it before the first deploy.

**v1.11.1**: Section tracing follows relative imports (helpers, constants and fetch functions in other files, including re-exports) and `.then(setState)`.

**v1.11.0**: Section conversion now reads the dashboard's own code (`trace.mjs`) instead of guessing from labels: the fetch URL gives the query (and the alert filter), `.filter()` conditions become "only rows where" conditions, `.length` becomes a count, table cells give the columns, helper functions give the group-by field. Anything it cannot follow is listed in the result and falls back to a labelled guess. Designer v1.7.0: "only rows where" now has operators (<, <=, >, >=, !=) and extra AND conditions.

**v1.10.0**: "Convert sections to widgets" now works for any dashboard made splittable: Studio guesses a KPI, table, donut or bar widget (query, field, filter, columns) from each section's JSX and the Layout Editor offers the same convert buttons. Guesses are approximate; check them in the settings. Sections it cannot recognise stay as sections.

**v1.9.0**: Layout Editor: "Convert sections to widgets" (and per section): turns Incident & Alert Dashboard sections into configurable Designer data widgets (query, field, filter, columns, limit).

**v1.8.1**: Layout Editor: an Options editor on existing-dashboard tiles (passed to the dashboard as props).

**v1.8.0**: "Split dashboards into tiles" (Active Routes Switchboard): Studio reads a hand-written dashboard with the TypeScript compiler, adds a `part` option (one shared live instance, sections shown in tiles via portals), backs up the file and can undo. Needs `typescript` in dashboard-extension/node_modules. Layout Editor picks the sections up automatically.

**v1.7.0**: Cognitive Deep Dive can be split into header, lenses and workspace tiles (new `dashboards/xeno-deep/` with a `part` prop; Layout Editor Edit now decomposes it).

**v1.6.0**: Layout Editor and Designer: "Float on top of other widgets" (overlay, e.g. an image on Cognitive Deep Dive) and an adjustable row height.

**v1.5.0** (includes 1.1.0 to 1.1.2 below): generated incident filter regex lost its backslashes, so the incidents filter never applied (fixed).

**v1.1.1**: generated dashboards that embed an existing panel now compile (type cast fixed).

**v1.1.0**

* Composer: existing panels from `src/panels/` and Dashboard Designer widgets can be ticked in step 2 and are embedded in the generated dashboard.
* Switchboard: "Rename to standard" for non-standard panel files (for example `alerts-timeline-panel.ts`).
* Build & Deployment Stream moved to its own **Build & Deploy** tab; the Layout Editor palette is a permanent sidebar.
* Fixes in `deploy-dashboards.sh` (logic.ts check), `prune-orphan-panels.mjs` (`.js` imports) and `install.sh` (scaffold backup, no auto start).

**v1.0.0**

* **IBM Carbon light look and feel.** Studio now uses the Carbon Gray 10 theme: dark UI-shell header, line tabs, square tiles, Carbon text inputs, selects, buttons (primary and outlined), data tables, toggles, IBM Plex Sans / Plex Mono and a 2px blue focus ring. Colours come from the CSS variables at the top of `public/index.html`, so one place changes the whole UI. Emoji icons were removed from labels and messages.

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

## Deployed and In sidebar switches (Active Routes Switchboard)
- **Deployed**: on means the next Build & Deploy updates and deploys this dashboard. Off keeps the route in Studio only (it moves from `dashboard-extension/config/routes.json` to `routes.held.json`) and the deploy leaves it out. Note: because the cluster's route list is replaced as a whole, a dashboard that is already on the cluster disappears from it at the next deploy while Deployed is off.
- **In sidebar**: on means the dashboard is in the sidebar, off means it is not (the page still opens at its address). The choice is kept while Deployed is off.
- **Delete** removes the route from Studio as well.
Publishing a layout again does not deploy a route that is held.

## Launch button (Active Routes Switchboard)
Each route has a **Launch** button next to Edit and Delete. It opens `<url>/aiops/<tenantId>/page/<route path>` in a new tab, with `url` and `tenantId` read from `dashboard-extension/target.json` (the credentials in that file are never sent to the browser). If either is missing the button is disabled.

## Protect switch (Active Routes Switchboard)

Each route has a Protect switch. It writes the route's panel file name to `deploy.protect` in the lithium folder; `deploy-dashboards.sh` never overwrites those files. Default when the file is missing: `incident-dashboard.panel.ts`. Endpoint: `POST /api/protect {panelFile, protected}`.

## Layout Editor

Tab "Layout Editor": design layouts on the Designer's grid and save them to `dashboards/layouts/`. "Set as default" writes `dashboards/dashboard-builder/default-layout.ts` (shipped by the next deploy). API: `GET/POST /api/layouts`, `GET /api/layouts/<slug>`, `POST /api/layouts/delete`, `POST /api/layouts/default`. The grid maths and validation come from `designer/*.ts` through `public/designer-core.js` (regenerate with `tools/build-core.sh` if you change the Designer source).

## Edit / all panels / publish

See the top-level README: the Switchboard lists every panel in `src/panels/`, each route has Edit, and a saved layout can be published as its own sidebar page (`POST /api/layouts/publish`, `/api/layouts/unpublish`, `/api/panels/route`, `GET /api/tiles`).

## Images

`POST /api/image/convert {name, data}` converts a .tif/.tiff (base64) to PNG with sips, ImageMagick or Pillow. Layouts may carry pictures as data URIs (up to 24 MB per layout).

## Split dashboards into tiles

Active Routes Switchboard, "Split dashboards into tiles" lists every folder in `dashboards/`. **Make splittable** edits the dashboard's component (backup in `.backups/split-<folder>-<time>/`), adds `split-runtime.tsx` and `split.json` next to it, and the Layout Editor's Edit then offers its sections as tiles. **Undo** restores the backup. Deploy afterwards.

Limits: the dashboard's main component must end with `return (<Root> ...blocks... </Root>)`; each direct child of Root becomes a section, named after the `{/* comment */}` above it (Modal/Dialog children stay with the block before). Components built with `React.memo` / `forwardRef`, or that build their layout across several returns, are listed as "Not splittable" with the reason. Early returns (for example a loading screen) are left as they are.
