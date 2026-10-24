/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * Every data source a widget can read, with the Concert Operate query behind it (contentAnalyticsAPI, see the
 * toolkit's src/helpers/useQuery.ts for the full list) and the one parameter it needs, if any. The parameter is kept in
 * the widget's `filter`, so an action ("Change its source parameter" to {value}) can point a detail widget at what was
 * picked in another one: pick an incident, see its alerts.
 *
 * `shape` says how a response becomes rows: alerts and incidents get the same fields as the main alert and incident
 * sources; anything else is read generically (the largest list of records found, flattened one level), and its fields
 * are learnt from the first response.
 */

import { QueryName } from './types';
import type { PickKind } from './pickers';

export type Shape = 'alerts' | 'stories' | 'apps' | 'metric' | 'people' | 'generic';

export interface SourceParam {
  label: string;
  help: string;
  placeholder?: string;
  /** Without it the query cannot run, and the widget says what to enter. */
  required?: boolean;
  /** Offer values from live data while typing (PickInput). */
  pick?: PickKind;
}

export interface SourceDef {
  id: QueryName;
  label: string;
  /** The contentAnalyticsAPI function. */
  api: string;
  group: 'Live data' | 'Incident details' | 'People and configuration';
  shape: Shape;
  description: string;
  param?: SourceParam;
}

export const SOURCES: SourceDef[] = [
  { id: 'getAlerts', label: 'Alerts', api: 'getAlerts', group: 'Live data', shape: 'alerts', description: 'Open alerts (or any alert filter).' },
  { id: 'getStories', label: 'Incidents', api: 'getStories', group: 'Live data', shape: 'stories', description: 'Incidents and their state, priority and owner.' },
  { id: 'getApplications', label: 'Applications', api: 'getImpactedApplications', group: 'Live data', shape: 'apps', description: 'Business applications with alert counts, incidents and criticality.' },
  { id: 'getMetricSeries', label: 'Metric over time', api: 'getMetricManagerData', group: 'Live data', shape: 'metric', description: 'One metric of one resource, with the expected range and forecast.' },
  {
    id: 'getRawAlerts', label: 'Alerts (raw, any filter)', api: 'getRawAlerts', group: 'Live data', shape: 'alerts',
    description: 'Alerts straight from the store, including cleared ones, for any filter.',
    param: { label: 'Alert filter', help: 'Sent to the server as-is, for example severity >= 5. Required by this query.', placeholder: 'state != \'clear\'', required: true }
  },
  {
    id: 'getStoriesByAlerts', label: 'Incidents of matching alerts', api: 'getStoriesByAlerts', group: 'Live data', shape: 'stories',
    description: 'The incidents that contain alerts matching a filter.',
    param: { label: 'Alert filter', help: 'Incidents whose alerts match this filter, for example severity = 6. Empty means open alerts.', placeholder: 'severity = 6' }
  },
  {
    // getIncidentAlerts itself fails inside Concert Operate (checked 2026-10-24); getAlerts takes the incident as storyId
    id: 'getIncidentAlerts', label: 'Alerts of an incident', api: 'getAlerts', group: 'Incident details', shape: 'alerts',
    description: 'Every alert in one incident, cleared ones included.',
    param: { label: 'Incident id', help: 'Type an id, or let an action set it: "Change its source parameter" to {value} when an incident is picked.', placeholder: 'incident id', required: true, pick: 'incident' }
  },
  {
    id: 'getStoryAlertsGroups', label: 'Alert groups of an incident', api: 'getStoryAlertsGroups', group: 'Incident details', shape: 'alerts',
    description: 'The alerts of one incident with the groups they were correlated into.',
    param: { label: 'Incident id', help: 'Type an id, or let an action set it from a picked incident.', placeholder: 'incident id', required: true, pick: 'incident' }
  },
  {
    id: 'getRelatedStories', label: 'Related incidents', api: 'getRelatedStories', group: 'Incident details', shape: 'stories',
    description: 'Incidents related to one incident, or to a list of alerts.',
    param: { label: 'Incident id or alert ids', help: 'One incident id, or alert ids separated by commas.', placeholder: 'incident id, or alert-1, alert-2', required: true, pick: 'incident' }
  },
  {
    id: 'getTopologyResource', label: 'Topology resource', api: 'getTopologyResource', group: 'Incident details', shape: 'generic',
    description: 'The properties of one topology resource.',
    param: { label: 'Resource id', help: 'The topology resource to read.', placeholder: 'resource id', required: true }
  },
  { id: 'getAlertCount', label: 'Open alert count', api: 'getStandingAlertCount', group: 'Live data', shape: 'generic', description: 'One number, straight from Concert: how many alerts are standing. Fast; use Sum of Quantity.' },
  { id: 'getIncidentCount', label: 'Open incident count', api: 'getStandingStoryCount', group: 'Live data', shape: 'generic', description: 'One number, straight from Concert: how many incidents are standing. Fast; use Sum of Quantity.' },
  { id: 'getPolicies', label: 'Policies', api: 'getPoliciesMetadata', group: 'People and configuration', shape: 'generic', description: 'Every policy (id and name). Large tenants have thousands: allow a few seconds. Picking one gives its id to the policy actions.' },
  { id: 'getPeople', label: 'People and teams', api: 'getUsersAndGroups', group: 'People and configuration', shape: 'people', description: 'Users and user groups of the tenant, one row each.' },
  { id: 'getGroups', label: 'User groups', api: 'getGroups', group: 'People and configuration', shape: 'generic', description: 'The user groups of the tenant and their members.' },
  { id: 'getActions', label: 'Automation actions', api: 'getActions', group: 'People and configuration', shape: 'generic', description: 'The automation actions available in the tenant.' },
  {
    id: 'getTools', label: 'Tools', api: 'getTools', group: 'People and configuration', shape: 'generic', description: 'The tools people can launch from alerts and incidents.',
    param: { label: 'Tool type (optional)', help: 'Only tools of this type. Empty means all.', placeholder: 'any type' }
  },
  {
    // getFiltersViews without a type fails on tenants with inventory filters; getFilters with a type condition is what
    // the toolkit's own Monitor Box uses
    id: 'getFiltersViews', label: 'Saved filters', api: 'getFilters', group: 'People and configuration', shape: 'generic', description: 'The filters people have saved, of one type.',
    param: { label: 'Filter type', help: 'alert (the default) or incident filters.', placeholder: 'alert', pick: 'filterType' }
  }
];

const BY_ID = new Map(SOURCES.map(s => [s.id, s]));

export function sourceDef(q: QueryName): SourceDef {
  return BY_ID.get(q) || SOURCES[0];
}

export function isQuery(v: unknown): v is QueryName {
  return typeof v === 'string' && BY_ID.has(v as QueryName);
}

export const shapeOf = (q: QueryName): Shape => sourceDef(q).shape;

/** Sources whose rows are alerts (they can feed "create an incident from these alerts"). */
export const isAlertSource = (q: QueryName): boolean => shapeOf(q) === 'alerts';

/** The target of actions that call Concert Operate itself (create an incident, change policies) rather than a widget. */
export const PLATFORM_ID = '__platform';
