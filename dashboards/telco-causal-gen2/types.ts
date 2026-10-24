/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertItem, IncidentItem, TopologyLinkInput } from './logic';

/*
 * Telco Causal Mesh.
 *
 * A props-driven 3D view of alerts and incidents. Everything drawn comes from the props; where the data
 * needed for a figure is not available the panel says "n/a" instead of inventing a value. See README.md.
 */

// ── Public props ──────────────────────────────────────────────────────────────

export interface RemediationResult {
  ok: boolean;
  message: string;
}

export interface TelcoCausalMeshProps {
  /** Alerts, already converted with `adaptAlerts` (see logic.ts). */
  alerts?: AlertItem[];
  /** Incidents, already converted with `adaptIncidents`. */
  incidents?: IncidentItem[];
  loading?: boolean;
  error?: unknown;
  /** Called by "Refresh Mesh". */
  refetch?: () => void;
  /** True when the alert query includes the `eventCount` column (deduplication statistics need it). */
  hasEventCounts?: boolean;
  /** Real topology adjacencies. Without them SPOF analysis, blast islands and route tracing are unavailable. */
  topologyLinks?: TopologyLinkInput[];
  /** Optional subscriber inventory (resource name -> subscribers) used to size blast islands. */
  subscribersByResource?: Record<string, number>;
  /** When set, the context menu offers a link to the Netcool WebGUI. */
  netcoolWebGuiUrl?: string;
  /** Real remediation hook. Without it the console only runs a clearly labelled simulation. */
  onExecuteRemediation?: (alert: AlertItem) => Promise<RemediationResult>;
  /** Test hook: behave as if WebGL were unavailable. */
  forceNoWebGL?: boolean;
  /**
   * Runs a toolkit query (e.g. `getTopologyResource`) with the tenant already filled in. Without it the drawer
   * says the details are unavailable instead of guessing.
   */
  queryApi?: (queryName: string, options: Record<string, unknown>) => Promise<any>;
  /**
   * Which metrics to chart in the drawer's Golden Signals tab. The metric group and name differ per installation,
   * so they are configured, never guessed. Without them the tab says so.
   */
  metricQueries?: Array<{ group: string; metric: string; label?: string }>;
  /** Which topology view opens first. Without WebGL the 2D view is always used. Default '3d'. */
  initialView?: '2d' | '3d';
  /**
   * Which layer scheme classifies the resources: `telco` (5G core / transport / RAN / subscribers, the default), `osi` (L1 to L7)
   * or `ops` (Business User to Physical Infrastructure). Can be changed afterwards in the Layers menu.
   */
  layerScheme?: 'telco' | 'osi' | 'ops';
  /**
   * Show only one region of the dashboard (see MESH_PARTS). Every component that sets `part` joins one shared session, so
   * the selected node, active incident, filters, replay and drawer stay in sync across tiles. Without `part` the whole
   * dashboard is drawn, exactly as before.
   */
  part?: MeshPart;
}

export type QueryStatus = { state: 'idle' | 'loading' | 'ok' | 'empty' | 'error' | 'unavailable'; message?: string };

export const IDLE: QueryStatus = { state: 'idle' };

export const EMPTY_ALERTS: AlertItem[] = [];

export const EMPTY_INCIDENTS: IncidentItem[] = [];

export const EMPTY_TOPOLOGY: TopologyLinkInput[] = [];

export type ColorMode = 'severity' | 'strata' | 'deviceType' | 'centrality' | 'neural';

export type FilterMode = 'all' | 'critical' | 'probable-cause' | 'spof';

/** The regions of the dashboard that can be shown on their own. */
export const MESH_PARTS = ['header', 'incidents', 'topology', 'insights', 'alarms', 'blast', 'ingest', 'remediation'] as const;
export type MeshPart = (typeof MESH_PARTS)[number];
export const isMeshPart = (v: unknown): v is MeshPart => typeof v === 'string' && (MESH_PARTS as readonly string[]).includes(v);
