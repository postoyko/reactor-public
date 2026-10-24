/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runbooks as the dashboard sees them: what each one is (getRunbook), when it last ran on which alert
 * (getRunbooksAndPolicy), and whether this environment has a run API we know how to call safely.
 */

const api = (): any => (window as any).akoraConfig?.baseState?.API?.contentAnalyticsAPI;

export interface RunbookInfo { id: string; name: string; description: string; automated: boolean; success?: number; failure?: number; total?: number }
export interface RunInfo { id: string; runbookId: string; status: string; at: string; alertId?: string }

const detailCache = new Map<string, Promise<RunbookInfo>>();
export function runbookDetail(tenantId: string, id: string): Promise<RunbookInfo> {
  const hit = detailCache.get(id);
  if (hit) return hit;
  const fn = api()?.getRunbook;
  const p: Promise<RunbookInfo> = typeof fn !== 'function' ? Promise.resolve({ id, name: id, description: '', automated: false }) :
    Promise.resolve().then(() => fn({ tenantId, runbookId: id })).then((r: any) => {
      const b = r && r.tenant && r.tenant.runbook;
      const runs = b && b.stats && b.stats.runs;
      const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
      return { id, name: String((b && b.name) || id), description: String((b && b.description) || ''), automated: Boolean(b && b.canBeAutomated), success: n(runs && runs.success), failure: n(runs && runs.failure), total: n(runs && runs.total) };
    }, (): RunbookInfo => ({ id, name: id, description: '', automated: false }));
  detailCache.set(id, p);
  return p;
}

let runsCache: { at: number; p: Promise<RunInfo[]> } | null = null;
/** Recent runbook runs across the tenant, with the alert each belongs to (read from the run's context). */
export function loadRuns(tenantId: string): Promise<RunInfo[]> {
  if (runsCache && Date.now() - runsCache.at < 30000) return runsCache.p;
  const fn = api()?.getRunbooksAndPolicy;
  const p: Promise<RunInfo[]> = typeof fn !== 'function' ? Promise.resolve([]) :
    Promise.resolve().then(() => fn({ tenantId, policyId: '', policyIds: '', context: '', includePolicy: false, includePolicies: false, includeRunbooks: true })).then((r: any) => {
      const list: any[] = (r && r.tenant && r.tenant.runbookInstances) || [];
      return list.filter(x => x && x.id).map(x => {
        const m = /alert:([^,]+)/.exec(String(x.context || ''));
        return { id: String(x.id), runbookId: String(x.runbookId || ''), status: String(x.status || ''), at: String(x.lastUpdated || ''), alertId: m ? m[1] : undefined };
      });
    }, (): RunInfo[] => []);
  runsCache = { at: Date.now(), p };
  return p;
}
export const forgetRuns = () => { runsCache = null; };

export interface RunAdapter { name: string; sample: boolean; run: (tenantId: string, runbookId: string, alertId: string) => Promise<unknown> }
/**
 * A run API we know the exact call for. Starting a runbook changes the cluster, so a call is only wired once its real
 * signature has been confirmed; nothing is guessed. The Studio sample provides one so the flow can be tried.
 */
export function runAdapter(): RunAdapter | null {
  const a = api();
  if (a && typeof a.runRunbook === 'function' && a.__sample) return { name: 'runRunbook', sample: true, run: (tenantId, runbookId, alertId) => a.runRunbook({ tenantId, runbookId, alertId }) };
  return null;
}
/** Names on the API object that look like they run runbooks, to tell the person what was found. */
export function runApiCandidates(): string[] {
  const a = api();
  return a ? Object.keys(a).filter(k => /runbook/i.test(k) && /^(run|start|execute|trigger|create|launch)/i.test(k)) : [];
}
