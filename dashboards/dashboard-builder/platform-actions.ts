/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Actions that change something in Concert Operate itself, through the same contentAnalyticsAPI the toolkit reads
 * from: create an incident, add alerts to one, and change policies. Plain data, no React: the Action flows editor
 * offers them and the dashboard runs them, always after the person using it has confirmed.
 *
 * They are found in two places:
 * - on a widget that shows alerts: the alerts it shows (after its filters) are the alerts the call uses;
 * - on the "Concert Operate" target: ids come from the action's own fields, usually {value} (what the event carried).
 *
 * An action with several fields keeps them in its `arg` as JSON ({"priority":"2","description":"…"}).
 */

import type { Kind } from './carbon-specs';
import type { PickKind } from './pickers';

export interface ArgPart { key: string; kind: Kind; label: string; options?: string[]; def?: string; /** Offer values from live data while typing. */ pick?: PickKind }

export interface PlatformAction {
  id: string;
  label: string;
  /** Uses the alerts shown by the target widget instead of an "alert ids" field. */
  fromRows?: boolean;
  /** Why this action cannot work on current Concert Operate: it is no longer offered, and runs only say so. */
  unsupported?: string;
  parts: ArgPart[];
  /** The API function and its parameters, from the filled-in fields (and the widget's alert ids). */
  call: (v: Record<string, string>, alertIds: string[]) => { name: string; params: Record<string, unknown>; summary: string };
}

const ids = (s: string | undefined): string[] => String(s || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean).slice(0, 1000);
/** Policy references are split on commas, semicolons and new lines only: policy names contain spaces. */
const refs = (s: string | undefined): string[] => String(s || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 1000);
const prio = (s: string | undefined) => Math.min(Math.max(Math.round(Number(s) || 3), 1), 5);

const ALERT_IDS: ArgPart = { key: 'alertIds', kind: 'text', label: 'Alert ids (separated by commas)', def: '{value}' };
const PRIORITY: ArgPart = { key: 'priority', kind: 'enum', label: 'Priority', options: ['1', '2', '3', '4', '5'], def: '3' };
const DESCRIPTION: ArgPart = { key: 'description', kind: 'text', label: 'Description', def: 'Created from the dashboard' };
const INCIDENT: ArgPart = { key: 'correlationKey', kind: 'text', label: 'Incident (its correlation key)', def: '{value}' };
const POLICY_IDS: ArgPart = { key: 'policyIds', kind: 'text', label: 'Policies: names or ids, separated by commas', def: '{value}', pick: 'policy' };
const POLICY_ID: ArgPart = { key: 'policyId', kind: 'text', label: 'Policy: name or id', def: '{value}', pick: 'policy' };
const COMMENT: ArgPart = { key: 'commentText', kind: 'text', label: 'Comment (optional)', def: '' };

const n = (list: string[], what: string) => `${list.length} ${what}${list.length === 1 ? '' : 's'}`;

/** On a widget that shows alerts. */
export const ROW_ACTIONS: PlatformAction[] = [
  {
    id: 'api:incidentFromRows', label: 'Create an incident from the alerts it shows', fromRows: true, parts: [PRIORITY, DESCRIPTION],
    call: (v, a) => ({ name: 'createIncidentMutation', params: { alertIds: a, priority: prio(v.priority), description: v.description || '' }, summary: `Create a P${prio(v.priority)} incident from ${n(a, 'alert')}` })
  },
  {
    id: 'api:rowsToIncident', label: 'Add the alerts it shows to an incident', fromRows: true, parts: [INCIDENT],
    call: (v, a) => ({ name: 'updateIncidentMutation', params: { alertIds: a, correlationKey: v.correlationKey || '' }, summary: `Add ${n(a, 'alert')} to incident ${v.correlationKey || '(none)'}` })
  }
];

