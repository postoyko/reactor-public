/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resource detail adapters for the Deep Dive drawer: topology service resource, metric manager series and runbook / policy
 * names, from the same toolkit queries the Telco Causal Mesh uses (getTopologyResource, getMetricManagerData,
 * getRunbooksAndPolicy). Copied here so Blast Radius does not depend on another dashboard being installed. Pure functions.
 */

export type QueryState = 'idle' | 'loading' | 'ok' | 'empty' | 'error' | 'unavailable';
export interface QueryStatus { state: QueryState; message?: string }
export const IDLE: QueryStatus = { state: 'idle' };

export interface MetricDataPoint {
  timestamp: number;
  value: number;
}


export interface MetricSeries {
  metricName: string;
  unit?: string;
  points: MetricDataPoint[];
  currentValue?: number;
  min?: number;
  max?: number;
  avg?: number;
}


export interface RunbookPolicyInfo {
  policyId?: string;
  policyName?: string;
  runbookId?: string;
  runbookName?: string;
  description?: string;
  isAutomated?: boolean;
  parameters?: Record<string, any>;
}


export interface TopologyResourceDetails {
  id?: string;
  uniqueId?: string;
  name?: string;
  entityTypes: string[];
  matchTokens: string[];
  tags: string[];
  properties: Record<string, any>;
}

/** Converts `data.tenant.resource` or `data.resource` from the toolkit's getTopologyResource query. */
export function adaptTopologyResource(data: any): TopologyResourceDetails | null {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.errors) && data.errors.length > 0) return null;
  // Only the documented envelope is accepted; an arbitrary object (an error, say) must not pass for a resource.
  const res = data?.tenant?.resource || data?.resource;
  if (!res || typeof res !== 'object' || (!res.id && !res.name && !res.uniqueId)) return null;

  const entityTypes: string[] = Array.isArray(res.entityTypes)
    ? res.entityTypes.map((t: unknown) => String(t))
    : [];
  const matchTokens: string[] = Array.isArray(res.matchTokens)
    ? res.matchTokens.map((t: unknown) => String(t))
    : [];
  const tags: string[] = Array.isArray(res.tags)
    ? res.tags.map((t: unknown) => String(t))
    : [];
  const properties = (res.properties && typeof res.properties === 'object') ? res.properties : {};

  return {
    id: res.id ? String(res.id) : undefined,
    uniqueId: res.uniqueId ? String(res.uniqueId) : undefined,
    name: res.name ? String(res.name) : undefined,
    entityTypes,
    matchTokens,
    tags,
    properties
  };
}

/** Converts `data.tenant.metricData` from getMetricManagerData query into structured MetricSeries. */
export function adaptMetricManagerData(data: any): MetricSeries[] {
  if (!data || typeof data !== 'object') return [];
  const rawSeries = data?.tenant?.metricData || data?.metricData || data?.series || (Array.isArray(data) ? data : []);
  if (!Array.isArray(rawSeries)) return [];

  const out: MetricSeries[] = [];
  rawSeries.forEach((s: any) => {
    if (!s || typeof s !== 'object') return;
    const name = String(s.metric || s.metricName || s.name || 'Metric');
    const unit = s.unit ? String(s.unit) : undefined;
    const rawPoints = Array.isArray(s.points) ? s.points : Array.isArray(s.data) ? s.data : [];
    const points: MetricDataPoint[] = [];

    rawPoints.forEach((p: any) => {
      if (!p || typeof p !== 'object') return;
      const t = Number(p.timestamp ?? p.time ?? p.t);
      const v = Number(p.value ?? p.val ?? p.v);
      if (Number.isFinite(t) && Number.isFinite(v)) {
        points.push({ timestamp: t, value: v });
      }
    });

    if (points.length > 0) {
      const values = points.map(p => p.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      const currentValue = points[points.length - 1].value;
      out.push({
        metricName: name,
        unit,
        points,
        currentValue,
        min,
        max,
        avg: Math.round(avg * 100) / 100
      });
    }
  });
  return out;
}

/** Converts `data.tenant.policies` and `data.tenant.runbooks` from getRunbooksAndPolicy query. */
export function adaptRunbooksAndPolicy(data: any): RunbookPolicyInfo[] {
  if (!data || typeof data !== 'object') return [];
  const tenant = data?.tenant || data;
  const policies = Array.isArray(tenant?.policies) ? tenant.policies : [];
  const runbooks = Array.isArray(tenant?.runbooks) ? tenant.runbooks : [];

  const runbookMap = new Map<string, any>();
  runbooks.forEach((rb: any) => {
    if (rb?.id) runbookMap.set(String(rb.id), rb);
  });

  const out: RunbookPolicyInfo[] = [];
  policies.forEach((pol: any) => {
    if (!pol || typeof pol !== 'object') return;
    const policyId = pol.id ? String(pol.id) : undefined;
    const policyName = pol.name ? String(pol.name) : undefined;
    const description = pol.description ? String(pol.description) : undefined;

    const rbIds: string[] = Array.isArray(pol.runbookIds) ? pol.runbookIds : [];
    if (rbIds.length > 0) {
      rbIds.forEach(rbId => {
        const rb = runbookMap.get(String(rbId));
        out.push({
          policyId,
          policyName,
          runbookId: String(rbId),
          runbookName: rb?.name ? String(rb.name) : undefined,
          description: rb?.description || description,
          isAutomated: Boolean(pol.isAutomated || rb?.isAutomated),
          parameters: rb?.parameters || pol.parameters
        });
      });
    } else {
      out.push({
        policyId,
        policyName,
        description,
        isAutomated: Boolean(pol.isAutomated),
        parameters: pol.parameters
      });
    }
  });

  if (out.length === 0 && runbooks.length > 0) {
    runbooks.forEach((rb: any) => {
      if (rb?.id) {
        out.push({
          runbookId: String(rb.id),
          runbookName: rb.name ? String(rb.name) : undefined,
          description: rb.description ? String(rb.description) : undefined,
          isAutomated: Boolean(rb.isAutomated),
          parameters: rb.parameters
        });
      }
    });
  }

  return out;
}

