# Incident & Alert Executive Dashboard for IBM Concert Operate

A live, widescreen executive dashboard for IBM Concert Operate built with React, TypeScript, and the Carbon Design System using the [`aiops-ui-extension-toolkit`](https://github.com/IBM/aiops-ui-extension-toolkit).

---

## Features

- **6 Executive KPI Summary Cards**:
  - Open Incidents count with P1/P2 breakdown
  - Critical Alerts (Sev 6) with real-time delta vs 1h ago
  - Major Alerts (Sev 5) with total volume
  - Runbook Automation stats (active & automated runbooks linked across alerts)
  - Highest Impact Lead (top active P1/P2 incident)
  - Business Health Status (nominal, degraded, critical)
- **Business & Application Services Health Grid**:
  - 6 service domain tiles: Core Telecom & RAN, Cloud & Microservices, Data Pipeline & Kafka, Enterprise CRM & Billing, Storage & Infrastructure, Network Operations Center
  - Real-time status indicators (Critical, Degraded, Nominal) based on live alert/incident correlation
  - Click-to-filter capability: select any service to filter both active incidents and the alert stream
- **4 Real-Time Analytics Cards**:
  - Incidents by Priority (P1-P5 visual donut chart with legend)
  - Sev 6 Critical Alert Categories (top root-cause keyword buckets)
  - Sev 5 Major Alert Categories (top major symptom buckets)
  - Alert Ingestion Sources (breakdown by source/manager: SevOne, Netcool, Dynatrace, Kafka, etc.)
- **Active Incidents Table**:
  - Live incident feed with search and priority/service filtering
  - Clickable deep-links: launches directly to the Concert Operate Resolution Hub incident overview (`/aiops/${TENANT_ID}/resolution-hub/incidents/all/${id}/overview`) in a new tab
  - Associated runbook counts aggregated across all member alerts
  - Service domain badges and formatted timestamps
- **Operational Intelligence Sidebar**:
  - Top Affected Resources (hosts/nodes with highest alert concentration)
  - Actionable Observations feed dynamically derived from live data
  - Live Sev 6 Critical Alert Stream feed
- **Full-Width Recent Alerts Stream**:
  - High-capacity live alert stream (~1,000 alerts fetched in single query)
  - Configurable time window dropdown: **Last 60 min (Default)**, **Last 15 min**, **Last 30 min**, **Last 4 hours**, **Last 24 hours**, **All Open Alerts**
  - Severity filter pills (All, Sev 6 Critical, Sev 5 Major, Sev 4 Minor, Sev 3 Warning)
  - Real-time text search across summary, resource name, sender, and classification

---

## Files in this Directory

```
dashboards/incident-alert-dashboard/
├── IncidentDashboard.tsx          ← React dashboard component (TypeScript)
├── incident-dashboard.scss        ← Component styling (Carbon tokens + CSS grid)
├── incident-dashboard.panel.ts    ← Panel wrapper for extension loader
└── README.md                      ← This deployment and setup guide
```

---

## Deployment Steps

### Step 0: Required Target Information (Bob: Ask user if not already provided)
Before starting, verify or ask the user for these 5 environment parameters:
1. **OpenShift Cluster API URL & Login Credentials** (`https://api.<cluster-hostname>:6443`, `kubeadmin` or user with admin/edit rights in `aiops` namespace)
2. **Concert Operate CPD Base URL** (`https://cpd-<cluster-hostname>`)
3. **Concert Operate Username** (e.g. `cpadmin`)
4. **Concert Operate API Key** (created in Concert UI at `<cpd-url>/zen/#/settings/profile/list`)
5. **Concert Operate Tenant ID** (UUID visible in page URLs after `/aiops/`)

---

### Step 1: Prerequisites & Toolkit Setup
Clone the official IBM Concert Operate UI Extension Toolkit (Node.js v18 recommended):
```bash
git clone https://github.com/IBM/aiops-ui-extension-toolkit dashboard-extension
cd dashboard-extension

# If package-lock.json causes install conflicts, remove it and install clean
rm -f package-lock.json
npm install
```

Create `target.json` in the `dashboard-extension` root directory using the parameters from Step 0:
```json
{
  "url": "https://cpd-<cluster-hostname>",
  "username": "<your-cpd-username>",
  "apiKey": "<your-api-key>",
  "tenantId": "<your-tenant-id>",
  "bundleName": "alerts-examples"
}
```

### Step 2: Copy Dashboard Files into Toolkit
Copy the dashboard files into your `dashboard-extension` clone:
- Copy `IncidentDashboard.tsx` and `incident-dashboard.scss` to `src/components/incident-dashboard/`
- Copy `incident-dashboard.panel.ts` to `src/panels/`

```bash
mkdir -p src/components/incident-dashboard src/panels
cp /path/to/IncidentDashboard.tsx src/components/incident-dashboard/
cp /path/to/incident-dashboard.scss src/components/incident-dashboard/
cp /path/to/incident-dashboard.panel.ts src/panels/
```

### Step 3: Register the Panel in `src/index.js`
Add the panel export and registration in `src/index.js`:
```js
export const IncidentDashboardPanel = {
  renderer: ReactRenderer,
  state: { component: () => import('./panels/incident-dashboard.panel') }
};
window.registerCustomPanel('incident-dashboard', IncidentDashboardPanel);
```

### Step 4: Configure the Route in `config/routes.json`
Update `config/routes.json` to register the navigation menu category and the route definition:
```json
{
  "spec": {
    "menuRoutes": [
      {
        "categoryTitle": "Operations dashboards",
        "routes": [
          "/incident-alert-dashboard"
        ],
        "type": "category"
      }
    ],
    "routes": [
      {
        "path": "/incident-alert-dashboard",
        "bundlePath": "bundles/alerts-examples/files/alerts-examples-bundle.js",
        "panelId": "incident-dashboard",
        "title": "Incident & Alert Dashboard"
      }
    ],
    "frameSrcUrls": ""
  }
}
```

### Step 5: Webpack Configuration (`webpack.config.js`)
To securely inject credentials from `target.json` at build time and ensure lazy-loaded chunks don't get cached stale:

1. At the top of `webpack.config.js`, add:
   ```js
   const webpack = require('webpack');
   ```

2. In the `output` block, add `chunkFilename`:
   ```js
   output: {
     filename: `${targetDataJSON.bundleName}-bundle.js`,
     chunkFilename: `[id].[contenthash:8].${targetDataJSON.bundleName}-bundle.js`,
     path: path.resolve(__dirname, 'dist'),
   },
   ```

3. Inside the returned configuration object (e.g. after `resolve`), add the `plugins` array:
   ```js
   plugins: [
     new webpack.DefinePlugin({
       'process.env.DASHBOARD_API_KEY': JSON.stringify(
         `ZenApiKey ${Buffer.from(targetDataJSON.username + ':' + targetDataJSON.apiKey).toString('base64')}`
       ),
       'process.env.DASHBOARD_TENANT_ID': JSON.stringify(targetDataJSON.tenantId),
     }),
   ],
   ```

### Step 6: Build and Deploy to OpenShift
Log in to the OpenShift cluster, enable the extension subsystem (one-time), and deploy:
```bash
# 1. Log in to OpenShift CLI
oc login https://api.<cluster-hostname>:6443 -u <username> -p <password>

# 2. Enable custom dashboard feature on the cluster (one-time per cluster)
npm run enable -- -n aiops

# 3. Build and deploy bundle to MinIO and patch AIOpsUIExtension CR
npm run deploy -- -n aiops
```

Wait ~1 minute after deployment, then refresh your Concert Operate browser session. Navigate to your custom dashboard via the side navigation menu or directly at:
```
https://cpd-<cluster-hostname>/aiops/<tenant-id>/page/incident-alert-dashboard
```

---

## Showing one section (`part`)

`IncidentDashboard` accepts an optional `part` prop. Without it the whole dashboard renders exactly as before. With it, only that section renders:
`header`, `kpis`, `services`, `priority`, `critical`, `major`, `sources`, `incidents`, `intel`, `stream`.

All copies on a page share one fetch, one refresh timer and one service filter. Scaffold Studio's Layout Editor uses this to split the dashboard into section tiles (Designer v1.4.0 passes `config.props` to the tile).