/** On the "Concert Operate" target. */
export const PLATFORM_ACTIONS: PlatformAction[] = [
  {
    id: 'api:createIncident', label: 'Create an incident', parts: [ALERT_IDS, PRIORITY, DESCRIPTION],
    call: v => { const a = ids(v.alertIds); return { name: 'createIncidentMutation', params: { alertIds: a, priority: prio(v.priority), description: v.description || '' }, summary: `Create a P${prio(v.priority)} incident from ${n(a, 'alert')}` }; }
  },
  {
    id: 'api:addToIncident', label: 'Add alerts to an incident', parts: [ALERT_IDS, INCIDENT],
    call: v => { const a = ids(v.alertIds); return { name: 'updateIncidentMutation', params: { alertIds: a, correlationKey: v.correlationKey || '' }, summary: `Add ${n(a, 'alert')} to incident ${v.correlationKey || '(none)'}` }; }
  },
  {
    id: 'api:activatePolicy', label: 'Activate policies', parts: [POLICY_IDS],
    call: v => { const p = refs(v.policyIds); return { name: 'activatePolicy', params: { policyIds: p }, summary: `Activate ${n(p, 'policy')}`.replace('policys', 'policies') }; }
  },
  {
    // Concert's own setPolicyLock sends `locked`, which Mutation.setPolicyStatus does not accept (API check, 2026-10-24)
    id: 'api:lockPolicy', label: 'Lock policies', parts: [POLICY_IDS], unsupported: 'Concert Operate refuses policy locking from its API (setPolicyLock sends an argument the server does not know).',
    call: v => { const p = refs(v.policyIds); return { name: 'setPolicyLock', params: { policyIds: p, locked: true }, summary: `Lock ${n(p, 'policy')}`.replace('policys', 'policies') }; }
  },
  {
    id: 'api:unlockPolicy', label: 'Unlock policies', parts: [POLICY_IDS], unsupported: 'Concert Operate refuses policy unlocking from its API (setPolicyLock sends an argument the server does not know).',
    call: v => { const p = refs(v.policyIds); return { name: 'setPolicyLock', params: { policyIds: p, locked: false }, summary: `Unlock ${n(p, 'policy')}`.replace('policys', 'policies') }; }
  },
  {
    id: 'api:deployPolicy', label: 'Deploy a policy', parts: [POLICY_ID],
    call: v => ({ name: 'setPolicyDeployed', params: { policyId: (v.policyId || '').trim(), deployed: true }, summary: `Deploy policy ${v.policyId || '(none)'}` })
  },
  {
    id: 'api:undeployPolicy', label: 'Stop deploying a policy', parts: [POLICY_ID],
    call: v => ({ name: 'setPolicyDeployed', params: { policyId: (v.policyId || '').trim(), deployed: false }, summary: `Stop deploying policy ${v.policyId || '(none)'}` })
  },
  {
    id: 'api:rejectPolicy', label: 'Reject policies', parts: [POLICY_IDS, COMMENT],
    call: v => { const p = refs(v.policyIds); return { name: 'rejectPolicy', params: { policyIds: p, ...(v.commentText ? { commentText: v.commentText } : {}) }, summary: `Reject ${n(p, 'policy')}`.replace('policys', 'policies') }; }
  },
  {
    id: 'api:restorePolicy', label: 'Restore policies', parts: [POLICY_IDS, COMMENT],
    call: v => { const p = refs(v.policyIds); return { name: 'restorePolicy', params: { policyIds: p, ...(v.commentText ? { commentText: v.commentText } : {}) }, summary: `Restore ${n(p, 'policy')}`.replace('policys', 'policies') }; }
  },
  {
    id: 'api:renamePolicy', label: 'Rename a policy', parts: [POLICY_ID, { key: 'name', kind: 'text', label: 'New name', def: '' }],
    call: v => ({ name: 'renamePolicy', params: { policyId: (v.policyId || '').trim(), name: v.name || '' }, summary: `Rename policy ${v.policyId || '(none)'} to “${v.name || ''}”` })
  }
];

const ALL = new Map([...ROW_ACTIONS, ...PLATFORM_ACTIONS].map(a => [a.id, a]));
/** The actions the Designer offers: the ones current Concert Operate accepts. */
export const OFFERED_PLATFORM_ACTIONS = PLATFORM_ACTIONS.filter(a => !a.unsupported);
export const platformAction = (id: string): PlatformAction | undefined => ALL.get(id);

/** The fields of an action, from its stored arg (JSON) with the defaults filled in. */
export function partValues(parts: ArgPart[], arg: string | undefined): Record<string, string> {
  let stored: Record<string, unknown> = {};
  try { const o = arg ? JSON.parse(arg) : {}; if (o && typeof o === 'object' && !Array.isArray(o)) stored = o; } catch (e) { /* not JSON: defaults */ }
  const out: Record<string, string> = {};
  parts.forEach(p => { const v = stored[p.key]; out[p.key] = typeof v === 'string' ? v : v === undefined ? p.def || '' : String(v); });
  return out;
}

export const encodeParts = (v: Record<string, string>): string => JSON.stringify(v);
export const defaultParts = (parts: ArgPart[]): string => encodeParts(partValues(parts, undefined));

/** The fields of an action that name policies (by name or id). */
export const POLICY_PARTS = ['policyIds', 'policyId'];

/** A policy id looks like a UUID; anything else is taken as a name. */
const looksLikeId = (x: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

/** Does this text name a policy by name rather than by id? */
export const hasPolicyNames = (text: string | undefined): boolean => refs(text).some(x => !looksLikeId(x));

/**
 * Turns policy names into ids using the Policies source's rows ({ id, name }). Ids stay as they are; a name matches
 * exactly first, then ignoring case. Names that match no policy are returned in `unknown` and left out.
 */
export function resolvePolicies(text: string, policies: Array<{ id?: unknown; name?: unknown }>): { text: string; unknown: string[] } {
  const exact = new Map<string, string>();
  const loose = new Map<string, string>();
  policies.forEach(p => {
    if (typeof p.name !== 'string' || p.id === undefined) return;
    if (!exact.has(p.name)) exact.set(p.name, String(p.id));
    const k = p.name.toLowerCase();
    if (!loose.has(k)) loose.set(k, String(p.id));
  });
  const unknown: string[] = [];
  const out = refs(text).map(x => {
    if (looksLikeId(x)) return x;
    const id = exact.get(x) || loose.get(x.toLowerCase());
    if (!id) unknown.push(x);
    return id;
  }).filter((x): x is string => Boolean(x));
  return { text: out.join(', '), unknown };
}
