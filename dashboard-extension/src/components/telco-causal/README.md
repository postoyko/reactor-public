# Telco Causal Mesh and Neural Signal Observatory

## 1. Overview
This dashboard provides a 3D WebGL GPU-accelerated observability cockpit for Telecommunication Network Operations Centers (NOC). It shows four network strata in 3D space, AI probable cause indicators, real-time signal photon animation, D3 trajectory streams, and automated runbook actions.

## 2. Key Capabilities
- **GPU-Accelerated 3D Multi-Layer Force Mesh (WebGL and Three.js)**:
  - Stratified 3D Z-plane architecture:
    - **Layer 1 (Z: +135 to +180)**: 5G Core Network (UPF, AMF, SMF)
    - **Layer 2 (Z: +45 to +60)**: IP Transport and Optical Aggregation
    - **Layer 3 (Z: -45 to -60)**: RAN Edge and Cell Sites (eNodeB and gNodeB)
    - **Layer 4 (Z: -135 to -180)**: Subscribers and Network Slices
  - **Camera View Presets**:
    - `Isometric 3D`: Standard 3D perspective angle.
    - `Strata Profile`: Side elevation angle showing horizontal stratum separation.
    - `Top-Down`: Vertical plan view from 5G Core to RAN Edge.
  - **Strata Z-Spacing Control**: Adjust stratum vertical distance (`60px`, `90px`, `130px`).
  - **Severity & Root Filter**: Filter displayed nodes (`All`, `Sev 6 Critical`, `AI Probable Causes`).
  - **Live Animated Signal Photons**: Particle systems show telemetry propagation along causal trajectories.
  - **Pulsing Neural Halos**: Wireframe rotating toruses highlight root cause network elements.
  - **3D Raycaster HUD**: Hover tooltips and click-to-isolate drilldown.
- **D3 Sankey Trajectory Stream**: Maps signal flow from probe ingestion to domain layer, incident story, and automated policy.
- **Concentric Radial Blast Radius Radar**: 4-zone causal blast radar mapping Root Cause &rarr; 1-Hop Topology Neighbors &rarr; Impacted Network Slices &rarr; Downstream Subscribers with dynamic distance falloff and impact percentage metrics.
- **Remediation Trigger Simulator**: Execute automated runbook policies directly with live state feedback.

## 3. Deployment Files
- Component: [`TelcoCausalMeshDashboard.tsx`](TelcoCausalMeshDashboard.tsx:1)
- Styles: [`telco-causal.scss`](telco-causal.scss:1)
- Panel Wrapper: [`telco-causal.panel.ts`](telco-causal.panel.ts:1)
- Route Path: `/telco-causal-mesh`
- Panel ID: `telco-causal-mesh-dashboard`
