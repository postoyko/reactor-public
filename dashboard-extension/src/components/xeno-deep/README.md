# Cognitive Signal Deep Dive Dashboard

This document provides instructions to deploy the Cognitive Signal Deep Dive Dashboard.
The dashboard provides interactive drill-down views driven by user selection on cognitive observation cards.

## Interactive Lenses
- **Assignment Delay Lens (⚠️)**: Expands unassigned incident distributions, team allocation states, and priority filter controls.
- **High Severity Surge Lens (🚨)**: Displays active critical and major alerts, keyword fault categories, and signature patterns.
- **Topological Epicenter Lens (🎯)**: Highlights top noise-generating resources, raw event storm volumes, deduplication ratios, and radial topology graphs.

## Repository Files
```
src/components/xeno-deep/
  CognitiveDeepDiveDashboard.tsx   ← React component (copy to your toolkit repository)
  cognitive-deep-dive.scss         ← Stylesheet (copy to your toolkit repository)

src/panels/
  cognitive-deep-dive.panel.ts     ← Panel wrapper (copy to your toolkit repository)
```

## Deployment Procedure

1. Copy the source files into your toolkit repository clone:
   - Copy `CognitiveDeepDiveDashboard.tsx` and `cognitive-deep-dive.scss` to `src/components/xeno-deep/`.
   - Copy `cognitive-deep-dive.panel.ts` to `src/panels/`.

2. Register the custom panel in `src/index.js`. Add these statements:
   ```js
   export const CognitiveDeepDivePanel = {
     renderer: ReactRenderer,
     state: { component: () => import('./panels/cognitive-deep-dive.panel') }
   };
   window.registerCustomPanel('cognitive-deep-dive-dashboard', CognitiveDeepDivePanel);
   ```

3. Add the route to `config/routes.json`:
   ```json
   {
     "path": "/cognitive-deep-dive",
     "bundlePath": "bundles/cognitive-deep-dive/files/cognitive-deep-dive-bundle.js",
     "panelId": "cognitive-deep-dive-dashboard",
     "title": "Cognitive Deep Dive"
   }
   ```
   Add `"/cognitive-deep-dive"` to the `menuRoutes` list in `config/routes.json`.

4. Configure `target.json` with your cluster parameters:
   ```json
   {
     "url": "https://cpd-aiops.apps.aiops-4.cp.fyre.ibm.com",
     "username": "cpadmin",
     "apiKey": "tYq5dGzXb3Sy4Yyug9VeMT0dqaAbMACfuWXvdXcS",
     "tenantId": "cfd95b7e-3bc7-4006-a4a8-a73a79c71255",
     "bundleName": "cognitive-deep-dive"
   }
   ```

5. Build and deploy the bundle to the cluster:
   ```bash
   npm run deploy -- -n aiops
   ```

6. Refresh your browser window after one minute to view the new dashboard.

## Showing one section (`part`)

`CognitiveDeepDiveDashboard` accepts an optional `part` prop: `header` (title, refresh rate, About), `lenses` (the three lens cards) or `workspace` (the drill-down for the selected lens). Without it the whole dashboard renders as before. All copies on a page share one fetch, one refresh timer, one selected lens and one priority filter. Concert Workbench's Layout Editor uses this to split the dashboard into tiles.
