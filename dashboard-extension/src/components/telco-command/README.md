# Telco NOC 360° Operations Command Center Dashboard

## Purpose
Enterprise-grade observability cockpit designed specifically for Telecommunication Network Operations Centers (NOCs). Integrates live telemetry streams across SevOne, Instana, Netcool/OMNIbus, Prometheus, Nokia Netact, and AI Metric-Anomaly-Detection.

## Key Capabilities
- **GPU-Accelerated 3D WebGL Topology Mesh**: Visualizes multi-layer network elements (5G Core, IP Transport, RAN Edge, and Cloud Infrastructure) across stratified Z-planes with real-time severity meshes, pulsing AI probable cause wireframe halos, animated signal photons, and camera view presets (Perspective, Top-Down, Strata Edge).
- **Deep Click-Through Diagnostics**:
  `Network Element (Topology)` &rarr; `Alarm Summary (Live Ingest)` &rarr; `Incident Story` &rarr; `Automated Policy / Runbook Execution`.
- **Multi-Probe Ingest Telemetry Matrix**: Live telemetry breakdown across all integrated monitoring systems.
- **Automated Remediation Console**: Trigger automated diagnostic and self-healing runbooks directly from the console.

## Deployment Files
- Component: `TelcoCommandCenterDashboard.tsx`
- Styles: `telco-command.scss`
- Wrapper: `telco-command.panel.ts`
- Route Path: `/telco-command-center`
- Panel ID: `telco-command-center-dashboard`
